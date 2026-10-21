import { SubscriptionTier, UserRole, type PrismaClient } from "@gestionale/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressione "scadenze personalizzate sovrascritte" (ott 2026).
 * La reception scrive a mano la scadenza (mesi residui da un'altra palestra);
 * diversi ricalcoli automatici la riportavano allo standard del piano (rate,
 * insoluti, riassegnazione, bonifiche). Con `endsAtManual` nessun ricalcolo
 * automatico la tocca; l'insoluto sospende l'accesso SENZA tagliare endsAt.
 */

const ctl = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    sub: null as Row | null,
    payment: null as Row | null,
    plans: [] as Row[],
    audits: [] as Row[],
    planUpdates: [] as Row[]
  };

  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === "userId" || k === "id") return true;
      if (v === null) return row[k] == null;
      if (v && typeof v === "object" && "not" in (v as Row)) return row[k] != null;
      return row[k] === v;
    });

  const db: Record<string, unknown> = {
    user: { findUnique: async () => ({ firstName: "Test", lastName: "User", email: "t@u.it" }) },
    userAuditLog: {
      create: async ({ data }: { data: Row }) => {
        state.audits.push(data);
        return data;
      }
    },
    userSubscription: {
      findUnique: async () => (state.sub ? { ...state.sub } : null),
      findFirst: async ({ where }: { where: Row }) =>
        state.sub && matches(state.sub, where) ? { ...state.sub } : null,
      upsert: async ({ create, update }: { create: Row; update: Row }) => {
        state.sub = state.sub
          ? { ...state.sub, ...update }
          : {
              id: "sub1",
              deactivatedAt: null,
              endsAtManual: false,
              arrearsSuspendedAt: null,
              ...create
            };
        return { ...state.sub };
      },
      update: async ({ data }: { data: Row }) => {
        state.sub = { ...state.sub, ...data };
        return { ...state.sub };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!state.sub || !matches(state.sub, where)) return { count: 0 };
        state.sub = { ...state.sub, ...data };
        return { count: 1 };
      }
    },
    payment: {
      findUnique: async () => (state.payment ? { ...state.payment } : null),
      findFirst: async () => null,
      findMany: async () => [],
      update: async ({ data }: { data: Row }) => {
        Object.assign(state.payment as Row, data);
        return { ...state.payment };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const p = state.payment as Row | null;
        if (!p || (where.status !== undefined && p.status !== where.status)) return { count: 0 };
        Object.assign(p, data);
        return { count: 1 };
      }
    },
    installmentPlan: {
      findFirst: async () => {
        const p = state.payment as Row | null;
        return p?.installmentPlan ? { paymentId: p.id } : null;
      },
      // cancelStrayInstallmentPlans filtra per `payment.userId`: nessun duplicato.
      findMany: async ({ where }: { where: Row }) => ("payment" in where ? [] : state.plans),
      findUnique: async () => (state.payment as Row | null)?.installmentPlan ?? null,
      update: async ({ data }: { data: Row }) => {
        state.planUpdates.push(data);
        return {};
      },
      create: async () => ({})
    },
    installment: { update: async () => ({}), updateMany: async () => ({ count: 1 }) },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db)
  };

  const reset = () => {
    state.sub = null;
    state.payment = null;
    state.plans = [];
    state.audits = [];
    state.planUpdates = [];
  };
  return { state, db, reset };
});

vi.mock("@gestionale/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gestionale/db")>();
  return { ...actual, db: ctl.db };
});
vi.mock("@/lib/payments/revolut", () => ({
  verifyWebhookSignature: vi.fn(async () => true),
  getOrder: vi.fn(),
  cancelSubscription: vi.fn(async () => undefined)
}));
vi.mock("@/lib/payments/heylight", () => ({
  getApplication: vi.fn(),
  confirmContract: vi.fn(),
  isContractPaid: vi.fn(),
  isHeyLightProduction: vi.fn(() => false)
}));
vi.mock("@/lib/auth/with-mobile-auth", () => ({
  withMobileAuth:
    (handler: (req: Request, ctx: { params: unknown; user: unknown }) => unknown) =>
    async (req: Request, ctx?: { params?: unknown }) =>
      handler(req, { params: await ctx?.params, user: { id: "admin-1", role: "ADMIN" } })
}));
vi.mock("@/lib/services/tuya-pin-service", () => ({
  safeSyncPinToKeypad: vi.fn(),
  syncPinToKeypad: vi.fn(async () => undefined)
}));

