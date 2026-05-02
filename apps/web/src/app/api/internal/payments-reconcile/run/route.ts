import { NextResponse } from "next/server";

import { runPaymentsReconciliationJob } from "@/lib/services/payment-reconciliation-job";

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
 * Cron schedulato da Vercel ogni 15 minuti — vedi `vercel.json`.
 *
 * Riconcilia tutti i Payment SumUp ancora PENDING degli ultimi 14 giorni con la
 * stessa logica di `reconcileSumUpPayment` usata dalla success page. Idempotente
 * e safe: se SumUp risponde ancora PENDING resta no-op.
 *
 * Esiste perché il flusso "happy path" è polling pull-side sulla success page e,
 * se l'utente chiude il tab prima della redirect (caso Apple Pay su mobile), il
 * Payment resta orfano e l'abbonamento non viene mai creato.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runPaymentsReconciliationJob();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/payments-reconcile] errore:", err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
