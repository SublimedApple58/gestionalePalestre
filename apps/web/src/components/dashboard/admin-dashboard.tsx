import {
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
};

export function AdminDashboard({ currentUser, users, accessLogs }: AdminDashboardProps) {
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

  return (
    <div className="dashboard-grid">
      <MaskedAccessCode code={currentUser.accessCode} title="Codice personale admin" />

      <section className="panel">
        <p className="panel-kicker">Ingresso</p>
        <h3 className="panel-title">Controllo porta palestra</h3>
        <form action={openGymDoorAction}>
          <button type="submit" className="button button-primary">
            Apri porta palestra
          </button>
        </form>
      </section>

      <section className="panel panel-full">
        <p className="panel-kicker">Utenti</p>
        <h3 className="panel-title">Aggiungi utente</h3>

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

      <section className="panel panel-full">
        <p className="panel-kicker">Gestione ruoli</p>
        <h3 className="panel-title">Lista utenti</h3>

        <div className="table-wrapper">
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
                    <td>{`${user.firstName} ${user.lastName}`}</td>
                    <td>{user.email}</td>
                    <td>{roleLabel(user.role)}</td>
                    <td>
                      {user.assignedInstructor
                        ? `${user.assignedInstructor.firstName} ${user.assignedInstructor.lastName}`
                        : "-"}
                    </td>
                    <td>
                      {user.subscription
                        ? `${tierLabel(user.subscription.tier)} (${new Date(user.subscription.endsAt).toLocaleDateString("it-IT")})`
                        : "-"}
                    </td>
                    <td>
                      {missingOverall.length > 0 ? (
                        <p className={`status-badge ${user.role === UserRole.SUBSCRIBER ? "missing" : "warning"}`}>
                          {`Mancano: ${missingOverall.map((type) => documentTypeLabel(type)).join(", ")}${
                            user.role === UserRole.SUBSCRIBER && missingRequired.length > 0
                              ? " (bloccante)"
                              : " (non bloccante)"
                          }`}
                        </p>
                      ) : (
                        <p className="status-badge ok">Tutti i documenti presenti</p>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <form action={changeUserRoleAction} className="inline-form">
                          <input type="hidden" name="targetUserId" value={user.id} />
                          <select name="role" defaultValue={user.role}>
                            <option value={UserRole.ADMIN}>Admin</option>
                            <option value={UserRole.INSTRUCTOR}>Istruttore</option>
                            <option value={UserRole.SUBSCRIBER}>Iscritto</option>
                          </select>
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

      <section className="panel">
        <p className="panel-kicker">Abbonamenti</p>
        <h3 className="panel-title">Assegna piano</h3>

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

      <section className="panel">
        <p className="panel-kicker">Istruttori</p>
        <h3 className="panel-title">Assegna istruttore</h3>

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

      <section className="panel panel-full">
        <p className="panel-kicker">Ingressi</p>
        <h3 className="panel-title">Storico accessi (mock)</h3>

        <ul className="event-list">
          {accessLogs.length === 0 ? (
            <li>Nessun ingresso registrato.</li>
          ) : (
            accessLogs.map((log) => (
              <li key={log.id}>
                <strong>{`${log.user.firstName} ${log.user.lastName}`}</strong>
                <span>{` (${roleLabel(log.user.role)})`}</span>
                <p>{`${log.eventType === "DOOR_OPEN" ? "Apri porta" : "Simula ingresso"} - ${new Date(log.occurredAt).toLocaleString("it-IT")}`}</p>
                {log.note ? <small>{log.note}</small> : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
