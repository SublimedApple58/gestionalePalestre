# Script una tantum sul DB di produzione

Regole (dopo l'incidente "scadenze personalizzate sovrascritte", ott 2026):

1. **Mai riscrivere `UserSubscription.endsAt` se `endsAtManual = true`**: è una
   scadenza decisa dalla reception (es. mesi residui da un'altra palestra). Si
   cambia solo se la reception la riscrive dal gestionale. Se una bonifica deve
   toccarla, va elencata a parte e approvata caso per caso.
2. **Dry-run di default**: ogni script stampa prima l'elenco esatto delle righe
   che modificherebbe; la scrittura solo con `--apply` e dopo l'OK.
3. **Audit sempre**: ogni modifica scrive `UserAuditLog` con `before/after` e il
   motivo (`actorId: null`), così resta ricostruibile.
4. **Prima di applicare** valuta uno snapshot/branch Neon del DB.

Script presenti:
- `backfill-endsat-manual.mjs` — marca `endsAtManual` su chi ha oggi una scadenza
  impostata a mano (dalla cronologia audit). Non modifica `endsAt`.
- `seed-personal-trainers.mjs` — caricamento iniziale dei 4 Personal Trainer
  (foto su R2 sotto `trainers/`, testi approvati). Solo inserimenti, salta chi
  esiste già; servono le variabili `R2_*` con `--apply`.
