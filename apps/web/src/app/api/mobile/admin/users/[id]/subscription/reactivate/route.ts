import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/subscription/reactivate
 *
 * Riattiva l'abbonamento azzerando deactivatedAt. Idempotente.
 */
export const POST = withMobileAuth<{ id: string }>(
  async (_request, { params, user }) => {
    const sub = await db.userSubscription.findUnique({
      where: { userId: params.id },
      select: { id: true, tier: true, deactivatedAt: true }
    });

    if (!sub) {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_FOUND" }, { status: 404 });
    }
    if (!sub.deactivatedAt) {
      return NextResponse.json({ ok: true, alreadyActive: true });
    }

    await db.userSubscription.update({
      where: { userId: params.id },
      data: { deactivatedAt: null }
    });

    safeSyncPinToKeypad(db, params.id);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.SUBSCRIPTION_REACTIVATED,
      payload: { tier: sub.tier, previousDeactivatedAt: sub.deactivatedAt.toISOString() }
    });

    return NextResponse.json({ ok: true });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
