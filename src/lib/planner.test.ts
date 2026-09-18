import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNER_CONFIG,
  buildPlan,
  deriveCapacity,
  examWeightedWorkOrder,
  nextAction,
  reviewLoadPerDay,
  rollForwardToStudyDays,
  studyDayMask,
  type PlanInput,
} from "@/lib/planner";
import type { FlashcardRec, TaskRec } from "@/lib/db";
import type { WeaknessSignal } from "@/lib/contracts";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function card(daysUntilDue: number): FlashcardRec {
  return {
    id: `c${daysUntilDue}`,
    front: "F",
    back: "B",
    difficulty: 3,
    easeFactor: 2.5,
    intervalDays: 1,
    nextReview: new Date(NOW + daysUntilDue * DAY),
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: new Date(NOW - DAY),
    updatedAt: new Date(NOW - DAY),
  };
}

function task(over: Partial<TaskRec>): TaskRec {
  return {
    id: "t",
    title: "Task",
    status: "todo",
    order: 0,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...over,
  };
}

const weak = (over: Partial<WeaknessSignal>): WeaknessSignal => ({
  topicId: "t1",
  subjectId: "s1",
  label: "Mechanics",
  score: 60,
  evidence: "3 lapses",
  trend: "flat",
  suggestedMinutes: 20,
  ...over,
});

describe("deriveCapacity", () => {
  it("derives the weekly-average from real sessions with a 15% headroom", () => {
    const sessions = Array.from({ length: 7 }, () => ({ startedAt: new Date(NOW - DAY), durationMin: 60 }));
    expect(deriveCapacity(sessions, NOW)).toBe(Math.round((420 / 14) * 1.15));
  });

  it("falls back to 60 when there is no history, and clamps to sane bounds", () => {
    expect(deriveCapacity([], NOW)).toBe(DEFAULT_PLANNER_CONFIG.dailyMinutes);
    expect(deriveCapacity([{ startedAt: new Date(NOW - DAY), durationMin: 1000 }], NOW)).toBeLessThanOrEqual(240);
    expect(deriveCapacity([{ startedAt: new Date(NOW - DAY), durationMin: 3 }], NOW)).toBeGreaterThanOrEqual(10);
  });
});

describe("reviewLoadPerDay", () => {
  it("buckets cards by due day; overdue cards land on day 0", () => {
    const cards = [card(0), card(-2), card(1), card(1), card(9)];
    const load = reviewLoadPerDay(cards, NOW, 14);
    expect(load[0]).toBe(2); // due today + overdue
    expect(load[1]).toBe(2);
    expect(load[9]).toBe(1);
    expect(load[13]).toBe(0);
  });
});

describe("buildPlan", () => {
  // 14 × 60-min sessions over the window → capacity ≈ 69 min/day.
  const richSessions = Array.from({ length: 14 }, () => ({ startedAt: new Date(NOW - DAY), durationMin: 60 }));
  const mk = (over: Partial<PlanInput> = {}): PlanInput => ({
    cards: [],
    tasks: [],
    weakness: [],
    exams: [],
    sessions: richSessions,
    nowMs: NOW,
    ...over,
  });

  it("reviews get their minutes before anything else", () => {
    const plan = buildPlan(mk({ cards: [card(0), card(0), card(0), card(0), card(0), card(0), card(0), card(0), card(0), card(0)] }));
    expect(plan.days[0].reviewMinutes).toBeGreaterThan(0);
    expect(plan.days[0].dueCount).toBe(10);
  });

  it("weakness practice fills the earliest day with free capacity", () => {
    const plan = buildPlan(mk({ weakness: [weak({ suggestedMinutes: 30 })] }));
    expect(plan.days[0].practiceMinutes).toBe(30);
    expect(plan.totals.practiceMinutes).toBe(30);
  });

  it("tasks are distributed by due date and order, respecting capacity", () => {
    const tasks = [
      task({ id: "a", title: "A", dueDate: new Date(NOW + 3 * DAY), estimateMin: 30 }),
      task({ id: "b", title: "B", estimateMin: 30 }),
      task({ id: "c", title: "C", estimateMin: 2000, status: "done" }),
    ];
    const plan = buildPlan(mk({ tasks }));
    const scheduled = plan.days.flatMap((d) => d.taskTitles);
    expect(scheduled).toContain("A");
    expect(scheduled).toContain("B");
    expect(scheduled).not.toContain("C");
    // Dated tasks come first (undated sort last, by order).
    const dayOfB = plan.days.findIndex((d) => d.taskTitles.includes("B"));
    const dayOfA = plan.days.findIndex((d) => d.taskTitles.includes("A"));
    expect(dayOfA).toBeLessThanOrEqual(dayOfB);
  });

  it("exams land on their dates and are carried in examTitles", () => {
    const plan = buildPlan(mk({ exams: [{ title: "Physics", dueDate: new Date(NOW + 2 * DAY), status: "in_progress" }] }));
    expect(plan.days[2].examTitles).toEqual(["Physics"]);
  });

  it("totals reconcile and overload is flagged when capacity is blown", () => {
    // ~400 cards due per day ≈ 140 review minutes against a 69-minute
    // budget that practice/tasks also draw from — the plan must flag it.
    const cards = Array.from({ length: 5600 }, (_, i) => card(i % 14));
    const plan = buildPlan(mk({ cards }));
    expect(plan.totals.reviewMinutes).toBe(plan.days.reduce((a, d) => a + d.reviewMinutes, 0));
    expect(plan.overloadDay).not.toBeNull();
  });
});

