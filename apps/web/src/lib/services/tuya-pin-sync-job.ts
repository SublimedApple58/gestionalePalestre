import { type PrismaClient } from "@gestionale/db";

import { syncPinToKeypad, ensureTuyaUser } from "./tuya-pin-service";

type SyncResult = {
  total: number;
  synced: number;
  errors: string[];
};

const DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sync brutale: prende TUTTI gli utenti e per ciascuno chiama syncPinToKeypad.
 * La logica e' dentro syncPinToKeypad:
 *   - abbonamento attivo (o admin/instructor) → PIN deve esserci
 *   - altrimenti → PIN deve essere rimosso
 *
 * Nessuna pre-filtratura, nessuna assunzione sullo stato DB.
 * Rate-limited a 300ms tra una chiamata e l'altra.
 */
export async function runTuyaPinSyncJob(prisma: PrismaClient): Promise<SyncResult> {
  const result: SyncResult = { total: 0, synced: 0, errors: [] };

  const users = await prisma.user.findMany({
    where: { tuyaUserId: { not: null } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  result.total = users.length;

  for (const user of users) {
    try {
      await syncPinToKeypad(prisma, user.id);
      result.synced++;
    } catch (err) {
      result.errors.push(`${user.id}: ${(err as Error).message}`);
    }
    await delay(DELAY_MS);
  }

  // Also register users without tuyaUserId
  const unregistered = await prisma.user.findMany({
    where: { tuyaUserId: null },
    select: { id: true },
  });

  for (const user of unregistered) {
    try {
      await ensureTuyaUser(prisma, user.id);
      result.synced++;
    } catch (err) {
      result.errors.push(`register ${user.id}: ${(err as Error).message}`);
    }
    await delay(DELAY_MS);
  }

  result.total += unregistered.length;

  return result;
}
