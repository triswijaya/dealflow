"use client";

import { CircleCheck, CircleX, Info } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "success" | "info" | "error";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

const ICON = { success: CircleCheck, info: Info, error: CircleX };

/** Brief §3.4: success toasts bottom-right (top on mobile), gone after 4s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = ICON[toast.tone];
          return (
            <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
              <Icon aria-hidden="true" />
              <div>{toast.message}</div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
