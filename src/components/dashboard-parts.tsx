"use client";

import { useT } from "@/lib/i18n";

// ─── Dashboard parts: re-exports + review CTA ──────────────────────

export { Card } from "@/components/ui";
export { CountUp } from "@/components/count-up";

import Link from "next/link";
import { PlayCircle } from "lucide-react";

// Review CTA used in the due-cards alert banner.
export function StudyAllDueButton() {
  const t = useT();
  return (
    <Link
      href="/subjects"
      className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-xs font-bold uppercase tracking-widest text-accent-fg transition-transform hover:scale-[1.03] active:scale-95 glow-accent"
    >
      <PlayCircle size={15} aria-hidden />
      {t("dash.reviewNow")}
    </Link>
  );
}
