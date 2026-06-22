"""SPIKE 00 — PREFLIGHT: verifica che tutto sia pronto PRIMA di salire alla scala.

Da lanciare per primo, on-site. Controlla in pochi secondi:
  1) le dipendenze Python (tinytuya, dotenv, requests) sono installate;
  2) il file ../.env esiste ed è compilato (LOCAL_KEY, DEVICE_IP, DEVICE_ID…);
  3) il tastierino risponde sulla LAN (TCP 6668 raggiungibile dall'IP in .env);
  4) il backend risponde e il CRON_SECRET è valido (GET /api/internal/access-codes).

Non scrive NULLA sul device. Se tutto è verde, prosegui con 01→05.

Uso:
    python 00_preflight.py
"""
import os
import socket
import sys

ok = True


def check(label: str, passed: bool, hint: str = "") -> None:
    global ok
    mark = "OK " if passed else "FAIL"
    print(f"[{mark}] {label}")
    if not passed:
        ok = False
        if hint:
            print(f"       → {hint}")


# 1) dipendenze
try:
    import tinytuya  # noqa: F401
    import requests  # noqa: F401
    from dotenv import load_dotenv

    check("Dipendenze Python (tinytuya, requests, dotenv)", True)
except Exception as e:  # noqa: BLE001
    print(f"[FAIL] Dipendenze Python: {e}")
    print("       → py -3 -m pip install -r ../requirements.txt")
    sys.exit(1)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# 2) env compilato
required = ["DEVICE_ID", "DEVICE_IP", "LOCAL_KEY", "BE_BASE_URL", "CRON_SECRET"]
missing = [k for k in required if not os.getenv(k)]
check(
    f".env compilato ({len(required) - len(missing)}/{len(required)} campi)",
    not missing,
    f"mancano: {', '.join(missing)} (copia config.example.env in .env e compila)" if missing else "",
)

device_ip = os.getenv("DEVICE_IP", "")

# 3) tastierino raggiungibile sulla LAN (TCP 6668)
if device_ip:
    reachable = False
    try:
        s = socket.create_connection((device_ip, 6668), timeout=5)
        s.close()
        reachable = True
    except Exception as e:  # noqa: BLE001
        hint_err = str(e)
    check(
        f"Tastierino raggiungibile su {device_ip}:6668",
        reachable,
        "stesso WiFi/LAN? AP/Client Isolation disattivato? IP giusto? (rilancia 01_scan.py)"
        if not reachable else "",
    )
else:
    check("Tastierino raggiungibile (TCP 6668)", False, "DEVICE_IP non impostato in .env")

# 4) backend + CRON_SECRET
base = os.getenv("BE_BASE_URL", "").rstrip("/")
secret = os.getenv("CRON_SECRET", "")
if base and secret:
    try:
        r = requests.get(
            f"{base}/api/internal/access-codes",
            headers={"x-cron-secret": secret},
            timeout=15,
        )
        if r.status_code == 200:
            n = r.json().get("count", "?")
            check(f"Backend OK — {n} codici attivi dal BE", True)
        elif r.status_code == 401:
            check("Backend raggiungibile ma CRON_SECRET errato (401)", False,
                  "verifica CRON_SECRET in .env contro la env Vercel del backend")
        else:
            check(f"Backend ha risposto {r.status_code}", False, r.text[:200])
    except Exception as e:  # noqa: BLE001
        check("Backend raggiungibile", False, f"{base} non risponde: {e}")
else:
    check("Backend (BE_BASE_URL + CRON_SECRET)", False, "compila BE_BASE_URL e CRON_SECRET in .env")

print()
if ok:
    print("✅ Preflight superato. Procedi con 01_scan.py → 02 → 03 → 04 → 05.")
    sys.exit(0)
else:
    print("⛔ Preflight NON superato: sistema i punti FAIL prima di proseguire.")
    sys.exit(1)
