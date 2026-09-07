/**
 * Wrapper server-side **HeyLight / Compass** (motore HeidiPay) — "Checkout API".
 *
 * HeyLight è un BNPL (Buy Now Pay Later): il cliente firma un finanziamento con
 * Compass, che paga (quasi subito) il merchant e gestisce le rate mensili col
 * cliente. Per noi un acquisto HeyLight è quindi un'ATTIVAZIONE UNICA: quando il
 * contratto arriva a `success` l'abbonamento è pagato — non inseguiamo le rate.
 *
 * Docs:
 *  - Auth:            https://docs.heylight.com/reference/getting-started-with-your-api
 *  - Create payment:  https://docs.heylight.com/reference/step-2-how-to-create-a-payment
 *  - Applications:    https://docs.heylight.com/reference/api_checkout_v1_applications_list
 *
 * Flusso:
 *  1. La server action chiama `createContract` con importo + reference (paymentId)
 *     + le allowed_terms (es. [12] per l'annuale a 12 rate) + config webhook.
 *  2. HeyLight ritorna `{ redirectUrl, externalContractUuid }` — salviamo l'uuid
 *     come `providerReference`.
 *  3. Redirigiamo il browser a `redirectUrl` (checkout hosted HeyLight).
 *  4. Alla conferma HeyLight chiama il webhook + reindirizza a success/failure.
 *     Verifichiamo lo stato reale con `getApplication` (fonte di verità).
 *
 * NOTA (⚠️ da confermare in sandbox): forma esatta del body di `/init/`
 * (`shipping_address` per un servizio, wrapping `data` nelle risposte) e formato/
 * firma del payload webhook. Il client fa unwrap difensivo `data ?? json`.
 */

/** Base URL: sandbox vs produzione. Override esplicito via HEYLIGHT_BASE_URL. */
function baseUrl(): string {
  const explicit = process.env.HEYLIGHT_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return process.env.HEYLIGHT_ENV === "production"
    ? "https://origination.heidipay.com"
    : "https://sbx-origination.heidipay.io";
}

/**
 * API key merchant: in produzione `HEYLIGHT_API_KEY`, altrimenti la chiave
 * sandbox. Così lo stesso codice gira in entrambi gli ambienti scegliendo la
 * chiave giusta in base a `HEYLIGHT_ENV`.
 */
function merchantKey(): string {
  const isProd = process.env.HEYLIGHT_ENV === "production";
  const name = isProd ? "HEYLIGHT_API_KEY" : "HEYLIGHT_SANDBOX_API_KEY";
  const value = process.env[name];
  if (!value) {
    throw new Error(`[heylight] Missing env var ${name}`);
  }
  return value;
}

/** Timeout richieste (ms). Un contrattempo di rete non deve appendere la lambda. */
const REQUEST_TIMEOUT_MS = 15_000;

