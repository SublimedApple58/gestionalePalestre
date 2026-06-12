# Foto esercizio (catalogo schede) — Backend/Web

**Stato:** implementato 2026-06-12. Full-stack (vedi anche `gestionale-mobile/plans/workouts/001-exercise-photos.md`).

## Cosa è stato fatto (backend `apps/web` + `packages/db`)

Admin e istruttori possono associare una foto dimostrativa a un esercizio del
catalogo. Pipeline upload identica all'avatar (presign R2 → PUT diretto → confirm).

### DB
- `Exercise.photoStorageKey String?` (nullable, retro-compatibile).
- Migration `packages/db/prisma/migrations/20260612120000_add_exercise_photo_storage_key/` — `ALTER TABLE "Exercise" ADD COLUMN "photoStorageKey" TEXT`. **Da applicare in prod con `pnpm migrate:prod`.**

### Storage
- `buildExercisePhotoStorageKey(exerciseId, fileName)` in `document-storage-service.ts` → key `exercises/{exerciseId}/photo/{ts}-{file}` (esercizio-scoped, non user-scoped). Riusa `createDocumentUploadUrl` / `createDocumentDownloadUrl`.

### Validators (`lib/validators/mobile.ts`)
- `mobileExercisePhotoUploadUrlSchema`, `mobileExercisePhotoConfirmSchema` — solo immagini (`jpeg/jpg/png/webp`), max 8 MB.

### Service (`workout-template-service.ts`)
- `listExerciseCatalog` ora seleziona/ritorna `photoStorageKey`.
- `setExercisePhoto(prisma, exerciseId, storageKey)` (404 se non esiste), `clearExercisePhoto`.

### Route (`api/mobile/workouts/exercises`)
- `GET` catalog: mappa `photoStorageKey → photoUrl` (presigned GET, TTL 24h), `photoStorageKey` non esposto.
- `POST [id]/photo/upload-url` (ADMIN+INSTRUCTOR): presign PUT → `{uploadUrl, storageKey, expiresInSeconds}`.
- `POST [id]/photo/confirm` (ADMIN+INSTRUCTOR): valida `storageKey` prefix `exercises/{id}/photo/`, `setExercisePhoto`, ritorna `{photoUrl}`.
- `DELETE [id]/photo` (ADMIN+INSTRUCTOR): `clearExercisePhoto`, 204 idempotente.

### Note
- Nessuna review/AI (a differenza dei documenti iscritto): foto auto-valida.
- L'oggetto R2 resta dopo DELETE (lifecycle policy del bucket).
- CORS bucket R2 non rilevante per il mobile (RN ignora il CORS); il PUT è server-presigned.
