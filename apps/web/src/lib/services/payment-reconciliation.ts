import { db, InstallmentStatus, PaymentProvider, PaymentStatus, type Payment } from "@gestionale/db";

import { getCheckout } from "@/lib/payments/sumup";
import { computeSubscriptionEndDate } from "@/lib/subscription";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

/**
 * Riconciliazione pull-side di un Payment SumUp: interroga SumUp via API,
 * se lo stato remoto è finale aggiorna Payment + (se PAID) la UserSubscription
 * in una singola transazione.
 *
 * Se il pagamento ha un InstallmentPlan, marca anche la prima rata come PAID.
 *
 * Idempotente:
 *  - Payment già in stato finale (PAID / FAILED / CANCELED / REFUNDED) → no-op, ritorna il Payment.
 *  - Provider ≠ SUMUP oppure `providerReference` mancante → no-op.
 *  - Se SumUp risponde ancora PENDING → no-op, ritorna il Payment invariato.
 */
export async function reconcileSumUpPayment(paymentId: string): Promise<Payment | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      installmentPlan: { include: { installments: true } }
    }
  });
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
    const result = await db.$transaction(async (tx) => {
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
          endsAt,
          deactivatedAt: null
        },
        create: {
          userId: payment.userId,
          tier: updated.tier,
          startsAt,
          endsAt
        }
      });

      const finalPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id }
      });

      // Se il pagamento ha un piano rateale, marca la prima rata come PAID
      if (payment.installmentPlan) {
        const firstInstallment = payment.installmentPlan.installments.find(
          (i) => i.sequenceNumber === 1
        );
        if (firstInstallment && firstInstallment.status !== InstallmentStatus.PAID) {
          await tx.installment.update({
            where: { id: firstInstallment.id },
            data: {
              status: InstallmentStatus.PAID,
              paidAt: new Date(),
              providerReference: payment.providerReference
            }
          });
        }
      }

      return finalPayment;
    });

    safeSyncPinToKeypad(db, payment.userId);

    return result;
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
 * Riconciliazione Stripe — stub. Il webhook Stripe chiama questa funzione;
 * l'implementazione completa verra' aggiunta quando Stripe sara' attivo.
 */
export async function reconcileStripePayment(paymentId: string): Promise<Payment | null> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== PaymentProvider.STRIPE) return payment;
  // TODO: implementare riconciliazione Stripe (query PaymentIntent via API)
  return payment;
}
