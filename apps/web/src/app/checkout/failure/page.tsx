import Link from "next/link";
import { AlertTriangle } from "lucide-react";

type FailurePageProps = {
  searchParams: Promise<{ reason?: string }>;
};

/**
 * Landing page di fallimento checkout.
 * `reason` è emesso da `initiateCheckoutAction` o dal webhook Revolut:
 *   - `tier-non-valido`              → tier assente o sconosciuto
 *   - `rate-non-disponibili-per-tier`→ tentativo rate su tier non compatibile
 *   - `gateway-error`                → errore dal provider (Revolut)
 * Mostriamo messaggio localizzato + CTA per ritentare o tornare alla dashboard.
 */
export default async function CheckoutFailurePage({ searchParams }: FailurePageProps) {
  const { reason } = await searchParams;

  const { title, message } = describeReason(reason);

  return (
    <main className="checkout-outcome">
      <section className="checkout-outcome-card">
        <div className="checkout-outcome-icon error">
          <AlertTriangle size={48} aria-hidden="true" />
        </div>

        <h1>{title}</h1>
        <p className="checkout-outcome-sub">{message}</p>

        <div className="checkout-outcome-actions">
          <Link href="/checkout" className="button button-primary">
            Riprova il pagamento
          </Link>
          <Link href="/dashboard" className="button button-ghost">
            Torna alla dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}

function describeReason(reason: string | undefined): { title: string; message: string } {
  switch (reason) {
    case "tier-non-valido":
      return {
        title: "Abbonamento non valido",
        message:
          "Il tipo di abbonamento selezionato non è riconosciuto. Torna alla pagina di acquisto e riprova."
      };
    case "rate-non-disponibili-per-tier":
      return {
        title: "Rate non disponibili per questo abbonamento",
        message:
          "Il pagamento a rate è disponibile solo per gli abbonamenti annuale e biennale. Scegli un'altra modalità di pagamento."
      };
    case "gateway-error":
      return {
        title: "Pagamento non completato",
        message:
          "Il provider di pagamento ha rifiutato la transazione o l'hai annullata. Nessun importo è stato addebitato — puoi riprovare quando vuoi."
      };
    default:
      return {
        title: "Qualcosa è andato storto",
        message:
          "Non siamo riusciti a completare il checkout. Riprova tra qualche istante o contatta il supporto se il problema persiste."
      };
  }
}