import { POST as mobileStartDate } from "@/app/api/mobile/admin/users/[id]/subscription/start-date/route";
import { POST as revolutWebhook } from "@/app/api/webhooks/revolut/route";
import { cancelSubscription } from "@/lib/payments/revolut";
import { getOrder } from "@/lib/payments/revolut";
import { runInstallmentsReconcileJob } from "@/lib/services/installments-charge-job";
import { reconcileRevolutPayment } from "@/lib/services/payment-reconciliation";
import { assignSubscriptionByAdmin } from "@/lib/services/user-service";
import {
  effectiveEndsAt,
  isCustomEndsAt,
  isEligibleForDoorAccess,
  neverShorten,
  subscriptionStatus
} from "@/lib/subscription";

const DAY = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(iso);
const mockOrder = (order: Record<string, unknown>) =>
  (getOrder as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(order);
const webhook = (orderId: string) =>
  revolutWebhook(
    new Request("http://test/api/webhooks/revolut", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId })
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  ctl.reset();
});

// ─── Helper puri ───────────────────────────────────────────────────────────────
describe("helper scadenza manuale e insoluti", () => {
  const start = d("2026-06-16T13:15:00.000Z");

  it("isCustomEndsAt riconosce una scadenza scritta a mano (tolleranza 1 giorno)", () => {
    // Casole: annuale + 6 mesi scritti dalla reception
    expect(isCustomEndsAt(SubscriptionTier.YEARLY, start, d("2027-12-16T14:15:14.000Z"))).toBe(true);
    // standard esatto o solo un orario diverso (data scelta a calendario) → non manuale
    expect(isCustomEndsAt(SubscriptionTier.YEARLY, start, d("2027-06-16T13:15:00.000Z"))).toBe(false);
    expect(isCustomEndsAt(SubscriptionTier.YEARLY, start, d("2027-06-16T22:00:00.000Z"))).toBe(false);
    // accorciata a mano → manuale anche lei
    expect(isCustomEndsAt(SubscriptionTier.YEARLY, start, d("2027-03-20T00:00:00.000Z"))).toBe(true);
  });

  it("neverShorten non accorcia mai una copertura più lunga", () => {
    const long = d("2027-12-16T00:00:00.000Z");
    expect(neverShorten(long, d("2027-06-16T00:00:00.000Z"))).toEqual(long);
    expect(neverShorten(d("2027-01-01T00:00:00.000Z"), long)).toEqual(long);
  });

  it("rata insoluta: copertura effettiva sospesa, scadenza reale intatta, grazia rispettata", () => {
    const now = d("2026-10-20T10:00:00.000Z");
    const sub = {
      startsAt: start,
      endsAt: d("2027-12-16T13:15:00.000Z"),
      deactivatedAt: null,
      autoRenew: true,
      arrearsSuspendedAt: d("2026-10-17T10:00:00.000Z")
    };
    expect(effectiveEndsAt(sub).toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(subscriptionStatus(sub, now)).toBe("expired");
    // 3 giorni dopo la sospensione → oltre la grazia di 2gg → niente PIN
    expect(isEligibleForDoorAccess(sub, now)).toBe(false);
    // entro la grazia → ancora dentro (come col vecchio taglio di endsAt)
    expect(isEligibleForDoorAccess(sub, new Date(sub.arrearsSuspendedAt.getTime() + DAY))).toBe(true);
    // pagata la rata → sospensione azzerata → torna valida la scadenza reale
    expect(isEligibleForDoorAccess({ ...sub, arrearsSuspendedAt: null }, now)).toBe(true);
    expect(subscriptionStatus({ ...sub, arrearsSuspendedAt: null }, now)).toBe("active");
  });
});

// ─── Assegnazione da reception ────────────────────────────────────────────────
describe("assignSubscriptionByAdmin rispetta la scadenza manuale", () => {
  const prismaWith = (existing: Record<string, unknown> | null) => {
    const upsert = vi.fn();
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ role: UserRole.SUBSCRIBER }) },
      userSubscription: { findUnique: vi.fn().mockResolvedValue(existing), upsert },
      userEntryPackage: { updateMany: vi.fn() }
    } as unknown as PrismaClient;
    return { prisma, upsert };
  };
  const manualEnd = new Date(Date.now() + 340 * DAY);

  it("riassegnare lo STESSO piano con copertura in corso NON tocca la scadenza manuale (caso Ettorre)", async () => {
    const { prisma, upsert } = prismaWith({
      tier: "YEARLY",
      endsAt: manualEnd,
      deactivatedAt: null,
      endsAtManual: true
    });
    await assignSubscriptionByAdmin(prisma, UserRole.ADMIN, "admin-1", {
      targetUserId: "u1",
      tier: SubscriptionTier.YEARLY,
      startsAt: new Date(Date.now() - 30 * DAY)
    });
    const { update } = upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect((update.endsAt as Date).toISOString()).toBe(manualEnd.toISOString());
    expect(update.endsAtManual).toBe(true);
  });

  it("cambio di piano (tier diverso) = copertura nuova: ricalcolo e flag azzerato", async () => {
    const { prisma, upsert } = prismaWith({
      tier: "MONTHLY",
      endsAt: manualEnd,
      deactivatedAt: null,
      endsAtManual: true
    });
    const startsAt = d("2026-10-22T00:00:00.000Z");
    await assignSubscriptionByAdmin(prisma, UserRole.ADMIN, "admin-1", {
      targetUserId: "u1",
      tier: SubscriptionTier.YEARLY,
      startsAt
    });
    const { update } = upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect((update.endsAt as Date).toISOString()).toBe("2027-10-22T00:00:00.000Z");
    expect(update.endsAtManual).toBe(false);
  });

  it("scadenza manuale già scaduta → nuova copertura standard", async () => {
    const { prisma, upsert } = prismaWith({
      tier: "YEARLY",
      endsAt: new Date(Date.now() - 5 * DAY),
      deactivatedAt: null,
      endsAtManual: true
    });
    await assignSubscriptionByAdmin(prisma, UserRole.ADMIN, "admin-1", {
      targetUserId: "u1",
      tier: SubscriptionTier.YEARLY,
      startsAt: d("2026-10-22T00:00:00.000Z")
    });
    const { update } = upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect((update.endsAt as Date).toISOString()).toBe("2027-10-22T00:00:00.000Z");
    expect(update.endsAtManual).toBe(false);
  });
});

