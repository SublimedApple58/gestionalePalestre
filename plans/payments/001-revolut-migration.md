# Migrazione pagamenti SumUp → Revolut Merchant API

## What was done (riepilogo)
Migrazione del provider pagamenti da **SumUp** a **Revolut Merchant API**, web + mobile.
Nessun pagamento reale in produzione → SumUp rimosso del tutto, nessuna migrazione dati.

- **One-shot** → Revolut **Hosted Checkout** (create order → `checkout_url` → redirect → webhook `ORDER_COMPLETED`).
- **Rate** (annuale/biennale) → Revolut **Subscriptions API** nativa (variation a ciclo mensile, cicli finiti). Revolut addebita i cicli e notifica via webhook; il cron non addebita più.
- Conferma: webhook `/api/webhooks/revolut` (firma HMAC `v1.{timestamp}.{rawBody}`) + polling pull-side (`reconcileRevolutPayment`).

### File toccati (backend `gestionale/`)
- `packages/db/prisma/schema.prisma`: enum `PaymentProvider` SUMUP→REVOLUT; `User.sumupCustomerId`→`revolutCustomerId`; `InstallmentPlan.sumupCardToken`→`revolutSubscriptionId`. Migration `20260613120000_migrate_sumup_to_revolut`.
- `apps/web/src/lib/payments/revolut.ts` (NUOVO, sostituisce `sumup.ts` eliminato): `createOrder`, `getOrder`, `createInstallmentSubscription`, `createCustomer`, `verifyWebhookSignature`.
- `apps/web/src/lib/payments/index.ts`: facade rivista (one-shot→order, rate→subscription).
- `apps/web/src/app/api/webhooks/revolut/route.ts` (NUOVO); `webhooks/sumup` eliminato.
- `apps/web/src/lib/services/payment-reconciliation.ts`: `reconcileRevolutPayment` (+ importatori: checkout/success, mobile confirm, reconcile-job).
- `apps/web/src/lib/services/installments-charge-job.ts`: ora `runInstallmentsReconcileJob` (safety-net, non addebita).
- `payment-actions.ts`, `api/mobile/payments/initiate`, retry route + `dashboard-actions.ts` (retry rata): provider REVOLUT, niente `chargeRecurring`.
- Copy/label: `user-edit-drawer.tsx`, `terms`, `privacy`, `checkout-form`.
- `apps/web/.env.example`: `REVOLUT_SECRET_KEY`, `REVOLUT_WEBHOOK_SECRET`, `REVOLUT_API_VERSION`, `REVOLUT_SUB_VARIATION_*`.

### File toccati (mobile `gestionale-mobile/`)
- `src/services/payments.ts`: solo commento (flusso provider-agnostico, invariato).

## ⚠️ SPIKE ancora aperti (Fase 0 — da validare in sandbox Revolut)
Marcati `⚠️ SPIKE` nel codice:
1. **Subscriptions API**: nomi esatti endpoint/campi (`/api/subscriptions`, `customer_id`, `plan_variation_id`, `setup_order_id`) e configurazione **cicli finiti** che fa terminare (non rinnovare) la subscription. → `revolut.ts:createInstallmentSubscription`.
2. **Redirect custom scheme**: confermare che l'Hosted Checkout accetti `redirect_url = houseofmuscle://...`; altrimenti aggiungere route https di bounce e passarla come redirect per il mobile. → `api/mobile/payments/initiate`.
3. **Retry rata manuale**: oggi 501/disabilitato (Revolut ritenta in automatico); eventualmente mappare l'endpoint Revolut di retry pagamento subscription. → retry route + `dashboard-actions.ts`.
4. **Webhook**: confermare nomi eventi/headers/payload in sandbox.

## Deploy
- DB: `pnpm migrate:prod` (NO `migrate dev` locale — `.env` = Neon prod).
- Web/backend: push → Vercel; configurare env Revolut + registrare webhook prod.
- Mobile: OTA non necessaria (solo commento) salvo copy visibile.
