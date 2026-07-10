import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Dumbbell,
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

import { saveWorkoutPlanAction } from "@/app/actions/dashboard-actions";
import {
  CORE_DOCUMENT_TYPES,
  documentTypeLabel,
  getDocumentSlot,
  getMissingDocumentTypes,
  getUploadSlotsForType,
  hasRequiredDocuments
} from "@/lib/documents";
import { isSubscriptionActive, subscriptionStatus, tierLabel } from "@/lib/subscription";

import { BirthdayCelebration } from "./birthday-celebration";
import { MaskedAccessCode } from "../ui/masked-access-code";
import { UserAvatar } from "../ui/user-avatar";
import { WeeklyPlanForm } from "../ui/weekly-plan-form";

type SubscriberDashboardProps = {
  accessCode: string;
  firstName: string;
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
  /** True se oggi è il compleanno dell'utente (match mese+giorno, non anno). */
  isBirthdayToday: boolean;
};

export function SubscriberDashboard({
  accessCode,
  firstName,
  workoutPlan,
  subscription,
  assignedInstructor,
  instructorPhotoUrl,
  documents,
  isBirthdayToday
}: SubscriberDashboardProps) {
  const subscriptionActive = isSubscriptionActive(subscription);
  const subStatus = subscriptionStatus(subscription);
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

  // Empty-state: subscriber senza abbonamento attivo (null o scaduto).
  // Saltiamo la dashboard "normale" e spingiamo diretto all'acquisto:
  // nessuna card metrica vuota, niente noise — solo l'azione da fare.
  if (!subscriptionActive) {
    return (
      <div className="dash-content">
        {isBirthdayToday ? <BirthdayCelebration firstName={firstName} /> : null}

        <section className="sub-empty-hero">
          <div className="sub-empty-hero-icon" aria-hidden="true">
            <Dumbbell size={40} />
          </div>

          <h1 className="sub-empty-hero-title">
            {subStatus === "pending"
              ? "Abbonamento in arrivo"
              : subStatus === "deactivated"
              ? "Abbonamento disattivato"
              : subscription
              ? "Abbonamento scaduto"
              : "Nessun abbonamento attivo"}
          </h1>

          <p className="sub-empty-hero-sub">
            {subStatus === "pending" && subscription
              ? `Il tuo abbonamento ${tierLabel(subscription.tier)} parte il ${new Date(
                  subscription.startsAt
                ).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })}. Potrai accedere alla palestra da quel giorno.`
              : subStatus === "deactivated"
              ? "Il tuo abbonamento è stato disattivato. Contatta la reception per riattivarlo."
              : subscription
              ? `Il tuo abbonamento ${tierLabel(subscription.tier)} è scaduto il ${new Date(
                  subscription.endsAt
                ).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })}. Rinnovalo per tornare ad allenarti.`
              : "Attiva un piano per accedere alla palestra e alle tue schede di allenamento."}
          </p>

          {subStatus === "pending" || subStatus === "deactivated" ? null : (
            <>
              <Link href="/checkout" className="button button-primary sub-empty-hero-cta">
                {subscription ? "Rinnova ora" : "Scegli il piano"}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>

              <p className="sub-empty-hero-reassure">
                Da 70€/mese · Nessun rinnovo automatico · Pagamento sicuro
              </p>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="dash-content">
      {isBirthdayToday ? <BirthdayCelebration firstName={firstName} /> : null}

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
                <h3 className="dash-card-title">Accesso abilitato</h3>
              </div>
            </div>
            <p className="dash-card-note">
              Digita il tuo codice personale sul tastierino all&apos;ingresso della
              palestra per aprire la porta.
            </p>
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
