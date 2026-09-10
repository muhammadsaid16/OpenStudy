"use client";
import { useMemo } from "react";
import { buildHeatmap, groupHeatmapByWeek, type HeatmapCell } from "@/lib/stats";
import type { ReviewLogRec } from "@/lib/db";
import { cn } from "@/lib/utils";

const INTENSITY_BG: Record<0 | 1 | 2 | 3, string> = {
  0: "bg-muted",
  1: "bg-accent/25",
  2: "bg-accent/60",
  3: "bg-accent",
};

const DAY_LABELS = ["", "MON", "", "WED", "", "FRI", ""]; // Sun, Mon, ..., Sat

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function StatsHeatmap({
  reviews,
  weeks = 26,
}: {
  reviews: ReviewLogRec[];
  weeks?: number;
}) {
  const columns = useMemo(() => {
    const cells = buildHeatmap(reviews, weeks);
    return groupHeatmapByWeek(cells);
  }, [reviews, weeks]);

  // Month labels: only render a label on the first column of each visible month
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  columns.forEach((col, i) => {
    const firstDay = col[0]?.date;
    if (!firstDay) return;
    if (firstDay.getMonth() !== lastMonth) {
      monthLabels.push({ col: i, label: firstDay.toLocaleDateString(undefined, { month: "short" }) });
      lastMonth = firstDay.getMonth();
    }
  });

  // Totals
  const total = columns.reduce(
    (acc, col) => acc + col.reduce((s, c) => s + c.count, 0),
    0
  );

  if (total === 0 && reviews.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-fg">
          <span>LAST {weeks} WEEKS</span>
          <span className="font-mono font-bold text-fg">0 REVIEWS</span>
        </div>
        <div className="flex h-[84px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">No activity yet</p>
          <p className="mt-1 text-[11px] text-muted-fg">Start reviewing to see your heatmap</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-fg">
        <span>LAST {weeks} WEEKS</span>
        <span className="font-mono font-bold text-fg">{total} REVIEWS</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" aria-label="Review heatmap">
        {/* Day labels column */}
        <div className="flex shrink-0 flex-col gap-1 pr-1 text-[9px] font-mono uppercase text-muted-fg/60">
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="flex h-3 w-7 items-center justify-end">
              {d}
            </div>
          ))}
        </div>

        <div className="flex gap-1">
          {columns.map((col, i) => {
            const monthLabel = monthLabels.find((m) => m.col === i)?.label;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="h-3 text-[9px] font-mono uppercase text-muted-fg/60">
                  {monthLabel ?? ""}
                </div>
                {col.map((cell: HeatmapCell, j: number) => (
                  <div
                    key={j}
                    title={`${fmtDate(cell.date)} — ${cell.count} review${cell.count === 1 ? "" : "s"}`}
                    aria-label={`${fmtDate(cell.date)}: ${cell.count} reviews`}
                    className={cn(
                      "h-3 w-3 rounded-sm border border-border/40 transition-transform hover:scale-125",
                      INTENSITY_BG[cell.intensity]
                    )}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 text-[10px] font-mono uppercase text-muted-fg/60">
        <span>LESS</span>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn("h-2.5 w-2.5 rounded-sm border border-border/40", INTENSITY_BG[i as 0 | 1 | 2 | 3])}
          />
        ))}
        <span>MORE</span>
      </div>
    </div>
  );
}
