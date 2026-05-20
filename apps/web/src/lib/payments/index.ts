/**
 * Facade pagamenti: sceglie il provider giusto in base a tier + modalità (one-shot vs rate)
 * e ritorna al chiamante un oggetto uniforme `InitiatedPayment` con l'URL hosted a cui redirigere.
 */

import { PaymentProvider, type SubscriptionTier } from "@gestionale/db";

import { TIER_CATALOG, type CheckoutTier } from "@/lib/subscription";

import {
  createCheckout as createSumUpCheckout,
  createCheckoutWithCustomer
} from "./sumup";

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
  /** SumUp customer ID se già creato — per pagamenti ricorrenti. */
  sumupCustomerId?: string;
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
  /** SumUp customer ID (nuovo o riutilizzato) — da salvare su User. */
  sumupCustomerId?: string;
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

    // Prima rata via SumUp con customer (salvataggio carta per rate successive)
    const firstInstallmentCents = tierConfig.installments.amountCents;

    const checkout = await createCheckoutWithCustomer({
      amountCents: firstInstallmentCents,
      reference: input.reference,
      description: buildDescription(input.tier, true),
      returnUrl: input.returnUrl,
      customerEmail: input.customer.email,
      customerId: input.sumupCustomerId,
      customerFirstName: input.customer.firstName,
      customerLastName: input.customer.lastName
    });

    return {
      provider: PaymentProvider.SUMUP,
      providerReference: checkout.id,
      amountCents: firstInstallmentCents,
      hostedUrl: checkout.hostedUrl,
      installmentPlan: {
        installmentsCount: tierConfig.installments.count,
        installmentAmountCents: tierConfig.installments.amountCents,
        firstChargeAt: new Date()
      },
      sumupCustomerId: checkout.customerId
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
