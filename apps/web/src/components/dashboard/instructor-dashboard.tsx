import { DoorOpen, Users } from "lucide-react";
import type { WorkoutPlan } from "@gestionale/db";

import { saveWorkoutPlanAction, simulateEntryAction } from "@/app/actions/dashboard-actions";

import { MaskedAccessCode } from "../ui/masked-access-code";
import { UserAvatar } from "../ui/user-avatar";
import { WeeklyPlanForm } from "../ui/weekly-plan-form";

type InstructorDashboardProps = {
  accessCode: string;
  workoutPlan: WorkoutPlan | null;
  assignedSubscribers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  subscriberPhotoUrls?: Record<string, string>;
};

export function InstructorDashboard({
  accessCode,
  workoutPlan,
  assignedSubscribers,
  subscriberPhotoUrls = {}
}: InstructorDashboardProps) {
  return (
    <div className="dash-content">
      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div className="dash-grid-2col">
        <MaskedAccessCode code={accessCode} title="Codice personale istruttore" />

        <div className="dash-card dash-card-accent">
          <div className="dash-card-header">
            <DoorOpen size={14} className="dash-card-header-icon" />
            <div>
              <p className="dash-card-kicker">Ingresso</p>
              <h3 className="dash-card-title">Registra accesso</h3>
            </div>
          </div>
          <form action={simulateEntryAction}>
            <button type="submit" className="button button-primary" style={{ width: "100%" }}>
              Simula ingresso
            </button>
          </form>
        </div>
      </div>

      {/* ── Allievi ──────────────────────────────────────────────── */}
      <div className="dash-card-full">
        <div className="dash-card-header">
          <Users size={14} className="dash-card-header-icon" />
          <div>
            <p className="dash-card-kicker">Allievi</p>
            <h3 className="dash-card-title">
              {`Iscritti assegnati${assignedSubscribers.length > 0 ? ` (${assignedSubscribers.length})` : ""}`}
            </h3>
          </div>
        </div>

        {assignedSubscribers.length === 0 ? (
          <div className="empty-state">Ancora nessun allievo assegnato.</div>
        ) : (
          <div className="dash-subscriber-grid">
            {assignedSubscribers.map((subscriber) => (
              <div key={subscriber.id} className="user-card">
                <UserAvatar
                  firstName={subscriber.firstName}
                  profilePhotoUrl={subscriberPhotoUrls[subscriber.id]}
                />
                <div className="user-card-info">
                  <span className="user-card-name">
                    {`${subscriber.firstName} ${subscriber.lastName}`}
                  </span>
                  <span className="user-card-meta">{subscriber.email}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Piano settimanale ────────────────────────────────────── */}
      <WeeklyPlanForm
        action={saveWorkoutPlanAction}
        plan={workoutPlan}
        title="Il tuo piano settimanale"
      />
    </div>
  );
}
