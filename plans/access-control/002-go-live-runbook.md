# Tuya access-control — RUNBOOK go-live (arrivo tastierino nuovo ~8 lug 2026)

Architettura: **cloud-only** (niente PC/local key). Vedi anche
`001-tuya-quota-tuning.md`. Questo file = checklist operativa per accendere il
sistema quando arriva il tastierino nuovo (FusyTuly S10, categoria Tuya `mk`).

## 0. Stato verificato in anticipo (2026-06-30)
- ✅ **Account cloud nuovo** (Access ID `9uawhwjq9u4dkam85eat`, region eu):
  autentica, **quota viva** (token test OK, expire 7200s).
- ✅ Prod `gestionale-palestre` (→ app.houseofmuscle.it) ha **tutti e 5 gli env
  TUYA + CRON_SECRET**.
- ⚠️ **Prod NON punta all'account nuovo.** `TUYA_CLIENT_ID/SECRET` di prod sono di
  ~54 giorni fa (account nuovo = 26 giu), marcati "Sensitive" (non rileggibili).
  `.env.local` dev ha un altro CLIENT_ID (`hmth3sh…`) + il device VECCHIO
  (`bf38d4d722d26342b0x6vp`). → **CLIENT_ID + SECRET + DEVICE_ID vanno aggiornati
  in prod** (vedi §2).

## 1. Service API da abilitare sul progetto Tuya (SOLO i necessari)
Sul progetto IoT (iot.tuya.com → Cloud → il progetto → **Service API** →
Authorize / All Products), servono **due** prodotti — nient'altro:
1. **IoT Core** — token, info device, comandi device (apertura remota), resource
   pack base. OBBLIGATORIO.
2. **Smart Lock** — tutti gli endpoint usati dal codice: `door-lock/password-ticket`,
   `door-lock/actions/entry`, `door-lock/.../unlock-types/password/keys/...`,
   `door-lock/open-logs`, gestione utenti device (`/devices/{id}/user(s)`).

NON servono: Device Status Notification (Pulsar — noi facciamo pull dei log),
Data/Analytics, soluzioni industry, Device Control separato (i comandi sono in IoT
Core). Enable solo IoT Core + Smart Lock → meno superficie, meno rogne.

## 2. Env da impostare in Vercel prod (`reglo/gestionale-palestre`)
Settings → Environment Variables → Production, poi **Redeploy** (gli env cambiano
solo dopo un redeploy):
| Var | Valore |
|-----|--------|
| `TUYA_CLIENT_ID` | `9uawhwjq9u4dkam85eat` (account nuovo) |
| `TUYA_CLIENT_SECRET` | secret account nuovo (**32 char** — serve per AES-256 del PIN) |
| `TUYA_DEVICE_ID` | **device id del tastierino NUOVO** (dopo l'abbinamento) |
| `TUYA_BASE_URL` | `https://openapi.tuyaeu.com` (già ok) |
| `TUYA_REMOTE_OPEN_PAYLOAD` | ri-catturare per il nuovo device (solo per "Apri porta" remoto; codici/log NON lo usano) |

Nota: allineare anche `apps/web/.env.local` se si vuole testare in dev.

## 3. Sequenza on-site
1. **Abbina** il tastierino nuovo all'app **Smart Life** dell'account linkato al
   progetto `9uawhw…` (region eu). Deve finire in QUEL account, altrimenti l'API
   non lo vede.
2. **Copia il device id** (Smart Life → device → info, o iot.tuya.com → Devices).
3. **Preflight** (prima ancora di toccare la prod), dal Mac:
   ```
   # aggiorna apps/web/.env.local con account nuovo + nuovo device id, poi:
   node apps/web/scripts/tuya-preflight.mjs --write
   ```
   Verifica: auth → device online + category `mk` → open-logs → ciclo reale
   crea/scrivi PIN `246810`/cancella (prova ad aprire col PIN mentre gira).
4. **Aggiorna gli env prod** (§2) → **Redeploy**.
5. **Bulk 165**: `curl -H "Authorization: Bearer $CRON_SECRET" \
   https://app.houseofmuscle.it/api/internal/tuya-pin-migration/run`
   (idempotente; i codici vengono dal DB = `accessCode` di ogni utente, non dal CSV).
6. **Registro ingressi**: entra con un codice, attendi ≤30 min, controlla che
   l'ingresso compaia (`tuya-access-log-sync` gira ogni 30 min).

## 4. Note / rischi residui
- L'unico test che DEVE avvenire sul device fisico è la scrittura PIN (§3.3): API,
  auth e crypto sono già confermati; resta da vedere che *quell'esemplare* accetti
  la entry. È 1 flusso, ~30s.
- Apertura remota: `TUYA_REMOTE_OPEN_PAYLOAD` è device-specifico → va ri-catturato
  (Cloud → Devices → Debug Device → Device Logs, intercettando "Apri" dall'app).
  Non blocca codici/registro.
- Quota: con le cadenze nuove (`001-...md`) ~3-5k chiamate/mese su 26k. Il bulk
  iniziale è un burst una-tantum (~331 utenti), ampiamente dentro il tetto.
