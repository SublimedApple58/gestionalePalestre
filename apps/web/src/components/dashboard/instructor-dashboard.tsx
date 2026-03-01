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
      <MaskedAccessCode code={accessCode} title="Codice personale istruttore" />

      <section className="panel">
        <p className="panel-kicker">Ingresso</p>
        <h3 className="panel-title">Registra accesso</h3>
        <form action={simulateEntryAction}>
          <button type="submit" className="button button-primary">
            Simula ingresso
          </button>
        </form>
      </section>

      <section className="panel panel-full">
        <p className="panel-kicker">Allievi</p>
        <h3 className="panel-title">Iscritti assegnati</h3>

        <ul className="event-list">
          {assignedSubscribers.length === 0 ? (
            <li>Ancora nessun allievo assegnato.</li>
          ) : (
            assignedSubscribers.map((subscriber) => (
              <li key={subscriber.id}>
                <strong>{`${subscriber.firstName} ${subscriber.lastName}`}</strong>
                <p>{subscriber.email}</p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="panel panel-full">
        <WeeklyPlanForm action={saveWorkoutPlanAction} plan={workoutPlan} title="Il tuo piano settimanale" />
      </section>
    </div>
  );
}
