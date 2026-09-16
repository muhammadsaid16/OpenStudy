"use client";

// ─── Global Pomodoro engine — shared by /sessions and the dashboard FocusZone ───
//
// A running session is a WALL-CLOCK document persisted to localStorage
// (openstudy.pomodoro.active), owned by a module-level driver — NOT by any
// React component. This is the ghost-session fix: navigating away, reloading,
// or even closing the tab no longer destroys an in-flight session. Every tab
// that mounts a consumer resumes the same session; a stale tick (tab slept
// or closed) is fast-forwarded analytically from the stored timestamps.
//
// Full technique: work → short break, with an optional LONG break every N
// cycles. Last-used config persists separately so the setup survives restarts.

import { useCallback, useEffect, useRef, useState } from "react";

export type PomoPhase = "work" | "break" | "long";

export interface PomoConfig {
  workMin: number;
  breakMin: number;
  longBreakMin: number; // 0 = long break disabled
  cyclesBeforeLongBreak: number; // 0 = long break disabled
  autoAdvance: boolean; // false → pause at each phase boundary
}

export const DEFAULT_POMO_CONFIG: PomoConfig = {
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesBeforeLongBreak: 4,
  autoAdvance: true,
};

export const BUILTIN_PRESETS: (PomoConfig & { label: string })[] = [
  { label: "25/5", workMin: 25, breakMin: 5, longBreakMin: 15, cyclesBeforeLongBreak: 4, autoAdvance: true },
  { label: "50/10", workMin: 50, breakMin: 10, longBreakMin: 20, cyclesBeforeLongBreak: 3, autoAdvance: true },
  { label: "90/15", workMin: 90, breakMin: 15, longBreakMin: 30, cyclesBeforeLongBreak: 2, autoAdvance: true },
];

const LS_CONFIG = "openstudy.pomodoro.config";
const LS_ACTIVE = "openstudy.pomodoro.active";

export function clampConfig(c: Partial<PomoConfig>): PomoConfig {
  const d = { ...DEFAULT_POMO_CONFIG, ...c };
  return {
    workMin: Math.min(180, Math.max(1, Math.round(d.workMin) || 1)),
    breakMin: Math.min(60, Math.max(1, Math.round(d.breakMin) || 1)),
    longBreakMin: Math.min(90, Math.max(0, Math.round(d.longBreakMin) || 0)),
    cyclesBeforeLongBreak: Math.min(12, Math.max(0, Math.round(d.cyclesBeforeLongBreak) || 0)),
    autoAdvance: !!d.autoAdvance,
  };
}

export function loadLastConfig(): PomoConfig | null {
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    if (!raw) return null;
    return clampConfig({ ...DEFAULT_POMO_CONFIG, ...(JSON.parse(raw) as Partial<PomoConfig>) });
  } catch {
    return null;
  }
}

