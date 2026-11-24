import { PaymentStatus, type PrismaClient } from "@gestionale/db";

import { shouldHaveDoorPin } from "@/lib/subscription";
import {
  deleteTuyaUser,
  enablePin,
  getAssignedKeys,
  listDeviceUserSchedules,
  setUserPermanent,
  type DeviceUserSchedule,
} from "@/lib/tuya/access-control";
import { isTuyaUserGoneError, recreateTuyaMember } from "@/lib/services/tuya-pin-service";
import { createHash } from "crypto";

/**
 * Health-check NOTTURNO dei PIN sul tastierino (cron 04:30 UTC). Quattro fasi,
 * tutte dentro un tetto DURO di chiamate Tuya (piano free ~26k/mese):
 *
 * A. SCAN (1 chiamata): `listDeviceUserSchedules` legge TUTTI i member con la
 *    validità e il suo `delivery_status` (page_size 2000 → 1 pagina).
 *
 * B. MEMBER INCASTRATI — "codice OK di giorno, KO la sera" (plans/access-control/004):
 *    il cloud dice `permanent: true` ma la consegna alla serratura è FAILED/ONGOING
 *    → il device tiene la finestra limitata. Ri-inviare il permanente NON basta:
 *    → `recreateTuyaMember` (delete → create → PIN → permanente), max
 *    MAX_RECREATES_PER_RUN a notte, e solo se la delete riesce. Un ONGOING è
 *    "vecchio" (incastrato) se l'utente non è stato toccato nelle ultime
 *    FRESH_WINDOW_MS (una consegna sana arriva in secondi). Chi semplicemente
 *    NON è permanente riceve 1 `setUserPermanent`.
 *
 * C. ROTAZIONE CHIAVI (il "codice sparito"): ~1/ROTATION_DAYS degli idonei a notte
 *    (+ attivati nelle ultime 48h) letti con `getAssignedKeys`; chiave mancante →
 *    ripubblica il PIN. NON ri-afferma più il permanente sui sani: lo stato reale
 *    lo dà lo scan (A) e il ri-invio cieco costava ~85 chiamate/notte e creava
 *    nuove consegne che potevano FALLIRE.
 *
 * D. PULIZIA ORFANI: member sul device non collegati ad alcun utente (duplicati
 *    da attivazioni parallele, o resti di ex iscritti) con validità ANCORA valida
 *    = PIN che apre ma che il gestionale non controlla più. Cancellati max
 *    MAX_ORPHAN_DELETES_PER_RUN a notte, SOLO ex iscritti. I gemelli di iscritti
 *    ATTIVI (stesso nome) NON si cancellano: il 24/11/2026 diversi iscritti
 *    entravano proprio dal duplicato, e una password presente sul cloud per il
 *    member collegato non garantisce che sia arrivata alla serratura → cancellarli
 *    può chiudere fuori un iscritto. Scaduti → lasciati (non aprono).
 *
 * SICUREZZA: nessuna riscrittura su letture fallite; recreate solo se la delete
 * riesce; i member più recenti dell'ultimo collegato non si toccano (potrebbero
 * essere in creazione proprio ora).
 */

export type PinHealthOptions = {
  now?: Date;
  rotationDays?: number; // in quante notti coprire tutti gli idonei
  maxChecks?: number; // tetto utenti controllati per run (fase C)
  maxCalls?: number; // tetto DURO di chiamate Tuya per run
  maxRecreates?: number; // tetto member incastrati ricreati per run (fase B)
  maxOrphanDeletes?: number; // tetto orfani cancellati per run (fase D)
  delayMs?: number; // spaziatura tra le azioni (device asincrono + quota)
};

