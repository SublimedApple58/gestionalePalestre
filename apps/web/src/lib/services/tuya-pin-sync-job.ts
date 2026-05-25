import { type PrismaClient, UserRole } from "@gestionale/db";

import { isSubscriptionActive } from "@/lib/subscription";

import { ensureTuyaUser, syncPinToKeypad } from "./tuya-pin-service";

type SyncResult = {
  deactivated: number;
  activated: number;
  registered: number;
  errors: string[];
};

const DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reconciliation job: ensures DB state matches keypad state for all users.
 * Processes sequentially with rate limiting to respect Tuya API limits.
 */
export async function runTuyaPinSyncJob(prisma: PrismaClient): Promise<SyncResult> {
  const result: SyncResult = { deactivated: 0, activated: 0, registered: 0, errors: [] };

  // 1. Subscribers with active PIN but expired/deactivated/missing subscription → disable
  const activeSubscribers = await prisma.user.findMany({
    where: { role: UserRole.SUBSCRIBER, tuyaPinActive: true },
    select: {
      id: true,
      tuyaUserId: true,
      tuyaPinUnlockNo: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  for (const user of activeSubscribers) {
    if (!isSubscriptionActive(user.subscription)) {
      try {
        await syncPinToKeypad(prisma, user.id);
        result.deactivated++;
        await delay(DELAY_MS);
      } catch (err) {
        result.errors.push(`deactivate ${user.id}: ${(err as Error).message}`);
      }
    }
  }

  // 2. ADMIN/INSTRUCTOR without active PIN → enable
  const staffWithoutPin = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.ADMIN, UserRole.INSTRUCTOR] },
      tuyaPinActive: false,
    },
    select: { id: true },
  });

  for (const user of staffWithoutPin) {
    try {
      await syncPinToKeypad(prisma, user.id);
      result.activated++;
      await delay(DELAY_MS);
    } catch (err) {
      result.errors.push(`activate ${user.id}: ${(err as Error).message}`);
    }
  }

  // 2b. SUBSCRIBER with active subscription but PIN off → enable
  const subscribersNeedingPin = await prisma.user.findMany({
    where: {
      role: UserRole.SUBSCRIBER,
      tuyaPinActive: false,
      subscription: {
        deactivatedAt: null,
        endsAt: { gte: new Date() },
        startsAt: { lte: new Date() },
      },
    },
    select: { id: true },
  });

  for (const user of subscribersNeedingPin) {
    try {
      await syncPinToKeypad(prisma, user.id);
      result.activated++;
      await delay(DELAY_MS);
    } catch (err) {
      result.errors.push(`activate-sub ${user.id}: ${(err as Error).message}`);
    }
  }

  // 3. Users without tuyaUserId → register on Tuya
  const unregistered = await prisma.user.findMany({
    where: { tuyaUserId: null },
    select: { id: true },
  });

  for (const user of unregistered) {
    try {
      await ensureTuyaUser(prisma, user.id);
      result.registered++;
      await delay(DELAY_MS);
    } catch (err) {
      result.errors.push(`register ${user.id}: ${(err as Error).message}`);
    }
  }

  return result;
}
