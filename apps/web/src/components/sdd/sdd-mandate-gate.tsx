"use client";

import { useEffect, useState, useTransition } from "react";
import { Lock, ShieldCheck } from "lucide-react";

import { logoutAction } from "@/app/actions/auth-actions";
import { acknowledgeSddMandateAction, getSddMandateStatus } from "@/app/actions/sdd-actions";
import { SDD_DISCLOSURE_TEXT } from "@/lib/sdd";

/**
 * Gate BLOCCANTE web sul mandato SEPA SDD. Reso una sola volta dentro
 * `AuthenticatedShell` (quindi su ogni pagina autenticata): se l'utente ha un
 * abbonamento a rate ATTIVO senza presa visione del mandato, copre l'app con un
 * overlay non chiudibile finché non accetta. Equivalente web del gate mobile,
 * per gli abbonati che hanno comprato a rate prima del gate di checkout.
 */
export function SddMandateGate() {
  const [required, setRequired] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void getSddMandateStatus()
      .then((r) => {
        if (active) setRequired(r);
      })
      .catch(() => {
        /* in caso di errore non blocchiamo l'app */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!required) return null;

  function handleAccept() {
    if (!accepted) {
      setError("Devi prendere visione del mandato per continuare.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await acknowledgeSddMandateAction();
        setRequired(false);
      } catch {
        setError("Errore durante il salvataggio. Riprova.");
      }
    });
  }

  return (
    <div className="sdd-gate-overlay" role="dialog" aria-modal="true" aria-label="Mandato SEPA SDD">
      <div className="sdd-gate-card">
        <span className="sdd-gate-badge" aria-hidden="true">
          <ShieldCheck size={30} />
        </span>

        <h2 className="sdd-gate-title">Conferma il mandato SEPA</h2>
        <p className="sdd-gate-subtitle">
          Questa conferma è richiesta perché hai un abbonamento con rinnovo automatico attivo. Per
          continuare devi prendere visione e accettare le condizioni del mandato SEPA Direct Debit.
          È obbligatorio.
        </p>

        <div className="sdd-box sdd-gate-box">
          <div className="sdd-head">
            <Lock size={14} aria-hidden="true" />
            Mandato SEPA Direct Debit (SDD)
          </div>
          <p className="sdd-text">{SDD_DISCLOSURE_TEXT}</p>
        </div>

        <label className="terms-check sdd-check">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
              if (error) setError(null);
            }}
          />
          <span>Dichiaro di aver letto e preso visione delle condizioni del mandato SEPA SDD.</span>
        </label>

        {error ? <p className="sdd-gate-error">{error}</p> : null}

        <button
          type="button"
          className="button button-primary sdd-gate-cta"
          onClick={handleAccept}
          disabled={pending || !accepted}
        >
          {pending ? "Salvataggio…" : "Accetto e continuo"}
        </button>

        <form action={logoutAction} className="sdd-gate-logout">
          <button type="submit" className="button button-ghost" style={{ width: "100%", justifyContent: "center" }}>
            Esci
          </button>
        </form>

        <p className="sdd-gate-foot">
          <Lock size={11} aria-hidden="true" />
          Passaggio obbligatorio · non puoi saltarlo
        </p>
      </div>
    </div>
  );
}
