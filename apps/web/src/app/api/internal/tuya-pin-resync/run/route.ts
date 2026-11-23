import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { shouldHaveDoorPin } from "@/lib/subscription";
import { generateAccessCode } from "@/lib/access-code";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { ensureTuyaUser, syncPinToKeypad } from "@/lib/services/tuya-pin-service";
import {
  allocateUnlockMethods,
  setUserPermanent,
  createTempPassword,
  deleteTuyaUser,
  enablePin,
  syncUnlockMethods,
  getAssignedKeys,
  getDeviceStatus,
  getDeviceUser,
  listDeviceTimers,
  listTempPasswords,
  listDeviceUserSchedules,
  listTuyaUsers,
  listUserPasswords,
  readUserSchedule,
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

/** Codice a 6 cifre non usato da nessun altro utente (accessCode non è @unique). */
async function generateUniqueAccessCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateAccessCode();
    const taken = await db.user.findFirst({ where: { accessCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("impossibile generare un codice univoco");
}

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

  // ── FIX BATCH: rendi PERMANENTI tutti gli aventi diritto ───────────────
  if (params.get("permanentall") === "1") {
    const users = await db.user.findMany({
      where: { tuyaUserId: { not: null } },
      select: {
        firstName: true,
        lastName: true,
        accessCode: true,
        tuyaUserId: true,
        role: true,
        subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true } },
        entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
      },
    });
    const eligible = users.filter((u) =>
      shouldHaveDoorPin({ role: u.role, subscription: u.subscription, entryPackage: u.entryPackage })
    );
    const summary = { total: eligible.length, ok: 0, errors: [] as string[] };
    for (const u of eligible) {
      try {
        await setUserPermanent(u.tuyaUserId!);
        summary.ok++;
      } catch (err) {
        summary.errors.push(`${u.firstName} ${u.lastName} (${u.accessCode}): ${(err as Error).message}`);
      }
      await delay(250);
    }
    return NextResponse.json({ mode: "permanentall", ...summary });
  }

  // ── FIX CANDIDATO: imposta il MEMBER a validità PERMANENTE ─────────────
  if (params.has("permanent")) {
    const code = params.get("permanent")?.trim();
    const u = await db.user.findFirst({
      where: { accessCode: code },
      select: { firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
    });
    if (!u?.tuyaUserId) return NextResponse.json({ mode: "permanent", error: "no tuyaUserId" });
    try {
      const result = await setUserPermanent(u.tuyaUserId);
      return NextResponse.json({
        mode: "permanent",
        user: `${u.firstName} ${u.lastName}`,
        code: u.accessCode,
        result,
        note: "Prova il codice al tastierino.",
      });
    } catch (err) {
      return NextResponse.json({ mode: "permanent", user: `${u.firstName} ${u.lastName}`, error: (err as Error).message });
    }
  }

  // ── FIX CANDIDATO: ALLOCA i metodi password all'utente ────────────────
  if (params.has("allocate")) {
    const code = params.get("allocate")?.trim();
    const u = await db.user.findFirst({
      where: { accessCode: code },
      select: { firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
    });
    if (!u?.tuyaUserId) return NextResponse.json({ mode: "allocate", error: "no tuyaUserId" });
    try {
      const keys = (await getAssignedKeys(u.tuyaUserId)) as {
        unlock_keys?: Array<{ unlock_no: number; unlock_type: string }>;
      };
      const list = (keys.unlock_keys ?? [])
        .filter((k) => k.unlock_type === "password")
        .map((k) => ({ dp_code: "unlock_password", unlock_sn: k.unlock_no }));
      if (!list.length) return NextResponse.json({ mode: "allocate", error: "nessuna password key sul device" });
      const result = await allocateUnlockMethods(u.tuyaUserId, list);
      return NextResponse.json({
        mode: "allocate",
        user: `${u.firstName} ${u.lastName}`,
        code: u.accessCode,
        allocated: list,
        result,
        note: "Prova il codice al tastierino.",
      });
    } catch (err) {
      return NextResponse.json({ mode: "allocate", user: `${u.firstName} ${u.lastName}`, error: (err as Error).message });
    }
  }

  // ── FIX CANDIDATO: forza sync metodi di sblocco dal cloud → device ─────
  if (params.get("syncmethods") === "1") {
    try {
      const result = await syncUnlockMethods("unlock_password");
      return NextResponse.json({ mode: "syncmethods", result, note: "Prova un codice al tastierino." });
    } catch (err) {
      return NextResponse.json({ mode: "syncmethods", error: (err as Error).message });
    }
  }

  // ── TEST FIX: crea TEMP-PASSWORD (metodo cloud WiFi) per un utente ─────
  if (params.has("temptest")) {
    const code = params.get("temptest")?.trim();
    if (!code) return NextResponse.json({ mode: "temptest", error: "manca ?temptest=<code>" });
    const u = await db.user.findFirst({
      where: { accessCode: code },
      select: { firstName: true, lastName: true, accessCode: true },
    });
    if (!u) return NextResponse.json({ mode: "temptest", error: `nessun utente con codice ${code}` });
    const days = Number(params.get("days")) || 365;
    try {
      const result = await createTempPassword(u.accessCode, `${u.firstName} ${u.lastName}`, { days });
      return NextResponse.json({
        mode: "temptest",
        user: `${u.firstName} ${u.lastName}`,
        code: u.accessCode,
        days,
        result,
        note: "Vai al tastierino e prova questo codice.",
      });
    } catch (err) {
      return NextResponse.json({ mode: "temptest", user: `${u.firstName} ${u.lastName}`, error: (err as Error).message });
    }
  }

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

  // ── SCAN CONSEGNA VALIDITÀ (chi è ancora LIMITATO sulla serratura) ─────
  // ?schedulescan=1 → sola lettura, ~1 chiamata ogni 100 member. Elenca i
  // member idonei la cui validità permanente NON è stata consegnata al device
  // (delivery_status ≠ SUCCESS): sono i codici "OK di giorno, KO la sera".
  if (params.get("schedulescan") === "1") {
    const rows = await listDeviceUserSchedules(Number(params.get("pagesize")) || 100);
    const byId = new Map(rows.map((r) => [r.user_id, r]));
    const users = await db.user.findMany({
      where: { tuyaUserId: { not: null } },
      select: {
        firstName: true,
        lastName: true,
        accessCode: true,
        tuyaUserId: true,
        role: true,
        subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true } },
        entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
      },
    });
    const eligible = users.filter((u) =>
      shouldHaveDoorPin({ role: u.role, subscription: u.subscription, entryPackage: u.entryPackage })
    );
    const byStatus: Record<string, number> = {};
    const notDelivered: string[] = [];
    let missingOnDevice = 0;
    for (const u of eligible) {
      const row = byId.get(u.tuyaUserId!);
      if (!row) {
        missingOnDevice++;
        continue;
      }
      const s = row.time_schedule_info;
      const status = s?.delivery_status ?? (s?.permanent ? "PERMANENT_NO_STATUS" : "NO_SCHEDULE");
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      if (status !== "SUCCESS" && status !== "PERMANENT_NO_STATUS") {
        notDelivered.push(`${u.firstName} ${u.lastName} (${u.accessCode}): ${status} permanent=${s?.permanent}`);
      }
    }
    // Member sul device NON legati a un idoneo: ex iscritti mai cancellati
    // (PIN potenzialmente ancora valido) o orfani senza utente in DB.
    // user_type 50 = owner/admin dell'app Tuya, non un member del gestionale.
    const eligibleIds = new Set(eligible.map((u) => u.tuyaUserId!));
    const dbIds = new Set(users.map((u) => u.tuyaUserId!));
    const extra = rows.filter((r) => !eligibleIds.has(r.user_id) && r.user_type !== 50);
    const check = (params.get("check") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return NextResponse.json({
      mode: "schedulescan",
      deviceUsers: rows.length,
      eligible: eligible.length,
      missingOnDevice,
      byStatus,
      notDelivered,
      extraOnDevice: {
        total: extra.length,
        linkedToIneligibleUser: extra.filter((r) => dbIds.has(r.user_id)).length,
        notInDb: extra.filter((r) => !dbIds.has(r.user_id)).length,
      },
      orphanValidity: (() => {
        const nowSec = Date.now() / 1000;
        const c = { permanent: 0, validWindow: 0, expired: 0, noSchedule: 0, byType: {} as Record<string, number> };
        for (const r of extra) {
          const s = r.time_schedule_info;
          c.byType[String(r.user_type)] = (c.byType[String(r.user_type)] ?? 0) + 1;
          if (!s) c.noSchedule++;
          else if (s.permanent) c.permanent++;
          else if ((s.expired_time ?? 0) > nowSec) c.validWindow++;
          else c.expired++;
        }
        return c;
      })(),
      orphanKeySample: await (async () => {
        const n = Math.min(10, Number(params.get("orphansample")) || 0);
        const out: Array<{ id: string; name: string; sched: unknown; keys: unknown }> = [];
        for (const r of extra.slice(0, n)) {
          let keys: unknown;
          try {
            keys = await getAssignedKeys(r.user_id);
          } catch (err) {
            keys = { error: (err as Error).message };
          }
          out.push({ id: r.user_id, name: r.nick_name, sched: r.time_schedule_info, keys });
          await delay(250);
        }
        return out;
      })(),
      orphanIds: params.get("orphanids") === "1" ? extra.map((r) => r.user_id) : undefined,
      ...(check.length ? { stillOnDevice: check.filter((id) => byId.has(id)) } : {}),
    });
  }

  // ── RICREA il member da zero (member "incastrato" sulla serratura) ─────
  // ?recreate=<code>            → cancella il member dal device e lo ricrea pulito
  //                               (nuovo member + PIN + permanente).
  // ?recreate=<code>&newcode=1  → idem, ma con un CODICE NUOVO: il vecchio smette
  //                               di funzionare (codice prestato/compromesso).
  // Serve quando la validità del member resta FAILED/ONGOING anche ri-inviando
  // `?permanent`: il device rifiuta ogni modifica di quel member, quindi l'unica
  // via è un member nuovo. Verificare dopo con ?schedule=<code> → SUCCESS.
  if (params.has("recreate")) {
    const code = params.get("recreate")?.trim();
    const u = await db.user.findFirst({
      where: { accessCode: code },
      select: { id: true, firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
    });
    if (!u) return NextResponse.json({ mode: "recreate", error: `nessun utente con codice ${code}` });
    const label = `${u.firstName} ${u.lastName}`;

    if (u.tuyaUserId) {
      try {
        await deleteTuyaUser(u.tuyaUserId);
      } catch (err) {
        const msg = (err as Error).message;
        // Già assente dal device = ok; qualunque altro errore: fermati (non
        // creare un secondo member con lo stesso PIN accanto al vecchio).
        if (!msg.includes("1109") && !msg.toLowerCase().includes("not exist") && !msg.toLowerCase().includes("param is illegal")) {
          return NextResponse.json({ mode: "recreate", user: label, error: `delete: ${msg}` });
        }
      }
    }

    let accessCode = u.accessCode;
    if (params.get("newcode") === "1") {
      accessCode = await generateUniqueAccessCode();
    }
    await db.user.update({
      where: { id: u.id },
      data: { tuyaUserId: null, tuyaPinActive: false, tuyaPinUnlockNo: null, accessCode },
    });
    if (accessCode !== u.accessCode) {
      await logAdminAction(db, {
        actorId: null,
        targetUserId: u.id,
        action: AuditAction.PROFILE_UPDATED,
        payload: { before: { accessCode: "******" }, after: { accessCode: "nuovo" }, source: "tuya-pin-resync recreate&newcode" },
      });
    }

    await delay(DELAY_MS);
    try {
      await syncPinToKeypad(db, u.id);
    } catch (err) {
      return NextResponse.json({ mode: "recreate", user: label, accessCode, error: `sync: ${(err as Error).message}` });
    }
    const after = await db.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { accessCode: true, tuyaUserId: true, tuyaPinActive: true },
    });
    return NextResponse.json({
      mode: "recreate",
      user: label,
      oldTuyaUserId: u.tuyaUserId,
      ...after,
      note: `Verifica con ?schedule=${after.accessCode}: delivery_status deve diventare SUCCESS.`,
    });
  }

  // ── DIAGNOSTICA SCHEDULE MEMBER (permanente o fascia oraria?) ──────────
  // ?schedule=<code> → sola lettura: la validità reale del member sul device.
  if (params.has("schedule")) {
    const code = params.get("schedule")?.trim();
    const u = await db.user.findFirst({
      where: { accessCode: code, tuyaUserId: { not: null } },
      select: { firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
    });
    if (!u?.tuyaUserId) return NextResponse.json({ mode: "schedule", error: "no tuyaUserId" });
    const schedule = await readUserSchedule(u.tuyaUserId);
    return NextResponse.json({ mode: "schedule", user: `${u.firstName} ${u.lastName}`, code: u.accessCode, schedule });
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
        subscription: { select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true } },
        entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
      },
      take: 200,
    });
    const eligible = candidates
      .filter((u) =>
        shouldHaveDoorPin({
          role: u.role,
          subscription: u.subscription,
          entryPackage: u.entryPackage,
        })
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
        select: { startsAt: true, endsAt: true, deactivatedAt: true, autoRenew: true, arrearsSuspendedAt: true },
      },
      entryPackage: { select: { deactivatedAt: true, remainingEntries: true } },
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
    const shouldHavePin = shouldHaveDoorPin({
      role: user.role,
      subscription: user.subscription,
      entryPackage: user.entryPackage,
    });

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
      // Ri-afferma la validità permanente DOPO aver registrato il PIN: la
      // password appena creata non eredita in modo affidabile lo schedule del
      // member impostato prima che esistesse (→ codice limitato/notturno-KO).
      await setUserPermanent(tuyaUserId).catch(() => {});
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
