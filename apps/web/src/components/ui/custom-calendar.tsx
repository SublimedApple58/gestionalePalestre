"use client";

import { useMemo, useState } from "react";

type CustomCalendarProps = {
  name: string;
  label: string;
  defaultValue?: string;
};

const DAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];

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

export function CustomCalendar({ name, label, defaultValue }: CustomCalendarProps) {
  const initialSelected = parseYmd(defaultValue) ?? new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(initialSelected);
  const [viewDate, setViewDate] = useState<Date>(
    new Date(initialSelected.getFullYear(), initialSelected.getMonth(), 1)
  );
  const [open, setOpen] = useState(false);

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

  return (
    <label className="input-group custom-calendar-field">
      <span>{label}</span>

      <button
        type="button"
        className="custom-select-button"
        onClick={() => setOpen((current) => !current)}
      >
        {selectedDate.toLocaleDateString("it-IT")}
      </button>

      <input type="hidden" name={name} value={formatYmd(selectedDate)} />

      {open ? (
        <div className="calendar-dropdown">
          <div className="calendar-header">
            <button
              type="button"
              className="calendar-nav"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            >
              ‹
            </button>

            <strong>{viewDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</strong>

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
            {calendarDays.map((day, index) =>
              day ? (
                <button
                  key={`${day.toISOString()}-${index}`}
                  type="button"
                  className={`calendar-day ${sameDay(day, selectedDate) ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedDate(day);
                    setOpen(false);
                  }}
                >
                  {day.getDate()}
                </button>
              ) : (
                <span key={`empty-${index}`} className="calendar-empty" />
              )
            )}
          </div>
        </div>
      ) : null}
    </label>
  );
}