// ─── Rate Revolut (webhook reale) ─────────────────────────────────────────────
describe("rate: insoluto e pagamento non toccano la scadenza manuale", () => {
  const start = d("2026-06-17T11:35:11.952Z");
  const realEnd = d("2027-09-17T11:35:11.952Z"); // annuale + 3 mesi scritti a mano (Di Pietro)

  const seed = () => {
    ctl.state.sub = {
      id: "sub1",
      userId: "u1",
      tier: "YEARLY",
      startsAt: start,
      endsAt: realEnd,
      deactivatedAt: null,
      autoRenew: true,
      endsAtManual: true,
      arrearsSuspendedAt: null
    };
    ctl.state.payment = {
      id: "pay1",
      userId: "u1",
      provider: "REVOLUT",
      tier: "YEARLY",
      status: "PAID",
      subscriptionId: "sub1",
      providerReference: "revsub1",
      installmentPlan: {
        id: "plan1",
        status: "ACTIVE",
        revolutSubscriptionId: "revsub1",
        installments: [
          { id: "i1", sequenceNumber: 1, status: "PAID", providerReference: "ord1" },
          { id: "i2", sequenceNumber: 2, status: "SCHEDULED", providerReference: null },
          { id: "i3", sequenceNumber: 3, status: "SCHEDULED", providerReference: null }
        ]
      }
    };
  };

  it("rata fallita → accesso sospeso, endsAt NON tagliato", async () => {
    seed();
    mockOrder({ id: "ord2", state: "failed", subscriptionId: "revsub1", externalReference: null });
    const res = await webhook("ord2");
    expect(res.status).toBe(200);
    const sub = ctl.state.sub as { endsAt: Date; arrearsSuspendedAt: Date | null; endsAtManual: boolean };
    expect(sub.endsAt.toISOString()).toBe(realEnd.toISOString());
    expect(sub.arrearsSuspendedAt).toBeInstanceOf(Date);
    expect(sub.endsAtManual).toBe(true);
    expect(ctl.state.audits.some((a) => a.action === "SUBSCRIPTION_AUTO_UPDATED")).toBe(true);
  });

  it("rata fallita e poi pagata → torna la scadenza manuale (no standard)", async () => {
    seed();
    mockOrder({ id: "ord2", state: "failed", subscriptionId: "revsub1", externalReference: null });
    await webhook("ord2");
    mockOrder({ id: "ord2b", state: "completed", subscriptionId: "revsub1", externalReference: null });
    await webhook("ord2b");
    const sub = ctl.state.sub as { endsAt: Date; arrearsSuspendedAt: Date | null; endsAtManual: boolean };
    // Col vecchio codice: taglio a "now" e poi max(now, inizio+12m) = 2027-06-17 → 3 mesi persi.
    expect(sub.endsAt.toISOString()).toBe(realEnd.toISOString());
    expect(sub.arrearsSuspendedAt).toBeNull();
    expect(sub.endsAtManual).toBe(true);
  });

  it("scadenza ACCORCIATA a mano: una rata pagata non la riporta allo standard", async () => {
    seed();
    const shortened = d("2027-03-20T00:00:00.000Z");
    ctl.state.sub = { ...(ctl.state.sub as object), endsAt: shortened };
    mockOrder({ id: "ord2", state: "completed", subscriptionId: "revsub1", externalReference: null });
    await webhook("ord2");
    const sub = ctl.state.sub as { endsAt: Date };
    expect(sub.endsAt.toISOString()).toBe(shortened.toISOString());
  });
});

