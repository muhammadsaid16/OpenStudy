"use client";

import { useT } from "@/lib/i18n";
import { Flame } from "lucide-react";
import { computeStreak } from "@/lib/stats";
import type { ReviewLogRec } from "@/lib/db";
import { cn } from "@/lib/utils";

export function StatsStreakBadge({
  reviews,
  className,
}: {
  reviews: ReviewLogRec[];
  className?: string;
}) {
  const t = useT();
  const streak = computeStreak(reviews);
  if (streak === 0) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-bg-raised/60 px-3 py-1.5",
          className
        )}
      >
        <Flame size={14} className="text-muted-fg" />
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-muted-fg">{t("ui.start_a_streak")}</span>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3 py-1.5",
        className
      )}
    >
      <Flame size={14} className="text-accent" />
      <span className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
        {streak} day streak
      </span>
    </div>
  );
}