export type PinHealthResult = {
  eligibleTotal: number;
  rotationDays: number;
  dayBucket: number;
  // A — scan
  deviceMembers: number; // -1 se lo scan è fallito (fasi B e D saltate)
  // B — validità non consegnata
  stuckFound: number; // idonei FAILED / ONGOING vecchi
  stuckRecreated: number;
  stuckCodes: string[]; // nome: codice (cap 50)
  permanentResent: number; // idonei non permanenti → 1 setUserPermanent
  // C — rotazione chiavi
  priorityRecent: number;
  inBucket: number;
  checked: number;
  healthyOk: number; // chiave presente → nessuna scrittura
  repaired: number; // chiave mancante → ripubblicata
  repairedCodes: string[];
  orphansSeen: number; // utente non più sul device → lo ripara pin-sync
  readErrors: number;
  // D — orfani
  orphansValid: number; // orfani con validità ancora valida (aprono)
  orphansExpired: number; // scaduti → lasciati
  orphansDeleted: number;
  orphansTwinsKept: number; // gemelli di iscritti attivi: mai cancellati (vedi D)
  orphansRemaining: number; // validi non ancora cancellati (prossime notti)
  deferred: number; // azioni rimandate per i tetti
  tuyaCalls: number; // chiamate Tuya usate in questo run (recreate stimato 6)
  errors: string[];
};

const ROTATION_DAYS = 7;
const MAX_CHECKS_PER_RUN = 120;
const MAX_TUYA_CALLS_PER_RUN = 400;
const MAX_RECREATES_PER_RUN = 10;
const MAX_ORPHAN_DELETES_PER_RUN = 40;
const RECREATE_CALLS = 6; // delete, create, permanent, ticket, entry, permanent
const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000;
const DELAY_MS = 300;
/** user_type dei member creati via API (panel_user); 50 = owner dell'app Tuya. */
const PANEL_USER_TYPE = 20;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Bucket stabile [0, rotationDays) derivato dallo userId (niente campo DB). */
function bucketOf(userId: string, rotationDays: number): number {
  const hex = createHash("sha1").update(userId).digest("hex").slice(0, 8);
  return parseInt(hex, 16) % rotationDays;
}

/** Un errore di lettura che significa "utente non più sul device" (orfano). */
function isOrphanError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not exist") ||
    m.includes("1109") ||
    m.includes("2331") ||
    m.includes("param is illegal")
  );
}

const hasPasswordKey = (keys: unknown): boolean =>
  ((keys as { unlock_keys?: Array<{ unlock_type: string }> })?.unlock_keys ?? []).some(
    (k) => k.unlock_type === "password"
  );

const normName = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/** La validità del member gli permette ancora di aprire? (permanente o non scaduta) */
function isStillValid(row: DeviceUserSchedule, now: Date): boolean {
  const s = row.time_schedule_info;
  if (!s) return true; // senza info: prudenza, trattalo come valido
  if (s.permanent) return true;
  const exp = s.expired_time ?? 0;
  const expMs = exp > 1e12 ? exp : exp * 1000;
  return expMs > now.getTime();
}

