// ─── Study Planner (pure) — Agent 6 — Contract 4 (lib/contracts.ts) ──
// Turns the user's real learning data into a distributed daily plan:
//
//   Exam dates + due-card forecast + weakness signals + open tasks
//     ↓  (reviews are PROTECTED — nothing displaces them)
//   capacity per day → weakness practice first → tasks fill the rest
//
// Pure: no db, no Date.now(). The action layer (getPlannerData) gathers
// inputs; /plan renders the output.

import type { FlashcardRec, TaskRec } from "@/lib/db";
import type { NextAction, PlannerDay, WeaknessSignal } from "@/lib/contracts";

/** Minutes of focused work the review of one card is budgeted at. */
const MINUTES_PER_CARD = 0.35; // ~21 cards / 7.5 min ≈ 20 cards per 10 min

export interface PlannerConfig {
  /** Fallback capacity when the user has no session history (default 60). */
  dailyMinutes: number;
  /**
   * Explicit capacity in minutes. Null (the default) derives capacity from the
   * user's real sessions instead — the planner's original behaviour.
   */
  capacityMinutes?: number | null;
  /** Horizon of the generated plan, in days (default 14). */
  horizonDays: number;
  /**
   * Weekdays (0 = Sunday … 6 = Saturday) study work may be placed on. Empty
   * or absent means every day. Work due on a day the user does not study rolls
   * forward to the next study day rather than disappearing — and when a card is
   * due after the last study day of the horizon it stays on the horizon's last
   * day, so the load is still visible.
   *
   * (This replaces the former `studyDaysPerWeek` knob, which was declared and
   * defaulted but never read by the plan — a setting that silently did nothing.)
   */
  studyDays?: number[];
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  dailyMinutes: 60,
  capacityMinutes: null,
  horizonDays: 14,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
};

/** Capacity bounds — a plan built on 5 or 5000 minutes a day is not a plan. */
const MIN_CAPACITY = 10;
const MAX_CAPACITY = 240;

/** Days before an exam whose capacity an exam may claim (latest-first). */
export const EXAM_PREP_WINDOW_DAYS = 7;

/** True for each day in the horizon the user studies on. */
export function studyDayMask(
  startDow: number,
  days: number,
  studyDays: number[] | undefined
): boolean[] {
  const set = new Set(
    studyDays && studyDays.length > 0 ? studyDays.filter((d) => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6]
  );
  if (set.size === 0) for (let d = 0; d <= 6; d++) set.add(d);
  return Array.from({ length: days }, (_, d) => set.has((startDow + d) % 7));
}

/**
 * Push each day's work forward onto the next study day. Reviews are protected,
 * so a card due on a rest day is not dropped: its minutes move to the next day
 * the user actually studies. Anything left with no study day ahead of it stays
 * on the last day of the horizon.
 */
export function rollForwardToStudyDays(values: number[], allowed: boolean[]): number[] {
  const out = new Array(values.length).fill(0);
  let carry = 0;
  for (let d = 0; d < values.length; d++) {
    carry += values[d];
    if (allowed[d]) {
      out[d] = carry;
      carry = 0;
    }
  }
  if (carry > 0 && values.length > 0) out[values.length - 1] += carry;
  return out;
}

/**
 * The order work should be placed in.
 *
 * With no exam inside the horizon this is simply day 0 upward. With an exam, the
 * days immediately before it come FIRST, latest-first — so a student ramps into
 * the exam (`exam at day 10` → day 9, then 8, then 7…) instead of spreading the
 * same work evenly across the whole horizon. Reviews are unaffected: they are
 * due-date driven and protected; only practice and tasks can be pulled.
 */
export function examWeightedWorkOrder(
  days: number,
  examDayIdxs: number[],
  allowed: boolean[],
  windowDays = EXAM_PREP_WINDOW_DAYS
): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const examDay of [...examDayIdxs].sort((a, b) => a - b)) {
    for (let d = examDay - 1; d >= Math.max(0, examDay - windowDays); d--) {
      if (allowed[d] && !seen.has(d)) {
        seen.add(d);
        order.push(d);
      }
    }
  }
  for (let d = 0; d < days; d++) if (allowed[d] && !seen.has(d)) order.push(d);
  return order;
}

/** The user's weekly average focus time, derived from real sessions. */
export function deriveCapacity(
  sessions: { startedAt: Date | string; durationMin: number }[],
  nowMs: number = Date.now()
): number {
  const cutoff = nowMs - 14 * 86_400_000;
  const total = sessions
    .filter((s) => new Date(s.startedAt).getTime() >= cutoff)
  .reduce((acc, s) => acc + s.durationMin, 0);
  if (total <= 0) return DEFAULT_PLANNER_CONFIG.dailyMinutes;
  return Math.max(10, Math.min(240, Math.round((total / 14) * 1.15)));
}

/**
 * The day-by-day review load from `from` onward, in cards/day. Cards due
 * before `from` count on day 0 (they don't disappear by being ignored).
 */
