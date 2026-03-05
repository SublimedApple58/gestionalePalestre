import {
  DocumentStatus,
  SubscriptionTier,
  type UserDocument,
  UserRole,
  type WorkoutPlan
} from "@gestionale/db";

import { saveWorkoutPlanAction, simulateEntryAction } from "@/app/actions/dashboard-actions";
import {
  CORE_DOCUMENT_TYPES,
  documentTypeLabel,
  getDocumentSlot,
  getMissingDocumentTypes,
  getUploadSlotsForType,
  hasRequiredDocuments
} from "@/lib/documents";
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
  documents: UserDocument[];
};

export function SubscriberDashboard({
  accessCode,
  workoutPlan,
  subscription,
  assignedInstructor,
  documents
}: SubscriberDashboardProps) {
  const subscriptionActive = isSubscriptionActive(subscription);
  const documentsReady = hasRequiredDocuments(UserRole.SUBSCRIBER, documents);
  const missingDocuments = getMissingDocumentTypes(UserRole.SUBSCRIBER, documents);
  const canEnterGym = subscriptionActive && documentsReady;

  const pendingTypes = CORE_DOCUMENT_TYPES.filter((type) => {
    const sides = getUploadSlotsForType(type);
    const slots = sides.map((side) => getDocumentSlot(documents, { type, side }));

    if (slots.every((slot) => slot?.status === DocumentStatus.APPROVED)) {
      return false;
    }

    return slots.some((slot) =>
      slot
        ? slot.status === DocumentStatus.UPLOADED ||
          slot.status === DocumentStatus.AI_PROCESSING ||
          slot.status === DocumentStatus.PENDING_ADMIN_REVIEW
        : false
    );
  });

  const blockedByPendingReview =
    pendingTypes.length > 0 &&
    missingDocuments.length > 0 &&
    missingDocuments.every((type) => pendingTypes.includes(type));

  const instructorInitial = assignedInstructor
    ? assignedInstructor.firstName.charAt(0).toUpperCase()
    : null;

  return (
    <div className="dashboard-grid">
      {/* ── Abbonamento ─────────────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Abbonamento</p>
          <h3 className="panel-title">Stato abbonamento</h3>
        </div>

        {subscription ? (
          <>
            <div className="stat-row">
              <span className="stat-value-large">{tierLabel(subscription.tier)}</span>
              <span className={`status-badge ${subscriptionActive ? "ok" : "missing"}`}>
                {subscriptionActive ? "Attivo" : "Scaduto"}
              </span>
            </div>

            <div className="stat-meta-list">
              <div className="stat-meta-row">
                <span className="stat-meta-label">Inizio</span>
                <span className="stat-meta-value">
                  {new Date(subscription.startsAt).toLocaleDateString("it-IT")}
                </span>
              </div>
              <div className="stat-meta-row">
                <span className="stat-meta-label">Scadenza</span>
                <span className="stat-meta-value">
                  {new Date(subscription.endsAt).toLocaleDateString("it-IT")}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="subtitle">Nessun abbonamento assegnato.</p>
        )}
      </section>

      {/* ── Istruttore ──────────────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Istruttore</p>
          <h3 className="panel-title">Supporto assegnato</h3>
        </div>

        {assignedInstructor ? (
          <div className="user-card">
            <span className="user-avatar">{instructorInitial}</span>
            <div className="user-card-info">
              <span className="user-card-name">
                {`${assignedInstructor.firstName} ${assignedInstructor.lastName}`}
              </span>
              <span className="user-card-meta">{assignedInstructor.email}</span>
            </div>
          </div>
        ) : (
          <div className="empty-state">Nessun istruttore assegnato.</div>
        )}
      </section>

      {/* ── Codice accesso o blocco ──────────────────────────────── */}
      {canEnterGym ? (
        <>
          <MaskedAccessCode code={accessCode} title="Codice ingresso iscritto" />

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
        </>
      ) : (
        <section className="panel panel-full">
          <div>
            <p className="panel-kicker">Ingresso palestra</p>
            <h3 className="panel-title">Codice non disponibile</h3>
          </div>
          <p className="subtitle">
            {!subscriptionActive
              ? "Il codice di accesso viene mostrato solo con abbonamento attivo."
              : blockedByPendingReview
              ? `Documenti in verifica: ${pendingTypes.map((type) => documentTypeLabel(type)).join(", ")}.`
              : `Accesso bloccato: mancano ${missingDocuments
                  .map((type) => documentTypeLabel(type))
                  .join(", ")}.`}
          </p>
        </section>
      )}

      {/* ── Piano allenamento ───────────────────────────────────── */}
      <WeeklyPlanForm action={saveWorkoutPlanAction} plan={workoutPlan} />
    </div>
  );
}
