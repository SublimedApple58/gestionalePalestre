# 001 — Personal Trainer: lista unica (gestionale → app iscritti + sito hom2)

**Stato:** design e rilascio approvati da Tiziano il 22/10/2026.

## Cosa è stato fatto
- **DB:** modello `PersonalTrainer` + migrazione `20261023090000_personal_trainers` (solo tabella nuova).
- **Admin web (solo ADMIN):** pagina `/trainer`, voce "Personal trainer" su una riga.
  - Elenco con frecce su/giù, interruttore visibile, drawer crea/modifica/elimina.
  - Foto caricata direttamente su R2 (`trainers/<uuid>/…`, controllo magic bytes al salvataggio).
- **API pubblica:**
  - `GET /api/public/trainers`: CORS solo houseofmuscle.it e www, cache CDN 5 min.
  - `GET /api/public/trainers/:id/photo?v=`: foto da R2, cache immutabile, solo trainer visibili.
- **Sito hom2:** legge l'API e tiene la lista fissa come riserva. HTML verificato identico; 0 trainer → sezione e voce di menu nascoste.
- **App iscritti:** carosello in Home e schermata `trainers/[id]` (foto, nome, bio, CTA WhatsApp fissa). Solo moduli già installati → OTA.
- **Caricamento iniziale:** `packages/db/scripts/seed-personal-trainers.mjs`.

**Modifiche concordate durante lo sviluppo**
- Bio: oltre a `**grassetto**` anche `==testo==` (rosso), per mantenere identico il "Niente schede standard:" di Alessandro.
- Storico modifiche: `UserAuditLog` è legato agli utenti, quindi sul trainer si salva `updatedById` (ultimo admin che l'ha modificato) invece di una voce nello storico admin.

**Decisioni di Tiziano**
- Lista UNICA nel gestionale: la usano sia l'app iscritti sia il sito hom2, che oggi ha una lista fissa.
- Niente pacchetti né prenotazioni: per ogni trainer foto, nome, bio, WhatsApp, ordine, visibile sì/no.
- Gestione solo per ADMIN (la reception).
- Sito: se l'API è giù si mostra la lista attuale come copia di riserva.

## 1. Database
- `PersonalTrainer`: id, firstName, lastName, bio (testo con a capo e `**grassetto**`), whatsappNumber (solo cifre, cellulare italiano validato), photoStorageKey?, sortOrder, isVisible, createdAt, updatedAt.
- Il link `https://wa.me/39<numero>` lo costruisce il server.
- Migrazione additiva: solo una tabella nuova.

## 2. Gestione per la reception (web, solo ADMIN)
- Pagina `/trainer` nel menu ADMIN.
- Elenco ordinato con frecce su/giù, interruttore "visibile", pannello laterale crea/modifica con anteprima bio e "prova link", eliminazione con conferma.
- Foto: caricamento diretto su R2 + conferma, come documenti e avatar. JPG/PNG/WEBP fino a 5 MB, mostrata 4:5.
- Ogni modifica va nello storico admin.

## 3. App iscritti (gestionale-mobile)
- Home: sezione "I nostri Personal Trainer", carosello orizzontale di schede verticali.
- Schermata dettaglio: foto a tutto schermo che si restringe scorrendo, nome con barretta rossa, bio completa, pulsante WhatsApp fisso in basso.
- Nessun modulo nativo nuovo → aggiornamento OTA. Se non ci sono trainer visibili la sezione non compare.

## 4. Sito hom2
- `GET https://app.houseofmuscle.it/api/public/trainers`: solo i trainer visibili e solo i campi pubblici.
  - Richieste ammesse da houseofmuscle.it e www.
  - Cache CDN `s-maxage=300, stale-while-revalidate`.
- Foto: `GET /api/public/trainers/:id/photo?v=<updatedAt>`, letta da R2 lato server con cache lunga. La usa anche l'app.
- Il sito mostra subito la copia di riserva e la sostituisce appena l'API risponde (attesa massima 4s). Se l'API restituisce 0 trainer, la sezione e la voce di menu si nascondono.

## 5. Caricamento iniziale
- Script una tantum in `packages/db/scripts/`, prima in prova poi con `--apply`.
- Carica su R2 le 4 foto già ritagliate (`hom2/public/trainers/*.jpg`) e crea Simone, Valentina, Alessandro, Jacopo con i testi approvati.
- Rilanciabile senza effetti: salta i trainer che esistono già.

## 6. Ordine di rilascio
1. Migrazione su prod.
2. Deploy del gestionale web, poi verifica dell'endpoint lato server e da browser su houseofmuscle.it.
3. Caricamento iniziale (prova, poi `--apply`).
4. Deploy del sito hom2.
5. OTA dell'app: prima iOS, poi Android.
