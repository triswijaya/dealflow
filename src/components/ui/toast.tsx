"use client";

import { CircleCheck, CircleX, Info } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "success" | "info" | "error";
type ToastAction = { label: string; href: string };
type Toast = { id: number; message: string; tone: Tone; action?: ToastAction };

const ToastContext = createContext<(message: string, tone?: Tone, action?: ToastAction) => void>(() => {});

const ICON = { success: CircleCheck, info: Info, error: CircleX };

/** Brief §3.4: success toasts bottom-right (top on mobile), gone after 4s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = "success", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone, action }]);
    // A toast that offers a next step stays a little longer.
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), action ? 8000 : 4000);
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
              {toast.action ? (
                <Link className="btn tertiary" href={toast.action.href}>
                  {toast.action.label}
                </Link>
              ) : null}
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
