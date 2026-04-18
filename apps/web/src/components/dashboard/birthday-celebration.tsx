"use client";

import { useEffect, useMemo, useState } from "react";
import { PartyPopper, X } from "lucide-react";

type BirthdayCelebrationProps = {
  firstName: string;
  /** Anno del compleanno: usato come chiave localStorage per il dismiss. */
  year?: number;
};

const CONFETTI_COUNT = 28;

/**
 * Card di auguri animata per il subscriber il giorno del suo compleanno.
 * Dismiss persistente per l'anno corrente (localStorage `birthday-seen-<year>`)
 * così non riappare ad ogni ricarica della dashboard.
 *
 * Accessibilità:
 *  - `role="alert"` + `aria-live` per screen reader
 *  - Rispetta `prefers-reduced-motion` (la card appare statica, confetti disabilitati)
 *  - Focus ring visibile sul bottone di chiusura
 */
export function BirthdayCelebration({ firstName, year }: BirthdayCelebrationProps) {
  const currentYear = year ?? new Date().getFullYear();
  const storageKey = `birthday-seen-${currentYear}`;

  // Di default non mostriamo nulla: aspettiamo il mount per controllare localStorage,
  // evitando flash-of-content + hydration mismatch.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(storageKey);
      if (!seen) setVisible(true);
    } catch {
      // localStorage può fallire in private mode: mostriamo comunque.
      setVisible(true);
    }
  }, [storageKey]);

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.4 + Math.random() * 1.6,
        hue: i % 3 // 0=brand, 1=white, 2=gold
      })),
    []
  );

  if (!visible) return null;

  function handleDismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore: dismiss comunque il componente per la sessione corrente
    }
    setVisible(false);
  }

  return (
    <section
      className="birthday-celebration"
      role="alert"
      aria-live="polite"
      aria-label="Auguri di compleanno"
    >
      <div className="birthday-celebration-confetti" aria-hidden="true">
        {confettiPieces.map((p) => (
          <span
            key={p.id}
            className={`confetti confetti-hue-${p.hue}`}
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="birthday-celebration-close"
        onClick={handleDismiss}
        aria-label="Chiudi messaggio di auguri"
      >
        <X size={16} />
      </button>

      <div className="birthday-celebration-icon" aria-hidden="true">
        <PartyPopper size={32} />
      </div>

      <p className="birthday-celebration-kicker">Oggi è un giorno speciale</p>
      <h2 className="birthday-celebration-title">
        Buon compleanno, <span>{firstName}</span>!
      </h2>
      <p className="birthday-celebration-sub">
        Tanti auguri da tutto il team della palestra. Che sia un anno pieno di energia
        e nuovi traguardi.
      </p>
    </section>
  );
}
