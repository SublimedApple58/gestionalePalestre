/**
 * Wrapper server-side Revolut **Merchant API** per creazione ordini (Hosted
 * Checkout Page), subscription rateali e verifica firma webhook.
 *
 * IMPORTANTE: questa è la *Merchant API* (sotto-account del Business), NON la
 * Business API. Usa una Secret key `sk_...` nell'header Authorization — niente
 * certificati X509 / OAuth.
 *
 * Docs:
 *  - Create order / Hosted Checkout: https://developer.revolut.com/docs/merchant/create-order
 *  - Subscriptions:                  https://developer.revolut.com/docs/merchant/subscriptions
 *  - Webhooks (firma HMAC):          https://developer.revolut.com/docs/merchant/webhooks
 *
 * Flow one-shot:
 *  1. La server action chiama `createOrder` con importo + reference (paymentId).
 *  2. Revolut ritorna `{ id, checkoutUrl }` — salviamo `id` come `providerReference`.
 *  3. Redirigiamo il browser a `checkoutUrl` (hosted checkout page).
 *  4. Al completamento Revolut chiama il webhook (ORDER_COMPLETED) → aggiorniamo `Payment`.
 *
 * Flow rate (annuale/biennale): usa `createInstallmentSubscription` (Subscriptions API):
 * Revolut gestisce gli addebiti ricorrenti e notifica ogni ciclo via webhook.
 */

/** Base URL: produzione vs sandbox. Override esplicito via REVOLUT_BASE_URL. */
function baseUrl(): string {
  const explicit = process.env.REVOLUT_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return process.env.NODE_ENV === "production"
    ? "https://merchant.revolut.com"
    : "https://sandbox-merchant.revolut.com";
}

