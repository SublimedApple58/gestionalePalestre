import { db } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { reconcileStripePayment } from "@/lib/services/payment-reconciliation";
import { isSubscriptionActive } from "@/lib/subscription";
import { mobileConfirmPaymentSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/payments/confirm
 * Auth: bearer access token
 * Body: { paymentId }
 * 200: { payment, subscription }
 * 4xx: { error }
 *
 * Chiamata dall'app subito dopo `presentPaymentSheet()` con esito success: forza
 * la riconciliazione (idempotente) e ritorna il nuovo stato della subscription.
 * Il webhook Stripe può arrivare in qualunque ordine — `reconcileStripePayment`
 * è transaction-safe e no-op su stati finali, quindi non c'è race.
 *
 * Sicurezza: il payment deve appartenere all'utente autenticato (ownership check).
 */
export const POST = withMobileAuth(async (request, { user }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileConfirmPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Ownership check + esistenza
  const payment = await db.payment.findUnique({ where: { id: parsed.data.paymentId } });
  if (!payment || payment.userId !== user.id) {
    return NextResponse.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
  }

  const reconciled = await reconcileStripePayment(payment.id);

  const subscription = await db.userSubscription.findUnique({
    where: { userId: user.id }
  });

  return NextResponse.json({
    payment: reconciled
      ? {
          id: reconciled.id,
          status: reconciled.status,
          paidAt: reconciled.paidAt?.toISOString() ?? null
        }
      : null,
    subscription: subscription
      ? {
          tier: subscription.tier,
          startsAt: subscription.startsAt.toISOString(),
          endsAt: subscription.endsAt.toISOString(),
          isActive: isSubscriptionActive(subscription),
          daysRemaining: Math.max(
            0,
            Math.ceil((subscription.endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          )
        }
      : null
  });
});
