import { type PrismaClient } from "@gestionale/db";

import {
  KEYPAD_PIN_UNLOCK_CODE,
  enablePin,
  listDoorLockOpenLogs
} from "@/lib/tuya/access-control";
import { shouldHaveDoorPin } from "@/lib/subscription";

import { ensureTuyaUser } from "./tuya-pin-service";

type ReassertResult = {
  total: number;
  rewritten: number;
  skippedConfirmed: number;
  errors: string[];
  mode: "smart" | "force";
};

// Spaziatura tra scritture: il lock applica i PIN una alla volta in modo
// asincrono. Troppo veloce → "operation in progress". 700ms è il compromesso
// per far stare ~165 PIN entro il limite di durata della funzione (300s).
const DELAY_MS = 700;
const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 5;

// Finestra entro cui un'apertura col PIN negli open-logs vale come "PIN OK".
// Chi ha aperto entro questa finestra NON viene riscritto (PIN funzionante →
// riscriverlo è solo rischio: ogni rewrite può rompere un PIN buono).
const CONFIRM_WINDOW_DAYS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enablePinWithRetry(
  tuyaUserId: string,
  pin: string
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await enablePin(tuyaUserId, pin);
    } catch (err) {
      lastErr = err;
      const msg = String((err as Error).message).toLowerCase();
      if (msg.includes("progress") || msg.includes("busy")) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Costruisce la mappa "PIN confermato funzionante" leggendo gli open-logs.
 * Ritorna Map<tuyaUserId, unlockNo> per chi ha aperto col PIN (status
 * `unlock_password_kit`) entro CONFIRM_WINDOW_DAYS. `unlockNo` è ricavato da
 * `unlock_name` (es. "11-22" → "22"), così possiamo anche correggere lo slot
 * salvato nel DB (oggi è "1" per tutti per via dell'endpoint di lettura rotto).
 */
async function fetchConfirmedPinUsers(): Promise<Map<string, string>> {
  const confirmed = new Map<string, string>();
  const end = Date.now();
  const start = end - CONFIRM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  for (let page = 1; page <= 15; page++) {
    const { total, logs } = await listDoorLockOpenLogs({
      startMs: start,
      endMs: end,
      pageNo: page,
      pageSize: 100
    });
    for (const log of logs) {
      if (log.status?.code !== KEYPAD_PIN_UNLOCK_CODE) continue;
      if (!log.user_id) continue;
      // Più recente per primo (l'API ordina desc): tieni la prima occorrenza.
      if (confirmed.has(log.user_id)) continue;
      const slot = String(log.unlock_name ?? "").split("-").pop();
      confirmed.set(log.user_id, slot && /^\d+$/.test(slot) ? slot : "1");
    }
    if (logs.length < 100 || page * 100 >= total) break;
  }

  return confirmed;
}

/**
 * Safety-net anti-lockout — versione "smart".
 *
 * Ri-emette il PIN SOLO ai membri idonei che NON risultano aver aperto col PIN
 * di recente (open-logs). Chi ha un PIN dimostrabilmente funzionante viene
 * SALTATO: riscriverlo è puro rischio (ogni `actions/entry` su una serratura
 * consumer può corrompere un PIN buono → lockout intermittenti tipo "il codice
 * stamattina non andava e poi sì").
 *
 * `force: true` torna al comportamento vecchio (riscrive TUTTI) — da usare solo
 * in emergenza, se si conferma un azzeramento reale lato dispositivo.
 *
 * Per i confermati aggiorna comunque nel DB `tuyaPinActive=true` e lo slot reale
 * (`tuyaPinUnlockNo`) ricavato dagli open-logs, senza toccare il device.
 */
export async function runTuyaPinReassertJob(
  prisma: PrismaClient,
  opts: { force?: boolean } = {}
): Promise<ReassertResult> {
  const force = opts.force ?? false;
  const result: ReassertResult = {
    total: 0,
    rewritten: 0,
    skippedConfirmed: 0,
    errors: [],
    mode: force ? "force" : "smart"
  };

  const users = await prisma.user.findMany({
    select: {
      id: true,
      role: true,
      accessCode: true,
      tuyaUserId: true,
      tuyaPinUnlockNo: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true }
      },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } }
    }
  });

  const targets = users.filter((u) =>
    shouldHaveDoorPin({ role: u.role, subscription: u.subscription, entryPackage: u.entryPackage })
  );

  result.total = targets.length;

  // Mappa "PIN funzionante" (vuota in modalità force → riscrive tutti).
  const confirmed = force
    ? new Map<string, string>()
    : await fetchConfirmedPinUsers();

  for (const user of targets) {
    if (!user.accessCode) {
      result.errors.push(`${user.id}: accessCode mancante`);
      continue;
    }

    const confirmedSlot =
      user.tuyaUserId && confirmed.get(user.tuyaUserId);

    if (!force && confirmedSlot) {
      // PIN dimostrabilmente OK: non toccare il device, solo allinea il DB
      // (flag attivo + slot reale ricavato dagli open-logs).
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { tuyaPinActive: true, tuyaPinUnlockNo: confirmedSlot }
        });
      } catch {
        /* allineamento DB best-effort */
      }
      result.skippedConfirmed++;
      continue;
    }

    // Non confermato (nuovo / infrequente / potenzialmente mancante) → riscrivi.
    try {
      const tuyaUserId = await ensureTuyaUser(prisma, user.id);
      const unlockNo = await enablePinWithRetry(tuyaUserId, user.accessCode);
      await prisma.user.update({
        where: { id: user.id },
        data: { tuyaPinActive: true, tuyaPinUnlockNo: unlockNo }
      });
      result.rewritten++;
    } catch (err) {
      result.errors.push(`${user.id}: ${(err as Error).message}`);
    }
    await delay(DELAY_MS);
  }

  return result;
}
