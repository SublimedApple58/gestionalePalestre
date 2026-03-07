"use client";

import { useMemo, useState } from "react";
import { Pencil, Search, UserPlus, X } from "lucide-react";
import { SubscriptionTier, UserRole, type UserDocument } from "@gestionale/db";

import { createUserByAdminAction } from "@/app/actions/dashboard-actions";
import { documentTypeLabel, getMissingDocumentTypes, getMissingOverallDocumentTypes } from "@/lib/documents";
import { roleLabel } from "@/lib/roles";
import { tierLabel } from "@/lib/subscription";
import { CustomSelect } from "@/components/ui/custom-select";
import { UserEditDrawer, type DrawerUserRow } from "./user-edit-drawer";

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  accessCode: string;
  address: string | null;
  assignedInstructorId: string | null;
  documents: UserDocument[];
  assignedInstructor: { firstName: string; lastName: string } | null;
  subscription: { tier: SubscriptionTier; startsAt: Date; endsAt: Date } | null;
};

type UserManagementProps = {
  users: UserRow[];
};

const ROLE_OPTIONS = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.INSTRUCTOR, label: "Istruttore" },
  { value: UserRole.SUBSCRIBER, label: "Iscritto" }
];

export function UserManagement({ users }: UserManagementProps) {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DrawerUserRow | null>(null);

  const instructors = users.filter((u) => u.role === UserRole.INSTRUCTOR);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        roleLabel(u.role).toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="dashboard-grid">

      {/* ── Lista utenti ─────────────────────────────────────────── */}
      <section className="panel panel-full">
        {/* Toolbar: search + add CTA */}
        <div className="user-management-toolbar">
          <div className="user-search-wrap">
            <Search size={15} className="user-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="user-search-input"
              placeholder="Cerca per nome, email o ruolo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cerca utente"
            />
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus size={16} aria-hidden="true" />
            Aggiungi utente
          </button>
        </div>

        {/* User table */}
        <div className="table-wrapper responsive-table">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Indirizzo</th>
                <th>Ruolo</th>
                <th>Istruttore</th>
                <th>Abbonamento</th>
                <th>Documenti</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">Nessun utente trovato.</div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const missingRequired = getMissingDocumentTypes(user.role, user.documents);
                  const missingOverall = getMissingOverallDocumentTypes(user.documents);

                  return (
                    <tr key={user.id}>
                      <td data-label="Nome">
                        <div className="user-cell">
                          <span className="user-avatar user-avatar-sm">
                            {user.firstName.charAt(0).toUpperCase()}
                          </span>
                          <span>{`${user.firstName} ${user.lastName}`}</span>
                        </div>
                      </td>

                      <td data-label="Email">{user.email}</td>

                      <td data-label="Indirizzo">
                        {user.address ?? "—"}
                      </td>

                      <td data-label="Ruolo">{roleLabel(user.role)}</td>

                      <td data-label="Istruttore">
                        {user.assignedInstructor
                          ? `${user.assignedInstructor.firstName} ${user.assignedInstructor.lastName}`
                          : "—"}
                      </td>

                      <td data-label="Abbonamento">
                        {user.subscription
                          ? `${tierLabel(user.subscription.tier)} · scade ${new Date(
                              user.subscription.endsAt
                            ).toLocaleDateString("it-IT")}`
                          : "—"}
                      </td>

                      <td data-label="Documenti">
                        {missingOverall.length > 0 ? (
                          <span
                            className={`status-badge ${
                              user.role === UserRole.SUBSCRIBER ? "missing" : "warning"
                            }`}
                          >
                            {`Mancano: ${missingOverall
                              .map((t) => documentTypeLabel(t))
                              .join(", ")}${
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
                        <button
                          type="button"
                          className="button button-ghost small"
                          onClick={() => setSelectedUser(user)}
                          aria-label={`Modifica ${user.firstName} ${user.lastName}`}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Modifica
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Drawer modifica utente ───────────────────────────────── */}
      {selectedUser && (
        <UserEditDrawer
          key={selectedUser.id}
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          instructors={instructors.map((i) => ({
            id: i.id,
            firstName: i.firstName,
            lastName: i.lastName,
            email: i.email
          }))}
        />
      )}

      {/* ── Modale aggiungi utente ───────────────────────────────── */}
      {showAddModal && (
        <div
          className="add-user-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Aggiungi nuovo utente"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div className="add-user-modal">
            <div className="add-user-modal-header">
              <div>
                <p className="panel-kicker">Nuovo account</p>
                <h3 className="panel-title">Aggiungi utente</h3>
              </div>
              <button
                type="button"
                className="button button-ghost add-user-close-btn"
                onClick={() => setShowAddModal(false)}
                aria-label="Chiudi"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <form action={createUserByAdminAction} className="grid-form compact">
              <label className="input-group">
                <span>Nome</span>
                <input name="firstName" required autoComplete="off" />
              </label>

              <label className="input-group">
                <span>Cognome</span>
                <input name="lastName" required autoComplete="off" />
              </label>

              <label className="input-group">
                <span>Email</span>
                <input type="email" name="email" required autoComplete="off" />
              </label>

              <label className="input-group">
                <span>Password</span>
                <input type="password" name="password" required minLength={8} />
              </label>

              <CustomSelect
                name="role"
                label="Ruolo"
                options={ROLE_OPTIONS}
                defaultValue={UserRole.SUBSCRIBER}
                required
              />

              <div className="add-user-modal-actions">
                <button type="submit" className="button button-primary">
                  Crea account
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setShowAddModal(false)}
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
