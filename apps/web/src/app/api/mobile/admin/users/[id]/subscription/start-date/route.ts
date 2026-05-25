import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";
import { computeSubscriptionEndDate } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional()
});

/**
 * POST /api/mobile/admin/users/[id]/subscription/start-date
 * Body: { startsAt: ISO 8601 }
 *
 * Cambia la data di partenza dell'abbonamento esistente. endsAt viene
 * ricalcolato in base al tier corrente (1/12/24 mesi).
 */
export const POST = withMobileAuth<{ id: string }>(
  async (request, { params, user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sub = await db.userSubscription.findUnique({
      where: { userId: params.id },
      select: { tier: true, startsAt: true, endsAt: true }
    });

    if (!sub) {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_FOUND" }, { status: 404 });
    }

    const newStartsAt = new Date(parsed.data.startsAt);
    let newEndsAt: Date;
    if (parsed.data.endsAt) {
      newEndsAt = new Date(parsed.data.endsAt);
      if (newEndsAt < newStartsAt) {
        return NextResponse.json(
          { error: "ENDS_BEFORE_STARTS", message: "endsAt cannot be before startsAt" },
          { status: 400 }
        );
      }
    } else {
      newEndsAt = computeSubscriptionEndDate(sub.tier, newStartsAt);
    }

    await db.userSubscription.update({
      where: { userId: params.id },
      data: { startsAt: newStartsAt, endsAt: newEndsAt }
    });

    safeSyncPinToKeypad(db, params.id);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.SUBSCRIPTION_DATE_CHANGED,
      payload: {
        before: {
          startsAt: sub.startsAt.toISOString(),
          endsAt: sub.endsAt.toISOString()
        },
        after: {
          startsAt: newStartsAt.toISOString(),
          endsAt: newEndsAt.toISOString()
        }
      }
    });

    return NextResponse.json({
      ok: true,
      subscription: {
        tier: sub.tier,
        startsAt: newStartsAt.toISOString(),
        endsAt: newEndsAt.toISOString()
      }
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
