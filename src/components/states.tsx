"use client";

// ─── Design System — State Components ─────────────────────────────
// EmptyState (in ui.tsx), LoadingState, ErrorState, SuccessState —
// the four standard container states. Every list/panel/page section
// renders one of these instead of ad-hoc markup, so failure and
// emptiness look identical everywhere. ErrorState/SuccessState
// accept optional onRetry / onDismiss and render the standard Button.

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const SHELL =
  "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-20 text-center";

function StateIcon({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "danger" | "secondary" }) {
  return (
    <div
      className={cn(
        "mb-5 flex h-14 w-14 items-center justify-center rounded-xl",
        tone === "danger" && "bg-error/12 text-error",
        tone === "secondary" && "bg-secondary/12 text-secondary",
        tone === "primary" && "bg-primary-container/15 text-primary"
      )}
    >
      {children}
    </div>
  );
}

function StateShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(SHELL, className)}>{children}</div>;
}

// ─── Loading state ───────────────────────────────────────────────
// Panel-level loading: skeleton rows, not a spinner. Spinner is for
// inline/busy contexts (see Spinner in ui.tsx). Rows accept a count.
export function LoadingState({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="glass flex items-center gap-4 rounded-xl p-4"
          style={{ opacity: 1 - i * 0.15 }}
        >
          <div className="skeleton h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3 rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
          <div className="skeleton h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ─── Error state (recoverable panel error) ───────────────────────
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <StateShell className={className}>
      <StateIcon tone="danger">
        <AlertTriangle className="h-7 w-7" />
      </StateIcon>
      <h3 className="text-lg font-bold tracking-tight text-fg">{title ?? t("ui.errorTitle")}</h3>
      <p className="mb-6 mt-1.5 max-w-sm text-sm leading-relaxed text-muted-fg">
        {description ?? t("ui.errorDesc")}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("common.retry")}
        </Button>
      )}
    </StateShell>
  );
}

// ─── Success state ───────────────────────────────────────────────
export function SuccessState({
  title,
  description,
  onDismiss,
  className,
}: {
  title?: string;
  description?: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <StateShell className={className}>
      <StateIcon tone="secondary">
        <CheckCircle2 className="h-7 w-7" />
      </StateIcon>
      <h3 className="text-lg font-bold tracking-tight text-fg">{title ?? t("ui.savedTitle")}</h3>
      <p className="mb-6 mt-1.5 max-w-sm text-sm leading-relaxed text-muted-fg">
        {description ?? t("ui.savedDesc")}
      </p>
      {onDismiss && (
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          {t("common.close")}
        </Button>
      )}
    </StateShell>
  );
}
