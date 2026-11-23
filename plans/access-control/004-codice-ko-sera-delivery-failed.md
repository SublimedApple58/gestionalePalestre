# 004 — Codice OK di giorno, KO la sera: validità permanente "FAILED" sulla serratura

## Cosa è stato fatto (sintesi, 23 nov 2026)
Segnalazione: **Giandomenico Cretone** (971328, annuale attivo) non entrava la
sera. La staff **Alessia Di Domenico** gli aveva prestato il suo codice.

- **Causa trovata**: per il suo member il cloud riportava `permanent: true` ma
  `time_schedule_info.delivery_status` = `ONGOING` → dopo il ri-invio `FAILED`
  (2 tentativi, deterministico). Il permanente **non è mai arrivato al device**,
  che teneva la finestra limitata di default dei non-home user (la causa nota dal
  1 lug, `d2402cd`). Gli iscritti che entrano la sera hanno `SUCCESS`.
- **Perché i fix precedenti non l'hanno preso**: `setUserPermanent` (creazione,
  retry, reassert, health-check notturno) considera riuscita la PUT quando il
  cloud risponde `true`; nessuno controllava la consegna. Il ri-invio non basta:
  su un member incastrato la consegna fallisce sempre.
- **Sistemico**: scan di tutti i 663 idonei → **5 FAILED** (Giandomenico,
  Alessandra Daniele 527036, Ezio Di Antonio 721935, Andrea Bruni 245094,
  Giuseppe Sciamanna 986316). Tutti riparati con `?recreate` (codici invariati).
  Scan finale: **663/663 SUCCESS**.
- **Alessia**: member ricreato con codice nuovo (`?recreate=135185&newcode=1`)
  → **422527**, `SUCCESS`, password presente; il vecchio member (e quindi il
  vecchio 135185) non è più sul device (`?check=` vuoto). Audit `PROFILE_UPDATED`.
- Nota: "ultimo ingresso 18/10" non era corretto. Nel DB Giandomenico ha
  ingressi da tastierino il 19/11 e il 21/11, tutti di giorno: il codice
  funzionava solo di giorno.

### Codice (route interna `tuya-pin-resync`, solo strumenti operativi)
- `lib/tuya/access-control.ts`: `listDeviceUserSchedules()` (GET a pagine
  `/v1.1/devices/{id}/users`, include `time_schedule_info`),
  `getDeviceUserSchedule()`, `readUserSchedule()` (diag).
- route: `?schedule=`, `?schedulescan=1[&check=<tuyaIds>]`, `?recreate=<code>[&newcode=1]`.
- Endpoint provati e NON validi per leggere lo schedule:
  `/v1.0/smart-lock/devices/{id}/users/{uid}` (+`/schedule`, v1.1) → `1108 uri path invalid`;
  `/v1.0/devices/{id}/door-lock/users/{uid}` → API non sottoscritta.
  Quello giusto è **`GET /v1.1/devices/{id}/users/{uid}`**.

## Come è stato verificato che funziona la sera (senza essere al tastierino)
La validità oraria è uno stato del member sul device. Dopo la riparazione i 6
member hanno la stessa identica configurazione (`permanent: true`,
`delivery_status: SUCCESS`, chiave `password` presente) dei 658 member che
entrano regolarmente fino alle 23 (es. Florentina Manole 22:08, Denise
Procacci 22:19 del 20/11). Conferma sul campo: il primo ingresso serale di
971328 / 422527 nel registro (`AccessEvent` KEYPAD_UNLOCK dopo le 19).

## Fix strutturale proposto (NON applicato, in attesa di ok)
Nel job notturno `tuya-pin-health` (04:30 UTC), **prima** delle sue scritture:
1. `listDeviceUserSchedules()` (~11 chiamate per ~1.100 member).
2. Idonei con `delivery_status` ≠ SUCCESS (a quell'ora un `ONGOING` è vecchio
   di almeno ~24 h, quindi incastrato) → `recreate` automatico (delete + sync),
   con tetto di ~10 per notte e log dei codici riparati.
3. Rischio: cancellazione e ricreazione automatica di member su una porta live.
   Se `enablePin` fallisce, l'utente resta senza codice fino al giro dopo.
   Mitigazioni: tetto, solo FAILED/ONGOING, ricreazione solo se la delete riesce.

Pulizia separata (proposta): **435 member sul device non legati ad alcun utente
del DB** (orfani storici). Potrebbero avere ancora un PIN attivo, quindi vanno
cancellati con un job dedicato dopo un'occhiata al campione.
