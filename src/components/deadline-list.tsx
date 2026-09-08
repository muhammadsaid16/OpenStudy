"use client";

// ─── Deadline List — urgency-coded rows with relative dates ────────
// HIGH = pulsing danger dot, MED = warning, LOW = muted.
// Deadlines are derived from due flashcard counts per subject.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Deadline {
  subjectId: string;
  subjectName: string;
  color: string;
  dueCount: number;
  /** days until the oldest due card was scheduled — urgency proxy */
  overdueDays: number;
}

type Urgency = "high" | "medium" | "low";

function urgencyOf(d: Deadline): Urgency {
  if (d.overdueDays >= 3 || d.dueCount >= 20) return "high";
  if (d.overdueDays >= 1 || d.dueCount >= 5) return "medium";
  return "low";
}

const URGENCY_STYLE: Record<Urgency, string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-muted-fg",
};

const URGENCY_LABEL: Record<Urgency, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

export function DeadlineList({ deadlines }: { deadlines: Deadline[] }) {
  if (deadlines.length === 0) {
    return (
      <div className="glass rounded-3xl p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
          Deadlines
        </p>
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-sm text-muted-fg">Nothing due — your queue is clear. ✦</p>
          {/* audit §9: empty card still offers the next action instead of
              dead-ending the section */}
          <Link
            href="/flashcards"
            className="mt-3 text-xs font-bold tracking-tight text-accent transition-opacity hover:opacity-80"
          >
            Review cards ahead →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
          Deadlines
        </p>
        <span className="font-mono text-xs font-bold tabular-nums text-muted-fg">
          {deadlines.reduce((a, d) => a + d.dueCount, 0)} cards
        </span>
      </div>
      <ul className="divide-y divide-border">
        {deadlines.slice(0, 6).map((d) => {
          const u = urgencyOf(d);
          return (
            <li key={d.subjectId}>
              <Link
                href="/flashcards"
                className="group flex items-center gap-3 py-3 transition-colors"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full animate-pulse-dot",
                    URGENCY_STYLE[u]
                  )}
                  style={{ backgroundColor: d.color }}
                  aria-hidden
                />
                <span
                  className="h-7 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    {d.subjectName}
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    {d.dueCount} card{d.dueCount === 1 ? "" : "s"} due
                    {d.overdueDays > 0 && ` · ${d.overdueDays}d overdue`}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
                    u === "high" && "bg-danger/10",
                    u === "medium" && "bg-warning/10",
                    u === "low" && "bg-muted"
                  )}
                >
                  <span className={URGENCY_STYLE[u]}>{URGENCY_LABEL[u]}</span>
                </span>
                <ArrowUpRight
                  size={14}
                  className="shrink-0 text-muted-fg opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
