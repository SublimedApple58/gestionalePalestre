import { AccessEventType, type PrismaClient } from "@gestionale/db";

import {
  KEYPAD_PIN_UNLOCK_CODE,
  listDoorLockOpenLogs
} from "@/lib/tuya/access-control";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

// Re-fetch a small overlap before the last synced entry so a missed log between
// runs is still picked up; the unique `externalRef` prevents duplicates.
const OVERLAP_MS = 15 * 60 * 1000;
// On the very first run (no keypad entries yet) seed the last 24h of history.
const BOOTSTRAP_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // safety cap (2000 logs/run, far above real volume)

export type AccessLogSyncResult = {
  windowStart: string;
  windowEnd: string;
  fetched: number;
  keypadEntries: number;
  created: number;
  unmatchedUserIds: string[];
  entryPackagesUpdated: number;
  entryPackagesExhausted: number;
};

/**
 * Pulls real keypad unlock logs from Tuya and records them as AccessEvent
 * (KEYPAD_UNLOCK) so admins see who actually entered the gym.
 *
 * - Window starts just before the most recent synced keypad entry (with overlap),
 *   or 24h ago on first run. Self-heals if the cron was down for a while.
 * - Only PIN keypad entries (status.code === unlock_password_kit) are recorded;
 *   the remote "Apri porta" is logged separately as DOOR_OPEN.
 * - Tuya user_id maps to User.tuyaUserId; entries for unknown users are skipped.
 * - Dedup via unique externalRef (`tuya:{user_id}:{update_time}`).
 */
export async function runTuyaAccessLogSyncJob(
  prisma: PrismaClient
): Promise<AccessLogSyncResult> {
  const now = Date.now();

  const last = await prisma.accessEvent.findFirst({
    where: { eventType: AccessEventType.KEYPAD_UNLOCK },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true }
  });

  const startMs = last
    ? last.occurredAt.getTime() - OVERLAP_MS
    : now - BOOTSTRAP_MS;
  const endMs = now;

  const raw: Array<{ userId: string; updateMs: number }> = [];
  let fetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { total, logs } = await listDoorLockOpenLogs({
      startMs,
      endMs,
      pageNo: page,
      pageSize: PAGE_SIZE
    });
    fetched += logs.length;

    for (const log of logs) {
      if (log.status?.code !== KEYPAD_PIN_UNLOCK_CODE) continue;
      if (!log.user_id || !log.update_time) continue;
      raw.push({ userId: log.user_id, updateMs: log.update_time });
    }

    if (logs.length < PAGE_SIZE || fetched >= total) break;
  }

  const result: AccessLogSyncResult = {
    windowStart: new Date(startMs).toISOString(),
    windowEnd: new Date(endMs).toISOString(),
    fetched,
    keypadEntries: raw.length,
    created: 0,
    unmatchedUserIds: [],
    entryPackagesUpdated: 0,
    entryPackagesExhausted: 0
  };

  if (raw.length === 0) {
    return result;
  }

  const tuyaUserIds = [...new Set(raw.map((r) => r.userId))];
  const users = await prisma.user.findMany({
    where: { tuyaUserId: { in: tuyaUserIds } },
    select: { id: true, tuyaUserId: true }
  });
  const byTuyaId = new Map(
    users.flatMap((u) => (u.tuyaUserId ? [[u.tuyaUserId, u.id] as const] : []))
  );

  const unmatched = new Set<string>();
  const data: Array<{
    userId: string;
    eventType: AccessEventType;
    note: string;
    externalRef: string;
    occurredAt: Date;
  }> = [];

  for (const r of raw) {
    const userId = byTuyaId.get(r.userId);
    if (!userId) {
      unmatched.add(r.userId);
      continue;
    }
    data.push({
      userId,
      eventType: AccessEventType.KEYPAD_UNLOCK,
      note: "Ingresso con codice al tastierino",
      externalRef: `tuya:${r.userId}:${r.updateMs}`,
      occurredAt: new Date(r.updateMs)
    });
  }

  if (data.length > 0) {
    const created = await prisma.accessEvent.createMany({
      data,
      skipDuplicates: true
    });
    result.created = created.count;
  }

  // ── Pacchetti ingressi: ricalcolo idempotente ──────────────────────────────
  // Per i soli utenti entrati in questa finestra e con un pacchetto ATTIVO,
  // ricalcoliamo `remainingEntries` dagli eventi immutabili (KEYPAD_UNLOCK dopo
  // `startsAt`). Derivare dal conteggio — invece di decrementare per riga — è
  // idempotente: le finestre sovrapposte (`skipDuplicates`) non doppio-contano.
  // A 0 disabilitiamo il PIN via safeSyncPinToKeypad.
  const affectedUserIds = [...new Set(data.map((d) => d.userId))];
  if (affectedUserIds.length > 0) {
    const packages = await prisma.userEntryPackage.findMany({
      where: { userId: { in: affectedUserIds }, deactivatedAt: null },
      select: { id: true, userId: true, totalEntries: true, remainingEntries: true, startsAt: true }
    });
    for (const pkg of packages) {
      const usedCount = await prisma.accessEvent.count({
        where: {
          userId: pkg.userId,
          eventType: AccessEventType.KEYPAD_UNLOCK,
          occurredAt: { gte: pkg.startsAt }
        }
      });
      const newRemaining = Math.max(0, pkg.totalEntries - usedCount);
      if (newRemaining !== pkg.remainingEntries) {
        await prisma.userEntryPackage.update({
          where: { id: pkg.id },
          data: { remainingEntries: newRemaining }
        });
        result.entryPackagesUpdated++;
        if (newRemaining === 0) {
          result.entryPackagesExhausted++;
          // Ingressi finiti → disabilita il codice porta.
          safeSyncPinToKeypad(prisma, pkg.userId);
        }
      }
    }
  }

  result.unmatchedUserIds = [...unmatched];
  return result;
}
