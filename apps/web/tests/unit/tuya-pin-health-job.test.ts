import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressione "codici che spariscono": il health-check notturno deve, SOLO per la
 * fetta di rotazione di stanotte e dentro i tetti di budget Tuya:
 *  - chiave presente  → nessuna scrittura (lo stato validità lo dà lo scan);
 *  - chiave MANCANTE  → ripubblicare il PIN (enablePin + permanent) e allineare il DB;
 *  - utente orfano    → contarlo e lasciarlo a pin-sync (nessuna riscrittura);
 *  - errore di lettura non-orfano → saltare SENZA riscrivere (niente rischio su PIN sani);
 *  - rispettare maxCalls (il consumo Tuya non supera mai il tetto).
 */

const tuya = vi.hoisted(() => ({
  getAssignedKeys: vi.fn(),
  enablePin: vi.fn(),
  setUserPermanent: vi.fn(),
  deleteTuyaUser: vi.fn(),
  listDeviceUserSchedules: vi.fn(),
  recreateTuyaMember: vi.fn(),
}));

vi.mock("@/lib/tuya/access-control", () => ({
  getAssignedKeys: tuya.getAssignedKeys,
  enablePin: tuya.enablePin,
  setUserPermanent: tuya.setUserPermanent,
  deleteTuyaUser: tuya.deleteTuyaUser,
  listDeviceUserSchedules: tuya.listDeviceUserSchedules,
}));

