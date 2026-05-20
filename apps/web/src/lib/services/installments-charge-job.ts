import { db, InstallmentStatus } from "@gestionale/db";

import { chargeRecurring } from "@/lib/payments/sumup";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

type ChargeSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ installmentId: string; error: string }>;
};

/**
 * Job giornaliero: addebita tutte le rate scadute (dueAt <= oggi) che sono ancora
 * SCHEDULED e il cui piano è ACTIVE. Per ogni rata:
 *  - Recupera il customer SumUp dall'utente
 *  - Crea un checkout recurring (addebito automatico su carta salvata)
 *  - Se successo → rata PAID
 *  - Se fallimento → rata FAILED, abbonamento sospeso (deactivatedAt)
 *
 * Dopo aver processato tutte le rate, controlla se i piani sono completati
 * (tutte le rate PAID → status COMPLETED).
 */
export async function runInstallmentsChargeJob(): Promise<ChargeSummary> {
  const now = new Date();

  const dueInstallments = await db.installment.findMany({
    where: {
      status: InstallmentStatus.SCHEDULED,
      dueAt: { lte: now },
      plan: { status: "ACTIVE" }
    },
    include: {
      plan: {
        include: {
          user: {
            select: {
              id: true,
              sumupCustomerId: true,
              firstName: true,
              lastName: true
            }
          },
          installments: { select: { id: true, status: true } }
        }
      }
    },
    orderBy: { dueAt: "asc" }
  });

  const summary: ChargeSummary = {
    processed: dueInstallments.length,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  for (const installment of dueInstallments) {
    const { plan } = installment;
    const { user } = plan;

    if (!user.sumupCustomerId) {
      const errorMsg = `Nessun customer SumUp per utente ${user.id}`;
      console.error(`[installments-charge] ${errorMsg}`);
      await markInstallmentFailed(installment.id, errorMsg, user.id);
      summary.failed++;
      summary.errors.push({ installmentId: installment.id, error: errorMsg });
      continue;
    }

    try {
      const result = await chargeRecurring({
        customerId: user.sumupCustomerId,
        amountCents: installment.amountCents,
        reference: `inst-${installment.id}`,
        description: `Rata ${installment.sequenceNumber}/${plan.installmentsCount} — ${user.firstName} ${user.lastName}`
      });

      if (result.status === "PAID" || result.status === "PENDING") {
        await db.installment.update({
          where: { id: installment.id },
          data: {
            status: InstallmentStatus.PAID,
            paidAt: now,
            providerReference: result.checkoutId
          }
        });
        summary.succeeded++;
      } else {
        await markInstallmentFailed(
          installment.id,
          `SumUp status: ${result.status}`,
          user.id
        );
        summary.failed++;
        summary.errors.push({
          installmentId: installment.id,
          error: `SumUp status: ${result.status}`
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Errore sconosciuto";
      console.error(`[installments-charge] Rata ${installment.id} fallita:`, error);
      await markInstallmentFailed(installment.id, errorMsg, user.id);
      summary.failed++;
      summary.errors.push({ installmentId: installment.id, error: errorMsg });
    }
  }

  // Controlla piani completati
  await checkCompletedPlans();

  return summary;
}

async function markInstallmentFailed(
  installmentId: string,
  failureReason: string,
  userId: string
): Promise<void> {
  await db.installment.update({
    where: { id: installmentId },
    data: {
      status: InstallmentStatus.FAILED,
      failureReason
    }
  });

  // Sospendi abbonamento
  await db.userSubscription.updateMany({
    where: { userId, deactivatedAt: null },
    data: { deactivatedAt: new Date() }
  });

  // Disabilita PIN Tuya
  safeSyncPinToKeypad(db, userId);
}

async function checkCompletedPlans(): Promise<void> {
  const activePlans = await db.installmentPlan.findMany({
    where: { status: "ACTIVE" },
    include: { installments: { select: { status: true } } }
  });

  for (const plan of activePlans) {
    const allPaid = plan.installments.every((i) => i.status === InstallmentStatus.PAID);
    if (allPaid) {
      await db.installmentPlan.update({
        where: { id: plan.id },
        data: { status: "COMPLETED" }
      });
    }
  }
}
