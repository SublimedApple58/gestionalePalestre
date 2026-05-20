import { db, InstallmentStatus, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { chargeRecurring } from "@/lib/payments/sumup";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/installments/[id]/retry
 * 200: { ok: true }
 * 400/502: { error: string }
 *
 * Ritenta l'addebito SumUp per una rata specifica.
 */
export const POST = withMobileAuth<{ id: string }>(
  async (_request, { params }) => {
    const installmentId = params.id;

    const installment = await db.installment.findUnique({
      where: { id: installmentId },
      include: {
        plan: {
          include: {
            user: {
              select: { id: true, sumupCustomerId: true, firstName: true, lastName: true }
            }
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

    const { user } = installment.plan;
    if (!user.sumupCustomerId) {
      return NextResponse.json({ error: "NO_SUMUP_CUSTOMER" }, { status: 400 });
    }

    try {
      const result = await chargeRecurring({
        customerId: user.sumupCustomerId,
        amountCents: installment.amountCents,
        reference: `retry-inst-${installment.id}`,
        description: `Rata ${installment.sequenceNumber}/${installment.plan.installmentsCount} — ${user.firstName} ${user.lastName}`
      });

      if (result.status === "PAID" || result.status === "PENDING") {
        await db.installment.update({
          where: { id: installment.id },
          data: {
            status: InstallmentStatus.PAID,
            paidAt: new Date(),
            providerReference: result.checkoutId,
            failureReason: null
          }
        });

        await maybeReactivateSubscription(user.id, installment.planId);

        return NextResponse.json({ ok: true });
      }

      return NextResponse.json(
        { error: "CHARGE_FAILED", detail: result.status },
        { status: 502 }
      );
    } catch (error) {
      console.error("[mobile/installments/retry]", error);
      return NextResponse.json({ error: "GATEWAY_ERROR" }, { status: 502 });
    }
  },
  { allowedRoles: [UserRole.ADMIN] }
);

async function maybeReactivateSubscription(userId: string, planId: string): Promise<void> {
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
}
