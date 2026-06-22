"""SPIKE 01 — Scansiona la LAN e trova il tastierino.

Conferma: IP del device + versione protocollo. Annota i valori in ../.env
(DEVICE_IP, PROTOCOL_VERSION).

Uso (sul PC palestra, stessa rete del tastierino):
    python 01_scan.py
"""
import tinytuya

from _common import record

print("Scansione dispositivi Tuya sulla rete locale (attendere ~20s)…\n")
devices = tinytuya.deviceScan(False, 20)

if not devices:
    print("NESSUN device trovato. Verifica: PC e tastierino sulla stessa rete, "
          "no AP/Client isolation, firewall.")
else:
    for ip, info in devices.items():
        dev_id = info.get("gwId") or info.get("id")
        record(f"[01] IP={ip} devId={dev_id} version={info.get('version')} "
               f"productKey={info.get('productKey')}")
        print("-" * 40)
    print("\nAnnota in ../.env: DEVICE_IP e PROTOCOL_VERSION del nostro tastierino "
          "(match con DEVICE_ID). Valori salvati in spike/findings.log.")
