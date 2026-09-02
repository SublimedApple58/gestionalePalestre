# Fattibilità: HeyLight/Compass come metodo di pagamento (BNPL)

> **Stato:** RICOGNIZIONE — analisi di fattibilità, nessun codice scritto.
> Richiesto da Umberto Giancola (titolare House of Muscle) via WhatsApp + mail HeyLight
> girata a Tiziano ("Ti diamo il benvenuto! Completa l'attivazione di HeyLight").
> **In attesa** delle risposte di Umberto/HeyLight alle domande aperte (§6) prima di iniziare.
> Data: 2026-09-02.

## Verdetto in una riga

**Fattibile, complessità MEDIA** — e tecnicamente **più semplice** di quanto temuto: con HeyLight
il gestionale **non deve inseguire le 12 rate**, riceve **una sola conferma** e attiva
l'abbonamento annuale. Le 12 rate mensili corrono tra il cliente e Compass, non passano dal
gestionale.

Non è bloccato tecnicamente, ma è **bloccato dall'onboarding commerciale** (contratto merchant +
credenziali sandbox/API): senza quelli non si parte con l'integrazione vera.

## Contesto (richiesta Umberto)

- Vuole HeyLight/Compass (nuovo brand del BNPL "PagoLight" di Compass Banca) come metodo di
  pagamento **di default**: il cliente paga dal sito, viene reindirizzato al checkout
  HeyLight/Compass e rateizza/finanzia l'abbonamento.
- Esempio: annuale **€575,88 in 12 rate mensili** via HeyLight.
- Il **biennale resta con la logica attuale** (2 rate, non mensilizzato) — su questo **non toccare
  nulla**.
- Dubbio di Tiziano: "il gestionale deve capire da solo quando uno paga" → serve la
  riconciliazione automatica dell'esito (webhook/callback → stato abbonamento pagato).

## 1. Come funziona oggi il gestionale (dove si innesta)

- **PSP attivo: Revolut Merchant API** (migrato da SumUp — vedi `001-revolut-migration.md`).
  Esistono scaffold di Stripe (card in-app mobile, parziale) e **Klarna (BNPL, disabilitato)** ma
  non sono cablati nel checkout.
