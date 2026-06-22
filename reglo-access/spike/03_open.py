"""SPIKE 03 — Apri la porta in LOCALE (DP relè).

Verifica il punto cardine: comandare l'apertura dal PC senza cloud.
Prova prima RELAY_DP da ../.env (default 40); se non apre, prova i candidati.

Uso:
    python 03_open.py
"""
import os
import time

from _common import make_device, record

dev = make_device()
relay_dp = int(os.getenv("RELAY_DP", "40"))

candidates = [relay_dp] + [d for d in (40, 1, 7, 101, 104) if d != relay_dp]

print(f"Provo ad aprire con DP {relay_dp} (poi i candidati {candidates[1:]})…")
for dp in candidates:
    try:
        print(f"\n→ set_value(DP {dp}, True)")
        res = dev.set_value(dp, True)
        print(f"   risposta: {res}")
        ans = input(f"   La porta si è aperta con DP {dp}? [s/N] ").strip().lower()
        if ans == "s":
            record(f"[03] RELAY_DP = {dp} (apre il relè). Imposta RELAY_DP={dp} in ../.env")
            break
    except Exception as e:  # noqa: BLE001
        print(f"   errore DP {dp}: {e}")
    time.sleep(1)
else:
    print("\nNessun DP ha aperto. Rivedi il dump di 02_status.py.")
