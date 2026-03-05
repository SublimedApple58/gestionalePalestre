"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type CustomCalendarProps = {
  name?: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  hideLabel?: boolean;
  compact?: boolean;
};

const DAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];
const MONTH_LABELS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre"
];

function formatYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function parseYmd(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed;
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function CustomCalendar({
  name,
  label,
  defaultValue,
  value,
  onChange,
  required = false,
  min,
  max,
  hideLabel = false,
  compact = false
}: CustomCalendarProps) {
  const controlled = typeof value === "string";
  const [internalValue, setInternalValue] = useState<string>(defaultValue ?? formatYmd(new Date()));

  const activeValue = controlled ? value : internalValue;
  const selectedDate = parseYmd(activeValue);
  const minDate = parseYmd(min);
  const maxDate = parseYmd(max);

  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(
    new Date(
      (selectedDate ?? new Date()).getFullYear(),
      (selectedDate ?? new Date()).getMonth(),
      1
    )
  );

  const containerRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [activeValue]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (containerRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    const offset = (firstOfMonth.getDay() + 6) % 7;
    const totalDays = lastOfMonth.getDate();

    const cells: Array<Date | null> = [];

    for (let index = 0; index < offset; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, month, day));
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [viewDate]);

  const yearOptions = useMemo(() => {
    const currentYear = viewDate.getFullYear();
    const minYear = minDate ? minDate.getFullYear() : currentYear - 8;
    const maxYear = maxDate ? maxDate.getFullYear() : currentYear + 12;
    const safeMin = Math.min(minYear, maxYear);
    const safeMax = Math.max(minYear, maxYear);
    const years: number[] = [];

    for (let year = safeMin; year <= safeMax; year += 1) {
      years.push(year);
    }

    return years;
  }, [maxDate, minDate, viewDate]);

  function commit(nextValue: string) {
    if (!controlled) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  }

  function isDisabledDay(day: Date): boolean {
    if (minDate && day < minDate) {
      return true;
    }

    if (maxDate && day > maxDate) {
      return true;
    }

    return false;
  }

  const today = new Date();
  const displayLabel = selectedDate ? selectedDate.toLocaleDateString("it-IT") : "Seleziona data";

  return (
    <label
      ref={containerRef}
      className={`input-group custom-calendar-field ${compact ? "compact" : ""}`}
    >
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>

      <button
        type="button"
        className="custom-calendar-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span className={`custom-calendar-value ${selectedDate ? "" : "placeholder"}`}>{displayLabel}</span>
        <span className="custom-select-arrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {name ? <input type="hidden" name={name} value={activeValue ?? ""} required={required} /> : null}

      {open ? (
        <div className="calendar-dropdown fancy">
          <div className="calendar-header">
            <button
              type="button"
              className="calendar-nav"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            >
              ‹
            </button>

            <div className="calendar-period-controls">
              <select
                className="calendar-period-select"
                value={viewDate.getMonth()}
                onChange={(event) =>
                  setViewDate(
                    new Date(
                      viewDate.getFullYear(),
                      Number.parseInt(event.target.value, 10),
                      1
                    )
                  )
                }
              >
                {MONTH_LABELS.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>

              <select
                className="calendar-period-select year"
                value={viewDate.getFullYear()}
                onChange={(event) =>
                  setViewDate(
                    new Date(
                      Number.parseInt(event.target.value, 10),
                      viewDate.getMonth(),
                      1
                    )
                  )
                }
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="calendar-nav"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>

          <div className="calendar-grid labels">
            {DAY_LABELS.map((labelDay, index) => (
              <span key={`${labelDay}-${index}`}>{labelDay}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <span key={`empty-${index}`} className="calendar-empty" />;
              }

              const isSelected = !!selectedDate && sameDay(day, selectedDate);
              const isToday = sameDay(day, today);
              const disabled = isDisabledDay(day);

              return (
                <button
                  key={`${day.toISOString()}-${index}`}
                  type="button"
                  className={`calendar-day ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    commit(formatYmd(day));
                    setOpen(false);
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </label>
  );
}
