"""SPIKE 01 — Scansiona la LAN e trova il tastierino.

Conferma: IP del device + versione protocollo. Annota i valori in ../.env
(DEVICE_IP, PROTOCOL_VERSION).

Uso (sul PC palestra, stessa rete del tastierino):
    python 01_scan.py
"""
import tinytuya

print("Scansione dispositivi Tuya sulla rete locale (attendere ~20s)…\n")
devices = tinytuya.deviceScan(False, 20)

if not devices:
    print("NESSUN device trovato. Verifica: PC e tastierino sulla stessa rete, "
          "no AP/Client isolation, firewall.")
else:
    for ip, info in devices.items():
        print(f"IP: {ip}")
        print(f"  gwId/devId : {info.get('gwId') or info.get('id')}")
        print(f"  version    : {info.get('version')}")
        print(f"  productKey : {info.get('productKey')}")
        print("-" * 40)
    print("\nAnnota in ../.env: DEVICE_IP e PROTOCOL_VERSION del nostro tastierino "
          "(match con DEVICE_ID).")
