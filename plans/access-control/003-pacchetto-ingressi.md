# 003 — Pacchetto ingressi (admin-only)

**Stato:** implementato 20 lug 2026. Migrazione applicata al DB (`20260720120000_add_user_entry_package`).

## Cosa è stato fatto
Feature admin-only per assegnare a un iscritto **N ingressi a consumo** (alternativa all'abbonamento, per chi non ce l'ha). Ogni ingresso col codice al tastierino scala il conteggio; a 0 il codice porta (Tuya PIN) si disabilita. Assegnare un abbonamento **annulla** il pacchetto. Non acquistabile dagli utenti, non nel checkout.

### Backend/DB (repo gestionale)
- **DB** `packages/db/prisma/schema.prisma`: model `UserEntryPackage` (1:1 con User: `totalEntries`, `remainingEntries`, `assignedById`, `startsAt`, `deactivatedAt`). Enum `AuditAction` += `ENTRY_PACKAGE_ASSIGNED`, `ENTRY_PACKAGE_REMOVED`.
- **Eligibilità porta centralizzata** `apps/web/src/lib/subscription.ts`: `isEntryPackageActive()` + `shouldHaveDoorPin({role, subscription, entryPackage})`. Sostituisce la logica `shouldHavePin` duplicata in `tuya-pin-service.ts`, `tuya-pin-resync/run`, `tuya-pin-migration/run`, `tuya-pin-reassert-job` (tutte ora caricano `entryPackage` e usano `shouldHaveDoorPin`).
- **Service** `apps/web/src/lib/services/user-service.ts`: `assignEntryPackageByAdmin` (blocca con `HAS_ACTIVE_SUBSCRIPTION` se l'utente ha abbonamento door-eligible), `removeEntryPackageByAdmin`. `assignSubscriptionByAdmin` annulla il pacchetto (mutua esclusività).
- **Decremento idempotente** `tuya-access-log-sync-job.ts`: dopo il `createMany` degli eventi, ricalcola `remainingEntries = max(0, total − count(KEYPAD_UNLOCK dopo startsAt))` per gli utenti del batch con pacchetto attivo; a 0 → `safeSyncPinToKeypad`. Idempotente (deriva dagli eventi immutabili).
- **Cron notturno** `api/internal/tuya-pin-sync/run` (`0 4 * * *`): esegue prima `runTuyaAccessLogSyncJob` (pull ingressi + ricalcolo pacchetti), poi `runTuyaPinSyncJob`.
- **Web admin UI** `user-edit-drawer.tsx` (+ `utenti/page.tsx` include, `user-management.tsx` type): stato pacchetto + sezione "Assegna/Rimuovi pacchetto ingressi" (blocco con avviso se abbonamento attivo). Azioni in `dashboard-actions.ts`. Validatori in `validators/forms.ts`.
- **Utente (al posto dell'abbonamento)** `dashboard/page.tsx` + `dashboard-hero.tsx` + `subscriber-dashboard.tsx`: chi ha pacchetto attivo vede "Ingressi rimasti N/total", ha accesso abilitato, niente prompt d'acquisto.
- **API mobile** `api/mobile/admin/users/[id]/entry-package/route.ts` (POST/DELETE), `[id]/route.ts` (+entryPackage), `me/route.ts` (+entryPackage). Validatore `validators/mobile.ts`.

### Mobile (repo gestionale-mobile)
- Tipi `src/services/api.ts` (`EntryPackageSummary`, `AdminUserDetail.entryPackage`, `MeResponse.entryPackage`).
- Client `src/services/admin.ts` (`assignEntryPackage`, `removeEntryPackage`).
- Schermata admin `app/(admin)/users/[id].tsx`: sezione "Pacchetto ingressi" (assegna via `EditFieldSheet kind="number"`, rimuovi via Alert; modale di blocco col messaggio dal backend).
- `EditFieldSheet` esteso con `kind="number"`.
- Home subscriber `app/(subscriber)/home.tsx`: card "Pacchetto ingressi — N/total rimasti" al posto dell'abbonamento, niente prompt acquisto.

## Decisioni (con l'utente)
1. Abbonamento attivo → assegnazione pacchetto **bloccata** con modale.
2. Disabilitazione automatica via cron notturno esistente (`tuya-pin-sync`).
3. L'utente **vede** gli ingressi rimasti, al posto dell'abbonamento.

## Verifica fatta
Typecheck web verde; migrazione applicata e tabella/enum queryabili; feature inerte finché non si assegna un pacchetto. Da QA su staging: assegna (web+mobile), simula ingressi keypad → decremento + disabilitazione a 0, overwrite con abbonamento.

## Rischi noti
- Overshoot poll-based: il codice si spegne al prossimo sync/cron (non in tempo reale). `max(0,…)` evita saldi negativi.
- Quota Tuya: `disablePin` per ogni pacchetto azzerato (rate-limit 300ms già presente nel pin-sync).
