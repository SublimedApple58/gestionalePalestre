"use server";

import { db, PaymentStatus, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/session";
import { initiatePayment } from "@/lib/payments";
import { CHECKOUT_TIERS, TIER_CATALOG, type CheckoutTier } from "@/lib/subscription";

function isCheckoutTier(value: unknown): value is CheckoutTier {
  return typeof value === "string" && (CHECKOUT_TIERS as readonly string[]).includes(value);
}

/**
 * Server action invocata dal form di `/checkout`.
 * Crea un record `Payment(PENDING)` in DB, chiama il gateway SumUp per creare
 * l'ordine hosted, salva il `providerReference` e reindirizza il browser all'URL hosted.
 *
 * Se payInInstallments=true e il tier ha rate, crea anche un InstallmentPlan con
 * la prima rata marcata PAID al completamento del checkout e le successive SCHEDULED.
 *
 * Se fallisce prima del redirect aggiorna `Payment.status=FAILED` e manda l'utente
 * su `/checkout/failure?reason=...`.
 */
export async function initiateCheckoutAction(formData: FormData): Promise<void> {
  const sessionUser = await requireRole([UserRole.SUBSCRIBER]);

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, firstName: true, lastName: true, email: true, sumupCustomerId: true }
  });

  if (!user) {
    redirect("/checkout/failure?reason=utente-non-trovato");
  }

  const rawTier = formData.get("tier");
  const rawInstallments = formData.get("installments");

  if (!isCheckoutTier(rawTier)) {
    redirect("/checkout/failure?reason=tier-non-valido");
  }

  const tier = rawTier;
  const payInInstallments = rawInstallments === "true" || rawInstallments === "on";
  const tierConfig = TIER_CATALOG[tier];

  if (payInInstallments && !tierConfig.installments) {
    redirect("/checkout/failure?reason=rate-non-disponibili-per-tier");
  }

  const amountCents = payInInstallments && tierConfig.installments
    ? tierConfig.installments.amountCents
    : tierConfig.oneShotCents;

  const baseUrl = process.env.PAYMENT_RETURN_BASE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

  const payment = await db.payment.create({
    data: {
      userId: user.id,
      provider: "SUMUP",
      providerReference: `pending-${crypto.randomUUID()}`,
      amountCents,
      currency: "EUR",
      status: PaymentStatus.PENDING,
      tier
    }
  });

  let hostedUrl: string;

  try {
    const initiated = await initiatePayment({
      tier,
      payInInstallments,
      reference: payment.id,
      returnUrl: `${baseUrl}/checkout/success?pid=${payment.id}`,
      customer: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
      sumupCustomerId: user.sumupCustomerId ?? undefined
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

    hostedUrl = initiated.hostedUrl;
  } catch (error) {
    console.error("[payment-actions] initiateCheckout failed", error);
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: error instanceof Error ? error.message : "Errore sconosciuto"
      }
    });
    redirect("/checkout/failure?reason=gateway-error");
  }

  redirect(hostedUrl);
}

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
