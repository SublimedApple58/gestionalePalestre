import { NextResponse } from "next/server";
import { db, PaymentProvider } from "@gestionale/db";

import { verifyWebhookSignature } from "@/lib/payments/heylight";
import { reconcileHeyLightPayment } from "@/lib/services/payment-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook HeyLight/Compass (BNPL) — notifica asincrona dei cambi di stato del
 * contratto. Configurato nell'oggetto `webhooks` della create (`/init/`) con
 * `status_url` = questa route e `token` = il nostro reference (Payment.id).
 *
 * Sicurezza: verifichiamo la firma `X-Signature-SHA256` (HMAC-SHA256 sui byte raw
 * del body). Il payload è snello — SOLO `{ status, token }` — dove `token` è il
 * nostro reference (Payment.id) impostato alla create. Anche con firma valida NON
 * ci fidiamo dello `status` nel payload: identifichiamo il Payment e deleghiamo a
 * `reconcileHeyLightPayment`, che interroga la GET /applications/ (autenticata) come
 * **fonte di verità** e attiva l'abbonamento solo se il contratto è davvero `success`.
 *
 * Idempotente: `reconcileHeyLightPayment` no-op se il Payment è già finale.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  // Firma sui byte RAW: verificare PRIMA di qualunque parsing.
  const signature = request.headers.get("x-signature-sha256");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

  // `token`/`order_reference`/`reference` = il nostro Payment.id (lo impostiamo noi
  // alla create). `external_contract_uuid`/`contract_uuid` = il providerReference.
  const ref = str(body.token) ?? str(body.order_reference) ?? str(body.reference);
  const uuid = str(body.external_contract_uuid) ?? str(body.contract_uuid);

  let payment = ref
    ? await db.payment.findFirst({
        where: { id: ref, provider: PaymentProvider.HEYLIGHT },
        select: { id: true }
      })
    : null;

  if (!payment && uuid) {
    payment = await db.payment.findFirst({
      where: { providerReference: uuid, provider: PaymentProvider.HEYLIGHT },
      select: { id: true }
    });
  }

  if (!payment) {
    console.warn(`[webhook/heylight] Payment non trovato (ref=${ref} uuid=${uuid})`);
    return NextResponse.json({ ok: true, ignored: true });
  }

  await reconcileHeyLightPayment(payment.id).catch((error) => {
    console.error(`[webhook/heylight] reconcile fallito per payment=${payment?.id}:`, error);
  });

  return NextResponse.json({ ok: true });
}
