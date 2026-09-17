// ─── Exam engine (pure) — Agent 3 (Examiner) ─────────────────────
// Build / grade / score logic for exam mode. Pure: no db, no Date.now().
// Feeding wrong answers back into the scheduler happens in completeExam
// (app/actions.ts) and follows Contract 5 exactly.

import type { CardKind, ExamQuestionRec, FlashcardRec } from "@/lib/db";
import { isCloze, maskCloze } from "@/lib/card-kinds";
import { isCorrect } from "@/lib/card-status";

export interface ExamSetup {
  title: string;
  subjectIds: string[]; // empty = all subjects
  topicIds: string[];   // optional narrower scope
  questionCount: number;
  timeLimitSec: number | null;
  practiceOnly: boolean;
}

export interface ExamQuestionSpec {
  flashcardId: string;
  frontText: string;
  backText: string;
  kind: CardKind;
  choicesSnapshot: string[] | null;
  topicId: string | null;
  subjectId: string | null;
}

/** Cards are eligible when they belong to the chosen scope and can be asked. */
export function filterExamPool(cards: FlashcardRec[], setup: ExamSetup): FlashcardRec[] {
  return cards.filter((c) => {
    if (setup.subjectIds.length && (!c.subjectId || !setup.subjectIds.includes(c.subjectId))) return false;
    if (setup.topicIds.length && (!c.topicId || !setup.topicIds.includes(c.topicId))) return false;
    return true;
  });
}

/** Renderable front text: cloze fronts are masked so the answer never leaks. */
export function examFrontOf(card: FlashcardRec): string {
  return card.kind === "cloze" && isCloze(card.front) ? maskCloze(card.front) : card.front;
}

/**
 * Shuffle-free deterministic pick: spread N cards evenly across the pool,
 * then shuffle with a seeded PRNG (mulberry32) so a given build is stable.
 * Zero cards and fewer cards than requested are both valid (partial exam).
 */
export function pickExamCards(pool: FlashcardRec[], count: number, seed: number): FlashcardRec[] {
  if (count <= 0 || pool.length === 0) return [];
  const spread: FlashcardRec[] = [];
  const n = pool.length;
  for (let i = 0; i < n; i++) spread.push(pool[Math.floor((i * count) % n)]);
  const seen = new Set<string>();
  const unique = spread.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  // Fisher-Yates with seeded PRNG
  const rng = mulberry32(seed);
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, count);
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the question specs (build-time snapshots) from picked cards. */
export function buildQuestionSpecs(picked: FlashcardRec[]): ExamQuestionSpec[] {
  return picked.map((c) => ({
    flashcardId: c.id,
    frontText: examFrontOf(c),
    backText: c.back,
    kind: c.kind === "cloze" || c.kind === "choice" ? c.kind : "basic",
    choicesSnapshot: c.kind === "choice" && c.choices?.length ? c.choices : null,
    topicId: c.topicId ?? null,
    subjectId: c.subjectId ?? null,
  }));
}

// ─── Grading ─────────────────────────────────────────────────────
export type GradeInput = { kind: "choice"; answer: string } | { kind: "self"; quality: number };

/**
 * Auto-grade choice questions against the SNAPSHOT back text; basic/cloze
 * are self-graded on the 0/3/5 buttons. Returns the stored quality.
 */
export function gradeAnswer(spec: Pick<ExamQuestionSpec, "backText" | "kind">, input: GradeInput): number {
  if (input.kind === "self") return Math.max(0, Math.min(5, Math.round(input.quality)));
  const normal = (s: string) => s.trim().toLowerCase();
  return normal(input.answer) === normal(spec.backText) ? 5 : 0;
}

// ─── Scoring & breakdown ─────────────────────────────────────────
export interface ExamTotals {
  answered: number;
  total: number;
  correct: number;
  scorePct: number;
  durationSec: number;
  byTopic: { topicId: string | null; label: string; correct: number; total: number; pct: number }[];
  weakTopics: { topicId: string | null; label: string; pct: number; misses: number }[];
  wrongQuestions: ExamQuestionRec[];
}

export function scoreExam(
  questions: ExamQuestionRec[],
  opts: { startedAt: number; completedAt: number; labelFor: (topicId: string | null) => string }
): ExamTotals {
  const answeredQs = questions.filter((q) => q.isCorrect !== null && q.isCorrect !== undefined);
  const correct = answeredQs.filter((q) => q.isCorrect === true).length;
  const total = questions.length;
  const scorePct = answeredQs.length ? Math.round((correct / answeredQs.length) * 100) : 0;

  // Per-topic aggregation over ANSWERED questions with a known topic.
  const byTopicMap = new Map<string, { correct: number; total: number; label: string }>();
  for (const q of answeredQs) {
    const key = q.topicId ?? "general";
    const entry = byTopicMap.get(key) ?? { correct: 0, total: 0, label: opts.labelFor(q.topicId ?? null) };
    entry.total++;
    if (q.isCorrect) entry.correct++;
    byTopicMap.set(key, entry);
  }
  const byTopic = [...byTopicMap.entries()]
    .map(([topicId, v]) => ({
      topicId: topicId === "general" ? null : topicId,
      label: v.label,
      correct: v.correct,
      total: v.total,
      pct: Math.round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);

  // Weak topics: answered with at least one miss, sorted worst-first.
  const weakTopics = byTopic
    .filter((t) => t.correct < t.total)
    .map((t) => ({ topicId: t.topicId, label: t.label, pct: t.pct, misses: t.total - t.correct }));

  const wrongQuestions = answeredQs.filter((q) => q.isCorrect === false);

  return {
    answered: answeredQs.length,
    total,
    correct,
    scorePct,
    durationSec: Math.max(0, Math.round((opts.completedAt - opts.startedAt) / 1000)),
    byTopic,
    weakTopics,
    wrongQuestions,
  };
}
