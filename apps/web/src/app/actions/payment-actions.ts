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
 * Crea un record `Payment(PENDING)` in DB, chiama il gateway Revolut per creare
 * l'ordine hosted, salva il `providerReference` e reindirizza il browser all'URL hosted.
 *
 * Se payInInstallments=true e il tier ha rate, crea SOLO la subscription Revolut e
 * il Payment(PENDING): il piano rateale + le rate nascono nel webhook alla PRIMA
 * rata effettivamente pagata (l'acquisto a rate "parte" solo a acquisto completato).
 *
 * Se fallisce prima del redirect aggiorna `Payment.status=FAILED` e manda l'utente
 * su `/checkout/failure?reason=...`.
 */
export async function initiateCheckoutAction(formData: FormData): Promise<void> {
  const sessionUser = await requireRole([UserRole.SUBSCRIBER]);

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, firstName: true, lastName: true, email: true, revolutCustomerId: true }
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

  // Presa visione mandato SEPA SDD obbligatoria per gli acquisti a rate (addebito
  // ricorrente automatico). Difesa server-side: il gate UI non è bypassabile.
  if (payInInstallments && formData.get("sddAck") !== "true") {
    redirect("/checkout/failure?reason=mandato-sdd-non-accettato");
  }

  // Registra la presa visione (così l'acquirente non vedrà il gate bloccante).
  if (payInInstallments) {
    await db.user.updateMany({
      where: { id: user.id, sddMandateAcceptedAt: null },
      data: { sddMandateAcceptedAt: new Date() }
    });
  }

  const amountCents = payInInstallments && tierConfig.installments
    ? tierConfig.installments.amountCents
    : tierConfig.oneShotCents;

  const baseUrl = process.env.PAYMENT_RETURN_BASE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";

  const payment = await db.payment.create({
    data: {
      userId: user.id,
      provider: "REVOLUT",
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
      revolutCustomerId: user.revolutCustomerId ?? undefined
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

      if (initiated.revolutCustomerId) {
        await tx.user.update({
          where: { id: user.id },
          data: { revolutCustomerId: initiated.revolutCustomerId }
        });
      }

      // NB: per le rate NON creiamo qui il piano. L'acquisto a rate "parte" solo a
      // pagamento confermato: il piano + le rate nascono nel webhook alla prima rata
      // pagata (`ensureInstallmentPlan`). Così un checkout abbandonato non lascia mai
      // un piano armato che potrebbe toccare l'abbonamento. Il collegamento è già
      // garantito da `Payment.providerReference = revolutSubscriptionId`.
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