describe("rete di sicurezza insoluti (job rate) non taglia endsAt", () => {
  it("rata scaduta non confermata → sospensione dalla scadenza della rata, endsAt intatto", async () => {
    const realEnd = d("2027-12-16T14:15:14.000Z");
    const dueAt = new Date(Date.now() - 10 * DAY);
    ctl.state.sub = {
      id: "sub1",
      userId: "u1",
      tier: "YEARLY",
      startsAt: d("2026-06-16T13:15:14.000Z"),
      endsAt: realEnd,
      deactivatedAt: null,
      autoRenew: true,
      endsAtManual: true,
      arrearsSuspendedAt: null
    };
    ctl.state.plans = [
      {
        id: "plan1",
        userId: "u1",
        revolutSubscriptionId: "revsub1",
        createdAt: new Date(Date.now() - 60 * DAY),
        paymentId: "pay1",
        payment: { status: "PAID", tier: "YEARLY" },
        installments: [
          { id: "i1", status: "PAID", dueAt: new Date(Date.now() - 40 * DAY) },
          { id: "i2", status: "SCHEDULED", dueAt }
        ]
      }
    ];
    await runInstallmentsReconcileJob();
    const sub = ctl.state.sub as { endsAt: Date; arrearsSuspendedAt: Date | null };
    expect(sub.endsAt.toISOString()).toBe(realEnd.toISOString());
    expect(sub.arrearsSuspendedAt?.toISOString()).toBe(dueAt.toISOString());
  });
});

// ─── Pagamenti one-shot (riconciliazione) ─────────────────────────────────────
describe("rinnovo pagato: si somma sopra la scadenza manuale, non la sostituisce", () => {
  const pendingPayment = {
    id: "pay9",
    userId: "u1",
    provider: "REVOLUT",
    providerReference: "ord9",
    tier: "YEARLY",
    status: "PENDING",
    paidAt: null,
    subscriptionId: null,
    installmentPlan: null
  };

  it("copertura attiva manuale → +12 mesi DALLA scadenza manuale, flag mantenuto", async () => {
    const end = new Date(Date.now() + 100 * DAY);
    ctl.state.sub = {
      id: "sub1",
      userId: "u1",
      tier: "YEARLY",
      startsAt: new Date(Date.now() - 300 * DAY),
      endsAt: end,
      deactivatedAt: null,
      endsAtManual: true,
      arrearsSuspendedAt: null
    };
    ctl.state.payment = { ...pendingPayment };
    mockOrder({ state: "completed" });
    await reconcileRevolutPayment("pay9");
    const sub = ctl.state.sub as { endsAt: Date; endsAtManual: boolean };
    expect(sub.endsAt.getTime()).toBeGreaterThan(end.getTime() + 360 * DAY);
    expect(sub.endsAtManual).toBe(true);
  });

  it("copertura scaduta → riparte da oggi e il flag manuale è azzerato", async () => {
    ctl.state.sub = {
      id: "sub1",
      userId: "u1",
      tier: "YEARLY",
      startsAt: new Date(Date.now() - 600 * DAY),
      endsAt: new Date(Date.now() - 10 * DAY),
      deactivatedAt: null,
      endsAtManual: true,
      arrearsSuspendedAt: null
    };
    ctl.state.payment = { ...pendingPayment };
    mockOrder({ state: "completed" });
    await reconcileRevolutPayment("pay9");
    const sub = ctl.state.sub as { endsAtManual: boolean; startsAt: Date };
    expect(sub.endsAtManual).toBe(false);
    expect(Date.now() - sub.startsAt.getTime()).toBeLessThan(60_000);
  });
});

