import { UserMinus } from "lucide-react";

import { DashSeeAll } from "./dash-see-all";

export type LowActivityRow = {
  id: string;
  firstName: string;
  lastName: string;
  lastAccessAt: Date | string | null;
};

const AMBER = "#f59e0b";
const RED = "#ef4444";

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

export function LowActivitySection({
  items,
  days = 15,
  limit,
  href
}: {
  items: LowActivityRow[];
  days?: number;
  limit?: number;
  href?: string;
}) {
  const visible = typeof limit === "number" ? items.slice(0, limit) : items;

  return (
    <div className="dash-card-full">
      <div className="dash-card-header">
        <UserMinus size={14} className="dash-card-header-icon" style={{ color: AMBER }} />
        <div>
          <p className="dash-card-kicker" style={{ color: AMBER }}>
            Richiede attenzione
          </p>
          <h3 className="dash-card-title">
            Iscritti poco attivi
            <span className="approval-badge" style={{ background: AMBER }}>
              {items.length}
            </span>
          </h3>
        </div>
      </div>

      <p
        className="dash-event-meta"
        style={{ margin: "0 0 4px", padding: "0 2px" }}
      >
        Nessun ingresso in palestra da almeno {days} giorni
      </p>

      <ul className="dash-event-list">
        {visible.map((u) => {
          const last = u.lastAccessAt ? new Date(u.lastAccessAt) : null;
          const gone = last ? daysAgo(last) : null;
          const cold = last === null || (gone !== null && gone >= 30);
          return (
            <li key={u.id} className="dash-event-item">
              <div className="dash-event-info" style={{ flex: 1 }}>
                <div className="dash-event-name">
                  {u.firstName} {u.lastName}
                </div>
                <p className="dash-event-meta">
                  {last
                    ? `Ultimo ingresso il ${last.toLocaleDateString("it-IT")}`
                    : "Nessun ingresso registrato"}
                </p>
              </div>
              <span
                className="status-badge"
                style={{
                  flexShrink: 0,
                  color: cold ? RED : AMBER,
                  background: cold ? "rgba(239,68,68,0.13)" : "rgba(245,158,11,0.13)",
                  border: `1px solid ${cold ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`
                }}
              >
                {last === null ? "mai" : gone === 0 ? "oggi" : `${gone} gg fa`}
              </span>
            </li>
          );
        })}
      </ul>

      {typeof limit === "number" && href && <DashSeeAll total={items.length} shown={limit} href={href} />}
    </div>
  );
}
