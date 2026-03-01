import { SubscriptionTier, type WorkoutPlan } from "@gestionale/db";

import { saveWorkoutPlanAction, simulateEntryAction } from "@/app/actions/dashboard-actions";
import { isSubscriptionActive, tierLabel } from "@/lib/subscription";

import { MaskedAccessCode } from "../ui/masked-access-code";
import { WeeklyPlanForm } from "../ui/weekly-plan-form";

type SubscriberDashboardProps = {
  accessCode: string;
  workoutPlan: WorkoutPlan | null;
  subscription: {
    tier: SubscriptionTier;
    startsAt: Date;
    endsAt: Date;
  } | null;
  assignedInstructor: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export function SubscriberDashboard({
  accessCode,
  workoutPlan,
  subscription,
  assignedInstructor
}: SubscriberDashboardProps) {
  const subscriptionActive = isSubscriptionActive(subscription);

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <p className="panel-kicker">Abbonamento</p>
        <h3 className="panel-title">Stato abbonamento</h3>

        {subscription ? (
          <>
            <p>
              Piano attivo: <strong>{tierLabel(subscription.tier)}</strong>
            </p>
            <p>
              Scadenza: <strong>{new Date(subscription.endsAt).toLocaleDateString("it-IT")}</strong>
            </p>
            <p>
              Stato: <strong>{subscriptionActive ? "Attivo" : "Non attivo"}</strong>
            </p>
          </>
        ) : (
          <p>Nessun abbonamento assegnato.</p>
        )}
      </section>

      <section className="panel">
        <p className="panel-kicker">Istruttore</p>
        <h3 className="panel-title">Supporto assegnato</h3>

        {assignedInstructor ? (
          <p>{`${assignedInstructor.firstName} ${assignedInstructor.lastName} (${assignedInstructor.email})`}</p>
        ) : (
          <p>Nessun istruttore assegnato.</p>
        )}
      </section>

      {subscriptionActive ? (
        <>
          <MaskedAccessCode code={accessCode} title="Codice ingresso abbonato" />

          <section className="panel">
            <p className="panel-kicker">Ingresso</p>
            <h3 className="panel-title">Registra accesso</h3>
            <form action={simulateEntryAction}>
              <button type="submit" className="button button-primary">
                Simula ingresso
              </button>
            </form>
          </section>
        </>
      ) : (
        <section className="panel panel-full">
          <p className="panel-kicker">Ingresso palestra</p>
          <h3 className="panel-title">Codice non disponibile</h3>
          <p>Il codice di accesso viene mostrato solo con abbonamento attivo.</p>
        </section>
      )}

      <section className="panel panel-full">
        <WeeklyPlanForm action={saveWorkoutPlanAction} plan={workoutPlan} />
      </section>
    </div>
  );
}
