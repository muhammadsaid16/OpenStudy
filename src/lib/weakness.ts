// ─── Weakness Engine (pure) — Contract 2 (lib/contracts.ts) ──────
// Turns learning evidence into WeaknessSignal[] — the shared currency
// consumed by /plan, the topic hubs, exam results, and the dashboard.
//
// Signals are DYNAMIC: every input is a recent window over real evidence
// (review lapses, FSRS stability/lapses, exam accuracy). Nothing here is a
// stored label — a topic the student masters decays out of the list on its
// own, and improving trends lower the score.

import type { FlashcardRec, ReviewLogRec, TopicRec, SubjectRec } from "@/lib/db";
import type { WeaknessSignal, WeaknessTrend } from "@/lib/contracts";
import { isCorrect } from "@/lib/card-status";
import { isDueCard } from "@/lib/review-queue";

export const WEAKNESS_WINDOW_DAYS = 14;
export const WEAKNESS_MAX_SIGNALS = 8;

/** One unit of learning evidence attached to a topic. */
export interface WeaknessEvidence {
  topicId: string | null;
  subjectId: string | null;
  kind:
    | "review_lapse"      // failed recall in the window
    | "review_pass"       // passed recall in the window (improves trend)
    | "exam_miss"         // wrong exam answer in the window
    | "exam_hit"          // correct exam answer in the window
    | "overdue_burden";   // cards sitting past-due at computation time
  atMs: number;           // when the evidence happened
  /** 0..1 confidence/weight of this item (exams weigh more than reviews). */
  weight: number;
}

// ─── Evidence collection (input adapters, pure) ──────────────────

export function collectReviewEvidence(
  logs: ReviewLogRec[],
  cards: FlashcardRec[],
  nowMs: number,
  windowDays = WEAKNESS_WINDOW_DAYS
): WeaknessEvidence[] {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cutoff = nowMs - windowDays * 86_400_000;
  const out: WeaknessEvidence[] = [];
  for (const log of logs) {
    const at = new Date(log.reviewedAt).getTime();
    if (at < cutoff || at > nowMs) continue;
    const card = cardById.get(log.flashcardId);
    out.push({
      topicId: card?.topicId ?? null,
      subjectId: card?.subjectId ?? null,
      kind: isCorrect(log.quality) ? "review_pass" : "review_lapse",
      atMs: at,
      weight: 1,
    });
  }
  return out;
}

export interface ExamEvidenceItem {
  flashcardId: string;
  isCorrect: boolean;
  atMs: number;
  topicId: string | null;
  subjectId: string | null;
}

export function collectExamEvidence(
  items: ExamEvidenceItem[],
  nowMs: number,
  windowDays = WEAKNESS_WINDOW_DAYS
): WeaknessEvidence[] {
  const cutoff = nowMs - windowDays * 86_400_000;
  return items
    .filter((it) => it.atMs >= cutoff && it.atMs <= nowMs)
    .map((it) => ({
      topicId: it.topicId,
      subjectId: it.subjectId,
      kind: it.isCorrect ? "exam_hit" : "exam_miss",
      atMs: it.atMs,
      // Exam mistakes are the strongest signal available — they happen
      // under pressure, without the flip button.
      weight: 2,
    }));
}

export function collectOverdueEvidence(
  cards: FlashcardRec[],
  nowMs: number
): WeaknessEvidence[] {
  const out: WeaknessEvidence[] = [];
  for (const c of cards) {
    if (!isDueCard(c, nowMs)) continue;
    const dueAt = new Date(c.nextReview).getTime();
    const daysOverdue = Math.max(0, (nowMs - dueAt) / 86_400_000);
    if (daysOverdue < 1) continue; // merely due is not weakness — being left is
    out.push({
      topicId: c.topicId ?? null,
      subjectId: c.subjectId ?? null,
      kind: "overdue_burden",
      atMs: nowMs,
      weight: Math.min(1.5, 0.5 + daysOverdue / 14),
    });
  }
  return out;
}

// ─── Aggregation ─────────────────────────────────────────────────

/** Evidence decays with age — a week-old lapse counts half of yesterday's. */
function recencyDecay(atMs: number, nowMs: number, windowDays: number): number {
  const ageDays = Math.max(0, (nowMs - atMs) / 86_400_000);
  return Math.max(0, 1 - ageDays / windowDays);
}

export interface WeaknessScored {
  topicId: string | null;
  subjectId: string | null;
  score: number; // 0..100
  lapses: number;
  passes: number;
  examMisses: number;
  examHits: number;
  overdueCount: number;
  trend: WeaknessTrend;
  suggestedMinutes: number;
  evidenceParts: string[];
}

const TREND_SPLIT_MS = 86_400_000 * (WEAKNESS_WINDOW_DAYS / 2);

