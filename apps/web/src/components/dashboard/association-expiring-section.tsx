import { CalendarClock } from "lucide-react";

import { daysUntil } from "@/lib/association";

export type ExpiringAssociationRow = {
  id: string;
  firstName: string;
  lastName: string;
  associationExpiresAt: Date;
};

const AMBER = "#f59e0b";
const RED = "#ef4444";

export function AssociationExpiringSection({ items }: { items: ExpiringAssociationRow[] }) {
  return (
    <div className="dash-card-full">
      <div className="dash-card-header">
        <CalendarClock size={14} className="dash-card-header-icon" style={{ color: AMBER }} />
        <div>
          <p className="dash-card-kicker" style={{ color: AMBER }}>Richiede attenzione</p>
          <h3 className="dash-card-title">
            Associazioni in scadenza
            <span className="approval-badge" style={{ background: AMBER }}>{items.length}</span>
          </h3>
        </div>
      </div>

      <ul className="dash-event-list">
        {items.map((u) => {
          const days = daysUntil(new Date(u.associationExpiresAt));
          const expired = days < 0;
          return (
            <li key={u.id} className="dash-event-item">
              <div className="dash-event-info" style={{ flex: 1 }}>
                <div className="dash-event-name">
                  {u.firstName} {u.lastName}
                </div>
                <p className="dash-event-meta">
                  {expired ? "Scaduta il " : "Scade il "}
                  {new Date(u.associationExpiresAt).toLocaleDateString("it-IT")}
                </p>
              </div>
              <span
                className="status-badge"
                style={{
                  flexShrink: 0,
                  color: expired ? RED : AMBER,
                  background: expired ? "rgba(239,68,68,0.13)" : "rgba(245,158,11,0.13)",
                  border: `1px solid ${expired ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`
                }}
              >
                {expired ? "scaduta" : days === 0 ? "oggi" : `tra ${days} gg`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