/** Versione API date-based richiesta dalla Merchant API moderna. */
function apiVersion(): string {
  return process.env.REVOLUT_API_VERSION ?? "2024-09-01";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[revolut] Missing env var ${name}`);
  }
  return value;
}

async function revolutFetch(
  path: string,
  init: { method: string; body?: unknown }
): Promise<Response> {
  const secret = requireEnv("REVOLUT_SECRET_KEY");
  return fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Revolut-Api-Version": apiVersion(),
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
}

/** Stato ordine Revolut normalizzato sul nostro dominio. */
export type RevolutOrderState =
  | "pending"
  | "processing"
  | "authorised"
  | "completed"
  | "cancelled"
  | "failed";

export type RevolutOrder = {
  id: string;
  state: RevolutOrderState;
  /** URL hosted checkout (presente alla creazione; può mancare in GET su ordini finali). */
  checkoutUrl: string;
  /** Id della subscription Revolut se l'ordine è un ciclo rata (altrimenti null). */
  subscriptionId: string | null;
  /** `merchant_order_data.reference` che impostiamo = `Payment.id` sugli ordini one-shot. */
  externalReference: string | null;
};

type RevolutOrderResponse = {
  id: string;
  state: RevolutOrderState;
  checkout_url?: string;
  subscription_data?: { subscription_id?: string } | null;
  channel_data?: { subscription_id?: string } | null;
  merchant_order_data?: { reference?: string } | null;
};

function mapOrder(data: RevolutOrderResponse, checkoutUrlFallback = ""): RevolutOrder {
  return {
    id: data.id,
    state: data.state,
    checkoutUrl: data.checkout_url ?? checkoutUrlFallback,
    subscriptionId:
      data.subscription_data?.subscription_id ?? data.channel_data?.subscription_id ?? null,
    externalReference: data.merchant_order_data?.reference ?? null
  };
}

type CreateOrderInput = {
  amountCents: number;
  /** Reference interno (es. `Payment.id`). Revolut lo restituisce nei webhook come ext ref. */
  reference: string;
  description: string;
  /** URL a cui Revolut reindirizza dopo il pagamento (success/failure). */
  redirectUrl: string;
  customer: {
    email: string;
    fullName: string;
  };
};

/**
 * Crea un ordine Revolut con Hosted Checkout e ritorna i riferimenti da salvare.
 * L'importo è in EUR espresso in centesimi (minor units, come richiede Revolut).
 */
export async function createOrder(input: CreateOrderInput): Promise<RevolutOrder> {
  const body = {
    amount: input.amountCents,
    currency: "EUR",
    description: input.description,
    merchant_order_data: {
      reference: input.reference
    },
    redirect_url: input.redirectUrl,
    capture_mode: "automatic",
    customer: {
      email: input.customer.email,
      full_name: input.customer.fullName
    }
  };

  const response = await revolutFetch("/api/orders", { method: "POST", body });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[revolut] createOrder failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = (await response.json()) as RevolutOrderResponse;

  if (!data.checkout_url) {
    throw new Error(
      `[revolut] createOrder: response priva di checkout_url — verifica che l'account Merchant abbia l'Hosted Checkout abilitato`
    );
  }

  return mapOrder(data);
}

/**
 * Recupera lo stato corrente di un ordine Revolut tramite ID.
 * Usato come fallback pull-side al ritorno dall'hosted page se il webhook tarda.
 */
export async function getOrder(orderId: string): Promise<RevolutOrder | null> {
  const response = await revolutFetch(`/api/orders/${orderId}`, { method: "GET" });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[revolut] getOrder failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = (await response.json()) as RevolutOrderResponse;
  return mapOrder(data);
}

export type RevolutSubscriptionSetup = {
  subscriptionId: string;
  /** Hosted checkout della prima rata (setup order) a cui redirigere l'utente. */
  checkoutUrl: string;
  /** Customer Revolut (nuovo o riusato) — da salvare su User per i cicli successivi. */
  revolutCustomerId: string;
};

type CreateInstallmentSubscriptionInput = {
  /** Tier abbonamento — determina quale subscription plan/variation usare. */
  tier: string;
  installmentsCount: number;
  installmentAmountCents: number;
  /** Reference interno (es. `Payment.id`). */
  reference: string;
  redirectUrl: string;
  customer: {
    email: string;
    fullName: string;
  };
  /** Customer Revolut già esistente, se l'utente ha già pagato in passato. */
  revolutCustomerId?: string;
};

/**
 * Crea una subscription Revolut per un piano rateale (es. annuale in 12 mensili).
 *
 * Modello Revolut: un Subscription **plan** contiene **variations** (es. "Annuale
 * mensile"), ciascuna con **phases** (qui: una fase a ciclo mensile con un numero
 * di cicli FINITO = N rate, così a fine cicli la subscription TERMINA e non si
 * rinnova). Si crea una subscription per il customer riferendo la variation; la
 * subscription nasce in stato pending con un setup order da pagare (prima rata).
 *
 * STRATEGIA: le variation sono catalogo statico, pre-create una volta nel
 * dashboard/portal Revolut (una per tier rateale). Mappiamo qui tier -> variation id
 * via env, così a runtime creiamo solo la subscription.
 *
 * ⚠️ SPIKE (Fase 0): i nomi esatti di endpoint/campi delle Subscriptions vanno
 * confermati in sandbox contro le docs auth-gated:
 *   https://developer.revolut.com/docs/merchant/create-subscription
 * In particolare: path (`/api/subscriptions`?), come si passa il customer, come si
 * ottiene il `checkout_url` del setup order (campo `setup_order_id` -> GET order),
 * e come si configura il numero finito di cicli sulla variation.
 */
export async function createInstallmentSubscription(
  input: CreateInstallmentSubscriptionInput
): Promise<RevolutSubscriptionSetup> {
  // Variation id pre-configurata per tier (es. REVOLUT_SUB_VARIATION_YEARLY).
  const variationEnv = `REVOLUT_SUB_VARIATION_${input.tier}`;
  const variationId = requireEnv(variationEnv);

  // 1. Crea (o riusa) il customer Revolut.
  const customerId = input.revolutCustomerId ?? (await createCustomer(input.customer));

  // 2. Crea la subscription riferendo la variation. Con `return_url` valorizzato
  //    la response include `setup_order_id` (ordine della prima rata da pagare
  //    sull'Hosted Payment Page). Campi confermati dalle docs Merchant API:
  //    customer_id (req), plan_variation_id (req), external_reference, return_url.
  const response = await revolutFetch("/api/subscriptions", {
    method: "POST",
    body: {
      customer_id: customerId,
      plan_variation_id: variationId,
      external_reference: input.reference,
      return_url: input.redirectUrl
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[revolut] createInstallmentSubscription failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = (await response.json()) as {
    id: string;
    setup_order_id?: string;
    setup_order_checkout_url?: string;
  };

  // 3. Il checkout della prima rata è in `setup_order_checkout_url`. Fallback:
  //    risali via `setup_order_id` → GET order.
  let checkoutUrl = data.setup_order_checkout_url ?? "";
  if (!checkoutUrl && data.setup_order_id) {
    const order = await getOrder(data.setup_order_id);
    checkoutUrl = order?.checkoutUrl ?? "";
  }

  if (!checkoutUrl) {
    throw new Error(
      `[revolut] createInstallmentSubscription: impossibile ottenere il checkout url del setup order (subscription ${data.id})`
    );
  }

  return {
    subscriptionId: data.id,
    checkoutUrl,
    revolutCustomerId: customerId
  };
}

/**
 * Crea un customer Revolut. Necessario per associare la subscription e i suoi
 * addebiti ricorrenti.
 * ⚠️ SPIKE: confermare path (`/api/customers`?) e campi.
 */
export async function createCustomer(input: {
  email: string;
  fullName: string;
}): Promise<string> {
  const response = await revolutFetch("/api/customers", {
    method: "POST",
    body: { email: input.email, full_name: input.fullName }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[revolut] createCustomer failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Cancella una subscription Revolut (ferma gli addebiti ricorrenti).
 *
 * Le subscription Revolut, con una singola fase ricorrente, addebitano
 * all'infinito: non esiste un limite di cicli nativo. Per replicare le rate "a
 * termine" (es. annuale = 12 mensili poi stop) cancelliamo noi la subscription
 * dopo l'ultima rata pagata (dal webhook + safety-net). Idempotente lato Revolut.
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const response = await revolutFetch(`/api/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: {}
  });

  // 204 = ok. 404/409 (già cancellata/non trovata) li trattiamo come no-op.
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[revolut] cancelSubscription failed ${response.status} ${response.statusText}: ${text}`
    );
  }
}

/**
 * Verifica la firma HMAC-SHA256 del webhook Revolut.
 *
 * Revolut invia:
 *  - header `Revolut-Signature` con valore `v1=<hex>` (può contenere più firme
 *    separate da virgola durante una rotazione del secret);
 *  - header `Revolut-Request-Timestamp` con il timestamp dell'evento.
 * Il payload firmato è `v1.{timestamp}.{rawBody}`, HMAC-SHA256 con il signing
 * secret (`REVOLUT_WEBHOOK_SECRET`, formato `wsk_...`).
 *
 * Se `REVOLUT_WEBHOOK_SECRET` non è settato (dev), ritorna `true` per non bloccare
 * i test locali — stesso comportamento del vecchio wrapper SumUp.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null
): Promise<boolean> {
  const secret = process.env.REVOLUT_WEBHOOK_SECRET;

  if (!secret) {
    console.warn("[revolut] REVOLUT_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  if (!signatureHeader || !timestampHeader) {
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
    encoder.encode(`v1.${timestampHeader}.${rawBody}`)
  );

  const expected = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // L'header può contenere più firme `v1=...,v1=...` (rotazione): basta che una combaci.
  const provided = signatureHeader
    .split(",")
    .map((part) => part.trim().replace(/^v1=/, ""));

  return provided.some((sig) => timingSafeEqualHex(expected, sig));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
