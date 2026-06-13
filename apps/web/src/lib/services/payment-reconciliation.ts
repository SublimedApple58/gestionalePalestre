import { db, InstallmentStatus, PaymentProvider, PaymentStatus, type Payment } from "@gestionale/db";

import { getOrder } from "@/lib/payments/revolut";
import { computeSubscriptionEndDate } from "@/lib/subscription";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

/**
 * Riconciliazione pull-side di un Payment Revolut: interroga Revolut via API,
 * se lo stato remoto è finale aggiorna Payment + (se PAID) la UserSubscription
 * in una singola transazione.
 *
 * Se il pagamento ha un InstallmentPlan, marca anche la prima rata come PAID.
 *
 * NOTA rate: per i pagamenti rateali `providerReference` è l'id della subscription
 * Revolut (non un ordine), quindi `getOrder` ritorna null → no-op. Per le rate la
 * fonte di verità è il webhook; questo reconcile copre principalmente il one-shot.
 *
 * Idempotente:
 *  - Payment già in stato finale (PAID / FAILED / CANCELED / REFUNDED) → no-op.
 *  - Provider ≠ REVOLUT oppure `providerReference` mancante → no-op.
 *  - Se Revolut risponde ancora pending → no-op, ritorna il Payment invariato.
 */
export async function reconcileRevolutPayment(paymentId: string): Promise<Payment | null> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      installmentPlan: { include: { installments: true } }
    }
  });
  if (!payment) return null;

  // Provider diverso o senza reference: no-op.
  if (payment.provider !== PaymentProvider.REVOLUT || !payment.providerReference) {
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

  const remote = await getOrder(payment.providerReference).catch((error) => {
    console.warn(
      `[payment-reconciliation] getOrder fallito per payment=${payment.id} reference=${payment.providerReference}:`,
      error
    );
    return null;
  });

  if (!remote) return payment;

  if (remote.state === "completed") {
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

  if (remote.state === "failed" || remote.state === "cancelled") {
    return await db.payment.update({
      where: { id: payment.id },
      data: {
        status: remote.state === "cancelled" ? PaymentStatus.CANCELED : PaymentStatus.FAILED,
        failureReason: `Revolut state: ${remote.state}`
      }
    });
  }

  // Stato ancora pending — no-op, l'utente vedrà il messaggio "in elaborazione".
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
