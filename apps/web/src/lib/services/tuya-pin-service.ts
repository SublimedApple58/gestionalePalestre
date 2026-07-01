import { type PrismaClient, UserRole } from "@gestionale/db";
import { after } from "next/server";

import {
  createTuyaUser,
  deleteTuyaUser,
  disablePin,
  enablePin,
  listTuyaUsers,
  setUserPermanent,
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

  const name = `${user.firstName} ${user.lastName}`;

  let tuyaUserId: string;
  try {
    tuyaUserId = await createTuyaUser(name);
  } catch (err) {
    // Tuya `2101 "duplicate naming under the device"`: un utente Tuya con questo
    // nome esiste già sul device (registrazione orfana il cui tuyaUserId non era
    // mai stato salvato in DB — es. fallita a metà durante un'interruzione).
    // Invece di fallire a ogni sync, riusiamo l'utente esistente.
    if (err instanceof Error && err.message.includes("duplicate naming")) {
      const existing = await listTuyaUsers();
      const match = existing.find((u) => u.nick_name === name);
      if (!match) throw err;
      tuyaUserId = match.user_id;
    } else {
      throw err;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { tuyaUserId },
  });

  // I non-home user Tuya nascono con una validità LIMITATA di default che
  // gate-a i loro PIN a tempo (codici funzionanti di giorno, KO di notte).
  // Impostiamo subito il member a PERMANENTE, altrimenti i codici smettono di
  // funzionare al primo riavvio del tastierino. Best-effort: non deve far
  // fallire la creazione utente.
  await setUserPermanent(tuyaUserId).catch((err) => {
    console.error(`[tuya] setUserPermanent fallito per ${tuyaUserId}:`, err);
  });

  return tuyaUserId;
}

/**
 * Core sync — semplice e brutale:
 *
 * 1. Decidi se l'utente DEVE avere il PIN (admin/instructor sempre, subscriber solo se abb. attivo)
 * 2. Se deve averlo → assicurati che ce l'abbia (crea se manca)
 * 3. Se NON deve averlo → assicurati che NON ce l'abbia (rimuovi se presente)
 *
 * Ignora lo stato `tuyaPinActive` nel DB per la decisione — lo usa solo per
 * capire se serve un'azione. Alla fine riallinea il DB allo stato reale.
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

  if (shouldHavePin) {
    // Deve avere il PIN — crea se non ce l'ha
    if (!user.tuyaPinActive) {
      const tuyaUserId = await ensureTuyaUser(prisma, userId);
      const unlockNo = await enablePin(tuyaUserId, user.accessCode);
      await prisma.user.update({
        where: { id: userId },
        data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true },
      });
    }
  } else {
    // NON deve avere il PIN — rimuovi se ce l'ha
    if (user.tuyaPinActive || user.tuyaPinUnlockNo) {
      if (user.tuyaUserId) {
        await disablePin(user.tuyaUserId, user.tuyaPinUnlockNo ?? "1");
      }
      await prisma.user.update({
        where: { id: userId },
        data: { tuyaPinActive: false, tuyaPinUnlockNo: null },
      });
    }
  }
}

/**
 * Wrapper non-bloccante. Logga gli errori ma non lancia mai.
 *
 * IMPORTANTE: su serverless (Vercel) un semplice fire-and-forget veniva SCARTATO
 * quando la funzione si congelava dopo aver risposto → il codice non veniva mai
 * scritto sul tastierino (bug: iscritto con abbonamento attivo ma senza codice).
 * `after()` registra il sync per l'esecuzione DOPO la risposta mantenendo viva la
 * funzione finché non completa — affidabile e comunque non-bloccante per l'utente.
 * Fuori da un contesto request (script/job) si degrada a fire-and-forget.
 */
export function safeSyncPinToKeypad(
  prisma: PrismaClient,
  userId: string
): void {
  const run = () =>
    syncPinToKeypad(prisma, userId).catch((err) => {
      console.error(`[tuya-pin] sync failed for ${userId}:`, err);
    });

  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Full cleanup before user deletion.
 */
export async function removeTuyaUserCompletely(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tuyaUserId: true, tuyaPinUnlockNo: true, tuyaPinActive: true },
  });

  if (!user?.tuyaUserId) return;

  if (user.tuyaPinActive || user.tuyaPinUnlockNo) {
    await disablePin(user.tuyaUserId, user.tuyaPinUnlockNo ?? "1");
  }

  await deleteTuyaUser(user.tuyaUserId);

  await prisma.user.update({
    where: { id: userId },
    data: { tuyaUserId: null, tuyaPinUnlockNo: null, tuyaPinActive: false },
  });
}
