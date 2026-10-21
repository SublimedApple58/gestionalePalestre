import { PaymentStatus, type PrismaClient } from "@gestionale/db";

import { shouldHaveDoorPin } from "@/lib/subscription";
import { enablePin, getAssignedKeys, setUserPermanent } from "@/lib/tuya/access-control";
import { createHash } from "crypto";

/**
 * Health-check NOTTURNO a ROTAZIONE dei PIN sul tastierino — la correzione
 * definitiva per i "codici che spariscono dalla serratura".
 *
 * PERCHÉ ESISTE (il buco che tappa):
 *  - `runTuyaPinSyncJob` (notturno) ripara gli orfani a livello UTENTE (tuyaUserId
 *    non più sul device, visto con 1 sola `listTuyaUsers`) ma SALTA chi è
 *    `tuyaPinActive` e ancora presente → NON si accorge se all'utente è sparita la
 *    PASSWORD KEY (il caso dei 42 e di Alessio: utente presente, chiave vuota).
 *  - `enablePin` considera il 200 dell'API come successo senza rileggere la chiave
 *    (l'endpoint di lettura è inaffidabile), quindi una scrittura non atterrata
 *    resta `tuyaPinActive=true` per sempre: morta e mai auto-guarita.
 *
 * COSA FA: verifica a livello CHIAVE con `getAssignedKeys` e ripara ripubblicando
 * il PIN SOLO per chi non ha davvero una password key. Assorbe anche il vecchio
 * `permanent-reassert` settimanale (su chi è sano chiama `setUserPermanent`).
 *
 * BUDGET TUYA (vincolo forte: piano free ~26k chiamate/mese):
 *  - NON esiste una lettura in blocco delle chiavi per questo device `mk`:
 *    `getAssignedKeys` è per-utente. Quindi ROTAZIONE: ogni notte si controlla solo
 *    ~1/ROTATION_DAYS degli idonei (bucket stabile per userId) → tutti coperti entro
 *    ROTATION_DAYS notti. Gli orfani a livello utente restano gratis a carico di
 *    `runTuyaPinSyncJob` (1 sola `listTuyaUsers`).
 *  - Tetti duri per esecuzione: MAX_CHECKS_PER_RUN e MAX_TUYA_CALLS_PER_RUN. Il
 *    numero di chiamate Tuya usate è SEMPRE loggato (`tuyaCalls`).
 *  - Costo tipico: ~1/7 di ~565 idonei ≈ 81 utenti × (1 read + 1 permanent) ≈
 *    ~160 chiamate/notte ≈ ~4.900/mese (sostituisce il reassert settimanale ~2.450).
 *
 * SICUREZZA: ripubblica SOLO quando la lettura RIESCE e mostra zero password key.
 * Un errore di lettura transitorio/non-orfano NON innesca riscritture (si logga e
 * si salta), per non rischiare di toccare un PIN sano. Nessuna migrazione: la
 * rotazione è deterministica da `userId`, niente nuovi campi in DB.
 */

export type PinHealthOptions = {
  now?: Date;
  rotationDays?: number; // in quante notti coprire tutti gli idonei
  maxChecks?: number; // tetto utenti controllati per run
  maxCalls?: number; // tetto DURO di chiamate Tuya per run
  delayMs?: number; // spaziatura tra le azioni (device asincrono + quota)
};

export type PinHealthResult = {
  eligibleTotal: number;
  rotationDays: number;
  dayBucket: number;
  priorityRecent: number; // idonei attivati nelle ultime 48h, sempre controllati
  inBucket: number; // idonei che cadono nel bucket di stanotte (esclusi i priority)
  checked: number; // utenti effettivamente letti (getAssignedKeys)
  healthyReasserted: number; // chiave presente → setUserPermanent
  repaired: number; // chiave mancante → ripubblicata
  repairedCodes: string[]; // nome: codice (cap 50)
  orphansSeen: number; // utente non più sul device → lo ripara pin-sync
  deferred: number; // non controllati per via dei tetti (al prossimo giro)
  readErrors: number; // letture fallite non-orfane → saltate (nessuna riscrittura)
  tuyaCalls: number; // chiamate Tuya totali usate in questo run
  errors: string[];
};

const ROTATION_DAYS = 7;
const MAX_CHECKS_PER_RUN = 120;
const MAX_TUYA_CALLS_PER_RUN = 400;
const DELAY_MS = 300;

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

