"use client";

import { useMemo, useRef, useState } from "react";
import { Pencil, Search, UserPlus } from "lucide-react";
import { Modal, Button, TextInput, Text, Stack, Group } from "@mantine/core";
import { SubscriptionTier, UserRole, type UserDocument } from "@gestionale/db";

import { createUserByAdminAction } from "@/app/actions/dashboard-actions";
import { getMissingDocumentTypes, getMissingOverallDocumentTypes } from "@/lib/documents";
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
  errorMessage?: string | null;
};

const ROLE_OPTIONS = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.INSTRUCTOR, label: "Istruttore" },
  { value: UserRole.SUBSCRIBER, label: "Iscritto" }
];

export function UserManagement({ users, errorMessage }: UserManagementProps) {
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DrawerUserRow | null>(null);

  // Ref stabile per mantenere i dati dell'utente durante l'animazione di chiusura.
  // Mantine Drawer anima aperto→chiuso solo se il componente resta montato;
  // se React lo smonta, l'animazione non parte.
  const drawerUserRef = useRef<DrawerUserRow | null>(null);
  if (selectedUser) drawerUserRef.current = selectedUser;

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
    <>
      {/* ── Pagina utenti ─────────────────────────────────────────── */}
      <div className="utenti-page">

        {/* Header pagina */}
        <header className="utenti-header">
          <div className="utenti-header-title">
            <p className="panel-kicker">Gestione</p>
            <h1 className="utenti-title">Utenti</h1>
          </div>
          <div className="utenti-header-actions">
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
        </header>

        {/* Error banner */}
        {errorMessage && (
          <p className="error-banner utenti-error-banner">{errorMessage}</p>
        )}

        {/* Meta riga: conteggio utenti */}
        <div className="utenti-meta">
          <span className="utenti-meta-count">
            {filteredUsers.length === users.length
              ? `${users.length} utenti`
              : `${filteredUsers.length} di ${users.length} utenti`}
          </span>
        </div>

        {/* Tabella */}
        <div className="utenti-table-wrap">
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
                  <th></th>
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
                          {user.address ?? <span className="td-empty">—</span>}
                        </td>

                        <td data-label="Ruolo">
                          <span className="td-role-badge" data-role={user.role}>
                            {roleLabel(user.role)}
                          </span>
                        </td>

                        <td data-label="Istruttore">
                          {user.assignedInstructor
                            ? `${user.assignedInstructor.firstName} ${user.assignedInstructor.lastName}`
                            : <span className="td-empty">—</span>}
                        </td>

                        <td data-label="Abbonamento">
                          {user.subscription ? (
                            <span className="td-subscription">
                              <span className="td-subscription-tier">{tierLabel(user.subscription.tier)}</span>
                              <span className="td-subscription-date">
                                scade {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
                              </span>
                            </span>
                          ) : (
                            <span className="td-empty">—</span>
                          )}
                        </td>

                        <td data-label="Documenti">
                          {missingOverall.length === 0 ? (
                            <span className="status-badge ok">Completi</span>
                          ) : user.role === UserRole.SUBSCRIBER && missingRequired.length > 0 ? (
                            <span className="status-badge missing">Bloccante</span>
                          ) : (
                            <span className="status-badge warning">Incompleto</span>
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
        </div>

        {/* Paginazione — placeholder pronto per il futuro */}
        <nav className="utenti-pagination" aria-label="Navigazione pagine">
          <span className="utenti-pagination-info">
            {filteredUsers.length} {filteredUsers.length === 1 ? "risultato" : "risultati"}
          </span>
          {/* <Pagination totalPages={...} currentPage={...} /> */}
        </nav>

      </div>

      {/* ── Drawer modifica utente ────────────────────────────────────── */}
      {/* Sempre montato: Mantine anima solo se vede opened false→true.
          drawerUserRef mantiene i dati durante l'exit animation. */}
      {drawerUserRef.current && (
        <UserEditDrawer
          user={drawerUserRef.current}
          opened={!!selectedUser}
          onClose={() => setSelectedUser(null)}
          instructors={instructors.map((i) => ({
            id: i.id,
            firstName: i.firstName,
            lastName: i.lastName,
            email: i.email
          }))}
        />
      )}

      {/* ── Modale aggiungi utente (Mantine Modal — sempre montata) ─── */}
      <Modal
        opened={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={
          <div>
            <Text size="xs" tt="uppercase" lts="0.1em" fw={700} c="#f09ca3">
              Nuovo account
            </Text>
            <Text size="lg" fw={700} c="white">
              Aggiungi utente
            </Text>
          </div>
        }
        centered
        size="md"
        overlayProps={{ backgroundOpacity: 0.65, blur: 6 }}
        transitionProps={{
          transition: "pop",
          duration: 300,
          timingFunction: "cubic-bezier(0.34, 1.4, 0.64, 1)"
        }}
        styles={{
          content: {
            background:
              "radial-gradient(ellipse at 20% -10%, rgba(223,37,49,0.18), transparent 45%), radial-gradient(ellipse at 80% 110%, rgba(80,10,20,0.15), transparent 40%), linear-gradient(180deg, rgba(22,22,30,0.99), rgba(10,10,16,0.99))",
            border: "1px solid rgba(223,37,49,0.28)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 56px rgba(0,0,0,0.6)"
          },
          header: {
            background: "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            paddingBottom: 16
          },
          close: {
            color: "rgba(255,255,255,0.5)"
          }
        }}
      >
        <form action={createUserByAdminAction}>
          <Stack gap="sm" mt="md">
            <Group grow>
              <TextInput
                name="firstName"
                label="Nome"
                required
                autoComplete="off"
                classNames={{ input: "mantine-drawer-input" }}
              />
              <TextInput
                name="lastName"
                label="Cognome"
                required
                autoComplete="off"
                classNames={{ input: "mantine-drawer-input" }}
              />
            </Group>
            <TextInput
              name="email"
              type="email"
              label="Email"
              required
              autoComplete="off"
              classNames={{ input: "mantine-drawer-input" }}
            />
            <TextInput
              name="password"
              type="password"
              label="Password"
              required
              minLength={8}
              classNames={{ input: "mantine-drawer-input" }}
            />
            <CustomSelect
              name="role"
              label="Ruolo"
              options={ROLE_OPTIONS}
              defaultValue={UserRole.SUBSCRIBER}
              required
            />
            <Group mt="sm" gap="sm">
              <Button type="submit" color="brand" flex={1}>
                Crea account
              </Button>
              <Button
                variant="subtle"
                color="gray"
                flex={1}
                onClick={() => setShowAddModal(false)}
              >
                Annulla
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
