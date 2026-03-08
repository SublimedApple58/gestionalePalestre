"use client";

import { useActionState, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Drawer, Tabs, Badge, Button, TextInput, Text, Stack, Group } from "@mantine/core";
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
import { roleLabel } from "@/lib/roles";
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
  opened: boolean;
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

const ROLE_BADGE_COLOR: Record<UserRole, string> = {
  [UserRole.ADMIN]: "brand",
  [UserRole.INSTRUCTOR]: "blue",
  [UserRole.SUBSCRIBER]: "gray"
};

function DocStatusBadge({ status }: { status: DocumentStatus | undefined }) {
  if (!status) return <Badge color="gray" variant="light">Non caricato</Badge>;
  switch (status) {
    case DocumentStatus.APPROVED:
      return <Badge color="green" variant="light">Approvato</Badge>;
    case DocumentStatus.PENDING_ADMIN_REVIEW:
      return <Badge color="yellow" variant="light">In revisione</Badge>;
    case DocumentStatus.AI_PROCESSING:
      return <Badge color="yellow" variant="light">In elaborazione</Badge>;
    case DocumentStatus.UPLOADED:
      return <Badge color="blue" variant="light">Caricato</Badge>;
    case DocumentStatus.REJECTED:
      return <Badge color="red" variant="light">Rifiutato</Badge>;
    case DocumentStatus.NEEDS_REUPLOAD:
      return <Badge color="orange" variant="light">Da ricaricare</Badge>;
    default:
      return <Badge color="gray" variant="light">{status}</Badge>;
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
    <Button
      size="xs"
      variant="subtle"
      color="gray"
      leftSection={loading ? <Loader2 size={11} className="spin" /> : <ExternalLink size={11} />}
      onClick={handleOpen}
      loading={loading}
      aria-label="Apri documento"
    >
      Apri
    </Button>
  );
}

function useActionToast(result: ActionResult) {
  const { addToast } = useToast();
  useEffect(() => {
    if (!result) return;
    addToast(result.message, result.ok ? "success" : "error");
  }, [result, addToast]);
}

const tabStyle: React.CSSProperties = {
  padding: "11px 14px",
  fontSize: "13px",
  fontWeight: 500,
  borderRadius: 0,
  color: "rgba(255,255,255,0.5)"
};

const panelStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 0
};

