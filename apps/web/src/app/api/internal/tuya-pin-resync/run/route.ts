import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { isSubscriptionActive } from "@/lib/subscription";
import { ensureTuyaUser } from "@/lib/services/tuya-pin-service";
import {
  enablePin,
  getAssignedKeys,
  getDeviceStatus,
  getDeviceUser,
  listDeviceTimers,
  listTempPasswords,
  listTuyaUsers,
  listUserPasswords,
} from "@/lib/tuya/access-control";

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
  const inspect = params.get("inspect");

  // ── DIAGNOSTICA DETTAGLIO MEMBER (validità sull'utente) ────────────────
  if (params.has("userinfo")) {
    const code = params.get("userinfo")?.trim();
    const u = await db.user.findFirst({
      where: code
        ? { accessCode: code, tuyaUserId: { not: null } }
        : { tuyaUserId: { not: null }, role: UserRole.SUBSCRIBER },
      select: { firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
    });
    if (!u?.tuyaUserId) return NextResponse.json({ mode: "userinfo", error: "no tuyaUserId" });
    try {
      const detail = await getDeviceUser(u.tuyaUserId);
      return NextResponse.json({ mode: "userinfo", user: `${u.firstName} ${u.lastName}`, code: u.accessCode, detail });
    } catch (err) {
      return NextResponse.json({ mode: "userinfo", user: `${u.firstName} ${u.lastName}`, error: (err as Error).message });
    }
  }

  // ── DIAGNOSTICA TEMP-PASSWORD (validità reale sul cloud) ───────────────
  if (params.get("temppw") === "1") {
    try {
      const list = await listTempPasswords();
      return NextResponse.json({ mode: "temppw", list });
    } catch (err) {
      return NextResponse.json({ mode: "temppw", error: (err as Error).message });
    }
  }

  // ── DIAGNOSTICA VALIDITÀ CHIAVI (effective/invalid/schedule) ───────────
  // ?keys=<code opzionale> → assigned-keys del device per l'utente indicato
  // (o il primo idoneo): mostra la validità reale della password.
  if (params.has("keys")) {
    const code = params.get("keys")?.trim();
    const u = await db.user.findFirst({
      where: code
        ? { accessCode: code, tuyaUserId: { not: null } }
        : { tuyaUserId: { not: null }, role: UserRole.SUBSCRIBER },
      select: { firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
    });
    if (!u?.tuyaUserId) {
      return NextResponse.json({ mode: "keys", error: "nessun utente con tuyaUserId" });
    }
    try {
      const keys = await getAssignedKeys(u.tuyaUserId);
      return NextResponse.json({
        mode: "keys",
        user: `${u.firstName} ${u.lastName}`,
        code: u.accessCode,
        tuyaUserId: u.tuyaUserId,
        keys,
      });
    } catch (err) {
      return NextResponse.json({ mode: "keys", user: `${u.firstName} ${u.lastName}`, error: (err as Error).message });
    }
  }

  // ── DIAGNOSTICA STATO DEVICE (tutti i DP) ──────────────────────────────
  if (params.get("status") === "1") {
    try {
      const status = await getDeviceStatus();
      return NextResponse.json({ mode: "status", status });
    } catch (err) {
      return NextResponse.json({ mode: "status", error: (err as Error).message });
    }
  }

  // ── DIAGNOSTICA TIMER ──────────────────────────────────────────────────
  // ?timers=1 → dumpa i task schedulati (Device Timer) sul device. Cerchiamo un
  // timer serale/mattutino che spenga/riaccenda la validazione dei codici.
  if (params.get("timers") === "1") {
    try {
      const timers = await listDeviceTimers();
      return NextResponse.json({ mode: "timers", timers });
    } catch (err) {
      return NextResponse.json({ mode: "timers", error: (err as Error).message });
    }
  }

  // ── MODALITÀ ISPEZIONE ─────────────────────────────────────────────────
  // ?inspect=N → per i primi N utenti idonei (con tuyaUserId), dumpa i record
  // password dal device, così vediamo se hanno fasce orarie/validità attaccate.
  if (inspect) {
    const n = Math.max(1, Math.min(10, Number(inspect) || 3));
    const candidates = await db.user.findMany({
      where: { tuyaUserId: { not: null } },
      select: {
        firstName: true,
        lastName: true,
        accessCode: true,
        tuyaUserId: true,
        role: true,
        subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true } },
      },
      take: 200,
    });
    const eligible = candidates
      .filter(
        (u) =>
          u.role === UserRole.ADMIN ||
          u.role === UserRole.INSTRUCTOR ||
          (u.role === UserRole.SUBSCRIBER && isSubscriptionActive(u.subscription))
      )
      .slice(0, n);

    const records = [];
    for (const u of eligible) {
      try {
        const raw = await listUserPasswords(u.tuyaUserId!);
        records.push({ name: `${u.firstName} ${u.lastName}`, code: u.accessCode, tuyaUserId: u.tuyaUserId, passwords: raw });
      } catch (err) {
        records.push({ name: `${u.firstName} ${u.lastName}`, code: u.accessCode, error: (err as Error).message });
      }
    }
    return NextResponse.json({ mode: "inspect", inspected: records.length, records });
  }

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
