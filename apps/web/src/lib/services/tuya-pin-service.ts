import { type PrismaClient } from "@gestionale/db";
import { after } from "next/server";

import {
  createTuyaUser,
  deleteTuyaUser,
  disablePin,
  enablePin,
  listTuyaUsers,
  setUserPermanent,
} from "@/lib/tuya/access-control";
import { shouldHaveDoorPin } from "@/lib/subscription";

const PERMANENT_MAX_ATTEMPTS = 3;
const PERMANENT_RETRY_MS = 1500;

/**
 * Assicura che il member Tuya sia PERMANENTE. I non-home user nascono con una
 * validità LIMITATA di default che gate-a i loro PIN a tempo (codici funzionanti
 * di giorno, KO di notte). Idempotente e con retry: un fallimento TRANSITORIO
 * (rete/blip API) non deve lasciare il member limitato per sempre — era il bug
 * dei "nuovi utenti il cui codice muore di notte", perché prima veniva chiamata
 * una sola volta alla creazione, best-effort e senza retry. Best-effort finale:
 * non lancia (non deve far fallire la creazione/sync del PIN).
 */
async function assertUserPermanent(tuyaUserId: string): Promise<void> {
  for (let attempt = 1; attempt <= PERMANENT_MAX_ATTEMPTS; attempt++) {
    try {
      await setUserPermanent(tuyaUserId);
      return;
    } catch (err) {
      if (attempt === PERMANENT_MAX_ATTEMPTS) {
        console.error(
          `[tuya] setUserPermanent fallito dopo ${attempt} tentativi per ${tuyaUserId}:`,
          err
        );
        return;
      }
      await new Promise((r) => setTimeout(r, PERMANENT_RETRY_MS));
    }
  }
}

/**
 * Ensures the user has a Tuya account on the device.
 * Creates one if missing and persists the tuyaUserId in the DB.
 * In ogni caso RI-AFFERMA la validità permanente del member (self-healing).
 */
export async function ensureTuyaUser(
  prisma: PrismaClient,
  userId: string
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, tuyaUserId: true, firstName: true, lastName: true },
  });

  if (user.tuyaUserId) {
    // Utente già presente: ri-affermiamo comunque la validità PERMANENTE. Così
    // chi era rimasto limitato (setUserPermanent fallita alla creazione) si
    // auto-guarisce alla prossima (ri)attivazione del PIN. A bassa frequenza:
    // ensureTuyaUser gira solo quando si attiva un PIN, non a ogni sync.
    await assertUserPermanent(user.tuyaUserId);
    return user.tuyaUserId;
  }

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

  // Collega il member SOLO se nel frattempo nessun altro l'ha fatto. Più conferme
  // dello stesso pagamento (webhook + pagina di successo + conferma mobile)
  // lanciano syncPinToKeypad in parallelo: senza questa guardia ognuna creava il
  // SUO member con lo stesso PIN e il DB ne teneva uno solo → duplicati orfani
  // che restano aperti anche dopo la scadenza (435 trovati il 23/11/2026).
  const claimed = await prisma.user.updateMany({
    where: { id: userId, tuyaUserId: null },
    data: { tuyaUserId },
  });
  if (claimed.count === 0) {
    const winner = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tuyaUserId: true },
    });
    if (winner.tuyaUserId && winner.tuyaUserId !== tuyaUserId) {
      // Ha vinto l'altra esecuzione: togli il member appena creato (best-effort,
      // altrimenti lo raccoglie la pulizia orfani notturna).
      await deleteTuyaUser(tuyaUserId).catch(() => {});
      return winner.tuyaUserId;
    }
  }

  await assertUserPermanent(tuyaUserId);

  return tuyaUserId;
}

/** Il member non esiste (più) sul device: per una delete equivale a "fatto". */
export function isTuyaUserGoneError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("1109") || m.includes("not exist") || m.includes("param is illegal");
}

/**
 * RICREA da zero il member di un utente: cancella quello attuale dal device e ne
 * crea uno nuovo (PIN + permanente) via syncPinToKeypad. È la cura per un member
 * "incastrato" la cui validità permanente non viene mai consegnata alla serratura
 * (`delivery_status` FAILED/ONGOING → codice KO la sera): ri-inviare il
 * permanente non basta, un member nuovo invece riceve SUCCESS.
 *
 * Sicurezza: se la delete fallisce (per un motivo diverso da "già assente") NON
 * procede → mai due member con lo stesso PIN. `newAccessCode` cambia anche il
 * codice (codice prestato/compromesso): il vecchio smette di aprire.
 * Costo Tuya: ~6 chiamate (delete, create, permanent, ticket, entry, permanent).
 */
export async function recreateTuyaMember(
  prisma: PrismaClient,
  userId: string,
  opts: { newAccessCode?: string } = {}
): Promise<{ oldTuyaUserId: string | null; tuyaUserId: string | null; accessCode: string }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tuyaUserId: true, accessCode: true },
  });

  if (user.tuyaUserId) {
    try {
      await deleteTuyaUser(user.tuyaUserId);
    } catch (err) {
      if (!isTuyaUserGoneError((err as Error).message)) throw err;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      tuyaUserId: null,
      tuyaPinActive: false,
      tuyaPinUnlockNo: null,
      ...(opts.newAccessCode ? { accessCode: opts.newAccessCode } : {}),
    },
  });

  await syncPinToKeypad(prisma, userId);

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { tuyaUserId: true, accessCode: true },
  });
  return { oldTuyaUserId: user.tuyaUserId, ...after };
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
        select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true },
      },
      entryPackage: {
        select: { deactivatedAt: true, remainingEntries: true },
      },
    },
  });

  const shouldHavePin = shouldHaveDoorPin({
    role: user.role,
    subscription: user.subscription,
    entryPackage: user.entryPackage,
  });

  if (shouldHavePin) {
    // Deve avere il PIN — crea se non ce l'ha
    if (!user.tuyaPinActive) {
      const tuyaUserId = await ensureTuyaUser(prisma, userId);
      const unlockNo = await enablePin(tuyaUserId, user.accessCode);
      // CRUCIALE: ri-affermare la validità PERMANENTE *dopo* aver registrato il
      // PIN. `ensureTuyaUser` la imposta PRIMA di `enablePin`, ma su questo device
      // la password appena creata non eredita in modo affidabile lo schedule del
      // member impostato prima che esistesse → il codice nasceva LIMITATO
      // (funziona di giorno, muore di notte) anche per i nuovi utenti. Riasserire
      // qui — quando la password esiste già — replica il fix manuale `?permanent`
      // che risolveva sempre. Costo: 1 chiamata Tuya solo alla (ri)attivazione.
      await assertUserPermanent(tuyaUserId);
      await prisma.user.update({
        where: { id: userId },
        data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true },
      });
    }
  } else {
    // NON deve avere il PIN → CANCELLA l'utente dal device (non solo la chiave).
    // Lasciare il device-user orfano accumula record sul tastierino (device gonfio)
    // e genera drift (tuyaUserId in DB non più valido sul device → codici morti,
    // orfani). Alla (ri)attivazione `ensureTuyaUser` lo ricrea pulito. Idempotente:
    // dopo la cancellazione tuyaUserId è null → i sync successivi non richiamano Tuya.
    if (user.tuyaUserId) {
      await removeTuyaUserCompletely(prisma, userId);
    } else if (user.tuyaPinActive || user.tuyaPinUnlockNo) {
      // Stato incoerente senza device-user: pulisci solo il DB.
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
