import { NextResponse } from "next/server";

import { runInstallmentsChargeJob } from "@/lib/services/installments-charge-job";

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
 * Addebita tutte le rate SumUp scadute (dueAt <= oggi) sui customer con carta
 * salvata. Se una rata fallisce, l'abbonamento viene sospeso automaticamente.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runInstallmentsChargeJob();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/installments-charge] errore:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
