import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { shouldHaveDoorPin } from "@/lib/subscription";
import { TuyaBudgetError, withTuyaBudget } from "@/lib/tuya/client";
// SOLO funzioni di lettura (GET). Un test unitario fa fallire la build se qui
// viene importata una funzione che scrive (tests/unit/tuya-diag-readonly.test.ts),
// e il client in modalità `readOnly` rifiuta comunque ogni metodo ≠ GET.
import {
  getAssignedKeys,
  getDeviceStatus,
  getDeviceUser,
  getDeviceUserSchedule,
  listDeviceUserSchedules,
} from "@/lib/tuya/access-control";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return bearer === expected || headerSecret === expected;
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * DIAGNOSTICA TUYA — SOLA LETTURA. Fisicamente non può scrivere sulla serratura.
 * Ogni modalità dichiara il suo costo massimo in chiamate (token compreso).
 *
 *   ?mode=schedulescan[&orphansample=N≤10]  stato consegna validità di TUTTI i member  2 (+N)
 *   ?mode=schedule&code=<codice>            validità di un iscritto                    2
 *   ?mode=keys&code=<codice>                chiavi (password) di un iscritto           2
 *   ?mode=member&id=<tuyaUserId>            chi è un member del device                 2
 *   ?mode=status                            data point del device                      2
 *
 * Modalità o parametri sconosciuti → 400, nessuna chiamata.
 */
const MODES: Record<string, { params: string[]; budget: (p: URLSearchParams) => number }> = {
  schedulescan: { params: ["orphansample"], budget: (p) => 2 + sampleSize(p) },
  schedule: { params: ["code"], budget: () => 2 },
  keys: { params: ["code"], budget: () => 2 },
  member: { params: ["id"], budget: () => 2 },
  status: { params: [], budget: () => 2 },
};

function sampleSize(p: URLSearchParams): number {
  return Math.max(0, Math.min(10, Number(p.get("orphansample")) || 0));
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "";
  const spec = MODES[mode];
  if (!spec) return bad(`mode mancante o sconosciuto; validi: ${Object.keys(MODES).join(", ")}`);
  const unknown = [...params.keys()].filter((k) => k !== "mode" && !spec.params.includes(k));
  if (unknown.length) return bad(`parametri sconosciuti per ${mode}: ${unknown.join(", ")}`);

  const max = spec.budget(params);
  try {
    const { result, tuyaCalls } = await withTuyaBudget({ max, readOnly: true }, () =>
      run(mode, params)
    );
    if (result instanceof NextResponse) return result;
    console.log(`[tuya-diag] mode=${mode} tuyaCalls=${tuyaCalls}`);
    return NextResponse.json({ mode, tuyaCalls, ...result });
  } catch (err) {
    if (err instanceof TuyaBudgetError) return NextResponse.json({ mode, error: err.message }, { status: 429 });
    return NextResponse.json({ mode, error: (err as Error).message }, { status: 502 });
  }
}

async function userByCode(code: string | null) {
  if (!code) return null;
  return db.user.findFirst({
    where: { accessCode: code, tuyaUserId: { not: null } },
    select: { firstName: true, lastName: true, accessCode: true, tuyaUserId: true },
  });
}

async function run(mode: string, params: URLSearchParams): Promise<Record<string, unknown> | NextResponse> {
  switch (mode) {
    case "schedule":
    case "keys": {
      const u = await userByCode(params.get("code"));
      if (!u?.tuyaUserId) return bad("nessun utente con questo codice e un member Tuya");
      const user = `${u.firstName} ${u.lastName}`;
      return mode === "schedule"
        ? { user, code: u.accessCode, tuyaUserId: u.tuyaUserId, schedule: await getDeviceUserSchedule(u.tuyaUserId) }
        : { user, code: u.accessCode, tuyaUserId: u.tuyaUserId, keys: await getAssignedKeys(u.tuyaUserId) };
    }

    case "member": {
      const id = params.get("id")?.trim();
      if (!id) return bad("manca id");
      const linked = await db.user.findFirst({
        where: { tuyaUserId: id },
        select: { firstName: true, lastName: true, accessCode: true },
      });
      return { member: await getDeviceUser(id), linked };
    }

    case "status":
      return { status: await getDeviceStatus() };

    case "schedulescan":
      return scheduleScan(sampleSize(params));
  }
  return bad("mode sconosciuto");
}

async function scheduleScan(orphanSample: number): Promise<Record<string, unknown>> {
  const { rows } = await listDeviceUserSchedules();
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
  const missingOnDevice: string[] = [];
  for (const u of eligible) {
    const row = byId.get(u.tuyaUserId!);
    if (!row) {
      missingOnDevice.push(`${u.firstName} ${u.lastName} (${u.accessCode})`);
      continue;
    }
    const s = row.time_schedule_info;
    const status = s?.delivery_status ?? (s?.permanent ? "PERMANENT_NO_STATUS" : "NO_SCHEDULE");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (status !== "SUCCESS" && status !== "PERMANENT_NO_STATUS") {
      notDelivered.push(`${u.firstName} ${u.lastName} (${u.accessCode}): ${status} permanent=${s?.permanent}`);
    }
  }

  // user_type 50 = owner/admin dell'app Tuya, non un member del gestionale.
  const eligibleIds = new Set(eligible.map((u) => u.tuyaUserId!));
  const dbIds = new Set(users.map((u) => u.tuyaUserId!));
  const extra = rows.filter((r) => !eligibleIds.has(r.user_id) && r.user_type !== 50);

  const orphanKeySample: Array<{ id: string; name: string; keys: unknown }> = [];
  for (const r of extra.slice(0, orphanSample)) {
    orphanKeySample.push({ id: r.user_id, name: r.nick_name, keys: await getAssignedKeys(r.user_id) });
  }

  return {
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
    ...(orphanSample ? { orphanKeySample } : {}),
  };
}
