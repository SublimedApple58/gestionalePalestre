import { db, InstallmentPlanStatus, InstallmentStatus, PaymentStatus } from "@gestionale/db";

import { cancelSubscription } from "@/lib/payments/revolut";
import { syncPinToKeypad } from "@/lib/services/tuya-pin-service";
import { ACCESS_GRACE_DAYS } from "@/lib/subscription";

type ReconcileSummary = {
  activePlans: number;
  completedPlans: number;
  discardedAbandoned: number;
  discardedPendingNoPlan: number;
  /** Piani con rata scaduta insoluta -> accesso tagliato (rete di sicurezza). */
  arrearsSuspended: number;
};

// Un checkout a rate lasciato a metà (redirect Revolut mai completato) crea
// comunque un piano + subscription Revolut. Dopo questa finestra senza NESSUNA
// rata pagata e col pagamento setup ancora in attesa, lo consideriamo abbandonato
// e lo buttiamo via. Generoso: un pagamento reale avviene in minuti, non in giorni.
const ABANDON_AFTER_MS = 48 * 60 * 60 * 1000;

// Oltre questa finestra dalla scadenza, una rata SCHEDULED mai confermata dal
// webhook Revolut è considerata insoluta (allineata alla grazia porta di 2 giorni).
const ARREARS_GRACE_MS = ACCESS_GRACE_DAYS * 24 * 60 * 60 * 1000;

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
      userId: true,
      revolutSubscriptionId: true,
      createdAt: true,
      paymentId: true,
      payment: { select: { status: true, tier: true } },
      installments: { select: { id: true, status: true, dueAt: true } }
    }
  });

  const now = Date.now();
  let completed = 0;
  let discarded = 0;
  let arrearsSuspended = 0;

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
      continue;
    }

    // Rete di sicurezza per rate insolute (webhook Revolut perso): piano PARTITO
    // (≥1 rata pagata) con una rata SCHEDULED scaduta oltre la grazia (2gg) e mai
    // confermata. La trattiamo come insoluta: rata -> FAILED, endsAt riportato alla
    // scadenza della rata (così il PIN si spegne), e sync del PIN. NON annulliamo
    // piano/subscription: Revolut continua a ritentare e, se paga, il webhook
    // (handleInstallmentPaid) ripristina la copertura piena e riaccende il PIN.
    if (!nonePaid) {
      const cutoff = new Date(now - ARREARS_GRACE_MS);
      const overdue = plan.installments.filter(
        (i) => i.status === InstallmentStatus.SCHEDULED && i.dueAt < cutoff
      );
      if (overdue.length > 0) {
        const earliestDue = overdue.reduce((m, i) => (i.dueAt < m ? i.dueAt : m), overdue[0]!.dueAt);
        const sub = await db.userSubscription.findUnique({ where: { userId: plan.userId } });
        // Non tocchiamo un abbonamento attivo di tier DIVERSO dal piano (es. mensile
        // assegnato a mano dalla reception): non deve spegnersi per una rata annuale.
        const unrelatedTier =
          sub != null && sub.deactivatedAt == null && sub.tier !== plan.payment.tier;

        await db.$transaction(async (tx) => {
          await tx.installment.updateMany({
            where: { id: { in: overdue.map((i) => i.id) } },
            data: {
              status: InstallmentStatus.FAILED,
              failureReason: "Rata scaduta non confermata (rete di sicurezza)"
            }
          });
          // Solo se accorcia: mai estendere una copertura più lunga.
          if (sub != null && !unrelatedTier && sub.endsAt > earliestDue) {
            await tx.userSubscription.update({
              where: { userId: plan.userId },
              data: { endsAt: earliestDue }
            });
          }
        });

        if (sub != null && !unrelatedTier) {
          await syncPinToKeypad(db, plan.userId).catch((e) =>
            console.error(`[installments-reconcile] pin sync fallito per user=${plan.userId}:`, e)
          );
        }
        arrearsSuspended += 1;
      }
    }
  }

  // Seconda passata: checkout a rate abbandonati che NON hanno un piano (col nuovo
  // flusso il piano nasce solo a prima rata pagata). Restano come Payment PENDING
  // con `providerReference` = subscription Revolut. Dopo 48h li chiudiamo e
  // cancelliamo la subscription così non prova ad addebitare. Escludiamo i
  // `pending-*` (chiamata al gateway mai riuscita → nessuna subscription reale).
  const stalePending = await db.payment.findMany({
    where: {
      provider: "REVOLUT",
      status: PaymentStatus.PENDING,
      installmentPlan: null,
      createdAt: { lt: new Date(now - ABANDON_AFTER_MS) },
      NOT: { providerReference: { startsWith: "pending-" } }
    },
    select: { id: true, providerReference: true }
  });

  let discardedPendingNoPlan = 0;
  for (const p of stalePending) {
    await cancelSubscription(p.providerReference).catch(() => {
      // Idempotente/tollerante: se non è una subscription (one-shot) Revolut dà 404.
    });
    await db.payment.updateMany({
      where: { id: p.id, status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.CANCELED,
        failureReason: "Acquisto a rate abbandonato (mai completato)"
      }
    });
    discardedPendingNoPlan += 1;
  }

  return {
    activePlans: activePlans.length,
    completedPlans: completed,
    discardedAbandoned: discarded,
    discardedPendingNoPlan,
    arrearsSuspended
  };
}
