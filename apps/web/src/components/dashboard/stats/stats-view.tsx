"use client";

import Link from "next/link";
import {
  Activity,
  CalendarRange,
  Clock,
  Flame,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users
} from "lucide-react";

import type { GymStats } from "@/lib/services/gym-stats-service";

const RANGES = [
  { days: 30, label: "30 gg" },
  { days: 90, label: "90 gg" },
  { days: 365, label: "12 mesi" }
];

function fmt(n: number): string {
  return n.toLocaleString("it-IT");
}

function daysToMonths(days: number): string {
  if (days <= 0) return "0";
  return (days / 30.44).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

// Traccia SVG (area + linea) da una serie di valori.
function linePath(values: number[], w: number, h: number): { area: string; line: string } {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * w;
    const y = h - (v / max) * (h - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M${pts.join(" ")}`;
  const area = `M0,${h} ${pts.join(" ")} ${w},${h}Z`;
  return { area, line };
}

// Colore cella heatmap sul gradiente brand.
function heatColor(t: number): string {
  if (t <= 0.04) return "rgba(255,255,255,.04)";
  return `rgba(223,37,49,${(0.14 + t * 0.86).toFixed(3)})`;
}

function Ring({
  pct,
  color,
  size = 130,
  stroke = 14
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="stats-ring">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={off}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text x={c} y={c + size * 0.06} textAnchor="middle" className="stats-ring-num">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export function StatsView({ stats, rangeDays }: { stats: GymStats; rangeDays: number }) {
  const { members, usage, retention } = stats;

  const avgPerMonth = Math.round(members.newPerMonth.reduce((s, m) => s + m.value, 0) / 12);
  const prevMonth = members.newPerMonth[members.newPerMonth.length - 2]?.value ?? 0;
  const momDelta = members.newThisMonth - prevMonth;

  const monthMax = Math.max(1, ...members.newPerMonth.map((m) => m.value));
  const weekdayMax = Math.max(1, ...usage.byWeekday.map((d) => d.value));
  const hourMax = Math.max(1, ...usage.byHour.map((h) => h.value));
  const heatMax = Math.max(1, ...usage.heatmap.flat());

  const line = linePath(usage.perDay.map((d) => d.value), 560, 150);
  const weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <main className="stats-shell">
      {/* Header */}
      <header className="stats-top">
        <div>
          <span className="stats-eyebrow">Dashboard titolare · House of Muscle</span>
          <h1 className="stats-title">
            Stati<em>stiche</em>
          </h1>
          <p className="stats-subhead">
            Andamento iscritti, frequenza d&apos;uso della palestra e fidelizzazione. Aggiornato
            all&apos;ultimo sync accessi.
          </p>
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

      {/* HERO KPIs */}
      <section className="stats-hero">
        <div className="stats-kpi lead">
          <span className="stats-kpi-lab">
            <span className="stats-kpi-dot">
              <Users size={14} />
            </span>
            Iscritti attivi
          </span>
          <div className="stats-kpi-num">{fmt(members.active)}</div>
          <div className="stats-kpi-foot">su {fmt(members.total)} iscritti totali</div>
        </div>

        <div className="stats-kpi" style={{ animationDelay: ".05s" }}>
          <span className="stats-kpi-lab">
            <span className="stats-kpi-dot">
              <UserPlus size={14} />
            </span>
            Nuovi (mese)
          </span>
          <div className="stats-kpi-num">{fmt(members.newThisMonth)}</div>
          <span className={`stats-delta ${momDelta >= 0 ? "up" : "down"}`}>
            {momDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {momDelta >= 0 ? "+" : ""}
            {fmt(momDelta)}
          </span>
          <div className="stats-kpi-foot">media {fmt(avgPerMonth)}/mese</div>
        </div>

        <div className="stats-kpi" style={{ animationDelay: ".1s" }}>
          <span className="stats-kpi-lab">
            <span className="stats-kpi-dot">
              <Clock size={14} />
            </span>
            Inattivi 30gg
          </span>
          <div className="stats-kpi-num">{fmt(usage.inactive30)}</div>
          <div className="stats-kpi-foot">nessun accesso da 30+ gg</div>
        </div>

        <div className="stats-kpi" style={{ animationDelay: ".15s" }}>
          <span className="stats-kpi-lab">
            <span className="stats-kpi-dot">
              <RefreshCw size={14} />
            </span>
            Tasso rinnovo
          </span>
          <div className="stats-kpi-num">
            {members.renewalRatePct}
            <span className="stats-kpi-unit">%</span>
          </div>
          <div className="stats-kpi-foot">chi rinnova a scadenza</div>
        </div>
      </section>

      {/* 01 — ISCRITTI */}
      <section className="stats-band">
        <div className="stats-band-h">
          <span className="stats-band-ic">
            <Users size={16} />
          </span>
          <span className="stats-band-k">Iscritti</span>
        </div>
        <div className="stats-grid2">
          <div className="stats-panel">
            <div className="stats-card-t">Nuovi iscritti per mese</div>
            <div className="stats-card-s">Ultimi 12 mesi · registrazioni</div>
            <div className="stats-bars">
              {members.newPerMonth.map((m, i) => (
                <div className="stats-bar" key={i}>
                  <div
                    className="stats-bar-col"
                    style={{ height: `${Math.max(4, (m.value / monthMax) * 100)}%`, animationDelay: `${i * 0.03}s` }}
                    title={`${m.value}`}
                  />
                  <div className="stats-bar-l">{m.label.charAt(0).toUpperCase()}</div>
                  <div className="stats-bar-v">{m.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="stats-panel">
            <div className="stats-card-t">Tasso di rinnovo</div>
            <div className="stats-card-s">Chi ha rinnovato almeno una volta</div>
            <div className="stats-ringwrap">
              <Ring pct={members.renewalRatePct} color="url(#stats-grad)" />
              <div className="stats-ring-lbls">
                <div className="stats-legend">
                  <i style={{ background: "#df2531" }} />
                  Rinnovato
                </div>
                <div className="stats-legend">
                  <i style={{ background: "rgba(255,255,255,.15)" }} />
                  Una tantum
                </div>
                <div className="stats-legend muted">% sugli iscritti paganti</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 02 — FREQUENZA */}
      <section className="stats-band">
        <div className="stats-band-h">
          <span className="stats-band-ic">
            <Activity size={16} />
          </span>
          <span className="stats-band-k">Frequenza d&apos;uso</span>
          <span className="stats-band-note">segnale: accessi al tastierino</span>
        </div>

        <div className="stats-grid2">
          <div className="stats-panel">
            <div className="stats-card-t">Accessi giornalieri</div>
            <div className="stats-card-s">Ultimi 30 giorni · ingressi in palestra</div>
            <svg className="stats-line" viewBox="0 0 560 150" preserveAspectRatio="none">
              <line x1="0" y1="40" x2="560" y2="40" className="stats-grid-line" />
              <line x1="0" y1="90" x2="560" y2="90" className="stats-grid-line" />
              <line x1="0" y1="140" x2="560" y2="140" className="stats-grid-line" />
              <path d={line.area} fill="url(#stats-area)" />
              <path d={line.line} fill="none" stroke="#df2531" strokeWidth="2.2" className="stats-line-path" />
            </svg>
            <div className="stats-mini-row">
              <div className="stats-mini">
                <span className="stats-mini-v">{fmt(usage.accessesLast30)}</span>
                <span className="stats-mini-l">accessi / 30gg</span>
              </div>
              <div className="stats-mini">
                <span className="stats-mini-v">{fmt(usage.accessesLast7)}</span>
                <span className="stats-mini-l">settimana</span>
              </div>
              <div className="stats-mini">
                <span className="stats-mini-v">{fmt(usage.avgPerDay)}</span>
                <span className="stats-mini-l">media / giorno</span>
              </div>
            </div>
          </div>

          <div className="stats-panel">
            <div className="stats-card-t">Ritmo per iscritto</div>
            <div className="stats-card-s">Media sugli iscritti attivi</div>
            <div className="stats-rhythm">
              <div className="stats-mini">
                <span className="stats-mini-v">
                  {usage.avgPerActiveMemberWeek.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                  <span className="stats-mini-unit"> / sett.</span>
                </span>
                <span className="stats-mini-l">Frequenza media</span>
                <span className="stats-mini-s">allenamenti a settimana per iscritto</span>
              </div>
              <div className="stats-mini">
                <span className="stats-mini-v">
                  {usage.avgDaysBetween.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
                  <span className="stats-mini-unit"> giorni</span>
                </span>
                <span className="stats-mini-l">Giorni tra un accesso e l&apos;altro</span>
              </div>
              <div className="stats-mini">
                <span className="stats-mini-v warn">{fmt(usage.inactive30)}</span>
                <span className="stats-mini-l">Iscritti inattivi</span>
                <span className="stats-mini-s">
                  nessun ingresso negli ultimi 30 giorni →<span className="pink"> da ricontattare</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Heatmap centerpiece */}
        <div className="stats-panel stats-mt">
          <div className="stats-heat-head">
            <div>
              <div className="stats-card-t">Affluenza per giorno e fascia oraria</div>
              <div className="stats-card-s">Quando la palestra è più piena · ingressi al tastierino</div>
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
                <span key={h}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
              ))}
            </div>
          </div>
          <div className="stats-heat-key">
            <span>meno</span>
            <div className="stats-heat-scale">
              {[0.05, 0.25, 0.5, 0.75, 1].map((t) => (
                <i key={t} style={{ background: heatColor(t) }} />
              ))}
            </div>
            <span>più affollato</span>
          </div>
        </div>

        <div className="stats-grid2 stats-mt">
          <div className="stats-panel">
            <div className="stats-card-t">Fasce orarie più frequentate</div>
            <div className="stats-card-s">Distribuzione ingressi nelle 24 ore</div>
            <div className="stats-hours">
              {usage.byHour.map((h, i) => (
                <div
                  className="stats-hour"
                  key={i}
                  style={{
                    height: `${Math.max(4, (h.value / hourMax) * 100)}%`,
                    opacity: 0.45 + (h.value / hourMax) * 0.55,
                    animationDelay: `${i * 0.015}s`
                  }}
                  title={`${h.label}:00 · ${h.value}`}
                />
              ))}
            </div>
            <div className="stats-hours-x">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </div>
          <div className="stats-panel">
            <div className="stats-card-t">Giorni più affollati</div>
            <div className="stats-card-s">Totale ingressi per giorno della settimana</div>
            <div className="stats-bars">
              {usage.byWeekday.map((d, i) => {
                const weekend = i >= 5;
                return (
                  <div className="stats-bar" key={i}>
                    <div
                      className={`stats-bar-col ${weekend ? "q" : ""}`}
                      style={{ height: `${Math.max(4, (d.value / weekdayMax) * 100)}%`, animationDelay: `${i * 0.04}s` }}
                    />
                    <div className="stats-bar-l">{d.label}</div>
                    <div className="stats-bar-v">{d.value}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 03 — FIDELIZZAZIONE */}
      <section className="stats-band">
        <div className="stats-band-h">
          <span className="stats-band-ic">
            <Flame size={16} />
          </span>
          <span className="stats-band-k">Fidelizzazione</span>
          <span className="stats-band-note">dati esatti dal go-live</span>
        </div>
        <div className="stats-grid3">
          <div className="stats-panel stats-gauge">
            <Ring pct={retention.churnRatePct} color="#22c55e" size={120} stroke={12} />
            <div className="stats-gauge-l">Churn rate</div>
            <div className="stats-gauge-s">abbandoni nel periodo</div>
          </div>
          <div className="stats-panel stats-gauge">
            <Ring pct={retention.autoRenewPct} color="url(#stats-grad)" size={120} stroke={12} />
            <div className="stats-gauge-l">Rinnovi automatici</div>
            <div className="stats-gauge-s">su abbonamenti attivi</div>
          </div>
          <div className="stats-panel stats-dur">
            <div className="stats-mini">
              <span className="stats-mini-v">
                {daysToMonths(retention.avgDurationDays)}
                <span className="stats-mini-unit"> mesi</span>
              </span>
              <span className="stats-mini-l">Durata media abbonamento</span>
            </div>
            <div className="stats-hr" />
            <div className="stats-mini">
              <span className="stats-mini-v">
                {retention.avgDaysToCancel > 0 ? daysToMonths(retention.avgDaysToCancel) : "—"}
                {retention.avgDaysToCancel > 0 && <span className="stats-mini-unit"> mesi</span>}
              </span>
              <span className="stats-mini-l">Tempo medio prima della disdetta</span>
            </div>
          </div>
        </div>
      </section>

      <div className="stats-note">
        <b>ℹ︎ Nota metodologica —</b>
        <span>
          La <b>frequenza d&apos;uso</b> è misurata sugli ingressi reali al tastierino (l&apos;app non
          registra i singoli allenamenti). Le metriche di <b>fidelizzazione</b> diventano precise dal
          momento in cui è attivo il tracking (rinnovo automatico + disdetta): lo storico precedente è
          parziale.
        </span>
      </div>

      {/* Gradienti SVG condivisi */}
      <svg width="0" height="0" aria-hidden="true">
        <defs>
          <linearGradient id="stats-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#ff5561" />
            <stop offset="1" stopColor="#a81922" />
          </linearGradient>
          <linearGradient id="stats-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(223,37,49,.42)" />
            <stop offset="1" stopColor="rgba(223,37,49,0)" />
          </linearGradient>
        </defs>
      </svg>
    </main>
  );
}
