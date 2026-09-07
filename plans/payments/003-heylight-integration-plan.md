# Integrazione HeyLight/Compass (BNPL) — Piano tecnico

> **Stato:** APPROVATO da Tiziano (07/09/2026). Sviluppo in **sandbox**.
> Decisioni chiuse: HeyLight **solo sull'abbonamento ANNUALE a rate** (non default su
> tutti i tipi). Biennale invariato (Revolut, 2 rate). Nessun tocco a prod/pagamenti
> reali senza OK esplicito di Tiziano/Umberto.
>
> **Cosa è stato fatto finora:**
> - Ricognizione fattibilità → `002-heylight-feasibility.md`.
> - **Sandbox verificata** (curl): auth `200`, init `201 REDIRECT`+`external_contract_uuid`,
>   applications `200`. Corretti 3 nomi campo (`mapping_scheme`, `address_line_1`, `contract_uuid`).
> - **Fase 1** ✅ provider client `heylight.ts`.
> - **Fase 2** ✅ enum `PaymentProvider.HEYLIGHT` + migrazione additiva
>   `20260907120000_add_heylight_payment_provider` (da applicare con `prisma migrate`).
> - **Fase 3** ✅ routing facade (`YEARLY` + rate → HeyLight) + checkout action (phone/failureUrl/webhookUrl).
> - **Fase 4** ✅ webhook `/api/webhooks/heylight` (trigger) + `reconcileHeyLightPayment`
>   (fonte di verità via GET /applications/) + success page.
> - **Fase 5** ✅ (codice) — firma webhook `X-Signature-SHA256` verificata (HMAC-SHA256 sui byte
>   raw, hex lowercase) con **unit test sul vettore ufficiale** (`tests/unit/heylight-webhook.test.ts`);
>   auto-conferma `awaiting_confirmation` via `POST /api/checkout/v1/confirm/ {external_uuid}`.
>   Resta da fare **un solo giro e2e reale** (redirect + firma contratto lato cliente + webhook)
>   su preview deployata o completando un checkout in sandbox dal browser.
>
> **Dettagli confermati in sandbox (Hiro sul Portale Merchant):**
> - Webhook body = SOLO `{ status, token }` (niente uuid nel payload); header firma
>   `X-Signature-SHA256`. Il `token` = il nostro reference (`Payment.id`) impostato alla create.
> - `awaiting_confirmation` NON avanza da solo → serve `confirm/` merchant (per un servizio la
>   chiamiamo subito: erogazione immediata).
> - API key **produzione**: Impostazioni account → "Gestione dell'account" → "Chiavi API"
>   ("API key Dilazione" + "Public key"), account "House of Muscle". Da copiare al go-live.
>
> **Decisioni tecniche:** `token` webhook = `Payment.id` (correlazione); autenticità = firma HMAC
> **+** GET `/applications/` autorevole (doppia garanzia). **SDD SEPA gate LASCIATO ATTIVO anche per
> HeyLight** (decisione Tiziano 07/09, nessuna modifica). Indirizzo `shipping_address` = env
> `HEYLIGHT_SHIP_*` (default placeholder → impostare sede reale prima della prod).
> Env aggiuntiva: `HEYLIGHT_WEBHOOK_SECRET` (signing key per la firma).

## Contesto

Umberto (titolare) vuole offrire l'annuale a 12 rate tramite **HeyLight** (BNPL di Compass
Banca, motore HeidiPay). Il cliente paga dal sito, viene reindirizzato al checkout HeyLight,
firma il finanziamento con Compass. **Modello BNPL:** Compass paga (quasi subito) la palestra e
gestisce le 12 rate mensili col cliente → per il gestionale è **un'attivazione unica**, niente
inseguimento delle singole rate.

## Fatti tecnici confermati (doc + sandbox)

- **Ambienti:** sandbox `https://sbx-origination.heidipay.io`, prod `https://origination.heidipay.com`.
- **Auth:** `POST /auth/v1/generate/` body `{ merchant_key }` → `{ status, data:{ token } }`.
  Token valido **24h** → cache + rigenerazione automatica.
- **Create payment:** `POST /api/checkout/v1/init/` con `amount{currency,amount}`, `amount_format`,
  `customer_details`, `redirect_urls{success_url,failure_url}`, `products[]`, `shipping_address`,
  `store_id:"commerce"`, `language`, `allowed_terms:[12]`, `webhooks{status_url,mapping,token}`.
  Risposta: `action:"REDIRECT"` + `redirect_url` + `external_contract_uuid`.
- **Ciclo di vita contratto** (`GET /api/checkout/v1/applications/?external_contract_uuid=…`):
  `pending` → `awaiting_confirmation` → **`success`** (o **`cancelled`**). `success` (con
  `application_approved_at` + `contract_confirmed_at`) = **merchant pagato, acquisto finale**.
- **Webhook:** oggetto `webhooks{status_url, token, mapping}` nella create; payload snello. Il
  formato esatto e l'eventuale firma HMAC vanno confermati in sandbox (pagina "Webhooks
  Implementation Guide" da rivedere) → il webhook è trattato come **trigger**, la fonte di verità
  è la GET `/applications/`.

## Flusso end-to-end

