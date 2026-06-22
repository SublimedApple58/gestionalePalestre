import { type PrismaClient, UserRole } from "@gestionale/db";

import {
  getActiveAccessCodes,
  shouldHaveAccess
} from "@/lib/access/authorization";

const NOW = new Date("2026-06-22T12:00:00.000Z");

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

describe("shouldHaveAccess", () => {
  it("ADMIN ha sempre accesso, anche senza abbonamento", () => {
    expect(shouldHaveAccess({ role: UserRole.ADMIN, subscription: null }, NOW)).toBe(true);
  });

  it("INSTRUCTOR ha sempre accesso, anche senza abbonamento", () => {
    expect(shouldHaveAccess({ role: UserRole.INSTRUCTOR, subscription: null }, NOW)).toBe(true);
  });

  it("SUBSCRIBER ha accesso solo con abbonamento attivo", () => {
    expect(shouldHaveAccess({ role: UserRole.SUBSCRIBER, subscription: activeSub }, NOW)).toBe(true);
    expect(shouldHaveAccess({ role: UserRole.SUBSCRIBER, subscription: expiredSub }, NOW)).toBe(false);
    expect(shouldHaveAccess({ role: UserRole.SUBSCRIBER, subscription: null }, NOW)).toBe(false);
  });

  it("SUBSCRIBER con abbonamento disattivato non ha accesso", () => {
    expect(
      shouldHaveAccess(
        { role: UserRole.SUBSCRIBER, subscription: { ...activeSub, deactivatedAt: NOW } },
        NOW
      )
    ).toBe(false);
  });
});

describe("getActiveAccessCodes", () => {
  function fakePrisma(users: unknown[]): PrismaClient {
    return {
      user: {
        findMany: async () => users
      }
    } as unknown as PrismaClient;
  }

  it("materializza solo gli utenti che devono avere accesso, con nome completo", async () => {
    const prisma = fakePrisma([
      {
        id: "u-admin",
        firstName: "Anna",
        lastName: "Rossi",
        role: UserRole.ADMIN,
        accessCode: "111111",
        subscription: null
      },
      {
        id: "u-sub-active",
        firstName: "Luca",
        lastName: "Bianchi",
        role: UserRole.SUBSCRIBER,
        accessCode: "222222",
        subscription: activeSub
      },
      {
        id: "u-sub-expired",
        firstName: "Mara",
        lastName: "Verdi",
        role: UserRole.SUBSCRIBER,
        accessCode: "333333",
        subscription: expiredSub
      }
    ]);

    const codes = await getActiveAccessCodes(prisma, NOW);

    expect(codes).toHaveLength(2);
    expect(codes.map((c) => c.userId).sort()).toEqual(["u-admin", "u-sub-active"]);

    const admin = codes.find((c) => c.userId === "u-admin");
    expect(admin).toEqual({
      userId: "u-admin",
      code: "111111",
      name: "Anna Rossi",
      role: UserRole.ADMIN
    });

    // l'abbonato scaduto NON deve comparire
    expect(codes.find((c) => c.userId === "u-sub-expired")).toBeUndefined();
  });

  it("ritorna lista vuota se nessuno è idoneo", async () => {
    const prisma = fakePrisma([
      {
        id: "u-sub-expired",
        firstName: "Mara",
        lastName: "Verdi",
        role: UserRole.SUBSCRIBER,
        accessCode: "333333",
        subscription: expiredSub
      }
    ]);

    const codes = await getActiveAccessCodes(prisma, NOW);
    expect(codes).toEqual([]);
  });
});
