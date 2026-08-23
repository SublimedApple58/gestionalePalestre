import { type PrismaClient } from "@gestionale/db";

import { shouldHaveDoorPin } from "@/lib/subscription";
import { listTuyaUsers } from "@/lib/tuya/access-control";

import { syncPinToKeypad } from "./tuya-pin-service";

type SyncResult = {
  total: number;
  deviceUsers: number; // utenti presenti sul device all'inizio (-1 se list KO)
  added: number; // PIN attivati (nuovi/riattivati)
  orphansFixed: number; // utenti idonei ricreati perché il device li aveva persi
  removed: number; // utenti non idonei cancellati dal device
  skipped: number; // già coerenti → nessuna chiamata Tuya
  errors: string[];
};

const DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reconcile notturno LEGGERO e drift-aware (sostituisce il vecchio sync brutale
 * che chiamava syncPinToKeypad per TUTTI e registrava device-user anche per i non
 * idonei). Consuma il minimo di quota Tuya:
 *
 *  1. UNA sola `listTuyaUsers()` → chi è davvero presente sul device.
 *  2. Un giro sul DB: per ogni utente confronta idoneità (shouldHaveDoorPin) e
 *     presenza reale sul device, e AGISCE SOLO SUI DELTA:
 *       - idoneo senza PIN attivo            → attiva (ensure+enable+permanent)
 *       - idoneo ma SPARITO dal device (orfano, tuyaUserId in DB non più valido)
 *                                             → azzera e ricrea da zero
 *       - NON idoneo ma ancora sul device     → CANCELLA l'utente dal device
 *       - già coerente                        → skip (NESSUNA chiamata Tuya)
 *
 * Gli utenti sani (idonei con PIN attivo e presenti) non generano alcuna chiamata.
 * Rate-limit 300ms SOLO tra le azioni reali (gli skip non aspettano).
 */
export async function runTuyaPinSyncJob(prisma: PrismaClient): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0,
    deviceUsers: -1,
    added: 0,
    orphansFixed: 0,
    removed: 0,
    skipped: 0,
    errors: [],
  };

  // 1) Snapshot degli utenti realmente presenti sul device (1 sola chiamata).
  let deviceIds: Set<string> | null = null;
  try {
    const list = await listTuyaUsers();
    deviceIds = new Set(list.map((u) => u.user_id));
    result.deviceUsers = deviceIds.size;
  } catch (err) {
    // Senza l'elenco device non possiamo rilevare gli orfani in sicurezza:
    // procediamo con add/remove basati sullo stato DB, saltando l'orphan-fix.
    result.errors.push(`listTuyaUsers: ${(err as Error).message}`);
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      role: true,
      tuyaUserId: true,
      tuyaPinActive: true,
      subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true } },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  result.total = users.length;

  for (const user of users) {
    const eligible = shouldHaveDoorPin({
      role: user.role,
      subscription: user.subscription,
      entryPackage: user.entryPackage,
    });
    // null se non possiamo saperlo (list KO o nessun tuyaUserId) → niente orphan-fix.
    const onDevice =
      deviceIds && user.tuyaUserId ? deviceIds.has(user.tuyaUserId) : null;
    const orphan = eligible && !!user.tuyaUserId && onDevice === false;

    const needsAdd = eligible && (!user.tuyaPinActive || orphan);
    const needsRemove = !eligible && !!user.tuyaUserId;

    if (!needsAdd && !needsRemove) {
      result.skipped++;
      continue;
    }

    try {
      if (orphan) {
        // Il device ha perso l'utente: azzera il tuyaUserId fantasma così
        // syncPinToKeypad lo ricrea da zero (ensureTuyaUser → createTuyaUser).
        await prisma.user.update({
          where: { id: user.id },
          data: { tuyaUserId: null, tuyaPinActive: false, tuyaPinUnlockNo: null },
        });
      }
      await syncPinToKeypad(prisma, user.id);
      if (needsRemove) result.removed++;
      else if (orphan) result.orphansFixed++;
      else result.added++;
    } catch (err) {
      result.errors.push(`${user.id}: ${(err as Error).message}`);
    }
    await delay(DELAY_MS);
  }

  return result;
}
