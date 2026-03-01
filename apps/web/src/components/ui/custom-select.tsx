"use client";

import { useMemo, useState } from "react";

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

  return (
    <label className={`input-group custom-select-field ${compact ? "compact" : ""}`}>
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>

      <div className="custom-select-control">
        {searchable ? (
          <input
            type="text"
            value={query}
            className="custom-select-input"
            placeholder={placeholder}
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
        <div className="custom-select-dropdown" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.slice(0, 12).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`custom-select-option ${selected?.value === option.value ? "selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {option.details ? <small>{option.details}</small> : null}
              </button>
            ))
          ) : (
            <p className="custom-select-empty">Nessun risultato</p>
          )}
        </div>
      ) : null}
    </label>
  );
}
