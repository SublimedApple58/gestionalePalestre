import {
  ClipboardList,
  DoorOpen,
  FileCheck,
  History
} from "lucide-react";
import {
  type UserDocument,
  type InstallmentStatus
} from "@gestionale/db";

import { openGymDoorAction } from "@/app/actions/dashboard-actions";

import { AccessLogList, type AccessLogRow } from "./access-log-list";
import { AssociationExpiringSection, type ExpiringAssociationRow } from "./association-expiring-section";
import { BirthdayBanner } from "./birthday-banner";
import { CertificateExpiringSection, type ExpiringCertificateRow } from "./certificate-expiring-section";
import { DocumentReviewTable } from "./document-review-table";
import { OverdueInstallmentsSection } from "./overdue-installments-section";
import { RefreshAccessLogsButton } from "./refresh-access-logs-button";
import { MaskedAccessCode } from "../ui/masked-access-code";

/** Quanti elementi mostrare in anteprima nella home (il resto in "Vedi tutti"). */
const HOME_PREVIEW = 3;

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
  expiringCertificates?: ExpiringCertificateRow[];
};

export function AdminDashboard({
  currentUser,
  accessLogs,
  reviewDocuments,
  profilePhotoUrls = {},
  overdueInstallments = [],
  expiringAssociations = [],
  expiringCertificates = []
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
        <OverdueInstallmentsSection installments={overdueInstallments} limit={HOME_PREVIEW} href="/rate" />
      )}

      {/* ── Associazioni sportive in scadenza ────────────────────── */}
      {expiringAssociations.length > 0 && (
        <AssociationExpiringSection items={expiringAssociations} limit={HOME_PREVIEW} href="/associazioni" />
      )}

      {/* ── Certificati medici in scadenza ───────────────────────── */}
      {expiringCertificates.length > 0 && (
        <CertificateExpiringSection items={expiringCertificates} limit={HOME_PREVIEW} href="/certificati" />
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
            <DocumentReviewTable
              documents={reviewDocuments}
              embedded
              limit={HOME_PREVIEW}
              seeAllHref="/documenti"
            />
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
          <RefreshAccessLogsButton />
        </div>

        {accessLogs.length === 0 ? (
          <div className="empty-state">Nessun ingresso registrato.</div>
        ) : (
          <AccessLogList
            logs={accessLogs}
            profilePhotoUrls={profilePhotoUrls}
            limit={HOME_PREVIEW}
            href="/accessi"
          />
        )}
      </div>
    </div>
  );
}
