"use client";

import { useActionState, useEffect, useState } from "react";
import { Drawer, Tabs, Tag, Button, Input, Typography, Space, Flex } from "antd";
import {
  InstallmentStatus,
  PaymentProvider,
  PaymentStatus,
  SubscriptionTier,
  UserRole,
  type Installment,
  type InstallmentPlan,
  type Payment,
  type UserDocument
} from "@gestionale/db";

import {
  type ActionResult,
  assignInstructorActionState,
  assignSubscriptionActionState,
  changeSubscriptionStartDateActionState,
  changeUserRoleActionState,
  deactivateSubscriptionActionState,
  deleteUserActionState,
  reactivateSubscriptionActionState,
  updateAssociationMembershipActionState,
  updateUserAddressActionState
} from "@/app/actions/dashboard-actions";
import { useToast } from "@/components/ui/toast-provider";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AdminDocumentsTab } from "@/components/dashboard/admin-documents-tab";
import { UserAuditLogList } from "@/components/dashboard/user-audit-log-list";
import { associationStatus, type AssociationState } from "@/lib/association";
import { roleLabel } from "@/lib/roles";
import { formatEuroCents, isSubscriptionActive, tierLabel } from "@/lib/subscription";
import { CustomCalendar } from "@/components/ui/custom-calendar";
import { CustomSelect } from "@/components/ui/custom-select";

const { Text } = Typography;

export type DrawerUserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  accessCode: string;
  address: string | null;
  associationMember: boolean;
  associationExpiresAt: Date | null;
  assignedInstructorId: string | null;
  assignedInstructor: { firstName: string; lastName: string } | null;
  documents: UserDocument[];
  subscription: {
    tier: SubscriptionTier;
    startsAt: Date;
    endsAt: Date;
    deactivatedAt: Date | null;
  } | null;
  payments: Payment[];
  installmentPlans: (InstallmentPlan & { installments: Installment[] })[];
};

type UserEditDrawerProps = {
  user: DrawerUserRow;
  opened: boolean;
  onClose: () => void;
  instructors: { id: string; firstName: string; lastName: string; email: string }[];
  profilePhotoUrl?: string;
};

const ROLE_OPTIONS = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.INSTRUCTOR, label: "Istruttore" },
  { value: UserRole.SUBSCRIBER, label: "Iscritto" }
];

const SUBSCRIPTION_OPTIONS = [
  { value: SubscriptionTier.DAILY, label: "Giornaliero" },
  { value: SubscriptionTier.MONTHLY, label: "Mensile" },
  { value: SubscriptionTier.QUARTERLY, label: "Trimestrale" },
  { value: SubscriptionTier.YEARLY, label: "Annuale" },
  { value: SubscriptionTier.BIENNIAL, label: "Biennale" }
];

const ROLE_TAG_COLOR: Record<UserRole, string> = {
  [UserRole.ADMIN]: "red",
  [UserRole.INSTRUCTOR]: "blue",
  [UserRole.SUBSCRIBER]: "default"
};

