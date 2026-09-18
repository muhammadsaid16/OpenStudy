import { describe, expect, it } from "vitest";
import { RATING_BUTTONS, isCorrect } from "@/lib/card-status";
import { gradeFromQuality, type FsrsGrade } from "@/lib/contracts";

// The review UI and the scheduler share one scale. This test is the tripwire
// for the bug it was written after: with only Again/Hard/Easy on screen, the
// scheduler's middle grade (`good`, quality 4) could never be reached, so
// intervals jumped from Hard to Easy and FSRS never saw a normal success.
describe("review rating scale ↔ FSRS grades", () => {
  it("every button maps to a distinct grade — no grade is unreachable", () => {
    const grades = RATING_BUTTONS.map((b) => gradeFromQuality(b.value));
    expect(grades).toEqual(["again", "hard", "good", "easy"]);
    expect(new Set(grades).size).toBe(grades.length);
  });

  it("covers all four FSRS grades the scheduler can apply", () => {
    const expected: FsrsGrade[] = ["again", "hard", "good", "easy"];
    expect(RATING_BUTTONS.map((b) => gradeFromQuality(b.value))).toEqual(expected);
  });

  it("is ascending, inside 0…5, and keeps 3 as the pass boundary", () => {
    const values = RATING_BUTTONS.map((b) => b.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
    // A fail can never enter the scheduler as a passing grade.
    for (const b of RATING_BUTTONS) {
      expect(isCorrect(b.value)).toBe(gradeFromQuality(b.value) !== "again");
    }
  });

  it("buttons carry a short label for compact surfaces and a full label for the runner", () => {
    for (const b of RATING_BUTTONS) {
      expect(b.shortLabel.length).toBeGreaterThan(0);
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.color.length).toBeGreaterThan(0);
    }
  });
});
