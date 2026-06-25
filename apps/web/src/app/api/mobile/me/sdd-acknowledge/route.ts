import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/me/sdd-acknowledge
 * Auth: bearer access token
 * 200: { ok: true }
 *
 * Registra la presa visione del mandato SEPA Direct Debit (SDD) da parte
 * dell'utente autenticato. Idempotente: scrive il timestamp solo alla prima
 * accettazione (preserva la data originale). Sblocca il gate bloccante mobile.
 */
export const POST = withMobileAuth(async (_request, { user }) => {
  await db.user.updateMany({
    where: { id: user.id, sddMandateAcceptedAt: null },
    data: { sddMandateAcceptedAt: new Date() }
  });

  return NextResponse.json({ ok: true });
});
