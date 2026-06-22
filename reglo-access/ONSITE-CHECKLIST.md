# Checklist ON-SITE — reglo-access (palestra)

Obiettivo della visita: **agganciare e configurare**. Il codice è già pronto su
questo branch; in sede si fa solo config + le prove.

## 0. Prima di partire (da casa)
- [ ] Recupera la **LOCAL KEY** del tastierino dalla piattaforma Tuya:
      Cloud → Devices → seleziona il device (`bf38d4d722d26342b0x6vp`) → campo **Local Key**.
      (In alternativa on-site col wizard: `python -m tinytuya wizard`.)
- [ ] Verifica di avere il **CRON_SECRET** del backend (Vercel env) e il **BE_BASE_URL**
      (es. `https://app.houseofmuscle.it`).

## 1. Rete (sul router della palestra)
- [ ] Assegna un **IP fisso** al tastierino (DHCP reservation sul suo MAC).
- [ ] Disattiva **AP/Client Isolation** sul WiFi (PC e tastierino devono vedersi).
- [ ] Collega il **PC alla stessa rete** (meglio cavo Ethernet al router).

## 2. PC (Windows)
- [ ] Installa Python 3 (spunta "Add to PATH").
- [ ] Cartella `reglo-access`:
      ```
      py -3 -m pip install -r requirements.txt
      copy config.example.env .env
      ```
- [ ] Compila `.env`: `LOCAL_KEY`, `DEVICE_IP`, `PROTOCOL_VERSION`, `BE_BASE_URL`, `CRON_SECRET`.

## 3. Spike (Fase 1) — eseguire IN ORDINE in `reglo-access/spike`
> Tutti gli spike salvano le scoperte in `spike/findings.log`: a fine visita
> incolla quel file all'agente per finalizzare `keypad.py`.

- [ ] `python 00_preflight.py` → verifica deps + `.env` + tastierino raggiungibile +
      backend/CRON_SECRET. **Tutto verde prima di salire alla scala.**
- [ ] `python 01_scan.py` → conferma IP + versione protocollo (aggiorna `.env`).
- [ ] `python 02_status.py` → dump DP (annota DP relè, DP eventi, DP codici).
- [ ] `python 03_open.py` → **la porta si apre?** Annota `RELAY_DP` in `.env`.
- [ ] `python 04_listen.py` → digita un codice al tastierino; **vedi l'evento?**
      Annota il formato (slot/codice/tipo).
- [ ] `python 05_write_code.py` → **IL GATE.** Usa il **MODO A (cattura & replica)**:
      crea un codice DALL'APP Tuya mentre lo script ascolta in locale → cattura il
      payload del create-password dell'app → prova a riscriverlo in locale e provalo
      al tastierino. (MODO B = tentativi diretti, fallback.)
      ⭐ **GATE**: rifai la prova **DI NOTTE** (20:00–08:00): se apre anche di notte → OK.

### Se il GATE passa
- [ ] Porta il payload catturato (`findings.log`) in `keypad.py` (`add_code`/`list_codes`/`remove_code`).
- [ ] `install-service.bat` (come Amministratore; serve `nssm.exe` nella cartella).
- [ ] Verifica: nuovo abbonamento sul gestionale → codice compare sul tastierino entro `POLL_INTERVAL`;
      sblocco reale → evento nel backend (admin/access-logs).

### Se il GATE fallisce
- [ ] Si passa al **Piano B** (controller proprio cablato sul relè) — richiede elettricista.

## 4. Resilienza (consigliato)
- [ ] **UPS** per PC + router + tastierino.
- [ ] Verifica che, spegnendo il PC, **gli ingressi continuino a funzionare**
      (i codici restano sul tastierino).
- [ ] Mantieni l'apertura d'emergenza (`python open.py`) come break-glass.

## 5. Dopo la validazione (da remoto)
- [ ] Migrare tutti i codici attivi come locali.
- [ ] Spegnere il cron `tuya-pin-sync` (`apps/web/vercel.json`).
- [ ] Merge del branch `feat/local-access-control`.
