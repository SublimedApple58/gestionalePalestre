# Piano: Controllo accessi LOCALE, senza cloud Tuya

**Stato:** APPROVATO — Fase 0 (preparazione) IMPLEMENTATA sul branch `feat/local-access-control`. Restano Fasi 1–4 (on-site).
**Vincoli operativi:** (1) NON disattivare/modificare nulla in produzione finché non si valida (cron `tuya-pin-sync` lasciato attivo); (2) tutte le modifiche su branch `feat/local-access-control`, merge solo dopo verifica on-site.

## Cosa è stato fatto (Fase 0)
**Backend (`apps/web`):**
- `src/lib/access/authorization.ts` — `shouldHaveAccess()` + `getActiveAccessCodes()` (regola unica, solo abbonamento).
- `src/app/api/internal/access-codes/route.ts` — GET codici attivi (auth `x-cron-secret`).
- `src/app/api/internal/access-events/route.ts` — POST log sblocco → `recordKeypadUnlock`.
- `src/lib/services/access-event-service.ts` — aggiunta `recordKeypadUnlock` (mappa codice→utente, gestisce codici duplicati).
- Refactor: `tuya-pin-service.ts` e `tuya-pin-migration` ora usano `shouldHaveAccess` (comportamento invariato).
- DB: enum `AccessEventType.KEYPAD_UNLOCK` + indice `User(accessCode)`; migration `20260622100000_add_keypad_unlock_and_accesscode_index` (da applicare con `pnpm migrate:prod` / `db:migrate`).

**Servizio locale (`reglo-access/`):** `service.py`, `keypad.py`, `be_client.py`, `open.py`, `spike/01..05`, `install-service.bat`/`uninstall-service.bat` (NSSM/Windows), `config.example.env`, `README.md`, `ONSITE-CHECKLIST.md`.
- Pronto/collaudabile: connessione, apertura relè, ascolto eventi.
- DA FINALIZZARE on-site (gate): provisioning codici in locale (`keypad.add/list/remove_code`) dopo lo spike `05`.
**Obiettivo:** togliere del tutto la dipendenza dal cloud Tuya (quota, costi post-dicembre, bug notturno) riciclando tastierino + relè + serratura già installati. Il PC sempre acceso in palestra fa da controller locale.

## Perché questa strada
- Cloud Tuya = dopo il 14/12/2026 solo edizioni da 25.000$+ → fuori discussione.
- Bug notturno = i codici "online" non si validano la notte. I codici **locali** (come quelli dell'app) si validano sempre.
- Controllo locale via LAN = zero cloud, zero quota, validazione locale → niente bug notturno.

## Architettura
PC palestra (servizio Python + `tinytuya`) ⟷ tastierino sulla stessa LAN.
- Il nostro BE resta la verità (abbonamento attivo → codice valido).
- Il PC sincronizza i codici attivi **sul tastierino in locale**.
- Il tastierino valida da solo e apre il relè → funziona anche offline/di notte.
- Il PC legge gli sblocchi e li manda al BE per lo storico.

## Connettività PC ⟷ tastierino (come si parlano)
- **Nessun collegamento fisico** tra PC e tastierino. Comunicazione **solo via rete locale**.
- Il tastierino è **WiFi**, già connesso al WiFi palestra. Il PC gli parla in **locale** via **TCP porta 6668**, protocollo locale Tuya, cifratura AES con la **local key** del device (`tinytuya`).
- Connessione **persistente** (heartbeat ~25s) → eventi di sblocco istantanei, e invio comando "apri relè" sulla stessa connessione.
- L'unico cablaggio fisico è quello esistente: tastierino → relè → serratura. Non si tocca.

**Requisiti di rete:**
1. PC e tastierino sulla **stessa LAN/subnet** (PC meglio in Ethernet al router; va bene anche WiFi).
2. **IP fisso** per il tastierino (DHCP reservation sul router).
3. **No AP/Client Isolation** sul WiFi (i due dispositivi devono vedersi).
4. Firewall PC: permettere TCP locale verso il tastierino.
5. Il tastierino **resta accoppiato al WiFi** (non si resetta).

**Opzione di riserva hardware (Wiegand):** il tastierino ha probabilmente un'uscita **Wiegand** (nata per inviare il codice letto a un controller esterno). Realizzerebbe alla lettera "il tastierino manda il codice a noi", ma richiede una scheda Wiegand collegata al PC. Tenuta come piano C, non prima scelta.

---

### Fase 0 — Raccolta dati (no codice)
- Recuperare la **local key** del device (piattaforma Tuya / wizard `tinytuya`) — non consuma quota.
- **IP fisso** del tastierino (DHCP reservation sul router palestra).
- Verifica PC: sempre acceso, sulla stessa LAN del tastierino, può girare un servizio Python.
- **Disattivare gli aggiornamenti firmware** del device (per non perdere l'accesso locale).
- Blocco: serve accesso al router e alla piattaforma Tuya.

### Fase 1 — SPIKE DI FATTIBILITÀ (gate che decide tutto)
Dal PC, in locale:
1. connettersi e leggere lo stato. 
2. aprire il relè (DP 40). 
3. ricevere l'evento quando si digita un codice. 
4. **scrivere un codice nuovo in locale e verificare che apra ANCHE DI NOTTE.** ← il punto critico.
- Se 1–4 passano → si procede.
- Se 4 fallisce → piano B: controller proprio cablato sul relè (si ricicla relè+serratura, si pensiona il "cervello" del tastierino).

### Fase 2 — Servizio locale sul PC
- Connessione TCP persistente, riconnessione automatica, watchdog, log locale.
- Funzioni: scrivi codice, cancella codice, apri, leggi eventi.

### Fase 3 — Sync BE ⟷ PC
- Endpoint BE: lista codici attivi (abbonamento valido).
- Il servizio allinea la tabella del device ai soci attivi (a evento + riconciliazione periodica).
- Eventi di sblocco → storico nel BE.

### Fase 4 — Migrazione e dismissione cloud
- Ri-provisioning di tutti i codici come **locali**.
- Spegnere il cron `tuya-pin-sync` (apps/web/vercel.json).
- Verifica notturna su tutti i codici.
- Cloud Tuya fuori dal percorso critico.

---

## Rischi onesti
- **Fase 1 punto 4 (scrittura codice locale)** = rischio principale. Leggere/aprire è collaudato, scrivere meno.
- Il controllo locale è **reverse-engineering della comunità**, non ufficiale Tuya → un firmware update può romperlo (mitigato: update off).
- Il PC è single point of failure → prevedere fallback apertura (es. apertura manuale/da remoto d'emergenza).

## Intanto (subito, gratis)
- Disattivare/diradare il cron `tuya-pin-sync` per non ribruciare quota quando si rinnova.
