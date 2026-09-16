import type { ReviewLogRec } from "@/lib/db";
import { isCorrect } from "@/lib/card-status";

export interface RetentionPoint {
  /** Days since the card's first review. */
  daysSinceFirstReview: number;
  /** 0..1 — fraction of reviews with quality >= 3 (correct). */
  accuracy: number;
  /** Number of reviews in this bucket (for confidence). */
  sampleSize: number;
}

/**
 * Build a retention curve. For each card, we know:
 *   - first review date (earliest reviewedAt in its log)
 *   - per-review quality (schema uses q in 0..5 where >=3 means "correct")
 *
 * We bucket reviews by "days since this card's first review" using a
 * log-spaced set of buckets: [0, 1, 3, 7, 14, 30, 60, 90, 180].
 * For each bucket we return the average accuracy.
 */
const BUCKETS = [0, 1, 3, 7, 14, 30, 60, 90, 180];

export function buildRetentionCurve(reviews: ReviewLogRec[]): RetentionPoint[] {
  if (reviews.length === 0) return [];

  // Group reviews by card
  const byCard = new Map<string, ReviewLogRec[]>();
  let firstEver = Infinity;
  for (const r of reviews) {
    const t = new Date(r.reviewedAt).getTime();
    if (t < firstEver) firstEver = t;
    const list = byCard.get(r.flashcardId) ?? [];
    list.push(r);
    byCard.set(r.flashcardId, list);
  }

  // For each card, find its first review date
  const cardFirst = new Map<string, number>();
  for (const [id, list] of byCard.entries()) {
    let first = Infinity;
    for (const r of list) {
      const t = new Date(r.reviewedAt).getTime();
      if (t < first) first = t;
    }
    cardFirst.set(id, first);
  }

  // Bucket each review
  const buckets: Array<{ correct: number; total: number }> = BUCKETS.map(
    () => ({ correct: 0, total: 0 })
  );

  for (const r of reviews) {
    const first = cardFirst.get(r.flashcardId);
    if (first === undefined) continue;
    const t = new Date(r.reviewedAt).getTime();
    const daysSince = Math.floor((t - first) / (24 * 60 * 60 * 1000));

    // Find the largest bucket ≤ daysSince
    let bucketIdx = -1;
    for (let i = BUCKETS.length - 1; i >= 0; i--) {
      if (daysSince >= BUCKETS[i]) { bucketIdx = i; break; }
    }
    if (bucketIdx === -1) continue;

    buckets[bucketIdx].total++;
    if (isCorrect(r.quality)) buckets[bucketIdx].correct++;
  }

  // Also annotate "first review" bucket with cards that have only been seen once
  // — already handled by the loop above since first review always falls in
  // bucket 0 (daysSince = 0).

  return BUCKETS.map((days, i) => {
    const b = buckets[i];
    if (b.total === 0) return { daysSinceFirstReview: days, accuracy: 0, sampleSize: 0 };
    return {
      daysSinceFirstReview: days,
      accuracy: b.correct / b.total,
      sampleSize: b.total,
    };
  });
}
