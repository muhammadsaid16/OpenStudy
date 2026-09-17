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
  /** Daily study capacity in minutes (default 60). */
  dailyMinutes: number;
  /** Horizon of the generated plan, in days (default 14). */
  horizonDays: number;
  /** Days per week the user studies (default 7; e.g. 6 skips one day). */
  studyDaysPerWeek: number;
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  dailyMinutes: 60,
  horizonDays: 14,
  studyDaysPerWeek: 7,
};

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

  const capacity = deriveCapacity(input.sessions, nowMs);

  const reviewCards = reviewLoadPerDay(input.cards, startMs, days);
  const reviewMinutes = reviewCards.map((n) => Math.round(n * MINUTES_PER_CARD));

  // Weakness practice: distributed across the first days, capacity-permitting.
  const practiceByDay = new Array(days).fill(0);
  const practiceByDayTopics: string[][] = Array.from({ length: days }, () => []);
  const pending: { label: string; minutes: number }[] = input.weakness.map((w) => ({
    label: w.label,
    minutes: w.suggestedMinutes,
  }));
  // One weakness slot per day; more only when days remain after tasks fit.
  let pi = 0;
  for (let d = 0; d < days && pi < pending.length; d++) {
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
  const taskEstimate = (t: TaskRec) => t.estimateMin ?? 20;
  let ti = 0;
  for (let d = 0; d < days && ti < openTasks.length; d++) {
    let free = capacity - reviewMinutes[d] - practiceByDay[d] - taskMinutesByDay[d];
    while (ti < openTasks.length && free >= Math.min(taskEstimate(openTasks[ti]), 15)) {
      const t = openTasks[ti];
      const est = taskEstimate(t);
      const spend = Math.min(est, free);
      taskMinutesByDay[d] += spend;
      tasksByDay[d].push(t.title);
      if (spend < est) {
        t.estimateMin = est - spend; // carry the remainder (input objects are ours)
      }
      free -= spend;
      if (spend >= est) ti++;
      else break;
    }
  }
  // Restore mutated estimates (defensive — input shouldn't be reused anyway).
  for (const t of openTasks) delete (t as any)._restored;

  // Exams land on their dates.
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

  return { days: out, capacityPerDay: capacity, overloadDay, totals };
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
      href: "/review",
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
