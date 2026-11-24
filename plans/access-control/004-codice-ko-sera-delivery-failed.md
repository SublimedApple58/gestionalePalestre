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

## Fix strutturale APPLICATO (23 nov 2026, ok di Tiziano)
Vincolo: chiamate Tuya al minimo (piano free ~26k/mese, vedi 001).

### Scoperte che hanno cambiato il progetto
- `GET /v1.1/devices/{id}/users` accetta `page_size=2000` → **tutti i ~1.100
  member (con validità e delivery_status) in UNA chiamata**. Lista ordinata dal
  più recente. La scansione completa notturna costa quindi meno di qualsiasi
  schema "solo recenti + completa settimanale" → si fa ogni notte.
- `unlock_detail` nella lista è sempre vuoto → la presenza della password resta
  una lettura per-utente (`getAssignedKeys`), come prima.
- **Orfani = duplicati da attivazioni parallele.** Webhook + pagina di successo +
  conferma mobile lanciano `syncPinToKeypad` in parallelo, ognuno crea il SUO
  member con lo stesso PIN e il DB ne tiene uno. Alla scadenza il pin-sync
  cancella quello collegato e il duplicato **resta aperto**: es. Dario
  Gianfelice (DAILY scaduto 22/11) e Gianmarco Di Marco hanno ancora un member con
  password permanente. Gli ingressi fatti col duplicato finiscono in
  `unmatchedUserIds` del registro (es. `5t09gu` la notte del 23/11).
  Campione 8 orfani: 7 con password + permanente SUCCESS. Classificazione dei 435
  orfani: **435 permanenti, 0 scaduti** → tutti da cancellare.
- Pin-sync: 14 ex iscritti con `tuyaUserId` in DB ma già assenti dal device →
  ogni notte ~4 chiamate a testa fallite (`1106 permission deny`) ≈ 56/notte.

### Cosa fa ora il codice
- `tuya-pin-health-job.ts` (cron 04:30 UTC), a fasi con tetto duro `maxCalls=400`:
  - A. scan validità (1 chiamata);
  - B. idonei con `delivery_status` FAILED, o ONGOING con utente non toccato
    da più di 2 h → `recreateTuyaMember` (delete → create → PIN → permanente),
    **max 10/notte**, procede solo se la delete riesce; codici riparati nel log.
    Non permanente ma consegnato → 1 `setUserPermanent`;
  - C. rotazione chiavi come prima, ma **senza** il ri-invio cieco del
    permanente sui sani (era ~85 chiamate/notte e creava consegne nuove che
    potevano fallire);
  - D. orfani `user_type 20` non collegati e ancora validi → `deleteTuyaUser`,
    **max 40/notte**, prima gli ex iscritti e poi i gemelli di iscritti attivi.
    Un gemello si cancella solo se il member collegato ha la password, altrimenti
    è lui che fa entrare l'iscritto. Scaduti lasciati. I member più nuovi
    dell'ultimo collegato non si toccano (potrebbero essere in creazione).
    Scan fallito → B e D saltate.
- `tuya-pin-service.ts`: `recreateTuyaMember` condivisa (job + route);
  `ensureTuyaUser` collega il member con `updateMany where tuyaUserId=null`: se
  ha vinto un'altra esecuzione, cancella il member appena creato → niente più
  duplicati.
- `tuya-pin-sync-job.ts`: non idoneo e già assente dal device → solo pulizia DB.
- Test: `tests/unit/tuya-pin-health-job.test.ts` (9 casi, inclusi recreate con
  tetto, ONGOING fresco, orfani, scan fallito).

### Costo in chiamate (misurato vs stimato)
| | Prima (log 23/11) | Dopo |
|---|---|---|
| tuya-pin-health | 173/notte | ~87/notte (1 scan + ~86 letture chiavi) |
| pin-sync delete a vuoto | ~56/notte | 0 |
| **Totale/mese** | **~6.900** | **~2.600** (−4.300) |

Una tantum: pulizia orfani ≤435 delete (+ ≤1 lettura per gemello), ~11 notti,
picco ≤~170/notte, sotto le 173 di prima. Recreate: ~6 chiamate ciascuno, attesi
0–1 a notte.

## Update 2026-11-24 — incidente risync + stop cancellazione gemelli
- ~07:56–08:01 una risync completa partita per errore (route `tuya-pin-resync` senza
  parametri riconosciuti, chiamata mentre il deploy con `?member=` non era ancora attivo)
  ha riscritto PIN + permanente a 207 iscritti ed è andata in timeout. Da quel momento
  diversi codici non aprivano (es. Salvatore Fones); 1 member FAILED (Lorenzo Ulissi).
  Riparazione: `?recreate=<codice>` sui 207, codici invariati, ~6 chiamate ciascuno.
- Il log ingressi del 24/11 mostra 7 ingressi da member NON collegati: alcuni iscritti
  entrano dal duplicato. Una password presente sul cloud per il member collegato non
  garantisce che sia arrivata alla serratura → il job health **non cancella più i
  gemelli di iscritti attivi** (`orphansTwinsKept`), solo gli orfani di ex iscritti.
- Regola: prima di chiamare una route nuova, verificare che il deploy sia attivo (mai
  cicli di tentativi sulla route di resync: senza parametri fa una risync completa).