function PaymentStatusTag({ status }: { status: PaymentStatus }) {
  switch (status) {
    case PaymentStatus.PAID:
      return <Tag color="success">Pagato</Tag>;
    case PaymentStatus.PENDING:
      return <Tag color="processing">In attesa</Tag>;
    case PaymentStatus.AUTHORIZED:
      return <Tag color="processing">Autorizzato</Tag>;
    case PaymentStatus.FAILED:
      return <Tag color="error">Fallito</Tag>;
    case PaymentStatus.CANCELED:
      return <Tag color="default">Annullato</Tag>;
    case PaymentStatus.REFUNDED:
      return <Tag color="warning">Rimborsato</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

function InstallmentStatusTag({ status }: { status: InstallmentStatus }) {
  switch (status) {
    case InstallmentStatus.PAID:
      return <Tag color="success">Pagata</Tag>;
    case InstallmentStatus.SCHEDULED:
      return <Tag color="default">Programmata</Tag>;
    case InstallmentStatus.FAILED:
      return <Tag color="error">Fallita</Tag>;
    case InstallmentStatus.REFUNDED:
      return <Tag color="warning">Rimborsata</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
}

function providerLabel(provider: PaymentProvider): string {
  switch (provider) {
    case PaymentProvider.REVOLUT:
      return "Revolut";
    case PaymentProvider.KLARNA:
      return "Klarna";
    default:
      return provider;
  }
}

function useActionToast(result: ActionResult) {
  const { addToast } = useToast();
  useEffect(() => {
    if (!result) return;
    addToast(result.message, result.ok ? "success" : "error");
  }, [result, addToast]);
}

function toYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function AssociationBadge({ status }: { status: AssociationState }) {
  switch (status.kind) {
    case "expired":
      return <Tag color="error">Scaduta</Tag>;
    case "soon":
      return <Tag color="warning">{`Scade tra ${status.days} gg`}</Tag>;
    case "valid":
      return <Tag color="success">Valida</Tag>;
    default:
      return null;
  }
}

function AssociationSection({ user }: { user: DrawerUserRow }) {
  const [result, action, pending] = useActionState(updateAssociationMembershipActionState, null);
  useActionToast(result);
  const [member, setMember] = useState(user.associationMember);

  const initialExpiry = user.associationExpiresAt
    ? toYmd(new Date(user.associationExpiresAt))
    : undefined;
  const status = associationStatus(
    user.associationMember,
    user.associationExpiresAt ? new Date(user.associationExpiresAt) : null
  );

  return (
    <section className="user-drawer-section user-drawer-section--assoc">
      <div className="user-drawer-section-head">
        <h4 className="user-drawer-section-title">Associazione sportiva</h4>
        <AssociationBadge status={status} />
      </div>
      <form action={action} className="user-drawer-form">
        <input type="hidden" name="targetUserId" value={user.id} />
        <input type="hidden" name="associationMember" value={member ? "true" : "false"} />
        <label className="assoc-check">
          <input
            type="checkbox"
            checked={member}
            onChange={(e) => setMember(e.target.checked)}
          />
          <span>Iscritto ad associazione</span>
        </label>
        {member ? (
          <div className="assoc-reveal">
            <CustomCalendar
              name="associationExpiresAt"
              label="Scadenza iscrizione"
              defaultValue={initialExpiry}
            />
            <p className="assoc-help">
              Quando manca poco (entro 14 giorni) l&apos;utente compare nell&apos;avviso in home admin.
            </p>
          </div>
        ) : null}
        <Button type="primary" htmlType="submit" loading={pending} size="small">
          Salva iscrizione
        </Button>
      </form>
    </section>
  );
}

export function UserEditDrawer({ user, opened, onClose, instructors, profilePhotoUrl }: UserEditDrawerProps) {
  const { addToast } = useToast();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [roleResult, roleAction, rolePending] = useActionState(changeUserRoleActionState, null);
  const [instrResult, instrAction, instrPending] = useActionState(assignInstructorActionState, null);
  const [subResult, subAction, subPending] = useActionState(assignSubscriptionActionState, null);
  const [addrResult, addrAction, addrPending] = useActionState(updateUserAddressActionState, null);
  const [deleteResult, deleteAction, deletePending] = useActionState(deleteUserActionState, null);
  const [deactivateResult, deactivateAction, deactivatePending] = useActionState(
    deactivateSubscriptionActionState,
    null
  );
  const [reactivateResult, reactivateAction, reactivatePending] = useActionState(
    reactivateSubscriptionActionState,
    null
  );
  const [startDateResult, startDateAction, startDatePending] = useActionState(
    changeSubscriptionStartDateActionState,
    null
  );

  useActionToast(roleResult);
  useActionToast(instrResult);
  useActionToast(subResult);
  useActionToast(addrResult);
  useActionToast(deactivateResult);
  useActionToast(reactivateResult);
  useActionToast(startDateResult);

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
    <Flex gap={10} align="center" style={{ minWidth: 0, overflow: "hidden" }}>
      <UserAvatar
        firstName={user.firstName}
        profilePhotoUrl={profilePhotoUrl}
        size="md"
        style={{ width: 36, height: 36, fontSize: 15, flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text strong style={{ lineHeight: 1.3, color: "white", display: "block", fontSize: 14 }} ellipsis>
          {user.firstName} {user.lastName}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, display: "block" }} ellipsis>{user.email}</Text>
      </div>
      <Tag color={ROLE_TAG_COLOR[user.role]} style={{ flexShrink: 0 }}>
        {roleLabel(user.role)}
      </Tag>
    </Flex>
  );

  const tabItems = [
    {
      key: "dettagli",
      label: "Dettagli",
      children: (
        <div className="drawer-tab-content">
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
              <Button type="primary" htmlType="submit" loading={rolePending} size="small">
                Salva ruolo
              </Button>
            </form>
          </section>

          {user.role === UserRole.SUBSCRIBER && instructors.length > 0 && (
            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Istruttore assegnato</h4>
              {user.assignedInstructor && (
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 8 }}>
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
                <Button type="primary" htmlType="submit" loading={instrPending} size="small">
                  Assegna
                </Button>
              </form>
            </section>
          )}

          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Indirizzo</h4>
            <form action={addrAction} className="user-drawer-form">
              <input type="hidden" name="targetUserId" value={user.id} />
              <Input
                name="address"
                defaultValue={user.address ?? ""}
                placeholder="Via Roma 1, 20100 Milano"
                autoComplete="off"
                className="dark-input"
              />
              <Button type="primary" htmlType="submit" loading={addrPending} size="small">
                Salva indirizzo
              </Button>
            </form>
          </section>

          <AssociationSection user={user} />
        </div>
      )
    },
    {
      key: "abbonamento",
      label: "Abbonamento",
      children: (
        <div className="drawer-tab-content">
          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Stato attuale</h4>
            {user.subscription ? (
              <div className="user-drawer-sub-current">
                {user.subscription.deactivatedAt ? (
                  <Tag color="warning">Disattivato</Tag>
                ) : (
                  <Tag color="success">{tierLabel(user.subscription.tier)} attivo</Tag>
                )}
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  {new Date(user.subscription.startsAt).toLocaleDateString("it-IT")}
                  {" → "}
                  {new Date(user.subscription.endsAt).toLocaleDateString("it-IT")}
                </Text>
                {user.subscription.deactivatedAt ? (
                  <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginTop: 4 }}>
                    Disattivato il {new Date(user.subscription.deactivatedAt).toLocaleDateString("it-IT")}
                  </Text>
                ) : null}
              </div>
            ) : (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Nessun abbonamento attivo.</Text>
            )}
          </section>

          {user.subscription ? (
            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Gestione abbonamento</h4>
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                {user.subscription.deactivatedAt ? (
                  <form action={reactivateAction}>
                    <input type="hidden" name="targetUserId" value={user.id} />
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={reactivatePending}
                      size="small"
                      style={{ background: "#22c55e", borderColor: "#22c55e" }}
                    >
                      Riattiva abbonamento
                    </Button>
                  </form>
                ) : (
                  <form action={deactivateAction}>
                    <input type="hidden" name="targetUserId" value={user.id} />
                    <Button danger htmlType="submit" loading={deactivatePending} size="small">
                      Disattiva abbonamento
                    </Button>
                  </form>
                )}

                <form action={startDateAction} className="user-drawer-form" style={{ marginTop: 4 }}>
                  <input type="hidden" name="targetUserId" value={user.id} />
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "block" }}>
                    Cambia date dell'abbonamento. Se la scadenza non viene specificata, sara' ricalcolata in base al tier.
                  </Text>
                  <CustomCalendar name="startsAt" label="Nuova data inizio" />
                  <CustomCalendar name="endsAt" label="Data scadenza (opzionale)" />
                  <Button htmlType="submit" loading={startDatePending} size="small">
                    Aggiorna date
                  </Button>
                </form>
              </Space>
            </section>
          ) : null}

          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Assegna abbonamento</h4>
            {user.role !== UserRole.SUBSCRIBER && (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 8 }}>
                Solo gli iscritti possono avere un abbonamento.
              </Text>
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
                type="primary"
                htmlType="submit"
                loading={subPending}
                disabled={user.role !== UserRole.SUBSCRIBER}
                size="small"
              >
                Aggiorna abbonamento
              </Button>
            </form>
          </section>
        </div>
      )
    },
    {
      key: "pagamenti",
      label: "Pagamenti",
      children: (
        <div className="drawer-tab-content">
          <section className="user-drawer-section">
            <h4 className="user-drawer-section-title">Storico pagamenti</h4>
            {user.payments.length === 0 ? (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                Nessun pagamento registrato per questo utente.
              </Text>
            ) : (
              <ul className="user-drawer-payments-list">
                {user.payments.map((p) => (
                  <li key={p.id} className="user-drawer-payment-row">
                    <div className="user-drawer-payment-main">
                      <span className="user-drawer-payment-amount">
                        {formatEuroCents(p.amountCents)}
                      </span>
                      <span className="user-drawer-payment-meta">
                        {providerLabel(p.provider)} · {tierLabel(p.tier)}
                      </span>
                    </div>
                    <div className="user-drawer-payment-right">
                      <PaymentStatusTag status={p.status} />
                      <span className="user-drawer-payment-date">
                        {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("it-IT")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {user.installmentPlans.length > 0 && (
            <section className="user-drawer-section">
              <h4 className="user-drawer-section-title">Piani rateali</h4>
              {user.installmentPlans.map((plan) => {
                const paid = plan.installments.filter(
                  (i) => i.status === InstallmentStatus.PAID
                ).length;
                return (
                  <div key={plan.id} className="user-drawer-plan">
                    <div className="user-drawer-plan-header">
                      <span className="user-drawer-plan-title">
                        {plan.installmentsCount} rate da{" "}
                        {formatEuroCents(plan.installmentAmountCents)}
                      </span>
                      <Tag color={plan.status === "ACTIVE" ? "processing" : "default"}>
                        {plan.status}
                      </Tag>
                    </div>
                    <div className="user-drawer-plan-progress">
                      {paid} / {plan.installmentsCount} pagate · totale{" "}
                      {formatEuroCents(plan.totalAmountCents)}
                    </div>
                    <ul className="user-drawer-installment-list">
                      {plan.installments.map((inst) => (
                        <li key={inst.id} className="user-drawer-installment-row">
                          <span className="user-drawer-installment-num">
                            #{inst.sequenceNumber}
                          </span>
                          <span className="user-drawer-installment-date">
                            {new Date(inst.dueAt).toLocaleDateString("it-IT")}
                          </span>
                          <span className="user-drawer-installment-amount">
                            {formatEuroCents(inst.amountCents)}
                          </span>
                          <InstallmentStatusTag status={inst.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )
    },
    {
      key: "documenti",
      label: "Documenti",
      children: <AdminDocumentsTab userId={user.id} documents={user.documents} />
    },
    {
      key: "cronologia",
      label: "Cronologia",
      children: <UserAuditLogList userId={user.id} />
    }
  ];

  return (
    <Drawer
      open={opened}
      onClose={onClose}
      placement="right"
      title={drawerTitle}
      width={640}
      className="dark-drawer"
      styles={{
        wrapper: {
          boxShadow: "-4px 0 24px rgba(0,0,0,0.5)"
        },
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
        }
      }}
    >
      <div className="user-drawer-summary">
        {user.subscription ? (
          isSubscriptionActive(user.subscription) ? (
            <Tag color="success">Abbonamento attivo</Tag>
          ) : (
            <Tag color="default">Abbonamento non attivo</Tag>
          )
        ) : (
          <Tag color="default">Nessun abbonamento</Tag>
        )}
        <AssociationBadge
          status={associationStatus(
            user.associationMember,
            user.associationExpiresAt ? new Date(user.associationExpiresAt) : null
          )}
        />
        <span className="user-drawer-summary-code">
          Codice <strong>{user.accessCode}</strong>
        </span>
      </div>

      <Tabs
        defaultActiveKey="dettagli"
        items={tabItems}
        className="drawer-tabs"
        style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      />

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="user-drawer-footer">
        {deleteConfirm ? (
          <div className="user-drawer-footer-confirm">
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }} className="user-drawer-footer-confirm-text">
              Eliminare definitivamente questo utente?
            </Text>
            <div className="user-drawer-footer-confirm-actions">
              <form action={deleteAction}>
                <input type="hidden" name="targetUserId" value={user.id} />
                <Button type="primary" danger htmlType="submit" size="small" loading={deletePending}>
                  Sì, elimina
                </Button>
              </form>
              <Button size="small" onClick={() => setDeleteConfirm(false)}>
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <Button type="text" danger size="small" onClick={() => setDeleteConfirm(true)}>
            Elimina utente
          </Button>
        )}
      </div>
    </Drawer>
  );
}
