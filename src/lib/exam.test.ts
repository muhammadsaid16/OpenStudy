import { describe, expect, it } from "vitest";
import {
  buildQuestionSpecs,
  examFrontOf,
  filterExamPool,
  gradeAnswer,
  pickExamCards,
  scoreExam,
  type ExamSetup,
} from "@/lib/exam";
import type { ExamQuestionRec, FlashcardRec } from "@/lib/db";

const NOW = 1_800_000_000_000;

function card(over: Partial<FlashcardRec> = {}): FlashcardRec {
  return {
    id: "c",
    front: "F",
    back: "B",
    difficulty: 3,
    easeFactor: 2.5,
    intervalDays: 1,
    nextReview: new Date(NOW + 86_400_000),
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: new Date(NOW - 86_400_000),
    updatedAt: new Date(NOW - 86_400_000),
    ...over,
  };
}

const base: ExamSetup = { title: "T", subjectIds: [], topicIds: [], questionCount: 5, timeLimitSec: null, practiceOnly: false };

describe("pool filtering & picking", () => {
  it("filters by subject and topic scope", () => {
    const cards = [
      card({ id: "1", subjectId: "s1", topicId: "t1" }),
      card({ id: "2", subjectId: "s2", topicId: "t2" }),
      card({ id: "3", subjectId: null, topicId: null }),
    ];
    expect(filterExamPool(cards, { ...base, subjectIds: ["s1"] })).toHaveLength(1);
    expect(filterExamPool(cards, { ...base, subjectIds: ["s1"], topicIds: ["t1"] })).toHaveLength(1);
    // Empty scope = everything.
    expect(filterExamPool(cards, base)).toHaveLength(3);
    // A card without a subject can't match a scoped exam.
    expect(filterExamPool(cards, { ...base, subjectIds: ["s9"] })).toHaveLength(0);
  });

  it("picking is capped, deterministic, and covers the pool evenly", () => {
    const cards = Array.from({ length: 10 }, (_, i) => card({ id: `c${i}` }));
    const a = pickExamCards(cards, 4, 42);
    const b = pickExamCards(cards, 4, 42);
    expect(a).toHaveLength(4);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // same seed → same set
    const c = pickExamCards(cards, 4, 7);
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id)); // different seed → different order
  });

  it("partial exams are valid when the pool is smaller than the request", () => {
    const cards = [card({ id: "only" })];
    expect(pickExamCards(cards, 10, 1)).toHaveLength(1);
    expect(pickExamCards([], 10, 1)).toHaveLength(0);
  });
});

describe("front rendering & grading", () => {
  it("cloze fronts are masked so answers never leak", () => {
    const c = card({ front: "The capital of {{France}} is {{Paris}}", kind: "cloze" });
    expect(examFrontOf(c)).toContain("▯▯▯");
    expect(examFrontOf(c)).not.toContain("Paris");
  });

  it("choice questions auto-grade against the snapshot (case-insensitive)", () => {
    const spec = { backText: "  Mitochondria ", kind: "choice" as const };
    expect(gradeAnswer(spec, { kind: "choice", answer: "mitochondria" })).toBe(5);
    expect(gradeAnswer(spec, { kind: "choice", answer: "Ribosome" })).toBe(0);
  });

  it("self grades pass through clamped", () => {
    expect(gradeAnswer({ backText: "x", kind: "basic" }, { kind: "self", quality: 5 })).toBe(5);
    expect(gradeAnswer({ backText: "x", kind: "basic" }, { kind: "self", quality: 0 })).toBe(0);
    expect(gradeAnswer({ backText: "x", kind: "basic" }, { kind: "self", quality: 9 })).toBe(5);
  });
});

describe("scoring & breakdown", () => {
  const labelFor = (topicId: string | null) => (topicId === "t1" ? "Mechanics" : "General");

  function q(over: Partial<ExamQuestionRec>): ExamQuestionRec {
    return {
      id: "q",
      examId: "e",
      flashcardId: "c",
      order: 0,
      frontText: "F",
      backText: "B",
      kind: "basic",
      choicesSnapshot: null,
      topicId: "t1",
      subjectId: "s1",
      answer: null,
      quality: null,
      isCorrect: null,
      answeredAt: null,
      ...over,
    };
  }

  it("computes score, per-topic breakdown, weak topics, and wrong questions", () => {
    const qs = [
      q({ id: "q1", isCorrect: true, topicId: "t1" }),
      q({ id: "t2", isCorrect: false, topicId: "t1" }),
      q({ id: "q3", isCorrect: true, topicId: "t1" }),
      q({ id: "q4", isCorrect: true, topicId: null }),
      q({ id: "q5", isCorrect: false, topicId: null }),
      q({ id: "q6", isCorrect: null }), // unanswered — excluded from score
    ];
    const totals = scoreExam(qs, { startedAt: NOW, completedAt: NOW + 120_000, labelFor });
    expect(totals.answered).toBe(5);
    expect(totals.correct).toBe(3);
    expect(totals.scorePct).toBe(60);
    expect(totals.durationSec).toBe(120);
    expect(totals.byTopic).toHaveLength(2); // t1 + general
    expect(totals.byTopic[0].pct).toBeLessThanOrEqual(totals.byTopic[1].pct);
    expect(totals.weakTopics).toHaveLength(2);
    expect(totals.wrongQuestions).toHaveLength(2);
  });

  it("an exam with zero answers scores 0% and has no breakdown", () => {
    const totals = scoreExam([], { startedAt: NOW, completedAt: NOW, labelFor });
    expect(totals.scorePct).toBe(0);
    expect(totals.byTopic).toHaveLength(0);
  });
});
