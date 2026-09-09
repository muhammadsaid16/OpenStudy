"use client";

import { useEffect, useState, useCallback } from "react";

export type UndoAction = {
  message: string;
  undo: () => void | Promise<void>;
  onCommit?: () => void | Promise<void>;
  duration?: number;
};

let listeners: ((action: UndoAction) => void)[] = [];
let activeCommitTimer: ReturnType<typeof setTimeout> | null = null;

export function showUndo(action: UndoAction) {
  if (activeCommitTimer !== null) {
    clearTimeout(activeCommitTimer);
    activeCommitTimer = null;
  }
  listeners.forEach((l) => l(action));
}

export function UndoToastHost() {
  const [current, setCurrent] = useState<UndoAction | null>(null);
  const [exiting, setExiting] = useState(false);

  const remove = useCallback(() => {
    setCurrent(null);
    setExiting(false);
  }, []);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => remove(), 200);
  }, [remove]);

  useEffect(() => {
    const onAction = (action: UndoAction) => {
      const duration = action.duration ?? 5000;
      activeCommitTimer = setTimeout(async () => {
        activeCommitTimer = null;
        try { await action.onCommit?.(); } finally { setExiting(true); setTimeout(() => remove(), 200); }
      }, duration);
      setCurrent(action);
      setExiting(false);
      (action as UndoAction & { __timer?: ReturnType<typeof setTimeout> }).__timer = activeCommitTimer;
    };
    listeners.push(onAction);
    return () => { listeners = listeners.filter((l) => l !== onAction); };
  }, [remove]);

  if (!current) return null;

  const timer = (current as UndoAction & { __timer?: ReturnType<typeof setTimeout> }).__timer;

  const handleUndo = () => {
    if (activeCommitTimer !== null) { clearTimeout(activeCommitTimer); activeCommitTimer = null; }
    if (timer) clearTimeout(timer);
    setExiting(true);
    Promise.resolve(current.undo()).finally(() => setTimeout(() => remove(), 200));
  };

  const handleDismiss = () => { dismiss(); };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-bg px-5 py-3 shadow-2xl ${exiting ? "animate-[fall_0.2s_ease-in_forwards]" : "animate-[rise_0.2s_ease-out]"}`}>
        <span className="text-xs font-bold tracking-wide text-fg">
          {current.message}
        </span>
        <button
          onClick={handleUndo}
          className="rounded-full bg-accent px-3 py-1 text-xs font-bold tracking-wide text-accent-fg transition-colors hover:opacity-90"
        >
          Undo
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-muted-fg transition-colors hover:text-fg"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
