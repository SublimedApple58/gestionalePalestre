import { db, InstallmentPlanStatus, InstallmentStatus, PaymentStatus } from "@gestionale/db";

import { cancelSubscription } from "@/lib/payments/revolut";

type ReconcileSummary = {
  activePlans: number;
  completedPlans: number;
  discardedAbandoned: number;
};

// Un checkout a rate lasciato a metà (redirect Revolut mai completato) crea
// comunque un piano + subscription Revolut. Dopo questa finestra senza NESSUNA
// rata pagata e col pagamento setup ancora in attesa, lo consideriamo abbandonato
// e lo buttiamo via. Generoso: un pagamento reale avviene in minuti, non in giorni.
const ABANDON_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * Safety-net giornaliero per i piani rateali.
 *
 * Con le **Subscriptions native di Revolut** gli addebiti mensili sono gestiti
 * da Revolut e notificati via webhook (`/api/webhooks/revolut`) → questo job NON
 * addebita nulla. Fa due cose di manutenzione:
 *  1. chiude i piani con TUTTE le rate PAID (se un webhook di completamento è perso);
 *  2. BUTTA VIA i piani ABBANDONATI: chi ha cliccato "a rate" senza mai completare
 *     il pagamento (0 rate pagate, setup ancora in attesa, più vecchio di 48h) →
 *     cancella la subscription Revolut + marca il piano CANCELED + chiude il
 *     pagamento in attesa. Così i click a vuoto non lasciano spazzatura né
 *     tentativi di addebito a vuoto. I paganti veri (≥1 rata) non vengono toccati.
 */
export async function runInstallmentsReconcileJob(): Promise<ReconcileSummary> {
  const activePlans = await db.installmentPlan.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      revolutSubscriptionId: true,
      createdAt: true,
      paymentId: true,
      payment: { select: { status: true } },
      installments: { select: { status: true } }
    }
  });

  const now = Date.now();
  let completed = 0;
  let discarded = 0;

  for (const plan of activePlans) {
    const allPaid = plan.installments.every((i) => i.status === InstallmentStatus.PAID);
    const nonePaid = plan.installments.every((i) => i.status !== InstallmentStatus.PAID);

    if (allPaid) {
      await db.installmentPlan.update({
        where: { id: plan.id },
        data: { status: "COMPLETED" }
      });
      completed += 1;
      // Ferma la subscription Revolut così non addebita oltre il termine.
      if (plan.revolutSubscriptionId) {
        await cancelSubscription(plan.revolutSubscriptionId).catch((error) => {
          console.error(
            `[installments-reconcile] cancelSubscription fallito per plan=${plan.id}:`,
            error
          );
        });
      }
      continue;
    }

    // Abbandonato: nessuna rata pagata, setup mai completato, vecchio → scarta.
    const abandoned =
      nonePaid &&
      plan.payment.status === PaymentStatus.PENDING &&
      now - plan.createdAt.getTime() > ABANDON_AFTER_MS;

    if (abandoned) {
      if (plan.revolutSubscriptionId) {
        await cancelSubscription(plan.revolutSubscriptionId).catch((error) => {
          console.error(
            `[installments-reconcile] cancelSubscription (abbandonato) fallito per plan=${plan.id}:`,
            error
          );
        });
      }
      await db.installmentPlan.update({
        where: { id: plan.id },
        data: { status: InstallmentPlanStatus.CANCELED }
      });
      await db.payment.updateMany({
        where: { id: plan.paymentId, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.CANCELED,
          failureReason: "Acquisto a rate abbandonato (mai completato)"
        }
      });
      discarded += 1;
    }
  }

  return {
    activePlans: activePlans.length,
    completedPlans: completed,
    discardedAbandoned: discarded
  };
}
