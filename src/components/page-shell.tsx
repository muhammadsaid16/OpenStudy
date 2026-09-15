"use client";
import { useT } from "@/lib/i18n";

export function PageShell({
  titleKey,
  subtitleKey,
  children,
  actions,
}: {
  titleKey: string;
  subtitleKey?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="page-gutter cq">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-fg/70">{t(titleKey)}</p>
          {subtitleKey ? <p className="mt-1.5 text-sm text-muted-fg">{t(subtitleKey)}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
