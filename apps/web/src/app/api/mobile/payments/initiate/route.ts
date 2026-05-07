import { db, PaymentProvider, PaymentStatus } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { createStripePaymentIntent, getStripePublishableKey } from "@/lib/payments/stripe";
import { TIER_CATALOG } from "@/lib/subscription";
import { mobileInitiatePaymentSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/payments/initiate
 * Auth: bearer access token
 * Body: { tier }
 * 200: { paymentId, clientSecret, publishableKey, amountCents, tier }
 * 4xx: { error }
 *
 * Crea un Payment(PENDING) provider=STRIPE e un Stripe PaymentIntent. Il
 * client (`@stripe/stripe-react-native`) usa `clientSecret` per aprire il
 * PaymentSheet con Apple/Google Pay nativi.
 */
export const POST = withMobileAuth(async (request, { user }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = mobileInitiatePaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const tier = parsed.data.tier as keyof typeof TIER_CATALOG;
  const tierConfig = TIER_CATALOG[tier];

  // 1) Crea il Payment(PENDING) provider STRIPE — providerReference temporaneo.
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      provider: PaymentProvider.STRIPE,
      providerReference: `pending-${crypto.randomUUID()}`,
      amountCents: tierConfig.oneShotCents,
      currency: "EUR",
      status: PaymentStatus.PENDING,
      tier
    }
  });

  // 2) Crea il PaymentIntent su Stripe e salva l'intent.id come reference.
  let clientSecret: string;
  let publishableKey: string;
  try {
    const intent = await createStripePaymentIntent({
      tier,
      paymentId: payment.id,
      userId: user.id,
      customerEmail: user.email
    });

    await db.payment.update({
      where: { id: payment.id },
      data: { providerReference: intent.paymentIntentId }
    });

    clientSecret = intent.clientSecret;
    publishableKey = getStripePublishableKey();
  } catch (error) {
    console.error("[mobile/payments/initiate] Stripe failed:", error);
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: error instanceof Error ? error.message : "Stripe error"
      }
    });
    return NextResponse.json({ error: "GATEWAY_ERROR" }, { status: 502 });
  }

  return NextResponse.json({
    paymentId: payment.id,
    clientSecret,
    publishableKey,
    amountCents: tierConfig.oneShotCents,
    tier
  });
});
