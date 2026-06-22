import { AccessEventType, type PrismaClient, UserRole } from "@gestionale/db";

import { recordKeypadUnlock } from "@/lib/services/access-event-service";

const activeSub = {
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-31T23:59:59.999Z"),
  deactivatedAt: null as Date | null
};

const expiredSub = {
  startsAt: new Date("2025-01-01T00:00:00.000Z"),
  endsAt: new Date("2025-12-31T23:59:59.999Z"),
  deactivatedAt: null as Date | null
};

type CreatedEvent = {
  userId: string;
  eventType: AccessEventType;
  note: string;
  occurredAt?: Date;
};

function fakePrisma(candidates: unknown[]): {
  prisma: PrismaClient;
  created: CreatedEvent[];
} {
  const created: CreatedEvent[] = [];
  const prisma = {
    user: {
      findMany: async () => candidates
    },
    accessEvent: {
      create: async ({ data }: { data: CreatedEvent }) => {
        created.push(data);
        return { id: "evt-1", ...data };
      }
    }
  } as unknown as PrismaClient;
  return { prisma, created };
}

describe("recordKeypadUnlock", () => {
  it("non logga nulla se il codice non corrisponde a nessun utente", async () => {
    const { prisma, created } = fakePrisma([]);
    const res = await recordKeypadUnlock(prisma, { code: "000000" });
    expect(res).toEqual({ matched: false });
    expect(created).toHaveLength(0);
  });

  it("logga un KEYPAD_UNLOCK per l'utente che possiede il codice", async () => {
    const { prisma, created } = fakePrisma([
      { id: "u1", role: UserRole.SUBSCRIBER, subscription: activeSub }
    ]);
    const occurredAt = new Date("2026-06-22T23:30:00.000Z");

    const res = await recordKeypadUnlock(prisma, {
      code: "123456",
      occurredAt,
      method: "password"
    });

    expect(res).toEqual({ matched: true, userId: "u1", ambiguous: false });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: "u1",
      eventType: AccessEventType.KEYPAD_UNLOCK,
      occurredAt
    });
    expect(created[0]!.note).toContain("password");
  });

  it("con codice condiviso preferisce l'utente attualmente autorizzato e segnala ambiguità", async () => {
    const { prisma, created } = fakePrisma([
      { id: "u-expired", role: UserRole.SUBSCRIBER, subscription: expiredSub },
      { id: "u-active", role: UserRole.SUBSCRIBER, subscription: activeSub }
    ]);

    const res = await recordKeypadUnlock(prisma, { code: "777777" });

    expect(res.matched).toBe(true);
    expect(res.ambiguous).toBe(true);
    expect(res.userId).toBe("u-active");
    expect(created[0]!.userId).toBe("u-active");
    expect(created[0]!.note).toContain("condiviso");
  });

  it("se nessun candidato è autorizzato ricade sul primo (audit comunque registrato)", async () => {
    const { prisma, created } = fakePrisma([
      { id: "u-expired", role: UserRole.SUBSCRIBER, subscription: expiredSub }
    ]);

    const res = await recordKeypadUnlock(prisma, { code: "888888" });

    expect(res.matched).toBe(true);
    expect(res.userId).toBe("u-expired");
    expect(created).toHaveLength(1);
  });
});
