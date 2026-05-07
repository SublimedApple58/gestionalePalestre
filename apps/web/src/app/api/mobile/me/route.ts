import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { isSubscriptionActive } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/me
 * Auth: bearer access token
 * 200: { user, accessCode, subscription | null }
 *
 * Single source of truth per la home dell'app. Mantiene minimale il payload.
 */
export const GET = withMobileAuth(async (_request, { user }) => {
  const [profile, subscription] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { accessCode: true }
    }),
    db.userSubscription.findUnique({
      where: { userId: user.id },
      select: { tier: true, startsAt: true, endsAt: true }
    })
  ]);

  if (!profile) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();
  const isActive = isSubscriptionActive(subscription, now);
  const daysRemaining =
    subscription && isActive
      ? Math.max(
          0,
          Math.ceil((subscription.endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        )
      : 0;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    },
    accessCode: profile.accessCode,
    subscription: subscription
      ? {
          tier: subscription.tier,
          startsAt: subscription.startsAt.toISOString(),
          endsAt: subscription.endsAt.toISOString(),
          isActive,
          daysRemaining
        }
      : null
  });
});
