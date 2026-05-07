import { NextResponse, type NextRequest } from "next/server";

import { reconcileStripePayment } from "@/lib/services/payment-reconciliation";
import { verifyStripeWebhookSignature } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Stripe — canale primario di riconciliazione push-side.
 *
 * Eventi gestiti:
 *  - payment_intent.succeeded     → riconcilia (PAID + crea/aggiorna subscription)
 *  - payment_intent.payment_failed → riconcilia (marca FAILED)
 *  - payment_intent.canceled      → riconcilia (marca CANCELED)
 *
 * Idempotenza: deferiamo TUTTO a `reconcileStripePayment(paymentId)`, che è già
 * transaction-safe e no-op su stati finali. Stripe può rigirare lo stesso
 * evento più volte: nessun side-effect duplicato.
 *
 * IMPORTANTE: la verifica firma richiede il body raw (text), non `req.json()`.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "MISSING_SIGNATURE" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = verifyStripeWebhookSignature(rawBody, signature);
  } catch (error) {
    console.warn("[stripe-webhook] firma non valida:", error);
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const paymentIntent = event.data.object;
        const paymentId = paymentIntent.metadata?.paymentId;
        if (!paymentId) {
          console.warn(
            `[stripe-webhook] event=${event.type} ricevuto senza metadata.paymentId — skip`
          );
          return NextResponse.json({ received: true, action: "skipped-no-metadata" });
        }
        await reconcileStripePayment(paymentId);
        return NextResponse.json({ received: true, action: "reconciled", paymentId });
      }

      default:
        // Eventi non rilevanti (e.g. charge.*, payout.*) → 200 silenzioso così Stripe
        // non riprova all'infinito.
        return NextResponse.json({ received: true, action: "ignored", type: event.type });
    }
  } catch (error) {
    console.error("[stripe-webhook] errore handler:", error);
    // 500 → Stripe ritenta automaticamente con backoff esponenziale.
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