async function heylightFetch(
  path: string,
  init: { method: string; body?: unknown; token?: string }
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (init.token) {
    headers.Authorization = `Bearer ${init.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Le risposte HeyLight incapsulano il risultato in `data`; unwrap difensivo. */
function unwrap<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

/* ─────────────────────────── Auth / token 24h ─────────────────────────── */

type TokenCache = { token: string; expiresAt: number };
// Cache a livello di modulo (per-istanza lambda, come il client Tuya).
let tokenCache: TokenCache | null = null;

async function fetchNewToken(): Promise<TokenCache> {
  const response = await heylightFetch("/auth/v1/generate/", {
    method: "POST",
    body: { merchant_key: merchantKey() }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[heylight] auth failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const json = (await response.json()) as { status?: string; data?: { token?: string } };
  const token = json.data?.token;
  if (!token) {
    throw new Error(`[heylight] auth: risposta priva di token (status=${json.status})`);
  }

  // Il body non riporta la scadenza: le docs dichiarano 24h. Usiamo un TTL
  // prudenziale di 23h per rigenerare prima che scada davvero.
  return { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
}

/** Token merchant valido (dalla cache o rigenerato). */
async function getToken(): Promise<string> {
  if (!tokenCache || Date.now() >= tokenCache.expiresAt) {
    tokenCache = await fetchNewToken();
  }
  return tokenCache.token;
}

/**
 * Esegue una chiamata autenticata; su 401 (token invalido/scaduto lato server)
 * invalida la cache e ritenta UNA volta con un token fresco.
 */
async function authedFetch(
  path: string,
  init: { method: string; body?: unknown }
): Promise<Response> {
  let token = await getToken();
  let response = await heylightFetch(path, { ...init, token });
  if (response.status === 401) {
    tokenCache = null;
    token = await getToken();
    response = await heylightFetch(path, { ...init, token });
  }
  return response;
}

/* ─────────────────────────── Create contract ─────────────────────────── */

export type CreateContractInput = {
  /** Importo totale in EUR, in centesimi (minor units). */
  amountCents: number;
  /** Reference interno (es. `Payment.id`). */
  reference: string;
  /** Numero di rate offerte al cliente (es. [12] per l'annuale). */
  allowedTerms: number[];
  redirectUrls: { successUrl: string; failureUrl: string };
  customer: {
    email: string;
    firstName: string;
    lastName: string;
    contactNumber?: string;
  };
  /** Descrizione prodotto mostrata nel checkout. */
  productName: string;
  /** Config webhook: dove HeyLight notifica i cambi di stato. */
  webhook: { statusUrl: string; token: string };
  /**
   * Indirizzo di "spedizione": per un servizio non esiste, ma il campo è
   * richiesto dall'API → passiamo l'indirizzo della palestra. ⚠️ da validare in
   * sandbox se è obbligatorio per prodotti-servizio.
   */
  shippingAddress?: {
    addressLine: string;
    zipCode: string;
    city: string;
    countryCode: string;
  };
};

export type CreatedContract = {
  /** UUID del contratto HeyLight — da salvare come `providerReference`. */
  externalContractUuid: string;
  /** URL hosted a cui redirigere il cliente per firmare il finanziamento. */
  redirectUrl: string;
};

type InitResponse = {
  action?: string;
  redirect_url?: string;
  external_contract_uuid?: string;
};

/**
 * Crea un contratto/pagamento HeyLight e ritorna il redirect da usare.
 * L'importo è in EUR, in centesimi (`amount_format: "MINOR_UNIT"`).
 */
export async function createContract(input: CreateContractInput): Promise<CreatedContract> {
  const body = {
    amount: { currency: "EUR", amount: input.amountCents },
    amount_format: "MINOR_UNIT",
    store_id: "commerce",
    language: "it",
    order_reference: input.reference,
    allowed_terms: input.allowedTerms,
    customer_details: {
      email: input.customer.email,
      first_name: input.customer.firstName,
      last_name: input.customer.lastName,
      contact_number: input.customer.contactNumber
    },
    redirect_urls: {
      success_url: input.redirectUrls.successUrl,
      failure_url: input.redirectUrls.failureUrl
    },
    products: [
      {
        sku: input.reference,
        name: input.productName,
        quantity: 1,
        price: input.amountCents
      }
    ],
    shipping_address: input.shippingAddress
      ? {
          address_line_1: input.shippingAddress.addressLine,
          zip_code: input.shippingAddress.zipCode,
          city: input.shippingAddress.city,
          country_code: input.shippingAddress.countryCode
        }
      : undefined,
    // ⚠️ confermato in sandbox: il campo è `mapping_scheme` (non `mapping`) ed è
    // obbligatorio; lo shipping address vuole `address_line_1` (non `address_line`).
    webhooks: {
      status_url: input.webhook.statusUrl,
      mapping_scheme: "DEFAULT",
      token: input.webhook.token
    }
  };

  const response = await authedFetch("/api/checkout/v1/init/", { method: "POST", body });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[heylight] createContract failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  const data = unwrap<InitResponse>(await response.json());
  if (!data.redirect_url || !data.external_contract_uuid) {
    throw new Error(
      `[heylight] createContract: risposta priva di redirect_url/external_contract_uuid (action=${data.action})`
    );
  }

  return {
    externalContractUuid: data.external_contract_uuid,
    redirectUrl: data.redirect_url
  };
}

/* ─────────────────────────── Application status ─────────────────────────── */

/** Stati contratto HeyLight (dalla reference `applications`). */
export type HeyLightStatus = "pending" | "awaiting_confirmation" | "success" | "cancelled";

export type HeyLightApplication = {
  externalContractUuid: string;
  status: HeyLightStatus;
  /** Valorizzato quando l'acquisto è finale (contratto confermato). */
  contractConfirmedAt: string | null;
  applicationApprovedAt: string | null;
};

type ApplicationResponse = {
  // La lista `applications` espone l'uuid come `contract_uuid` nell'item
  // (il `external_contract_uuid` è solo il parametro di query).
  contract_uuid?: string;
  status?: HeyLightStatus;
  contract_confirmed_at?: string | null;
  application_approved_at?: string | null;
};

/**
 * Recupera lo stato AUTOREVOLE di un contratto tramite `external_contract_uuid`.
 * È la fonte di verità: il webhook è solo un trigger, qui confermiamo `success`
 * prima di attivare l'abbonamento.
 *
 * L'endpoint elenca le applications; con `external_contract_uuid` filtra a una.
 */
export async function getApplication(
  externalContractUuid: string
): Promise<HeyLightApplication | null> {
  const response = await authedFetch(
    `/api/checkout/v1/applications/?external_contract_uuid=${encodeURIComponent(externalContractUuid)}`,
    { method: "GET" }
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[heylight] getApplication failed ${response.status} ${response.statusText}: ${text}`
    );
  }

  // La lista può tornare come array (dentro `data`/`results`) o singolo oggetto.
  const raw = unwrap<unknown>(await response.json());
  const item = Array.isArray(raw)
    ? (raw[0] as ApplicationResponse | undefined)
    : ((raw as { results?: ApplicationResponse[] }).results?.[0] ??
        (raw as ApplicationResponse));

  if (!item || !item.status) return null;

  return {
    externalContractUuid: item.contract_uuid ?? externalContractUuid,
    status: item.status,
    contractConfirmedAt: item.contract_confirmed_at ?? null,
    applicationApprovedAt: item.application_approved_at ?? null
  };
}

/** True se il contratto è finale: merchant pagato, abbonamento da attivare. */
export function isContractPaid(app: HeyLightApplication): boolean {
  return app.status === "success" && app.contractConfirmedAt != null;
}