export function UserEditDrawer({ user, opened, onClose, instructors }: UserEditDrawerProps) {
  const { addToast } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [roleResult, roleAction, rolePending] = useActionState(changeUserRoleActionState, null);
  const [instrResult, instrAction, instrPending] = useActionState(assignInstructorActionState, null);
  const [subResult, subAction, subPending] = useActionState(assignSubscriptionActionState, null);
  const [addrResult, addrAction, addrPending] = useActionState(updateUserAddressActionState, null);
  const [deleteResult, deleteAction, deletePending] = useActionState(deleteUserActionState, null);

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

  useEffect(() => {
    if (!opened) setDeleteConfirm(false);
  }, [opened]);

  const instructorOptions = instructors.map((i) => ({
    value: i.id,
    label: `${i.firstName} ${i.lastName}`,
    details: i.email
  }));

  const drawerTitle = (
    <Group gap={10} align="center" wrap="nowrap" style={{ minWidth: 0, overflow: "hidden" }}>
      <span className="user-avatar" style={{ width: 36, height: 36, fontSize: 15, flexShrink: 0 }}>
        {user.firstName.charAt(0).toUpperCase()}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text fw={600} size="sm" style={{ lineHeight: 1.3, color: "white" }} truncate>
          {user.firstName} {user.lastName}
        </Text>
        <Text size="xs" c="dimmed" truncate>{user.email}</Text>
      </div>
      <Badge color={ROLE_BADGE_COLOR[user.role]} variant="light" size="xs" style={{ flexShrink: 0 }}>
        {roleLabel(user.role)}
      </Badge>
    </Group>
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={drawerTitle}
      aria-label={`Modifica ${user.firstName} ${user.lastName}`}
      styles={{
        content: {
          background:
            "radial-gradient(ellipse at 100% 0%, rgba(223,37,49,0.1), transparent 50%), linear-gradient(180deg,rgba(18,18,26,0.99) 0%,rgba(10,10,16,1) 100%)",
          borderLeft: "1px solid rgba(223,37,49,0.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        },
        header: {
          background: "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "16px 20px"
        },
        body: {
          padding: 0,
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        },
        close: {
          color: "rgba(255,255,255,0.5)"
        }
      }}
      transitionProps={{
        transition: "slide-left",
        duration: 320,
        timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
      }}
      overlayProps={{ backgroundOpacity: 0.55, blur: 5 }}
    >
      <Tabs
        defaultValue="dettagli"
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <Tabs.List
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            padding: "0 20px",
            flexShrink: 0,
            gap: 0,
            background: "transparent"
          }}
        >
          <Tabs.Tab value="dettagli" style={tabStyle}>Dettagli</Tabs.Tab>
          <Tabs.Tab value="abbonamento" style={tabStyle}>Abbonamento</Tabs.Tab>
          <Tabs.Tab value="documenti" style={tabStyle}>Documenti</Tabs.Tab>
        </Tabs.List>

        {/* ── DETTAGLI ─────────────────────────────────────────── */}
        <Tabs.Panel value="dettagli" style={panelStyle}>
          <Stack gap={0}>
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
                <Button type="submit" color="brand" size="sm" loading={rolePending} loaderProps={{ type: "dots" }}>
                  Salva ruolo
                </Button>
              </form>
            </section>

            {user.role === UserRole.SUBSCRIBER && instructors.length > 0 && (
              <section className="user-drawer-section">
                <h4 className="user-drawer-section-title">Istruttore assegnato</h4>
                {user.assignedInstructor && (
                  <Text size="xs" c="dimmed" mb={8}>
                    Attuale: {user.assignedInstructor.firstName} {user.assignedInstructor.lastName}
                  </Text>
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
                  <Button type="submit" color="brand" size="sm" loading={instrPending} loaderProps={{ type: "dots" }}>
                    Assegna
                  </Button>
                </form>
              </section>
            )}

            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Indirizzo</h4>
              <form action={addrAction} className="user-drawer-form">
                <input type="hidden" name="targetUserId" value={user.id} />
                <TextInput
                  name="address"
                  defaultValue={user.address ?? ""}
                  placeholder="Via Roma 1, 20100 Milano"
                  autoComplete="off"
                  classNames={{ input: "mantine-drawer-input" }}
                />
                <Button type="submit" color="brand" size="sm" loading={addrPending} loaderProps={{ type: "dots" }}>
                  Salva indirizzo
                </Button>
              </form>
            </section>
          </Stack>
        </Tabs.Panel>

        {/* ── ABBONAMENTO ──────────────────────────────────────── */}
        <Tabs.Panel value="abbonamento" style={panelStyle}>
          <Stack gap={0}>
            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Stato attuale</h4>
              {user.subscription ? (
                <div className="user-drawer-sub-current">
                  <Badge color="green" variant="light">{tierLabel(user.subscription.tier)}</Badge>
                  <Text size="xs" c="dimmed">
                    {new Date(user.subscription.startsAt).toLocaleDateString("it-IT")}
                    {" → "}
                    {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
                  </Text>
                </div>
              ) : (
                <Text size="xs" c="dimmed">Nessun abbonamento attivo.</Text>
              )}
            </section>

            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Assegna abbonamento</h4>
              {user.role !== UserRole.SUBSCRIBER && (
                <Text size="xs" c="dimmed" mb={8}>Solo gli iscritti possono avere un abbonamento.</Text>
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
                <Button
                  type="submit"
                  color="brand"
                  size="sm"
                  loading={subPending}
                  loaderProps={{ type: "dots" }}
                  disabled={user.role !== UserRole.SUBSCRIBER}
                >
                  Aggiorna abbonamento
                </Button>
              </form>
            </section>
          </Stack>
        </Tabs.Panel>

        {/* ── DOCUMENTI ────────────────────────────────────────── */}
        <Tabs.Panel value="documenti" style={panelStyle}>
          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Documenti caricati</h4>
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
                      {doc?.storageKey && <OpenDocButton documentId={doc.id} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </Tabs.Panel>
      </Tabs>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="user-drawer-footer">
        {deleteConfirm ? (
          <div className="user-drawer-footer-confirm">
            <Text size="xs" c="dimmed" className="user-drawer-footer-confirm-text">
              Eliminare definitivamente questo utente?
            </Text>
            <div className="user-drawer-footer-confirm-actions">
              <form action={deleteAction}>
                <input type="hidden" name="targetUserId" value={user.id} />
                <Button type="submit" color="red" size="xs" loading={deletePending} loaderProps={{ type: "dots" }}>
                  Sì, elimina
                </Button>
              </form>
              <Button variant="subtle" color="gray" size="xs" onClick={() => setDeleteConfirm(false)}>
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="subtle" color="red" size="xs" onClick={() => setDeleteConfirm(true)}>
            Elimina utente
          </Button>
        )}
      </div>
    </Drawer>
  );
}
