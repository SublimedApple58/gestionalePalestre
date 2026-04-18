import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { runBirthdayRemindersJob } from "@/lib/services/birthday-service";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearer === expected || headerSecret === expected;
}

/**
 * Cron giornaliero: manda un'email agli admin con i compleanni di domani.
 * Stesso pattern auth (`CRON_SECRET`) di `/api/internal/document-jobs/run`.
 *
 * Schedulato da Vercel a 08:00 UTC (≈ 9:00–10:00 Italia) — vedi `vercel.json`.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runBirthdayRemindersJob(db);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/birthday-reminders] errore:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
