# 001 — Anagrafica modificabile dall'admin + scadenza certificato in un gesto

**Fatto (27/10/2026, approvato da Tiziano, richieste di Alessia):**
- Scheda iscritto `/utenti` → sezione "Anagrafica": lettura compatta, "Modifica" sul posto
  (nome, cognome, email, telefono, data di nascita, codice fiscale, indirizzo). Solo ADMIN.
- Audit `PROFILE_UPDATED` (migrazione `20261027090000_audit_profile_updated`) con before/after dei soli campi cambiati.
- Dashboard admin, riquadro "certificati da controllare": campo Scadenza accanto a
  "Segna come controllato" (stesso comportamento del mobile: vuoto = scadenza invariata).

## Decisioni
- Email = login: unicità case-insensitive; si salva come scritta (il login è case-sensitive, come oggi).
  Sessioni web/mobile restano valide (identificano l'utente per id).
- Codice fiscale: solo dalla tessera sanitaria (`UserDocument.extractedTaxCode` dei TAX_CODE);
  senza tessera il campo è disabilitato. Nessuna colonna nuova (scelta confermata).
- Data di nascita a mezzanotte UTC (come l'estrazione AI e il job compleanni).
- Tuya: rinomina best-effort del member (`PUT /v1.0/devices/{id}/users/{uid}`) se cambia nome/cognome;
  il PIN non dipende dal nome, un errore dà solo un avviso.

## Rischi noti
- Email cliente Revolut resta la vecchia (ricevute).
- Un nuovo OCR della carta d'identità può sovrascrivere la data di nascita inserita a mano.
- Rinomina Tuya non provata in locale (credenziali locali scadute).