export async function runTuyaPinHealthJob(
  prisma: PrismaClient,
  opts: PinHealthOptions = {}
): Promise<PinHealthResult> {
  const now = opts.now ?? new Date();
  const rotationDays = Math.max(1, opts.rotationDays ?? ROTATION_DAYS);
  const maxChecks = opts.maxChecks ?? MAX_CHECKS_PER_RUN;
  const maxCalls = opts.maxCalls ?? MAX_TUYA_CALLS_PER_RUN;
  const maxRecreates = opts.maxRecreates ?? MAX_RECREATES_PER_RUN;
  const maxOrphanDeletes = opts.maxOrphanDeletes ?? MAX_ORPHAN_DELETES_PER_RUN;
  const delayMs = opts.delayMs ?? DELAY_MS;
  const dayBucket = Math.floor(now.getTime() / 86_400_000) % rotationDays;

  const result: PinHealthResult = {
    eligibleTotal: 0,
    rotationDays,
    dayBucket,
    deviceMembers: -1,
    stuckFound: 0,
    stuckRecreated: 0,
    stuckCodes: [],
    permanentResent: 0,
    priorityRecent: 0,
    inBucket: 0,
    checked: 0,
    healthyOk: 0,
    repaired: 0,
    repairedCodes: [],
    orphansSeen: 0,
    readErrors: 0,
    orphansValid: 0,
    orphansExpired: 0,
    orphansDeleted: 0,
    orphansTwinsKept: 0,
    orphansRemaining: 0,
    deferred: 0,
    tuyaCalls: 0,
    errors: [],
  };
  const canSpend = (n: number): boolean => result.tuyaCalls + n <= maxCalls;

  const users = await prisma.user.findMany({
    where: { tuyaUserId: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      accessCode: true,
      tuyaUserId: true,
      tuyaPinActive: true,
      updatedAt: true,
      role: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true },
      },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
    },
  });

  const eligible = users.filter(
    (u) =>
      u.tuyaPinActive &&
      shouldHaveDoorPin(
        { role: u.role, subscription: u.subscription, entryPackage: u.entryPackage },
        now
      )
  );
  result.eligibleTotal = eligible.length;
  const label = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

  // ── A. SCAN validità (1 chiamata) ─────────────────────────────────────────
  let rows: DeviceUserSchedule[] | null = null;
  if (canSpend(1)) {
    try {
      const scan = await listDeviceUserSchedules();
      result.tuyaCalls += scan.calls;
      rows = scan.rows;
      result.deviceMembers = rows.length;
    } catch (err) {
      result.tuyaCalls++;
      result.errors.push(`scan: ${(err as Error).message}`);
    }
  }
  const rowById = new Map((rows ?? []).map((r) => [r.user_id, r]));

  // ── B. Validità non consegnata (codice KO la sera) ────────────────────────
  const touched = new Set<string>(); // userId già riscritti stanotte
  if (rows) {
    for (const u of eligible) {
      const row = rowById.get(u.tuyaUserId!);
      if (!row) continue; // sparito dal device: lo ricrea pin-sync (orphan-fix)
      const s = row.time_schedule_info;
      const status = s?.delivery_status;
      const fresh = now.getTime() - new Date(u.updatedAt).getTime() < FRESH_WINDOW_MS;
      if (fresh && status !== "FAILED") continue; // consegna forse ancora in corso

      if (status === "FAILED" || status === "ONGOING") {
        result.stuckFound++;
        if (result.stuckRecreated >= maxRecreates || !canSpend(RECREATE_CALLS)) {
          result.deferred++;
          continue;
        }
        result.tuyaCalls += RECREATE_CALLS;
        try {
          await recreateTuyaMember(prisma, u.id);
          result.stuckRecreated++;
          touched.add(u.id);
          if (result.stuckCodes.length < 50) result.stuckCodes.push(`${label(u)}: ${u.accessCode}`);
        } catch (err) {
          result.errors.push(`recreate ${label(u)} (${u.accessCode}): ${(err as Error).message}`);
        }
        await delay(delayMs);
      } else if (s && s.permanent !== true) {
        if (!canSpend(1)) {
          result.deferred++;
          continue;
        }
        result.tuyaCalls++;
        try {
          await setUserPermanent(u.tuyaUserId!);
          result.permanentResent++;
        } catch (err) {
          result.errors.push(`permanent ${label(u)} (${u.accessCode}): ${(err as Error).message}`);
        }
        await delay(delayMs);
      }
    }
  }

  // ── C. Rotazione chiavi (PIN sparito dalla serratura) ─────────────────────
  // PRIORITÀ: codici attivati di recente (pagamento PAID nelle ultime 48h). Un PIN
  // appena pubblicato che non è atterrato va scoperto subito, non alla prossima
  // rotazione.
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const recentPaid = await prisma.payment.findMany({
    where: { status: PaymentStatus.PAID, paidAt: { gte: cutoff } },
    select: { userId: true },
  });
  const recentIds = new Set(recentPaid.map((p) => p.userId));

  const pool = eligible.filter((u) => !touched.has(u.id));
  const priority = pool.filter((u) => recentIds.has(u.id));
  const bucketSlice = pool.filter(
    (u) => !recentIds.has(u.id) && bucketOf(u.id, rotationDays) === dayBucket
  );
  result.priorityRecent = priority.length;
  result.inBucket = bucketSlice.length;

  for (const u of [...priority, ...bucketSlice]) {
    if (result.checked >= maxChecks || !canSpend(1)) {
      result.deferred++;
      continue;
    }

    let keys: unknown;
    try {
      result.tuyaCalls++;
      keys = await getAssignedKeys(u.tuyaUserId!);
    } catch (err) {
      const msg = (err as Error).message;
      if (isOrphanError(msg)) {
        result.orphansSeen++;
      } else {
        // Errore transitorio/non chiaro: NON riscriviamo (niente rischio su PIN sani).
        result.readErrors++;
        result.errors.push(`${label(u)} (${u.accessCode}): read ${msg}`);
      }
      result.checked++;
      await delay(delayMs);
      continue;
    }
    result.checked++;

    if (hasPasswordKey(keys)) {
      result.healthyOk++;
    } else if (!canSpend(2)) {
      result.deferred++;
    } else {
      // Chiave DAVVERO mancante → ripubblica il PIN (enablePin + permanent).
      try {
        result.tuyaCalls++;
        const unlockNo = await enablePin(u.tuyaUserId!, u.accessCode);
        result.tuyaCalls++;
        await setUserPermanent(u.tuyaUserId!).catch(() => {});
        await prisma.user.update({
          where: { id: u.id },
          data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true },
        });
        result.repaired++;
        if (result.repairedCodes.length < 50) result.repairedCodes.push(`${label(u)}: ${u.accessCode}`);
      } catch (err) {
        result.errors.push(`${label(u)} (${u.accessCode}): ${(err as Error).message}`);
      }
    }
    await delay(delayMs);
  }

  // ── D. Pulizia orfani con PIN ancora valido ───────────────────────────────
  if (rows) {
    const linkedIds = new Set(users.map((u) => u.tuyaUserId!));
    // Member più recente collegato a un utente: quelli più nuovi di lui possono
    // essere in creazione proprio ora (createTuyaUser fatto, DB non ancora
    // aggiornato) → non si toccano stanotte.
    const maxLinkedLock = Math.max(
      0,
      ...rows.filter((r) => linkedIds.has(r.user_id)).map((r) => r.lock_user_id ?? 0)
    );
    const eligibleByName = new Map(eligible.map((u) => [normName(label(u)), u]));

    const exMembers: DeviceUserSchedule[] = [];
    for (const r of rows) {
      if (r.user_type !== PANEL_USER_TYPE || linkedIds.has(r.user_id)) continue;
      if (!isStillValid(r, now)) {
        result.orphansExpired++;
        continue;
      }
      if ((r.lock_user_id ?? 0) > maxLinkedLock) continue;
      if (eligibleByName.has(normName(r.nick_name))) {
        result.orphansTwinsKept++;
        continue;
      }
      result.orphansValid++;
      exMembers.push(r);
    }

    for (const row of exMembers) {
      if (result.orphansDeleted >= maxOrphanDeletes || !canSpend(1)) break;

      result.tuyaCalls++;
      try {
        await deleteTuyaUser(row.user_id);
        result.orphansDeleted++;
      } catch (err) {
        const msg = (err as Error).message;
        if (isTuyaUserGoneError(msg)) result.orphansDeleted++;
        else result.errors.push(`orphan ${row.nick_name} (${row.user_id}): ${msg}`);
      }
      await delay(delayMs);
    }
    result.orphansRemaining = Math.max(
      0,
      result.orphansValid - result.orphansDeleted
    );
  }

  return result;
}
