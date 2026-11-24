import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runTuyaPinSyncJob } from "@/lib/services/tuya-pin-sync-job";
import { runTuyaAccessLogSyncJob } from "@/lib/services/tuya-access-log-sync-job";
import { withTuyaBudget } from "@/lib/tuya/client";
import { withTuyaLock } from "@/lib/tuya/lock";

export const runtime = "nodejs";

// Rete di sicurezza sul client Tuya: ferma solo una fuga di chiamate (un giorno
// pieno di scadenze resta molto sotto).
const CRON_CALL_BUDGET = 600;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return false;
  }

  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearer === expected || headerSecret === expected;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // 1) Aggiorna gli ingressi dal tastierino (Tuya) e ricalcola i pacchetti ingressi:
  //    così chi ha esaurito i suoi ingressi viene rilevato e il codice disabilitato.
  //    Best-effort: se il pull Tuya fallisce, il pin-sync gira comunque.
  let accessLog: Awaited<ReturnType<typeof runTuyaAccessLogSyncJob>> | { error: string };
  try {
    accessLog = await runTuyaAccessLogSyncJob(db);
  } catch (e) {
    accessLog = { error: e instanceof Error ? e.message : "access-log-sync failed" };
    console.error("[tuya-pin-sync] access-log-sync fallito:", e);
  }

  // 2) Rigira tutti i PIN in base allo stato (abbonamenti scaduti + pacchetti esauriti).
  //    Sotto lock: mai insieme a un'operazione manuale o al health-check.
  const locked = await withTuyaLock(db, "cron:tuya-pin-sync", () =>
    withTuyaBudget({ max: CRON_CALL_BUDGET }, () => runTuyaPinSyncJob(db))
  );
  if ("busy" in locked) {
    console.error(`[tuya-pin-sync] pin-sync saltato: lock Tuya occupato da ${locked.busy}`);
    return NextResponse.json({ accessLog, error: "TUYA_LOCKED", heldBy: locked.busy }, { status: 409 });
  }
  const result = { ...locked.result.result, tuyaCalls: locked.result.tuyaCalls };

  console.log(
    "[tuya-pin-sync] Job completed:",
    JSON.stringify({ pinSync: result, accessLog })
  );

  return NextResponse.json({ pinSync: result, accessLog });
}
