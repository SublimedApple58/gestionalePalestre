# Certificato medico — scadenza visibile all'admin (web + mobile)

## Cosa è stato fatto (sintesi)
L'admin (web app e app mobile) può impostare/modificare la **data di scadenza del certificato medico** per ogni iscritto e vede in **home** gli iscritti con certificato **in scadenza (≤30 gg) o scaduto**. Nella sezione **Utenti** può filtrare per certificato **in scadenza / scaduto / senza scadenza**.

Decisioni prese con l'utente:
- **Modello dati = Opzione B**: si riusa il campo esistente `UserDocument.medicalCertificateExpiresAt` (già popolato dall'onboarding iscritto e dall'approvazione admin). **Nessuna migration**, nessun backfill, una sola fonte di verità.
- **Solo visibilità**: nessun blocco accessi. Il controllo `isMedicalCertificateExpired()` (stub, ritorna sempre `false`) resta **invariato**.
- Soglia home: **30 giorni** (≈ 1 mese). Filtri/soglia limitati agli **iscritti** (il certificato è un requisito loro).
- L'editor admin scrive sul documento certificato medico (unico per iscritto: `@@unique([userId, type, side])`). Se l'iscritto non ha un certificato caricato → non è possibile impostare la scadenza (messaggio esplicito).

## File toccati

### Web / backend (`gestionale`)
- `apps/web/src/lib/medical-certificate.ts` — **nuovo**: `MEDICAL_CERT_EXPIRY_THRESHOLD_DAYS=30`, `getMedicalCertificateExpiry`, `medicalCertificateStatus`.
- `apps/web/src/components/dashboard/certificate-expiring-section.tsx` — **nuovo**: widget home (clone di `association-expiring-section`).
- `apps/web/src/app/dashboard/page.tsx` — query certificati APPROVED in scadenza (≤30 gg / scaduti, solo SUBSCRIBER) → prop `expiringCertificates`.
- `apps/web/src/components/dashboard/admin-dashboard.tsx` — prop + render del widget.
- `apps/web/src/app/actions/dashboard-actions.ts` — `updateMedicalCertificateExpiryActionState` (scrive sul documento; niente audit log per evitare migration enum).
- `apps/web/src/components/dashboard/user-edit-drawer.tsx` — sezione "Certificato medico" (solo SUBSCRIBER) con calendario + badge stato.
- `apps/web/src/components/dashboard/user-management.tsx` — filtro "Certificato" (tutti / in scadenza / scaduto / senza scadenza), client-side.

### Backend mobile (`gestionale`, API consumate dall'app)
- `apps/web/src/lib/validators/mobile.ts` — `certificate` in `mobileAdminUsersQuerySchema` + `mobileAdminMedicalCertExpirySchema`.
- `apps/web/src/app/api/mobile/admin/users/route.ts` — filtro `certificate` (soon/expired/missing) via relation filter sui documenti.
- `apps/web/src/app/api/mobile/admin/users/[id]/medical-certificate-expiry/route.ts` — **nuovo** POST.
- `apps/web/src/app/api/mobile/admin/certificates/expiring/route.ts` — **nuovo** GET (lista home).

### App mobile (`gestionale-mobile`)
- `src/services/api.ts` — tipi `AdminExpiringCertificate(s)…`.
- `src/services/admin.ts` — `certificate` in `fetchUsers`, `fetchExpiringCertificates`, `updateMedicalCertificateExpiry`, tipo `UsersCertificateFilter`.
- `src/hooks/useAdminExpiringCertificates.ts` — **nuovo**.
- `src/hooks/useAdminUsers.ts` — `certificate` nei filtri.
- `app/(admin)/home.tsx` — sezione "Certificati in scadenza".
- `app/(admin)/users/index.tsx` — filtro certificato (tag + action sheet).
- `app/(admin)/users/[id].tsx` — editor scadenza (EditFieldSheet) nel dettaglio iscritto.

## Deploy
- **Nessuna migration.** Push web → Vercel. OTA mobile: `eas update --branch production --platform ios` poi `--platform android`.

## Possibili estensioni future (non in scope)
- Attivare il blocco accessi (`isMedicalCertificateExpired`) se in futuro serve.
- Reminder email/push all'iscritto in prossimità della scadenza (modellabile su `birthday-reminders`).
- Audit log dedicato per la modifica manuale della scadenza (richiede un valore enum `AuditAction` → mini-migration).
