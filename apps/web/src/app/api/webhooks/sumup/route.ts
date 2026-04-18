import { NextResponse } from "next/server";
import { db, PaymentStatus } from "@gestionale/db";

import { getCheckout, verifyWebhookSignature } from "@/lib/payments/sumup";
import { computeSubscriptionEndDate } from "@/lib/subscription";

/**
 * Webhook SumUp per conferma/fallimento checkout.
 * SumUp POSTa JSON con `{ id, event_type, payload: { checkout_id, checkout_reference, status } }`
 * (il formato preciso può variare — manteniamo un parsing tollerante).
 *
 * Flow:
 *   1. Verifica firma (skip in dev se secret non settato).
 *   2. Trova `Payment` tramite `providerReference = checkout_id`.
 *   3. Se `status=PAID` → transaction: Payment + UserSubscription (upsert con endsAt calcolato).
 *   4. Se `FAILED|EXPIRED|CANCELED` → aggiorna status + failureReason.
 *
 * Il webhook è idempotente: un second delivery sullo stesso checkout non deve duplicare la
 * subscription — usiamo `db.userSubscription.upsert`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("sumup-signature");

  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const checkoutId = extractCheckoutId(body);
  const eventStatus = extractStatus(body);

  if (!checkoutId) {
    return NextResponse.json({ error: "missing-checkout-id" }, { status: 400 });
  }

  const payment = await db.payment.findFirst({
    where: { provider: "SUMUP", providerReference: checkoutId },
    include: { user: true }
  });

  if (!payment) {
    // Non restituiamo 404 per evitare che SumUp continui a riprovare all'infinito:
    // logghiamo e OK. Potrebbe essere un checkout creato fuori dal nostro flusso.
    console.warn(`[webhook/sumup] Payment non trovato per checkout ${checkoutId}`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Se lo status del webhook è sconosciuto o vago, facciamo una query GET a SumUp per sicurezza.
  let finalStatus = eventStatus ?? null;
  if (!finalStatus) {
    const remote = await getCheckout(checkoutId).catch(() => null);
    finalStatus = remote?.status ?? null;
  }

  if (finalStatus === "PAID") {
    await db.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          rawWebhookPayload: body as object
        }
      });

      const startsAt = new Date();
      const endsAt = computeSubscriptionEndDate(updated.tier, startsAt);

      const subscription = await tx.userSubscription.upsert({
        where: { userId: payment.userId },
        update: {
          tier: updated.tier,
          startsAt,
          endsAt
        },
        create: {
          userId: payment.userId,
          tier: updated.tier,
          startsAt,
          endsAt
        }
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id }
      });
    });

    return NextResponse.json({ ok: true });
  }

  if (finalStatus === "FAILED" || finalStatus === "EXPIRED") {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: finalStatus === "EXPIRED" ? PaymentStatus.CANCELED : PaymentStatus.FAILED,
        failureReason: `SumUp status: ${finalStatus}`,
        rawWebhookPayload: body as object
      }
    });
    return NextResponse.json({ ok: true });
  }

  // Status ancora PENDING / sconosciuto — no-op, aspettiamo prossimo webhook.
  return NextResponse.json({ ok: true, status: finalStatus ?? "unknown" });
}

function extractCheckoutId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.id === "string") return obj.id;
  if (typeof obj.checkout_id === "string") return obj.checkout_id;
  const payload = obj.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload.checkout_id === "string") return payload.checkout_id;
  if (payload && typeof payload.id === "string") return payload.id;
  return null;
}

function extractStatus(body: unknown): "PAID" | "FAILED" | "EXPIRED" | "PENDING" | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  const raw =
    (typeof obj.status === "string" && obj.status) ||
    (typeof (obj.payload as { status?: string } | undefined)?.status === "string" &&
      (obj.payload as { status: string }).status) ||
    null;
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "PAID" || upper === "FAILED" || upper === "EXPIRED" || upper === "PENDING") {
    return upper;
  }
  return null;
}
