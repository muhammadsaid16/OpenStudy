"use client";

// ─── Route error boundary (app-wide) ─────────────────────────────
// Any unhandled client error inside a route segment lands here
// instead of a blank screen / raw Next.js error page. Provides
// recovery affordances (retry + safe exit) per Nielsen #9.
// Wrapped by Next.js automatically when placed at app/error.tsx.

import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
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
        <h2 className="font-display text-2xl font-bold tracking-tight">{t("err.title")}</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-fg">
          {t("err.body")}
        </p>
        {error?.digest && (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-fg">
            code: {error.digest.slice(0, 8)}
          </p>
        )}
        {error?.message && (
          <div className="mt-4 max-w-lg overflow-auto rounded-xl border border-danger/30 bg-danger/10 p-3 text-left font-mono text-xs text-danger">
            <p className="font-bold">{error.name || "Error"}: {error.message}</p>
            {error.stack && (
              <pre className="mt-2 max-h-40 overflow-auto text-[10px] text-danger/80 whitespace-pre-wrap">
                {error.stack}
              </pre>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-primary-container px-5 py-2.5 text-sm font-bold text-on-primary-container transition-transform hover:scale-105"
        >
          <RotateCcw size={14} aria-hidden />{t("err.tryAgain")}</button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-5 py-2.5 text-sm font-bold text-fg transition-colors hover:bg-primary-container/15"
        >
          <Home size={14} aria-hidden />
          {t("err.dashboard")}
        </a>
      </div>
    </div>
  );
}
