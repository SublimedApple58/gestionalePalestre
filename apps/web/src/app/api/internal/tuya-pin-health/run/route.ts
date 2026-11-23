import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runTuyaPinHealthJob } from "@/lib/services/tuya-pin-health-job";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return bearer === expected || headerSecret === expected;
}

/**
 * Cron NOTTURNO: health-check a rotazione dei PIN + riparazione dei codici spariti.
 * Sostituisce il vecchio `tuya-permanent-reassert` settimanale (lo assorbe).
 *
 * Tetti di budget Tuya sovrascrivibili via query per tuning/test:
 *   ?rotationDays=7  ?maxChecks=120  ?maxCalls=400  ?maxRecreates=10  ?maxOrphanDeletes=40
 *
 * Auth: Vercel Cron invia `Authorization: Bearer <CRON_SECRET>` (anche `x-cron-secret`).
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const p = new URL(request.url).searchParams;
  const num = (k: string): number | undefined => {
    const v = p.get(k);
    return v != null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
  };

  const summary = await runTuyaPinHealthJob(db, {
    rotationDays: num("rotationDays"),
    maxChecks: num("maxChecks"),
    maxCalls: num("maxCalls"),
    maxRecreates: num("maxRecreates"),
    maxOrphanDeletes: num("maxOrphanDeletes"),
  });

  // Log esplicito delle chiamate Tuya usate (vincolo budget piano free).
  console.log(
    `[tuya-pin-health] completed: tuyaCalls=${summary.tuyaCalls} deviceMembers=${summary.deviceMembers} ` +
      `stuckFound=${summary.stuckFound} stuckRecreated=${summary.stuckRecreated} ` +
      `checked=${summary.checked} repaired=${summary.repaired} ` +
      `orphansDeleted=${summary.orphansDeleted} orphansRemaining=${summary.orphansRemaining} ` +
      `deferred=${summary.deferred} ` +
      JSON.stringify({ ...summary, repairedCodes: "<hidden>", stuckCodes: "<hidden>" })
  );
  // Codici riparati in chiaro solo nei log (servono alla reception per avvisare).
  if (summary.stuckCodes.length || summary.repairedCodes.length) {
    console.log(
      `[tuya-pin-health] riparati: stuck=${JSON.stringify(summary.stuckCodes)} keys=${JSON.stringify(summary.repairedCodes)}`
    );
  }

  return NextResponse.json(summary);
}
