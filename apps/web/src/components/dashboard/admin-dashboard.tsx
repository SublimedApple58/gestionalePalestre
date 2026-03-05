import {
  DocumentType,
  SubscriptionTier,
  UserRole,
  type AccessEventType,
  type UserDocument
} from "@gestionale/db";

import {
  assignInstructorAction,
  assignSubscriptionAction,
  changeUserRoleAction,
  createUserByAdminAction,
  deleteUserAction,
  openGymDoorAction
} from "@/app/actions/dashboard-actions";
import { documentTypeLabel, getMissingDocumentTypes, getMissingOverallDocumentTypes } from "@/lib/documents";
import { roleLabel } from "@/lib/roles";
import { tierLabel } from "@/lib/subscription";

import { DocumentReviewTable } from "./document-review-table";
import { CustomCalendar } from "../ui/custom-calendar";
import { CustomSelect } from "../ui/custom-select";
import { MaskedAccessCode } from "../ui/masked-access-code";

type AdminUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  accessCode: string;
  documents: UserDocument[];
  assignedInstructor: {
    firstName: string;
    lastName: string;
  } | null;
  subscription: {
    tier: SubscriptionTier;
    startsAt: Date;
    endsAt: Date;
  } | null;
};

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
  users: AdminUserRow[];
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
};

