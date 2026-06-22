# HANDOFF — Controllo accessi palestra (Tuya keypad) + spostamento repo

_Aggiornato: 2026-06-22. Scritto per il prossimo agente Claude._

## ⚠️ PRIMA DI TUTTO — dove sei
- Il repo è stato **spostato** da `~/Desktop/gestionale` (cancellato, era su iCloud → git lentissimo/timeout) a **`~/Developer/gestionale`** (disco veloce, accanto a `gestionale-mobile`).
- Branch corrente: **`feat/local-access-control`** (già su GitHub, commit `27e36f7`). Remote: `git@github.com:SublimedApple58/gestionalePalestre.git`. Deploy: push su `master` → Vercel.
- Leftover del vecchio Desktop salvati in **`~/Developer/desktop-leftovers/`** (incl. una modifica non committata a `payments-reconcile/run/route.ts` che NON è nostra → non perderla, ma non è nostra responsabilità).

### Da fare SUBITO per rendere operativo il repo nuovo
1. `cd ~/Developer/gestionale && pnpm install` (il node_modules era di una clone vecchia, va riallineato).
2. `pnpm --filter @gestionale/db db:generate` (rigenera client Prisma).
3. (verifica) build/typecheck del web.

## Il problema di prodotto (contesto)
Palestra **h24**. L'accesso è un **tastierino Tuya WiFi F22-WRB1** (categoria `mk`). Flusso **non negoziabile**: abbonamento attivo → l'utente ha un PIN che digita sul tastierino; non abbonato → niente PIN. NON proporre apertura da app per gli iscritti.

## Causa radice del "bug notturno" (PIN che di giorno funzionano e di notte no)
- I PIN creati dal nostro backend via **cloud Tuya** (`door-lock/actions/entry`) sono di tipo **"online"** → il device li valida appoggiandosi al cloud, che **di notte degrada** → il tastierino li rifiuta ~20:00–08:00, poi guariscono la mattina.
- I codici creati **dall'app Tuya** (validati in **locale** dal controller, `user_type 20`) funzionano **24/7**. Provato A/B di notte.
- `actions/entry` accetta solo `user_type` 1/2 → **non può** creare il tipo "locale" dell'app.
- API access-control (`/v1.0/access-control/.../passpwd`) → `1106 permission deny` (non utilizzabile su questo device consumer).
- Ticket Tuya aperto (testo in `tuya-support-ticket.md`): la loro risposta indicava endpoint `smart-lock/.../schedule` (1108 su questo device) e `device-lock/.../allocate` (da provare). Non risolutivo.

## ⚠️ Scoperte importanti emerse il 22/6 (correggono vecchi assunti)
1. **Il vecchio HANDOFF (Desktop) era basato su una checkout VECCHIA e divergente.** Il `master` reale (= produzione su Vercel) è molto più avanti.
2. **In produzione girano DUE cron cloud che il vecchio handoff dava per rimossi:**
   - `tuya-pin-reassert` (job `tuya-pin-reassert-job.ts`, ~ogni 30 min, riscrive i PIN) → **forte sospetto per il churn** dei PIN.
   - `tuya-access-log-sync` (job `tuya-access-log-sync-job.ts`, pull degli ingressi reali dal cloud → `AccessEvent KEYPAD_UNLOCK`).
   - **Questi due (cloud) sono quasi certamente i veri DIVORATORI di quota IoT Core.**
3. **Quota IoT Core esaurita**: il pacchetto trial gratuito (26.000 chiamate/mese, refresh mensile, scade 14/12/2026) è **Suspended** → ogni chiamata cloud fallisce con `28841004`. Le edizioni a pagamento partono da **25.000$/anno** (enterprise, fuori discussione). → **Conclusione strategica: uscire dal cloud Tuya.**

