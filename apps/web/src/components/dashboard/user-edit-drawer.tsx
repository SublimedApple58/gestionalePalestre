"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  SubscriptionTier,
  UserRole,
  type UserDocument
} from "@gestionale/db";

import {
  assignInstructorAction,
  assignSubscriptionAction,
  changeUserRoleAction,
  deleteUserAction
} from "@/app/actions/dashboard-actions";
import { tierLabel } from "@/lib/subscription";
import { CustomCalendar } from "@/components/ui/custom-calendar";
import { CustomSelect } from "@/components/ui/custom-select";

export type DrawerUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  assignedInstructorId: string | null;
  assignedInstructor: { firstName: string; lastName: string } | null;
  documents: UserDocument[];
  subscription: { tier: SubscriptionTier; startsAt: Date; endsAt: Date } | null;
};

type UserEditDrawerProps = {
  user: DrawerUserRow | null;
  onClose: () => void;
  instructors: { id: string; firstName: string; lastName: string; email: string }[];
};

const ROLE_OPTIONS = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.INSTRUCTOR, label: "Istruttore" },
  { value: UserRole.SUBSCRIBER, label: "Iscritto" }
];

const SUBSCRIPTION_OPTIONS = [
  { value: SubscriptionTier.MONTHLY, label: "Mensile" },
  { value: SubscriptionTier.QUARTERLY, label: "Trimestrale" },
  { value: SubscriptionTier.YEARLY, label: "Annuale" }
];

const DOC_SLOTS: { type: DocumentType; side: DocumentSide; label: string }[] = [
  { type: DocumentType.TAX_CODE, side: DocumentSide.FRONT, label: "Tessera sanitaria · Fronte" },
  { type: DocumentType.TAX_CODE, side: DocumentSide.BACK, label: "Tessera sanitaria · Retro" },
  { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.FRONT, label: "Documento d'identità · Fronte" },
  { type: DocumentType.IDENTITY_DOCUMENT, side: DocumentSide.BACK, label: "Documento d'identità · Retro" },
  { type: DocumentType.MEDICAL_CERTIFICATE, side: DocumentSide.SINGLE, label: "Certificato medico" }
];

function DocStatusBadge({ status }: { status: DocumentStatus | undefined }) {
  if (!status) return <span className="status-badge missing">Non caricato</span>;
  switch (status) {
    case DocumentStatus.APPROVED:
      return <span className="status-badge ok">Approvato</span>;
    case DocumentStatus.PENDING:
      return <span className="status-badge warning">In revisione</span>;
    case DocumentStatus.REJECTED:
      return <span className="status-badge missing">Rifiutato</span>;
    case DocumentStatus.NEEDS_REUPLOAD:
      return <span className="status-badge missing">Da ricaricare</span>;
    default:
      return <span className="status-badge warning">{status}</span>;
  }
}

export function UserEditDrawer({ user, onClose, instructors }: UserEditDrawerProps) {
  useEffect(() => {
    if (!user) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [user, onClose]);

  if (!user) return null;

  const instructorOptions = instructors.map((i) => ({
    value: i.id,
    label: `${i.firstName} ${i.lastName}`,
    details: i.email
  }));

  return (
    <>
      {/* Overlay */}
      <div className="user-drawer-overlay" onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <aside
        className="user-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Modifica ${user.firstName} ${user.lastName}`}
      >
        {/* ── Header ────────────────────────────────────────────── */}
        <header className="user-drawer-header">
          <div className="user-drawer-user-info">
            <span className="user-avatar">{user.firstName.charAt(0).toUpperCase()}</span>
            <div className="user-drawer-user-text">
              <strong className="user-drawer-name">{`${user.firstName} ${user.lastName}`}</strong>
              <span className="user-drawer-email">{user.email}</span>
            </div>
          </div>
          <button
            type="button"
            className="button button-ghost user-drawer-close"
            onClick={onClose}
            aria-label="Chiudi"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="user-drawer-body">

          {/* ── Ruolo ─────────────────────────────────────────────── */}
          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Ruolo</h4>
            <form action={changeUserRoleAction} className="user-drawer-form">
              <input type="hidden" name="targetUserId" value={user.id} />
              <CustomSelect
                name="role"
                label="Ruolo"
                hideLabel
                options={ROLE_OPTIONS}
                defaultValue={user.role}
                required
              />
              <button type="submit" className="button button-primary small">
                Salva ruolo
              </button>
            </form>
          </section>

          {/* ── Istruttore (solo subscriber) ──────────────────────── */}
          {user.role === UserRole.SUBSCRIBER && instructors.length > 0 && (
            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Istruttore assegnato</h4>
              {user.assignedInstructor && (
                <p className="user-drawer-meta">
                  Attuale: {user.assignedInstructor.firstName} {user.assignedInstructor.lastName}
                </p>
              )}
              <form action={assignInstructorAction} className="user-drawer-form">
                <input type="hidden" name="subscriberId" value={user.id} />
                <CustomSelect
                  name="instructorId"
                  label="Istruttore"
                  hideLabel
                  options={instructorOptions}
                  defaultValue={user.assignedInstructorId ?? undefined}
                  placeholder="Cerca istruttore"
                  searchable
                  required
                />
                <button type="submit" className="button button-primary small">
                  Assegna
                </button>
              </form>
            </section>
          )}

          {/* ── Abbonamento (solo subscriber) ─────────────────────── */}
          {user.role === UserRole.SUBSCRIBER && (
            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Abbonamento</h4>
              {user.subscription ? (
                <div className="user-drawer-sub-current">
                  <span className="status-badge ok">{tierLabel(user.subscription.tier)}</span>
                  <span className="user-drawer-meta">
                    {new Date(user.subscription.startsAt).toLocaleDateString("it-IT")}
                    {" → "}
                    {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
                  </span>
                </div>
              ) : (
                <p className="user-drawer-meta">Nessun abbonamento attivo.</p>
              )}
              <form action={assignSubscriptionAction} className="user-drawer-form">
                <input type="hidden" name="targetUserId" value={user.id} />
                <CustomSelect
                  name="tier"
                  label="Piano"
                  hideLabel
                  options={SUBSCRIPTION_OPTIONS}
                  defaultValue={user.subscription?.tier ?? SubscriptionTier.MONTHLY}
                  required
                />
                <CustomCalendar name="startsAt" label="Data inizio" />
                <button type="submit" className="button button-primary small">
                  Aggiorna abbonamento
                </button>
              </form>
            </section>
          )}

          {/* ── Documenti ─────────────────────────────────────────── */}
          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Documenti</h4>
            <ul className="user-drawer-doc-list">
              {DOC_SLOTS.map((slot) => {
                const doc = user.documents.find(
                  (d) => d.type === slot.type && d.side === slot.side
                );
                return (
                  <li key={`${slot.type}-${slot.side}`} className="user-drawer-doc-row">
                    <span className="user-drawer-doc-label">{slot.label}</span>
                    <DocStatusBadge status={doc?.status} />
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ── Zona pericolosa ───────────────────────────────────── */}
          <section className="user-drawer-section user-drawer-section-danger">
            <h4 className="user-drawer-section-title">Zona pericolosa</h4>
            <form action={deleteUserAction}>
              <input type="hidden" name="targetUserId" value={user.id} />
              <button type="submit" className="button button-danger small">
                Elimina utente
              </button>
            </form>
          </section>

        </div>
      </aside>
    </>
  );
}
