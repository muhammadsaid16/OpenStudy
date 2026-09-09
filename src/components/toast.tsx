"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Unified app toast — single design system for all notifications.
 * Mounted once in layout (ToastHost). `showToast` is callable from anywhere.
 * Visual: glass card, rounded-2xl, border-border, bg-bg, shadow-2xl, rise animation,
 * text-xs font-bold tracking-wide (not uppercase), tone → text color.
 * Auto-dismiss 3500ms, max 3 stacked, pointer-events layered.
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
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const onToast = (t: Toast) => {
      setToasts((ts) => [...ts.slice(-2), t]);
      const tm = setTimeout(() => dismiss(t.id), 5000);
      timers.current.set(t.id, tm);
    };
    listeners.push(onToast);
    return () => {
      listeners = listeners.filter((l) => l !== onToast);
      timers.current.forEach((tm) => clearTimeout(tm));
    };
  }, [dismiss]);

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