export function scoreWeakness(
  evidence: WeaknessEvidence[],
  nowMs: number,
  windowDays = WEAKNESS_WINDOW_DAYS
): WeaknessScored[] {
  // Group by topic when known; evidence without a topic rolls up to subject.
  const groups = new Map<string, WeaknessEvidence[]>();
  for (const e of evidence) {
    const key = e.topicId ?? `subject:${e.subjectId ?? "none"}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const scored: WeaknessScored[] = [];
  for (const [key, items] of groups) {
    let negative = 0;
    let positive = 0;
    let recentNeg = 0;
    let olderNeg = 0;
    let lapses = 0, passes = 0, examMisses = 0, examHits = 0, overdueCount = 0;
    let maxWeight = 0;
    for (const e of items) {
      const decay = recencyDecay(e.atMs, nowMs, windowDays) * e.weight;
      const isNegative =
        e.kind === "review_lapse" || e.kind === "exam_miss" || e.kind === "overdue_burden";
      if (isNegative) {
        negative += decay;
        maxWeight = Math.max(maxWeight, e.weight);
        if (e.kind === "review_lapse") lapses++;
        if (e.kind === "exam_miss") examMisses++;
        if (e.kind === "overdue_burden") overdueCount++;
        if (e.atMs >= nowMs - TREND_SPLIT_MS) recentNeg += decay;
        else olderNeg += decay;
      } else {
        positive += decay;
        if (e.kind === "review_pass") passes++;
        if (e.kind === "exam_hit") examHits++;
      }
    }

    const total = negative + positive;
    if (total === 0 && overdueCount === 0) continue;
    // Miss ratio drives the score; overdue burden contributes directly.
    const missRatio = total > 0 ? negative / total : 0;
    const burden = overdueCount > 0 ? Math.min(30, overdueCount * 2) : 0;
    const raw = missRatio * 70 + burden;
    if (raw < 8) continue; // below the noise floor — not a weakness
    const score = Math.min(100, Math.round(raw));

    // Trend: compare recent-half vs older-half negative evidence.
    let trend: WeaknessTrend = "flat";
    if (recentNeg > olderNeg * 1.25) trend = "worsening";
    else if (olderNeg > recentNeg * 1.25 && recentNeg < olderNeg) trend = "improving";

    const suggestedMinutes = Math.max(10, Math.min(45, Math.round(score / 4)));

    const parts: string[] = [];
    if (lapses) parts.push(`${lapses} lapse${lapses === 1 ? "" : "s"}`);
    if (examMisses) parts.push(`${examMisses} exam miss${examMisses === 1 ? "" : "es"}`);
    if (overdueCount) parts.push(`${overdueCount} overdue`);
    if (passes || examHits) parts.push(`${passes + examHits} correct`);

    scored.push({
      topicId: key.startsWith("subject:") ? null : key,
      subjectId: items[0]?.subjectId ?? null,
      score,
      lapses,
      passes,
      examMisses,
      examHits,
      overdueCount,
      trend,
      suggestedMinutes,
      evidenceParts: parts,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, WEAKNESS_MAX_SIGNALS);
}

/**
 * Full pipeline: evidence → scores → WeaknessSignal[] with display labels.
 * Consumers always call this; the pieces above are exported for tests.
 */
export function computeWeaknessSignals(
  input: {
    logs: ReviewLogRec[];
    cards: FlashcardRec[];
    topics: TopicRec[];
    subjects: SubjectRec[];
    examItems?: ExamEvidenceItem[];
    nowMs?: number;
    windowDays?: number;
  }
): WeaknessSignal[] {
  const nowMs = input.nowMs ?? Date.now();
  const windowDays = input.windowDays ?? WEAKNESS_WINDOW_DAYS;

  const evidence = [
    ...collectReviewEvidence(input.logs, input.cards, nowMs, windowDays),
    ...(input.examItems ? collectExamEvidence(input.examItems, nowMs, windowDays) : []),
    ...collectOverdueEvidence(input.cards, nowMs),
  ];

  const topicById = new Map(input.topics.map((t) => [t.id, t]));
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));

  return scoreWeakness(evidence, nowMs, windowDays).map((s) => {
    const topic = s.topicId ? topicById.get(s.topicId) : undefined;
    const subject = s.subjectId ? subjectById.get(s.subjectId) : undefined;
    const label = topic?.name ?? subject?.name ?? "General";
    return {
      topicId: s.topicId,
      subjectId: s.subjectId,
      label,
      score: s.score,
      evidence: s.evidenceParts.join(" · ") || "overdue material",
      trend: s.trend,
      suggestedMinutes: s.suggestedMinutes,
    } satisfies WeaknessSignal;
  });
}