vi.mock("@/lib/services/tuya-pin-service", () => ({
  recreateTuyaMember: tuya.recreateTuyaMember,
  isTuyaUserGoneError: (m: string) => m.includes("1109"),
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
    tuyaPinActive: true,
    updatedAt: new Date("2026-10-01T00:00:00Z"),
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
    tuya.deleteTuyaUser.mockResolvedValue(true);
    tuya.recreateTuyaMember.mockResolvedValue({});
    // Default: scan vuoto (nessun member) → fasi B e D inerti.
    tuya.listDeviceUserSchedules.mockResolvedValue({ rows: [], calls: 1 });
  });

  it("sana→nessuna scrittura, mancante→ripubblica, orfano→conteggia; rotationDays=1 copre tutti", async () => {
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
    expect(r.healthyOk).toBe(1);
    expect(r.repaired).toBe(1);
    expect(r.orphansSeen).toBe(1);

    // La chiave mancante è stata ripubblicata; la sana NO.
    expect(tuya.enablePin).toHaveBeenCalledTimes(1);
    expect(tuya.enablePin).toHaveBeenCalledWith("missing", "222222");
    // setUserPermanent SOLO nella riparazione della mancante (niente reassert cieco).
    expect(tuya.setUserPermanent).toHaveBeenCalledTimes(1);
    // DB allineato SOLO per la riparata.
    expect(prisma.updates).toHaveLength(1);
    expect(prisma.updates[0]).toMatchObject({
      where: { id: "b" },
      data: { tuyaPinActive: true, tuyaPinUnlockNo: "1" },
    });
    // scan(1) + read(3) + enable(1) + permanent(1 riparazione) = 6
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

  const sched = (status: string, permanent = true) => ({
    permanent,
    effective_time: 0,
    expired_time: 0,
    operate: "MODIFY",
    delivery_status: status,
  });
  const row = (user_id: string, nick_name: string, lock: number, s: unknown) => ({
    user_id,
    nick_name,
    user_type: 20,
    lock_user_id: lock,
    time_schedule_info: s,
  });

  it("validità FAILED o ONGOING vecchio → recreate (con tetto); ONGOING fresco → aspetta", async () => {
    tuya.getAssignedKeys.mockResolvedValue({ unlock_keys: [{ unlock_no: 1, unlock_type: "password" }] });
    const users = [
      makeUser({ id: "ok", tuyaUserId: "t-ok", firstName: "A", lastName: "Ok" }),
      makeUser({ id: "failed", tuyaUserId: "t-failed", firstName: "B", lastName: "Failed", accessCode: "971328" }),
      makeUser({ id: "stale", tuyaUserId: "t-stale", firstName: "C", lastName: "Stale" }),
      // ONGOING ma toccato 10 minuti fa: consegna ancora in corso → niente recreate
      makeUser({ id: "fresh", tuyaUserId: "t-fresh", firstName: "D", lastName: "Fresh", updatedAt: new Date(NOW.getTime() - 10 * 60 * 1000) }),
      makeUser({ id: "limited", tuyaUserId: "t-limited", firstName: "E", lastName: "Limited" }),
    ];
    tuya.listDeviceUserSchedules.mockResolvedValue({
      calls: 1,
      rows: [
        row("t-ok", "A Ok", 1, sched("SUCCESS")),
        row("t-failed", "B Failed", 2, sched("FAILED")),
        row("t-stale", "C Stale", 3, sched("ONGOING")),
        row("t-fresh", "D Fresh", 4, sched("ONGOING")),
        row("t-limited", "E Limited", 5, sched("SUCCESS", false)),
      ],
    });
    const prisma = fakePrisma(users);

    const r = await runTuyaPinHealthJob(prisma as never, { now: NOW, rotationDays: 100000, delayMs: 0, maxRecreates: 1 });

    expect(r.stuckFound).toBe(2);
    expect(r.stuckRecreated).toBe(1); // tetto
    expect(r.deferred).toBeGreaterThanOrEqual(1);
    expect(tuya.recreateTuyaMember).toHaveBeenCalledTimes(1);
    expect(tuya.recreateTuyaMember).toHaveBeenCalledWith(prisma, "failed");
    expect(r.stuckCodes).toEqual(["B Failed: 971328"]);
    // Non permanente ma consegnato → solo 1 setUserPermanent leggero.
    expect(r.permanentResent).toBe(1);
    expect(tuya.setUserPermanent).toHaveBeenCalledWith("t-limited");
  });

  it("orfani: cancella solo gli ex iscritti validi; lascia scaduti, i più recenti e TUTTI i gemelli di iscritti attivi", async () => {
    const users = [
      makeUser({ id: "a", tuyaUserId: "t-a", firstName: "Simone", lastName: "Attivo" }),
      makeUser({ id: "b", tuyaUserId: "t-b", firstName: "Bruno", lastName: "Senzachiave" }),
    ];
    tuya.getAssignedKeys.mockImplementation(async (id: string) =>
      id === "t-a" ? { unlock_keys: [{ unlock_no: 1, unlock_type: "password" }] } : { unlock_keys: [] }
    );
    tuya.listDeviceUserSchedules.mockResolvedValue({
      calls: 1,
      rows: [
        row("t-a", "Simone Attivo", 50, sched("SUCCESS")),
        row("t-b", "Bruno Senzachiave", 51, sched("SUCCESS")),
        row("o-new", "Appena Creato", 99, sched("SUCCESS")), // più nuovo dell'ultimo collegato
        row("o-ex", "Dario Scaduto", 10, sched("SUCCESS")), // ex iscritto, PIN valido
        row("o-exp", "Vecchio Limitato", 11, { permanent: false, effective_time: 1, expired_time: 2 }),
        row("o-twin", "Simone Attivo", 12, sched("SUCCESS")), // gemello di iscritto con password
        row("o-twin-b", "Bruno Senzachiave", 13, sched("SUCCESS")), // gemello di iscritto SENZA password
        { user_id: "owner", nick_name: "Owner", user_type: 50, lock_user_id: 1, time_schedule_info: sched("SUCCESS") },
      ],
    });
    const prisma = fakePrisma(users);

    const r = await runTuyaPinHealthJob(prisma as never, { now: NOW, rotationDays: 100000, delayMs: 0 });

    expect(r.orphansExpired).toBe(1);
    expect(r.orphansValid).toBe(1);
    expect(r.orphansTwinsKept).toBe(2);
    expect(r.orphansDeleted).toBe(1);
    expect(tuya.deleteTuyaUser.mock.calls.map((c) => c[0])).toEqual(["o-ex"]);
  });

  it("orfani: rispetta maxOrphanDeletes (spalmate su più notti)", async () => {
    const users = [makeUser({ id: "a", tuyaUserId: "t-a" })];
    tuya.listDeviceUserSchedules.mockResolvedValue({
      calls: 1,
      rows: [
        row("t-a", "N C", 1000, sched("SUCCESS")),
        ...Array.from({ length: 10 }, (_, i) => row(`o${i}`, `Ex ${i}`, i + 1, sched("SUCCESS"))),
      ],
    });
    const prisma = fakePrisma(users);

    const r = await runTuyaPinHealthJob(prisma as never, { now: NOW, rotationDays: 100000, delayMs: 0, maxOrphanDeletes: 3 });

    expect(r.orphansDeleted).toBe(3);
    expect(r.orphansRemaining).toBe(7);
    expect(tuya.deleteTuyaUser).toHaveBeenCalledTimes(3);
  });

  it("scan fallito → niente recreate né cancellazioni (solo rotazione chiavi)", async () => {
    tuya.listDeviceUserSchedules.mockRejectedValue(new Error("Tuya API error [500]"));
    tuya.getAssignedKeys.mockResolvedValue({ unlock_keys: [{ unlock_no: 1, unlock_type: "password" }] });
    const prisma = fakePrisma([makeUser({ id: "a", tuyaUserId: "t-a" })]);

    const r = await runTuyaPinHealthJob(prisma as never, { now: NOW, rotationDays: 1, delayMs: 0 });

    expect(r.deviceMembers).toBe(-1);
    expect(tuya.recreateTuyaMember).not.toHaveBeenCalled();
    expect(tuya.deleteTuyaUser).not.toHaveBeenCalled();
    expect(r.checked).toBe(1);
  });
});
