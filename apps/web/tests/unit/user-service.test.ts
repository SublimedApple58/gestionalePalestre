import { SubscriptionTier, UserRole, type PrismaClient } from "@gestionale/db";
import { describe, expect, it, vi } from "vitest";

import {
  assignSubscriptionByAdmin,
  createUserByAdmin,
  updateUserRoleByAdmin
} from "@/lib/services/user-service";

describe("user service business rules", () => {
  it("blocca la creazione utente se l'attore non e' admin", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn()
      }
    } as unknown as PrismaClient;

    await expect(
      createUserByAdmin(prisma, UserRole.SUBSCRIBER, {
        firstName: "A",
        lastName: "B",
        email: "foo@example.com",
        password: "Password123!",
        role: UserRole.SUBSCRIBER
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocca downgrade dell'ultimo admin", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ role: UserRole.ADMIN }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
        updateMany: vi.fn()
      }
    } as unknown as PrismaClient;

    await expect(
      updateUserRoleByAdmin(prisma, UserRole.ADMIN, {
        targetUserId: "admin-1",
        role: UserRole.SUBSCRIBER
      })
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("assegna abbonamento solo ad abbonati", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ role: UserRole.INSTRUCTOR })
      },
      userSubscription: {
        upsert: vi.fn()
      }
    } as unknown as PrismaClient;

    await expect(
      assignSubscriptionByAdmin(prisma, UserRole.ADMIN, "admin-1", {
        targetUserId: "instructor-1",
        tier: SubscriptionTier.MONTHLY,
        startsAt: new Date("2026-03-01T00:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: "INVALID_ROLE" });
  });
});
