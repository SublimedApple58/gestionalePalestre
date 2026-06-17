import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, User } from "lucide-react";

import type { WorkoutTemplateSummary } from "@/lib/services/workout-template-service";

type MemberSchedeListProps = {
  schede: WorkoutTemplateSummary[];
};

function daysLabel(days: number): string {
  return days === 1 ? "1 giorno/sett." : `${days} giorni/sett.`;
}

export function MemberSchedeList({ schede }: MemberSchedeListProps) {
  if (schede.length === 0) {
    return (
      <div className="empty-state schede-empty">
        <ClipboardList size={28} aria-hidden="true" />
        <p>Nessuna scheda assegnata.</p>
        <span>Chiedi al tuo istruttore di assegnartene una.</span>
      </div>
    );
  }

  return (
    <ul className="schede-list" role="list">
      {schede.map((scheda) => (
        <li key={scheda.id}>
          <Link href={`/schede/${scheda.id}`} className="scheda-card">
            <span className="scheda-card-icon" aria-hidden="true">
              <ClipboardList size={20} />
            </span>

            <span className="scheda-card-body">
              <span className="scheda-card-title">{scheda.name}</span>
              {scheda.description ? (
                <span className="scheda-card-desc">{scheda.description}</span>
              ) : null}
              <span className="scheda-card-meta">
                <span className="scheda-card-meta-item">
                  <CalendarDays size={13} aria-hidden="true" />
                  {daysLabel(scheda.daysPerWeek)}
                </span>
                <span className="scheda-card-meta-item">
                  <User size={13} aria-hidden="true" />
                  {`${scheda.createdBy.firstName} ${scheda.createdBy.lastName}`}
                </span>
              </span>
            </span>

            <ChevronRight size={18} aria-hidden="true" className="scheda-card-chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
