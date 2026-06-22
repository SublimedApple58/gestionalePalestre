"""Interfaccia LOCALE (LAN) al tastierino Tuya `mk` via tinytuya.

Parte COLLAUDATA (community): connessione persistente, dump stato, apertura relè,
ascolto eventi di sblocco.

Parte DA FINALIZZARE con lo spike (Fase 1, on-site): scrittura/lettura dei codici
sul device (DP di create/delete password). Le funzioni `add_code`/`remove_code`/
`list_codes` restano stub finché `05_write_code.py` non determina il formato DP
esatto; una volta validato, si porta qui l'encoder.
"""
from __future__ import annotations

import logging
from typing import Iterator, Optional

import tinytuya

log = logging.getLogger("reglo-access.keypad")


class Keypad:
    def __init__(self, device_id: str, ip: str, local_key: str,
                 version: float = 3.3, relay_dp: int = 40, timeout: int = 8):
        self.device_id = device_id
        self.ip = ip
        self.local_key = local_key
        self.version = float(version)
        self.relay_dp = relay_dp
        self.timeout = timeout
        self._dev: Optional[tinytuya.Device] = None

    # ── connessione ──────────────────────────────────────────────────────
    def connect(self) -> tinytuya.Device:
        dev = tinytuya.Device(self.device_id, self.ip, self.local_key)
        dev.set_version(self.version)
        dev.set_socketPersistent(True)
        dev.set_socketTimeout(self.timeout)
        self._dev = dev
        log.info("Keypad connesso %s @ %s (v%s)", self.device_id, self.ip, self.version)
        return dev

    @property
    def dev(self) -> tinytuya.Device:
        if self._dev is None:
            return self.connect()
        return self._dev

    def reconnect(self) -> None:
        try:
            if self._dev is not None:
                self._dev.close()
        except Exception:  # noqa: BLE001
            pass
        self._dev = None
        self.connect()

    # ── lettura stato ────────────────────────────────────────────────────
    def status(self) -> dict:
        """Stato corrente (mappa dps)."""
        return self.dev.status() or {}

    # ── apertura relè (break-glass / comando apertura) ───────────────────
    def open(self) -> dict:
        """Apre la porta inviando il DP del relè. COLLAUDATO."""
        log.info("Apertura relè (DP %s)", self.relay_dp)
        return self.dev.set_value(self.relay_dp, True)

    # ── ascolto eventi ───────────────────────────────────────────────────
    def listen(self) -> Iterator[dict]:
        """Generatore: emette ogni messaggio di stato ricevuto dal device.
        Mantiene viva la connessione con heartbeat."""
        dev = self.dev
        dev.set_socketPersistent(True)
        log.info("In ascolto eventi dal tastierino…")
        while True:
            data = dev.receive()
            if data:
                yield data
            else:
                # nessun dato: invia heartbeat per tenere viva la connessione
                dev.heartbeat()

    @staticmethod
    def parse_unlock(data: dict) -> Optional[dict]:
        """Best-effort: estrae da un messaggio di stato un evento di sblocco.
        Da affinare con l'output reale di `04_listen.py`.

        Ritorna {'slot': int|None, 'method': str} se riconosce uno sblocco,
        altrimenti None.
        """
        dps = (data or {}).get("dps", {})
        # DP tipici di "unlock record" sui mk: 11 password, 12 card, 10 fingerprint.
        # Il valore reale (formato) va confermato in 04_listen.py.
        for dp, method in (("11", "password"), ("12", "card"), ("10", "fingerprint")):
            if dp in dps:
                return {"slot": None, "raw": dps[dp], "method": method}
        return None

    # ── gestione codici (DA FINALIZZARE CON SPIKE 05) ────────────────────
    def list_codes(self) -> list[dict]:
        raise NotImplementedError(
            "list_codes: formato DP da confermare con spike 05_write_code.py"
        )

    def add_code(self, code: str, name: str = "") -> dict:
        raise NotImplementedError(
            "add_code: encoder DP create-password da confermare con spike 05_write_code.py"
        )

    def remove_code(self, slot_or_code) -> dict:  # noqa: ANN001
        raise NotImplementedError(
            "remove_code: DP delete-password da confermare con spike 05_write_code.py"
        )
