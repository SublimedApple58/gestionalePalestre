import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressione "codici che spariscono": il health-check notturno deve, SOLO per la
 * fetta di rotazione di stanotte e dentro i tetti di budget Tuya:
 *  - chiave presente  → ri-affermare permanente (no riscrittura PIN);
 *  - chiave MANCANTE  → ripubblicare il PIN (enablePin + permanent) e allineare il DB;
 *  - utente orfano    → contarlo e lasciarlo a pin-sync (nessuna riscrittura);
 *  - errore di lettura non-orfano → saltare SENZA riscrivere (niente rischio su PIN sani);
 *  - rispettare maxCalls (il consumo Tuya non supera mai il tetto).
 */

const tuya = vi.hoisted(() => ({
  getAssignedKeys: vi.fn(),
  enablePin: vi.fn(),
  setUserPermanent: vi.fn(),
}));

vi.mock("@/lib/tuya/access-control", () => ({
  getAssignedKeys: tuya.getAssignedKeys,
  enablePin: tuya.enablePin,
  setUserPermanent: tuya.setUserPermanent,
}));

import { runTuyaPinHealthJob } from "@/lib/services/tuya-pin-health-job";

const activeSub = {
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: new Date("2027-01-01T00:00:00Z"),
  deactivatedAt: null,
  autoRenew: false,
};
const expiredSub = {
  startsAt: new Date("2025-01-01T00:00:00Z"),
  endsAt: new Date("2025-02-01T00:00:00Z"),
  deactivatedAt: null,
  autoRenew: false,
};

function makeUser(over: Record<string, unknown>) {
  return {
    id: "u",
    firstName: "N",
    lastName: "C",
    accessCode: "000000",
    tuyaUserId: "t",
    role: "SUBSCRIBER",
    subscription: activeSub,
    entryPackage: null,
    ...over,
  };
}

function fakePrisma(
  users: Array<Record<string, unknown>>,
  recentPaidUserIds: string[] = []
) {
  const updates: Array<{ where: unknown; data: unknown }> = [];
  return {
    updates,
    user: {
      findMany: async () => users,
      update: async (args: { where: unknown; data: unknown }) => {
        updates.push(args);
        return {};
      },
    },
    payment: {
      findMany: async () => recentPaidUserIds.map((userId) => ({ userId })),
    },
  };
}

const NOW = new Date("2026-10-14T03:30:00Z");

