"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Pencil, Search, UserPlus } from "lucide-react";
import { Modal, Button, Input, Typography, Space, Flex } from "antd";
import {
  SubscriptionTier,
  UserRole,
  type Installment,
  type InstallmentPlan,
  type Payment,
  type UserDocument
} from "@gestionale/db";

import { createUserByAdminAction } from "@/app/actions/dashboard-actions";
import { getMissingDocumentTypes, getMissingOverallDocumentTypes } from "@/lib/documents";
import { roleLabel } from "@/lib/roles";
import { isSubscriptionActive, tierLabel } from "@/lib/subscription";
import { CustomSelect } from "@/components/ui/custom-select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserEditDrawer, type DrawerUserRow } from "./user-edit-drawer";

const { Text } = Typography;

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  accessCode: string;
  address: string | null;
  createdAt: Date;
  associationMember: boolean;
  associationExpiresAt: Date | null;
  assignedInstructorId: string | null;
  documents: UserDocument[];
  assignedInstructor: { firstName: string; lastName: string } | null;
  subscription: {
    tier: SubscriptionTier;
    startsAt: Date;
    endsAt: Date;
    deactivatedAt: Date | null;
  } | null;
  payments: Payment[];
  installmentPlans: (InstallmentPlan & { installments: Installment[] })[];
};

type UserManagementProps = {
  users: UserRow[];
  errorMessage?: string | null;
  profilePhotoUrls?: Record<string, string>;
};

const ROLE_OPTIONS = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.INSTRUCTOR, label: "Istruttore" },
  { value: UserRole.SUBSCRIBER, label: "Iscritto" }
];

type SortMode = "alpha" | "registration";
type AssociationFilter = "all" | "member" | "non_member";
type SubscriptionFilter = "all" | "active" | "expired" | "none";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "Alfabetico" },
  { value: "registration", label: "Data iscrizione" }
];

const ASSOCIATION_OPTIONS: { value: AssociationFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "member", label: "Iscritti" },
  { value: "non_member", label: "Non iscritti" }
];

const SUBSCRIPTION_OPTIONS: { value: SubscriptionFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "active", label: "Attivi" },
  { value: "expired", label: "Scaduti" },
  { value: "none", label: "Senza" }
];

