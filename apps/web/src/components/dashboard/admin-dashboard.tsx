import { SubscriptionTier, UserRole, type AccessEventType } from "@gestionale/db";

import {
  assignInstructorAction,
  assignSubscriptionAction,
  changeUserRoleAction,
  createUserByAdminAction,
  deleteUserAction,
  openGymDoorAction
} from "@/app/actions/dashboard-actions";
import { roleLabel } from "@/lib/roles";
import { tierLabel } from "@/lib/subscription";

import { MaskedAccessCode } from "../ui/masked-access-code";

type AdminUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  accessCode: string;
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

          <label className="input-group">
            <span>Ruolo</span>
            <select name="role" defaultValue={UserRole.SUBSCRIBER}>
              <option value={UserRole.ADMIN}>Admin</option>
              <option value={UserRole.INSTRUCTOR}>Istruttore</option>
              <option value={UserRole.SUBSCRIBER}>Abbonato</option>
            </select>
          </label>

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
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
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
                    <div className="row-actions">
                      <form action={changeUserRoleAction} className="inline-form">
                        <input type="hidden" name="targetUserId" value={user.id} />
                        <select name="role" defaultValue={user.role}>
                          <option value={UserRole.ADMIN}>Admin</option>
                          <option value={UserRole.INSTRUCTOR}>Istruttore</option>
                          <option value={UserRole.SUBSCRIBER}>Abbonato</option>
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <p className="panel-kicker">Abbonamenti</p>
        <h3 className="panel-title">Assegna piano</h3>

        <form action={assignSubscriptionAction} className="grid-form compact">
          <label className="input-group">
            <span>Abbonato</span>
            <select name="targetUserId" required>
              {subscribers.map((subscriber) => (
                <option key={subscriber.id} value={subscriber.id}>{`${subscriber.firstName} ${subscriber.lastName}`}</option>
              ))}
            </select>
          </label>

          <label className="input-group">
            <span>Piano</span>
            <select name="tier" defaultValue={SubscriptionTier.MONTHLY}>
              <option value={SubscriptionTier.MONTHLY}>Mensile</option>
              <option value={SubscriptionTier.QUARTERLY}>Trimestrale</option>
              <option value={SubscriptionTier.YEARLY}>Annuale</option>
            </select>
          </label>

          <label className="input-group">
            <span>Data inizio</span>
            <input type="date" name="startsAt" />
          </label>

          <button type="submit" className="button button-primary">
            Assegna abbonamento
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="panel-kicker">Istruttori</p>
        <h3 className="panel-title">Assegna istruttore</h3>

        <form action={assignInstructorAction} className="grid-form compact">
          <label className="input-group">
            <span>Abbonato</span>
            <select name="subscriberId" required>
              {subscribers.map((subscriber) => (
                <option key={subscriber.id} value={subscriber.id}>{`${subscriber.firstName} ${subscriber.lastName}`}</option>
              ))}
            </select>
          </label>

          <label className="input-group">
            <span>Istruttore</span>
            <select name="instructorId" required>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>{`${instructor.firstName} ${instructor.lastName}`}</option>
              ))}
            </select>
          </label>

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
