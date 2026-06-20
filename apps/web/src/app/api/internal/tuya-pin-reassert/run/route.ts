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

  // Default (cron) = FORCE: riscrive TUTTI i PIN. È l'unico modo per guarire un
  // azzeramento reale del device (il DB resta "attivo" ma il tastierino ha perso
  // le password → vanno riscritte a prescindere). ?smart=1 = versione gentile
  // (salta i confermati dagli open-logs), da NON usare per guarire un wipe.
  const smart = new URL(request.url).searchParams.get("smart") === "1";

  const result = await runTuyaPinReassertJob(db, { force: !smart });

  console.log("[tuya-pin-reassert] Job completed:", JSON.stringify(result));

  return NextResponse.json(result);
}
