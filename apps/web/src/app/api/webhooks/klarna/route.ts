import { NextResponse } from "next/server";

import { KLARNA_ENABLED, verifyWebhookSignature } from "@/lib/payments/klarna";

/**
 * Webhook Klarna — scaffold.
 *
 * Quando arriveranno le credenziali Klarna andranno gestiti almeno questi eventi:
 *  - `order.captured`                 → Payment.status = PAID, crea UserSubscription
 *  - `installment.charged`            → Installment.status = PAID, paidAt = now
 *  - `installment.charge_failed`      → Installment.status = FAILED + notifica admin
 *  - `order.refunded`                 → Payment.status = REFUNDED
 *  - `order.canceled`                 → Payment.status = CANCELED, revoca UserSubscription
 *
 * Finché KLARNA_ENABLED è false restituiamo 503 per evitare che webhook di test arrivati
 * per errore vengano processati come no-op silenziosi.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!KLARNA_ENABLED) {
    return NextResponse.json(
      { error: "klarna-not-configured" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("klarna-signature");

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  // TODO(klarna): parse event, update Payment / Installment / UserSubscription.
  console.warn("[webhook/klarna] received event but handler not yet implemented");
  return NextResponse.json({ ok: true, handled: false });
}