// ─── Study days + exam-weighted distribution (the plan's real knobs) ──
describe("study days", () => {
  const richSessions = Array.from({ length: 14 }, () => ({ startedAt: new Date(NOW - DAY), durationMin: 60 }));
  const mk = (over: Partial<PlanInput> = {}): PlanInput => ({
    cards: [],
    tasks: [],
    weakness: [],
    exams: [],
    sessions: richSessions,
    nowMs: NOW,
    ...over,
  });
  const startDow = new Date(NOW).getDay();

  it("builds the week mask from the configured weekday set", () => {
    expect(studyDayMask(0, 7, [1, 3])).toEqual([false, true, false, true, false, false, false]);
    // A weekday set and its wrap-around across weeks
    expect(studyDayMask(5, 3, [6])).toEqual([false, true, false]);
    // Empty/undefined = every day (never "no study days at all")
    expect(studyDayMask(0, 3, [])).toEqual([true, true, true]);
    expect(studyDayMask(0, 3, undefined)).toEqual([true, true, true]);
  });

  it("rolls a rest day's work onto the next study day, never dropping it", () => {
    expect(rollForwardToStudyDays([1, 1, 1, 1], [false, true, false, true])).toEqual([0, 2, 0, 2]);
    // Nothing left to roll into before the horizon ends: it stays on the last day.
    expect(rollForwardToStudyDays([0, 0, 0, 1], [true, false, false, false])).toEqual([0, 0, 0, 1]);
    // With every day allowed the input is returned untouched.
    expect(rollForwardToStudyDays([2, 0, 5], [true, true, true])).toEqual([2, 0, 5]);
  });

  it("places reviews only on study days — a card due on a rest day moves to the next one", () => {
    const studyDow = (startDow + 3) % 7;
    const plan = buildPlan(mk({ cards: [card(0)], config: { studyDays: [studyDow] } }));
    expect(plan.days[0].reviewMinutes).toBe(0);
    expect(plan.days[3].dueCount).toBe(1);
    expect(plan.studyDays).toEqual([studyDow]);
    // Nothing is scheduled on a day the user does not study.
    plan.days.forEach((d, i) => {
      if (d.totalMinutes > 0) expect((startDow + i) % 7).toBe(studyDow);
    });
  });

  it("keeps a card due after the last study day on the horizon's final day", () => {
    const studyDow = (startDow + 3) % 7; // study days are 3 and 10
    const plan = buildPlan(mk({ cards: [card(11)], config: { studyDays: [studyDow] } }));
    expect(plan.days[13].dueCount).toBe(1);
  });
});

describe("capacity settings", () => {
  const mk = (over: Partial<PlanInput> = {}): PlanInput => ({
    cards: [],
    tasks: [],
    weakness: [],
    exams: [],
    sessions: [],
    nowMs: NOW,
    ...over,
  });

  it("an explicit capacity wins over the session-derived estimate", () => {
    const plan = buildPlan(mk({ config: { capacityMinutes: 45 } }));
    expect(plan.capacityPerDay).toBe(45);
    expect(plan.capacitySource).toBe("manual");
  });

  it("clamps absurd capacities and falls back to derivation when unset", () => {
    expect(buildPlan(mk({ config: { capacityMinutes: 5000 } })).capacityPerDay).toBe(240);
    expect(buildPlan(mk({ config: { capacityMinutes: 1 } })).capacityPerDay).toBe(10);
    const derived = buildPlan(mk({ sessions: [{ startedAt: new Date(NOW - DAY), durationMin: 60 }] }));
    expect(derived.capacitySource).toBe("derived");
  });
});

