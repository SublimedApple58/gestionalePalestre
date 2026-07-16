import { NextResponse } from "next/server";
import {
  db,
  InstallmentPlanStatus,
  InstallmentStatus,
  PaymentStatus,
  type Prisma
} from "@gestionale/db";

import {
  cancelSubscription,
  getOrder,
  verifyWebhookSignature,
  type RevolutOrder
} from "@/lib/payments/revolut";
import { computeSubscriptionEndDate } from "@/lib/subscription";
import { safeSyncPinToKeypad } from "@/lib/services/tuya-pin-service";

/**
 * Webhook Revolut Merchant API per conferma/fallimento ordini e cicli subscription.
 *
 * Revolut POSTa JSON tipo `{ event, order_id, ... }` (eventi registrati:
 * ORDER_COMPLETED, ORDER_AUTHORISED, ORDER_CANCELLED, ORDER_PAYMENT_DECLINED).
 *
 * Approccio **state-driven**: a prescindere dall'evento, recuperiamo l'ordine via
 * API (`getOrder`) e agiamo sul suo `state` reale. L'ordine espone anche
 * `subscription_data.subscription_id` (cicli rata) e `merchant_order_data.reference`
 * (= `Payment.id` sugli ordini one-shot), che usiamo per collegarlo al nostro DB.
 *
 * Risoluzione del Payment:
 *  1. `order.subscriptionId` == `InstallmentPlan.revolutSubscriptionId` → rate.
 *  2. `order.externalReference` == `Payment.id` → one-shot.
 *  3. `order.id` == `Payment.providerReference` → fallback one-shot.
 *
 * Idempotente: one-shot via `userSubscription.upsert`; rate via dedup sull'`order_id`
 * salvato in `Installment.providerReference`. Tollerante a eventi fuori ordine.
 *
 * Rate "a termine": le subscription Revolut addebitano all'infinito (niente limite
 * cicli nativo) → quando l'ultima rata è PAID cancelliamo la subscription.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("revolut-signature");
  const timestamp = request.headers.get("revolut-request-timestamp");

  const valid = await verifyWebhookSignature(rawBody, signature, timestamp);
  if (!valid) {
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const orderId = extractOrderId(body);
  if (!orderId) {
    return NextResponse.json({ ok: true, ignored: "no-order-id" });
  }

  // Recupera l'ordine: ci dà state autorevole + linkage subscription/ext-ref.
  const order = await getOrder(orderId).catch((error) => {
    console.warn(`[webhook/revolut] getOrder fallito per order=${orderId}:`, error);
    return null;
  });
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "order-not-found" });
  }

  const payment = await resolvePayment(order);
  if (!payment) {
    console.warn(
      `[webhook/revolut] Payment non trovato (order=${order.id} sub=${order.subscriptionId} ref=${order.externalReference})`
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (order.state === "completed") {
    if (payment.installmentPlan) {
      await handleInstallmentPaid(payment, order.id, body);
    } else {
      await handleOneShotPaid(payment, body);
    }
    safeSyncPinToKeypad(db, payment.userId);
    return NextResponse.json({ ok: true });
  }

  if (order.state === "failed" || order.state === "cancelled") {
    if (payment.installmentPlan) {
      await handleInstallmentFailed(payment, order.state, body);
    } else {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: order.state === "cancelled" ? PaymentStatus.CANCELED : PaymentStatus.FAILED,
          failureReason: `Revolut order state: ${order.state}`,
          rawWebhookPayload: body as Prisma.InputJsonValue
        }
      });
    }
    safeSyncPinToKeypad(db, payment.userId);
    return NextResponse.json({ ok: true });
  }

  // Stato non finale (pending/processing/authorised) — no-op, aspettiamo il completamento.
  return NextResponse.json({ ok: true, state: order.state });
}

type ResolvedPayment = Prisma.PaymentGetPayload<{
  include: { installmentPlan: { include: { installments: true } } };
}>;

async function resolvePayment(order: RevolutOrder): Promise<ResolvedPayment | null> {
  const include = { installmentPlan: { include: { installments: true } } } as const;

  // 1. subscription_id → InstallmentPlan.revolutSubscriptionId (setup order + cicli)
  if (order.subscriptionId) {
    const plan = await db.installmentPlan.findFirst({
      where: { revolutSubscriptionId: order.subscriptionId },
      select: { paymentId: true }
    });
    if (plan) {
      const byPlan = await db.payment.findUnique({ where: { id: plan.paymentId }, include });
      if (byPlan && byPlan.provider === "REVOLUT") return byPlan;
    }
  }

  // 2. external reference → Payment.id (one-shot)
  if (order.externalReference) {
    const byRef = await db.payment.findUnique({ where: { id: order.externalReference }, include });
    if (byRef && byRef.provider === "REVOLUT") return byRef;
  }

  // 3. order id → Payment.providerReference (fallback one-shot)
  const byOrder = await db.payment.findFirst({
    where: { provider: "REVOLUT", providerReference: order.id },
    include
  });
  return byOrder;
}

async function handleOneShotPaid(payment: ResolvedPayment, body: unknown): Promise<void> {
  if (payment.status === PaymentStatus.PAID) return; // idempotente

  await db.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        rawWebhookPayload: body as Prisma.InputJsonValue
      }
    });

    const startsAt = new Date();
    const endsAt = computeSubscriptionEndDate(updated.tier, startsAt);

    const subscription = await tx.userSubscription.upsert({
      where: { userId: payment.userId },
      update: { tier: updated.tier, startsAt, endsAt, deactivatedAt: null },
      create: { userId: payment.userId, tier: updated.tier, startsAt, endsAt }
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { subscriptionId: subscription.id }
    });
  });

  // Chi paga in UNICA SOLUZIONE non deve avere rate: elimina eventuali piani
  // rateali residui (checkout precedenti/abbandonati sullo stesso utente).
  await cancelStrayInstallmentPlans(payment.userId, null);
}

/**
 * Dedup auto-guarente. Quando un pagamento REALE va a buon fine, annulla gli
 * ALTRI piani rateali attivi dello stesso utente (residui di checkout ripetuti/
 * abbandonati) cancellando anche la subscription Revolut così non addebita più.
 * È ciò che impedisce il riformarsi dei duplicati/rate-fantasma alla radice.
 * `keepPlanId=null` (one-shot) → nessun piano resta. Un ciclo rata passa il proprio.
 */
