import { db, InstallmentStatus, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/installments/overdue
 * 200: { items: OverdueInstallment[] }
 *
 * Ritorna le rate scadute (FAILED o SCHEDULED con dueAt <= oggi) su piani ACTIVE.
 */
export const GET = withMobileAuth(
  async () => {
    const items = await db.installment.findMany({
      where: {
        status: { in: [InstallmentStatus.FAILED, InstallmentStatus.SCHEDULED] },
        dueAt: { lte: new Date() },
        plan: { status: "ACTIVE" }
      },
      include: {
        plan: {
          select: {
            id: true,
            installmentsCount: true,
            installmentAmountCents: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { dueAt: "asc" },
      take: 50
    });

    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        sequenceNumber: i.sequenceNumber,
        dueAt: i.dueAt.toISOString(),
        amountCents: i.amountCents,
        status: i.status,
        failureReason: i.failureReason,
        plan: {
          id: i.plan.id,
          installmentsCount: i.plan.installmentsCount,
          user: {
            id: i.plan.user.id,
            firstName: i.plan.user.firstName,
            lastName: i.plan.user.lastName,
            email: i.plan.user.email
          }
        }
      }))
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
