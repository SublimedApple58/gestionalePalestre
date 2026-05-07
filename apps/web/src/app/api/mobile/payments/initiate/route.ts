import { db, PaymentProvider, PaymentStatus } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { initiatePayment } from "@/lib/payments";
import { TIER_CATALOG } from "@/lib/subscription";
import { mobileInitiatePaymentSchema } from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/payments/initiate
 * Auth: bearer access token
 * Body: { tier }
 * 200: { paymentId, hostedUrl, amountCents, tier }
 *
 * Crea un Payment(PENDING) provider=SUMUP via lo stesso `initiatePayment` del
 * web, ma con `returnUrl` che usa il custom scheme `houseofmuscle://` così a
 * pagamento concluso SumUp redirige nell'app via deep link.
 *
 * Il client (mobile) apre `hostedUrl` con `expo-web-browser.openAuthSessionAsync`
 * che intercetta automaticamente la redirect al custom scheme e ritorna il
 * controllo all'app.
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

  // Crea il record Payment con un providerReference temporaneo.
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      provider: PaymentProvider.SUMUP,
      providerReference: `pending-${crypto.randomUUID()}`,
      amountCents: tierConfig.oneShotCents,
      currency: "EUR",
      status: PaymentStatus.PENDING,
      tier
    }
  });

  // Return URL via custom scheme dell'app mobile. expo-web-browser intercetta
  // automaticamente questo schema e chiude il browser sheet.
  const mobileReturnUrl = `houseofmuscle://checkout/success?pid=${payment.id}`;

  try {
    const initiated = await initiatePayment({
      tier,
      payInInstallments: false, // mobile Phase 1: solo pagamento unica soluzione
      reference: payment.id,
      returnUrl: mobileReturnUrl,
      customer: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      }
    });

    await db.payment.update({
      where: { id: payment.id },
      data: {
        provider: initiated.provider,
        providerReference: initiated.providerReference,
        amountCents: initiated.amountCents
      }
    });

    return NextResponse.json({
      paymentId: payment.id,
      hostedUrl: initiated.hostedUrl,
      amountCents: initiated.amountCents,
      tier
    });
  } catch (error) {
    console.error("[mobile/payments/initiate] gateway failed:", error);
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: error instanceof Error ? error.message : "Gateway error"
      }
    });
    return NextResponse.json({ error: "GATEWAY_ERROR" }, { status: 502 });
  }
});
