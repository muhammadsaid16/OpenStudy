"use client";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
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
          <RevealHeading text={t(titleKey)} className="text-4xl" />
          {subtitleKey ? <ScrambleSubtitle text={t(subtitleKey)} className="mt-2 text-sm text-muted-fg" /> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
