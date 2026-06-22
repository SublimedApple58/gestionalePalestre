"""Client HTTP verso il backend Reglo (endpoint /api/internal/access-*).

Tutte le chiamate usano l'header `x-cron-secret` (stesso schema dei cron Vercel).
"""
from __future__ import annotations

import logging
from typing import Optional

import requests

log = logging.getLogger("reglo-access.be")


class BackendClient:
    def __init__(self, base_url: str, cron_secret: str, timeout: int = 15):
        self.base_url = base_url.rstrip("/")
        self.secret = cron_secret
        self.timeout = timeout

    @property
    def _headers(self) -> dict:
        return {"x-cron-secret": self.secret, "Content-Type": "application/json"}

    def get_active_codes(self) -> list[dict]:
        """Ritorna [{userId, code, name, role}, ...] — i codici che DEVONO
        essere attivi sul tastierino in questo momento."""
        url = f"{self.base_url}/api/internal/access-codes"
        r = requests.get(url, headers=self._headers, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        return data.get("codes", [])

    def post_unlock(self, code: str, occurred_at_iso: Optional[str] = None,
                    method: str = "keypad") -> dict:
        """Registra uno sblocco avvenuto sul tastierino."""
        url = f"{self.base_url}/api/internal/access-events"
        body: dict = {"code": code, "method": method}
        if occurred_at_iso:
            body["occurredAt"] = occurred_at_iso
        r = requests.post(url, json=body, headers=self._headers, timeout=self.timeout)
        r.raise_for_status()
        return r.json()
