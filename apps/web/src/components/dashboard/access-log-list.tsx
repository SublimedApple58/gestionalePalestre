import { type AccessEventType, type UserRole } from "@gestionale/db";

import { roleLabel } from "@/lib/roles";
import { formatRomeDateTime } from "@/lib/datetime";

import { DashSeeAll } from "./dash-see-all";
import { UserAvatar } from "../ui/user-avatar";

export type AccessLogRow = {
  id: string;
  eventType: AccessEventType;
  note: string | null;
  occurredAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
};

const ACCESS_EVENT_LABEL: Record<AccessEventType, string> = {
  KEYPAD_UNLOCK: "Ingresso tastierino",
  DOOR_OPEN: "Apertura porta (remoto)",
  ENTRY_SIMULATION: "Simulazione (storico)"
};

export function AccessLogList({
  logs,
  profilePhotoUrls = {},
  limit,
  href
}: {
  logs: AccessLogRow[];
  profilePhotoUrls?: Record<string, string>;
  limit?: number;
  href?: string;
}) {
  const visible = typeof limit === "number" ? logs.slice(0, limit) : logs;

  return (
    <>
      <ul className="dash-event-list">
        {visible.map((log) => (
          <li key={log.id} className="dash-event-item">
            <div className="dash-event-avatar">
              <UserAvatar
                firstName={log.user.firstName}
                profilePhotoUrl={profilePhotoUrls[log.user.id]}
              />
            </div>
            <div className="dash-event-info">
              <div className="dash-event-name">
                {`${log.user.firstName} ${log.user.lastName}`}
                <span className="td-role-badge" data-role={log.user.role} style={{ marginLeft: 6 }}>
                  {roleLabel(log.user.role)}
                </span>
              </div>
              <p className="dash-event-meta">
                {`${ACCESS_EVENT_LABEL[log.eventType] ?? log.eventType} — ${formatRomeDateTime(log.occurredAt)}`}
              </p>
              {log.note && <p className="dash-event-note">{log.note}</p>}
            </div>
          </li>
        ))}
      </ul>

      {typeof limit === "number" && href && (
        <DashSeeAll total={logs.length} shown={limit} href={href} />
      )}
    </>
  );
}
