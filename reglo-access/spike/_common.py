"""Helper condiviso per gli script di spike: carica ../.env e crea il device."""
import os
import sys

from dotenv import load_dotenv
import tinytuya

# carica reglo-access/.env (cartella padre)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


def require(name: str) -> str:
    v = os.getenv(name)
    if not v:
        print(f"Config mancante: {name} (compila ../.env)")
        sys.exit(1)
    return v


def make_device() -> tinytuya.Device:
    dev = tinytuya.Device(require("DEVICE_ID"), require("DEVICE_IP"), require("LOCAL_KEY"))
    dev.set_version(float(os.getenv("PROTOCOL_VERSION", "3.3")))
    dev.set_socketPersistent(True)
    dev.set_socketTimeout(int(os.getenv("DEVICE_TIMEOUT_SEC", "8")))
    return dev
