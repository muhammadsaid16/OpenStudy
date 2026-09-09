"use client";

// ─── Route error boundary (app-wide) ─────────────────────────────
// Any unhandled client error inside a route segment lands here
// instead of a blank screen / raw Next.js error page. Provides
// recovery affordances (retry + safe exit) per Nielsen #9.
// Wrapped by Next.js automatically when placed at app/error.tsx.

import { useEffect } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console for debugging; digest identifies this error
    // instance in reports without leaking user content.
    console.error("[OpenStudy] Route error:", error?.digest ?? error?.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <AlertTriangle size={32} aria-hidden />
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Something broke
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-fg">
          This screen hit an unexpected error. Your data is safe — IndexedDB
          writes are local. Try again, or head back to the dashboard.
        </p>
        {error?.digest && (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-fg">
            code: {error.digest.slice(0, 8)}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg transition-transform hover:scale-105"
        >
          <RotateCcw size={14} aria-hidden />
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-5 py-2.5 text-sm font-bold text-fg transition-colors hover:bg-accent-soft"
        >
          <Home size={14} aria-hidden />
          Dashboard
        </a>
      </div>
    </div>
  );
}
