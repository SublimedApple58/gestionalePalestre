# Gestionale Palestre Monorepo

Starter monorepo con:
- Next.js (app web)
- Prisma ORM
- Neon Postgres
- Node.js + pnpm

## Struttura

- `apps/web`: applicazione Next.js
- `packages/db`: schema Prisma e client DB condiviso

## Prerequisiti

- Node.js >= 20
- pnpm >= 9
- Database Neon attivo

## Avvio locale

1. Copia le variabili ambiente:

```bash
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
```

Usa gli stessi valori in entrambi i file.

2. Installa dipendenze:

```bash
pnpm install
```

3. Genera client Prisma e crea tabelle:

```bash
pnpm db:generate
pnpm db:push
```

4. Avvia app:

```bash
pnpm dev
```

App disponibile su `http://localhost:3000`.

## Comandi utili

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm db:migrate
pnpm db:studio
```

## Deploy su Vercel

1. Importa il repository su Vercel.
2. Mantieni root del progetto sulla root della repo.
3. Imposta environment variables su Vercel:
   - `DATABASE_URL`
   - `DIRECT_URL`
4. Build command: `pnpm build`
5. Install command: `pnpm install`

Il client Prisma viene generato automaticamente in `postinstall`.
