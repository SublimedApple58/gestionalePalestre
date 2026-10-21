"use client";

import { createContext, useCallback, useContext } from "react";
import { App } from "antd";

type ToastType = "success" | "error" | "warning";

type ToastContextValue = {
  addToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { notification } = App.useApp();

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      const palette = {
        success: { title: "Successo", bg: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.3)" },
        error: { title: "Errore", bg: "rgba(223, 37, 49, 0.12)", border: "rgba(223, 37, 49, 0.3)" },
        // Avviso NON bloccante: l'azione è andata a buon fine ma c'è qualcosa da sapere.
        warning: { title: "Attenzione", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.35)" }
      }[type];
      notification[type]({
        message: palette.title,
        description: message,
        placement: "bottomRight",
        duration: type === "warning" ? 8 : 4,
        style: {
          background: palette.bg,
          borderColor: palette.border,
          backdropFilter: "blur(8px)",
          border: "1px solid",
          borderRadius: 8
        }
      });
    },
    [notification]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
    </ToastContext.Provider>
  );
}
