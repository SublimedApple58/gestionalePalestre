import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";
import { computeSubscriptionEndDate, isCustomEndsAt } from "@/lib/subscription";

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
 * Cambia la data di partenza dell'abbonamento esistente. Con `endsAt` esplicito
 * vale quello (manuale se diverso dallo standard). Senza: se la scadenza attuale
 * è manuale resta intoccata, altrimenti si ricalcola dal piano.
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
      select: { tier: true, startsAt: true, endsAt: true, endsAtManual: true }
    });

    if (!sub) {
      return NextResponse.json({ error: "SUBSCRIPTION_NOT_FOUND" }, { status: 404 });
    }

    const newStartsAt = new Date(parsed.data.startsAt);
    let newEndsAt: Date;
    let endsAtManual: boolean;
    if (parsed.data.endsAt) {
      newEndsAt = new Date(parsed.data.endsAt);
      if (newEndsAt < newStartsAt) {
        return NextResponse.json(
          { error: "ENDS_BEFORE_STARTS", message: "endsAt cannot be before startsAt" },
          { status: 400 }
        );
      }
      endsAtManual = isCustomEndsAt(sub.tier, newStartsAt, newEndsAt);
    } else if (sub.endsAtManual) {
      // Scadenza impostata a mano: vince sempre, si sposta solo l'inizio (anche
      // se cade prima del nuovo inizio → solo `warning` nella risposta, mai 400).
      newEndsAt = sub.endsAt;
      endsAtManual = true;
    } else {
      newEndsAt = computeSubscriptionEndDate(sub.tier, newStartsAt);
      endsAtManual = false;
    }

    await db.userSubscription.update({
      where: { userId: params.id },
      data: { startsAt: newStartsAt, endsAt: newEndsAt, endsAtManual }
    });

    safeSyncPinToKeypad(db, params.id);

    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.SUBSCRIPTION_DATE_CHANGED,
      payload: {
        before: {
          startsAt: sub.startsAt.toISOString(),
          endsAt: sub.endsAt.toISOString(),
          endsAtManual: sub.endsAtManual
        },
        after: {
          startsAt: newStartsAt.toISOString(),
          endsAt: newEndsAt.toISOString(),
          endsAtManual
        }
      }
    });

    return NextResponse.json({
      ok: true,
      ...(newEndsAt <= newStartsAt ? { warning: "MANUAL_ENDS_BEFORE_STARTS" } : {}),
      subscription: {
        tier: sub.tier,
        startsAt: newStartsAt.toISOString(),
        endsAt: newEndsAt.toISOString()
      }
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
