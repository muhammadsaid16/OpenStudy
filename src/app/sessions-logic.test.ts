// Tests for the session-storage bugs found during the logic sweep:
//   1. createStudySession clamps 0/negative durations to ≥ 1 minute
//   2. importAllData derives a missing endedAt from startedAt + durationMin
//   3. nextRepeatDate clamps month-end overflow (Jan 31 + 1 month = Jan 28,
//      not Mar 3)
import { beforeEach, describe, expect, it } from "vitest";
import { createStudySession, importAllData, createGoal, moveGoal } from "./actions";
import { db } from "@/lib/db";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const baseExport = {
  version: 2,
  exportedAt: new Date().toISOString(),
  subjects: [],
  bundles: [],
};

describe("createStudySession", () => {
  it("clamps a 0-minute duration to 1", async () => {
    const s = await createStudySession({ title: "stale tab", durationMin: 0 });
    expect(s.durationMin).toBe(1);
  });

  it("clamps a negative duration to 1", async () => {
    const s = await createStudySession({ title: "bad timer", durationMin: -5 });
    expect(s.durationMin).toBe(1);
  });

  it("rounds fractional durations instead of storing floats", async () => {
    const s = await createStudySession({ title: "timer drift", durationMin: 25.7 });
    expect(s.durationMin).toBe(26);
  });

  it("keeps a valid duration untouched", async () => {
    const s = await createStudySession({ title: "normal", durationMin: 45 });
    expect(s.durationMin).toBe(45);
  });
});

describe("importAllData — sessions", () => {
  it("derives a missing endedAt from startedAt + durationMin", async () => {
    const startedAt = new Date("2026-09-01T10:00:00.000Z");
    const exportJson = JSON.stringify({
      ...baseExport,
      sessions: [
        {
          title: "legacy session",
          durationMin: 30,
          completed: true,
          startedAt: startedAt.toISOString(),
          // no endedAt — the field this test protects
        },
      ],
    });

    await importAllData(exportJson);

    const [row] = await db.studySessions.toArray();
    expect(row.title).toBe("legacy session");
    const expected = startedAt.getTime() + 30 * 60_000;
    expect(row.endedAt?.getTime()).toBe(expected);
  });

  it("preserves an explicit endedAt from the export", async () => {
    const exportJson = JSON.stringify({
      ...baseExport,
      sessions: [
        {
          title: "with end",
          durationMin: 10,
          completed: true,
          startedAt: "2026-09-01T10:00:00.000Z",
          endedAt: "2026-09-01T11:07:00.000Z",
        },
      ],
    });

    await importAllData(exportJson);

    const [row] = await db.studySessions.toArray();
    expect(row.endedAt?.toISOString()).toBe("2026-09-01T11:07:00.000Z");
  });
});

describe("monthly repeat calendar arithmetic (via moveGoal completion)", () => {
  // nextRepeatDate is private; moveGoal(id, "done") on a repeating goal is
  // the exact path the UI takes, so this pins the real code end-to-end.
  // Every dueDate below must be in the future — moveGoal only derives the
  // next date from dueDate when it hasn't already passed.

  async function monthlyGoalDue(due: Date) {
    const goal = await createGoal({ title: "month-end", horizon: "regular", repeat: "monthly", dueDate: due });
    await moveGoal(goal.id, "done", 0);
    const updated = await db.goals.get(goal.id);
    expect(updated?.dueDate).toBeTruthy();
    return new Date(updated!.dueDate as unknown as string);
  }

  it("a Jan-31 monthly goal lands in February, not March (setMonth skips the month)", async () => {
    const next = await monthlyGoalDue(new Date(2027, 0, 31, 12, 0, 0));
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(1); // February — not March (2)
    expect(next.getDate()).toBe(28); // last day of Feb 2027 (non-leap)
  });

  it("an Oct-31 monthly goal lands on Nov 30, not Dec 30 (Nov 31 overflows)", async () => {
    const next = await monthlyGoalDue(new Date(2026, 9, 31, 12, 0, 0));
    expect(next.getMonth()).toBe(10); // November
    expect(next.getDate()).toBe(30);
  });

  it("keeps the same day when both months have it (Sep 30 → Oct 30)", async () => {
    const next = await monthlyGoalDue(new Date(2026, 8, 30, 12, 0, 0));
    expect(next.getMonth()).toBe(9); // October
    expect(next.getDate()).toBe(30);
  });
});
