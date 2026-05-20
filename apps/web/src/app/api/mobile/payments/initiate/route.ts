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
 * Body: { tier, installments?: boolean }
 * 200: { paymentId, hostedUrl, amountCents, tier }
 *
 * Crea un Payment(PENDING) provider=SUMUP via lo stesso `initiatePayment` del
 * web, ma con `returnUrl` che usa il custom scheme `houseofmuscle://` così a
 * pagamento concluso SumUp redirige nell'app via deep link.
 *
 * Se `installments: true` e il tier ha rate, crea anche un InstallmentPlan.
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
  const payInInstallments = (raw as { installments?: boolean }).installments === true;

  if (payInInstallments && !tierConfig.installments) {
    return NextResponse.json({ error: "INSTALLMENTS_NOT_AVAILABLE" }, { status: 400 });
  }

  const amountCents = payInInstallments && tierConfig.installments
    ? tierConfig.installments.amountCents
    : tierConfig.oneShotCents;

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { sumupCustomerId: true }
  });

  // Crea il record Payment con un providerReference temporaneo.
  const payment = await db.payment.create({
    data: {
      userId: user.id,
      provider: PaymentProvider.SUMUP,
      providerReference: `pending-${crypto.randomUUID()}`,
      amountCents,
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
      payInInstallments,
      reference: payment.id,
      returnUrl: mobileReturnUrl,
      customer: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
      sumupCustomerId: dbUser?.sumupCustomerId ?? undefined
    });

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          provider: initiated.provider,
          providerReference: initiated.providerReference,
          amountCents: initiated.amountCents
        }
      });

      if (initiated.sumupCustomerId) {
        await tx.user.update({
          where: { id: user.id },
          data: { sumupCustomerId: initiated.sumupCustomerId }
        });
      }

      if (initiated.installmentPlan) {
        await tx.installmentPlan.create({
          data: {
            paymentId: payment.id,
            userId: user.id,
            totalAmountCents: initiated.installmentPlan.installmentAmountCents * initiated.installmentPlan.installmentsCount,
            installmentsCount: initiated.installmentPlan.installmentsCount,
            installmentAmountCents: initiated.installmentPlan.installmentAmountCents,
            firstChargeAt: initiated.installmentPlan.firstChargeAt,
            installments: {
              create: Array.from(
                { length: initiated.installmentPlan.installmentsCount },
                (_, idx) => ({
                  sequenceNumber: idx + 1,
                  dueAt: addMonthsUtc(initiated.installmentPlan!.firstChargeAt, idx),
                  amountCents: initiated.installmentPlan!.installmentAmountCents
                })
              )
            }
          }
        });
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

function addMonthsUtc(base: Date, months: number): Date {
  const d = new Date(base);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds()
    )
  );
}
