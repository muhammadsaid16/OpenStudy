import { describe, expect, it } from "vitest";
import {
  MAX_INTERVAL_DAYS,
  deriveFsrsState,
  deriveFsrsStateFromLogs,
  gradeFromQuality,
  initialStability,
  intervalFor,
  nextDifficulty,
  nextStabilityAfterForget,
  nextStabilityAfterRecall,
  retrievability,
  stepFsrs,
} from "@/lib/fsrs";
import { isCorrect } from "@/lib/card-status";

// Deterministic helper: N good reviews AT each computed interval (the real
// spaced schedule, not fixed 1-day gaps). Returns the final state and the
// per-review growth multipliers (stability_after / stability_before).
function simulateGood(n: number) {
  const DAY = 86_400_000;
  let state = { stability: 0, difficulty: 5, lapses: 0, lastReview: null as number | null, reviewCount: 0 };
  let now = 0;
  let prev = 0;
  const mults: number[] = [];
  for (let i = 0; i < n; i++) {
    const step = stepFsrs(state, "good", now);
    if (prev > 0) mults.push(step.next.stability / prev);
    state = step.next;
    prev = state.stability;
    now += step.intervalDays * DAY;
  }
  return { state, mults };
}

describe("gradeFromQuality mapping (contract 6)", () => {
  it("maps the app's 0/3/5 buttons onto FSRS grades", () => {
    expect(gradeFromQuality(0)).toBe("again");
    expect(gradeFromQuality(3)).toBe("hard");
    expect(gradeFromQuality(5)).toBe("easy");
    // Out-of-range inputs still land in the scale: sub-3 is a failed recall
    // (again), never a passing grade.
    expect(gradeFromQuality(1)).toBe("again");
    expect(gradeFromQuality(2)).toBe("again");
    expect(gradeFromQuality(4)).toBe("good");
  });

  it("keeps isCorrect(>=3) as the pass boundary", () => {
    for (const q of [0, 1, 2, 3, 4, 5]) {
      expect(isCorrect(q)).toBe(gradeFromQuality(q) !== "again");
    }
  });
});

describe("FSRS-4.5 core math", () => {
  it("initial stability follows w1..w4 by grade", () => {
    expect(initialStability("again")).toBeCloseTo(0.4872, 6);
    expect(initialStability("hard")).toBeCloseTo(1.4003, 6);
    expect(initialStability("good")).toBeCloseTo(3.7145, 6);
    expect(initialStability("easy")).toBeCloseTo(13.8206, 6);
  });

  it("retrievability decays from 1 and reaches ~0.9 at stability", () => {
    expect(retrievability(5, 0)).toBe(1);
    // At t = stability, r = (1 + FACTOR)^DECAY — the FSRS calibration point.
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
    expect(retrievability(10, 20)).toBeLessThan(0.9);
    expect(retrievability(0, 5)).toBe(0);
  });

  it("harder grades grow stability less: easy > good > hard", () => {
    const base = { stability: 5, difficulty: 5, lapses: 0, lastReview: 0, reviewCount: 1 };
    const r = retrievability(5, 1);
    const sEasy = nextStabilityAfterRecall(base.difficulty, base.stability, r, "easy");
    const sGood = nextStabilityAfterRecall(base.difficulty, base.stability, r, "good");
    const sHard = nextStabilityAfterRecall(base.difficulty, base.stability, r, "hard");
    expect(sEasy).toBeGreaterThan(sGood);
    expect(sGood).toBeGreaterThan(sHard);
  });

  it("a lapse never leaves the card more stable than before", () => {
    const r = retrievability(10, 3);
    const s = nextStabilityAfterForget(5, 10, r);
    expect(s).toBeLessThanOrEqual(10);
    expect(s).toBeGreaterThan(0);
  });

  it("difficulty is clamped to 1..10 and mean-reverts upward for good answers", () => {
    const d = nextDifficulty(9, "good");
    expect(d).toBeLessThan(9);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(nextDifficulty(1, "again")).toBeGreaterThan(1);
    expect(nextDifficulty(5, "easy")).toBeLessThanOrEqual(10);
  });

  it("intervalFor hits the requested retention and respects the ceiling", () => {
    // interval that yields r≈0.9 for s=10 must be ≈ s.
    expect(intervalFor(10)).toBeGreaterThanOrEqual(9);
    expect(intervalFor(10)).toBeLessThanOrEqual(12);
    expect(intervalFor(100_000)).toBe(MAX_INTERVAL_DAYS);
  });
});

