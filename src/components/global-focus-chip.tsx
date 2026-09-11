"use client";

import { useT } from "@/lib/i18n";

// ─── Global Focus chip — a running Pomodoro session is visible on EVERY route ─
// Fixes the ghost-session UX: the timer no longer "lives" on the dashboard.
// While a session runs (even if started elsewhere), this chip shows the live
// countdown + phase on every page; tap to jump back to the full timer.

import Link from "next/link";
import { Timer } from "lucide-react";
import { usePomodoro, phaseSeconds, type PomoPhase } from "@/lib/pomodoro";

const PHASE_LABEL: Record<PomoPhase, string> = {
  work: t("ui.focus"),
  break: t("ui.break"),
  long: t("ui.long_break_1"),
};

export function GlobalFocusChip() {
  const t = useT();
  const pomo = usePomodoro();
  if (!pomo.running && !pomo.paused) return null;

  const total = phaseSeconds(pomo.phase, pomo.config);
  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };
  const label = pomo.title?.trim()
    ? pomo.title.trim().slice(0, 24)
    : PHASE_LABEL[pomo.phase];

  return (
    <Link
      href="/sessions"
      aria-label={`${pomo.paused ? t("sessions.paused") : "Running"} ${PHASE_LABEL[pomo.phase].toLowerCase()} timer: ${fmt(pomo.seconds)} remaining — open sessions`}
      className="glass-inset pointer-events-auto fixed bottom-20 start-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/40 bg-bg/90 px-4 py-2 shadow-lg backdrop-blur-md transition-transform hover:scale-105 md:bottom-6"
    >
      <span className="relative flex h-2.5 w-2.5" aria-hidden>
        {!pomo.paused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      <Timer size={13} className="text-accent" aria-hidden />
      <span className="font-mono text-sm font-bold tabular-nums text-fg">{fmt(pomo.seconds)}</span>
      <span className="max-w-[10rem] truncate text-[10px] font-bold uppercase tracking-widest text-muted-fg">
        {pomo.paused ? "Paused · " : ""}{label}
      </span>
    </Link>
  );
}
