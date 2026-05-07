import { db, PaymentProvider, PaymentStatus, type Payment } from "@gestionale/db";

import { getCheckout } from "@/lib/payments/sumup";
import { getStripePaymentIntent } from "@/lib/payments/stripe";
import { computeSubscriptionEndDate } from "@/lib/subscription";

/**
 * Riconciliazione pull-side di un Payment SumUp: interroga SumUp via API,
 * se lo stato remoto è finale aggiorna Payment + (se PAID) la UserSubscription
 * in una singola transazione.
 *
 * Idempotente:
 *  - Payment già in stato finale (PAID / FAILED / CANCELED / REFUNDED) → no-op, ritorna il Payment.
 *  - Provider ≠ SUMUP oppure `providerReference` mancante → no-op.
 *  - Se SumUp risponde ancora PENDING → no-op, ritorna il Payment invariato.
 *
 * Chiamanti previsti:
 *  - `/checkout/success` (polling al ritorno da hosted checkout) — uso primario.
 *  - `/api/webhooks/sumup` (se riattivato in futuro).
 *  - Fallback al login / dashboard per Payment orfani (se mai implementato).
 *
 * Nota: ogni eccezione di rete è ingoiata e logga warn — la success page resta
 * reattiva anche se SumUp è temporaneamente irraggiungibile.
 */
export async function reconcileSumUpPayment(paymentId: string): Promise<Payment | null> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;

  // Provider diverso o senza reference: no-op.
  if (payment.provider !== PaymentProvider.SUMUP || !payment.providerReference) {
    return payment;
  }

  // Stato già finale: nessuna query remota.
  if (
    payment.status === PaymentStatus.PAID ||
    payment.status === PaymentStatus.FAILED ||
    payment.status === PaymentStatus.CANCELED ||
    payment.status === PaymentStatus.REFUNDED
  ) {
    return payment;
  }

  const remote = await getCheckout(payment.providerReference).catch((error) => {
    console.warn(
      `[payment-reconciliation] getCheckout fallito per payment=${payment.id} reference=${payment.providerReference}:`,
      error
    );
    return null;
  });

  if (!remote) return payment;

  if (remote.status === "PAID") {
    return await db.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date()
        }
      });

      const startsAt = new Date();
      const endsAt = computeSubscriptionEndDate(updated.tier, startsAt);

      const subscription = await tx.userSubscription.upsert({
        where: { userId: payment.userId },
        update: {
          tier: updated.tier,
          startsAt,
          endsAt
        },
        create: {
          userId: payment.userId,
          tier: updated.tier,
          startsAt,
          endsAt
        }
      });

      return await tx.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id }
      });
    });
  }

  if (remote.status === "FAILED" || remote.status === "EXPIRED") {
    return await db.payment.update({
      where: { id: payment.id },
      data: {
        status: remote.status === "EXPIRED" ? PaymentStatus.CANCELED : PaymentStatus.FAILED,
        failureReason: `SumUp status: ${remote.status}`
      }
    });
  }

  // Stato ancora PENDING — no-op, l'utente vedrà il messaggio "in elaborazione".
  return payment;
}

/**
 * Riconciliazione Stripe: stessa shape di `reconcileSumUpPayment` ma usa
 * l'API PaymentIntent. Idempotente, transaction-safe, no-op su stato finale.
 *
 * Chiamanti:
 *  - `/api/webhooks/stripe` (canale primario, push-side)
 *  - `/api/mobile/payments/confirm` (polling lato app dopo presentPaymentSheet)
 *  - cron job di fallback (rete instabile)
 */
export async function reconcileStripePayment(paymentId: string): Promise<Payment | null> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;

  if (payment.provider !== PaymentProvider.STRIPE || !payment.providerReference) {
    return payment;
  }

  if (
    payment.status === PaymentStatus.PAID ||
    payment.status === PaymentStatus.FAILED ||
    payment.status === PaymentStatus.CANCELED ||
    payment.status === PaymentStatus.REFUNDED
  ) {
    return payment;
  }

  const intent = await getStripePaymentIntent(payment.providerReference).catch((error) => {
    console.warn(
      `[payment-reconciliation] getStripePaymentIntent fallito per payment=${payment.id} reference=${payment.providerReference}:`,
      error
    );
    return null;
  });

  if (!intent) return payment;

  if (intent.status === "succeeded") {
    return await db.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date()
        }
      });

      const startsAt = new Date();
      const endsAt = computeSubscriptionEndDate(updated.tier, startsAt);

      const subscription = await tx.userSubscription.upsert({
        where: { userId: payment.userId },
        update: {
          tier: updated.tier,
          startsAt,
          endsAt
        },
        create: {
          userId: payment.userId,
          tier: updated.tier,
          startsAt,
          endsAt
        }
      });

      return await tx.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id }
      });
    });
  }

  if (intent.status === "canceled") {
    return await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CANCELED,
        failureReason: `Stripe status: ${intent.status}`
      }
    });
  }

  if (intent.status === "requires_payment_method" && intent.last_payment_error) {
    return await db.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        failureReason: intent.last_payment_error.message ?? "Stripe last_payment_error"
      }
    });
  }

  // Stati intermedi (`requires_action`, `processing`, `requires_confirmation`,
  // `requires_capture`) → no-op, riconcilieremo al prossimo passaggio.
  return payment;
}
