/**
 * Scaffold client Klarna per pagamenti rateali (12/24 rate).
 *
 * Stato: credenziali Klarna non ancora disponibili — il feature flag `KLARNA_ENABLED` tiene
 * l'integrazione spenta finché non saranno fornite `KLARNA_API_USER` + `KLARNA_API_PASSWORD`.
 *
 * Docs: https://docs.klarna.com/api/ordermanagement/
 *
 * Quando arriveranno le API key bisognerà:
 *   1. Implementare `createInstallmentOrder` con POST /checkout/v3/orders (o /payments/v1/sessions).
 *   2. Implementare webhook handling (order captured, installment charged, failed).
 *   3. Popolare `Installment[]` nel DB con scheduling basato sulla risposta Klarna.
 */

export const KLARNA_ENABLED = Boolean(
  process.env.KLARNA_API_USER && process.env.KLARNA_API_PASSWORD
);

type CreateInstallmentOrderInput = {
  amountCents: number;
  installmentsCount: number;
  installmentAmountCents: number;
  reference: string;
  description: string;
  returnUrl: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type KlarnaOrder = {
  orderId: string;
  hostedUrl: string;
  firstChargeAt: Date;
};

function assertEnabled(): void {
  if (!KLARNA_ENABLED) {
    throw new Error(
      "KLARNA_NOT_CONFIGURED — le credenziali Klarna non sono ancora state fornite. " +
        "Setta KLARNA_API_USER e KLARNA_API_PASSWORD per abilitare la rateizzazione."
    );
  }
}

export async function createInstallmentOrder(
  _input: CreateInstallmentOrderInput
): Promise<KlarnaOrder> {
  assertEnabled();
  // TODO(klarna): implementare POST /checkout/v3/orders con basic auth
  // (KLARNA_API_USER:KLARNA_API_PASSWORD) e region host corretto (eu/na).
  throw new Error("[klarna] createInstallmentOrder not implemented yet");
}

export async function getOrder(_orderId: string): Promise<KlarnaOrder | null> {
  assertEnabled();
  // TODO(klarna): GET /ordermanagement/v1/orders/{order_id}
  throw new Error("[klarna] getOrder not implemented yet");
}

export async function verifyWebhookSignature(
  _rawBody: string,
  _signatureHeader: string | null
): Promise<boolean> {
  // TODO(klarna): Klarna usa HMAC-SHA256 con `KLARNA_WEBHOOK_SECRET`.
  // Pattern simile a SumUp: parse header → ricalcola HMAC → timing-safe compare.
  if (!process.env.KLARNA_WEBHOOK_SECRET) {
    console.warn("[klarna] KLARNA_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  return false;
}
