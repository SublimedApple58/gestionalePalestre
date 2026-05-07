import Stripe from "stripe";

import { TIER_CATALOG, type CheckoutTier } from "@/lib/subscription";

/**
 * Client Stripe lazy-init: istanziamo solo quando serve, così le route che non
 * fanno mai pagamenti non cercano la chiave a build time.
 *
 * NB: pubblicare/usare `STRIPE_PUBLISHABLE_KEY` lato client è ok (è una public
 * key di design). `STRIPE_SECRET_KEY` non deve mai uscire dal server.
 */
let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeSingleton) return stripeSingleton;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY non configurato — impossibile usare Stripe.");
  }

  stripeSingleton = new Stripe(apiKey, {
    // Versione API fissata: evita drift inattesi su breaking changes lato Stripe.
    apiVersion: "2025-09-30.clover",
    typescript: true,
    appInfo: { name: "house-of-muscle-gestionale", version: "1.0.0" }
  });

  return stripeSingleton;
}

export function getStripePublishableKey(): string {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error("STRIPE_PUBLISHABLE_KEY non configurato.");
  }
  return key;
}

export type StripePaymentIntentRequest = {
  tier: CheckoutTier;
  /** ID del nostro `Payment` (così il webhook ci ritrova). */
  paymentId: string;
  /** ID utente — utile per audit lato Stripe. */
  userId: string;
  /** Email facoltativa: appare nel pay sheet Stripe come receipt destination. */
  customerEmail?: string | null;
};

export type StripePaymentIntentResponse = {
  paymentIntentId: string;
  clientSecret: string;
  amountCents: number;
};

/**
 * Crea un PaymentIntent Stripe per il tier richiesto, con metodi di pagamento
 * automatici (Apple Pay, Google Pay, carta) abilitati. Il pagamento avviene
 * lato client tramite il PaymentSheet di Stripe RN.
 *
 * Importante: passiamo `metadata.paymentId` così il webhook può collegare
 * l'evento al nostro record `Payment` senza ambiguità.
 */
export async function createStripePaymentIntent(
  input: StripePaymentIntentRequest
): Promise<StripePaymentIntentResponse> {
  const stripe = getStripe();
  const tierConfig = TIER_CATALOG[input.tier];

  const intent = await stripe.paymentIntents.create({
    amount: tierConfig.oneShotCents,
    currency: "eur",
    automatic_payment_methods: { enabled: true },
    description: `Abbonamento palestra — ${tierConfig.label}`,
    metadata: {
      paymentId: input.paymentId,
      userId: input.userId,
      tier: input.tier,
      source: "mobile"
    },
    receipt_email: input.customerEmail ?? undefined
  });

  if (!intent.client_secret) {
    throw new Error("Stripe non ha restituito client_secret per il PaymentIntent");
  }

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    amountCents: tierConfig.oneShotCents
  };
}

export async function getStripePaymentIntent(intentId: string): Promise<Stripe.PaymentIntent> {
  return await getStripe().paymentIntents.retrieve(intentId);
}

export type StripeWebhookEvent = Stripe.Event;

/**
 * Verifica firma HMAC del webhook Stripe (timing-safe sotto il cofano della
 * libreria ufficiale). Ritorna l'evento parsato. NB: il body deve essere il
 * raw text — NON `await req.json()` — altrimenti la verifica fallisce.
 */
export function verifyStripeWebhookSignature(rawBody: string, signature: string): StripeWebhookEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET non configurato.");
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
