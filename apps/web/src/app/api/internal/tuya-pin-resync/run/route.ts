import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { isSubscriptionActive } from "@/lib/subscription";
import { ensureTuyaUser } from "@/lib/services/tuya-pin-service";
import { enablePin, listTuyaUsers } from "@/lib/tuya/access-control";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return bearer === expected || headerSecret === expected;
}

const DELAY_MS = 350;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * RE-SYNC FORZATO dei PIN sul tastierino.
 *
 * A differenza di /tuya-pin-migration (sync "intelligente" che agisce solo se lo
 * stato in DB cambia), qui RISCRIVIAMO il codice sul device anche se il DB lo dà
 * già `tuyaPinActive`. Serve quando il device ha PERSO/desincronizzato la sua
 * tabella codici locale (es. dopo un riavvio da glitch elettrico): il cloud
 * mostra ancora i codici ma la tastiera li rifiuta tutti. `enablePin` ripubblica
 * la password → la tabella locale del device viene riscritta.
 *
 * Query:
 *   ?only=<accessCode>  → risincronizza SOLO quell'utente (per test mirato).
 *   (nessun parametro)  → risincronizza TUTTI gli aventi diritto (attivi + staff).
 *
 * Auth: header Authorization: Bearer <CRON_SECRET> (o x-cron-secret).
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const only = params.get("only")?.trim();
  // fresh=1 → ricrea da zero l'utente sul device (azzera il tuyaUserId fantasma
  // in DB). Serve quando il tastierino ha svuotato la sua tabella utenti locale
  // (es. dopo un riavvio): riusare il vecchio id fa accettare la scrittura al
  // cloud ma il device la scarta → codice negato (rosso). Ricreando l'utente
  // pulito, il PIN viene realmente registrato sul device.
  const fresh = params.get("fresh") === "1";

  // Diagnostica: quanti utenti risultano ANCORA sul device? Se il device ha
  // svuotato la tabella, questo numero sara' molto piu' basso dell'atteso.
  let deviceUserCount = -1;
  try {
    deviceUserCount = (await listTuyaUsers()).length;
  } catch {
    /* best-effort */
  }

  const users = await db.user.findMany({
    where: only ? { accessCode: only } : undefined,
    select: {
      id: true,
      role: true,
      accessCode: true,
      firstName: true,
      lastName: true,
      tuyaUserId: true,
      subscription: {
        select: { startsAt: true, endsAt: true, deactivatedAt: true },
      },
    },
  });

  const summary = {
    scope: only ? `only:${only}` : "all-eligible",
    fresh,
    deviceUserCount,
    candidates: users.length,
    resynced: 0,
    skipped: 0,
    resyncedCodes: [] as string[],
    errors: [] as string[],
  };

  for (const user of users) {
    const shouldHavePin =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.INSTRUCTOR ||
      (user.role === UserRole.SUBSCRIBER && isSubscriptionActive(user.subscription));

    if (!shouldHavePin) {
      summary.skipped++;
      continue;
    }

    try {
      // fresh: scarta il tuyaUserId fantasma così ensureTuyaUser ricrea l'utente
      // sul device da zero (il vecchio id non esiste più sul tastierino).
      if (fresh && user.tuyaUserId) {
        await db.user.update({
          where: { id: user.id },
          data: { tuyaUserId: null, tuyaPinActive: false, tuyaPinUnlockNo: null },
        });
      }
      const tuyaUserId = await ensureTuyaUser(db, user.id);
      const unlockNo = await enablePin(tuyaUserId, user.accessCode);
      await db.user.update({
        where: { id: user.id },
        data: { tuyaPinUnlockNo: unlockNo, tuyaPinActive: true },
      });
      summary.resynced++;
      // Per il test mirato/piccoli batch restituiamo i codici riscritti così
      // l'operatore sa cosa provare. Cap a 20 per non loggare l'intera lista.
      if (summary.resyncedCodes.length < 20) {
        summary.resyncedCodes.push(`${user.firstName} ${user.lastName}: ${user.accessCode}`);
      }
      await delay(DELAY_MS);
    } catch (err) {
      summary.errors.push(`${user.firstName} ${user.lastName} (${user.accessCode}): ${(err as Error).message}`);
    }
  }

  console.log("[tuya-pin-resync] completed:", JSON.stringify({ ...summary, resyncedCodes: "<hidden>" }));
  return NextResponse.json(summary);
}
