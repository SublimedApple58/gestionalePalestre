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
