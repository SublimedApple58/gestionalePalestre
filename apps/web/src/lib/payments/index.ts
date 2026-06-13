/**
 * Facade pagamenti: sceglie il flusso giusto in base a tier + modalità (one-shot vs rate)
 * e ritorna al chiamante un oggetto uniforme `InitiatedPayment` con l'URL hosted a cui redirigere.
 *
 * Provider: Revolut Merchant API.
 *  - one-shot → ordine Hosted Checkout (`createOrder`).
 *  - rate     → subscription nativa Revolut (`createInstallmentSubscription`): Revolut
 *               gestisce gli addebiti ricorrenti dei cicli e li notifica via webhook.
 */

import { PaymentProvider, type SubscriptionTier } from "@gestionale/db";

import { TIER_CATALOG, type CheckoutTier } from "@/lib/subscription";

import { createOrder, createInstallmentSubscription } from "./revolut";

export type InitiatePaymentInput = {
  tier: CheckoutTier;
  payInInstallments: boolean;
  /** Reference interno (es. `Payment.id`). */
  reference: string;
  returnUrl: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
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
