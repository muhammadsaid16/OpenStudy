"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — consistent route header per spec §4.
 * section label · title · description · primary action(s).
 * Strings are passed pre-translated (pages already call useT()).
 */
export function PageHeader({
  label,
  title,
  description,
  actions,
  className,
}: {
  label?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6",
        className
      )}
    >
      <div className="min-w-0">
        {label && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-fg/70">
            {label}
          </p>
        )}
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-fg lg:text-[34px] lg:leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-fg">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </div>
  );
}
