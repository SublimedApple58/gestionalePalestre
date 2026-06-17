import type { CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardList, User } from "lucide-react";

import type { WorkoutTemplateSummary } from "@/lib/services/workout-template-service";

type MemberSchedeListProps = {
  schede: WorkoutTemplateSummary[];
};

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
      {schede.map((scheda, index) => (
        <li key={scheda.id} style={{ "--i": index } as CSSProperties}>
          <Link href={`/schede/${scheda.id}`} className="scheda-card">
            <span className="scheda-card-stat" aria-hidden="true">
              <span className="scheda-card-stat-num">{scheda.daysPerWeek}</span>
              <span className="scheda-card-stat-label">
                {scheda.daysPerWeek === 1 ? "giorno" : "giorni"}
              </span>
            </span>

            <span className="scheda-card-body">
              <span className="scheda-card-title">{scheda.name}</span>
              {scheda.description ? (
                <span className="scheda-card-desc">{scheda.description}</span>
              ) : null}
              <span className="scheda-card-author">
                <User size={12} aria-hidden="true" />
                {`${scheda.createdBy.firstName} ${scheda.createdBy.lastName}`}
              </span>
            </span>

            <ChevronRight size={18} aria-hidden="true" className="scheda-card-chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
