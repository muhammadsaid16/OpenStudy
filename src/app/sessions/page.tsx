"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Play, Pause, Square, Clock, Timer, Trash2, SkipForward, Coffee, Brain, Save, X } from "lucide-react";
import { Badge, EmptyState, Skeleton, Modal, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { RevealHeading } from "@/components/reveal-heading";
import { ScrambleSubtitle } from "@/components/scramble-subtitle";
import GravityFall from "@/components/originkit/ui/falling-text";
import { magneticHandlers } from "@/lib/interactions";
import { SubjectTopicMenu } from "@/components/subject-topic-menu";
import { motion, AnimatePresence } from "framer-motion";
import { getStudySessions, createStudySession, deleteStudySession, getSubjects, getPomoPresets, createPomoPreset, deletePomoPreset } from "@/app/actions";
import { formatDuration, formatDate } from "@/lib/utils";
import { usePomodoro, phaseSeconds, BUILTIN_PRESETS, type PomoConfig } from "@/lib/pomodoro";
import type { PomoPresetRec } from "@/lib/db";

type Session = Awaited<ReturnType<typeof getStudySessions>>[number];
type Subject = Awaited<ReturnType<typeof getSubjects>>[number];

type TimerMode = "stopwatch" | "pomodoro";

// Module-level constants: stable identities so GravityFall's mount effect
// never re-fires on parent re-renders (the timer re-renders every second).
const FALL_TRANSITION = { type: "spring" as const, stiffness: 420, damping: 18 };

// Phase visuals — work / short break / long break, mapped to the
// Aurora signal tokens (accent = heat/focus, flow = in-progress,
// grow = recovery) so all 12 themes apply. Source strings are
// normal-case; render sites style them as eyebrows via CSS.
const PHASE_META = {
  work: {
    label: "Focus",
    cls: "border-accent/40 bg-accent-soft text-accent",
    ring: "var(--color-accent)",
    text: "text-accent",
  },
  break: {
    label: "Break",
    cls: "border-flow/40 bg-flow/10 text-flow",
    ring: "var(--color-flow)",
    text: "text-flow",
  },
  long: {
    label: "Long break",
    cls: "border-grow/40 bg-grow/10 text-grow",
    ring: "var(--color-grow)",
    text: "text-grow",
  },
} as const;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [mode, setMode] = useState<TimerMode>("stopwatch");

  // ── Stopwatch state (unchanged) ────────────────────────────────
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // ── Shared session fields ──────────────────────────────────────
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [saveError, setSaveError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartedAtRef = useRef<Date | null>(null);

  // ── Pomodoro — shared engine hook (work / break / long break) ──
  const pomo = usePomodoro();
  const { workMin, breakMin, longBreakMin, cyclesBeforeLongBreak, autoAdvance } = pomo.config;

  // ── Custom presets (saved in Dexie) ────────────────────────────
  const [presets, setPresets] = useState<PomoPresetRec[]>([]);
  const [presetName, setPresetName] = useState("");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Spec §5 history filters: Today | 7 days | 30 days | All (+ subject).
  const [historyRange, setHistoryRange] = useState<"today" | "7d" | "30d" | "all">("all");
  const [historySubject, setHistorySubject] = useState<string>("all");

  // Shared delete confirmation (presets + history rows).
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "preset" | "session"; id: string; label: string } | null>(null);

  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getStudySessions(), getSubjects(), getPomoPresets()]).then(([s, sub, p]) => {
      if (cancelled) return;
      setSessions(s);
      setSubjects(sub);
      setPresets(p);
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) {
        setLoadError("Could not load saved data — storage may be unavailable.");
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Stopwatch interval (unchanged)
  useEffect(() => {
    if (mode === "stopwatch" && timerRunning && !timerPaused) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mode, timerRunning, timerPaused]);

  const anyRunning = timerRunning || pomo.running;

  // ── Stopwatch handlers (unchanged) ─────────────────────────────
  const startTimer = () => {
    if (!sessionTitle.trim()) return;
    setTimerSeconds(0);
    setTimerRunning(true);
    setTimerPaused(false);
    timerStartedAtRef.current = new Date();
  };

  const pauseTimer = () => {
    setTimerPaused(true);
  };

  const resumeTimer = () => {
    setTimerPaused(false);
  };

  const persistSession = (title: string, seconds: number, startedAt: Date | null) => {
    if (seconds < 3) return; // ignore accidental taps
    const duration = Math.max(1, Math.round(seconds / 60));
    // startedAt fallback: true start (now − elapsed) instead of the end
    // timestamp, so day-bucketing attributes midnight-crossing sessions
    // to the day they began.
    const effectiveStart = startedAt ?? new Date(Date.now() - seconds * 1000);
    startTransition(async () => {
      try {
        const session = await createStudySession({
          subjectId: selectedSubjectId || undefined,
          topicId: selectedTopicId || undefined,
          title,
          durationMin: duration,
          completed: true,
          startedAt: effectiveStart,
        });
        setSessions((prev) => [
          {
            ...session,
            subject: subjects.find((s) => s.id === selectedSubjectId) ?? null,
            topic: null,
          },
          ...prev,
        ]);
        setSessionTitle("");
        setTimerSeconds(0);
        setSaveError("");
      } catch {
        // Storage write failed: keep the title + elapsed time on screen so
        // the user can retry instead of silently losing the session.
        setTimerSeconds(seconds);
        setSessionTitle(title);
        setSaveError("Could not save this session — try stopping again.");
      }
    });
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setTimerPaused(false);
    const seconds = timerSeconds;
    const startedAt = timerStartedAtRef.current;
    timerStartedAtRef.current = null;
    persistSession(sessionTitle.trim(), seconds, startedAt);
  };

  // ── Pomodoro handlers ──────────────────────────────────────────
  const applyConfig = (partial: Partial<PomoConfig>) => {
    pomo.applyConfig(partial);
    setActivePresetId(null); // manual tweak detaches from any preset
  };

  const applyPresetConfig = (cfg: Partial<PomoConfig>, presetId: string | null) => {
    pomo.applyConfig(cfg, true);
    setActivePresetId(presetId);
  };

  const saveCurrentAsPreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    const preset = await createPomoPreset({
      name,
      workMin,
      breakMin,
      longBreakMin,
      cyclesBeforeLongBreak,
      autoAdvance,
    });
    setPresets((prev) => [...prev, preset]);
    setPresetName("");
    setActivePresetId(preset.id);
  };

  const removePreset = async (id: string) => {
    setDeleteConfirm({ kind: "preset", id, label: presets.find((p) => p.id === id)?.name ?? "preset" });
  };

  const startPomodoro = () => {
    // The session now lives in the global (module-level) engine — it survives
    // navigation. Push the chosen title/subject into it so logging works
    // regardless of which route the session ends on.
    pomo.setMeta({ title: sessionTitle.trim(), subjectId: selectedSubjectId || null });
    pomo.start();
    timerStartedAtRef.current = new Date(pomo.startedAt);
  };

  const stopPomodoro = () => {
    const title = pomo.title.trim();
    const snap = pomo.stop();
    const startedAt = new Date(snap.startedAt);
    timerStartedAtRef.current = null;
    const finalTitle =
      title || `Pomodoro — ${snap.cycles} cycle${snap.cycles === 1 ? "" : "s"}`;
    persistSession(finalTitle, snap.workSeconds, startedAt);
  };

  // Adopt a session started elsewhere (dashboard): prefill the title/subject
  // fields once on mount so STOP & SAVE logs with the right metadata.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current) return;
    adoptedRef.current = true;
    if (pomo.running || pomo.paused) {
      setSessionTitle((t) => t || pomo.title.trim());
      setSelectedSubjectId((s) => s || (pomo.subjectId ?? ""));
      timerStartedAtRef.current = new Date(pomo.startedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTimer = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const formatClock = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const handleDeleteSession = async (id: string) => {
    const target = sessions.find((s) => s.id === id);
    setDeleteConfirm({ kind: "session", id, label: target?.title ?? "session" });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.kind === "preset") {
      await deletePomoPreset(deleteConfirm.id);
      setPresets((prev) => prev.filter((p) => p.id !== deleteConfirm.id));
      if (activePresetId === deleteConfirm.id) setActivePresetId(null);
    } else {
      await deleteStudySession(deleteConfirm.id);
      setSessions((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
    }
    setDeleteConfirm(null);
  };

  // Spec §5: derive the visible history rows from range + subject filters.
  // today = calendar day; 7d/30d = rolling window on startedAt.
  const filteredSessions = sessions.filter((s) => {
    if (historySubject !== "all" && s.subject?.id !== historySubject) return false;
    if (historyRange === "all") return true;
    const started = new Date(s.startedAt).getTime();
    const now = Date.now();
    if (historyRange === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return started >= d.getTime();
    }
    const days = historyRange === "7d" ? 7 : 30;
    return started >= now - days * 86_400_000;
  });

  const pomoActive = pomo.active;

  return (
    <div className="p-8 lg:p-12">
      {/* Header */}
      <div className="mb-10">
        <RevealHeading text="Sessions" className="text-5xl lg:text-8xl" />
        <ScrambleSubtitle
          text="Track your study time and progress"
          className="mt-4 text-sm text-muted-fg uppercase tracking-widest"
        />
      </div>

      {/* Mode toggle — sliding pill */}
      <div className="mb-6 inline-flex items-center gap-1 rounded-full border border-border bg-bg-raised/60 p-1">
        {(
          [
            { id: "stopwatch", label: "Stopwatch", icon: <Timer size={14} /> },
            { id: "pomodoro", label: "Pomodoro", icon: <Clock size={14} /> },
          ] as { id: TimerMode; label: string; icon: React.ReactNode }[]
        ).map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={anyRunning && mode !== m.id}
            className={cn(
              "relative flex items-center rounded-full px-5 py-2 text-xs font-black uppercase tracking-widest transition-colors",
              mode === m.id ? "text-accent-fg" : "text-muted-fg hover:text-accent",
              anyRunning && mode !== m.id && "opacity-40 cursor-not-allowed"
            )}
          >
            {mode === m.id && (
              <motion.span
                layoutId="timer-mode-pill"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {m.icon}
              {m.label}
            </span>
          </button>
        ))}
      </div>

      {/* Timer */}
      <div className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form fields — 3 cols */}
        <div className="space-y-6 lg:col-span-3">
          <div>
            <label className="text-xs font-bold text-muted-fg tracking-wider mb-2 block">
              Session title{mode === "pomodoro" ? " (optional)" : ""}
            </label>
            <input
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder={mode === "pomodoro" ? "Auto-named from cycles if empty" : "e.g. Reviewing chapter 5"}
              disabled={anyRunning}
              className="glass-inset w-full rounded-xl px-4 py-3 text-sm text-fg placeholder:text-muted-fg/60 transition-colors outline-none disabled:opacity-50 focus:border-accent border border-transparent focus:border-accent"
            />
          </div>
          <SubjectTopicMenu
            subjects={subjects}
            subjectId={selectedSubjectId}
            topicId={selectedTopicId}
            onSubjectChange={setSelectedSubjectId}
            onTopicChange={setSelectedTopicId}
          />

          {/* Pomodoro settings — custom technique builder */}
          {mode === "pomodoro" && (
            <div className="glass rounded-2xl p-5 space-y-5">
              {/* Built-in presets */}
              <div>
                <label className="text-xs font-bold text-muted-fg tracking-wider mb-2 block">
                  Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {BUILTIN_PRESETS.map((p) => {
                    const isActive =
                      workMin === p.workMin &&
                      breakMin === p.breakMin &&
                      longBreakMin === p.longBreakMin &&
                      cyclesBeforeLongBreak === p.cyclesBeforeLongBreak;
                    return (
                      <button
                        key={p.label}
                        onClick={() => applyPresetConfig(p, null)}
                        disabled={pomo.running}
                        aria-pressed={isActive}
                        className={cn(
                          "px-4 py-2 rounded-full border text-xs font-black uppercase tracking-widest transition-colors",
                          isActive
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border bg-bg text-muted-fg hover:border-accent hover:text-accent hover:bg-accent-soft",
                          pomo.running && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  {/* Saved custom presets */}
                  {presets.map((p) => (
                    <span
                      key={p.id}
                      className={cn(
                        "group inline-flex items-center overflow-hidden rounded-full border text-xs font-black uppercase tracking-widest transition-colors",
                        activePresetId === p.id
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-border bg-bg text-muted-fg hover:border-accent hover:text-accent hover:bg-accent-soft",
                        pomo.running && "opacity-50"
                      )}
                    >
                      <button
                        onClick={() => applyPresetConfig(p, p.id)}
                        disabled={pomo.running}
                        aria-pressed={activePresetId === p.id}
                        className="px-4 py-2 disabled:cursor-not-allowed"
                        title={`${p.workMin}m focus / ${p.breakMin}m break${
                          p.longBreakMin > 0 && p.cyclesBeforeLongBreak > 0
                            ? ` / ${p.longBreakMin}m long every ${p.cyclesBeforeLongBreak}`
                            : ""
                        }`}
                      >
                        {p.name}
                      </button>
                      <button
                        onClick={() => removePreset(p.id)}
                        disabled={pomo.running}
                        aria-label={`Delete preset ${p.name}`}
                        className="border-l border-border px-2 py-2 text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Custom durations */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label className="text-xs font-bold text-muted-fg tracking-wider mb-2 block">
                    Work (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={workMin}
                    onChange={(e) => applyConfig({ workMin: parseInt(e.target.value, 10) || 1 })}
                    disabled={pomo.running}
                    className="glass-inset w-full rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-fg transition-colors outline-none disabled:opacity-50 focus:border-accent border border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-fg tracking-wider mb-2 block">
                    Break (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={breakMin}
                    onChange={(e) => applyConfig({ breakMin: parseInt(e.target.value, 10) || 1 })}
                    disabled={pomo.running}
                    className="glass-inset w-full rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-fg transition-colors outline-none disabled:opacity-50 focus:border-accent border border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-fg tracking-wider mb-2 block">
                    Long break (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={longBreakMin}
                    onChange={(e) => applyConfig({ longBreakMin: parseInt(e.target.value, 10) || 0 })}
                    disabled={pomo.running}
                    className="glass-inset w-full rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-fg transition-colors outline-none disabled:opacity-50 focus:border-accent border border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-fg tracking-wider mb-2 block">
                    Cycles → long
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={cyclesBeforeLongBreak}
                    onChange={(e) =>
                      applyConfig({ cyclesBeforeLongBreak: parseInt(e.target.value, 10) || 0 })
                    }
                    disabled={pomo.running}
                    className="glass-inset w-full rounded-xl px-4 py-3 text-sm font-mono tabular-nums text-fg transition-colors outline-none disabled:opacity-50 focus:border-accent border border-transparent"
                  />
                </div>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-fg">
                {longBreakMin > 0 && cyclesBeforeLongBreak > 0
                  ? `Long break (${longBreakMin}m) after every ${cyclesBeforeLongBreak} cycles`
                  : "Set long break + cycles above 0 to enable long breaks"}
              </p>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => applyConfig({ autoAdvance: e.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-xs font-bold text-muted-fg uppercase tracking-widest">
                  Auto-start next phase
                </span>
              </label>

              {/* Save current setup as a named preset */}
              <div className="flex gap-2 border-t border-border pt-4">
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCurrentAsPreset();
                  }}
                  placeholder="Save this setup as… (e.g. Deep work 50/10)"
                  disabled={pomo.running}
                  maxLength={50}
                  className="glass-inset w-full rounded-xl px-4 py-2.5 text-xs text-fg placeholder:text-muted-fg/60 transition-colors outline-none disabled:opacity-50 focus:border-accent border border-transparent"
                />
                <button
                  onClick={saveCurrentAsPreset}
                  disabled={pomo.running || !presetName.trim()}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-4 py-2.5 text-xs font-black uppercase tracking-widest text-accent transition-colors hover:bg-accent hover:text-accent-fg",
                    (pomo.running || !presetName.trim()) && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <Save size={13} /> Save
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Timer Hero — 2 cols */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center glass rounded-2xl p-6 sm:p-8">
          {mode === "stopwatch" ? (
            <>
              <div
                className={cn(
                  "relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl border px-4 sm:px-6 py-8 transition-colors",
                  timerRunning && !timerPaused
                    ? "border-accent/40 bg-accent-soft"
                    : "border-border bg-bg-raised/60"
                )}
              >
                {/* recording dot */}
                <AnimatePresence>
                  {timerRunning && !timerPaused && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute right-5 top-5 flex h-3 w-3"
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
                    </motion.span>
                  )}
                </AnimatePresence>

                <p
                  className={cn(
                    "font-mono text-4xl font-extrabold tracking-tight tabular-nums transition-colors sm:text-5xl lg:text-6xl whitespace-nowrap",
                    timerRunning && !timerPaused ? "text-accent" : "text-fg"
                  )}
                >
                  {formatTimer(timerSeconds)}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-fg">
                  {timerRunning && !timerPaused ? "● Rec — focus" : timerRunning ? "Paused" : "Ready"}
                </p>
              </div>
              <button
                onClick={!timerRunning ? startTimer : timerPaused ? resumeTimer : pauseTimer}
                {...magneticHandlers(0.18)}
                disabled={!timerRunning && !sessionTitle.trim() ? true : false}
                className={cn(
                  "mt-6 w-full bg-accent hover:opacity-90 text-accent-fg font-black text-lg rounded-full transition-all py-3 flex items-center justify-center gap-2",
                  (!timerRunning && !sessionTitle.trim()) && "opacity-50 cursor-not-allowed"
                )}
              >
                {!timerRunning ? (
                  <>
                    <Play size={20} /> Start
                  </>
                ) : timerPaused ? (
                  <>
                    <Play size={20} /> Resume
                  </>
                ) : (
                  <>
                    <Pause size={20} /> Pause
                  </>
                )}
              </button>
              {timerRunning && (
                <button
                  onClick={stopTimer}
                  className="mt-2 w-full bg-danger/10 hover:bg-danger/20 text-danger font-black text-sm rounded-full transition-all py-2.5 flex items-center justify-center gap-2 border border-danger/20"
                >
                  <Square size={14} /> Stop & save
                </button>
              )}
              {(saveError || loadError) && (
                <p className="mt-2 w-full rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-danger">
                  {saveError || loadError}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Phase badge — Originkit GravityFall drops the label in on each phase change */}
              <div
                className={cn(
                  "mb-4 flex h-[30px] items-center gap-2 rounded-full border px-3.5 text-[11px] font-black uppercase tracking-widest",
                  PHASE_META[pomo.phase].cls
                )}
              >
                {pomo.phase === "work" ? <Brain size={13} /> : <Coffee size={13} />}
                <GravityFall
                  key={pomo.phase}
                  text={PHASE_META[pomo.phase].label}
                  tag="span"
                  split="char"
                  startY={-220}
                  stagger={0.05}
                  transition={FALL_TRANSITION}
                  font={{ fontSize: 11, lineHeight: 1, fontWeight: 900, letterSpacing: "0.1em" }}
                  color="currentColor"
                />
              </div>
              {/* Timer — SVG ring tracks the phase */}
              <div className="relative flex w-full items-center justify-center py-2">
                {(() => {
                  const total = phaseSeconds(pomo.phase, pomo.config);
                  const R = 130;
                  const C = 2 * Math.PI * R;
                  const frac = Math.max(0, Math.min(1, pomo.seconds / total));
                  return (
                    <>
                      <svg viewBox="0 0 300 300" className="h-auto w-full max-w-[320px] -rotate-90" aria-hidden>
                        <circle cx="150" cy="150" r={R} fill="none" stroke="var(--color-muted)" strokeWidth="6" />
                        <motion.circle
                          cx="150"
                          cy="150"
                          r={R}
                          fill="none"
                          stroke={PHASE_META[pomo.phase].ring}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={C}
                          initial={{ strokeDashoffset: C }}
                          animate={{ strokeDashoffset: C * (1 - frac) }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <p
                          className={cn(
                            "font-mono text-4xl font-extrabold tabular-nums sm:text-6xl",
                            pomoActive ? PHASE_META[pomo.phase].text : "text-fg"
                          )}
                        >
                          {formatClock(pomo.seconds)}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-fg">
                          {pomoActive ? `● ${PHASE_META[pomo.phase].label}` : pomo.paused ? "Paused" : "Ready"}
                        </p>
                        <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest tabular-nums text-muted-fg">
                          {pomo.cycles} cycle{pomo.cycles === 1 ? "" : "s"} • {formatClock(pomo.workSeconds)} focused
                        </p>
                        {cyclesBeforeLongBreak > 0 && longBreakMin > 0 && (
                          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-fg">
                            Long break in {cyclesBeforeLongBreak - (pomo.cycles % cyclesBeforeLongBreak)} cycle{cyclesBeforeLongBreak - (pomo.cycles % cyclesBeforeLongBreak) === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <button
                onClick={!pomo.running ? startPomodoro : pomo.togglePause}
                {...magneticHandlers(0.18)}
                className="mt-6 w-full bg-accent hover:opacity-90 text-accent-fg font-black text-lg rounded-full transition-all py-3 flex items-center justify-center gap-2"
              >
                {!pomo.running ? (
                  <>
                    <Play size={20} /> Start
                  </>
                ) : pomo.paused ? (
                  <>
                    <Play size={20} /> Resume
                  </>
                ) : (
                  <>
                    <Pause size={20} /> Pause
                  </>
                )}
              </button>
              {pomo.running && (
                <div className="mt-2 grid w-full grid-cols-2 gap-2">
                  <button
                    onClick={pomo.skip}
                    className="w-full bg-glass hover:bg-accent-soft text-muted-fg hover:text-accent font-black text-sm rounded-full transition-all py-2.5 flex items-center justify-center gap-2 border border-glass-border"
                  >
                    <SkipForward size={14} /> Skip
                  </button>
                  <button
                    onClick={stopPomodoro}
                    className="w-full bg-danger/10 hover:bg-danger/20 text-danger font-black text-sm rounded-full transition-all py-2.5 flex items-center justify-center gap-2 border border-danger/20"
                  >
                    <Square size={14} /> Stop & save
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Session History — spec §5: filterable (range + subject), rows show
          subject, duration, date, type; total reflects the filter. */}
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tighter">
            History
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-border bg-bg-raised/60 p-1" role="group" aria-label="History range">
              {([
                ["today", "Today"],
                ["7d", "7 days"],
                ["30d", "30 days"],
                ["all", "All"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setHistoryRange(key)}
                  aria-pressed={historyRange === key}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    historyRange === key ? "bg-accent text-accent-fg" : "text-muted-fg hover:text-accent"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              aria-label="Filter by subject"
              value={historySubject}
              onChange={(e) => setHistorySubject(e.target.value)}
              className="glass-inset cursor-pointer rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-fg outline-none"
            >
              <option value="all">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {filteredSessions.length > 0 && (
              <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-muted-fg">
                <span>{filteredSessions.length} sessions</span>
                <span>
                  {formatDuration(filteredSessions.reduce((acc, s) => acc + s.durationMin, 0))} total
                </span>
              </div>
            )}
          </div>
        </div>
        {!loaded ? (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3 w-3" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <EmptyState
            icon={<Timer size={48} />}
            title="No sessions in view"
            description="No sessions match this filter — try a wider range."
          />
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {filteredSessions.map((session) => (
              <div key={session.id} className="group flex items-center justify-between gap-3 p-6 transition-colors hover:bg-muted/30">
                <div className="flex min-w-0 items-center gap-4">
                  {session.subject && (
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: session.subject.color }}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-bold tracking-tight">
                      {session.title}
                    </p>
                    <p className="text-xs text-muted-fg uppercase tracking-widest">
                      {session.subject?.name ?? "General"} •{" "}
                      {formatDate(session.startedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <Badge variant={session.completed ? "success" : "default"}>
                    {session.completed ? "Done" : "Partial"}
                  </Badge>
                  <span className="hidden items-center gap-2 text-xs text-muted-fg uppercase tracking-widest sm:flex">
                    <Clock size={12} />
                    {formatDuration(session.durationMin)}
                  </span>
                  <button
                    onClick={() => handleDeleteSession(session.id)}
                    aria-label="Delete session"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-fg transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared delete confirmation (preset or history session) */}
      <Modal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.kind === "preset" ? "Delete preset" : "Delete session"}
      >
        <div className="space-y-6">
          <p className="text-sm text-muted-fg">
            Delete “{deleteConfirm?.label}”? This cannot be undone.
          </p>
          <div className="flex justify-end gap-4 pt-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
