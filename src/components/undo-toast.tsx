"use client";

import { useEffect, useState, useCallback } from "react";

export type UndoAction = {
  message: string;
  /** Called when UNDO is clicked — cancels the pending destructive action. */
  undo: () => void | Promise<void>;
  /** Called when the timer expires (commit the destructive action). */
  onCommit?: () => void | Promise<void>;
  duration?: number; // ms; default 5000
};

// Global undo controller. The timer lives at MODULE scope (not in React
// state) so it survives navigation/unmount: if the user clicks UNDO the
// pending action is cancelled even after leaving the page; if they don't,
// onCommit fires after `duration` regardless of component lifecycle.
// This fixes the old bug where the deferred-delete timer lived in a page
// closure and could fire (or fail to cancel) across unmounts.

let listeners: ((action: UndoAction) => void)[] = [];
// Module-scope handle of the CURRENT toast's commit timer. showUndo clears it
// when a new toast arrives, so a superseded deferred action can't commit late
// and its timeout can't dismiss the replacement toast prematurely.
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

  const dismiss = useCallback(() => {
    setCurrent(null);
  }, []);

  useEffect(() => {
    const onAction = (action: UndoAction) => {
      const duration = action.duration ?? 5000;

      // Commit after the timeout, then clear.
      activeCommitTimer = setTimeout(async () => {
        activeCommitTimer = null;
        try {
          await action.onCommit?.();
        } finally {
          setCurrent(null);
        }
      }, duration);

      setCurrent(action);

      // Expose a cancel handle via the UNDO button (handled in render below).
      // We stash the timer so UNDO can clear it.
      (action as UndoAction & { __timer?: ReturnType<typeof setTimeout> }).__timer =
        activeCommitTimer;
    };

    listeners.push(onAction);
    return () => {
      listeners = listeners.filter((l) => l !== onAction);
    };
  }, []);

  if (!current) return null;

  const timer = (current as UndoAction & { __timer?: ReturnType<typeof setTimeout> }).__timer;

  const handleUndo = () => {
    if (activeCommitTimer !== null) {
      clearTimeout(activeCommitTimer);
      activeCommitTimer = null;
    }
    if (timer) clearTimeout(timer);
    Promise.resolve(current.undo()).finally(dismiss);
  };

  const handleDismiss = () => {
    // Dismissing (✕) is NOT an undo — a deferred destructive action
    // (onCommit pattern, e.g. /bundles delete) must still fire. The commit
    // timer (`timer` === activeCommitTimer for this toast) keeps running and
    // does its own cleanup when it fires. Only the toast is hidden here.
    dismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2"
    >
      <div className="flex items-center gap-4 border-2 border-border bg-bg px-5 py-3 shadow-2xl animate-[rise_0.2s_ease-out]">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-fg">
          {current.message}
        </span>
        <button
          onClick={handleUndo}
          className="text-xs font-bold uppercase tracking-widest text-accent hover:underline"
        >
          UNDO
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
