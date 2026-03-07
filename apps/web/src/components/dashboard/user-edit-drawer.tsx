"use client";

import { useActionState, useEffect } from "react";
import { useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import {
  DocumentSide,
  DocumentStatus,
  DocumentType,
  SubscriptionTier,
  UserRole,
  type UserDocument
} from "@gestionale/db";

import {
  type ActionResult,
  assignInstructorActionState,
  assignSubscriptionActionState,
  changeUserRoleActionState,
  deleteUserActionState,
  updateUserAddressActionState
} from "@/app/actions/dashboard-actions";
import { useToast } from "@/components/ui/toast-provider";
import { tierLabel } from "@/lib/subscription";
import { CustomCalendar } from "@/components/ui/custom-calendar";
import { CustomSelect } from "@/components/ui/custom-select";

export type DrawerUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  address: string | null;
  assignedInstructorId: string | null;
  assignedInstructor: { firstName: string; lastName: string } | null;
  documents: UserDocument[];
  subscription: { tier: SubscriptionTier; startsAt: Date; endsAt: Date } | null;
};

type UserEditDrawerProps = {
  user: DrawerUserRow;
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
    case DocumentStatus.PENDING_ADMIN_REVIEW:
      return <span className="status-badge warning">In revisione</span>;
    case DocumentStatus.AI_PROCESSING:
      return <span className="status-badge warning">In elaborazione</span>;
    case DocumentStatus.UPLOADED:
      return <span className="status-badge warning">Caricato</span>;
    case DocumentStatus.REJECTED:
      return <span className="status-badge missing">Rifiutato</span>;
    case DocumentStatus.NEEDS_REUPLOAD:
      return <span className="status-badge missing">Da ricaricare</span>;
    default:
      return <span className="status-badge warning">{status}</span>;
  }
}

function OpenDocButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/view?documentId=${documentId}`);
      if (!res.ok) return;
      const { url } = await res.json() as { url: string };
      window.open(url, "_blank", "noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className="button button-ghost small"
      onClick={handleOpen}
      disabled={loading}
      aria-label="Apri documento"
    >
      {loading
        ? <Loader2 size={12} className="spin" aria-hidden="true" />
        : <ExternalLink size={12} aria-hidden="true" />}
      Apri
    </button>
  );
}

/** Mostra il risultato dell'action come toast e resetta lo state */
function useActionToast(result: ActionResult) {
  const { addToast } = useToast();
  useEffect(() => {
    if (!result) return;
    addToast(result.message, result.ok ? "success" : "error");
  }, [result, addToast]);
}

export function UserEditDrawer({ user, onClose, instructors }: UserEditDrawerProps) {
  const { addToast } = useToast();

  // ── Keyboard close ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Action states ───────────────────────────────────────────
  const [roleResult, roleAction, rolePending] = useActionState(changeUserRoleActionState, null);
  const [instrResult, instrAction, instrPending] = useActionState(assignInstructorActionState, null);
  const [subResult, subAction, subPending] = useActionState(assignSubscriptionActionState, null);
  const [addrResult, addrAction, addrPending] = useActionState(updateUserAddressActionState, null);
  const [deleteResult, deleteAction, deletePending] = useActionState(deleteUserActionState, null);

  // ── Toast on result ─────────────────────────────────────────
  useActionToast(roleResult);
  useActionToast(instrResult);
  useActionToast(subResult);
  useActionToast(addrResult);
  useEffect(() => {
    if (!deleteResult) return;
    if (deleteResult.ok) {
      addToast(deleteResult.message, "success");
      onClose();
    } else {
      addToast(deleteResult.message, "error");
    }
  }, [deleteResult, addToast, onClose]);

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
            <form action={roleAction} className="user-drawer-form">
              <input type="hidden" name="targetUserId" value={user.id} />
              <CustomSelect
                name="role"
                label="Ruolo"
                hideLabel
                options={ROLE_OPTIONS}
                defaultValue={user.role}
                required
              />
              <button type="submit" className="button button-primary small" disabled={rolePending}>
                {rolePending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : null}
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
              <form action={instrAction} className="user-drawer-form">
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
                <button type="submit" className="button button-primary small" disabled={instrPending}>
                  {instrPending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : null}
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
              <form action={subAction} className="user-drawer-form">
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
                <button type="submit" className="button button-primary small" disabled={subPending}>
                  {subPending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : null}
                  Aggiorna abbonamento
                </button>
              </form>
            </section>
          )}

          {/* ── Indirizzo ─────────────────────────────────────────── */}
          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Indirizzo</h4>
            <form action={addrAction} className="user-drawer-form">
              <input type="hidden" name="targetUserId" value={user.id} />
              <label className="input-group">
                <span className="sr-only">Indirizzo</span>
                <input
                  type="text"
                  name="address"
                  defaultValue={user.address ?? ""}
                  placeholder="Via Roma 1, 20100 Milano"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="button button-primary small" disabled={addrPending}>
                {addrPending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : null}
                Salva indirizzo
              </button>
            </form>
          </section>

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
                    <div className="user-drawer-doc-actions">
                      <DocStatusBadge status={doc?.status} />
                      {doc && doc.storageKey && (
                        <OpenDocButton documentId={doc.id} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ── Zona pericolosa ───────────────────────────────────── */}
          <section className="user-drawer-section user-drawer-section-danger">
            <h4 className="user-drawer-section-title">Zona pericolosa</h4>
            <form action={deleteAction}>
              <input type="hidden" name="targetUserId" value={user.id} />
              <button
                type="submit"
                className="button button-danger small"
                disabled={deletePending}
              >
                {deletePending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : null}
                Elimina utente
              </button>
            </form>
          </section>

        </div>
      </aside>
    </>
  );
}
