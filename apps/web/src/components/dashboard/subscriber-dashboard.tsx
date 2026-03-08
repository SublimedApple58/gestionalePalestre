import {
  Calendar,
  DoorOpen,
  ShieldCheck,
  Star,
  UserCheck,
  type LucideIcon
} from "lucide-react";
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
import { UserAvatar } from "../ui/user-avatar";
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
  instructorPhotoUrl?: string | null;
  documents: UserDocument[];
};

export function SubscriberDashboard({
  accessCode,
  workoutPlan,
  subscription,
  assignedInstructor,
  instructorPhotoUrl,
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

  return (
    <div className="dash-content">
      {/* ── Quick stats row ───────────────────────────────────────── */}
      <div className="dash-stats-row">
        <QuickStat
          icon={Star}
          label="Abbonamento"
          value={subscription ? tierLabel(subscription.tier) : "—"}
          badge={
            subscription
              ? { text: subscriptionActive ? "Attivo" : "Scaduto", variant: subscriptionActive ? "ok" : "missing" }
              : undefined
          }
        />
        <QuickStat
          icon={Calendar}
          label="Scadenza"
          value={
            subscription
              ? new Date(subscription.endsAt).toLocaleDateString("it-IT")
              : "—"
          }
        />
        <QuickStat
          icon={ShieldCheck}
          label="Documenti"
          badge={{ text: documentsReady ? "Completi" : `${missingDocuments.length} mancanti`, variant: documentsReady ? "ok" : "missing" }}
        />
      </div>

      <div className="dash-grid-2col">
        {/* ── Istruttore ──────────────────────────────────────────── */}
        <div className="dash-card">
          <div className="dash-card-header">
            <UserCheck size={14} className="dash-card-header-icon" />
            <div>
              <p className="dash-card-kicker">Istruttore</p>
              <h3 className="dash-card-title">Supporto assegnato</h3>
            </div>
          </div>

          {assignedInstructor ? (
            <div className="user-card">
              <UserAvatar
                firstName={assignedInstructor.firstName}
                profilePhotoUrl={instructorPhotoUrl}
              />
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
        </div>

        {/* ── Accesso ─────────────────────────────────────────────── */}
        {canEnterGym ? (
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
        ) : (
          <div className="dash-card dash-card-blocked">
            <div className="dash-card-header">
              <DoorOpen size={14} className="dash-card-header-icon" />
              <div>
                <p className="dash-card-kicker">Ingresso palestra</p>
                <h3 className="dash-card-title">Codice non disponibile</h3>
              </div>
            </div>
            <p className="dash-card-note">
              {!subscriptionActive
                ? "Il codice di accesso viene mostrato solo con abbonamento attivo."
                : blockedByPendingReview
                ? `Documenti in verifica: ${pendingTypes.map((type) => documentTypeLabel(type)).join(", ")}.`
                : `Accesso bloccato: mancano ${missingDocuments
                    .map((type) => documentTypeLabel(type))
                    .join(", ")}.`}
            </p>
          </div>
        )}
      </div>

      {/* ── Codice accesso ────────────────────────────────────────── */}
      {canEnterGym && (
        <MaskedAccessCode code={accessCode} title="Codice ingresso iscritto" />
      )}

      {/* ── Piano allenamento ────────────────────────────────────── */}
      <WeeklyPlanForm action={saveWorkoutPlanAction} plan={workoutPlan} />
    </div>
  );
}

/* ── Quick Stat mini card ──────────────────────────────────────────── */

type QuickStatProps = {
  icon: LucideIcon;
  label: string;
  value?: string;
  badge?: { text: string; variant: string };
};

function QuickStat({ icon: Icon, label, value, badge }: QuickStatProps) {
  return (
    <div className="dash-quick-stat">
      <div className="dash-quick-stat-icon-wrap">
        <Icon size={16} />
      </div>
      <div className="dash-quick-stat-content">
        <span className="dash-quick-stat-label">{label}</span>
        {value && <span className="dash-quick-stat-value">{value}</span>}
        {badge && (
          <span className={`status-badge ${badge.variant}`}>{badge.text}</span>
        )}
      </div>
    </div>
  );
}
