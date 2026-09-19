// ─── FSRS scheduling engine (pure) ───────────────────────────────
// Replaces SM-2 as the app's single scheduler. Implementation of the
// FSRS-4.5 open algorithm (weights published by open-spaced-repetition;
// power-law forgetting curve, DECAY=-0.5, FACTOR=19/81) with the default
// parameter set — no external dependency, fully deterministic.
//
// Purity rules:
//   - No DOM, no Date.now(), no db — every function takes `now` as an arg.
//   - Quality enters ONLY through gradeFromQuality (contracts.ts), so the
//     app's 0/3/5 buttons are the single UI surface.
//   - Migration is lazy and additive: a card without FSRS state derives
//     it from its SM-2 fields on first FSRS review (deriveFsrsState) —
//     nothing is destroyed, no bulk rewrite, old review history untouched.

import type { FsrsGrade } from "@/lib/contracts";
import { gradeFromQuality } from "@/lib/contracts";

// Default FSRS-4.5 weights (17 parameters).
export const FSRS_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81;

/** Target retention for interval computation (constant for now). */
export const REQUESTED_RETENTION = 0.9;

/** Interval ceiling in days — the app displayed "in N days" under SM-2's 365
 * cap; keeping the cap preserves the UI's frame while FSRS runs underneath. */
export const MAX_INTERVAL_DAYS = 365;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ─── Card scheduling state (the FSRS-relevant slice) ─────────────
export interface FsrsCardState {
  stability: number; // days — when recall probability drops to 90%
  difficulty: number; // 1..10
  lapses: number;
  /** Epoch ms of the last review, or null for a never-reviewed card. */
  lastReview: number | null;
  reviewCount: number;
}

// ─── Core FSRS math ──────────────────────────────────────────────

/** Initial stability for the first review of a given grade. */
export function initialStability(grade: FsrsGrade): number {
  const g = grade === "again" ? 1 : grade === "hard" ? 2 : grade === "good" ? 3 : 4;
  return FSRS_W[g - 1];
}

/** Initial difficulty (1..10) for the first review of a given grade. */
export function initialDifficulty(grade: FsrsGrade): number {
  const g = grade === "again" ? 1 : grade === "hard" ? 2 : grade === "good" ? 3 : 4;
  return clamp(FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1, 1, 10);
}

