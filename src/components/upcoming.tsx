"use client";

// ─── Upcoming — goal deadlines near the top of the dashboard ──────
// Spec §1 "UPCOMING": real goal due dates (not derived due-card
// proxies only) with an add path. Falls back to the derived card
// queue when no goals carry dates.

import Link from "next/link";
import { Calendar, Plus } from "lucide-react";

export interface UpcomingItem {
  id: string;
  title: string;
  dueDate: Date | string;
  status?: string;
  subjectName?: string | null;
  subjectColor?: string | null;
}

function fmtDue(d: Date | string): string {
  const t = new Date(d).getTime();
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  if (days < 0) return `Overdue ${-days}d`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

export function Upcoming({ items }: { items: UpcomingItem[] }) {
  const next = items
    .filter((g) => !["done", "completed"].includes(String(g.status ?? "")))
    .filter((g) => new Date(g.dueDate).getTime() > 0) // epoch-0 = no due date
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 4);

  return (
    <div className="glass rounded-3xl p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
        Upcoming
      </p>
      {next.length === 0 ? (
        <div className="mt-3 flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-muted-fg">No deadlines</p>
          <Link
            href="/goals"
            className="inline-flex items-center gap-1.5 text-xs font-bold tracking-tight text-accent transition-opacity hover:opacity-80"
          >
            <Plus size={12} aria-hidden />
            Add a goal with a deadline →
          </Link>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {next.map((g) => {
            const t = new Date(g.dueDate).getTime();
            const overdue = t < Date.now();
            return (
              <li key={g.id}>
                <Link href="/goals" className="group flex items-center gap-3 py-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: g.subjectColor ?? "var(--color-accent)" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                    {g.title}
                  </span>
                  {g.subjectName && (
                    <span className="hidden shrink-0 text-[11px] text-muted-fg sm:block">
                      {g.subjectName}
                    </span>
                  )}
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tabular-nums ${
                      overdue
                        ? "border-danger/40 text-danger"
                        : "border-border text-muted-fg"
                    }`}
                  >
                    <Calendar size={10} aria-hidden />
                    {fmtDue(g.dueDate)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