export function reviewLoadPerDay(
  cards: FlashcardRec[],
  fromMs: number,
  days: number
): number[] {
  const load = new Array(days).fill(0);
  for (const c of cards) {
    const due = new Date(c.nextReview).getTime();
    let dayIdx: number;
    if (due <= fromMs) dayIdx = 0; // already due → today
    else dayIdx = Math.floor((due - fromMs) / 86_400_000);
    if (dayIdx < days) load[dayIdx] += 1;
  }
  return load;
}

export interface PlanInput {
  cards: FlashcardRec[];
  tasks: TaskRec[];
  weakness: WeaknessSignal[];
  exams: { title: string; dueDate: Date | string | null; status: string }[];
  sessions: { startedAt: Date | string; durationMin: number }[];
  config?: Partial<PlannerConfig>;
  /** Evaluation instant — injectable for tests; defaults to now. */
  nowMs?: number;
}

export interface PlanResult {
  days: PlannerDay[];
  capacityPerDay: number;
  /** Where that capacity came from — manual setting or recent sessions. */
  capacitySource: "manual" | "derived";
  /** Study days the plan was allowed to use (empty-safe: all seven). */
  studyDays: number[];
  /** First day where the plan can't fit the recommended work. */
  overloadDay: string | null;
  totals: { reviewMinutes: number; practiceMinutes: number; taskMinutes: number };
}

export function buildPlan(input: PlanInput): PlanResult {
  const config = { ...DEFAULT_PLANNER_CONFIG, ...input.config };
  const nowMs = input.nowMs ?? Date.now();
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const days = config.horizonDays;

  // Capacity: the user's own number wins; otherwise the honest estimate from
  // what they actually studied in the last fortnight.
  const manual = typeof config.capacityMinutes === "number" && config.capacityMinutes > 0;
  const capacity = manual
    ? Math.max(MIN_CAPACITY, Math.min(MAX_CAPACITY, Math.round(config.capacityMinutes!)))
    : deriveCapacity(input.sessions, nowMs);
  const capacitySource: "manual" | "derived" = manual ? "manual" : "derived";

  // Study days: work cannot be placed on a day the user doesn't study. A card
  // due on a rest day rolls forward to the next study day (reviews are
  // protected — nothing vanishes).
  const allowed = studyDayMask(start.getDay(), days, config.studyDays);
  const studyDays = config.studyDays && config.studyDays.length > 0
    ? [...new Set(config.studyDays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];
  const reviewCards = rollForwardToStudyDays(reviewLoadPerDay(input.cards, startMs, days), allowed);
  const reviewMinutes = reviewCards.map((n) => Math.round(n * MINUTES_PER_CARD));

  // Exams inside the horizon pull practice and tasks toward their days.
  const examDayIdxs: number[] = [];
  for (const e of input.exams) {
    if (!e.dueDate || e.status === "abandoned") continue;
    const dayIdx = Math.floor((new Date(e.dueDate).getTime() - startMs) / 86_400_000);
    if (dayIdx >= 0 && dayIdx < days) examDayIdxs.push(dayIdx);
  }
  const workOrder = examWeightedWorkOrder(days, examDayIdxs, allowed);

  // Weakness practice: capacity-permitting, on the days the work order says
  // come first (the run-up to an exam when one is in view).
  const practiceByDay = new Array(days).fill(0);
  const practiceByDayTopics: string[][] = Array.from({ length: days }, () => []);
  const pending: { label: string; minutes: number }[] = input.weakness.map((w) => ({
    label: w.label,
    minutes: w.suggestedMinutes,
  }));
  // One weakness slot per day; more only when days remain after tasks fit.
  let pi = 0;
  for (const d of workOrder) {
    if (pi >= pending.length) break;
    const item = pending[pi];
    const used = reviewMinutes[d];
    const free = Math.max(0, capacity - used);
    const spend = Math.min(item.minutes, free);
    if (spend >= 10) {
      practiceByDay[d] += spend;
      practiceByDayTopics[d].push(item.label);
      pi++;
    } else if (spend > 0) {
      // Partial: split the block across days.
      item.minutes -= spend;
      practiceByDay[d] += spend;
      if (!practiceByDayTopics[d].includes(item.label)) practiceByDayTopics[d].push(item.label);
    }
    if (item.minutes <= 0) pi++;
  }

  // Tasks: by due date first (overdue first), then by order. Fit into the
  // remaining capacity after reviews + practice.
  const openTasks = input.tasks
    .filter((x) => x.status !== "done")
    .sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      return a.order - b.order;
    });
  const taskMinutesByDay = new Array(days).fill(0);
  const tasksByDay: string[][] = Array.from({ length: days }, () => []);
  // Schedule adjustments (carrying a task's remainder to the next day) live
  // here, keyed by id — never written back onto the caller's TaskRec, which
  // the page renders and must keep showing the user's own estimate.
  const remainingEstimates = new Map<string, number>();
  const taskEstimate = (t: TaskRec) => remainingEstimates.get(t.id) ?? (t.estimateMin ?? 20);
  let ti = 0;
  for (const d of workOrder) {
    if (ti >= openTasks.length) break;
    let free = capacity - reviewMinutes[d] - practiceByDay[d] - taskMinutesByDay[d];
    while (ti < openTasks.length && free >= Math.min(taskEstimate(openTasks[ti]), 15)) {
      const t = openTasks[ti];
      const est = taskEstimate(t);
      const spend = Math.min(est, free);
      taskMinutesByDay[d] += spend;
      tasksByDay[d].push(t.title);
      if (spend < est) {
        // Carry the remainder WITHOUT mutating the caller's TaskRec —
        // the page renders these records and must never see a schedule-
        // adjusted value in place of the user's own estimate.
        remainingEstimates.set(t.id, est - spend);
      }
      free -= spend;
      if (spend >= est) ti++;
      else break;
    }
  }

  // Exams land on their dates (indices resolved above, for the work order).
  const examByDay: string[][] = Array.from({ length: days }, () => []);
  for (const e of input.exams) {
    if (!e.dueDate || e.status === "abandoned") continue;
    const due = new Date(e.dueDate).getTime();
    const dayIdx = Math.floor((due - startMs) / 86_400_000);
    if (dayIdx >= 0 && dayIdx < days) examByDay[dayIdx].push(e.title);
  }

  // Assemble the days.
  const out: PlannerDay[] = [];
  let overloadDay: string | null = null;
  const totals = { reviewMinutes: 0, practiceMinutes: 0, taskMinutes: 0 };
  for (let d = 0; d < days; d++) {
    const date = new Date(startMs + d * 86_400_000);
    const day: PlannerDay = {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      reviewMinutes: reviewMinutes[d],
      practiceMinutes: practiceByDay[d],
      taskMinutes: taskMinutesByDay[d],
      dueCount: reviewCards[d],
      taskTitles: tasksByDay[d],
      examTitles: examByDay[d],
      totalMinutes: reviewMinutes[d] + practiceByDay[d] + taskMinutesByDay[d],
    };
    totals.reviewMinutes += day.reviewMinutes;
    totals.practiceMinutes += day.practiceMinutes;
    totals.taskMinutes += day.taskMinutes;
    if (!overloadDay && day.totalMinutes > capacity * 1.5) overloadDay = day.date;
    out.push(day);
  }

  return { days: out, capacityPerDay: capacity, capacitySource, studyDays, overloadDay, totals };
}