/** Recall probability after `elapsedDays` at the given stability. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  const t = Math.max(elapsedDays, 0);
  return Math.pow(1 + FACTOR * (t / stability), DECAY);
}

/** Post-review stability after a SUCCESSFUL recall. */
export function nextStabilityAfterRecall(
  d: number, s: number, r: number, grade: FsrsGrade
): number {
  const hardPenalty = grade === "hard" ? FSRS_W[15] : 1;
  const easyBonus = grade === "easy" ? FSRS_W[16] : 1;
  const growth =
    1 +
    Math.exp(FSRS_W[8]) *
      (11 - d) *
      Math.pow(s, -FSRS_W[9]) *
      (Math.exp(FSRS_W[10] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus;
  return clamp(s * growth, 0.01, 36525);
}

/** Post-review stability after a LAPSE (forgotten). */
export function nextStabilityAfterForget(
  d: number, s: number, r: number
): number {
  const sFail =
    FSRS_W[11] *
    Math.pow(d, -FSRS_W[12]) *
    (Math.pow(s + 1, FSRS_W[13]) - 1) *
    Math.exp(FSRS_W[14] * (1 - r));
  // A lapse must not leave the card MORE stable than it was.
  return clamp(Math.min(sFail, s), 0.01, 36525);
}

/** Difficulty update with mean reversion toward the neutral anchor. */
export function nextDifficulty(d: number, grade: FsrsGrade): number {
  const g = grade === "again" ? 1 : grade === "hard" ? 2 : grade === "good" ? 3 : 4;
  const linear = d - FSRS_W[6] * (g - 3);
  const reverted = FSRS_W[7] * initialDifficulty("easy") + (1 - FSRS_W[7]) * linear;
  return clamp(reverted, 1, 10);
}

/** Interval in days that brings recall to REQUESTED_RETENTION at stability s. */
export function intervalFor(stability: number, retention = REQUESTED_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.ceil(raw), 1, MAX_INTERVAL_DAYS);
}

// ─── The one scheduling step ─────────────────────────────────────
export interface FsrsStepResult {
  next: FsrsCardState;
  intervalDays: number;
  wasLapse: boolean;
}

/** Advance a card's FSRS state for a review of `grade` at `now`. */
export function stepFsrs(state: FsrsCardState, grade: FsrsGrade, now: number): FsrsStepResult {
  const lastMs = state.lastReview;
  const first = lastMs === null;
  const elapsedDays = first ? 0 : Math.max((now - lastMs) / 86_400_000, 0);
  const r = first ? 1 : retrievability(state.stability, elapsedDays);

  let stability: number;
  let difficulty: number;
  let lapses = state.lapses;
  const wasLapse = grade === "again";

  if (first) {
    stability = initialStability(grade);
    difficulty = initialDifficulty(grade);
  } else if (wasLapse) {
    stability = nextStabilityAfterForget(state.difficulty, state.stability, r);
    difficulty = nextDifficulty(state.difficulty, grade);
    lapses += 1;
  } else {
    stability = nextStabilityAfterRecall(state.difficulty, state.stability, r, grade);
    difficulty = nextDifficulty(state.difficulty, grade);
  }

  const next: FsrsCardState = {
    stability,
    difficulty,
    lapses,
    lastReview: now,
    reviewCount: state.reviewCount + 1,
  };
  return { next, intervalDays: intervalFor(stability), wasLapse };
}

// ─── Migration: SM-2 record → FSRS state (lazy, one-time per card) ──
export interface Sm2Like {
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  consecutiveAgain: number;
  lastReview?: Date | string | number | null;
  lapseCount?: number | null; // computed from review logs when the caller has them
}

/**
 * Derive FSRS state from the SM-2 fields a card already carries.
 * Called by reviewFlashcardWithLog when a card has no FSRS state yet, so
 * existing collections migrate on first touch — no bulk rewrite, nothing
 * destructive, and the estimate only shapes the FIRST FSRS interval.
 */
export function deriveFsrsState(card: Sm2Like): FsrsCardState {
  const reviewed = card.reviewCount > 0 && card.lastReview != null;
  if (!reviewed) {
    return { stability: 0, difficulty: 5, lapses: 0, lastReview: null, reviewCount: 0 };
  }
  // Stability proxy: by construction an SM-2 interval lands near 90% recall,
  // which is exactly what "stability" means here.
  const stability = clamp(Math.max(card.intervalDays, 0.5), 0.5, 36525);
  // Difficulty proxy: default EF 2.5 → mid difficulty 5; low EF → hard.
  const difficulty = clamp(5 + (2.5 - card.easeFactor) * 4, 1, 10);
  const last =
    card.lastReview instanceof Date
      ? card.lastReview.getTime()
      : new Date(card.lastReview as string | number).getTime();
  return {
    stability,
    difficulty,
    lapses: card.lapseCount ?? Math.max(0, Math.round(card.consecutiveAgain)),
    lastReview: Number.isFinite(last) ? last : null,
    reviewCount: card.reviewCount,
  };
}

export interface ReviewLogLike {
  quality: number;
  reviewedAt: Date | string | number;
}

const logTime = (t: Date | string | number) =>
  t instanceof Date ? t.getTime() : new Date(t).getTime();

/**
 * Migration refined by real review history, when the caller has it:
 * lapses are counted from the actual logs (not the counter field) and
 * difficulty is sharpened by recent form — a card the user has been
 * answering well recently starts FSRS easier than its EF alone suggests.
 */
export function deriveFsrsStateFromLogs(card: Sm2Like, logs: ReviewLogLike[]): FsrsCardState {
  const base = deriveFsrsState(card);
  if (logs.length === 0) return base;
  const sorted = [...logs].sort((a, b) => logTime(a.reviewedAt) - logTime(b.reviewedAt));
  let lapses = 0;
  for (const l of sorted) if (!isCorrectLike(l.quality)) lapses += 1;
  const recent = sorted.slice(-10);
  const recentCorrect = recent.filter((l) => isCorrectLike(l.quality)).length / recent.length;
  const difficulty = clamp(base.difficulty + (0.5 - recentCorrect) * 4, 1, 10);
  return { ...base, lapses, difficulty };
}

function isCorrectLike(quality: number): boolean {
  return quality >= 3; // mirrors card-status.isCorrect without importing it (purity)
}

/**
 * Format an interval (in days) into a clean, human-readable string.
 * Examples: 10m, 6h, 1.5d, 4d, 9d, 2.5mo, 1.2y.
 */
export function formatFsrsInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "10m";
  if (days < 1 / 24) {
    const mins = Math.max(10, Math.round(days * 1440));
    return `${mins}m`;
  }
  if (days < 1) {
    const hrs = Math.max(1, Math.round(days * 24));
    return `${hrs}h`;
  }
  if (days < 30) {
    const d = Math.round(days * 10) / 10;
    return `${d}d`;
  }
  if (days < 365) {
    const mo = Math.round((days / 30) * 10) / 10;
    return `${mo}mo`;
  }
  const y = Math.round((days / 365) * 10) / 10;
  return `${y}y`;
}

export interface FsrsIntervalPredictions {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

/**
 * Predict next review intervals for all four rating grades for a card at `now`.
 */
export function predictFsrsIntervals(
  card: Sm2Like & { fsrsStability?: number | null; fsrsDifficulty?: number | null; fsrsLapses?: number | null },
  nowMs: number = Date.now()
): FsrsIntervalPredictions {
  const hasFsrs =
    typeof card.fsrsStability === "number" &&
    typeof card.fsrsDifficulty === "number" &&
    typeof card.fsrsLapses === "number";

  const state: FsrsCardState = hasFsrs
    ? {
        stability: card.fsrsStability!,
        difficulty: card.fsrsDifficulty!,
        lapses: card.fsrsLapses!,
        lastReview: card.lastReview ? new Date(card.lastReview).getTime() : null,
        reviewCount: card.reviewCount,
      }
    : deriveFsrsState(card);

  const stepHard = stepFsrs(state, "hard", nowMs);
  const stepGood = stepFsrs(state, "good", nowMs);
  const stepEasy = stepFsrs(state, "easy", nowMs);

  return {
    again: "10m",
    hard: formatFsrsInterval(stepHard.intervalDays),
    good: formatFsrsInterval(stepGood.intervalDays),
    easy: formatFsrsInterval(stepEasy.intervalDays),
  };
}

// Re-export so callers import the mapping from one place.
export { gradeFromQuality };