- **Checkout = redirect a pagina hosted esterna** (sia web che mobile aprono l'URL Revolut). Non è
  un form embedded. → **HeyLight funziona allo stesso modo** (redirect), pattern già corretto.
  - `apps/web/src/lib/payments/index.ts` → `initiatePayment()` (facade, **hardcoded REVOLUT**)
  - `apps/web/src/app/actions/payment-actions.ts` → `initiateCheckoutAction`
  - `apps/web/src/components/checkout/checkout-form.tsx` (default = annuale a rate)
- **Riconciliazione = webhook** `POST /api/webhooks/revolut` (verifica firma HMAC-SHA256), aggiorna
  `Payment → PAID` e fa `upsert` di `UserSubscription` (`endsAt` via `computeExtendedEndDate`, non
  perde giorni), poi sincronizza il PIN porta Tuya (`safeSyncPinToKeypad`).
- **Rate oggi (Revolut):** l'annuale a rate è una **subscription ricorrente Revolut** che addebita
  ogni mese; il cron `installments-charge-job.ts` è solo rete di sicurezza (NON addebita). È la
  parte più fragile/spiky del sistema attuale.
- **Prezzi già a listino** (`apps/web/src/lib/subscription.ts`, `TIER_CATALOG`):
  Annuale €449,99 una tantum **oppure 12×€47,99 = €575,88**; Biennale €749,99 una tantum
  **oppure 2×€374,98**. → I numeri di Umberto **coincidono già** col catalogo.

## 2. Come funziona HeyLight (doc developer pubblica)

- **Credito al consumo BNPL** di Compass Banca (Mediobanca), motore tecnico HeidiPay. Importi
  **fino a €5.000**, **da 3 a 24 rate**, **Italia supportata**.
- **Modello redirect-based:** il gestionale chiama `init`, ottiene un `redirect_url`, ci manda il
  cliente; il cliente firma il finanziamento con Compass; torna su `success_url`/`failure_url`.
- **Auth:** `POST /auth/v1/generate/` con `merchant_key` → token 24h (Bearer).
- **Creazione pagamento:** `POST /api/checkout/v1/init/` con importo, `customer_details`,
  `redirect_urls`, `products`, `store_id: "commerce"`, `language`, `allowed_terms` (es. `[12]` —
  **il cliente sceglie il piano rate** tra quelli abilitati) e un oggetto `webhooks`
  (`status_url` + `token` interno). Risposta: `action: REDIRECT` + `redirect_url` +
  `external_contract_uuid`.
- **Conferma:** webhook su `status_url`, payload **snello** `{token, status}` + redirect di ritorno.
- **Ambienti:** sandbox `https://sbx-origination.heidipay.io`, prod `https://origination.heidipay.com`.
  Sandbox/API key da richiedere a `partner@heylight.com` (Italia).

## 3. La differenza che cambia il progetto (risolve il dubbio di Tiziano)

Con Revolut, "12 rate" = 12 addebiti da riconciliare uno per uno.
Con **HeyLight**, Compass **finanzia il cliente e paga il merchant** (di fatto in un colpo solo):
per il gestionale un **annuale-a-rate-HeyLight ≈ un pagamento one-shot** → **una conferma** → attivo
l'abbonamento per 12 mesi. Le 12 rate mensili sono un fatto tra cliente e Compass.

**Conseguenza:** niente subscription ricorrente, niente cron di addebito, niente tracking delle
singole rate lato gestionale. Le tabelle `InstallmentPlan`/`Installment` per HeyLight diventerebbero
**solo informative** (o non usate). → **meno codice e meno rischio** del sistema Revolut a rate.

## 4. Cosa serve lato backend (stima)

| Componente | Cosa | Complessità |
|---|---|---|
| Provider client `heylight.ts` | auth token (cache 24h) + `init` + refund + status-check | **Media** (template pronto: scaffold `klarna.ts`) |
| Enum `PaymentProvider.HEYLIGHT` | additivo, c'è già spazio (enum già `REVOLUT, KLARNA, STRIPE`) | Bassa (migrazione additiva) |
| Facade `initiatePayment` | oggi hardcoded REVOLUT: aggiungere selezione provider (default HeyLight per annuale, **Revolut invariato per biennale**) | Media |
| Webhook `/api/webhooks/heylight` | mappa `status → Payment PAID → upsert subscription → sync PIN Tuya`, **idempotente** | Media |
| Verifica autenticità | payload HeyLight è solo `{token,status}` (no HMAC come Revolut) → **mitigare richiamando l'endpoint status** per confermare lo stato reale, non fidarsi del solo webhook | Media (sicurezza) |
| Gate SDD SEPA attuale | il mandato di rimborso lo firma il cliente **su Compass** → il gate SDD interno del gestionale va probabilmente **saltato per gli acquisti HeyLight** | Bassa (da decidere) |

**Il biennale resta identico** (Revolut, 2 rate): i due provider **coesistono**, con routing per
tier. Fattibile, ma è la ragione principale della complessità "media" invece di "bassa".

## 5. Rischi / attenzioni

- **Coesistenza due PSP** (HeyLight annuale + Revolut biennale/altro): raddoppia i percorsi di
  webhook/riconciliazione da mantenere.
- **Sicurezza webhook** più debole di Revolut → obbligatorio il controllo lato status API.
- **Domanda di credito rifiutata:** cosa succede se Compass **nega** il finanziamento? Serve un
  fallback (es. one-shot/Revolut). Da progettare.
- **Compliance:** KYC, contratto di credito e SECCI li gestisce Compass. Il merchant deve solo
  mostrare prezzo/termini corretti.

## 6. Domande aperte (da girare prima di iniziare)

**A HeyLight/Compass (`partner@heylight.com`):**
1. Il contratto merchant è **già attivo** o l'email "completa l'attivazione" è onboarding da finire?
   Serve completarlo per avere l'API key.
2. **Accesso sandbox** + API key di test: come si richiedono e in quanto tempo.
3. **Fee merchant:** il merchant incassa €575,88 pieni meno commissione? E per il cliente è **davvero
   a interessi zero** (12×47,99) o c'è un TAN/TAEG a suo carico?
4. **Modalità di attivazione contratto:** la doc cita un passaggio "conferma ordine/consegna" per le
   modalità non automatiche → per un servizio (abbonamento) va chiamato un endpoint di attivazione
   prima che Compass eroghi? Da questo dipende **quando** attivo l'abbonamento.
5. Tempistica di **accredito** al merchant e gestione **rimborsi/recessi**.

**A Umberto (prodotto):**
6. HeyLight come default **su tutto** (anche mensile/one-shot) o **solo sull'annuale a 12 rate**?
   (il biennale resta com'è)
7. Vuole **tenere anche l'opzione one-shot** e Revolut come alternativa, o HeyLight diventa l'unica
   strada per l'annuale?

## Fonti

- https://docs.heylight.com/reference/introduction-1
- https://docs.heylight.com/reference/getting-started-with-your-api
- https://docs.heylight.com/reference/step-2-how-to-create-a-payment
- https://www.compass.it/nasce-heylight.html
