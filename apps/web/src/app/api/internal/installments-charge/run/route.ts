import { NextResponse } from "next/server";

import { runInstallmentsReconcileJob } from "@/lib/services/installments-charge-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const bearer = request.headers.get("authorization")?.replace("Bearer ", "")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearer === expected || headerSecret === expected;
}

/**
 * Cron giornaliero alle 7:00 UTC (9:00 ora italiana) — vedi `vercel.json`.
 *
 * Safety-net per i piani rateali: con le Subscriptions native di Revolut gli
 * addebiti li gestisce Revolut (notifiche via webhook). Questo cron chiude i
 * piani le cui rate risultano tutte PAID, a copertura di webhook persi.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runInstallmentsReconcileJob();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/installments-charge] errore:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
