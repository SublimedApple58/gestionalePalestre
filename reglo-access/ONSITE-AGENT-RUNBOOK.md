# RUNBOOK ON-SITE — guida per l'AGENTE che assiste l'utente in palestra

> **A chi è rivolto questo file:** all'agente Claude che verrà avviato sul posto
> (o in chiamata con l'utente) per installare il controllo accessi locale.
> **L'utente NON è tecnico.** Tu (agente) leggi questo file, poi guidi l'utente
> un passo alla volta: digli ESATTAMENTE cosa scrivere, cosa premere, cosa
> osservare al tastierino. Non dare per scontato nulla. Fai una cosa alla volta
> e aspetta la conferma prima di procedere.

---

## 0. Contesto in 60 secondi (perché siamo qui)

- La palestra è **h24**. L'accesso è un **tastierino Tuya WiFi F22-WRB1** (categoria `mk`,
  device ID **`bf38d4d722d26342b0x6vp`**): chi ha l'abbonamento attivo digita un PIN → apre.
- **Bug storico:** i PIN creati dal nostro backend via **cloud Tuya** sono di tipo
  "online" → di notte (~20:00–08:00) il cloud del device degrada e il tastierino li
  rifiuta. I codici creati **dall'app Tuya** sono "offline/locali" e funzionano 24/7.
- **Quota cloud Tuya esaurita** + costi enterprise assurdi → decisione approvata:
  **uscire dal cloud, controllo accessi 100% locale.**
- **La soluzione:** un PC sempre acceso in palestra, sulla stessa LAN del tastierino,
  gli parla **in locale** (TCP 6668, `tinytuya`, con la *local key*). Il PC sincronizza
  i codici degli abbonati attivi sul tastierino e logga gli sblocchi sul backend.
- **Il backend è già pronto** (endpoint + test). **Manca SOLO la validazione fisica
  on-site** = questo runbook.

### IL GATE (il punto che decide tutto)
La scommessa non ancora verificata: **scrivere un codice in locale che il tastierino
validi ANCHE DI NOTTE.** Tutto il lavoro on-site converge su questa prova (spike 05).
- ✅ GATE superato → la soluzione locale è confermata, si installa il servizio.
- ❌ GATE fallito → **Piano B**: piccolo controller cablato sul relè esistente
  (richiede un elettricista). Non improvvisare: vedi §7.

### Regole di comportamento per te (agente)
1. **Non toccare la produzione** (DB, Vercel, cron) senza conferma esplicita. Qui si
   lavora solo sul PC locale e sul tastierino.
2. Le scritture sul tastierino in §5 (spike 05) **modificano un dispositivo di
   sicurezza condiviso.** Spiega cosa stai per fare e chiedi conferma prima di scrivere.
3. Usa **sempre un codice di TEST** (es. `778899`) per le prove, mai un codice reale di un socio.
4. Procedi **uno spike alla volta**. Dopo ognuno, fatti dire cosa è successo al tastierino.

---

## 1. Prerequisiti (verifica con l'utente PRIMA di iniziare)

Chiedi all'utente e spunta:

- [ ] **Local key** del tastierino. Si prende dalla piattaforma Tuya:
      `iot.tuya.com` → Cloud → Devices → device `bf38d4d722d26342b0x6vp` → campo **Local Key**.
      (Se non ce l'ha: in alternativa on-site `py -3 -m tinytuya wizard`, ma richiede
      le credenziali del progetto cloud "House of Muscle".)
- [ ] **CRON_SECRET** del backend (env Vercel del progetto) e **BE_BASE_URL**
      (di norma `https://app.houseofmuscle.it`).
- [ ] Accesso al **router** della palestra (per IP fisso + isolamento WiFi).
- [ ] L'**app Tuya Smart** sul telefono dell'utente, loggata sull'account che possiede il tastierino.
- [ ] Il **PC della reception**: sempre acceso, Windows, sulla **stessa rete** del tastierino.
- [ ] La cartella **`reglo-access`** copiata sul PC (chiavetta o `git clone` del repo,
      branch `feat/local-access-control`).

