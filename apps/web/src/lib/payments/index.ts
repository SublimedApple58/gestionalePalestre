/**
 * Facade pagamenti: sceglie il provider giusto in base a tier + modalità (one-shot vs rate)
 * e ritorna al chiamante un oggetto uniforme `InitiatedPayment` con l'URL hosted a cui redirigere.
 */

import { PaymentProvider, type SubscriptionTier } from "@gestionale/db";

import { TIER_CATALOG, type CheckoutTier } from "@/lib/subscription";

import { createCheckout as createSumUpCheckout } from "./sumup";
import {
  KLARNA_ENABLED,
  createInstallmentOrder as createKlarnaInstallmentOrder
} from "./klarna";

export { KLARNA_ENABLED } from "./klarna";

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
};

export type InitiatedPayment = {
  provider: PaymentProvider;
  providerReference: string;
  amountCents: number;
  hostedUrl: string;
  /** Popolato solo se è un piano rateale Klarna. */
  installmentPlan?: {
    installmentsCount: number;
    installmentAmountCents: number;
    firstChargeAt: Date;
  };
};

/**
 * Entry point unica per avviare un pagamento abbonamento.
 * La logica di creazione `Payment` in DB resta nella server action chiamante — qui si occupa solo
 * della comunicazione col gateway.
 */
export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatedPayment> {
  const tierConfig = TIER_CATALOG[input.tier];

  if (input.payInInstallments) {
    if (!tierConfig.installments) {
      throw new Error(`[payments] Il tier ${input.tier} non supporta la rateizzazione.`);
    }
    if (!KLARNA_ENABLED) {
      throw new Error(
        "[payments] Klarna non è ancora abilitato: la rateizzazione sarà disponibile a breve."
      );
    }

    const totalCents = tierConfig.installments.amountCents * tierConfig.installments.count;
    const order = await createKlarnaInstallmentOrder({
      amountCents: totalCents,
      installmentsCount: tierConfig.installments.count,
      installmentAmountCents: tierConfig.installments.amountCents,
      reference: input.reference,
      description: buildDescription(input.tier, true),
      returnUrl: input.returnUrl,
      customer: input.customer
    });

    return {
      provider: PaymentProvider.KLARNA,
      providerReference: order.orderId,
      amountCents: totalCents,
      hostedUrl: order.hostedUrl,
      installmentPlan: {
        installmentsCount: tierConfig.installments.count,
        installmentAmountCents: tierConfig.installments.amountCents,
        firstChargeAt: order.firstChargeAt
      }
    };
  }

  // Pagamento in unica soluzione → SumUp
  const checkout = await createSumUpCheckout({
    amountCents: tierConfig.oneShotCents,
    reference: input.reference,
    description: buildDescription(input.tier, false),
    returnUrl: input.returnUrl,
    customerEmail: input.customer.email
  });

  return {
    provider: PaymentProvider.SUMUP,
    providerReference: checkout.id,
    amountCents: tierConfig.oneShotCents,
    hostedUrl: checkout.hostedUrl
  };
}

function buildDescription(tier: SubscriptionTier, installments: boolean): string {
  const base = `Abbonamento palestra — ${tierHumanLabel(tier)}`;
  return installments ? `${base} (rate)` : base;
}

function tierHumanLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case "MONTHLY":
      return "Mensile";
    case "YEARLY":
      return "Annuale";
    case "BIENNIAL":
      return "Biennale";
    default:
      return tier;
  }
}