async function cancelStrayInstallmentPlans(
  userId: string,
  keepPlanId: string | null
): Promise<void> {
  const strays = await db.installmentPlan.findMany({
    where: {
      status: { in: [InstallmentPlanStatus.ACTIVE, InstallmentPlanStatus.DEFAULTED] },
      payment: { userId },
      ...(keepPlanId ? { id: { not: keepPlanId } } : {})
    },
    select: { id: true, revolutSubscriptionId: true, paymentId: true }
  });
  for (const s of strays) {
    if (s.revolutSubscriptionId) {
      await cancelSubscription(s.revolutSubscriptionId).catch((e) =>
        console.error(`[webhook/revolut] cancel piano residuo ${s.revolutSubscriptionId}:`, e)
      );
    }
    await db.installmentPlan.update({
      where: { id: s.id },
      data: { status: InstallmentPlanStatus.CANCELED }
    });
    await db.payment.updateMany({
      where: { id: s.paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.CANCELED, failureReason: "Piano superato da un nuovo pagamento" }
    });
  }
}

/**
 * Ciclo rata riuscito (setup order o addebito mensile successivo).
 * Marca la prima rata SCHEDULED come PAID, attiva/mantiene la subscription, e
 * quando tutte le rate sono PAID completa il piano + CANCELLA la subscription
 * Revolut (così non addebita oltre il termine).
 */