describe("runTuyaPinHealthJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tuya.enablePin.mockResolvedValue("1");
    tuya.setUserPermanent.mockResolvedValue({});
  });

  it("sana→reassert, mancante→ripubblica, orfano→conteggia; rotationDays=1 copre tutti", async () => {
    tuya.getAssignedKeys.mockImplementation(async (id: string) => {
      if (id === "healthy") return { unlock_keys: [{ unlock_no: 9, unlock_type: "password" }] };
      if (id === "missing") return { unlock_keys: [] };
      if (id === "orphan") throw new Error("Tuya API error [2331]: lock user not exist");
      return { unlock_keys: [] };
    });

    const users = [
      makeUser({ id: "a", tuyaUserId: "healthy", accessCode: "111111" }),
      makeUser({ id: "b", tuyaUserId: "missing", accessCode: "222222" }),
      makeUser({ id: "c", tuyaUserId: "orphan", accessCode: "333333" }),
      makeUser({ id: "d", tuyaUserId: "exp", accessCode: "444444", subscription: expiredSub }), // NON idoneo
    ];
    const prisma = fakePrisma(users);

    const r = await runTuyaPinHealthJob(prisma as never, {
      now: NOW,
      rotationDays: 1,
      delayMs: 0,
    });

    expect(r.eligibleTotal).toBe(3); // l'espirato è escluso
    expect(r.inBucket).toBe(3);
    expect(r.checked).toBe(3);
    expect(r.healthyReasserted).toBe(1);
    expect(r.repaired).toBe(1);
    expect(r.orphansSeen).toBe(1);

    // La chiave mancante è stata ripubblicata; la sana NO.
    expect(tuya.enablePin).toHaveBeenCalledTimes(1);
    expect(tuya.enablePin).toHaveBeenCalledWith("missing", "222222");
    // setUserPermanent: 1 per la sana + 1 nella riparazione della mancante.
    expect(tuya.setUserPermanent).toHaveBeenCalledTimes(2);
    // DB allineato SOLO per la riparata.
    expect(prisma.updates).toHaveLength(1);
    expect(prisma.updates[0]).toMatchObject({
      where: { id: "b" },
      data: { tuyaPinActive: true, tuyaPinUnlockNo: "1" },
    });
    // read(3) + permanent(1 sana) + enable(1) + permanent(1 riparazione) = 6
    expect(r.tuyaCalls).toBe(6);
  });

  it("un errore di lettura NON-orfano non innesca riscritture", async () => {
    tuya.getAssignedKeys.mockRejectedValue(new Error("Tuya API error [500]: timeout"));
    const prisma = fakePrisma([makeUser({ id: "a", tuyaUserId: "x", accessCode: "111111" })]);

    const r = await runTuyaPinHealthJob(prisma as never, { now: NOW, rotationDays: 1, delayMs: 0 });

    expect(r.readErrors).toBe(1);
    expect(r.repaired).toBe(0);
    expect(r.orphansSeen).toBe(0);
    expect(tuya.enablePin).not.toHaveBeenCalled();
    expect(tuya.setUserPermanent).not.toHaveBeenCalled();
    expect(prisma.updates).toHaveLength(0);
  });

  it("rispetta il tetto maxCalls (budget Tuya)", async () => {
    tuya.getAssignedKeys.mockResolvedValue({ unlock_keys: [{ unlock_no: 1, unlock_type: "password" }] });
    const users = Array.from({ length: 10 }, (_, i) =>
      makeUser({ id: `u${i}`, tuyaUserId: `t${i}`, accessCode: `10000${i}` })
    );
    const prisma = fakePrisma(users);

    const r = await runTuyaPinHealthJob(prisma as never, {
      now: NOW,
      rotationDays: 1,
      maxCalls: 3,
      delayMs: 0,
    });

    expect(r.tuyaCalls).toBeLessThanOrEqual(3);
    expect(r.deferred).toBeGreaterThan(0);
  });

  it("un codice attivato nelle ultime 48h è controllato subito, fuori dalla rotazione", async () => {
    tuya.getAssignedKeys.mockResolvedValue({ unlock_keys: [{ unlock_no: 1, unlock_type: "password" }] });
    const users = Array.from({ length: 20 }, (_, i) =>
      makeUser({ id: `user-${i}`, tuyaUserId: `t${i}`, accessCode: `30000${i}` })
    );
    // rotationDays enorme → quasi nessuno nel bucket di stanotte; ma "user-7" ha un
    // pagamento PAID recente → deve essere controllato comunque (priorità).
    const prisma = fakePrisma(users, ["user-7"]);

    const r = await runTuyaPinHealthJob(prisma as never, {
      now: NOW,
      rotationDays: 100000,
      delayMs: 0,
    });

    expect(r.priorityRecent).toBe(1);
    expect(r.checked).toBeGreaterThanOrEqual(1);
    expect(tuya.getAssignedKeys).toHaveBeenCalledWith("t7");
  });

  it("la rotazione controlla solo una fetta quando rotationDays>1", async () => {
    tuya.getAssignedKeys.mockResolvedValue({ unlock_keys: [{ unlock_no: 1, unlock_type: "password" }] });
    const users = Array.from({ length: 20 }, (_, i) =>
      makeUser({ id: `user-${i}`, tuyaUserId: `t${i}`, accessCode: `20000${i}` })
    );
    const prisma = fakePrisma(users);

    const r = await runTuyaPinHealthJob(prisma as never, { now: NOW, rotationDays: 7, delayMs: 0 });

    expect(r.eligibleTotal).toBe(20);
    expect(r.inBucket).toBeLessThan(20); // solo ~1/7 stanotte
    expect(r.checked).toBe(r.inBucket);
  });
});
