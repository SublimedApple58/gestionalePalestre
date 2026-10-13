import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressione REG-"Compass 2 anni": due reconcile concorrenti (webhook + success
 * page / confirm mobile / cron) per lo STESSO pagamento devono applicare
 * l'abbonamento UNA sola volta. Senza il claim atomico PENDING→PAID entrambe le
 * transazioni passavano la guardia di idempotenza (status letto PENDING) e
 * applicavano `computeExtendedEndDate` due volte → durata raddoppiata
 * (annuale → 2 anni).
 *
 * Il fake `db` qui simula la semantica del claim: `payment.updateMany` con
 * `where.status: PENDING` riesce una sola volta (count=1), poi count=0; le
 * transazioni sono serializzate come fa Postgres sul lock di riga.
 */
const ctl = vi.hoisted(() => {
  const state: {
    payment: Record<string, unknown> | null;
    sub: Record<string, unknown> | null;
    upsertCalls: number;
  } = { payment: null, sub: null, upsertCalls: 0 };

  let chain: Promise<unknown> = Promise.resolve();

  const db = {
    payment: {
      findUnique: async () => (state.payment ? { ...state.payment } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.payment as object, data);
        return { ...state.payment };
      },
      updateMany: async ({
        where,
        data
      }: {
        where: { status?: string };
        data: Record<string, unknown>;
      }) => {
        if (where.status !== undefined && (state.payment as { status: string }).status !== where.status) {
          return { count: 0 };
        }
        Object.assign(state.payment as object, data);
        return { count: 1 };
      }
    },
    userSubscription: {
      findUnique: async () => (state.sub ? { ...state.sub } : null),
      upsert: async ({
        create,
        update
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        state.upsertCalls++;
        state.sub = state.sub
          ? { ...state.sub, ...update }
          : { id: "sub1", deactivatedAt: null, ...create };
        return { ...state.sub };
      }
    },
    installment: { update: async () => ({}) },
    // Serializza come una riga lockata: la seconda tx parte quando la prima ha finito.
    $transaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const run = chain.then(() => fn(db));
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run as Promise<T>;
    }
  };

  const reset = (payment: Record<string, unknown>) => {
    state.payment = payment;
    state.sub = null;
    state.upsertCalls = 0;
  };

  return { state, db, reset };
});

vi.mock("@gestionale/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gestionale/db")>();
  return { ...actual, db: ctl.db };
});
vi.mock("@/lib/payments/revolut", () => ({ getOrder: vi.fn() }));
vi.mock("@/lib/payments/heylight", () => ({
  getApplication: vi.fn(),
  confirmContract: vi.fn(),
  isContractPaid: vi.fn(),
  isHeyLightProduction: vi.fn(() => false)
}));
vi.mock("@/lib/services/tuya-pin-service", () => ({ safeSyncPinToKeypad: vi.fn() }));

import { getApplication, isContractPaid } from "@/lib/payments/heylight";
import { getOrder } from "@/lib/payments/revolut";
import {
  reconcileHeyLightPayment,
  reconcileRevolutPayment
} from "@/lib/services/payment-reconciliation";

const monthsBetween = (a: Date, b: Date) =>
  (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

describe("reconcile concorrente applica l'abbonamento una sola volta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HeyLight YEARLY: due reconcile concorrenti → 12 mesi, non 24", async () => {
    ctl.reset({
      id: "pay1",
      userId: "u1",
      provider: "HEYLIGHT",
      providerReference: "ref1",
      tier: "YEARLY",
      status: "PENDING",
      paidAt: null,
      subscriptionId: null
    });
    (getApplication as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      status: "success"
    });
    (isContractPaid as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(true);

    await Promise.all([reconcileHeyLightPayment("pay1"), reconcileHeyLightPayment("pay1")]);

    expect(ctl.state.upsertCalls).toBe(1);
    expect((ctl.state.payment as { status: string }).status).toBe("PAID");
    const sub = ctl.state.sub as { startsAt: Date; endsAt: Date };
    expect(monthsBetween(sub.startsAt, sub.endsAt)).toBe(12);
  });

  it("Revolut one-shot MONTHLY: due reconcile concorrenti → 1 mese, non 2", async () => {
    ctl.reset({
      id: "pay2",
      userId: "u1",
      provider: "REVOLUT",
      providerReference: "ord1",
      tier: "MONTHLY",
      status: "PENDING",
      paidAt: null,
      subscriptionId: null,
      installmentPlan: null
    });
    (getOrder as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      state: "completed"
    });

    await Promise.all([reconcileRevolutPayment("pay2"), reconcileRevolutPayment("pay2")]);

    expect(ctl.state.upsertCalls).toBe(1);
    const sub = ctl.state.sub as { startsAt: Date; endsAt: Date };
    expect(monthsBetween(sub.startsAt, sub.endsAt)).toBe(1);
  });
});