export async function runTuyaPinHealthJob(
  prisma: PrismaClient,
  opts: PinHealthOptions = {}
): Promise<PinHealthResult> {
  const now = opts.now ?? new Date();
  const rotationDays = Math.max(1, opts.rotationDays ?? ROTATION_DAYS);
  const maxChecks = opts.maxChecks ?? MAX_CHECKS_PER_RUN;
  const maxCalls = opts.maxCalls ?? MAX_TUYA_CALLS_PER_RUN;
  const delayMs = opts.delayMs ?? DELAY_MS;
  const dayBucket = Math.floor(now.getTime() / 86_400_000) % rotationDays;

  const result: PinHealthResult = {
    eligibleTotal: 0,
    rotationDays,
    dayBucket,
    priorityRecent: 0,
    inBucket: 0,
    checked: 0,
    healthyReasserted: 0,
    repaired: 0,
    repairedCodes: [],
    orphansSeen: 0,
    deferred: 0,
    readErrors: 0,
    tuyaCalls: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    where: { tuyaUserId: { not: null }, tuyaPinActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      accessCode: true,
      tuyaUserId: true,
      role: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true },
      },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
    },
  });

  const eligible = users.filter((u) =>
    shouldHaveDoorPin(
      { role: u.role, subscription: u.subscription, entryPackage: u.entryPackage },
      now
    )
  );
  result.eligibleTotal = eligible.length;

  // PRIORITÀ: codici attivati di recente (pagamento PAID nelle ultime 48h). Un PIN
  // appena pubblicato che non è atterrato va scoperto subito, non alla prossima
  // rotazione. Costa 1 lettura a testa (insieme piccolo: le attivazioni di 2 giorni).
  const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const recentPaid = await prisma.payment.findMany({
    where: { status: PaymentStatus.PAID, paidAt: { gte: cutoff } },
    select: { userId: true },
  });
  const recentIds = new Set(recentPaid.map((p) => p.userId));

  const priority = eligible.filter((u) => recentIds.has(u.id));
  const bucketSlice = eligible.filter(
    (u) => !recentIds.has(u.id) && bucketOf(u.id, rotationDays) === dayBucket
  );
  result.priorityRecent = priority.length;
  result.inBucket = bucketSlice.length;

  // Prima i recenti, poi la fetta a rotazione (entrambi sotto i tetti di budget).
  const targets = [...priority, ...bucketSlice];

  for (const u of targets) {
    // Tetto utenti e tetto DURO di chiamate: ciò che resta va al prossimo giro.
    if (result.checked >= maxChecks || result.tuyaCalls + 1 > maxCalls) {
      result.deferred++;
      continue;
    }

    const label = `${u.firstName} ${u.lastName}`;
    let keys: { unlock_keys?: Array<{ unlock_type: string }> };
    try {
      result.tuyaCalls++;
      keys = (await getAssignedKeys(u.tuyaUserId!)) as typeof keys;
    } catch (err) {
      const msg = (err as Error).message;
      if (isOrphanError(msg)) {
        // Utente sparito dal device: lo ricrea `runTuyaPinSyncJob` (orphan-fix).
        result.orphansSeen++;
      } else {
        // Errore transitorio/non chiaro: NON riscriviamo (niente rischio su PIN sani).
        result.readErrors++;
        result.errors.push(`${label} (${u.accessCode}): read ${msg}`);
      }
      result.checked++;
      await delay(delayMs);
      continue;
    }

    const hasPassword = (keys.unlock_keys ?? []).some((k) => k.unlock_type === "password");
    result.checked++;

    try {
      if (hasPassword) {
        // Chiave presente → ri-afferma permanente (assorbe il reassert settimanale).
        if (result.tuyaCalls + 1 > maxCalls) {
          result.deferred++;
        } else {
          result.tuyaCalls++;
          await setUserPermanent(u.tuyaUserId!);
          result.healthyReasserted++;
        }
      } else {
        // Chiave DAVVERO mancante → ripubblica il PIN (enablePin + permanent).
        if (result.tuyaCalls + 2 > maxCalls) {
          result.deferred++;
        } else {
          result.tuyaCalls++;
          const unlockNo = await enablePin(u.tuyaUserId!, u.accessCode);
          result.tuyaCalls++;
          await setUserPermanent(u.tuyaUserId!).catch(() => {});
          await prisma.user.update({
            where: { id: u.id },
            data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true },
          });
          result.repaired++;
          if (result.repairedCodes.length < 50) {
            result.repairedCodes.push(`${label}: ${u.accessCode}`);
          }
        }
      }
    } catch (err) {
      result.errors.push(`${label} (${u.accessCode}): ${(err as Error).message}`);
    }

    await delay(delayMs);
  }

  return result;
}