// ─── Next Action (Contract 3) ────────────────────────────────────
export interface NextActionInput {
  dueCount: number;
  dueOldestDays: number | null;
  weakness: WeaknessSignal[];
  openTasks: { id: string; title: string; dueDate: Date | string | null }[];
  nextExam: { title: string; dueDate: Date | string | null } | null;
  nowMs?: number;
}

/**
 * The single best thing to do next. Reviews are protected: when cards are
 * due, nothing else outranks them. Weakness practice outranks tasks; an
 * exam inside its warning window (≤3 days) outranks everything except due
 * reviews.
 */
export function nextAction(input: NextActionInput): NextAction {
  const nowMs = input.nowMs ?? Date.now();

  if (input.dueCount > 0) {
    const oldest = input.dueOldestDays != null ? Math.round(input.dueOldestDays) : null;
    return {
      kind: "due_reviews",
      title: input.dueCount === 1 ? "Review 1 due card" : `Review ${input.dueCount} due cards`,
      detail: oldest != null && oldest >= 1 ? `The oldest has waited ${oldest} day${oldest === 1 ? "" : "s"}` : "Reviews are protected — nothing displaces them",
      // The old /review is the study-time analytics page — a dead end. The
      // Library Study tab hosts the review runner (and can review all due).
      href: "/subjects?tab=study",
      minutes: Math.max(5, Math.round(input.dueCount * MINUTES_PER_CARD)),
    };
  }

  if (input.nextExam?.dueDate) {
    const daysAway = Math.ceil((new Date(input.nextExam.dueDate).getTime() - nowMs) / 86_400_000);
    // Only upcoming exams trigger prep (a past exam date must not nag forever).
    if (daysAway >= 0 && daysAway <= 3) {
      return {
        kind: "exam_prep",
        title: `${input.nextExam.title} in ${Math.max(daysAway, 0)} day${daysAway === 1 ? "" : "s"}`,
        detail: "Run a targeted exam on its topics",
        href: "/exam",
        minutes: 20,
      };
    }
  }

  const top = input.weakness[0];
  if (top) {
    return {
      kind: "weak_practice",
      title: `Practice ${top.label}`,
      detail: top.evidence,
      href: "/plan",
      minutes: top.suggestedMinutes,
    };
  }

  const task = input.openTasks[0];
  if (task) {
    return {
      kind: "task",
      title: task.title,
      detail: task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : "Next open task",
      href: "/plan",
      minutes: 20,
    };
  }

  return {
    kind: "planned_session",
    title: "Start a focus session",
    detail: "Nothing urgent — bank some focus time",
    href: "/sessions",
    minutes: 25,
  };
}
