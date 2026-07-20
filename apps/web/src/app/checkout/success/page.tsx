import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";

import { db } from "@gestionale/db";
import { reconcileRevolutPayment } from "@/lib/services/payment-reconciliation";
import { requireSessionUser } from "@/lib/session";
import { formatEuroCents, tierLabel } from "@/lib/subscription";
import { formatRomeDateTime } from "@/lib/datetime";

type SuccessPageProps = {
  searchParams: Promise<{ pid?: string }>;
};

export const dynamic = "force-dynamic";

/**
 * Landing page dopo redirect da hosted checkout Revolut.
 *
 * Architettura: polling pull-side (non dipendiamo dal webhook).
 * Al landing chiamiamo `reconcileRevolutPayment` che interroga Revolut API e
 * aggiorna Payment + UserSubscription se lo stato remoto è completed.
 *
 * Stati possibili dopo riconciliazione:
 *  - PAID    → conferma + CTA torna alla dashboard
 *  - PENDING → messaggio "in elaborazione" (utente può ricaricare)
 *  - FAILED/CANCELED → redirect a /checkout/failure
 */
export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const user = await requireSessionUser();
  const { pid } = await searchParams;

  if (!pid) {
    redirect("/dashboard");
  }

  // Prova riconciliazione remota (Revolut API) prima di leggere il Payment.
  // Se fallisce, continuiamo comunque con lo stato DB corrente.
  await reconcileRevolutPayment(pid).catch((error) => {
    console.warn(`[checkout/success] reconcile fallito per pid=${pid}:`, error);
  });

  const payment = await db.payment.findUnique({
    where: { id: pid },
    select: {
      id: true,
      userId: true,
      status: true,
      amountCents: true,
      tier: true,
      paidAt: true
    }
  });

  if (!payment || payment.userId !== user.id) {
    redirect("/dashboard");
  }

  if (payment.status === "FAILED" || payment.status === "CANCELED") {
    redirect("/checkout/failure?reason=gateway-error");
  }

  const isPaid = payment.status === "PAID";

  return (
    <main className="checkout-outcome">
      <section className="checkout-outcome-card">
        <div className={`checkout-outcome-icon ${isPaid ? "ok" : "pending"}`}>
          {isPaid ? (
            <CheckCircle2 size={48} aria-hidden="true" />
          ) : (
            <Clock size={48} aria-hidden="true" />
          )}
        </div>

        <h1>{isPaid ? "Pagamento confermato" : "Stiamo elaborando il pagamento"}</h1>

        <p className="checkout-outcome-sub">
          {isPaid
            ? `Abbonamento ${tierLabel(payment.tier)} attivato.`
            : `La conferma sta arrivando dalla banca: ricarica tra qualche secondo se non vedi l'abbonamento attivo.`}
        </p>

        <dl className="checkout-outcome-meta">
          <div>
            <dt>Importo</dt>
            <dd>{formatEuroCents(payment.amountCents)}</dd>
          </div>
          <div>
            <dt>Abbonamento</dt>
            <dd>{tierLabel(payment.tier)}</dd>
          </div>
          {payment.paidAt ? (
            <div>
              <dt>Data</dt>
              <dd>{formatRomeDateTime(payment.paidAt)}</dd>
            </div>
          ) : null}
        </dl>

        <Link href="/dashboard" className="button button-primary">
          Torna alla dashboard
        </Link>
      </section>
    </main>
  );
}
