import { db, InstallmentStatus } from "@gestionale/db";

import { cancelSubscription } from "@/lib/payments/revolut";

type ReconcileSummary = {
  activePlans: number;
  completedPlans: number;
};

/**
 * Safety-net giornaliero per i piani rateali.
 *
 * Con le **Subscriptions native di Revolut** gli addebiti mensili sono gestiti
 * da Revolut e notificati via webhook (`/api/webhooks/revolut`) → questo job NON
 * addebita più nulla (a differenza del vecchio flusso SumUp `chargeRecurring`).
 * Resta come rete di sicurezza per chiudere i piani le cui rate risultano tutte
 * PAID, nel caso un webhook di completamento ciclo sia andato perso.
 *
 * ⚠️ SPIKE (Fase 0): estendere recuperando lo stato delle subscription Revolut
 * attive (GET subscription) e allineando le righe `Installment`, a copertura di
 * webhook persi sui singoli cicli.
 */
export async function runInstallmentsReconcileJob(): Promise<ReconcileSummary> {
  const activePlans = await db.installmentPlan.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      revolutSubscriptionId: true,
      installments: { select: { status: true } }
    }
  });

  let completed = 0;
  for (const plan of activePlans) {
    const allPaid = plan.installments.every((i) => i.status === InstallmentStatus.PAID);
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
    }
  }

  return { activePlans: activePlans.length, completedPlans: completed };
}
