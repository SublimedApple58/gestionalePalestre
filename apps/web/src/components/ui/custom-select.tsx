"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type SelectOption = {
  value: string;
  label: string;
  details?: string;
};

type CustomSelectProps = {
  name: string;
  label: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  searchable?: boolean;
  required?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
};

const DROPDOWN_OFFSET = 6;

export function CustomSelect({
  name,
  label,
  options,
  defaultValue,
  placeholder = "Seleziona",
  searchable = false,
  required = false,
  compact = false,
  hideLabel = false
}: CustomSelectProps) {
  const initialOption = options.find((option) => option.value === defaultValue) ?? options[0] ?? null;

  const [selected, setSelected] = useState<SelectOption | null>(initialOption);
  const [query, setQuery] = useState(initialOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  const labelId = useId();
  const controlRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const canUsePortal = typeof document !== "undefined";

  const filteredOptions = useMemo(() => {
    if (!searchable) {
      return options;
    }

    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = `${option.label} ${option.details ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [options, query, searchable]);

  function chooseOption(option: SelectOption) {
    setSelected(option);
    setQuery(option.label);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition() {
      const controlRect = controlRef.current?.getBoundingClientRect();
      if (!controlRect) {
        return;
      }

      setDropdownPosition({
        top: Math.round(controlRect.bottom + DROPDOWN_OFFSET),
        left: Math.round(controlRect.left),
        width: Math.round(controlRect.width)
      });
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (controlRef.current?.contains(target)) {
        return;
      }

      if (dropdownRef.current?.contains(target)) {
        return;
      }

      setQuery(selected?.label ?? "");
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, selected]);

  const dropdown = (
    <div
      ref={dropdownRef}
      className={`custom-select-dropdown ${canUsePortal ? "portal" : ""}`}
      role="listbox"
      style={
        canUsePortal && dropdownPosition
          ? {
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width
            }
          : undefined
      }
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.slice(0, 12).map((option) => (
          <button
            key={option.value}
            type="button"
            className={`custom-select-option ${selected?.value === option.value ? "selected" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              chooseOption(option);
            }}
          >
            <span>{option.label}</span>
            {option.details ? <small>{option.details}</small> : null}
          </button>
        ))
      ) : (
        <p className="custom-select-empty">Nessun risultato</p>
      )}
    </div>
  );

  return (
    <div className={`input-group custom-select-field ${compact ? "compact" : ""}`}>
      <span id={labelId} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </span>

      <div className="custom-select-control" ref={controlRef}>
        {searchable ? (
          <input
            type="text"
            value={query}
            className="custom-select-input"
            placeholder={placeholder}
            aria-labelledby={hideLabel ? undefined : labelId}
            aria-label={hideLabel ? label : undefined}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                setQuery(selected?.label ?? "");
                setOpen(false);
              }, 120);
            }}
          />
        ) : (
          <button
            type="button"
            className="custom-select-button"
            aria-labelledby={hideLabel ? undefined : labelId}
            aria-label={hideLabel ? label : undefined}
            onClick={() => setOpen((current) => !current)}
          >
            {selected?.label ?? placeholder}
          </button>
        )}

        <span className="custom-select-arrow" aria-hidden="true">
          ▾
        </span>
      </div>

      <input type="hidden" name={name} value={selected?.value ?? ""} required={required} />

      {open ? (
        canUsePortal && dropdownPosition ? createPortal(dropdown, document.body) : dropdown
      ) : null}
    </div>
  );
}