Se manca la local key o il CRON_SECRET, **fermati**: senza quelli non si va avanti.

---

## 2. Rete (sul router) — guida l'utente click per click

Obiettivo: PC e tastierino devono potersi "vedere" sulla stessa rete, e il tastierino
deve avere un IP che non cambia.

1. **IP fisso al tastierino:** nel router, sezione DHCP / "Dispositivi" / "LAN" →
   trova il tastierino (nome tipo "wifi access" o per MAC) → **assegna IP statico /
   DHCP reservation**. Annota l'IP.
2. **Disattiva "AP Isolation" / "Client Isolation"** sul WiFi (a volte chiamato
   "Isolamento AP", "Isola dispositivi", "Guest isolation"). Se è attivo, PC e
   tastierino non si vedono e nulla funziona.
3. **Collega il PC alla stessa rete** del tastierino (meglio cavo Ethernet al router;
   anche WiFi va bene purché stessa rete e niente isolamento).

> Se il router è complicato e l'utente è in difficoltà, fatti leggere marca/modello
> del router e dagli istruzioni specifiche per quel modello.

---

## 3. Setup del PC (Windows) — comandi esatti da far digitare

1. **Python**: se non installato → scaricare da python.org, in installazione
   **spuntare "Add Python to PATH"**. Verifica:
   ```
   py -3 --version
   ```
   (deve stampare una versione 3.x; se "comando non riconosciuto" → Python non nel PATH).
2. Apri il **Prompt dei comandi** nella cartella `reglo-access`
   (in Esplora risorse, barra indirizzi → scrivi `cmd` → Invio).
3. Installa le dipendenze e crea il file di config:
   ```
   py -3 -m pip install -r requirements.txt
   copy config.example.env .env
   ```
4. Apri **`.env`** col Blocco note (`notepad .env`) e compila:
   - `LOCAL_KEY=` → la local key del passo §1
   - `DEVICE_IP=` → l'IP fisso assegnato al passo §2 (lo confermerai con `01_scan.py`)
   - `BE_BASE_URL=` → es. `https://app.houseofmuscle.it` (senza slash finale)
   - `CRON_SECRET=` → il secret del backend
   - `DEVICE_ID` è già compilato; `PROTOCOL_VERSION` lasciala 3.3 per ora (la confermi dopo).
   Salva e chiudi.

---

## 4. Spike di validazione — esegui IN ORDINE, in `reglo-access\spike`

> Tutti gli spike salvano le scoperte in **`spike\findings.log`**. A fine sessione
> quel file è il deliverable: va riportato all'utente / incollato all'agente di
> follow-up per finalizzare `keypad.py`.
>
> Spostati nella cartella spike: `cd spike`

### 4.0 — Preflight
```
py -3 00_preflight.py
```
Verifica deps + `.env` + tastierino raggiungibile su :6668 + backend/CRON_SECRET.
- **Tutto `[OK]`** → procedi.
- **`[FAIL]` tastierino raggiungibile** → rete: stessa LAN? AP isolation disattivato?
  IP giusto in `.env`? (vedi §6 troubleshooting).
- **`[FAIL]` backend 401** → CRON_SECRET errato.
- Non salire alla scala / non procedere finché non è tutto verde.

