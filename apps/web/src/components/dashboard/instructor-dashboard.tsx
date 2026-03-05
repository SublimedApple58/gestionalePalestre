import type { WorkoutPlan } from "@gestionale/db";

import { saveWorkoutPlanAction, simulateEntryAction } from "@/app/actions/dashboard-actions";

import { MaskedAccessCode } from "../ui/masked-access-code";
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
};

export function InstructorDashboard({
  accessCode,
  workoutPlan,
  assignedSubscribers
}: InstructorDashboardProps) {
  return (
    <div className="dashboard-grid">
      {/* ── Codice istruttore ────────────────────────────────────── */}
      <MaskedAccessCode code={accessCode} title="Codice personale istruttore" />

      {/* ── Ingresso ─────────────────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Ingresso</p>
          <h3 className="panel-title">Registra accesso</h3>
        </div>
        <form action={simulateEntryAction}>
          <button type="submit" className="button button-primary">
            Simula ingresso
          </button>
        </form>
      </section>

      {/* ── Allievi ──────────────────────────────────────────────── */}
      <section className="panel panel-full">
        <div>
          <p className="panel-kicker">Allievi</p>
          <h3 className="panel-title">
            {`Iscritti assegnati${assignedSubscribers.length > 0 ? ` (${assignedSubscribers.length})` : ""}`}
          </h3>
        </div>

        {assignedSubscribers.length === 0 ? (
          <div className="empty-state">Ancora nessun allievo assegnato.</div>
        ) : (
          <div className="user-list">
            {assignedSubscribers.map((subscriber) => (
              <div key={subscriber.id} className="user-card">
                <span className="user-avatar">
                  {subscriber.firstName.charAt(0).toUpperCase()}
                </span>
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
      </section>

      {/* ── Piano settimanale ────────────────────────────────────── */}
      <WeeklyPlanForm
        action={saveWorkoutPlanAction}
        plan={workoutPlan}
        title="Il tuo piano settimanale"
      />
    </div>
  );
}
