"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
/** Celle di un mese (null = vuoto), settimana che parte da lunedì. */
function monthCells(y: number, m: number): (number | null)[] {
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7; // Lun=0
  const dim = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function AccessDateRange({
  from,
  to,
  onChange,
  allowFuture = false
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  /**
   * Consente di selezionare date future. Default `false` per il registro
   * ingressi (non esistono accessi nel futuro); attivato p.es. per filtrare
   * scadenze abbonamento/certificato in arrivo.
   */
  allowFuture?: boolean;
}) {
  const today = todayYMD();
  const [open, setOpen] = useState(false);
  const [selStart, setSelStart] = useState<string | null>(from);
  const [selEnd, setSelEnd] = useState<string | null>(to);
  const [hover, setHover] = useState<string | null>(null);

  // Mese di partenza della vista (il pannello di sinistra).
  const initRef = from ?? today;
  const [view, setView] = useState(() => {
    const parts = initRef.split("-");
    return { y: Number(parts[0]), m: Number(parts[1]) - 1 };
  });

  // Sync quando cambiano le prop (navigazione URL).
  useEffect(() => {
    setSelStart(from);
    setSelEnd(to);
  }, [from, to]);

  const previewEnd = selEnd ?? hover;
  const [lo, hi] = useMemo(() => {
    if (!selStart || !previewEnd) return [selStart, null] as [string | null, string | null];
    return selStart <= previewEnd ? [selStart, previewEnd] : [previewEnd, selStart];
  }, [selStart, previewEnd]);

  function pick(dayStr: string) {
    if (!allowFuture && dayStr > today) return;
    if (!selStart || selEnd) {
      // Nuova selezione
      setSelStart(dayStr);
      setSelEnd(null);
      setHover(null);
      return;
    }
    // Ho lo start, manca l'end
    if (dayStr < selStart) {
      setSelStart(dayStr);
      return;
    }
    setSelEnd(dayStr);
    setHover(null);
    onChange(selStart, dayStr);
    setOpen(false);
  }

  function clear() {
    setSelStart(null);
    setSelEnd(null);
    setHover(null);
    onChange(null, null);
    setOpen(false);
  }

  function shift(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const rightView = useMemo(() => {
    const d = new Date(view.y, view.m + 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }, [view]);

  const label =
    from && to
      ? `${fmtDisplay(from)} → ${fmtDisplay(to)}`
      : from
      ? `Dal ${fmtDisplay(from)}`
      : "Seleziona periodo";

  function renderMonth(y: number, m: number) {
    return (
      <div className="adr-month" key={`${y}-${m}`}>
        <div className="adr-mtitle">
          {MONTHS[m]} {y}
        </div>
        <div className="adr-grid adr-wd-row">
          {WEEKDAYS.map((w, i) => (
            <span className="adr-wd" key={i}>
              {w}
            </span>
          ))}
        </div>
        <div className="adr-grid">
          {monthCells(y, m).map((d, i) => {
            if (d === null) return <span className="adr-cell adr-empty" key={i} />;
            const s = ymd(y, m, d);
            const disabled = !allowFuture && s > today;
            const isLo = s === lo;
            const isHi = s === hi && lo !== hi;
            const inRange = !!lo && !!hi && s >= lo && s <= hi;
            const isMid = inRange && !isLo && !isHi;
            const cls = [
              "adr-cell",
              "adr-day",
              disabled ? "is-disabled" : "",
              isLo ? "is-start" : "",
              isHi ? "is-end" : "",
              isMid ? "is-mid" : "",
              s === today ? "is-today" : ""
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                type="button"
                key={i}
                className={cls}
                disabled={disabled}
                onClick={() => pick(s)}
                onMouseEnter={() => selStart && !selEnd && setHover(s)}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const nextDisabled =
    !allowFuture &&
    (rightView.y > new Date().getFullYear() ||
      (rightView.y === new Date().getFullYear() && rightView.m >= new Date().getMonth()));

  return (
    <div className="adr-wrap">
      <button type="button" className={`adr-trigger${from || to ? " has-value" : ""}`} onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={15} />
        <span>{label}</span>
      </button>

      {open && (
        <>
          <div className="adr-backdrop" onClick={() => setOpen(false)} />
          <div className="adr-pop" role="dialog" aria-label="Seleziona periodo">
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
            <div className="adr-months" onMouseLeave={() => setHover(null)}>
              {renderMonth(view.y, view.m)}
              {renderMonth(rightView.y, rightView.m)}
            </div>
            <div className="adr-foot">
              <button type="button" className="adr-clear" onClick={clear}>
                Azzera
              </button>
              <span className="adr-hint">
                {selStart && !selEnd ? "Seleziona la data di fine" : "Seleziona un periodo"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
