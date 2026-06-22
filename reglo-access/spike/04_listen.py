"""SPIKE 04 — Ascolta gli eventi e scopri cosa riporta il device quando si digita.

Mentre gira, vai al tastierino e:
  1) digita un codice VALIDO (di quelli già presenti) + invio,
  2) digita un codice SBAGLIATO + invio.
Osserva quali DP cambiano e con quale valore (slot? codice? tipo?).
Questo definisce `Keypad.parse_unlock` e la mappatura slot→codice.

Uso:
    python 04_listen.py   (Ctrl+C per uscire)
"""
import json
import time

from _common import make_device

dev = make_device()
dev.set_socketPersistent(True)
print("In ascolto… vai al tastierino e digita codici. Ctrl+C per uscire.\n")

while True:
    data = dev.receive()
    if data:
        print(time.strftime("%H:%M:%S"), json.dumps(data, ensure_ascii=False))
    else:
        dev.heartbeat()
