"""SPIKE 05 — IL GATE: scrivere un codice in LOCALE che apra ANCHE DI NOTTE.

È la prova che decide l'intera soluzione. Se un codice scritto in locale viene
validato dal tastierino (anche di notte), allora il controllo locale è la
soluzione definitiva. Se no → Piano B (controller proprio cablato sul relè).

NB: il formato del DP "create password" sui device `mk` non è documentato e va
ricavato sperimentalmente. Questo script:
  1) mostra lo stato corrente (per riferimento),
  2) tenta alcune varianti di comando di creazione codice,
  3) ti guida a provarlo fisicamente al tastierino.

Riferimenti utili mentre si itera:
  - dump di 02_status.py (DP reali del device)
  - sorgenti `tuya-local` (make-all) e driver Hubitat per il formato unlock_method
  - i report `unlock_method_create` già osservati: 01 ff 00 .. (DP 1)

PROCEDURA CONSIGLIATA:
  - Esegui di GIORNO per la prima validazione funzionale.
  - Poi RIESEGUI/laascia il codice e RIPROVA DI NOTTE (finestra ~20:00–08:00):
    se apre anche di notte → GATE SUPERATO.

Uso:
    python 05_write_code.py 778899     (codice di test a piacere)
"""
import json
import sys
import time

from _common import make_device

TEST_CODE = sys.argv[1] if len(sys.argv) > 1 else "778899"

dev = make_device()
print(f"Stato attuale del device:\n{json.dumps(dev.status(), indent=2, ensure_ascii=False)}\n")
print(f"Tento di creare il codice di test: {TEST_CODE}\n")

# ── Varianti da provare (da affinare con dump 02 + sorgenti tuya-local) ──
# I device mk usano tipicamente il DP 1 (unlock_method_create) con un payload
# strutturato. Qui proviamo varianti note; adattare in base a 02_status.py.
attempts = [
    # (descrizione, dp, valore)
    ("DP1 raw stringa codice", 1, TEST_CODE),
    ("DP1 dict semplice", 1, {"password": TEST_CODE, "type": "password"}),
    ("DP5 temp-password-like", 5, TEST_CODE),
]

for desc, dp, value in attempts:
    print(f"→ Tentativo: {desc}  (DP {dp})")
    try:
        res = dev.set_value(dp, value)
        print(f"   risposta: {res}")
    except Exception as e:  # noqa: BLE001
        print(f"   errore: {e}")
    time.sleep(1.5)
    ans = input(f"   PROVA AL TASTIERINO il codice {TEST_CODE} + invio. Apre? [s/N] ").strip().lower()
    if ans == "s":
        print(f"\n✅ FUNZIONA con: {desc} (DP {dp}).")
        print("   1) Annota questo formato e portalo in keypad.py (add_code/list_codes/remove_code).")
        print("   2) RIPROVA LO STESSO CODICE DI NOTTE: se apre anche di notte → GATE SUPERATO.")
        sys.exit(0)

print("\nNessuna variante ha funzionato. Prossimi passi:")
print(" - rivedere il dump di 02_status.py per il DP corretto,")
print(" - consultare i sorgenti tuya-local/Hubitat per l'encoder del create-password,")
print(" - se la scrittura locale resta impraticabile → Piano B (controller sul relè).")
