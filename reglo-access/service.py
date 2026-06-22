"""reglo-access — servizio locale (PC palestra).

Gira sempre attivo sul PC. Tre compiti:
  1) SYNC codici: ogni POLL_INTERVAL scarica dal BE i codici attivi e riallinea
     la tabella del tastierino (add mancanti / remove in eccesso).
  2) LISTEN eventi: ascolta gli sblocchi dal tastierino e li registra sul BE.
  3) OPEN: apertura d'emergenza disponibile via funzione `open` (vedi open.py).

NB: i codici vivono sul tastierino, che valida e apre DA SOLO. Se questo servizio
o la rete cadono, gli ingressi continuano a funzionare; si fermano solo
aggiornamento codici e log.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv

from be_client import BackendClient
from keypad import Keypad

load_dotenv()


def _env(name: str, default: str | None = None, required: bool = False) -> str:
    val = os.getenv(name, default)
    if required and not val:
        raise SystemExit(f"Config mancante: {name} (vedi config.example.env)")
    return val or ""


def setup_logging(log_file: str) -> None:
    handler = RotatingFileHandler(log_file, maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s — %(message)s")
    handler.setFormatter(fmt)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    logging.basicConfig(level=logging.INFO, handlers=[handler, console])


log = logging.getLogger("reglo-access")


def build() -> tuple[BackendClient, Keypad, int]:
    be = BackendClient(
        base_url=_env("BE_BASE_URL", required=True),
        cron_secret=_env("CRON_SECRET", required=True),
    )
    kp = Keypad(
        device_id=_env("DEVICE_ID", required=True),
        ip=_env("DEVICE_IP", required=True),
        local_key=_env("LOCAL_KEY", required=True),
        version=float(_env("PROTOCOL_VERSION", "3.3")),
        relay_dp=int(_env("RELAY_DP", "40")),
        timeout=int(_env("DEVICE_TIMEOUT_SEC", "8")),
    )
    poll = int(_env("POLL_INTERVAL_SEC", "300"))
    return be, kp, poll


# ── SYNC codici ──────────────────────────────────────────────────────────
def sync_codes(be: BackendClient, kp: Keypad) -> None:
    try:
        active = be.get_active_codes()
    except Exception as e:  # noqa: BLE001
        log.error("Sync: impossibile leggere i codici dal BE: %s", e)
        return

    active_codes = {c["code"] for c in active}
    log.info("Sync: %d codici attivi dal BE", len(active_codes))

    try:
        current = kp.list_codes()
    except NotImplementedError:
        log.warning(
            "Sync in attesa: provisioning codici non ancora finalizzato "
            "(completare spike 05_write_code.py e portare l'encoder in keypad.py). "
            "Apertura ed eventi funzionano comunque."
        )
        return
    except Exception as e:  # noqa: BLE001
        log.error("Sync: impossibile leggere i codici dal tastierino: %s", e)
        return

    current_codes = {c["code"] for c in current}

    to_add = active_codes - current_codes
    to_remove = current_codes - active_codes

    for c in active:
        if c["code"] in to_add:
            try:
                kp.add_code(c["code"], c.get("name", ""))
                log.info("Sync: aggiunto codice per %s", c.get("name", c["code"]))
            except Exception as e:  # noqa: BLE001
                log.error("Sync: add fallito %s: %s", c["code"], e)

    for c in current:
        if c["code"] in to_remove:
            try:
                kp.remove_code(c.get("slot", c["code"]))
                log.info("Sync: rimosso codice %s", c["code"])
            except Exception as e:  # noqa: BLE001
                log.error("Sync: remove fallito %s: %s", c["code"], e)

    if not to_add and not to_remove:
        log.info("Sync: tabella già allineata")


def sync_loop(be: BackendClient, kp: Keypad, poll: int, stop: threading.Event) -> None:
    while not stop.is_set():
        sync_codes(be, kp)
        stop.wait(poll)


# ── LISTEN eventi ──────────────────────────────────────────────────────────
def listen_loop(be: BackendClient, kp: Keypad, stop: threading.Event) -> None:
    backoff = 2
    while not stop.is_set():
        try:
            for data in kp.listen():
                if stop.is_set():
                    break
                evt = Keypad.parse_unlock(data)
                if not evt:
                    continue
                code = _resolve_code(evt)
                if not code:
                    log.info("Sblocco rilevato ma codice non risolto: %s", evt)
                    continue
                try:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    be.post_unlock(code, occurred_at_iso=now_iso, method=evt.get("method", "keypad"))
                    log.info("Sblocco loggato sul BE (code=%s)", code)
                except Exception as e:  # noqa: BLE001
                    log.error("Sblocco: post al BE fallito: %s", e)
            backoff = 2
        except Exception as e:  # noqa: BLE001
            log.error("Listener: errore connessione (%s), riconnessione tra %ss", e, backoff)
            stop.wait(backoff)
            backoff = min(backoff * 2, 60)
            try:
                kp.reconnect()
            except Exception:  # noqa: BLE001
                pass


def _resolve_code(evt: dict) -> str | None:
    """Mappa l'evento di sblocco al codice. Da affinare con l'output di 04_listen.py:
    se il device riporta lo slot, qui andrà la mappatura slot->code mantenuta dal sync."""
    raw = evt.get("raw")
    if isinstance(raw, str) and raw.isdigit() and 4 <= len(raw) <= 6:
        return raw
    return None


def main() -> None:
    setup_logging(_env("LOG_FILE", "reglo-access.log"))
    be, kp, poll = build()
    kp.connect()
    log.info("reglo-access avviato (poll=%ss)", poll)

    stop = threading.Event()
    t_listen = threading.Thread(target=listen_loop, args=(be, kp, stop), daemon=True)
    t_listen.start()
    try:
        sync_loop(be, kp, poll, stop)
    except KeyboardInterrupt:
        log.info("Arresto richiesto")
        stop.set()


if __name__ == "__main__":
    main()
