/**
 * Facade pagamenti: sceglie il flusso giusto in base a tier + modalità (one-shot vs rate)
 * e ritorna al chiamante un oggetto uniforme `InitiatedPayment` con l'URL hosted a cui redirigere.
 *
 * Provider:
 *  - Revolut Merchant API (default):
 *      · one-shot → ordine Hosted Checkout (`createOrder`).
 *      · rate     → subscription nativa Revolut (`createInstallmentSubscription`).
 *  - HeyLight/Compass (BNPL) SOLO per l'ANNUALE a rate: Compass finanzia il cliente
 *    e paga la palestra → per noi è un'attivazione UNICA su `success` (niente rate
 *    da inseguire). Vedi `./heylight`.
 */

import { PaymentProvider, type SubscriptionTier } from "@gestionale/db";

import { TIER_CATALOG, type CheckoutTier } from "@/lib/subscription";

import { createOrder, createInstallmentSubscription } from "./revolut";
import { createContract } from "./heylight";

export type InitiatePaymentInput = {
  tier: CheckoutTier;
  payInInstallments: boolean;
  /** Reference interno (es. `Payment.id`). */
  reference: string;
  /** URL di ritorno in caso di successo (Revolut usa solo questo). */
  returnUrl: string;
  /** URL di ritorno in caso di fallimento — richiesto da HeyLight. */
  failureUrl?: string;
  /** URL del webhook di stato — richiesto da HeyLight (`status_url`). */
  webhookUrl?: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    /** Telefono cliente — passato a HeyLight (`contact_number`). */
    phoneNumber?: string;
  };
  /** Customer Revolut se già creato — per i pagamenti ricorrenti delle rate. */
  revolutCustomerId?: string;
};

export type InitiatedPayment = {
  provider: PaymentProvider;
  providerReference: string;
  amountCents: number;
  hostedUrl: string;
  /** Popolato solo se è un piano rateale. */
  installmentPlan?: {
    installmentsCount: number;
    installmentAmountCents: number;
    firstChargeAt: Date;
  };
  /** Customer Revolut (nuovo o riutilizzato) — da salvare su User. */
  revolutCustomerId?: string;
  /** Id della subscription Revolut — da salvare su InstallmentPlan (solo rate). */
  revolutSubscriptionId?: string;
};

/**
 * Entry point unica per avviare un pagamento abbonamento.
 * La logica di creazione `Payment` in DB resta nella server action chiamante — qui si occupa solo
 * della comunicazione col gateway.
 */
export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatedPayment> {
  const tierConfig = TIER_CATALOG[input.tier];
  const fullName = `${input.customer.firstName} ${input.customer.lastName}`.trim();

  // ── HeyLight/Compass (BNPL): SOLO annuale a rate ──────────────────────────
  // Compass finanzia il cliente e paga la palestra: un contratto `success` =
  // abbonamento annuale attivato in un colpo solo. Le 12 rate sono cliente↔Compass.
  if (input.payInInstallments && input.tier === "YEARLY" && tierConfig.installments) {
    if (!input.failureUrl || !input.webhookUrl) {
      throw new Error("[payments] HeyLight richiede failureUrl e webhookUrl");
    }
    // Importo finanziato = totale annuale a rate (es. 12 × 47,99 = 575,88).
    const totalCents = tierConfig.installments.count * tierConfig.installments.amountCents;

    const contract = await createContract({
      amountCents: totalCents,
      reference: input.reference,
      allowedTerms: [tierConfig.installments.count],
      redirectUrls: { successUrl: input.returnUrl, failureUrl: input.failureUrl },
      customer: {
        email: input.customer.email,
        firstName: input.customer.firstName,
        lastName: input.customer.lastName,
        contactNumber: input.customer.phoneNumber
      },
      productName: buildDescription(input.tier, true),
      // Il `token` del webhook è il nostro reference (Payment.id): HeyLight ce lo
      // rimanda nel payload, così correliamo il pagamento. La verità resta la
      // GET /applications/ (verifica autorevole nel webhook/reconcile).
      webhook: { statusUrl: input.webhookUrl, token: input.reference },
      shippingAddress: heylightShippingAddress()
    });

    return {
      provider: PaymentProvider.HEYLIGHT,
      providerReference: contract.externalContractUuid,
      amountCents: totalCents,
      hostedUrl: contract.redirectUrl
    };
  }

  if (input.payInInstallments) {
    if (!tierConfig.installments) {
      throw new Error(`[payments] Il tier ${input.tier} non supporta la rateizzazione.`);
    }

    const firstInstallmentCents = tierConfig.installments.amountCents;

    const subscription = await createInstallmentSubscription({
      tier: input.tier,
      installmentsCount: tierConfig.installments.count,
      installmentAmountCents: firstInstallmentCents,
      reference: input.reference,
      redirectUrl: input.returnUrl,
      customer: { email: input.customer.email, fullName },
      revolutCustomerId: input.revolutCustomerId
    });

    return {
      provider: PaymentProvider.REVOLUT,
      providerReference: subscription.subscriptionId,
      amountCents: firstInstallmentCents,
      hostedUrl: subscription.checkoutUrl,
      installmentPlan: {
        installmentsCount: tierConfig.installments.count,
        installmentAmountCents: tierConfig.installments.amountCents,
        firstChargeAt: new Date()
      },
      revolutCustomerId: subscription.revolutCustomerId,
      revolutSubscriptionId: subscription.subscriptionId
    };
  }

  // Pagamento in unica soluzione → ordine Revolut Hosted Checkout.
  const order = await createOrder({
    amountCents: tierConfig.oneShotCents,
    reference: input.reference,
    description: buildDescription(input.tier, false),
    redirectUrl: input.returnUrl,
    customer: { email: input.customer.email, fullName }
  });

  return {
    provider: PaymentProvider.REVOLUT,
    providerReference: order.id,
    amountCents: tierConfig.oneShotCents,
    hostedUrl: order.checkoutUrl
  };
}

/**
 * Indirizzo passato a HeyLight come `shipping_address`. Per un servizio (abbonamento)
 * non esiste spedizione: usiamo l'indirizzo della palestra, configurabile via env.
 * ⚠️ impostare gli env con l'indirizzo reale della sede prima della produzione.
 */
function heylightShippingAddress(): {
  addressLine: string;
  zipCode: string;
  city: string;
  countryCode: string;
} {
  return {
    addressLine: process.env.HEYLIGHT_SHIP_ADDRESS ?? "Via Roma 1",
    zipCode: process.env.HEYLIGHT_SHIP_ZIP ?? "00100",
    city: process.env.HEYLIGHT_SHIP_CITY ?? "Roma",
    countryCode: process.env.HEYLIGHT_SHIP_COUNTRY ?? "IT"
  };
}

function buildDescription(tier: SubscriptionTier, installments: boolean): string {
  const base = `Abbonamento palestra — ${tierHumanLabel(tier)}`;
  return installments ? `${base} (rate)` : base;
}

function tierHumanLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case "DAILY":
      return "Giornaliero";
    case "MONTHLY":
      return "Mensile";
    case "QUARTERLY":
      return "Trimestrale";
    case "YEARLY":
      return "Annuale";
    case "BIENNIAL":
      return "Biennale";
    default:
      return tier;
  }
}
