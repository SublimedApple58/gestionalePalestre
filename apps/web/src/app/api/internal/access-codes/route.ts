import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { getActiveAccessCodes } from "@/lib/access/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * GET /api/internal/access-codes
 *
 * Sorgente di verità per il servizio locale (PC palestra): la lista dei codici
 * che DEVONO essere attivi sul tastierino in questo momento (ADMIN/INSTRUCTOR
 * sempre, SUBSCRIBER se abbonamento attivo).
 *
 * Il PC confronta questa lista con la tabella locale del device e riallinea.
 * Read-only: non tocca nulla.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const codes = await getActiveAccessCodes(db);
    return NextResponse.json({ count: codes.length, codes });
  } catch (err) {
    console.error("[access-codes] error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