## Decisione strategica (approvata dall'utente)
**Controllo accessi LOCALE, senza cloud Tuya.** Riciclare tastierino+relè+serratura esistenti. Un **PC Windows** sempre acceso in palestra, sulla **stessa LAN** del tastierino, gli parla in locale (`tinytuya`, TCP 6668, local key). Il nostro BE resta la verità sugli abbonamenti; il PC sincronizza i codici sul device e logga gli sblocchi. Validazione **locale** → niente bug notturno, niente quota, niente costi.
Piano completo: **`plans/access-control/001-controllo-locale-no-cloud.md`**.

## Cosa è stato FATTO in questo branch (`feat/local-access-control`)
**Backend (`apps/web`):**
- `src/lib/access/authorization.ts` — `shouldHaveAccess()` + `getActiveAccessCodes()` (regola unica: ADMIN/INSTRUCTOR sempre, SUBSCRIBER se abbonamento attivo).
- `src/app/api/internal/access-codes/route.ts` — **GET** codici attivi (auth `x-cron-secret`). Sorgente per il PC.
- `src/app/api/internal/access-events/route.ts` — **POST** log sblocco → `recordKeypadUnlock`.
- `src/lib/services/access-event-service.ts` — aggiunta `recordKeypadUnlock` (mappa codice→utente; gestisce codici duplicati).
- Refactor: `tuya-pin-service.ts` e `tuya-pin-migration` usano `shouldHaveAccess` (comportamento invariato).
- DB: indice `User(accessCode)` → migration `packages/db/prisma/migrations/20260622100000_add_accesscode_index` (NB: `KEYPAD_UNLOCK` è GIÀ su master dalla migration `20260619120000`, non duplicare). Applicare con `pnpm migrate:prod`.

**Servizio locale (`reglo-access/`):** `service.py`, `keypad.py`, `be_client.py`, `open.py`, `spike/01..05`, `install-service.bat`/`uninstall-service.bat` (NSSM/Windows), `config.example.env`, `README.md`, `ONSITE-CHECKLIST.md`.
- Pronto/collaudabile: connessione, apertura relè, ascolto eventi.
- **STUB da finalizzare on-site (GATE)**: `keypad.add_code/list_codes/remove_code` — il formato DP del create-password si determina con `spike/05_write_code.py` (deve aprire **anche di notte**). Se il gate fallisce → Piano B (controller proprio cablato sul relè).

## Cosa MANCA
1. Repo nuovo operativo: `pnpm install` + `db:generate` (vedi sopra).
2. Test backend dei due endpoint (serve `CRON_SECRET` nell'env — verificare `apps/web/.env.local`).
3. Applicare la migration indice (`pnpm migrate:prod`) — quando si va in prod.
4. **On-site (Fase 1)**: local key + IP fisso tastierino → spike `01→05` → GATE → finalizzare `keypad.py` → installare servizio Windows.
5. Merge del branch in `master`.
6. **Decisione su prod**: i cron cloud `tuya-pin-reassert` e `tuya-access-log-sync` (quota/churn) — spegnerli/sostituirli col controllo locale.

## Suggerimento per il prossimo agente
Chiedi all'utente da dove vuole ripartire:
- **(A)** indagare/spegnere i cron cloud `tuya-pin-reassert` + `tuya-access-log-sync` (quota + churn), oppure
- **(B)** preparare/eseguire la Fase 1 on-site del controllo locale.
Non toccare la produzione senza conferma. Per qualsiasi azione, leggi prima `plans/access-control/001-controllo-locale-no-cloud.md` e i CLAUDE.md dei repo.

## File utili
- `plans/access-control/001-controllo-locale-no-cloud.md` — piano dettagliato.
- `reglo-access/ONSITE-CHECKLIST.md` — guida passo-passo per la palestra.
- `tuya-support-ticket.md` — ticket Tuya (contesto tecnico completo + due utenti di confronto sul device: `540xdy` app-OK `252858`, `54emze` API-KO `474747`).
- Script diagnostici Tuya (fuori repo): `~/tuya-diag/` (caricano env da `apps/web/.env.local`).
