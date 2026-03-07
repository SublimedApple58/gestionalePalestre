"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  addToast: (message: string, type: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    // Rimuovi dallo stato dopo che l'animazione CSS è completata (4.1s)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4100);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <span className="toast-dot" aria-hidden="true" />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
