# Route manuali Tuya sicure (dopo l'incidente del 24/11/2026)

## Cosa è stato fatto
- `/api/internal/tuya-pin-resync/run` riscritta: `?mode=` obbligatorio da lista chiusa
  (`recreate`, `permanent`, `pin`, `full`), mode/parametri sconosciuti → 400 senza
  nessuna azione, **dry-run di default** (scrive solo con `&apply=1`), budget di
  chiamate per invocazione, lock condiviso con i cron.
- Risync completa conservata come strumento di recupero, solo con
  `mode=full&confirm=<data di oggi Europe/Rome>&budget=N`, dopo un dry-run identico
  negli ultimi 15 minuti; va a blocchi (si ferma prima di finire budget/tempo, non
  lascia iscritti a metà) e restituisce `nextFrom` per riprendere.
- Diagnostiche spostate in `/api/internal/tuya-diag/run` (`schedulescan`, `schedule`,
  `keys`, `member`, `status`): client Tuya in sola lettura + test
  `tests/unit/tuya-diag-readonly.test.ts` che blocca import di funzioni che scrivono.
  `schedule` ora usa l'endpoint giusto (1 chiamata, prima 7).
- Client Tuya (`lib/tuya/client.ts`): `withTuyaBudget({ max, readOnly })` con
  AsyncLocalStorage, conta ogni chiamata (token compreso) e lancia `TuyaBudgetError`
  oltre il tetto o su un metodo ≠ GET in sola lettura.
- Lock (`lib/tuya/lock.ts`): riga `AppConfig` `tuya:lock` con scadenza (TTL 310 s),
  compare-and-swap. Usato da `tuya-pin-health`, `tuya-pin-sync` e dalle scritture
  manuali; se occupato → 409. Niente advisory lock: dietro il pooler Neon non è
  affidabile.
- Rimossi: route `tuya-pin-reassert`, `tuya-permanent-reassert`, `tuya-pin-migration`
  (+ job), le modalità diagnostiche superate (`permanentall`, `allocate`,
  `syncmethods`, `temptest`, `temppw`, `timers`, `inspect`, `fresh`, `only`,
  `userinfo`) e le funzioni Tuya rimaste senza uso (`createTempPassword`,
  `allocateUnlockMethods`, `syncUnlockMethods`, `readUserSchedule`, …).

## L'incidente
- 24/11 ~07:56–08:01 (Roma) una chiamata `?member=` alla route di resync è arrivata
  al deploy precedente, che ignorava il parametro e faceva una risync completa: PIN +
  permanente riscritti a 207 iscritti, timeout a 300 s, ~700–1.000 chiamate.
- Da quel momento diversi codici non aprivano (es. Salvatore Fones): password
  sostituita sul cloud ma non arrivata alla serratura; 1 member FAILED.
- Riparazione con `recreate` sui 207: dopo ~70 la serratura si è saturata
  (`2328 operation in progress`) e 14 recreate sono falliti DOPO la delete →
  iscritti senza codice, ripristinati uno per uno con PIN sul member attuale.

## Regole
1. Ogni chiamata Tuya, lettura compresa, consuma quota: dire sempre il costo prima.
2. Letture solo da `tuya-diag`; scritture solo da `tuya-pin-resync` con dry-run prima.
3. Mai cicli di tentativi su una route; mai chiamare una route nuova prima che il
   deploy sia attivo (controllare Vercel: READY + alias su app.houseofmuscle.it).
4. Raffiche di scritture saturano la serratura: distanziare (≥ 30 s tra recreate).

## Da valutare
- `recreateTuyaMember` cancella prima di creare: se la creazione fallisce l'iscritto
  resta senza codice. Alternativa: creare il nuovo member, verificarlo e solo dopo
  cancellare il vecchio (la serratura accetta due member con lo stesso PIN, lo
  dimostrano i duplicati).
