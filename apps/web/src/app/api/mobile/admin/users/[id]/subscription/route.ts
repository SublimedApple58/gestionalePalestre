import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { DomainError } from "@/lib/services/errors";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";
import { assignSubscriptionByAdmin } from "@/lib/services/user-service";
import { mobileAdminUserSubscriptionSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/admin/users/[id]/subscription
 * Body: { tier, startsAt?: ISO }
 * 200: { ok: true, subscription: { tier, startsAt, endsAt } }
 *
 * Se startsAt assente → ora. La service calcola endsAt in base al tier.
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminUserSubscriptionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();

    try {
      await assignSubscriptionByAdmin(db, user.role, user.id, {
        targetUserId: params.id,
        tier: parsed.data.tier,
        startsAt
      });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }

    safeSyncPinToKeypad(db, params.id);

    const fresh = await db.userSubscription.findUnique({
      where: { userId: params.id },
      select: { tier: true, startsAt: true, endsAt: true }
    });

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.SUBSCRIPTION_ASSIGNED,
      payload: {
        tier: parsed.data.tier,
        startsAt: startsAt.toISOString(),
        endsAt: fresh?.endsAt.toISOString() ?? null
      }
    });

    return NextResponse.json({
      ok: true,
      subscription: fresh
        ? {
            tier: fresh.tier,
            startsAt: fresh.startsAt.toISOString(),
            endsAt: fresh.endsAt.toISOString()
          }
        : null
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
