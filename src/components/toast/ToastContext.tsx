"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import styles from "./ToastContext.module.css";

type ToastTone = "success" | "error";
type Toast = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Default tone stays "error" so existing single-arg callers are unchanged.
  const showToast = useCallback((message: string, tone: ToastTone = "error") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.wrap}>
        {toasts.map((t) => (
          <div key={t.id} className={`card ${styles.toast} ${t.tone === "success" ? styles.success : styles.error}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
