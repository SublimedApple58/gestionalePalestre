# Tuya access-control — riassetto cadenze cron (anti-sforo quota)

## Cosa è stato fatto (sintesi in cima)
Ridotte le cadenze dei tre cron Tuya in `apps/web/vercel.json` per restare
**ben dentro** la quota trial IoT Core (26.000 chiamate/mese). Nessuna modifica di
logica, nessuna migration. Solo `vercel.json`.

| Cron | Prima | Dopo | Motivo |
|------|-------|------|--------|
| `tuya-pin-sync/run` | `*/5 * * * *` | `0 4 * * *` (1×/giorno) | I cambi reali sono già **event-driven** (`safeSyncPinToKeypad` su ogni mutazione abbonamento/pagamento/ruolo/utente). Il cron serve SOLO a beccare gli **scaduti per data** (nessun evento) → basta una passata giornaliera. |
| `tuya-access-log-sync/run` | `*/5 * * * *` | `*/30 * * * *` | Il registro ingressi non ha bisogno del real-time; 30 min di freschezza bastano. -6× chiamate. |
| `tuya-pin-reassert/run` | `*/30 * * * *` | `0 5 * * *` (1×/giorno) | Rete anti-lockout che fa scritture PIN per-utente; il job stesso avverte che riscrivere troppo spesso **rischia di corrompere PIN buoni**. Daily è più che sufficiente e più sicuro. |

## Contesto / diagnosi
**Problema:** sul vecchio account Tuya la quota trial si esauriva in ~1 settimana.
**Causa reale (confermata da codice + doc Tuya):** non il sync per-utente (che è già
"smart": `syncPinToKeypad` chiama Tuya **solo** quando serve un'azione, leggendo lo
stato dal DB), ma:
1. **Due cron a `*/5`** (`access-log-sync` + `pin-sync`): anche "a vuoto" ogni run fa
   ≥1 chiamata (token + lavoro). ~17k/mese solo l'access-log.
2. **Token non persistito tra i run**: la cache è module-level in memoria, ma su Vercel
   ogni cron parte spesso da cold-start → ri-scarica il token a ogni esecuzione.
3. **Bulk iniziale** (~331 utenti: createTuyaUser + enablePin) front-caricato; se il
   cron a 5 min va in errore e ritenta, si moltiplica.

Somma a regime ≈ **27k–40k chiamate/mese > tetto 26k** → sforo.

## Stima dopo il fix
- access-log-sync ogni 30 min = 48 run/giorno × ~2 chiamate ≈ **2.880/mese**
- pin-sync daily ≈ 30 run/mese + cambi (event-driven, fuori dal cron)
- pin-reassert daily ≈ 30 run/mese + scritture solo ai non-confermati
- token fetch ≈ ~1.500/mese (cold-start dei run rimasti)

**Totale ≈ 3.000–5.000 chiamate/mese** → margine ~5× sotto le 26.000. ✅

## Ottimizzazioni future (NON necessarie ora)
- **Persistere il token Tuya** (DB/cache ~2h) per azzerare i fetch da cold-start.
  Richiederebbe un piccolo store (migration) → rimandata: con le cadenze nuove il
  consumo è già trascurabile.
- **Contatore interno** delle chiamate Tuya con alert se ci si avvicina alla soglia.
- **Bulk iniziale** dei 165 codici: da lanciare **una volta a mano** (route
  `tuya-pin-migration/run`), non lasciato al cron.

## Architettura confermata (cloud-only)
Decisione: gestione accessi **tutta via Tuya Cloud Open API** dal gestionale, niente
PC reception / local key (che è stata la fonte principale dei problemi). 
- **Codici** (crea/rimuovi): event-driven via `safeSyncPinToKeypad` + reconcile daily.
- **Registro ingressi**: pull degli unlock-log via `tuya-access-log-sync` (30 min).
- **Apertura remota**: `/api/mobile/admin/door/open`.
La quota trial si rinnova gratis (form, 1/3/6 mesi). Nota: termini trial = "uso
commerciale vietato" → rischio policy basso per singolo device, ma da tenere a mente;
opzione futura = piano IoT Core a pagamento se si vuole azzerare il rischio.

## Stato
- [x] Cadenze cron aggiornate (`vercel.json`)
- [ ] Deploy in prod (protegge il trial NUOVO: i cron a 5 min consumano anche ora)
- [ ] All'arrivo tastierino (~8 lug): device nell'account → test "crea codice" →
      bulk iniziale 165 codici da `/tmp/keypad-codes-backup-2026-06-26.csv`
