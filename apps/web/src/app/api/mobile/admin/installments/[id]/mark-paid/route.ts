import { db, InstallmentStatus, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/installments/[id]/mark-paid
 * 200: { ok: true }
 * 404: { error: "NOT_FOUND" }
 *
 * Segna una rata come pagata manualmente (contanti/bonifico).
 */
export const POST = withMobileAuth<{ id: string }>(
  async (_request, { params }) => {
    const installmentId = params.id;

    const installment = await db.installment.findUnique({
      where: { id: installmentId },
      include: {
        plan: {
          include: {
            user: { select: { id: true } }
          }
        }
      }
    });

    if (!installment) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (installment.status === InstallmentStatus.PAID) {
      return NextResponse.json({ ok: true, message: "Already paid" });
    }

    await db.installment.update({
      where: { id: installment.id },
      data: {
        status: InstallmentStatus.PAID,
        paidAt: new Date(),
        failureReason: null
      }
    });

    const userId = installment.plan.user.id;
    const planId = installment.planId;

    // Riattiva abbonamento se non ci sono più rate FAILED
    const remaining = await db.installment.count({
      where: { planId, status: InstallmentStatus.FAILED }
    });

    if (remaining === 0) {
      await db.userSubscription.updateMany({
        where: { userId, deactivatedAt: { not: null } },
        data: { deactivatedAt: null }
      });
      safeSyncPinToKeypad(db, userId);
    }

    // Completa piano se tutte le rate sono pagate
    const allInstallments = await db.installment.findMany({
      where: { planId },
      select: { status: true }
    });
    if (allInstallments.every((i) => i.status === InstallmentStatus.PAID)) {
      await db.installmentPlan.update({
        where: { id: planId },
        data: { status: "COMPLETED" }
      });
    }

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
