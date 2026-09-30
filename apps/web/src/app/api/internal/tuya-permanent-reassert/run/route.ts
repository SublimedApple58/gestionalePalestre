import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runTuyaPermanentReassertJob } from "@/lib/services/tuya-permanent-reassert-job";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return false;
  }

  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearer === expected || headerSecret === expected;
}

/**
 * Cron SETTIMANALE: ri-afferma la validità PERMANENTE su tutti i member idonei.
 * Rete di sicurezza contro i codici "OK di giorno, KO di notte" (member tornati
 * a validità limitata). Solo `setUserPermanent`, nessuna riscrittura PIN.
 *
 * Auth: Vercel Cron invia `Authorization: Bearer <CRON_SECRET>`; supportato anche
 * l'header manuale `x-cron-secret` per invocazioni di test.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const summary = await runTuyaPermanentReassertJob(db);

  console.log("[tuya-permanent-reassert] Job completed:", JSON.stringify(summary));

  return NextResponse.json(summary);
}
