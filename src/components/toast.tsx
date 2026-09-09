"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Unified app toast — single design system for all notifications.
 * Mounted once in layout (ToastHost). `showToast` is callable from anywhere.
 * Visual: glass card, rounded-2xl, border-border, bg-bg, shadow-2xl, rise/fall,
 * text-xs font-bold tracking-wide (not uppercase), tone → text color.
 * Auto-dismiss 5000ms, slide down on exit, max 3 stacked.
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
  const [exiting, setExiting] = useState<Set<number>>(new Set());
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    setExiting((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
    setExiting((s) => new Set(s).add(id));
    setTimeout(() => remove(id), 200);
  }, [remove]);

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
      {toasts.map((t) => {
        const isExiting = exiting.has(t.id);
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-bg px-5 py-3 shadow-2xl ${isExiting ? "animate-[fall_0.2s_ease-in_forwards]" : "animate-[rise_0.2s_ease-out]"}`}
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
        );
      })}
    </div>
  );
}
