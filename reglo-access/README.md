# reglo-access — controllo accessi locale (PC palestra)

Servizio che gira sul PC Windows in palestra e parla **in locale** (LAN) col
tastierino Tuya `mk`, **senza cloud Tuya**. Sostituisce la dipendenza dal cloud
(quota IoT Core, costi, bug notturno).

## Cosa fa
1. **Sync codici**: scarica dal backend i codici attivi (`GET /api/internal/access-codes`)
   e riallinea la tabella del tastierino (add/remove).
2. **Listen eventi**: ascolta gli sblocchi e li registra sul backend
   (`POST /api/internal/access-events`).
3. **Apertura d'emergenza**: `python open.py`.

I codici stanno **sul tastierino**, che valida e apre **da solo**: se il PC o la
rete cadono, gli ingressi continuano a funzionare (si fermano solo sync e log).

## Struttura
- `service.py` — loop principale (sync + listen). Punto d'ingresso del servizio.
- `keypad.py` — interfaccia locale al device (tinytuya). **`add/remove/list_code`
  da finalizzare con lo spike 05** (vedi sotto).
- `be_client.py` — client verso il backend.
- `open.py` — apertura d'emergenza.
- `spike/` — script di validazione on-site (Fase 1), da eseguire in ordine.
- `install-service.bat` / `uninstall-service.bat` — servizio Windows (NSSM).
- `config.example.env` — modello di configurazione.

## Setup sul PC (Windows)
1. Installa Python 3 (con `py`/`pythonw` nel PATH).
2. In questa cartella:
   ```
   py -3 -m pip install -r requirements.txt
   copy config.example.env .env
   ```
3. Compila `.env` (vedi `ONSITE-CHECKLIST.md` per local key e IP).
4. **Spike** (Fase 1): vedi `ONSITE-CHECKLIST.md` → esegui `spike/01..05`.
   Il GATE è `05_write_code.py` (codice scritto in locale che apre **anche di notte**).
5. Se il gate passa: porta l'encoder trovato in `keypad.py`
   (`add_code`/`list_codes`/`remove_code`), poi installa il servizio:
   ```
   install-service.bat   (come Amministratore; richiede nssm.exe)
   ```

## Stato attuale del codice
- **Pronto e collaudabile**: connessione, apertura relè (`open.py`/`03_open.py`),
  ascolto eventi (`04_listen.py`).
- **Da finalizzare on-site** (gate): provisioning codici in locale — gli stub in
  `keypad.py` vanno completati con il formato DP confermato da `05_write_code.py`.
  Finché non è fatto, il servizio gira (apertura+eventi) e logga che il sync è in attesa.

## Backend collegato (già su questo branch)
- `GET /api/internal/access-codes` → codici attivi (auth `x-cron-secret`).
- `POST /api/internal/access-events` → log sblocco (auth `x-cron-secret`).
- Migration: nuovo evento `KEYPAD_UNLOCK` + indice su `accessCode`.
