"use client";

import { createContext, useCallback, useContext } from "react";
import { App } from "antd";

type ToastType = "success" | "error";

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
      notification[type === "success" ? "success" : "error"]({
        message: type === "success" ? "Successo" : "Errore",
        description: message,
        placement: "bottomRight",
        duration: 4,
        style: {
          background:
            type === "success"
              ? "rgba(34, 197, 94, 0.12)"
              : "rgba(223, 37, 49, 0.12)",
          borderColor:
            type === "success"
              ? "rgba(34, 197, 94, 0.3)"
              : "rgba(223, 37, 49, 0.3)",
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
