import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/subscription/deactivate
 *
 * Sospende l'abbonamento dell'utente target settando deactivatedAt = now.
 * Idempotente: se gia' disattivato non sovrascrive il timestamp originale.
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
    if (sub.deactivatedAt) {
      return NextResponse.json({ ok: true, alreadyDeactivated: true });
    }

    const now = new Date();
    await db.userSubscription.update({
      where: { userId: params.id },
      data: { deactivatedAt: now }
    });

    safeSyncPinToKeypad(db, params.id);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.SUBSCRIPTION_DEACTIVATED,
      payload: { tier: sub.tier, deactivatedAt: now.toISOString() }
    });

    return NextResponse.json({ ok: true, deactivatedAt: now.toISOString() });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