### 4.1 — Scan rete
```
py -3 01_scan.py
```
Trova il tastierino sulla LAN e stampa **IP** e **versione protocollo**.
- Confronta il `devId` stampato con `bf38d4d722d26342b0x6vp`.
- Aggiorna in `.env`: `DEVICE_IP` (l'IP trovato) e `PROTOCOL_VERSION` (la versione trovata, es. 3.3/3.4/3.5).
- Se non trova nulla → problema di rete (§6).

### 4.2 — Dump datapoint
```
py -3 02_status.py
```
Stampa tutti i datapoint (DP) del device. Servono a capire quale DP è il relè, quali
riportano gli eventi, quali i codici. **Non serve che l'utente capisca l'output**: è
salvato in `findings.log`, lo interpreti tu.

### 4.3 — Apertura porta dal PC
```
py -3 03_open.py
```
Prova ad aprire il relè dal PC. Lo script prova vari DP candidati e dopo ognuno chiede
"La porta si è aperta?". **Chiedi all'utente di stare vicino alla porta** e dire se sente
lo scatto/apertura.
- Quando uno apre → annota `RELAY_DP` in `.env` (lo script lo scrive anche in findings.log).
- Se nessuno apre → rivedi il dump 02 con calma.

### 4.4 — Ascolto eventi
```
py -3 04_listen.py
```
Mentre gira, **chiedi all'utente di digitare al tastierino**: (1) un codice VALIDO già
esistente + invio, poi (2) un codice SBAGLIATO + invio. Osserva quali DP cambiano.
Questo definisce come riconoscere uno sblocco. `Ctrl+C` per uscire. Tutto in findings.log.

### 4.5 — ⭐ IL GATE: scrivere un codice in locale
```
py -3 05_write_code.py
```
Lo script chiede A o B. **Usa il MODO A (cattura & replica)** — è quello con più probabilità:

**MODO A, passo per passo (guida l'utente):**
1. Lo script legge lo stato e dice "VAI".
2. **Fai creare all'utente, DALL'APP Tuya sul telefono, un codice/password PERMANENTE
   di test** (es. `778899`) per il tastierino. (App → il device → Membri/Password →
   aggiungi password permanente.)
3. Lo script ascolta ~40s e **cattura il datapoint** che l'app ha generato. È il
   formato "vero" del create-password offline. Lo salva in findings.log.
4. Lo script propone di **riscrivere quello stesso payload in locale** (per un nuovo
   codice di test). Conferma e poi **fai provare il codice al tastierino**.
   - Apre → ottimo, di giorno funziona.
5. ⭐ **LA PROVA CHE CONTA:** lo stesso codice deve aprire **ANCHE DI NOTTE**
   (finestra ~20:00–08:00). Se l'utente è lì di giorno, lascia il codice scritto e
   **fagli rifare la prova in serata/notte** (anche da solo: "digita 778899 dopo le 21
   e dimmi se apre").

Se il MODO A non cattura nulla (l'app potrebbe passare solo dal cloud), prova il
**MODO B** (tentativi diretti sui DP). Meno probabile.

**Esito del GATE:**
- ✅ Apre anche di notte → **GATE SUPERATO**. Vai a §5.
- ❌ Non apre di notte (o non si riesce a scrivere in locale) → **Piano B**, §7.

---

## 5. Se il GATE è superato — finalizzazione

> Questa parte richiede una piccola modifica di codice in `keypad.py`. Falla tu
> (agente) basandoti sul payload catturato in `findings.log`. NON è lavoro per l'utente.

1. Apri `reglo-access\spike\findings.log`. Trova la riga `[05] PAYLOAD APP CATTURATO = ...`
   (e le righe `[05] CAMBIATO durante creazione app`). Quello è il formato del DP
   create-password.
2. Implementa in `reglo-access\keypad.py` le tre funzioni oggi stub:
   - `add_code(code, name)` → scrive sul device il DP create-password col formato catturato.
   - `remove_code(slot_or_code)` → il DP/azione di cancellazione (deducila dal formato;
     spesso un DP "delete" gemello, o lo stesso DP con flag diverso).
   - `list_codes()` → se il device espone un DP elenco; altrimenti mantieni una mappa
     locale `code→slot` persistente sul PC (file json) aggiornata a ogni add/remove.
3. Aggiorna `parse_unlock` / `_resolve_code` in `keypad.py`/`service.py` col formato
   evento osservato in 04 (così gli sblocchi reali si mappano all'utente giusto).
4. Verifica veloce a mano:
   ```
   py -3 -c "from keypad import Keypad; ..."   # add di un codice di test, poi prova al tastierino
   ```
5. **Installa il servizio Windows** (avvio automatico + restart su crash):
   - Serve **`nssm.exe`** nella cartella `reglo-access` (scaricare da nssm.cc).
   - Da prompt **come Amministratore**, nella cartella:
     ```
     install-service.bat
     ```
   - Verifica che parta e logghi in `reglo-access.log`.
6. **Test end-to-end:**
   - Sul gestionale, attiva/crea un abbonamento di test → entro `POLL_INTERVAL` (default
     300s) il codice deve comparire sul tastierino.
   - Sblocco reale al tastierino → l'evento deve comparire nello storico accessi (admin).

---

## 6. Troubleshooting (errori comuni on-site)

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| `01_scan.py` non trova device | PC e tastierino su reti diverse, AP isolation attivo, firewall | Stessa LAN; disattiva AP/Client Isolation; consenti Python nel firewall Windows |
| `00_preflight` FAIL su :6668 | IP errato in `.env`, isolamento, device WiFi caduto | Rilancia `01_scan.py`, aggiorna `DEVICE_IP`, controlla isolamento |
| Connessione cade / timeout | Versione protocollo sbagliata | Prova `PROTOCOL_VERSION` 3.3 → 3.4 → 3.5 in `.env` (la stampa 01_scan) |
| `03_open.py` nessun DP apre | RELAY_DP diverso dai candidati | Guarda il dump 02: cerca un DP booleano che cambia all'apertura manuale |
| backend 401 | CRON_SECRET errato | Riprendi il secret dalla env Vercel del backend |
| backend timeout/non risponde | URL errato o niente internet sul PC | Verifica `BE_BASE_URL` e che il PC abbia internet |
| MODO A non cattura nulla | L'app crea il codice solo via cloud, niente DP locale | Riprova; se persiste prova MODO B; se anche B fallisce → Piano B (§7) |

Errori/contesto Tuya più profondi: vedi la memoria `tuya-access-control.md` dell'agente
(distinzione online/offline, storia dei wipe, ecc.).

---

## 7. Piano B (se il GATE fallisce) — NON improvvisare

Se il tastierino **non valida** i codici scritti in locale (né MODO A né B, né di
giorno né di notte), la strada "scrivere codici sul tastierino esistente" è chiusa.
Allora:
- Si **ricicla il relè + serratura esistenti**, ma si **pensiona il "cervello" del
  tastierino**: si mette un piccolo controller nostro (es. микро-PC/ESP) cablato sul
  relè, comandato dal PC/BE.
- **Richiede un elettricista** (cablaggio sul relè). NON toccare i cavi tu o l'utente.
- Documenta in `findings.log` cosa hai provato e l'esito, poi **fermati** e riferisci
  all'utente che serve la valutazione hardware del Piano B (vedi piano
  `plans/access-control/001-controllo-locale-no-cloud.md`, "Opzione di riserva Wiegand"
  e "Fase 1 punto 4").

---

## 8. Cosa riferire a fine sessione

Indipendentemente dall'esito, raccogli e riporta:
- [ ] Contenuto di **`spike/findings.log`** (incollalo).
- [ ] Esito del **GATE**: apre di giorno? apre di notte? (con orari).
- [ ] Valori finali in `.env`: `DEVICE_IP`, `PROTOCOL_VERSION`, `RELAY_DP`.
- [ ] Servizio installato sì/no; eventuali errori in `reglo-access.log`.
- [ ] Se Piano B: cosa è stato provato e perché si è scartata la via locale.

### Restano da fare DA REMOTO (solo dopo conferma dell'utente, NON on-site)
- Finalizzare `keypad.py` se non già fatto, e committare sul branch.
- Applicare la migration indice: `pnpm migrate:prod`.
- Spegnere/sostituire i cron cloud (`tuya-pin-reassert`, `tuya-access-log-sync`, `tuya-pin-sync`).
- Merge del branch `feat/local-access-control` in `master`.
