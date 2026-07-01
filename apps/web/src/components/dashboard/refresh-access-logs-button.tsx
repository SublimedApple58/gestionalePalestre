"use client";

import { useState, useTransition } from "react";
import { RotateCw } from "lucide-react";

import { refreshAccessLogsAction } from "@/app/actions/dashboard-actions";

/**
 * Pulsante "Aggiorna" del registro ingressi. Chiama la server action che
 * sincronizza gli ingressi dal tastierino (Tuya) on-demand e ricarica la
 * dashboard. Sostituisce il vecchio cron: le chiamate a Tuya partono solo qui.
 */
export function RefreshAccessLogsButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  return (
    <button
      type="button"
      className="button button-ghost small"
      style={{ marginLeft: "auto" }}
      disabled={pending}
      title="Sincronizza gli ingressi dal tastierino"
      onClick={() => {
        setError(false);
        startTransition(async () => {
          try {
            await refreshAccessLogsAction();
          } catch {
            setError(true);
          }
        });
      }}
    >
      <RotateCw size={13} aria-hidden="true" />
      {pending ? "Aggiorno…" : error ? "Riprova" : "Aggiorna"}
    </button>
  );
}