describe("exam-weighted work order", () => {
  const all = Array.from({ length: 14 }, () => true);

  it("with no exam inside the horizon the order is simply day 0 upward", () => {
    expect(examWeightedWorkOrder(14, [], all)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("an exam pulls its run-up forward, latest-first", () => {
    const order = examWeightedWorkOrder(14, [10], all);
    expect(order.slice(0, 7)).toEqual([9, 8, 7, 6, 5, 4, 3]);
    expect(order[7]).toBe(0); // then the remaining days, ascending
    expect(order).toContain(10); // the exam day itself is never a prep slot
    expect(order.slice(0, 7)).not.toContain(10);
  });

  it("never places work on a non-study day", () => {
    const oddOnly = Array.from({ length: 14 }, (_, d) => d % 2 === 1);
    const order = examWeightedWorkOrder(14, [10], oddOnly);
    expect(order.every((d) => d % 2 === 1)).toBe(true);
    expect(order).toHaveLength(7);
  });
});

describe("exam-aware planning", () => {
  const richSessions = Array.from({ length: 14 }, () => ({ startedAt: new Date(NOW - DAY), durationMin: 60 }));
  const mk = (over: Partial<PlanInput> = {}): PlanInput => ({
    cards: [],
    tasks: [],
    weakness: [],
    exams: [{ title: "Physics", dueDate: new Date(NOW + 6 * DAY), status: "in_progress" }],
    sessions: richSessions,
    nowMs: NOW,
    ...over,
  });

  it("practice lands in the run-up to the exam, not on day 0", () => {
    const plan = buildPlan(mk({ weakness: [weak({ suggestedMinutes: 30 })] }));
    expect(plan.days[5].practiceMinutes).toBe(30);
    expect(plan.days[0].practiceMinutes).toBe(0);
  });

  it("tasks fill the run-up too, before the exam day", () => {
    const tasks = [task({ id: "a", title: "A", estimateMin: 30 }), task({ id: "b", title: "B", estimateMin: 30 })];
    const plan = buildPlan(mk({ tasks }));
    const daysWithTasks = plan.days.flatMap((d, i) => (d.taskTitles.length > 0 ? [i] : []));
    expect(daysWithTasks.length).toBeGreaterThan(0);
    for (const d of daysWithTasks) expect(d).toBeLessThan(6);
  });

  it("without an exam the same work still starts on day 0", () => {
    const plan = buildPlan(mk({ exams: [], weakness: [weak({ suggestedMinutes: 30 })] }));
    expect(plan.days[0].practiceMinutes).toBe(30);
  });
});

describe("nextAction (Contract 3)", () => {
  it("due reviews outrank everything", () => {
    const a = nextAction({
      dueCount: 12,
      dueOldestDays: 3,
      weakness: [weak({})],
      openTasks: [{ id: "t", title: "Task", dueDate: null }],
      nextExam: { title: "E", dueDate: new Date(NOW) },
      nowMs: NOW,
    });
    expect(a.kind).toBe("due_reviews");
    // Points at the Library Study tab (the review runner), not /review —
    // that route is the study-time analytics page.
    expect(a.href).toBe("/subjects?tab=study");
  });

  it("an exam within 3 days outranks weakness but not reviews; past exams never nag", () => {
    const args = {
      dueCount: 0,
      dueOldestDays: null,
      weakness: [weak({})],
      openTasks: [],
    };
    expect(nextAction({ ...args, nextExam: { title: "Physics", dueDate: new Date(NOW + 2 * DAY) }, nowMs: NOW }).kind).toBe("exam_prep");
    expect(nextAction({ ...args, nextExam: { title: "Old", dueDate: new Date(NOW - 5 * DAY) }, nowMs: NOW }).kind).toBe("weak_practice");
  });

  it("weakness beats tasks, tasks beat idle", () => {
    const args = { dueCount: 0, dueOldestDays: null, nextExam: null };
    expect(nextAction({ ...args, weakness: [weak({})], openTasks: [], nowMs: NOW }).kind).toBe("weak_practice");
    expect(nextAction({ ...args, weakness: [], openTasks: [{ id: "t", title: "Read ch4", dueDate: null }], nowMs: NOW }).kind).toBe("task");
    expect(nextAction({ ...args, weakness: [], openTasks: [], nowMs: NOW }).kind).toBe("planned_session");
  });
});