describe("stepFsrs scheduling dynamics", () => {
  it("first review sets initial stability by grade and counts the review", () => {
    const fresh = { stability: 0, difficulty: 5, lapses: 0, lastReview: null, reviewCount: 0 };
    const now = 1_700_000_000_000;
    const good = stepFsrs(fresh, "good", now);
    expect(good.next.stability).toBeCloseTo(initialStability("good"), 6);
    expect(good.next.reviewCount).toBe(1);
    expect(good.next.lastReview).toBe(now);
    expect(good.wasLapse).toBe(false);
    expect(good.intervalDays).toBeGreaterThan(0);
  });

  it("a lapse increments lapses and schedules the card sooner than a pass", () => {
    const { state } = simulateGood(3);
    const now = state.lastReview! + 86_400_000;
    const lapse = stepFsrs(state, "again", now);
    const pass = stepFsrs(state, "good", now);
    expect(lapse.next.lapses).toBe(1);
    expect(lapse.next.stability).toBeLessThan(pass.next.stability);
    expect(lapse.intervalDays).toBeLessThan(pass.intervalDays);
  });

  it("repeated good reviews grow stability, and the growth MULTIPLIER shrinks", () => {
    // FSRS growth compounds in absolute days, but each at-interval pass
    // multiplies stability by less than the previous one did — that shrinking
    // factor (via s^-w9 and rising difficulty) is the real deceleration.
    const { state: s4, mults } = simulateGood(4);
    expect(s4.stability).toBeGreaterThan(0);
    expect(mults).toHaveLength(3);
    expect(mults[0]).toBeGreaterThan(mults[1]);
    expect(mults[1]).toBeGreaterThan(mults[2]);
    expect(mults.every((m) => m > 1)).toBe(true);
  });

  it("waiting longer before a pass yields more stability (the same r-in term)", () => {
    // Same card, same grade; reviewing late (r < 1) grows stability more than
    // reviewing immediately — the FSRS spacing-growth property.
    const s = { stability: 3, difficulty: 5, lapses: 0, lastReview: 0, reviewCount: 1 };
    const immediate = nextStabilityAfterRecall(s.difficulty, s.stability, retrievability(3, 0.01), "good");
    const late = nextStabilityAfterRecall(s.difficulty, s.stability, retrievability(3, 2), "good");
    expect(late).toBeGreaterThan(immediate);
  });
});

describe("SM-2 → FSRS migration (lazy, non-destructive)", () => {
  it("a never-reviewed card gets a neutral fresh state", () => {
    const st = deriveFsrsState({ intervalDays: 0, easeFactor: 2.5, reviewCount: 0, consecutiveAgain: 0, lastReview: null });
    expect(st.lastReview).toBeNull();
    expect(st.reviewCount).toBe(0);
    expect(st.stability).toBe(0);
    expect(st.difficulty).toBe(5);
  });

  it("a reviewed card maps interval→stability and EF→difficulty", () => {
    const st = deriveFsrsState({
      intervalDays: 12,
      easeFactor: 2.0, // harder card → difficulty above 5
      reviewCount: 5,
      consecutiveAgain: 2,
      lastReview: new Date("2026-09-01T10:00:00Z"),
    });
    expect(st.stability).toBe(12);
    expect(st.difficulty).toBeCloseTo(7, 5);
    expect(st.lapses).toBe(2);
    expect(st.lastReview).toBe(new Date("2026-09-01T10:00:00Z").getTime());
  });

  it("real review history sharpens the migration", () => {
    const DAY = 86_400_000;
    const t0 = 1_700_000_000_000;
    const logs = [
      { quality: 5, reviewedAt: t0 },
      { quality: 3, reviewedAt: t0 + DAY },
      { quality: 0, reviewedAt: t0 + 2 * DAY },
      { quality: 5, reviewedAt: t0 + 20 * DAY },
      { quality: 5, reviewedAt: t0 + 30 * DAY },
    ];
    const st = deriveFsrsStateFromLogs(
      { intervalDays: 15, easeFactor: 2.3, reviewCount: 5, consecutiveAgain: 1, lastReview: new Date(t0 + 30 * DAY) },
      logs as any
    );
    // One real lapse survived in history.
    expect(st.lapses).toBe(1);
    // The card was reviewed on schedule and passed — stability at least the
    // SM-2 interval, difficulty pushed down by two easy passes.
    expect(st.stability).toBeGreaterThanOrEqual(15);
    expect(st.difficulty).toBeLessThan(
      deriveFsrsState({ intervalDays: 15, easeFactor: 2.3, reviewCount: 5, consecutiveAgain: 1, lastReview: new Date(t0 + 30 * DAY) }).difficulty
    );
  });

  it("calibrated difficulty stays in bounds for extreme EFs", () => {
    expect(deriveFsrsState({ intervalDays: 3, easeFactor: 1.3, reviewCount: 2, consecutiveAgain: 2, lastReview: new Date() }).difficulty).toBeLessThanOrEqual(10);
    expect(deriveFsrsState({ intervalDays: 60, easeFactor: 3.2, reviewCount: 9, consecutiveAgain: 0, lastReview: new Date() }).difficulty).toBeGreaterThanOrEqual(1);
  });
});
