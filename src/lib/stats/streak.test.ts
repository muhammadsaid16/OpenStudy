import { describe, it, expect } from "vitest";
import { computeStreak } from "@/lib/stats";
import type { ReviewLogRec } from "@/lib/db";

const log = (daysAgo: number, hour = 12): ReviewLogRec => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { id: `r-${daysAgo}-${hour}`, flashcardId: "f", quality: 4, reviewedAt: d } as ReviewLogRec;
};

describe("streak yesterday-grace", () => {
  it("keeps the streak alive this morning before today's first review", () => {
    // Reviewed yesterday and the day before, NOT yet today (e.g. 8am)
    const reviews = [log(1), log(2)];
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    expect(computeStreak(reviews, now)).toBe(2);
  });

  it("counts today when a review already happened", () => {
    const reviews = [log(0), log(1)];
    expect(computeStreak(reviews, new Date())).toBe(2);
  });

  it("breaks after two inactive days", () => {
    const reviews = [log(2), log(3), log(4)];
    expect(computeStreak(reviews, new Date())).toBe(0);
  });

  it("returns 0 with no reviews", () => {
    expect(computeStreak([], new Date())).toBe(0);
  });
});
