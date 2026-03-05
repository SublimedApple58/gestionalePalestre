import {
  UserRole,
  type AccessEventType,
  type UserDocument
} from "@gestionale/db";

import { openGymDoorAction } from "@/app/actions/dashboard-actions";
import { roleLabel } from "@/lib/roles";

import { DocumentReviewTable } from "./document-review-table";
import { MaskedAccessCode } from "../ui/masked-access-code";

type AccessLogRow = {
  id: string;
  eventType: AccessEventType;
  note: string | null;
  occurredAt: Date;
  user: {
    firstName: string;
    lastName: string;
    role: UserRole;
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
  pendingMedicalSubscribers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    uploadedAt: Date;
  }>;
};

export function AdminDashboard({
  currentUser,
  accessLogs,
  reviewDocuments,
  pendingMedicalSubscribers
}: AdminDashboardProps) {
  const totalPending = reviewDocuments.length + pendingMedicalSubscribers.length;

  return (
    <div className="dashboard-grid">

      {/* ── Codice admin ─────────────────────────────────────────── */}
      <MaskedAccessCode code={currentUser.accessCode} title="Codice personale admin" />

      {/* ── Porta palestra ───────────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Ingresso</p>
          <h3 className="panel-title">Controllo porta</h3>
        </div>
        <form action={openGymDoorAction}>
          <button type="submit" className="button button-primary">
            Apri porta palestra
          </button>
        </form>
      </section>

      {/* ── Approvazioni in sospeso ───────────────────────────────── */}
      <section className="panel panel-full admin-approvals">
        <div className="admin-approvals-header">
          <div>
            <p className="panel-kicker">Richiede attenzione</p>
            <h3 className="panel-title">
              Approvazioni in sospeso
              {totalPending > 0 && (
                <span className="approval-badge">{totalPending}</span>
              )}
            </h3>
          </div>
        </div>

        {/* Certificati medici da validare */}
        {pendingMedicalSubscribers.length > 0 && (
          <div className="approval-subsection">
            <p className="approval-subsection-label">Certificati medici — revisione manuale</p>
            <ul className="pending-medical-list">
              {pendingMedicalSubscribers.map((subscriber) => (
                <li key={subscriber.id}>
                  <span className="user-avatar">
                    {subscriber.firstName.charAt(0).toUpperCase()}
                  </span>
                  <div className="pending-medical-info">
                    <strong>{`${subscriber.firstName} ${subscriber.lastName}`}</strong>
                    <p>{subscriber.email}</p>
                    <small>{`Caricato il ${new Date(subscriber.uploadedAt).toLocaleString("it-IT")}`}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Documenti in attesa di revisione */}
        <div className="approval-subsection">
          <p className="approval-subsection-label">Documenti — in attesa di validazione</p>
          {reviewDocuments.length === 0 ? (
            <div className="empty-state">Nessun documento in coda.</div>
          ) : (
            <DocumentReviewTable documents={reviewDocuments} embedded />
          )}
        </div>
      </section>

      {/* ── Storico accessi ──────────────────────────────────────── */}
      <section className="panel panel-full">
        <div>
          <p className="panel-kicker">Ingressi</p>
          <h3 className="panel-title">Storico accessi recenti</h3>
        </div>

        {accessLogs.length === 0 ? (
          <div className="empty-state">Nessun ingresso registrato.</div>
        ) : (
          <ul className="event-list">
            {accessLogs.map((log) => (
              <li key={log.id}>
                <strong>{`${log.user.firstName} ${log.user.lastName}`}</strong>
                <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                  {` · ${roleLabel(log.user.role)}`}
                </span>
                <p>{`${log.eventType === "DOOR_OPEN" ? "Apri porta" : "Simula ingresso"} — ${new Date(log.occurredAt).toLocaleString("it-IT")}`}</p>
                {log.note ? (
                  <small style={{ color: "var(--text-muted)", fontSize: "12px" }}>{log.note}</small>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  );
}