export function AdminDashboard({ currentUser, users, accessLogs, reviewDocuments }: AdminDashboardProps) {
  const instructors = users.filter((user) => user.role === UserRole.INSTRUCTOR);
  const subscribers = users.filter((user) => user.role === UserRole.SUBSCRIBER);

  const roleOptions = [
    { value: UserRole.ADMIN, label: "Admin" },
    { value: UserRole.INSTRUCTOR, label: "Istruttore" },
    { value: UserRole.SUBSCRIBER, label: "Iscritto" }
  ];

  const subscriptionOptions = [
    { value: SubscriptionTier.MONTHLY, label: "Mensile" },
    { value: SubscriptionTier.QUARTERLY, label: "Trimestrale" },
    { value: SubscriptionTier.YEARLY, label: "Annuale" }
  ];

  const subscriberOptions = subscribers.map((subscriber) => ({
    value: subscriber.id,
    label: `${subscriber.firstName} ${subscriber.lastName}`,
    details: subscriber.email
  }));

  const instructorOptions = instructors.map((instructor) => ({
    value: instructor.id,
    label: `${instructor.firstName} ${instructor.lastName}`,
    details: instructor.email
  }));

  const subscriberIds = new Set(subscribers.map((subscriber) => subscriber.id));

  const pendingMedicalSubscribersMap = new Map<
    string,
    {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      uploadedAt: Date;
    }
  >();

  for (const document of reviewDocuments) {
    if (document.type !== DocumentType.MEDICAL_CERTIFICATE) continue;
    if (!subscriberIds.has(document.user.id)) continue;
    if (pendingMedicalSubscribersMap.has(document.user.id)) continue;

    pendingMedicalSubscribersMap.set(document.user.id, {
      id: document.user.id,
      firstName: document.user.firstName,
      lastName: document.user.lastName,
      email: document.user.email,
      uploadedAt: document.uploadedAt
    });
  }

  const pendingMedicalSubscribers = Array.from(pendingMedicalSubscribersMap.values());

  return (
    <div className="dashboard-grid">
      {/* ── Codice admin ─────────────────────────────────────────── */}
      <MaskedAccessCode code={currentUser.accessCode} title="Codice personale admin" />

      {/* ── Porta palestra ───────────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Ingresso</p>
          <h3 className="panel-title">Controllo porta palestra</h3>
        </div>
        <form action={openGymDoorAction}>
          <button type="submit" className="button button-primary">
            Apri porta palestra
          </button>
        </form>
      </section>

      {/* ── Validazioni mediche ──────────────────────────────────── */}
      <section className="panel panel-full">
        <div>
          <p className="panel-kicker">Validazioni mediche</p>
          <h3 className="panel-title">Iscritti in attesa di revisione certificato</h3>
        </div>

        {pendingMedicalSubscribers.length === 0 ? (
          <div className="empty-state">Nessun iscritto in attesa di revisione medico.</div>
        ) : (
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
        )}
      </section>

      {/* ── Aggiungi utente ──────────────────────────────────────── */}
      <section className="panel panel-full">
        <div>
          <p className="panel-kicker">Utenti</p>
          <h3 className="panel-title">Aggiungi utente</h3>
        </div>

        <form action={createUserByAdminAction} className="grid-form compact">
          <label className="input-group">
            <span>Nome</span>
            <input name="firstName" required />
          </label>

          <label className="input-group">
            <span>Cognome</span>
            <input name="lastName" required />
          </label>

          <label className="input-group">
            <span>Email</span>
            <input type="email" name="email" required />
          </label>

          <label className="input-group">
            <span>Password</span>
            <input type="password" name="password" required minLength={8} />
          </label>

          <CustomSelect name="role" label="Ruolo" options={roleOptions} defaultValue={UserRole.SUBSCRIBER} required />

          <button type="submit" className="button button-primary">
            Crea account
          </button>
        </form>
      </section>

      {/* ── Lista utenti ─────────────────────────────────────────── */}
      <section className="panel panel-full">
        <div>
          <p className="panel-kicker">Gestione ruoli</p>
          <h3 className="panel-title">Lista utenti</h3>
        </div>

        <div className="table-wrapper responsive-table">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Istruttore</th>
                <th>Abbonamento</th>
                <th>Documenti</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const missingRequired = getMissingDocumentTypes(user.role, user.documents);
                const missingOverall = getMissingOverallDocumentTypes(user.documents);

                return (
                  <tr key={user.id}>
                    <td data-label="Nome">{`${user.firstName} ${user.lastName}`}</td>
                    <td data-label="Email">{user.email}</td>
                    <td data-label="Ruolo">{roleLabel(user.role)}</td>
                    <td data-label="Istruttore">
                      {user.assignedInstructor
                        ? `${user.assignedInstructor.firstName} ${user.assignedInstructor.lastName}`
                        : "—"}
                    </td>
                    <td data-label="Abbonamento">
                      {user.subscription
                        ? `${tierLabel(user.subscription.tier)} (${new Date(user.subscription.endsAt).toLocaleDateString("it-IT")})`
                        : "—"}
                    </td>
                    <td data-label="Documenti">
                      {missingOverall.length > 0 ? (
                        <span className={`status-badge ${user.role === UserRole.SUBSCRIBER ? "missing" : "warning"}`}>
                          {`Mancano: ${missingOverall.map((type) => documentTypeLabel(type)).join(", ")}${
                            user.role === UserRole.SUBSCRIBER && missingRequired.length > 0
                              ? " (bloccante)"
                              : " (non bloccante)"
                          }`}
                        </span>
                      ) : (
                        <span className="status-badge ok">Completi</span>
                      )}
                    </td>
                    <td data-label="Azioni" className="td-actions">
                      <div className="row-actions">
                        <form action={changeUserRoleAction} className="inline-form">
                          <input type="hidden" name="targetUserId" value={user.id} />
                          <CustomSelect
                            name="role"
                            label={`Ruolo per ${user.firstName} ${user.lastName}`}
                            options={roleOptions}
                            defaultValue={user.role}
                            compact
                            hideLabel
                            required
                          />
                          <button type="submit" className="button button-ghost small">
                            Salva ruolo
                          </button>
                        </form>

                        <form action={deleteUserAction}>
                          <input type="hidden" name="targetUserId" value={user.id} />
                          <button type="submit" className="button button-danger small">
                            Rimuovi
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Assegna abbonamento ──────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Abbonamenti</p>
          <h3 className="panel-title">Assegna piano</h3>
        </div>

        <form action={assignSubscriptionAction} className="grid-form compact">
          <CustomSelect
            name="targetUserId"
            label="Iscritto"
            options={subscriberOptions}
            placeholder="Cerca iscritto"
            searchable
            required
          />

          <CustomSelect
            name="tier"
            label="Piano"
            options={subscriptionOptions}
            defaultValue={SubscriptionTier.MONTHLY}
            required
          />

          <CustomCalendar name="startsAt" label="Data inizio" />

          <button type="submit" className="button button-primary">
            Assegna abbonamento
          </button>
        </form>
      </section>

      {/* ── Assegna istruttore ───────────────────────────────────── */}
      <section className="panel">
        <div>
          <p className="panel-kicker">Istruttori</p>
          <h3 className="panel-title">Assegna istruttore</h3>
        </div>

        <form action={assignInstructorAction} className="grid-form compact">
          <CustomSelect
            name="subscriberId"
            label="Iscritto"
            options={subscriberOptions}
            placeholder="Cerca iscritto"
            searchable
            required
          />

          <CustomSelect
            name="instructorId"
            label="Istruttore"
            options={instructorOptions}
            placeholder="Cerca istruttore"
            searchable
            required
          />

          <button type="submit" className="button button-primary">
            Assegna istruttore
          </button>
        </form>
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
                {log.note ? <small style={{ color: "var(--text-muted)", fontSize: "12px" }}>{log.note}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Revisione documenti ──────────────────────────────────── */}
      <DocumentReviewTable documents={reviewDocuments} />
    </div>
  );
}
