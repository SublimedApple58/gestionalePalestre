"""SPIKE 02 — Connetti e fai il dump di TUTTI i datapoint (data model live).

Serve a vedere come questo specifico device espone codici, eventi, relè.
Confronta i DP con quelli ipotizzati (40 relè, 11 password unlock, 1-3 gestione codici).

Uso:
    python 02_status.py
"""
import json

from _common import make_device, record

dev = make_device()
print("Lettura stato (status)…")
status = dev.status()
record(f"[02] status = {json.dumps(status, ensure_ascii=False)}")

print("\nLettura completa DPS (detect_available_dps)…")
try:
    dps = dev.detect_available_dps()
    record(f"[02] detect_available_dps = {json.dumps(dps, ensure_ascii=False)}")
except Exception as e:  # noqa: BLE001
    print(f"detect_available_dps non disponibile: {e}")

print("\nAnnota: quale DP cambia quando apri/chiudi, quali riportano gli sblocchi, "
      "e quali DP riguardano i codici (create/delete).")
