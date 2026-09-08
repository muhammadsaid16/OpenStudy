"use client";

// ─── Continue Studying — resume the last touched thread ──────────
// Spec §1: "What am I currently working on?" — the dashboard should
// surface the most recent session's subject/topic as a one-click
// resume path, not make the user re-orient from scratch.

import Link from "next/link";
import { RotateCw } from "lucide-react";

export interface ContinueTarget {
  title: string;
  subjectName: string | null;
  subjectColor: string | null;
  minutes: number;
  when: string; // relative, e.g. "2h ago"
}

export function ContinueStudying({ target }: { target: ContinueTarget | null }) {
  return (
    <div className="glass rounded-3xl p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
        Continue studying
      </p>
      {target ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: target.subjectColor ?? "var(--color-accent)" }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {target.title}
              </p>
              <p className="text-[11px] text-muted-fg">
                {target.subjectName ?? "General"} · {target.minutes}m · {target.when}
              </p>
            </div>
          </div>
          <Link
            href="/sessions"
            aria-label={`Resume ${target.title}`}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-fg transition-transform hover:scale-105"
          >
            <RotateCw size={13} aria-hidden />
            Resume
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-muted-fg">No active study item</p>
          <Link
            href="/sessions"
            className="text-xs font-bold tracking-tight text-accent transition-opacity hover:opacity-80"
          >
            Start your first session →
          </Link>
        </div>
      )}
    </div>
  );
}
