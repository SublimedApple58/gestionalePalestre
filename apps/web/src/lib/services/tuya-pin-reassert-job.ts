import { type PrismaClient, UserRole } from "@gestionale/db";

import { enablePin } from "@/lib/tuya/access-control";
import { isSubscriptionActive } from "@/lib/subscription";

import { ensureTuyaUser } from "./tuya-pin-service";

type ReassertResult = {
  total: number;
  reasserted: number;
  errors: string[];
};

// Spaziatura tra utenti: il lock applica le scritture PIN una alla volta in modo
// asincrono. Troppo veloce → "operation in progress". 1s è un buon compromesso.
const DELAY_MS = 1000;
// Backoff quando il lock è ancora occupato dalla scrittura precedente.
const RETRY_DELAY_MS = 3500;
const MAX_ATTEMPTS = 6;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Riscrive il PIN ritentando se il lock risponde "operation in progress".
 * `actions/entry` SOSTITUISCE il PIN dell'utente (verificato: il contatore
 * `unlock_password_kit` resta invariato su rewrite), quindi NON accumula chiavi.
 */
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
 * Safety-net anti-lockout: ri-emette il PIN sul tastierino per OGNI membro che
 * deve avere accesso (admin/instructor + subscriber con abbonamento attivo),
 * a prescindere dal flag `tuyaPinActive` nel DB.
 *
 * Serve a recuperare automaticamente un eventuale azzeramento dei PIN lato
 * dispositivo (reset/firmware): in quel caso il DB resta `tuyaPinActive=true`
 * e il sync normale NON ricrea i PIN (salta gli "attivi"), causando lockout
 * silenzioso. Questo job riscrive comunque, quindi auto-guarisce.
 *
 * NON rimuove PIN a chi non deve averli: quello resta compito di
 * `runTuyaPinSyncJob` (sync ogni 5 min).
 */
export async function runTuyaPinReassertJob(
  prisma: PrismaClient
): Promise<ReassertResult> {
  const result: ReassertResult = { total: 0, reasserted: 0, errors: [] };

  const users = await prisma.user.findMany({
    select: {
      id: true,
      role: true,
      accessCode: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  const targets = users.filter(
    (u) =>
      u.role === UserRole.ADMIN ||
      u.role === UserRole.INSTRUCTOR ||
      (u.role === UserRole.SUBSCRIBER && isSubscriptionActive(u.subscription))
  );

  result.total = targets.length;

  for (const user of targets) {
    if (!user.accessCode) {
      result.errors.push(`${user.id}: accessCode mancante`);
      continue;
    }
    try {
      const tuyaUserId = await ensureTuyaUser(prisma, user.id);
      const unlockNo = await enablePinWithRetry(tuyaUserId, user.accessCode);
      await prisma.user.update({
        where: { id: user.id },
        data: { tuyaPinActive: true, tuyaPinUnlockNo: unlockNo },
      });
      result.reasserted++;
    } catch (err) {
      result.errors.push(`${user.id}: ${(err as Error).message}`);
    }
    await delay(DELAY_MS);
  }

  return result;
}