export function saveLastConfig(c: PomoConfig): void {
  try {
    localStorage.setItem(LS_CONFIG, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export function phaseSeconds(phase: PomoPhase, c: PomoConfig): number {
  const min = phase === "work" ? c.workMin : phase === "break" ? c.breakMin : Math.max(1, c.longBreakMin);
  return min * 60;
}

// ─── Phase chime (honors the chime preference) ────────────────────────────────
export function isChimeEnabled(): boolean {
  try {
    const raw = localStorage.getItem("study-prefs");
    if (!raw) return true;
    const p = JSON.parse(raw) as { chimeEnabled?: boolean };
    return p.chimeEnabled !== false;
  } catch {
    return true;
  }
}

export function beep(): void {
  if (!isChimeEnabled()) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    // Soft two-tone instead of a single harsh 880Hz ping.
    const seq: [number, number][] = [[660, 0], [880, 0.18]];
    for (const [freq, offset] of seq) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = freq;
      const t0 = ctx.currentTime + offset;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.start(t0);
      o.stop(t0 + 0.55);
    }
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* audio unavailable */
  }
}

// ─── Active session document ──────────────────────────────────────────────────
export interface ActivePomo {
  startedAt: number; // epoch ms — true session start (for logging/startedAt)
  phaseStartAt: number; // epoch ms — when the CURRENT phase began
  phase: PomoPhase;
  phaseWorkSeconds: number; // workSeconds at the start of the current phase
  workSeconds: number; // accumulated focus seconds this run
  cycles: number; // completed focus cycles this run
  config: PomoConfig; // frozen at start — mid-run config edits can't reshape phases
  title: string;
  subjectId: string | null;
  paused: boolean;
  pausedRemaining: number; // seconds left in the current phase when paused
  lastTickAt: number;
}

export interface PomoSnapshot {
  workSeconds: number;
  cycles: number;
  startedAt: number;
  title: string;
  subjectId: string | null;
}

export function getActivePomo(): ActivePomo | null {
  try {
    const raw = localStorage.getItem(LS_ACTIVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActivePomo;
    if (typeof s.startedAt !== "number" || typeof s.phaseStartAt !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

function persistActive(s: ActivePomo | null): void {
  try {
    if (s) localStorage.setItem(LS_ACTIVE, JSON.stringify(s));
    else localStorage.removeItem(LS_ACTIVE);
  } catch {
    /* storage unavailable */
  }
}

function nextPhaseAfter(phase: PomoPhase, cycles: number, c: PomoConfig): PomoPhase {
  if (phase !== "work") return "work";
  const longDue = c.cyclesBeforeLongBreak > 0 && c.longBreakMin > 0 && cycles % c.cyclesBeforeLongBreak === 0;
  return longDue ? "long" : "break";
}

// Derive the display state of a session at a given wall-clock instant.
// Pure — safe to run against historical timestamps (tests, fast-forward).
export function deriveState(s: ActivePomo, now: number): { phase: PomoPhase; seconds: number; workSeconds: number; cycles: number; phaseStartAt: number; phaseWorkSeconds: number } {
  let { phase, phaseStartAt, phaseWorkSeconds, workSeconds, cycles } = s;
  if (s.paused) {
    return { phase, seconds: Math.max(0, s.pausedRemaining), workSeconds, cycles, phaseStartAt, phaseWorkSeconds };
  }
  // Advance whole completed phases in one jump each (bounded: one iteration
  // per phase boundary crossed, phases are ≥60s). When autoAdvance is OFF a
  // crossed boundary is reported (seconds 0, new phase) and the caller pauses.
  for (let guard = 0; guard < 500; guard++) {
    const phaseLenMs = phaseSeconds(phase, s.config) * 1000;
    const boundary = phaseStartAt + phaseLenMs;
    if (now < boundary) {
      const elapsed = Math.max(0, now - phaseStartAt);
      const seconds = Math.max(0, Math.ceil((boundary - now) / 1000));
      const work = phase === "work" ? phaseWorkSeconds + Math.floor(elapsed / 1000) : workSeconds;
      return { phase, seconds, workSeconds: work, cycles, phaseStartAt, phaseWorkSeconds };
    }
    // Phase completed at `boundary` — carry the overshoot into the next phase.
    if (phase === "work") {
      workSeconds = phaseWorkSeconds + phaseSeconds("work", s.config);
      cycles += 1;
      if (!s.config.autoAdvance) {
        return { phase: nextPhaseAfter(phase, cycles, s.config), seconds: 0, workSeconds, cycles, phaseStartAt: boundary, phaseWorkSeconds: workSeconds };
      }
    }
    phase = nextPhaseAfter(phase, cycles, s.config);
    phaseWorkSeconds = workSeconds;
    phaseStartAt = boundary;
    // If the next phase boundary was already passed too, the loop continues.
  }
  // Degenerate guard (should be unreachable for sane configs).
  return { phase, seconds: 0, workSeconds, cycles, phaseStartAt, phaseWorkSeconds };
}

// Apply the derived state back into the session document (mutating + returns).
function commitDerived(s: ActivePomo, d: ReturnType<typeof deriveState>): ActivePomo {
  s.phase = d.phase;
  s.phaseStartAt = d.phaseStartAt;
  s.phaseWorkSeconds = d.phaseWorkSeconds;
  s.workSeconds = d.workSeconds;
  s.cycles = d.cycles;
  s.lastTickAt = Date.now();
  return s;
}

// ─── Driver (module-level; survives any unmount) ─────────────────────────────
let active: ActivePomo | null = null;
const listeners = new Set<() => void>();
let driver: ReturnType<typeof setInterval> | null = null;
let driverTick = 0;
// Metadata set before a session exists (UI fields are editable while
// idle) — applied on the next start instead of being dropped.
let pendingMeta: { title?: string; subjectId?: string | null } = {};

function emit() {
  listeners.forEach((l) => l());
}

function setDocumentTitle(d: ReturnType<typeof deriveState> | null): void {
  if (typeof document === "undefined") return;
  if (!active || active.paused || !d) {
    document.title = "OpenStudy — Learn Smarter";
    return;
  }
  const m = Math.floor(d.seconds / 60).toString().padStart(2, "0");
  const sec = (d.seconds % 60).toString().padStart(2, "0");
  const label = d.phase === "work" ? "FOCUS" : d.phase === "break" ? "BREAK" : "LONG BREAK";
  document.title = `${m}:${sec} ${label} · OpenStudy`;
}

function onPhaseBoundary(newPhase: PomoPhase): void {
  try {
    beep();
  } catch { /* ignore */ }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      const title = newPhase === "work" ? "Focus time" : "Break over — next phase";
      const body =
        newPhase === "work"
          ? `New focus cycle starting (${active?.config.workMin} min).`
          : active?.config
            ? `Time for a ${active.config.breakMin}-min ${newPhase === "long" ? "long " : ""}break.`
            : "Take a short break.";
      new Notification(`OpenStudy — ${title}`, { body });
    } catch { /* notifications unavailable */ }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pomodoro-phase", { detail: { phase: newPhase } }));
  }
}

function tickOnce(): void {
  if (!active) return;
  const now = Date.now();
  // Multi-tab guard: if another tab ticked within the last 800ms it owns the clock.
  if (now - active.lastTickAt < 800) return;
  const before = active.phase;
  const d = deriveState(active, now);
  // A boundary crossed when the derived phase differs from the committed one.
  // (Checking d.seconds === 0 would MISS the exact-boundary tick, where the
  // derived state already reports the NEW phase at full duration.)
  if (!active.paused && d.phase !== before) {
    onPhaseBoundary(d.phase);
    // autoAdvance OFF → hold at the boundary until the user starts the next
    // phase, instead of silently running a 0-second phase.
    if (!active.config.autoAdvance) {
      active.paused = true;
      active.pausedRemaining = 0;
    }
  }
  commitDerived(active, d);
  persistActive(active);
  setDocumentTitle(d);
  emit();
}

function ensureDriver(): void {
  if (driver !== null) return;
  driver = setInterval(() => {
    tickOnce();
    driverTick += 1;
    // Drop the driver when idle + nobody listening (a new consumer re-arms it).
    if (driverTick % 60 === 0 && !active && listeners.size === 0) stopDriver();
  }, 1000);
}

function stopDriver(): void {
  if (driver !== null) {
    clearInterval(driver);
    driver = null;
  }
}

// ─── Session control ──────────────────────────────────────────────────────────
function refreshActive(): void {
  active = getActivePomo();
}

export function startPomoSession(opts: { config?: PomoConfig; title?: string; subjectId?: string | null }): void {
  const cfg = clampConfig(opts?.config ?? loadLastConfig() ?? DEFAULT_POMO_CONFIG);
  saveLastConfig(cfg);
  const now = Date.now();
  const s: ActivePomo = {
    startedAt: now,
    phaseStartAt: now,
    phase: "work",
    phaseWorkSeconds: 0,
    workSeconds: 0,
    cycles: 0,
    config: cfg,
    // Carry metadata across a restart from a UI that already holds it —
    // including meta set while idle (pendingMeta, see setPomoMeta).
    title: opts?.title ?? active?.title ?? pendingMeta.title ?? "",
    subjectId:
      opts?.subjectId !== undefined
        ? opts.subjectId
        : active?.subjectId ?? pendingMeta.subjectId ?? null,
    paused: false,
    pausedRemaining: 0,
    lastTickAt: now,
  };
  active = s;
  pendingMeta = {}; // consumed
  persistActive(s);
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    try {
      void Notification.requestPermission();
    } catch { /* ignore */ }
  }
  setDocumentTitle(deriveState(s, now));
  ensureDriver();
  emit();
}

export function stopPomoSession(): PomoSnapshot | null {
  if (!active) return null;
  const d = deriveState(active, Date.now());
  const snap: PomoSnapshot = { workSeconds: d.workSeconds, cycles: d.cycles, startedAt: active.startedAt, title: active.title, subjectId: active.subjectId };
  active = null;
  persistActive(null);
  setDocumentTitle(null);
  ensureDriver(); // stays armed briefly so a same-tab restart is instant
  emit();
  return snap;
}

export function setPomoMeta(meta: { title?: string; subjectId?: string | null }): void {
  if (active) {
    if (typeof meta.title === "string") active.title = meta.title;
    if (meta.subjectId !== undefined) active.subjectId = meta.subjectId;
    persistActive(active);
    emit();
  } else {
    if (typeof meta.title === "string") pendingMeta.title = meta.title;
    if (meta.subjectId !== undefined) pendingMeta.subjectId = meta.subjectId;
  }
}

export function pausePomoSession(): void {
  if (!active || active.paused) return;
  const d = deriveState(active, Date.now());
  active.paused = true;
  active.pausedRemaining = d.seconds;
  persistActive(active);
  ensureDriver();
  emit();
}

export function resumePomoSession(): void {
  if (!active || !active.paused) return;
  const phaseLenMs = phaseSeconds(active.phase, active.config) * 1000;
  // Rewind the phase start so the remaining seconds count down correctly.
  active.phaseStartAt = Date.now() - Math.max(0, phaseLenMs - active.pausedRemaining * 1000);
  active.paused = false;
  active.pausedRemaining = 0;
  persistActive(active);
  ensureDriver();
  emit();
}

export function skipPomoPhase(): void {
  if (!active || active.paused) return;
  const now = Date.now();
  const d = deriveState(active, now);
  if (active.phase === "work") {
    // Skipping a work phase does NOT count a completed cycle → short break.
    active.workSeconds = d.workSeconds;
    active.phaseWorkSeconds = d.workSeconds;
    active.phase = "break";
  } else {
    active.phase = "work";
    active.phaseWorkSeconds = active.workSeconds;
  }
  active.phaseStartAt = now;
  persistActive(active);
  ensureDriver();
  emit();
}

// Adopt a persisted session (called when a consumer mounts, or when a tab
// regains focus). Fast-forwards any time lost while all tabs were closed.
// A live in-memory session always wins (multi-tab: the ticking tab owns it).
export function syncPomoEngine(): void {
  if (active) return;
  const s = getActivePomo();
  if (!s) return;
  active = s;
  const d = deriveState(s, Date.now());
  // A boundary crossed while every tab was closed AND autoAdvance is off:
  // the document is parked at 0s in the next phase. Keep it paused so the
  // UI shows a resumable hold instead of a live 00:00 phase.
  if (!s.paused && d.seconds === 0 && !s.config.autoAdvance) {
    active.paused = true;
    active.pausedRemaining = 0;
  }
  commitDerived(active, d);
  persistActive(active);
  setDocumentTitle(d);
  ensureDriver();
}

// ─── React hook — same handle shape the components already use ───────────────
export interface PomodoroHandle {
  phase: PomoPhase;
  seconds: number;
  running: boolean;
  paused: boolean;
  active: boolean;
  cycles: number;
  workSeconds: number;
  config: PomoConfig;
  title: string;
  subjectId: string | null;
  startedAt: number;
  applyConfig: (partial: Partial<PomoConfig>, resetPhase?: boolean) => void;
  setMeta: (meta: { title?: string; subjectId?: string | null }) => void;
  start: () => void;
  togglePause: () => void;
  skip: () => void;
  stop: () => PomoSnapshot;
}

export function usePomodoro(): PomodoroHandle {
  const [version, setVersion] = useState(0);
  const cfgRef = useRef<PomoConfig>(DEFAULT_POMO_CONFIG);

  useEffect(() => {
    syncPomoEngine();
    ensureDriver();
    const bump = () => setVersion((v) => v + 1);
    listeners.add(bump);
    // rAF defers first bump past the effect's sync phase (react-hooks).
    const raf = requestAnimationFrame(bump);
    return () => {
      cancelAnimationFrame(raf);
      listeners.delete(bump);
    };
  }, []);

  // Derived view of the current session (recomputed on each emit).
  void version;
  const s = active;
  const cfg = s?.config ?? cfgRef.current;
  const now = Date.now();
  const d = s ? deriveState(s, now) : null;
  const running = !!s && !s.paused;

  const applyConfig = useCallback((partial: Partial<PomoConfig>, _resetPhase = false) => {
    const next = clampConfig({ ...(loadLastConfig() ?? DEFAULT_POMO_CONFIG), ...partial });
    cfgRef.current = next;
    saveLastConfig(next);
    if (active) return; // mid-run config is frozen; applies to the next start
    emit();
  }, []);

  const start = useCallback(() => {
    startPomoSession({
      config: loadLastConfig() ?? cfgRef.current,
      title: active?.title ?? "",
      subjectId: active?.subjectId ?? null,
    });
  }, []);

  const setMeta = useCallback((meta: { title?: string; subjectId?: string | null }) => {
    setPomoMeta(meta);
  }, []);

  const togglePause = useCallback(() => {
    if (!active) return;
    if (active.paused) resumePomoSession();
    else pausePomoSession();
  }, []);

  const skip = useCallback(() => {
    skipPomoPhase();
  }, []);

  const stop = useCallback((): PomoSnapshot => {
    const snap = stopPomoSession() ?? { workSeconds: 0, cycles: 0, startedAt: Date.now(), title: "", subjectId: null };
    cfgRef.current = loadLastConfig() ?? DEFAULT_POMO_CONFIG;
    return snap;
  }, []);

  return {
    phase: d?.phase ?? "work",
    seconds: d?.seconds ?? phaseSeconds("work", cfg),
    running,
    paused: !!s && s.paused,
    active: !!s && !s.paused,
    cycles: d?.cycles ?? 0,
    workSeconds: d?.workSeconds ?? 0,
    config: cfg,
    title: s?.title ?? "",
    subjectId: s?.subjectId ?? null,
    startedAt: s?.startedAt ?? now,
    applyConfig,
    setMeta,
    start,
    togglePause,
    skip,
    stop,
  };
}

