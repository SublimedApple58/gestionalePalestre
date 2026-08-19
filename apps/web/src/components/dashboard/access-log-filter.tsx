"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Preset = { label: string; range: () => { from: string; to: string } };

const PRESETS: Preset[] = [
  {
    label: "Oggi",
    range: () => {
      const t = ymd(new Date());
      return { from: t, to: t };
    }
  },
  {
    label: "Ieri",
    range: () => {
      const y = ymd(new Date(Date.now() - 86400000));
      return { from: y, to: y };
    }
  },
  {
    label: "7 giorni",
    range: () => ({ from: ymd(new Date(Date.now() - 6 * 86400000)), to: ymd(new Date()) })
  },
  {
    label: "30 giorni",
    range: () => ({ from: ymd(new Date(Date.now() - 29 * 86400000)), to: ymd(new Date()) })
  },
  {
    label: "Questo mese",
    range: () => {
      const now = new Date();
      return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
    }
  }
];

export function AccessLogFilter({ from, to }: { from: string | null; to: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const today = ymd(new Date());
  const active = from && to ? `${from}→${to}` : null;

  function apply(nextFrom: string | null, nextTo: string | null) {
    const q = new URLSearchParams();
    if (nextFrom) q.set("from", nextFrom);
    if (nextTo) q.set("to", nextTo);
    const tail = q.toString();
    startTransition(() => router.push(tail ? `/accessi?${tail}` : "/accessi", { scroll: false }));
  }

  return (
    <div className="access-filter" aria-busy={pending}>
      <div className="access-filter-presets">
        {PRESETS.map((p) => {
          const r = p.range();
          const on = active === `${r.from}→${r.to}`;
          return (
            <button
              key={p.label}
              type="button"
              className={`access-chip${on ? " on" : ""}`}
              onClick={() => apply(r.from, r.to)}
            >
              {p.label}
            </button>
          );
        })}
        {(from || to) && (
          <button type="button" className="access-chip access-chip-clear" onClick={() => apply(null, null)}>
            Azzera
          </button>
        )}
      </div>
      <div className="access-filter-range">
        <label className="access-date">
          <span>Da</span>
          <input
            type="date"
            value={from ?? ""}
            max={to ?? today}
            onChange={(e) => apply(e.target.value || null, to)}
          />
        </label>
        <span className="access-date-sep">→</span>
        <label className="access-date">
          <span>A</span>
          <input
            type="date"
            value={to ?? ""}
            min={from ?? undefined}
            max={today}
            onChange={(e) => apply(from, e.target.value || null)}
          />
        </label>
      </div>
    </div>
  );
}
