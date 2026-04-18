/**
 * Wrapper server-side SumUp API v0.1 per creazione checkout hosted + verifica webhook.
 *
 * Docs: https://developer.sumup.com/api
 *
 * Flow tipico:
 * 1. Client action chiama `createCheckout` con importo + reference interno (es. paymentId).
 * 2. SumUp ritorna `{ id, checkout_reference, status }` — salviamo `id` in DB come `providerReference`.
 * 3. Redirigiamo il browser all'hosted page (costruito da `buildHostedCheckoutUrl`).
 * 4. Al completamento SumUp chiama il webhook → verifichiamo firma + aggiorniamo stato `Payment`.
 */

const SUMUP_BASE_URL = "https://api.sumup.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[sumup] Missing env var ${name}`);
  }
  return value;
}

type CreateCheckoutInput = {
  amountCents: number;
  /** Reference interno (es. `Payment.id`). SumUp lo restituirà nei webhook. */
  reference: string;
  description: string;
  /** URL a cui SumUp reindirizza il browser dopo il completamento (success/failure). */
  returnUrl: string;
  /** Email cliente per ricevuta SumUp (opzionale). */
  customerEmail?: string;
};

export type SumUpCheckout = {
  id: string;
  checkoutReference: string;
  status: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
  hostedUrl: string;
};

/**
 * Crea un checkout SumUp hosted e ritorna i riferimenti da salvare in DB.
 * L'importo è in EUR espresso in centesimi.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<SumUpCheckout> {
  const apiKey = requireEnv("SUMUP_API_KEY");
  const merchantCode = requireEnv("SUMUP_MERCHANT_CODE");

  // `hosted_checkout.enabled: true` + `redirect_url` sono richiesti per ricevere
  // `hosted_checkout_url` nella response — senza questi flag SumUp crea un checkout
  // "two-step" che richiede un PUT server-side coi dati carta (non hosted).
  const body = {
    checkout_reference: input.reference,
    amount: input.amountCents / 100,
    currency: "EUR",
    merchant_code: merchantCode,
    description: input.description,
    return_url: input.returnUrl,
    redirect_url: input.returnUrl,
    customer_email: input.customerEmail,
    hosted_checkout: { enabled: true }
  };

  const response = await fetch(`${SUMUP_BASE_URL}/v0.1/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[sumup] createCheckout failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = (await response.json()) as {
    id: string;
    checkout_reference: string;
    status: SumUpCheckout["status"];
    hosted_checkout_url?: string;
  };

  if (!data.hosted_checkout_url) {
    throw new Error(
      `[sumup] createCheckout: response priva di hosted_checkout_url — verifica che l'account abbia la feature Hosted Checkout abilitata`
    );
  }

  return {
    id: data.id,
    checkoutReference: data.checkout_reference,
    status: data.status,
    hostedUrl: data.hosted_checkout_url
  };
}

/**
 * Recupera lo stato corrente di un checkout SumUp tramite ID.
 * Utile come fallback al ritorno dall'hosted page se il webhook tarda.
 */
export async function getCheckout(checkoutId: string): Promise<SumUpCheckout | null> {
  const apiKey = requireEnv("SUMUP_API_KEY");

  const response = await fetch(`${SUMUP_BASE_URL}/v0.1/checkouts/${checkoutId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[sumup] getCheckout failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = (await response.json()) as {
    id: string;
    checkout_reference: string;
    status: SumUpCheckout["status"];
    hosted_checkout_url?: string;
  };

  return {
    id: data.id,
    checkoutReference: data.checkout_reference,
    status: data.status,
    // In fase di GET potrebbe non essere presente (checkout scaduto o non-hosted): non è bloccante.
    hostedUrl: data.hosted_checkout_url ?? ""
  };
}

/**
 * Verifica la firma HMAC-SHA256 del webhook SumUp.
 * SumUp invia l'header `sumup-signature` con valore `v1,t=<ts>,s=<hex>` — la firma è calcolata
 * su `{timestamp}.{rawBody}` usando `SUMUP_WEBHOOK_SECRET` come chiave.
 *
 * Se `SUMUP_WEBHOOK_SECRET` non è settato in dev, ritorna `true` per non bloccare i test locali.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const secret = process.env.SUMUP_WEBHOOK_SECRET;

  if (!secret) {
    console.warn("[sumup] SUMUP_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((segment) => {
      const [key, ...rest] = segment.trim().split("=");
      return [key, rest.join("=")];
    })
  ) as { t?: string; s?: string; v1?: string };

  const timestamp = parts.t;
  const providedSignature = parts.s ?? parts.v1;

  if (!timestamp || !providedSignature) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`)
  );

  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== providedSignature.length) {
    return false;
  }

  // Confronto timing-safe
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ providedSignature.charCodeAt(i);
  }
  return diff === 0;
}
