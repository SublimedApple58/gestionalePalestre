import {
  ClipboardList,
  DoorOpen,
  FileCheck,
  History
} from "lucide-react";
import {
  type UserRole,
  type AccessEventType,
  type UserDocument,
  type InstallmentStatus
} from "@gestionale/db";

import { openGymDoorAction } from "@/app/actions/dashboard-actions";
import { roleLabel } from "@/lib/roles";

import { AssociationExpiringSection, type ExpiringAssociationRow } from "./association-expiring-section";
import { BirthdayBanner } from "./birthday-banner";
import { DocumentReviewTable } from "./document-review-table";
import { OverdueInstallmentsSection } from "./overdue-installments-section";
import { MaskedAccessCode } from "../ui/masked-access-code";
import { UserAvatar } from "../ui/user-avatar";

type AccessLogRow = {
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

export type OverdueInstallmentRow = {
  id: string;
  sequenceNumber: number;
  dueAt: Date;
  amountCents: number;
  status: InstallmentStatus;
  failureReason: string | null;
  plan: {
    id: string;
    installmentsCount: number;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
};

type AdminDashboardProps = {
  currentUser: {
    id: string;
    accessCode: string;
  };
  accessLogs: AccessLogRow[];
  reviewDocuments: Array<
    UserDocument & {
      user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
      previewUrl: string | null;
    }
  >;
  profilePhotoUrls?: Record<string, string>;
  overdueInstallments?: OverdueInstallmentRow[];
  expiringAssociations?: ExpiringAssociationRow[];
};

export function AdminDashboard({
  currentUser,
  accessLogs,
  reviewDocuments,
  profilePhotoUrls = {},
  overdueInstallments = [],
  expiringAssociations = []
}: AdminDashboardProps) {
  const totalPending = reviewDocuments.length;

  return (
    <div className="dash-content">
      {/* ── Banner compleanni (oggi + domani) ────────────────────── */}
      <BirthdayBanner />

      {/* ── Quick actions row ────────────────────────────────────── */}
      <div className="dash-grid-2col">
        {/* Codice admin */}
        <MaskedAccessCode code={currentUser.accessCode} title="Codice personale admin" />

        {/* Porta palestra */}
        <div className="dash-card dash-card-accent">
          <div className="dash-card-header">
            <DoorOpen size={14} className="dash-card-header-icon" />
            <div>
              <p className="dash-card-kicker">Ingresso</p>
              <h3 className="dash-card-title">Controllo porta</h3>
            </div>
          </div>
          <form action={openGymDoorAction}>
            <button type="submit" className="button button-primary" style={{ width: "100%" }}>
              Apri porta palestra
            </button>
          </form>
        </div>
      </div>

      {/* ── Rate in sofferenza ───────────────────────────────────── */}
      {overdueInstallments.length > 0 && (
        <OverdueInstallmentsSection installments={overdueInstallments} />
      )}

      {/* ── Associazioni sportive in scadenza ────────────────────── */}
      {expiringAssociations.length > 0 && (
        <AssociationExpiringSection items={expiringAssociations} />
      )}

      {/* ── Approvazioni in sospeso ─────────────────────────────── */}
      <div className="dash-card-full">
        <div className="dash-card-header">
          <ClipboardList size={14} className="dash-card-header-icon" />
          <div>
            <p className="dash-card-kicker">Richiede attenzione</p>
            <h3 className="dash-card-title">
              Approvazioni in sospeso
              {totalPending > 0 && (
                <span className="approval-badge">{totalPending}</span>
              )}
            </h3>
          </div>
        </div>

        {/* Documenti in attesa di revisione */}
        <div className="dash-subsection">
          <p className="dash-subsection-label">
            <FileCheck size={12} className="dash-subsection-icon" />
            Documenti — in attesa di validazione
          </p>
          {reviewDocuments.length === 0 ? (
            <div className="empty-state">Nessun documento in coda.</div>
          ) : (
            <DocumentReviewTable documents={reviewDocuments} embedded />
          )}
        </div>
      </div>

      {/* ── Storico accessi ──────────────────────────────────────── */}
      <div className="dash-card-full">
        <div className="dash-card-header">
          <History size={14} className="dash-card-header-icon" />
          <div>
            <p className="dash-card-kicker">Ingressi</p>
            <h3 className="dash-card-title">Storico accessi recenti</h3>
          </div>
        </div>

        {accessLogs.length === 0 ? (
          <div className="empty-state">Nessun ingresso registrato.</div>
        ) : (
          <ul className="dash-event-list">
            {accessLogs.map((log) => (
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
                    {`${ACCESS_EVENT_LABEL[log.eventType] ?? log.eventType} — ${new Date(log.occurredAt).toLocaleString("it-IT")}`}
                  </p>
                  {log.note && (
                    <p className="dash-event-note">{log.note}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
