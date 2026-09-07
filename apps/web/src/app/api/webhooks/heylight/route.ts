import { NextResponse } from "next/server";
import { db, PaymentProvider } from "@gestionale/db";

import { reconcileHeyLightPayment } from "@/lib/services/payment-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook HeyLight/Compass (BNPL) — notifica asincrona dei cambi di stato del
 * contratto. Configurato nell'oggetto `webhooks` della create (`/init/`) con
 * `status_url` = questa route e `token` = il nostro reference (Payment.id).
 *
 * Approccio: il webhook è un **trigger sottile**. Non ci fidiamo del payload
 * (snello e senza firma HMAC documentata): identifichiamo il Payment e deleghiamo
 * a `reconcileHeyLightPayment`, che interroga la GET /applications/ di HeyLight
 * (autenticata con la nostra merchant key) come **fonte di verità** e attiva
 * l'abbonamento solo se il contratto risulta davvero `success`. Un webhook
 * falsificato al più innesca una GET a vuoto: non può creare un "pagato" falso.
 *
 * Idempotente: `reconcileHeyLightPayment` no-op se il Payment è già finale.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

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
