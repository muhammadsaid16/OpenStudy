"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Lightweight app toast. Same module-scope pub/sub pattern as undo-toast:
 * `showToast` is callable from anywhere (event handlers, async callbacks)
 * without a context provider; `ToastHost` (mounted once in layout) renders.
 *
 * Tone → intent color, no raw hex; neutral surface stays token-driven so
 * all 12 themes render correctly.
 */

export type ToastTone = "info" | "success" | "danger" | "warning";

type Toast = {
  message: string;
  tone: ToastTone;
  id: number;
};

const TONE_CLASS: Record<ToastTone, string> = {
  info: "text-fg",
  success: "text-grow",
  danger: "text-danger",
  warning: "text-warning",
};

let listeners: ((t: Toast) => void)[] = [];
let nextId = 1;

export function showToast(message: string, tone: ToastTone = "info") {
  const toast: Toast = { message, tone, id: nextId++ };
  listeners.forEach((l) => l(toast));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const onToast = (t: Toast) => {
      setToasts((ts) => [...ts.slice(-2), t]); // max 3 visible
    };
    listeners.push(onToast);
    return () => {
      listeners = listeners.filter((l) => l !== onToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-bg px-5 py-3 shadow-2xl animate-[rise_0.2s_ease-out]"
        >
          <span className={`text-xs font-bold tracking-wide ${TONE_CLASS[t.tone]}`}>
            {t.message}
          </span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-muted-fg transition-colors hover:text-fg"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
