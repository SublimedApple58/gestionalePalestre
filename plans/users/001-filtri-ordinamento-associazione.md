# Filtri sezione Utenti: ordinamento + iscrizione associazione

> **Cosa è stato fatto (riassunto):** aggiunti, lato admin sia su web app che mobile,
> due controlli alla lista Utenti: (1) **ordinamento** alfabetico oppure per data di
> iscrizione (`createdAt`); (2) **filtro per iscrizione all'associazione sportiva**
> (Tutti / Iscritti / Non iscritti), basato sui campi già esistenti
> `User.associationMember` / `associationExpiresAt`. Nessuna migrazione DB.

## Contesto

Richiesta urgente: rendere più utili i filtri della sezione Utenti su entrambe le
piattaforme. La feature "associazione sportiva" esisteva già (checkbox "Iscritto ad
associazione" + scadenza nel drawer utente web, campi `associationMember` /
`associationExpiresAt` su `User`, helper `lib/association.ts`). Qui si è solo
**aggiunto il filtro/ordinamento** sopra dati esistenti.

## Decisioni architetturali

- **Web** (`apps/web`): la pagina `/utenti` carica TUTTI gli utenti (nessuna
  paginazione) → filtri/ordinamento **client-side** in `user-management.tsx`,
  coerente con la ricerca già presente lì. `createdAt` è già nei dati del
  `findMany` (usa `include`, quindi tutti gli scalari sono restituiti).
- **Mobile** (`gestionale-mobile`): la lista è **paginata cursor-based**, quindi
  filtrare/ordinare client-side colpirebbe solo la pagina caricata → ordinamento e
  filtro associazione fatti **server-side** sull'API `/api/mobile/admin/users`.
  Il filtro abbonamento resta client-side (com'era, limitazione pre-esistente).

## Fasi

### Fase 1 – Backend / API mobile (`apps/web`)
- `src/lib/validators/mobile.ts`: aggiunti a `mobileAdminUsersQuerySchema` i param
  `sort` (`"alpha" | "registration"`) e `association` (`"all" | "member" | "non_member"`).
- `src/app/api/mobile/admin/users/route.ts`: GET legge `sort` + `association`;
  `where.associationMember` per il filtro; `orderBy` = `[{createdAt:desc},{id:asc}]`
  se `sort=registration`, altrimenti `[{firstName},{lastName},{id}]`. Cursor (solo
  `id`) resta consistente perché l'orderBy termina sempre con `id` come tie-breaker.

### Fase 2 – Web UI (`apps/web`)
- `src/components/dashboard/user-management.tsx`: `UserRow` ora include `createdAt`;
  stati `sortMode` + `associationFilter`; `filteredUsers` applica filtro associazione
  + ricerca + ordinamento; toolbar `.utenti-filters` con due segmented control.
- `src/app/globals.css`: stili `.utenti-filters`, `.seg`, `.seg-btn` (responsive).

### Fase 3 – Mobile UI (`gestionale-mobile`)
- `src/services/admin.ts`: `fetchUsers` accetta `sort` + `association`; tipi esportati
  `UsersSort`, `UsersAssociationFilter`.
- `src/hooks/useAdminUsers.ts`: `Filters` include sort/association + refetch on change.
- `app/(admin)/users/index.tsx`: stati + due ActionSheet (Ordina / Associazione) +
  pulsanti filtro; rimosso il sort alfabetico client-side (ora lo decide il server).

## Verifica
- `pnpm -C apps/web typecheck` → OK (exit 0).
- `pnpm -C apps/web lint` → solo errori pre-esistenti, nessuno nuovo nei file toccati.
- Mobile `typecheck` → errori solo pre-esistenti in `src/lib/db/*` e
  `src/screens/workouts/*`; **zero** nei file toccati. OTA bundla JS, non blocca.

## Rilascio
- Web: merge `feat/users-filters` → `master`, push → Vercel deploy.
- Mobile: commit su `master`, `eas update` iOS poi Android (OTA, solo JS).

## Note / possibili estensioni future
- "Data di iscrizione" è interpretata come `User.createdAt` (registrazione utente).
- Su mobile il filtro abbonamento resta client-side (pre-esistente): in futuro andrebbe
  portato server-side come associazione/sort per correttezza con la paginazione.
- Possibile aggiungere in lista un badge stato associazione (valido/scade/scaduto) via
  `associationStatus()` — non richiesto ora.