async function handleInstallmentPaid(
  payment: ResolvedPayment,
  orderId: string,
  body: unknown
): Promise<void> {
  const plan = payment.installmentPlan;
  if (!plan) return;

  // Idempotenza: se questo order_id ha già marcato una rata, no-op.
  if (plan.installments.some((i) => i.providerReference === orderId)) {
    return;
  }

  const nextScheduled = plan.installments
    .filter((i) => i.status === InstallmentStatus.SCHEDULED)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];

  const planNowComplete = await db.$transaction(async (tx) => {
    if (payment.status !== PaymentStatus.PAID) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          rawWebhookPayload: body as Prisma.InputJsonValue
        }
      });
    }

    const startsAt = payment.paidAt ?? new Date();
    const endsAt = computeSubscriptionEndDate(payment.tier, startsAt);
    const subscription = await tx.userSubscription.upsert({
      where: { userId: payment.userId },
      update: { tier: payment.tier, endsAt, deactivatedAt: null },
      create: { userId: payment.userId, tier: payment.tier, startsAt, endsAt }
    });
    if (!payment.subscriptionId) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id }
      });
    }

    if (nextScheduled) {
      await tx.installment.update({
        where: { id: nextScheduled.id },
        data: {
          status: InstallmentStatus.PAID,
          paidAt: new Date(),
          providerReference: orderId
        }
      });
    }

    const remaining = plan.installments.filter(
      (i) => i.status !== InstallmentStatus.PAID && i.id !== nextScheduled?.id
    ).length;
    if (remaining === 0) {
      await tx.installmentPlan.update({
        where: { id: plan.id },
        data: { status: "COMPLETED" }
      });
      return true;
    }
    return false;
  });

  // Tutte le rate pagate → ferma la subscription Revolut (best-effort, fuori dalla tx).
  if (planNowComplete && plan.revolutSubscriptionId) {
    await cancelSubscription(plan.revolutSubscriptionId).catch((error) => {
      console.error(
        `[webhook/revolut] cancelSubscription fallito per plan=${plan.id} sub=${plan.revolutSubscriptionId}:`,
        error
      );
    });
  }

  // Tieni SOLO questo piano: annulla eventuali duplicati residui dello stesso utente.
  await cancelStrayInstallmentPlans(payment.userId, plan.id);
}

/**
 * Ciclo rata fallito → rata FAILED (per il pannello admin "Rate in sofferenza").
 *
 * L'accesso NON viene toccato se l'utente ha una BASE DI PAGAMENTO VALIDA: una
 * rata già pagata su questo piano, oppure un altro pagamento PAID (annuale
 * one-shot, o un altro piano). Motivo: un utente ha UNA sola UserSubscription ma
 * può avere PIÙ piani rateali (checkout ripetuti/abbandonati); una retry Revolut
 * su un piano-fantasma NON deve azzerare l'abbonamento di chi ha davvero pagato
 * (era il bug "annuali pagati che risultano scaduti"). Per un pagante, la rata
 * insoluta si recupera A MANO dal pannello "Rate in sofferenza".
 *
 * Solo se l'utente non ha MAI pagato nulla (checkout puramente abbandonato/fallito)
 * portiamo `endsAt = now`: la grazia `ACCESS_GRACE_DAYS` lascia comunque 2 giorni,
 * poi il sync toglie il PIN. Non usiamo `deactivatedAt` (riservato alla
 * disattivazione manuale, che è immediata). Un retry riuscito → `handleInstallmentPaid`
 * ripristina `endsAt` al termine pieno.
 */
async function handleInstallmentFailed(
  payment: ResolvedPayment,
  state: string,
  body: unknown
): Promise<void> {
  const plan = payment.installmentPlan;
  if (!plan) return;

  const nextScheduled = plan.installments
    .filter((i) => i.status === InstallmentStatus.SCHEDULED)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];

  // Base di pagamento valida? → non tocchiamo l'accesso (solo recupero manuale).
  const planHasPaidInstallment = plan.installments.some(
    (i) => i.status === InstallmentStatus.PAID
  );
  const otherPaidPayments = await db.payment.count({
    where: { userId: payment.userId, status: PaymentStatus.PAID, id: { not: payment.id } }
  });
  const hasValidCoverage = planHasPaidInstallment || otherPaidPayments > 0;

  await db.$transaction(async (tx) => {
    if (nextScheduled) {
      await tx.installment.update({
        where: { id: nextScheduled.id },
        data: {
          status: InstallmentStatus.FAILED,
          failureReason: `Revolut order state: ${state}`
        }
      });
    }
    if (!hasValidCoverage) {
      await tx.userSubscription.updateMany({
        where: { userId: payment.userId, deactivatedAt: null },
        data: { endsAt: new Date() }
      });
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: { rawWebhookPayload: body as Prisma.InputJsonValue }
    });
  });
}

function extractOrderId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.order_id === "string") return obj.order_id;
  const data = obj.data as Record<string, unknown> | undefined;
  if (data && typeof data.id === "string") return data.id;
  if (data && typeof data.order_id === "string") return data.order_id;
  return null;
}
