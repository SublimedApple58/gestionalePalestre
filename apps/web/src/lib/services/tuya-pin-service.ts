import { type PrismaClient, UserRole } from "@gestionale/db";

import {
  createTuyaUser,
  deleteTuyaUser,
  disablePin,
  enablePin,
} from "@/lib/tuya/access-control";
import { isSubscriptionActive } from "@/lib/subscription";

/**
 * Ensures the user has a Tuya account on the device.
 * Creates one if missing and persists the tuyaUserId in the DB.
 */
export async function ensureTuyaUser(
  prisma: PrismaClient,
  userId: string
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, tuyaUserId: true, firstName: true, lastName: true },
  });

  if (user.tuyaUserId) return user.tuyaUserId;

  const tuyaUserId = await createTuyaUser(
    `${user.firstName} ${user.lastName}`
  );

  await prisma.user.update({
    where: { id: userId },
    data: { tuyaUserId },
  });

  return tuyaUserId;
}

/**
 * Core sync logic: determines if the user SHOULD have an active PIN on the keypad
 * and enables/disables accordingly.
 */
export async function syncPinToKeypad(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      accessCode: true,
      tuyaUserId: true,
      tuyaPinUnlockNo: true,
      tuyaPinActive: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  const shouldHavePin =
    user.role === UserRole.ADMIN ||
    user.role === UserRole.INSTRUCTOR ||
    (user.role === UserRole.SUBSCRIBER &&
      isSubscriptionActive(user.subscription));

  if (shouldHavePin && !user.tuyaPinActive) {
    // Activate PIN
    const tuyaUserId = await ensureTuyaUser(prisma, userId);
    const unlockNo = await enablePin(tuyaUserId, user.accessCode);

    await prisma.user.update({
      where: { id: userId },
      data: {
        tuyaPinUnlockNo: unlockNo,
        tuyaPinActive: true,
      },
    });
  } else if (!shouldHavePin && user.tuyaPinActive) {
    // Deactivate PIN
    if (user.tuyaUserId) {
      await disablePin(user.tuyaUserId, user.tuyaPinUnlockNo ?? "1");
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        tuyaPinActive: false,
        tuyaPinUnlockNo: null,
      },
    });
  }
  // If state already aligned → no-op
}

/**
 * Fire-and-forget wrapper. Logs errors but never throws.
 * Use everywhere except migration scripts where you want errors to surface.
 */
export function safeSyncPinToKeypad(
  prisma: PrismaClient,
  userId: string
): void {
  syncPinToKeypad(prisma, userId).catch((err) => {
    console.error(
      `[tuya-pin] Failed to sync PIN for user ${userId}:`,
      err
    );
  });
}

/**
 * Full cleanup: disables PIN (if active) then deletes the Tuya user.
 * Used before deleting a user from the DB.
 */
export async function removeTuyaUserCompletely(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      tuyaUserId: true,
      tuyaPinUnlockNo: true,
      tuyaPinActive: true,
    },
  });

  if (!user?.tuyaUserId) return;

  if (user.tuyaPinActive && user.tuyaPinUnlockNo) {
    await disablePin(user.tuyaUserId, user.tuyaPinUnlockNo);
  }

  await deleteTuyaUser(user.tuyaUserId);

  await prisma.user.update({
    where: { id: userId },
    data: {
      tuyaUserId: null,
      tuyaPinUnlockNo: null,
      tuyaPinActive: false,
    },
  });
}
