import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runTuyaPinReassertJob } from "@/lib/services/tuya-pin-reassert-job";

export const runtime = "nodejs";
// Riscrive ~120+ PIN sequenzialmente (~1s/utente): serve una funzione lunga.
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

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // ?force=1 → riscrive TUTTI i PIN (emergenza: azzeramento reale del device).
  // Default: smart — salta i PIN confermati funzionanti dagli open-logs.
  const force = new URL(request.url).searchParams.get("force") === "1";

  const result = await runTuyaPinReassertJob(db, { force });

  console.log("[tuya-pin-reassert] Job completed:", JSON.stringify(result));

  return NextResponse.json(result);
}
