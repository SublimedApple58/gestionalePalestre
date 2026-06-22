"""SPIKE 05 — IL GATE: scrivere un codice in LOCALE che apra ANCHE DI NOTTE.

È la prova che decide l'intera soluzione. Se un codice scritto in locale viene
validato dal tastierino (anche di notte), il controllo locale è la soluzione
definitiva. Se no → Piano B (controller proprio cablato sul relè).

STRATEGIA (in ordine di probabilità di successo):

  MODO A — CATTURA & REPLICA (consigliato).
    I codici creati DALL'APP Tuya funzionano 24/7 (sono "offline/locali"); i nostri
    via cloud no. Quindi: facciamo creare un codice DALL'APP mentre ascoltiamo in
    locale, CATTURIAMO il datapoint esatto che il device riporta, e poi proviamo a
    RISCRIVERE quello stesso payload in locale. Se il device accetta lo stesso
    formato dell'app, abbiamo il formato giusto del create-password locale.

  MODO B — TENTATIVI (fallback).
    Se non si può usare l'app, prova alcune varianti note del DP create-password.
    Meno probabile, ma a costo zero.

In entrambi i casi la validazione FINALE è fisica: digitare il codice al tastierino.
⭐ GATE = lo stesso codice deve aprire ANCHE DI NOTTE (~20:00–08:00).

Uso:
    python 05_write_code.py            # menu interattivo (A o B)
    python 05_write_code.py 778899     # usa 778899 come codice di test (modo B)
"""
import json
import sys
import time

from _common import make_device, record

TEST_CODE = sys.argv[1] if len(sys.argv) > 1 else "778899"

# DP candidati per la gestione codici sui device `mk` (da confermare col dump 02).
CODE_DPS = (1, 5, 11, 102, 103)


def snapshot(dev) -> dict:
    return (dev.status() or {}).get("dps", {})


def diff(before: dict, after: dict) -> dict:
    """DP nuovi o cambiati tra due snapshot."""
    out = {}
    for k, v in after.items():
        if k not in before or before[k] != v:
            out[k] = v
    return out


def mode_capture(dev) -> None:
    """Cattura il DP che l'app genera creando un codice, poi prova a replicarlo."""
    print("\n=== MODO A — CATTURA & REPLICA ===")
    print("1) Apri l'app Tuya Smart sul telefono (stessa rete va bene ma non serve).")
    print("2) Quando dico VAI, crea nell'app un codice/password PERMANENTE di test.")
    input("   Premi INVIO per leggere lo stato PRIMA della creazione… ")
    before = snapshot(dev)
    record(f"[05] stato PRIMA (dps): {json.dumps(before, ensure_ascii=False)}")

    print("\n   VAI: crea ORA il codice dall'app. Sto ascoltando i datapoint…")
    print("   (lascio la connessione in ascolto ~40s; appena vedi 'cambiato' puoi fermarti)\n")
    captured = {}
    deadline = time.time() + 40
    while time.time() < deadline:
        data = dev.receive()
        if data and isinstance(data, dict) and "dps" in data:
            changed = diff(before, data["dps"])
            if changed:
                captured.update(changed)
                record(f"[05] CAMBIATO durante creazione app: {json.dumps(changed, ensure_ascii=False)}")
        else:
            dev.heartbeat()

    if not captured:
        after = snapshot(dev)
        captured = diff(before, after)
        if captured:
            record(f"[05] DELTA (status post-creazione): {json.dumps(captured, ensure_ascii=False)}")

    if not captured:
        print("\nNessun datapoint catturato. Possibili cause: l'app passa dal cloud "
              "senza emettere un DP locale, oppure il device non lo riporta in locale.")
        print("→ Riprova, oppure passa al MODO B (tentativi).")
        return

    print("\nDatapoint catturati (questo è il FORMATO del create-password dell'app):")
    print(json.dumps(captured, indent=2, ensure_ascii=False))
    record(f"[05] PAYLOAD APP CATTURATO = {json.dumps(captured, ensure_ascii=False)}")
    print("\n→ Annotato in findings.log. Porta questo formato in keypad.py.add_code.")
    print("  Ora prova a RISCRIVERLO in locale per un NUOVO codice di test:")

    for dp, value in captured.items():
        ans = input(f"   Riscrivo DP {dp} con lo stesso valore in locale? [s/N] ").strip().lower()
        if ans != "s":
            continue
        try:
            res = dev.set_value(int(dp), value)
            record(f"[05] replay locale set_value(DP {dp}) → {res}")
        except Exception as e:  # noqa: BLE001
            record(f"[05] replay locale DP {dp} ERRORE: {e}")
        time.sleep(1.5)
        ans2 = input("   Prova il codice al tastierino. Apre? [s/N] ").strip().lower()
        if ans2 == "s":
            record(f"[05] ✅ REPLAY LOCALE FUNZIONA con DP {dp} (formato app). GATE-giorno superato.")
            print("\n✅ Funziona di giorno. ⭐ ORA IL GATE VERO: riprova DI NOTTE (20:00–08:00).")
            return

    print("\nReplay non confermato. Annota comunque il payload catturato (findings.log) "
          "e prova il MODO B o riprova la cattura.")


def mode_attempts(dev) -> None:
    print("\n=== MODO B — TENTATIVI (fallback) ===")
    print(f"Stato attuale:\n{json.dumps(dev.status(), indent=2, ensure_ascii=False)}\n")
    print(f"Provo a creare il codice di test: {TEST_CODE}\n")

    attempts = [
        ("DP1 raw stringa codice", 1, TEST_CODE),
        ("DP1 dict semplice", 1, {"password": TEST_CODE, "type": "password"}),
    ] + [(f"DP{dp} raw stringa", dp, TEST_CODE) for dp in CODE_DPS if dp != 1]

    for desc, dp, value in attempts:
        print(f"→ Tentativo: {desc}  (DP {dp})")
        try:
            res = dev.set_value(dp, value)
            print(f"   risposta: {res}")
        except Exception as e:  # noqa: BLE001
            print(f"   errore: {e}")
        time.sleep(1.5)
        ans = input(f"   PROVA AL TASTIERINO {TEST_CODE} + invio. Apre? [s/N] ").strip().lower()
        if ans == "s":
            record(f"[05] ✅ FUNZIONA con: {desc} (DP {dp}, value={value!r}). GATE-giorno superato.")
            print(f"\n✅ {desc}. Portalo in keypad.py. ⭐ ORA RIPROVA DI NOTTE.")
            return

    print("\nNessuna variante ha funzionato. Prova il MODO A (cattura dall'app) "
          "oppure, se la scrittura locale resta impraticabile → Piano B (controller sul relè).")


def main() -> None:
    dev = make_device()
    print("Spike 05 — scrittura codice locale (il GATE).")
    print("  [A] Cattura & replica dall'app Tuya (consigliato)")
    print("  [B] Tentativi diretti sui DP")
    choice = input("Scegli [A/b]: ").strip().lower() or "a"
    if choice == "b":
        mode_attempts(dev)
    else:
        mode_capture(dev)
    print("\nRicorda: il GATE è superato SOLO se il codice apre ANCHE DI NOTTE. "
          "Tutte le scoperte sono in spike/findings.log.")


if __name__ == "__main__":
    main()
