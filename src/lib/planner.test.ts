import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNER_CONFIG,
  buildPlan,
  deriveCapacity,
  nextAction,
  reviewLoadPerDay,
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
    expect(a.href).toBe("/review");
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
