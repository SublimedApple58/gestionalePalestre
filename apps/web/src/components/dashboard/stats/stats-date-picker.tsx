"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];
const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre"
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayYMD(): string {
  const t = new Date();
  return ymd(t.getFullYear(), t.getMonth(), t.getDate());
}
function fmtDisplay(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function monthCells(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Selettore di data singola (dark, stile Airbnb), riusa le classi .adr-*. */
export function StatsDatePicker({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const today = todayYMD();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const parts = (value || today).split("-");
    return { y: Number(parts[0]), m: Number(parts[1]) - 1 };
  });

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function pick(s: string) {
    if (s > today) return;
    onChange(s);
    setOpen(false);
  }

  const nowY = new Date().getFullYear();
  const nowM = new Date().getMonth();
  const nextDisabled = view.y > nowY || (view.y === nowY && view.m >= nowM);

  return (
    <div className="adr-wrap">
      <button type="button" className="adr-trigger has-value" onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={15} />
        <span>{value ? fmtDisplay(value) : "Scegli data"}</span>
      </button>

      {open && (
        <>
          <div className="adr-backdrop" onClick={() => setOpen(false)} />
          <div className="adr-pop" role="dialog" aria-label="Scegli data">
            <div className="adr-nav">
              <button type="button" className="adr-nav-btn" onClick={() => shift(-1)} aria-label="Mese precedente">
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="adr-nav-btn"
                onClick={() => shift(1)}
                disabled={nextDisabled}
                aria-label="Mese successivo"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="adr-months">
              <div className="adr-month">
                <div className="adr-mtitle">
                  {MONTHS[view.m]} {view.y}
                </div>
                <div className="adr-grid adr-wd-row">
                  {WEEKDAYS.map((w, i) => (
                    <span className="adr-wd" key={i}>
                      {w}
                    </span>
                  ))}
                </div>
                <div className="adr-grid">
                  {monthCells(view.y, view.m).map((d, i) => {
                    if (d === null) return <span className="adr-cell adr-empty" key={i} />;
                    const s = ymd(view.y, view.m, d);
                    const disabled = s > today;
                    const cls = [
                      "adr-cell",
                      "adr-day",
                      disabled ? "is-disabled" : "",
                      s === value ? "is-start" : "",
                      s === today ? "is-today" : ""
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <button type="button" key={i} className={cls} disabled={disabled} onClick={() => pick(s)}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
