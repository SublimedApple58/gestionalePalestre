import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { recordKeypadUnlock } from "@/lib/services/access-event-service";

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
 * POST /api/internal/access-events
 *
 * Riceve uno sblocco riportato dal servizio locale (PC palestra) e lo registra
 * come AccessEvent KEYPAD_UNLOCK, mappando il codice all'utente.
 *
 * Body: { code: string, occurredAt?: string (ISO), method?: string }
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { code?: unknown; occurredAt?: unknown; method?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "MISSING_CODE" }, { status: 400 });
  }

  let occurredAt: Date | undefined;
  if (typeof body.occurredAt === "string") {
    const parsed = new Date(body.occurredAt);
    if (!Number.isNaN(parsed.getTime())) {
      occurredAt = parsed;
    }
  }

  const method = typeof body.method === "string" ? body.method : undefined;

  try {
    const result = await recordKeypadUnlock(db, { code, occurredAt, method });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[access-events] error:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