export function UserManagement({ users, errorMessage, profilePhotoUrls = {} }: UserManagementProps) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [associationFilter, setAssociationFilter] = useState<AssociationFilter>("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DrawerUserRow | null>(null);

  const drawerUserRef = useRef<DrawerUserRow | null>(null);
  if (selectedUser) drawerUserRef.current = selectedUser;

  const handleCloseDrawer = useCallback(() => setSelectedUser(null), []);

  const instructors = users.filter((u) => u.role === UserRole.INSTRUCTOR);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();

    let list = users.filter((u) => {
      if (associationFilter === "member" && !u.associationMember) return false;
      if (associationFilter === "non_member" && u.associationMember) return false;
      if (subscriptionFilter !== "all") {
        const active = isSubscriptionActive(u.subscription);
        if (subscriptionFilter === "active" && !active) return false;
        // "Scaduti" = ha un abbonamento ma non è attivo (scaduto o disattivato).
        if (subscriptionFilter === "expired" && (!u.subscription || active)) return false;
        if (subscriptionFilter === "none" && u.subscription) return false;
      }
      if (!q) return true;
      return (
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        roleLabel(u.role).toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sortMode === "registration") {
        // Più recenti prima (data di iscrizione = createdAt).
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // Alfabetico per cognome, poi nome.
      return (
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it", {
          sensitivity: "base"
        })
      );
    });

    return list;
  }, [users, search, sortMode, associationFilter, subscriptionFilter]);

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

        {/* Toolbar filtri */}
        <div className="utenti-filters">
          <div className="utenti-filter-group">
            <span className="utenti-filter-label">Ordina</span>
            <div className="seg" role="group" aria-label="Ordina utenti">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`seg-btn ${sortMode === opt.value ? "active" : ""}`}
                  aria-pressed={sortMode === opt.value}
                  onClick={() => setSortMode(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="utenti-filter-group">
            <span className="utenti-filter-label">Associazione</span>
            <div className="seg" role="group" aria-label="Filtra per iscrizione associazione">
              {ASSOCIATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`seg-btn ${associationFilter === opt.value ? "active" : ""}`}
                  aria-pressed={associationFilter === opt.value}
                  onClick={() => setAssociationFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="utenti-filter-group">
            <span className="utenti-filter-label">Abbonamento</span>
            <div className="seg" role="group" aria-label="Filtra per stato abbonamento">
              {SUBSCRIPTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`seg-btn ${subscriptionFilter === opt.value ? "active" : ""}`}
                  aria-pressed={subscriptionFilter === opt.value}
                  onClick={() => setSubscriptionFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

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
                            <UserAvatar
                              firstName={user.firstName}
                              profilePhotoUrl={profilePhotoUrls[user.id]}
                              size="sm"
                            />
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
                            (() => {
                              const sub = user.subscription;
                              const endStr = new Date(sub.endsAt).toLocaleDateString("it-IT");
                              const active = isSubscriptionActive(sub);
                              return (
                                <span className="td-subscription">
                                  <span className="td-subscription-tier">{tierLabel(sub.tier)}</span>
                                  {sub.deactivatedAt ? (
                                    <span className="td-subscription-status deactivated">Disattivato</span>
                                  ) : active ? (
                                    <span className="td-subscription-date">scade {endStr}</span>
                                  ) : (
                                    <span className="td-subscription-status expired">Scaduto il {endStr}</span>
                                  )}
                                </span>
                              );
                            })()
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
        </nav>

      </div>

      {/* ── Drawer modifica utente ────────────────────────────────────── */}
      {drawerUserRef.current && (
        <UserEditDrawer
          user={drawerUserRef.current}
          opened={!!selectedUser}
          onClose={handleCloseDrawer}
          instructors={instructors.map((i) => ({
            id: i.id,
            firstName: i.firstName,
            lastName: i.lastName,
            email: i.email
          }))}
          profilePhotoUrl={drawerUserRef.current ? profilePhotoUrls[drawerUserRef.current.id] : undefined}
        />
      )}

      {/* ── Modale aggiungi utente ─── */}
      <Modal
        open={showAddModal}
        onCancel={() => setShowAddModal(false)}
        footer={null}
        title={
          <div>
            <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "#f09ca3", display: "block" }}>
              Nuovo account
            </Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: "white" }}>
              Aggiungi utente
            </Text>
          </div>
        }
        centered
        width={480}
        className="dark-modal"
        style={{
          background:
            "radial-gradient(ellipse at 20% -10%, rgba(223,37,49,0.18), transparent 45%), radial-gradient(ellipse at 80% 110%, rgba(80,10,20,0.15), transparent 40%), linear-gradient(180deg, rgba(22,22,30,0.99), rgba(10,10,16,0.99))",
          border: "1px solid rgba(223,37,49,0.28)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06) inset, 0 24px 56px rgba(0,0,0,0.6)"
        }}
        styles={{
          header: {
            background: "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            paddingBottom: 16
          },
          body: {
            padding: "16px 24px 24px"
          }
        }}
      >
        <form action={createUserByAdminAction}>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Flex gap={12}>
              <div style={{ flex: 1 }}>
                <label className="antd-form-label">Nome</label>
                <Input
                  name="firstName"
                  required
                  autoComplete="off"
                  className="dark-input"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="antd-form-label">Cognome</label>
                <Input
                  name="lastName"
                  required
                  autoComplete="off"
                  className="dark-input"
                />
              </div>
            </Flex>
            <div>
              <label className="antd-form-label">Email</label>
              <Input
                name="email"
                type="email"
                required
                autoComplete="off"
                className="dark-input"
              />
            </div>
            <div>
              <label className="antd-form-label">Password</label>
              <Input.Password
                name="password"
                required
                minLength={8}
                className="dark-input"
              />
            </div>
            <CustomSelect
              name="role"
              label="Ruolo"
              options={ROLE_OPTIONS}
              defaultValue={UserRole.SUBSCRIBER}
              required
            />
            <Flex gap={12} style={{ marginTop: 8 }}>
              <Button type="primary" htmlType="submit" style={{ flex: 1 }}>
                Crea account
              </Button>
              <Button
                onClick={() => setShowAddModal(false)}
                style={{ flex: 1 }}
              >
                Annulla
              </Button>
            </Flex>
          </Space>
        </form>
      </Modal>
    </>
  );
}
