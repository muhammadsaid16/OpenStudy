"use client";

// ─── Focus Zone — the signature widget ─────────────────────────────
// Circular SVG Pomodoro with a breathing conic halo while running,
// phase chips (focus / break / long break), built-in + saved custom
// presets, and a task banner. Shares the usePomodoro engine with the
// /sessions page; logs via createStudySession.
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Square, SkipForward, Coffee, Brain, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import { createStudySession, getSubjects, getPomoPresets, getDueCount } from "@/app/actions";
import { usePomodoro, phaseSeconds, BUILTIN_PRESETS } from "@/lib/pomodoro";
import { soundscape, type SoundscapeName } from "@/lib/soundscape";
import { RemindMeControl } from "./remind-me-control";
import { showUndo } from "./undo-toast";
import type { PomoPresetRec } from "@/lib/db";

const SOUNDSCAPES: SoundscapeName[] = [
  "Silence",
  "White",
  "Brown",
  "Pink",
  "Rain",
  "Café",
  "Waves",
  "Fire",
  "Wind",
];

const PHASE_META = {
  work: {
    label: "Focus",
    chip: "bg-accent-soft text-accent",
    from: "var(--color-accent)",
    to: "var(--color-flow)",
  },
  break: {
    label: "Break",
    chip: "bg-flow/10 text-flow",
    from: "var(--color-flow)",
    to: "var(--color-grow)",
  },
  long: {
    label: "Long Break",
    chip: "bg-grow/10 text-grow",
    from: "var(--color-grow)",
    to: "var(--color-accent)",
  },
} as const;

