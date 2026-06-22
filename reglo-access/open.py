"""Apertura d'emergenza (break-glass) della porta, da LOCALE.

Uso (sul PC palestra):
    python open.py
"""
import logging
import os

from dotenv import load_dotenv

from keypad import Keypad

logging.basicConfig(level=logging.INFO)
load_dotenv()

kp = Keypad(
    device_id=os.environ["DEVICE_ID"],
    ip=os.environ["DEVICE_IP"],
    local_key=os.environ["LOCAL_KEY"],
    version=float(os.getenv("PROTOCOL_VERSION", "3.3")),
    relay_dp=int(os.getenv("RELAY_DP", "40")),
)
kp.connect()
print("Apertura porta…")
print(kp.open())