```
Checkout (annuale a rate)
  → initiateCheckoutAction: crea Payment(PENDING, provider=HEYLIGHT)
  → heylight.createContract(): POST /init/ (allowed_terms:[12], webhooks{...})
  → redirect(redirect_url)  ── cliente firma il finanziamento su Compass ──
  → ritorno su success_url / failure_url
  → webhook status_url  +  verifica autorevole getApplication(uuid)
      status == success  → Payment.PAID + userSubscription.upsert(endsAt via
                            computeExtendedEndDate) + safeSyncPinToKeypad (PIN Tuya)
      status == cancelled→ Payment.FAILED/CANCELED  (credito rifiutato → messaggio/fallback)
      pending/awaiting   → resta PENDING
  → reconcile pull-side (success page + cron leggero) come rete di sicurezza
```

## Fasi

### Fase 0 — Prerequisiti (non-codice, bloccanti per la prod)
- Chiave **sandbox**: ✅ funzionante.
- Chiave **produzione**: Umberto completa l'attivazione portale (`merchant-portal.heidipay.com/heylight`,
  link scaduto → nuovo link). Se ne occupa Tiziano con Umberto.
- Da chiarire con HeyLight: **fee merchant**, se `awaiting_confirmation` richiede una **conferma
  ordine** esplicita da parte nostra prima dell'erogazione, flusso **rimborsi**, comportamento su
  **credito rifiutato**.

### Fase 1 — Provider client `heylight.ts` (sandbox) — IN CORSO
`apps/web/src/lib/payments/heylight.ts`, sul modello di `revolut.ts`:
- `getToken()` con cache 24h (TTL prudenziale 23h) + rigenerazione su scadenza/401.
- `createContract(input)` → `POST /api/checkout/v1/init/`; ritorna `{ redirectUrl, externalContractUuid }`.
- `getApplication(uuid)` → GET `/applications/` (verifica stato autorevole).
- Base URL + chiave da env (`HEYLIGHT_ENV` sandbox/prod). Gestione errori strutturata (no throw
  grezzo → 500, lezione dell'incident door-open): timeout, unwrap difensivo `data ?? json`.
- Nessuna dipendenza dall'enum Prisma (isolata, typecheckabile da sola).

### Fase 2 — Data model (migrazione additiva)
- `PaymentProvider.HEYLIGHT` (enum ha già spazio).
- `Payment.providerReference` = `external_contract_uuid`; `provider = HEYLIGHT`.
- `InstallmentPlan`/`Installment` **non usati** per HeyLight (le rate sono di Compass) →
  annuale-HeyLight si comporta come one-shot lato nostro.
- Env nuove: `HEYLIGHT_ENV`, `HEYLIGHT_BASE_URL`(override), `HEYLIGHT_API_KEY`,
  `HEYLIGHT_SANDBOX_API_KEY`, `HEYLIGHT_WEBHOOK_TOKEN`.

### Fase 3 — Facade & checkout (routing per tier)
- `initiatePayment` (oggi hardcoded Revolut): se `tier==YEARLY && payInInstallments` → **HeyLight**;
  altrimenti Revolut invariato (biennale 2 rate, one-shot, ecc.).
- `initiateCheckoutAction`: `Payment PENDING` → `createContract` → salva `external_contract_uuid`
  → `redirect(redirectUrl)`. `success_url`/`failure_url` = pagine esistenti; bounce mobile invariato.
- Credito rifiutato (`failure_url`/`cancelled`) → messaggio + eventuale fallback one-shot (da confermare).

### Fase 4 — Webhook + riconciliazione
- Nuova route `POST /api/webhooks/heylight`:
  - Autenticità: match `token` condiviso **+** richiamo `getApplication(uuid)` per confermare
    `success` prima di attivare (no fiducia cieca nel payload). Firma HMAC se HeyLight la fornisce.
  - Idempotente (dedup su `external_contract_uuid`).
  - `success` → `Payment.PAID` + `userSubscription.upsert` + `safeSyncPinToKeypad`.
- Reconcile pull-side: success page + cron leggero chiamano `getApplication` (rete di sicurezza
  se il webhook non arriva), sulla falsariga del reconcile Revolut.

### Fase 5 — Test sandbox end-to-end
Auth → init → redirect → firma simulata → webhook/return → `getApplication` → attivazione
abbonamento + PIN. **Nessun tocco alla prod senza OK esplicito.**

## Domande aperte (Fase 0, da girare a HeyLight/Umberto)
1. Fee merchant e se il cliente è a interessi zero (12×47,99). — APERTA
2. ~~`awaiting_confirmation` richiede una conferma ordine esplicita?~~ ✅ Sì → `POST /confirm/`.
3. Flusso rimborsi/recessi. — APERTA (esiste endpoint refund; da mappare quando serve)
4. Comportamento e fallback su credito rifiutato. — APERTA (per ora → `/checkout/failure`)
5. ~~Formato payload webhook + firma HMAC.~~ ✅ `{status,token}` + `X-Signature-SHA256` HMAC-SHA256.

## Fonti
- https://docs.heylight.com/reference/getting-started-with-your-api
- https://docs.heylight.com/reference/step-2-how-to-create-a-payment
- https://docs.heylight.com/reference/api_checkout_v1_applications_list
