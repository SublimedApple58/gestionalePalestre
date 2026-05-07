import { db, PaymentProvider, PaymentStatus } from "@gestionale/db";

import { reconcileStripePayment, reconcileSumUpPayment } from "@/lib/services/payment-reconciliation";

/**
 * Finestra di lookback (in giorni) per cercare Payment SumUp ancora PENDING.
 * 14 giorni copre con larghezza il caso peggiore (utente che paga, abbandona,
 * torna due settimane dopo) senza sprecare query SumUp su ordini abbandonati
 * vecchi.
 */
const LOOKBACK_DAYS = 14;

export type ReconciliationJobSummary = {
  scanned: number;
  reconciledPaid: number;
  markedFailedOrCanceled: number;
  stillPending: number;
  errors: number;
};

/**
 * Cron job: scansiona i Payment SumUp ancora PENDING degli ultimi LOOKBACK_DAYS
 * e chiama `reconcileSumUpPayment` su ognuno. La funzione è già idempotente e
 * transaction-safe, quindi possiamo rifrullarla senza rischi.
 *
 * Pensato per coprire il caso in cui il polling pull-side sulla success page
 * non parte (utente chiude il tab dopo Apple Pay, rete che cade, ecc.).
 *
 * Schedulato da Vercel — vedi `apps/web/vercel.json`. Auth via `CRON_SECRET`.
 */
export async function runPaymentsReconciliationJob(): Promise<ReconciliationJobSummary> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const pendingPayments = await db.payment.findMany({
    where: {
      provider: { in: [PaymentProvider.SUMUP, PaymentProvider.STRIPE] },
      status: PaymentStatus.PENDING,
      createdAt: { gte: cutoff }
    },
    select: { id: true, provider: true }
  });

  const summary: ReconciliationJobSummary = {
    scanned: pendingPayments.length,
    reconciledPaid: 0,
    markedFailedOrCanceled: 0,
    stillPending: 0,
    errors: 0
  };

  for (const { id, provider } of pendingPayments) {
    try {
      const updated =
        provider === PaymentProvider.STRIPE
          ? await reconcileStripePayment(id)
          : await reconcileSumUpPayment(id);
      if (!updated) {
        summary.errors += 1;
        continue;
      }
      switch (updated.status) {
        case PaymentStatus.PAID:
          summary.reconciledPaid += 1;
          break;
        case PaymentStatus.FAILED:
        case PaymentStatus.CANCELED:
          summary.markedFailedOrCanceled += 1;
          break;
        default:
          summary.stillPending += 1;
      }
    } catch (err) {
      console.error(`[payments-reconcile-job] errore su payment=${id}:`, err);
      summary.errors += 1;
    }
  }

  return summary;
}
