import { db, InstallmentStatus, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/installments/[id]/retry
 *
 * Con le Subscriptions native di Revolut i ritenta degli addebiti falliti sono
 * gestiti da Revolut secondo la sua policy di dunning (e notificati via webhook).
 * Non esiste più un addebito one-off lato nostro (come avveniva con SumUp
 * `chargeRecurring`).
 *
 * ⚠️ SPIKE (Fase 0): se serve un retry manuale immediato, mappare qui l'endpoint
 * Revolut di retry pagamento subscription. In alternativa, l'admin può segnare la
 * rata come pagata manualmente (`markInstallmentPaidActionState`).
 */
export const POST = withMobileAuth<{ id: string }>(
  async (_request, { params }) => {
    const installment = await db.installment.findUnique({
      where: { id: params.id },
      select: { id: true, status: true }
    });

    if (!installment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (installment.status === InstallmentStatus.PAID) {
      return NextResponse.json({ ok: true, message: "Already paid" });
    }

    return NextResponse.json(
      {
        error: "MANUAL_RETRY_UNSUPPORTED",
        message:
          "Gli addebiti delle rate sono gestiti automaticamente da Revolut. Per forzare l'incasso, segnare la rata come pagata dalla dashboard."
      },
      { status: 501 }
    );
  },
  { allowedRoles: [UserRole.ADMIN] }
);
