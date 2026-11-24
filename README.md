# Gestionale Palestre Monorepo

Gestionale palestra role-based con:
- `admin`
- `istruttore`
- `iscritto`

Stack:
- Next.js App Router (`apps/web`)
- Prisma ORM (`packages/db`)
- Postgres (Neon compatibile)
- Auth.js (credentials)
- Test: Vitest + Playwright

## Funzionalita MVP

### Admin
- login dedicato
- codice ingresso personale (nascosto con asterischi + blur + toggle occhio)
- CTA mock `Apri porta palestra`
- lista utenti completa
- creazione utente (email/password/ruolo)
- modifica ruolo utente
- rimozione utente con protezione ultimo admin
- assegnazione piano abbonamento (Mensile/Trimestrale/Annuale)
- assegnazione istruttore a un iscritto (1:1 lato iscritto)
- storico ingressi mock
- stato documenti in lista utenti (codice fiscale, documento identita', certificato medico)
- revisione documenti in coda con approvazione/rifiuto/richiesta nuovo upload
- preview documento via URL firmata temporanea (se storage configurato)

### Istruttore
- codice ingresso personale con toggle occhio
- lista allievi assegnati
- piano allenamento settimanale semplice (lun-dom)
- simulazione ingresso mock
- panoramica informazioni personali (nome, email, cellulare, ruolo, documenti, abbonamento)
- upload documenti reali dal proprio account (CF/ID fronte-retro, certificato medico, foto profilo)

### Iscritto
- stato abbonamento (attivo/non attivo)
- tipo piano e data scadenza
- piano allenamento settimanale semplice (lun-dom)
- codice ingresso visibile solo se abbonamento attivo e documenti obbligatori approvati
- simulazione ingresso mock solo se attivo e documenti obbligatori approvati
- panoramica informazioni personali (nome, email, cellulare, ruolo, documenti, abbonamento)
- upload documenti reali dal proprio account:
  - codice fiscale fronte/retro
  - documento identita' fronte/retro
  - certificato medico (con scadenza manuale, sempre revisione admin)
  - foto profilo facoltativa
- estrazione AI automatica di codice fiscale e numero documento di identita'

## Struttura
- `apps/web`: frontend + server actions + auth
- `packages/db`: schema Prisma, migrazioni e seed

## Prerequisiti
- Node.js >= 20
- pnpm >= 9
- Database Postgres disponibile

## Configurazione ambiente

1. Copia variabili ambiente:

```bash
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
```

2. Compila entrambe con gli stessi valori DB:
- `DATABASE_URL`
- `DIRECT_URL`

3. Imposta anche:
- `AUTH_SECRET`
- `AUTH_URL` (es. `http://localhost:3000`)
- `OPENAI_API_KEY`
- `OPENAI_DOCS_MODEL` (default `gpt-4.1-mini`)
- `DOC_AI_MIN_CONFIDENCE` (default `0.85`)
- `DOC_AI_MAX_RETRIES` (default `3`)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`
- `CRON_SECRET`
- opzionale seed admin:
  - `SEED_ADMIN_EMAIL` (default `umberto.giancola00@gmail.com`)
  - `SEED_ADMIN_PASSWORD` (default `Castiglione1!`)

4. Per test backend/frontend e2e usa DB separato:
- `DATABASE_URL_TEST`
- `DIRECT_URL_TEST`

## Avvio locale

```bash
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

App disponibile su `http://localhost:3000`.

## Credenziali seed

- Admin:
  - email: `umberto.giancola00@gmail.com`
  - password: `Castiglione1!`
- Utenti demo:
  - `istruttore@example.com` / `Password123!`
  - `abbonato.attivo@example.com` / `Password123!`
  - `abbonato.nonattivo@example.com` / `Password123!`
  - `iscritto.docsmancanti@example.com` / `Password123!`

## Comandi utili

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm db:migrate
pnpm db:seed
pnpm db:studio
pnpm test:unit
pnpm test:e2e:be
pnpm test:e2e:fe
pnpm test:ci
```

## Note test

- `test:unit` gira sempre localmente.
- `test:e2e:be` e `test:e2e:fe` usano `DATABASE_URL_TEST`/`DIRECT_URL_TEST`.
- Se le variabili test DB non sono configurate, gli e2e vengono saltati.

## Serratura Tuya — "codice OK di giorno, KO la sera"

Causa: il member Tuya non ha la validità **permanente consegnata alla serratura**.
`setUserPermanent` risponde `true` appena il cloud accetta, ma la consegna al
device può restare `ONGOING`/`FAILED` (il cloud dice `permanent: true`, la
serratura tiene la vecchia finestra limitata). Storia e dettagli:
`plans/access-control/004-codice-ko-sera-delivery-failed.md`.

### Regola: operazioni manuali sulla serratura

Ogni chiamata Tuya, **lettura compresa**, consuma la quota del piano gratuito
(26.000/mese). Dopo l'incidente del 24/11/2026 (risync completa partita per errore:
~1.000 chiamate, 207 PIN riscritti, iscritti chiusi fuori) valgono queste regole,
imposte dal codice:

- **Letture** solo da `/api/internal/tuya-diag/run`: il client Tuya lì è in sola
  lettura (rifiuta ogni metodo ≠ GET) e un test fa fallire la build se la route
  importa una funzione che scrive.
- **Scritture** solo da `/api/internal/tuya-pin-resync/run`. `?mode=` obbligatorio
  da una lista chiusa: mode o parametri sconosciuti → **400, nessuna azione**.
  Di default è un **dry-run** (chi tocca, quante chiamate); scrive solo con `&apply=1`.
- Ogni invocazione ha un **budget di chiamate** imposto dal client (si ferma da solo)
  e passa da un **lock** condiviso con i cron notturni (409 se occupato).
- Prima di ogni operazione dire quante chiamate costa. Mai cicli di tentativi su una
  route, mai chiamare una route nuova prima che il deploy sia attivo.
- Raffiche di scritture saturano la serratura (`2328 operation in progress`): una
  `recreate` che fallisce dopo la delete lascia l'iscritto senza codice. Per scritture
  in serie: **almeno 60 s tra una e l'altra**, stop al primo errore, e per riparare un
  PIN preferire `mode=pin` (non cancella nulla) a `mode=recreate`. Il 24/11 con 30 s
  la serratura si è saturata dopo ~50 scritture.

Header: `Authorization: Bearer $CRON_SECRET`. Costi indicativi, token compreso:

| Route + query | Effetto | Chiamate |
|---------------|---------|----------|
| `tuya-diag?mode=schedulescan` | Stato consegna validità di tutti i member + member extra. **Primo passo** di ogni segnalazione. | 2 |
| `tuya-diag?mode=schedule&code=<codice>` | `delivery_status` del member (deve essere `SUCCESS`). | 2 |
| `tuya-diag?mode=keys&code=<codice>` | Chiavi del member (password presente?). | 2 |
| `tuya-diag?mode=member&id=<tuyaUserId>` | Chi è un member del device (es. `unmatchedUserIds` del log ingressi). | 2 |
| `tuya-pin-resync?mode=permanent&code=<codice>[&apply=1]` | Ri-invia il permanente. Se resta `FAILED` → `recreate`. | ~2 |
| `tuya-pin-resync?mode=pin&code=<codice>[&apply=1]` | Riscrive PIN + permanente sul member attuale. | ~5 |
| `tuya-pin-resync?mode=recreate&code=<codice>[&newcode=1][&apply=1]` | Cancella e ricrea il member; con `newcode=1` codice nuovo (il vecchio smette di aprire). | ~6 |
| `tuya-pin-resync?mode=full&confirm=<AAAA-MM-GG>&budget=N[&from=<id>][&apply=1]` | Risync completa, **solo recupero** (serratura che ha perso i codici). Richiede la data di oggi, budget esplicito e un dry-run identico negli ultimi 15 min; va a blocchi e restituisce `nextFrom`. | ~5 × iscritto |

Verifica dopo una riparazione: dopo ~20 s `mode=schedule` deve dare `SUCCESS` e
`mode=keys` una chiave `password`.

In automatico ci pensa il cron notturno `tuya-pin-health` (04:30 UTC). Con 1 scansione
ricrea i member con validità FAILED/ONGOING vecchia (max 10 a notte) e cancella i member
orfani di **ex iscritti** con PIN ancora valido (max 40 a notte). I duplicati di iscritti
attivi non si toccano (alcuni entrano proprio da lì). Nel log: `tuyaCalls`,
`stuckRecreated`, `orphansDeleted`, `orphansRemaining`.
