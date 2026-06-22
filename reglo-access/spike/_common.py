"""Helper condiviso per gli script di spike: carica ../.env, crea il device,
e registra le scoperte su un file (findings.log) così che i risultati on-site
non vadano persi e si possano rileggere/condividere dopo la visita."""
import os
import sys
import time

from dotenv import load_dotenv
import tinytuya

# carica reglo-access/.env (cartella padre)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

FINDINGS = os.path.join(os.path.dirname(__file__), "findings.log")


def require(name: str) -> str:
    v = os.getenv(name)
    if not v:
        print(f"Config mancante: {name} (compila ../.env)")
        sys.exit(1)
    return v


def record(line: str) -> None:
    """Stampa a video E appende a findings.log con timestamp.
    Usalo per ogni scoperta da conservare (IP, DP relè, payload codici…)."""
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(line)
    try:
        with open(FINDINGS, "a", encoding="utf-8") as f:
            f.write(f"{stamp}  {line}\n")
    except Exception as e:  # noqa: BLE001
        print(f"(nota: non sono riuscito a scrivere findings.log: {e})")


def make_device() -> tinytuya.Device:
    dev = tinytuya.Device(require("DEVICE_ID"), require("DEVICE_IP"), require("LOCAL_KEY"))
    dev.set_version(float(os.getenv("PROTOCOL_VERSION", "3.3")))
    dev.set_socketPersistent(True)
    dev.set_socketTimeout(int(os.getenv("DEVICE_TIMEOUT_SEC", "8")))
    return dev
