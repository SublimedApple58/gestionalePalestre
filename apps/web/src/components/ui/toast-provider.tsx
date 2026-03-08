"use client";

import { createContext, useCallback, useContext } from "react";
import { Notifications, notifications } from "@mantine/notifications";

type ToastType = "success" | "error";

type ToastContextValue = {
  addToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const addToast = useCallback((message: string, type: ToastType) => {
    notifications.show({
      message,
      color: type === "success" ? "green" : "red",
      autoClose: 4000,
      withBorder: true,
      style: {
        background:
          type === "success"
            ? "rgba(34, 197, 94, 0.12)"
            : "rgba(223, 37, 49, 0.12)",
        borderColor:
          type === "success"
            ? "rgba(34, 197, 94, 0.3)"
            : "rgba(223, 37, 49, 0.3)",
        backdropFilter: "blur(8px)"
      }
    });
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <Notifications
        position="bottom-right"
        autoClose={4000}
        transitionDuration={300}
        limit={5}
      />
      {children}
    </ToastContext.Provider>
  );
}
