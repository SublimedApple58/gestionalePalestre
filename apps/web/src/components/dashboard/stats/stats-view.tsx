"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { GymStats } from "@/lib/services/gym-stats-service";

const RANGES = [
  { days: 30, label: "30 gg" },
  { days: 90, label: "90 gg" },
  { days: 365, label: "12 mesi" }
];

function fmt(n: number): string {
  return n.toLocaleString("it-IT");
}
function dec(n: number): string {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}
function daysToMonths(days: number): string {
  return days > 0 ? (days / 30.44).toLocaleString("it-IT", { maximumFractionDigits: 1 }) : "0";
}

// Traccia SVG (area + linea) da una serie di valori.
function linePath(values: number[], w: number, h: number): { area: string; line: string } {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * w;
    const y = h - (v / max) * (h - 14) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { line: `M${pts.join(" ")}`, area: `M0,${h} ${pts.join(" ")} ${w},${h}Z` };
}

// Colore cella heatmap sul gradiente brand.
function heatColor(t: number): string {
  if (t <= 0.05) return "rgba(255,255,255,.045)";
  return `rgba(223,37,49,${(0.16 + t * 0.84).toFixed(3)})`;
}

export function StatsView({
  stats,
  rangeDays,
  asOf
}: {
  stats: GymStats;
  rangeDays: number;
  asOf: string | null;
}) {
  const { members, usage, retention } = stats;
  const router = useRouter();

  const avgPerMonth = Math.round(members.newPerMonth.reduce((s, m) => s + m.value, 0) / 12);
  const prevMonth = members.newPerMonth[members.newPerMonth.length - 2]?.value ?? 0;
  const momDelta = members.newThisMonth - prevMonth;
  const oneOff = Math.max(0, members.payers - members.renewers);

  // Snapshot abbonamenti per tipo: valore del date-input = data effettiva usata.
  const asOfInput = members.activeByTierAsOf.slice(0, 10);
  const todayInput = new Date().toISOString().slice(0, 10);
  const isToday = !asOf || asOf === todayInput;
  const tierMax = Math.max(1, ...members.activeByTier.map((t) => t.value));
  function onAsOfChange(value: string) {
    const q = new URLSearchParams({ range: String(rangeDays) });
    if (value && value !== todayInput) q.set("asOf", value);
    router.push(`/statistiche?${q.toString()}`, { scroll: false });
  }

  const monthMax = Math.max(1, ...members.newPerMonth.map((m) => m.value));
  const heatMax = Math.max(1, ...usage.heatmap.flat());
  const line = linePath(usage.perDay.map((d) => d.value), 620, 170);
  const weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <main className="stats-shell">
      {/* Header */}
      <header className="stats-top">
        <div>
          <span className="stats-kick">Dashboard titolare · House of Muscle</span>
          <h1 className="stats-title">Statistiche</h1>
        </div>
        <nav className="stats-range" aria-label="Periodo">
          {RANGES.map((r) => (
            <Link
              key={r.days}
              href={`/statistiche?range=${r.days}`}
              className={r.days === rangeDays ? "on" : ""}
              scroll={false}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* KPI */}
      <div className="stats-kpis">
        <div className="stats-kpi accent">
          <span className="stats-kpi-lab">Iscritti attivi</span>
          <span className="stats-kpi-num">{fmt(members.active)}</span>
          <span className="stats-kpi-foot">su {fmt(members.total)} totali</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-lab">Nuovi questo mese</span>
          <span className="stats-kpi-num">{fmt(members.newThisMonth)}</span>
          <span className="stats-kpi-foot">
            <span className={momDelta >= 0 ? "up" : "down"}>
              {momDelta >= 0 ? "+" : ""}
              {fmt(momDelta)}
            </span>{" "}
            vs mese scorso · media {fmt(avgPerMonth)}
          </span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-lab">Inattivi (30 gg)</span>
          <span className="stats-kpi-num">{fmt(usage.inactive30)}</span>
          <span className="stats-kpi-foot">da ricontattare</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi-lab">Tasso di rinnovo</span>
          <span className="stats-kpi-num">
            {members.renewalRatePct}
            <small>%</small>
          </span>
          <span className="stats-kpi-foot">rinnovano a scadenza</span>
        </div>
      </div>

      {/* ISCRITTI */}
      <section className="stats-band">
        <div className="stats-sec-h">
          <span className="stats-tick" />
          <h2>Iscritti</h2>
        </div>
        <div className="stats-row-two">
          <div className="stats-panel">
            <div className="stats-p-t">Nuovi iscritti per mese</div>
            <div className="stats-p-s">Ultimi 12 mesi</div>
            <div className="stats-bars">
              {members.newPerMonth.map((m, i) => (
                <div className={`stats-bar ${m.value < Math.max(1, monthMax * 0.35) ? "dim" : ""}`} key={i}>
                  <div
                    className="stats-bar-col"
                    style={{ height: `${Math.max(6, (m.value / monthMax) * 100)}%`, animationDelay: `${i * 0.03}s` }}
                    title={`${m.value}`}
                  />
                  <div className="stats-bar-l">{m.label.charAt(0).toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="stats-panel stats-renew">
            <div>
              <div className="stats-renew-big">
                {members.renewalRatePct}
                <small>%</small>
              </div>
              <div className="stats-renew-cap">rinnova almeno una volta</div>
            </div>
            <div className="stats-track">
              <div className="stats-fill" style={{ width: `${members.renewalRatePct}%` }} />
            </div>
            <div className="stats-renew-cap">
              {fmt(members.renewers)} rinnovati · {fmt(oneOff)} una tantum · su {fmt(members.payers)} paganti
            </div>
          </div>
        </div>

        <div className="stats-panel stats-mt">
          <div className="stats-heat-head">
            <div>
              <div className="stats-p-t">Abbonamenti attivi per tipo</div>
              <div className="stats-p-s">
                {isToday ? "Situazione a oggi" : `Situazione al ${asOfInput.split("-").reverse().join("/")}`} ·{" "}
                {fmt(members.activeSubsTotal)} attivi
              </div>
            </div>
            <label className="stats-asof">
              <span>Al giorno</span>
              <input
                type="date"
                value={asOfInput}
                max={todayInput}
                onChange={(e) => onAsOfChange(e.target.value)}
              />
            </label>
          </div>
          {members.activeByTier.length === 0 ? (
            <div className="stats-p-s">Nessun abbonamento attivo a questa data.</div>
          ) : (
            <div className="stats-tiers">
              {members.activeByTier.map((t) => (
                <div className="stats-tier" key={t.label}>
                  <span className="stats-tier-lab">{t.label}</span>
                  <div className="stats-tier-track">
                    <div className="stats-tier-fill" style={{ width: `${(t.value / tierMax) * 100}%` }} />
                  </div>
                  <span className="stats-tier-val">{fmt(t.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FREQUENZA */}
      <section className="stats-band">
        <div className="stats-sec-h">
          <span className="stats-tick" />
          <h2>Frequenza d&apos;uso</h2>
          <span className="stats-hint">accessi al tastierino</span>
        </div>
        <div className="stats-panel">
          <div className="stats-p-t">Accessi giornalieri</div>
          <div className="stats-p-s">Ultimi 30 giorni · ingressi in palestra</div>
          <svg className="stats-line" viewBox="0 0 620 170" preserveAspectRatio="none">
            <line className="stats-grid-line" x1="0" y1="43" x2="620" y2="43" />
            <line className="stats-grid-line" x1="0" y1="98" x2="620" y2="98" />
            <line className="stats-grid-line" x1="0" y1="150" x2="620" y2="150" />
            <path d={line.area} fill="url(#stats-area)" />
            <path d={line.line} fill="none" stroke="#df2531" strokeWidth="2.4" className="stats-line-path" />
          </svg>
          <div className="stats-strip">
            <div className="stats-cell">
              <span className="stats-cell-v">{fmt(usage.accessesLast30)}</span>
              <span className="stats-cell-l">Accessi / 30 gg</span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-v">{fmt(usage.avgPerDay)}</span>
              <span className="stats-cell-l">Media al giorno</span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-v">{dec(usage.avgPerActiveMemberWeek)}</span>
              <span className="stats-cell-l">A settimana / iscritto</span>
            </div>
            <div className="stats-cell">
              <span className="stats-cell-v warn">{dec(usage.avgDaysBetween)} gg</span>
              <span className="stats-cell-l">Tra un accesso e l&apos;altro</span>
            </div>
          </div>
        </div>

        <div className="stats-panel stats-mt">
          <div className="stats-heat-head">
            <div>
              <div className="stats-p-t">Quando la palestra è più piena</div>
              <div className="stats-p-s">Affluenza per giorno e fascia oraria</div>
            </div>
            {usage.peakLabel && (
              <div className="stats-peak">
                Picco <b>{usage.peakLabel}</b>
              </div>
            )}
          </div>
          <div className="stats-heat">
            {usage.heatmap.map((row, ri) => (
              <div className="stats-heat-row" key={ri}>
                <span className="stats-heat-rl">{weekdays[ri]}</span>
                {row.map((v, hi) => (
                  <span
                    className="stats-heat-cell"
                    key={hi}
                    style={{ background: heatColor(v / heatMax) }}
                    title={`${weekdays[ri]} ${String(hi).padStart(2, "0")}:00 · ${v}`}
                  />
                ))}
              </div>
            ))}
            <div className="stats-heat-x">
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h}>{h % 4 === 0 ? String(h).padStart(2, "0") : ""}</span>
              ))}
            </div>
          </div>
          <div className="stats-heat-key">
            <span>meno</span>
            <div className="stats-heat-scale">
              {[0.05, 0.3, 0.55, 0.8, 1].map((t) => (
                <i key={t} style={{ background: heatColor(t) }} />
              ))}
            </div>
            <span>più affollato</span>
          </div>
        </div>
      </section>

      {/* FIDELIZZAZIONE */}
      <section className="stats-band">
        <div className="stats-sec-h">
          <span className="stats-tick" />
          <h2>Fidelizzazione</h2>
          <span className="stats-hint">dati esatti dal go-live</span>
        </div>
        <div className="stats-four">
          <div className="stats-tile">
            <span className="stats-tile-n ok">
              {retention.churnRatePct}
              <small>%</small>
            </span>
            <span className="stats-tile-l">Churn rate</span>
            <span className="stats-tile-s">abbandoni nel periodo</span>
          </div>
          <div className="stats-tile">
            <span className="stats-tile-n">
              {retention.autoRenewPct}
              <small>%</small>
            </span>
            <span className="stats-tile-l">Rinnovi automatici</span>
            <span className="stats-tile-s">su abbonamenti attivi</span>
          </div>
          <div className="stats-tile">
            <span className="stats-tile-n">
              {daysToMonths(retention.avgDurationDays)}
              <small> mesi</small>
            </span>
            <span className="stats-tile-l">Durata media</span>
            <span className="stats-tile-s">dell&apos;abbonamento</span>
          </div>
          <div className="stats-tile">
            <span className="stats-tile-n">
              {retention.avgDaysToCancel > 0 ? daysToMonths(retention.avgDaysToCancel) : "—"}
              {retention.avgDaysToCancel > 0 && <small> mesi</small>}
            </span>
            <span className="stats-tile-l">Prima della disdetta</span>
            <span className="stats-tile-s">tempo medio</span>
          </div>
        </div>
      </section>

      <div className="stats-note">
        <b>Come leggerlo —</b> La frequenza si basa sugli ingressi reali al tastierino (l&apos;app non registra i
        singoli allenamenti). Churn, rinnovi automatici e disdette diventano precisi dal momento in cui il tracking
        è attivo.
      </div>

      {/* Gradiente area SVG */}
      <svg width="0" height="0" aria-hidden="true">
        <defs>
          <linearGradient id="stats-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(223,37,49,.34)" />
            <stop offset="1" stopColor="rgba(223,37,49,0)" />
          </linearGradient>
        </defs>
      </svg>
    </main>
  );
}
