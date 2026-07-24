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
import {
  computeExtendedEndDate,
  computeSubscriptionEndDate,
  TIER_CATALOG
} from "@/lib/subscription";
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

  // Un ordine legato a una subscription Revolut è una rata (setup della prima o
  // ciclo successivo), anche se il piano in DB non esiste ancora: lo creiamo solo
  // quando la prima rata è effettivamente pagata (l'acquisto a rate "parte" solo
  // a acquisto completato).
  const isInstallmentOrder = order.subscriptionId != null || payment.installmentPlan != null;

  if (order.state === "completed") {
    if (isInstallmentOrder) {
      await handleInstallmentPaid(payment, order.id, body);
    } else {
      await handleOneShotPaid(payment, body);
    }
    safeSyncPinToKeypad(db, payment.userId);
    return NextResponse.json({ ok: true });
  }

  if (order.state === "failed" || order.state === "cancelled") {
    if (isInstallmentOrder) {
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
    // 1b. Piano non ancora creato (prima rata non pagata): al momento dell'avvio
    //     salviamo `Payment.providerReference = subscriptionId`. Così riconosciamo
    //     comunque il pagamento e creeremo il piano solo a completamento.
    const bySub = await db.payment.findFirst({
      where: { provider: "REVOLUT", providerReference: order.subscriptionId },
      include
    });
    if (bySub) return bySub;
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

    const now = new Date();
    const existing = await tx.userSubscription.findUnique({ where: { userId: payment.userId } });
    // Si SOMMA all'eventuale copertura già presente (niente giorni persi).
    const endsAt = computeExtendedEndDate(updated.tier, now, existing);

    const subscription = await tx.userSubscription.upsert({
      where: { userId: payment.userId },
      // Su update NON resettiamo startsAt: la copertura si accumula.
      update: { tier: updated.tier, endsAt, deactivatedAt: null },
      create: { userId: payment.userId, tier: updated.tier, startsAt: now, endsAt }
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

function addMonthsUtc(base: Date, months: number): Date {
  const d = new Date(base);
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds()
    )
  );
}

/**
 * Crea il piano rateale + le sue rate al PRIMO pagamento confermato (non all'avvio
 * del checkout). `revolutSubscriptionId` = `Payment.providerReference` (la subscription
 * Revolut salvata all'avvio). Idempotente: `InstallmentPlan.paymentId` è unico, quindi
 * una corsa tra webbook concomitanti non crea duplicati. Ritorna il piano con le rate.
 */
async function ensureInstallmentPlan(
  payment: ResolvedPayment
): Promise<ResolvedPayment["installmentPlan"]> {
  const inst = TIER_CATALOG[payment.tier].installments;
  if (!inst) return null;

  const firstChargeAt = new Date();
  try {
    await db.installmentPlan.create({
      data: {
        paymentId: payment.id,
        userId: payment.userId,
        totalAmountCents: inst.amountCents * inst.count,
        installmentsCount: inst.count,
        installmentAmountCents: inst.amountCents,
        revolutSubscriptionId: payment.providerReference,
        firstChargeAt,
        installments: {
          create: Array.from({ length: inst.count }, (_, idx) => ({
            sequenceNumber: idx + 1,
            dueAt: addMonthsUtc(firstChargeAt, idx),
            amountCents: inst.amountCents
          }))
        }
      }
    });
  } catch {
    // Corsa: creato da un webbook concomitante → lo rileggiamo qui sotto.
  }

  return db.installmentPlan.findUnique({
    where: { paymentId: payment.id },
    include: { installments: true }
  });
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
  // Il piano a rate NASCE QUI: se non esiste ancora (prima rata pagata) lo creiamo
  // ora. È il momento in cui l'acquisto a rate "parte" davvero — un checkout
  // abbandonato non lascia mai un piano armato.
  const plan = payment.installmentPlan ?? (await ensureInstallmentPlan(payment));
  if (!plan) return;

  // Idempotenza: se questo order_id ha già marcato una rata, no-op.
  if (plan.installments.some((i) => i.providerReference === orderId)) {
    return;
  }

  // Prima rata pagata di questo piano? Solo allora concediamo la copertura piena
  // e la SOMMIAMO all'eventuale abbonamento già presente. Ai cicli successivi la
  // scadenza NON si ricalcola (altrimenti si sommerebbe ogni mese).
  const isFirstPaid = !plan.installments.some((i) => i.status === InstallmentStatus.PAID);

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

    const now = new Date();
    const existing = await tx.userSubscription.findUnique({ where: { userId: payment.userId } });
    const endsAt = isFirstPaid
      ? computeExtendedEndDate(payment.tier, now, existing)
      : existing?.endsAt ?? computeSubscriptionEndDate(payment.tier, now);
    const subscription = await tx.userSubscription.upsert({
      where: { userId: payment.userId },
      // Su update NON tocchiamo startsAt: la copertura si accumula, la data di
      // inizio storica resta quella originale. autoRenew=true: un piano rateale
      // Revolut e' billing ricorrente (usato dalle stat "% rinnovi automatici");
      // canceledAt azzerato perche' un pagamento riattiva di fatto l'abbonamento.
      update: { tier: payment.tier, endsAt, deactivatedAt: null, autoRenew: true, canceledAt: null },
      create: { userId: payment.userId, tier: payment.tier, startsAt: now, endsAt, autoRenew: true }
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
      // Piano rateale saldato per intero: il billing ricorrente finisce qui
      // (la subscription Revolut viene cancellata sotto). Non e' una disdetta
      // -> autoRenew=false ma NESSUN canceledAt (l'abbonamento resta valido
      // fino a endsAt, semplicemente non si rinnovera' da solo).
      await tx.userSubscription.update({
        where: { userId: payment.userId },
        data: { autoRenew: false }
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
 * REGOLA CHIAVE: l'accesso viene toccato SOLO se il piano è davvero PARTITO —
 * cioè ha almeno una rata pagata — e la rata fallita è di un ciclo successivo.
 * Un acquisto a rate mai completato (prima rata fallita/abbandonata) NON ha piano
 * (lo creiamo solo a pagamento confermato) oppure ha 0 rate pagate → non spegne
 * MAI l'abbonamento (era il bug: un tentativo di annuale abbandonato azzerava il
 * mensile). Idem se l'abbonamento attivo è di un tier diverso dal piano.
 *
 * Per un pagante vero, la rata insoluta di un ciclo successivo porta `endsAt = now`:
 * la grazia `ACCESS_GRACE_DAYS` lascia comunque 2 giorni, poi il sync toglie il PIN.
 * La rata si recupera dal pannello "Rate in sofferenza"; un retry riuscito →
 * `handleInstallmentPaid` ripristina `endsAt` al termine pieno.
 */
async function handleInstallmentFailed(
  payment: ResolvedPayment,
  state: string,
  body: unknown
): Promise<void> {
  const plan = payment.installmentPlan;

  // Nessun piano = acquisto a rate MAI avviato (prima rata fallita/abbandonata):
  // l'abbonamento non si tocca. Chiudiamo il pagamento e cancelliamo la subscription
  // Revolut così non riprova ad addebitare.
  if (!plan) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: state === "cancelled" ? PaymentStatus.CANCELED : PaymentStatus.FAILED,
        failureReason: `Acquisto a rate non completato (Revolut ${state})`,
        rawWebhookPayload: body as Prisma.InputJsonValue
      }
    });
    if (payment.providerReference) {
      await cancelSubscription(payment.providerReference).catch((e) =>
        console.error(
          `[webhook/revolut] cancel subscription rata non avviata ${payment.providerReference}:`,
          e
        )
      );
    }
    return;
  }

  // Piano non più ACTIVE (annullato/completato/defaultato) → webbook tardivo: solo log.
  if (plan.status !== InstallmentPlanStatus.ACTIVE) {
    await db.payment.update({
      where: { id: payment.id },
      data: { rawWebhookPayload: body as Prisma.InputJsonValue }
    });
    return;
  }

  const nextScheduled = plan.installments
    .filter((i) => i.status === InstallmentStatus.SCHEDULED)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];

  // Il piano è "partito" solo con almeno una rata pagata.
  const planStarted = plan.installments.some((i) => i.status === InstallmentStatus.PAID);
  // Abbonamento attivo di tier DIVERSO dal piano → copertura scollegata (es. mensile
  // assegnato a mano dalla reception): non va spento da una rata di un altro tier.
  const activeSub = await db.userSubscription.findUnique({
    where: { userId: payment.userId }
  });
  const subIsUnrelatedTier =
    activeSub != null && activeSub.deactivatedAt == null && activeSub.tier !== payment.tier;
  // Sospendiamo solo un piano avviato la cui rata di un ciclo successivo è fallita.
  const shouldSuspend = planStarted && !subIsUnrelatedTier;

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
    if (shouldSuspend) {
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