export function FocusZone() {
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [presets, setPresets] = useState<PomoPresetRec[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [subjectId, setSubjectId] = useState("");
  const [task, setTask] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [soundscapeName, setSoundscapeName] = useState<SoundscapeName>("Silence");

  const pomo = usePomodoro();
  const { workMin, breakMin, longBreakMin, cyclesBeforeLongBreak } = pomo.config;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSubjects(), getPomoPresets(), getDueCount()])
      .then(([s, p, d]) => {
        if (cancelled) return;
        setSubjects(s.map((x) => ({ id: x.id, name: x.name })));
        setPresets(p);
        setDueCount(d);
      })
      .catch(() => { /* widget stays usable with empty lists on storage failure */ });
    // Stop ambient audio if this widget unmounts (route change)
    return () => { cancelled = true; soundscape.stop(); };
  }, []);

  // Adopt a session started on another route: mirror its task/subject into
  // the banner so it reads as one continuous session, not a reset widget.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current) return;
    adoptedRef.current = true;
    if (pomo.running || pomo.paused) {
      setTask((t) => t || pomo.title);
      setSubjectId((s) => s || (pomo.subjectId ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSoundscape = (name: SoundscapeName) => {
    setSoundscapeName(name);
    soundscape.play(name); // "Silence" stops the engine
  };

  const total = phaseSeconds(pomo.phase, pomo.config);
  const progress = total > 0 ? ((total - pomo.seconds) / total) * 100 : 0;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const start = () => {
    // Push the current task/subject into the GLOBAL session so logging works
    // no matter which route the session ends on.
    pomo.setMeta({ title: task.trim(), subjectId: subjectId || null });
    pomo.start();
  };

  const stop = () => {
    const snap = pomo.stop();
    if (snap.workSeconds >= 3) {
      const duration = Math.max(1, Math.round(snap.workSeconds / 60));
      const title =
        snap.title.trim() || `Focus — ${snap.cycles} cycle${snap.cycles === 1 ? "" : "s"}`;
      createStudySession({
        subjectId: snap.subjectId || undefined,
        title,
        durationMin: duration,
        completed: true,
        // Stamp the true start so day-bucketing in weekly analytics/streaks
        // attributes a midnight-crossing session to the day it began.
        startedAt: new Date(snap.startedAt),
      }).catch(() => {
        // Silent loss of a completed focus session is the worst failure mode
        // (user blame-shifts to the app's reliability). Say it, once, with
        // a path to recovery — the data may still be retryable manually.
        showUndo({
          message: "Session completed — couldn't save",
          undo: () => {
            createStudySession({
              subjectId: snap.subjectId || undefined,
              title,
              durationMin: duration,
              completed: true,
              startedAt: new Date(snap.startedAt),
            }).catch(() => {});
          },
          duration: 8000,
        });
      });
    } else {
      // Previously this was a silent no-op — now the user is told.
      showUndo({
        message: "Session too short — not logged",
        undo: () => {},
        duration: 2500,
      });
    }
  };

  const applyBuiltin = (cfg: (typeof BUILTIN_PRESETS)[number]) => {
    pomo.applyConfig(cfg, true);
    setActivePresetId(null);
  };

  const applySaved = (p: PomoPresetRec) => {
    pomo.applyConfig(p, true);
    setActivePresetId(p.id);
  };

  const meta = PHASE_META[pomo.phase];
  const size = 260;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="glass relative overflow-hidden rounded-3xl p-8">
      {/* Header row — timer name + compact soundscape (secondary control,
          audit §2: one primary action, everything else recedes) */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-fg">
            Focus Zone
          </p>
          <h2 className="font-display text-xl font-bold tracking-tight">Pomodoro</h2>
        </div>
        <button
          onClick={() => {
            const next = SOUNDSCAPES[(SOUNDSCAPES.indexOf(soundscapeName) + 1) % SOUNDSCAPES.length];
            pickSoundscape(next);
          }}
          title={`Soundscape: ${soundscapeName} — click to change`}
          aria-label={`Soundscape: ${soundscapeName}. Click to change`}
          className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg transition-colors hover:text-fg"
        >
          <Music size={12} aria-hidden />
          {soundscapeName}
        </button>
      </div>

      {/* Timer ring */}
      <div className="relative mx-auto mb-6 w-fit">
        {pomo.active && <div className="focus-halo" aria-hidden />}
        <svg width={size} height={size} className="-rotate-90" role="img"
          aria-label={`Pomodoro ${meta.label} phase, ${fmt(pomo.seconds)} remaining`}>
          <defs>
            <linearGradient id="focus-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={meta.from} />
              <stop offset="100%" stopColor={meta.to} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#focus-ring)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - (circ * progress) / 100}
            style={{ transition: "stroke-dashoffset 0.9s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "mb-1 flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest",
              meta.chip
            )}
          >
            {pomo.phase === "work" ? <Brain size={11} aria-hidden /> : <Coffee size={11} aria-hidden />}
            {meta.label}
          </span>
          <span className="font-mono text-5xl font-bold tabular-nums tracking-tight">
            {fmt(pomo.seconds)}
          </span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-fg">
            {pomo.cycles} cycle{pomo.cycles === 1 ? "" : "s"} done
            {cyclesBeforeLongBreak > 0 && longBreakMin > 0 && pomo.phase === "work"
              ? ` · long in ${cyclesBeforeLongBreak - (pomo.cycles % cyclesBeforeLongBreak)}`
              : ""}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-6 flex items-center justify-center gap-3">
        {!pomo.running ? (
          <button
            onClick={start}
            aria-label="Start focus session"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform hover:scale-105 active:scale-95 glow-accent"
          >
            <Play size={22} className="ml-0.5" />
          </button>
        ) : (
          <>
            <button
              onClick={pomo.togglePause}
              aria-label={pomo.paused ? "Resume" : "Pause"}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-glass-border bg-glass text-fg backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
            >
              {pomo.paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button
              onClick={pomo.skip}
              aria-label="Skip phase"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-glass-border bg-glass text-muted-fg backdrop-blur-md transition-transform hover:scale-105 hover:text-fg active:scale-95"
            >
              <SkipForward size={18} />
            </button>
            <button
              onClick={stop}
              aria-label="Stop and log session"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/40 bg-danger/10 text-danger transition-transform hover:bg-danger hover:text-on-color active:scale-95"
            >
              <Square size={16} />
            </button>
          </>
        )}
      </div>

      {/* Secondary row: presets + remind-me share one line (audit §2 —
          primary action (START) is the only solo control) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {BUILTIN_PRESETS.map((p) => {
          const isActive =
            workMin === p.workMin &&
            breakMin === p.breakMin &&
            longBreakMin === p.longBreakMin &&
            cyclesBeforeLongBreak === p.cyclesBeforeLongBreak;
          return (
            <button
              key={p.label}
              onClick={() => applyBuiltin(p)}
              disabled={pomo.running}
              aria-pressed={isActive}
              // audit §3: label stays compact, tooltip explains the scheme
              title={`${p.workMin} min focus / ${p.breakMin} min break — long break ${p.longBreakMin}m every ${p.cyclesBeforeLongBreak} cycles`}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-bold tracking-wide transition-colors disabled:opacity-40",
                isActive
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-glass-border bg-glass text-muted-fg hover:text-fg"
              )}
            >
              {p.label}
            </button>
          );
        })}
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => applySaved(p)}
            disabled={pomo.running}
            aria-pressed={activePresetId === p.id}
            title={`${p.workMin}m focus / ${p.breakMin}m break${
              p.longBreakMin > 0 && p.cyclesBeforeLongBreak > 0
                ? ` / ${p.longBreakMin}m long every ${p.cyclesBeforeLongBreak}`
                : ""
            }`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-bold tracking-wide transition-colors disabled:opacity-40",
              activePresetId === p.id
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-glass-border bg-glass text-muted-fg hover:text-fg"
            )}
          >
            {p.name}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
        <RemindMeControl dueCount={dueCount} />
      </div>

      {/* Current task banner + subject */}
      <motion.div
        layout
        className="glass-inset mt-6 flex items-center gap-3 rounded-2xl px-4 py-3"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-flow animate-pulse-dot" aria-hidden />
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="What are you working on?"
          disabled={pomo.running}
          className="w-full rounded-lg bg-transparent text-sm font-medium text-fg placeholder:text-muted-fg/60 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        />
        {subjects.length > 0 && (
          <select
            aria-label="Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={pomo.running}
            className="shrink-0 cursor-pointer rounded-full bg-transparent text-xs text-muted-fg outline-none disabled:opacity-60"
          >
            <option value="">General</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </motion.div>
    </div>
  );
}