// ─── Cambio data inizio: la reception non viene MAI bloccata ──────────────────
describe("cambio della sola data di inizio con scadenza manuale", () => {
  const changeStart = (startsAt: string) =>
    (mobileStartDate as unknown as (req: Request, ctx: { params: { id: string } }) => Promise<Response>)(
      new Request("http://test/api/mobile/admin/users/u1/subscription/start-date", {
        method: "POST",
        body: JSON.stringify({ startsAt })
      }),
      { params: { id: "u1" } }
    );

  it("la scadenza manuale resta invariata", async () => {
    const manual = d("2027-12-16T14:15:14.000Z");
    ctl.state.sub = { id: "sub1", userId: "u1", tier: "YEARLY", startsAt: d("2026-06-16T13:15:14.000Z"), endsAt: manual, endsAtManual: true };
    const res = await changeStart("2026-07-01T00:00:00.000Z");
    const body = (await res.json()) as { ok: boolean; warning?: string };
    expect(res.status).toBe(200);
    expect(body.warning).toBeUndefined();
    const sub = ctl.state.sub as { endsAt: Date; startsAt: Date; endsAtManual: boolean };
    expect(sub.endsAt.toISOString()).toBe(manual.toISOString());
    expect(sub.startsAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(sub.endsAtManual).toBe(true);
  });

  it("nuovo inizio DOPO la scadenza manuale → nessun blocco, solo avviso", async () => {
    const manual = d("2027-03-20T00:00:00.000Z");
    ctl.state.sub = { id: "sub1", userId: "u1", tier: "YEARLY", startsAt: d("2026-06-16T00:00:00.000Z"), endsAt: manual, endsAtManual: true };
    const res = await changeStart("2027-05-01T00:00:00.000Z");
    const body = (await res.json()) as { ok: boolean; warning?: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.warning).toBe("MANUAL_ENDS_BEFORE_STARTS");
    expect((ctl.state.sub as { endsAt: Date }).endsAt.toISOString()).toBe(manual.toISOString());
  });
});

// ─── Gli addebiti seguono il PIANO pagato, non la scadenza allungata ──────────
describe("mesi extra gratuiti: nessuna rata per il periodo allungato", () => {
  it("rate tutte pagate → piano chiuso e subscription Revolut cancellata, anche con scadenza allungata", async () => {
    const extended = d("2028-03-07T09:00:30.000Z"); // annuale + ~6 mesi scritti dalla reception
    ctl.state.sub = {
      id: "sub1",
      userId: "u1",
      tier: "YEARLY",
      startsAt: d("2026-09-11T08:00:00.000Z"),
      endsAt: extended,
      deactivatedAt: null,
      autoRenew: true,
      endsAtManual: true,
      arrearsSuspendedAt: null
    };
    ctl.state.plans = [
      {
        id: "plan1",
        userId: "u1",
        revolutSubscriptionId: "revsub1",
        createdAt: new Date(Date.now() - 400 * DAY),
        paymentId: "pay1",
        payment: { status: "PAID", tier: "YEARLY" },
        installments: Array.from({ length: 12 }, (_, i) => ({
          id: `i${i + 1}`,
          status: "PAID",
          dueAt: new Date(Date.now() - (360 - i * 30) * DAY)
        }))
      }
    ];
    await runInstallmentsReconcileJob();
    expect(ctl.state.planUpdates).toContainEqual({ status: "COMPLETED" });
    expect(cancelSubscription).toHaveBeenCalledWith("revsub1");
    const sub = ctl.state.sub as { endsAt: Date; arrearsSuspendedAt: Date | null; endsAtManual: boolean };
    expect(sub.endsAt.toISOString()).toBe(extended.toISOString());
    expect(sub.arrearsSuspendedAt).toBeNull();
    expect(sub.endsAtManual).toBe(true);
  });
});
