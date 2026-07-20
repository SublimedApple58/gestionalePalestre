import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runTuyaPinSyncJob } from "@/lib/services/tuya-pin-sync-job";
import { runTuyaAccessLogSyncJob } from "@/lib/services/tuya-access-log-sync-job";

export const runtime = "nodejs";

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
  const result = await runTuyaPinSyncJob(db);

  console.log(
    "[tuya-pin-sync] Job completed:",
    JSON.stringify({ pinSync: result, accessLog })
  );

  return NextResponse.json({ pinSync: result, accessLog });
}
