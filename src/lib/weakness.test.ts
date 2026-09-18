import { describe, expect, it } from "vitest";
import {
  collectOverdueEvidence,
  collectReviewEvidence,
  examEvidenceFromQuestions,
  scoreWeakness,
  computeWeaknessSignals,
  type WeaknessEvidence,
} from "@/lib/weakness";
import type {
  ExamQuestionRec,
  ExamRec,
  FlashcardRec,
  ReviewLogRec,
  SubjectRec,
  TopicRec,
} from "@/lib/db";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function card(over: Partial<FlashcardRec> = {}): FlashcardRec {
  return {
    id: "c1",
    front: "F",
    back: "B",
    difficulty: 3,
    easeFactor: 2.5,
    intervalDays: 1,
    nextReview: new Date(NOW + DAY),
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: new Date(NOW - 30 * DAY),
    updatedAt: new Date(NOW - DAY),
    ...over,
  };
}

function log(flashcardId: string, quality: number, daysAgo: number): ReviewLogRec {
  return { id: `l-${flashcardId}-${quality}-${daysAgo}`, flashcardId, quality, reviewedAt: new Date(NOW - daysAgo * DAY) };
}

describe("evidence collection", () => {
  it("keeps only reviews inside the window and classifies pass/lapse", () => {
    const cards = [card({ id: "a", topicId: "t1", subjectId: "s1" }), card({ id: "b", topicId: "t1", subjectId: "s1" })];
    const logs = [log("a", 0, 2), log("b", 5, 3), log("a", 5, 30)]; // last one outside window
    const ev = collectReviewEvidence(logs, cards, NOW);
    expect(ev).toHaveLength(2);
    expect(ev.filter((e) => e.kind === "review_lapse")).toHaveLength(1);
    expect(ev.filter((e) => e.kind === "review_pass")).toHaveLength(1);
  });

  it("evidence without a card (imported logs) has null topic and rolls up to subject", () => {
    const logs = [log("ghost", 0, 1)];
    const ev = collectReviewEvidence(logs, [], NOW);
    expect(ev[0].topicId).toBeNull();
    expect(ev[0].subjectId).toBeNull();
  });

  it("overdue burden accrues per day left behind, capped", () => {
    const cards = [
      card({ id: "x", topicId: "t1", nextReview: new Date(NOW - 3 * DAY) }),
      card({ id: "y", topicId: "t1", nextReview: new Date(NOW - 40 * DAY) }),
      card({ id: "z", topicId: "t1", nextReview: new Date(NOW + DAY) }), // not due
      card({ id: "w", topicId: "t1", nextReview: new Date(NOW - 0.2 * DAY) }), // <1d, ignored
    ];
    const ev = collectOverdueEvidence(cards, NOW);
    expect(ev).toHaveLength(2);
    const weights = ev.map((e) => e.weight).sort();
    expect(weights[0]).toBeCloseTo(0.5 + 3 / 14, 5);
    expect(weights[1]).toBe(1.5); // cap
  });
});

describe("scoring", () => {
  it("a topic of pure lapses scores high and suggests practice minutes", () => {
    const ev: WeaknessEvidence[] = [];
    for (let i = 1; i <= 5; i++) {
      ev.push({ topicId: "t1", subjectId: "s1", kind: "review_lapse", atMs: NOW - i * DAY, weight: 1 });
    }
    const out = scoreWeakness(ev, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBeGreaterThanOrEqual(60);
    // All five lapses sit inside the recent half — a fresh burst with no
    // older baseline reads as worsening, not flat.
    expect(out[0].trend).toBe("worsening");
    expect(out[0].suggestedMinutes).toBeGreaterThanOrEqual(10);
  });

  it("passes pull the score down — mastery decays out of the list", () => {
    const ev: WeaknessEvidence[] = [];
    for (let i = 1; i <= 3; i++) ev.push({ topicId: "t1", subjectId: "s1", kind: "review_lapse", atMs: NOW - i * DAY, weight: 1 });
    for (let i = 1; i <= 12; i++) ev.push({ topicId: "t1", subjectId: "s1", kind: "review_pass", atMs: NOW - i * DAY, weight: 1 });
    const out = scoreWeakness(ev, NOW);
    // miss ratio 3/15 = 0.2 → 0.2*70 = 14 < noise floor... boundary: must be BELOW 60
    expect(out[0]?.score ?? 0).toBeLessThan(60);
  });

  it("recent lapses read as worsening; older ones as improving", () => {
    const mk = (recent: number, older: number) => {
      const ev: WeaknessEvidence[] = [];
      for (let i = 0; i < recent; i++) ev.push({ topicId: "t", subjectId: null, kind: "review_lapse", atMs: NOW - 2 * DAY, weight: 1 });
      for (let i = 0; i < older; i++) ev.push({ topicId: "t", subjectId: null, kind: "review_lapse", atMs: NOW - 10 * DAY, weight: 1 });
      return ev;
    };
    expect(scoreWeakness(mk(4, 1), NOW)[0].trend).toBe("worsening");
    expect(scoreWeakness(mk(1, 4), NOW)[0].trend).toBe("improving");
    // Equal DECAYED weight = flat: 2 recent (decay 1-2/14) ≈ 6 older (1-10/14).
    expect(scoreWeakness(mk(2, 6), NOW)[0].trend).toBe("flat");
  });

  it("exam misses weigh double and surface as the strongest evidence", () => {
    const ev = [{ topicId: "t2", subjectId: "s1", kind: "exam_miss" as const, atMs: NOW - DAY, weight: 2 }];
    const out = scoreWeakness(ev, NOW);
    expect(out[0].examMisses).toBe(1);
    expect(out[0].score).toBeGreaterThanOrEqual(60);
  });

  it("noise floor: sub-8 raw scores are not weaknesses", () => {
    const ev = [{ topicId: "t9", subjectId: null, kind: "review_pass" as const, atMs: NOW - DAY, weight: 1 }];
    expect(scoreWeakness(ev, NOW)).toHaveLength(0);
  });

  it("caps at 8 signals, weakest-ordered by score", () => {
    const ev: WeaknessEvidence[] = [];
    for (let t = 0; t < 10; t++) {
      const n = 2 + t; // varying severity
      for (let i = 0; i < n; i++) ev.push({ topicId: `t${t}`, subjectId: "s1", kind: "review_lapse", atMs: NOW - DAY, weight: 1 });
    }
    const out = scoreWeakness(ev, NOW);
    expect(out).toHaveLength(8);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });
});

describe("computeWeaknessSignals (pipeline with labels)", () => {
  const subjects: SubjectRec[] = [{ id: "s1", name: "Physics", color: "#fff", icon: "x", createdAt: new Date(), updatedAt: new Date() }];
  const topics: TopicRec[] = [{ id: "t1", subjectId: "s1", name: "Mechanics", order: 0, createdAt: new Date(), updatedAt: new Date() }];

  it("labels signals from the topic/subject graph and includes overdue burden", () => {
    const cards = [
      card({ id: "a", topicId: "t1", subjectId: "s1", nextReview: new Date(NOW - 10 * DAY) }),
      card({ id: "b", topicId: "t1", subjectId: "s1", nextReview: new Date(NOW - 12 * DAY) }),
    ];
    const logs = [log("a", 0, 1), log("b", 0, 1)];
    const out = computeWeaknessSignals({ logs, cards, topics, subjects, nowMs: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Mechanics");
    expect(out[0].topicId).toBe("t1");
    expect(out[0].evidence).toContain("lapse");
    expect(out[0].evidence).toContain("overdue");
  });

  it("orphan evidence rolls up to a subject-level signal", () => {
    const logs = [log("imported", 0, 1), log("imported2", 0, 2)];
    const out = computeWeaknessSignals({ logs, cards: [], topics, subjects, nowMs: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("General"); // no subject match either
  });
});

// ─── Exam → Weakness adapter (the real-exam feeding rule) ────────
describe("examEvidenceFromQuestions", () => {
  const subjects: SubjectRec[] = [
    { id: "s1", name: "Physics", color: "#fff", icon: "x", createdAt: new Date(), updatedAt: new Date() },
  ];
  const topics: TopicRec[] = [
    { id: "t1", subjectId: "s1", name: "Mechanics", order: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: "t2", subjectId: "s1", name: "Waves", order: 1, createdAt: new Date(), updatedAt: new Date() },
  ];

  function exam(over: Partial<ExamRec> = {}): ExamRec {
    return {
      id: "e1",
      title: "Midterm",
      status: "completed",
      subjectIds: [],
      topicIds: [],
      questionCount: 2,
      timeLimitSec: null,
      practiceOnly: false,
      startedAt: new Date(NOW - 2 * DAY),
      completedAt: new Date(NOW - DAY),
      ...over,
    };
  }

  function q(over: Partial<ExamQuestionRec> = {}): ExamQuestionRec {
    return {
      id: "q1",
      examId: "e1",
      flashcardId: "c1",
      order: 0,
      frontText: "F",
      backText: "B",
      kind: "basic",
      isCorrect: false,
      answeredAt: new Date(NOW - DAY),
      topicId: "t1",
      subjectId: "s1",
      ...over,
    };
  }

  it("keeps graded questions and drops unanswered ones", () => {
    const items = examEvidenceFromQuestions(
      [q({ id: "q1" }), q({ id: "q2", isCorrect: null, answeredAt: null })],
      [exam()]
    );
    expect(items).toHaveLength(1);
    expect(items[0].isCorrect).toBe(false);
    expect(items[0].topicId).toBe("t1");
  });

  it("practice exams contribute nothing here — their evidence is already in the review logs", () => {
    expect(examEvidenceFromQuestions([q()], [exam({ practiceOnly: true })])).toHaveLength(0);
  });

  it("abandoned exams are not a verdict on the material", () => {
    expect(examEvidenceFromQuestions([q()], [exam({ status: "abandoned" })])).toHaveLength(0);
  });

  it("a question whose exam row is gone is ignored", () => {
    expect(examEvidenceFromQuestions([q({ examId: "ghost" })], [exam()])).toHaveLength(0);
  });

  it("evidence outside the window is dropped by the engine", () => {
    const old = examEvidenceFromQuestions([q({ answeredAt: new Date(NOW - 30 * DAY) })], [exam()]);
    const out = computeWeaknessSignals({ logs: [], cards: [], topics, subjects, nowMs: NOW, examItems: old });
    expect(out).toHaveLength(0);
  });

  it("a topic reachable ONLY through exam misses still surfaces as a weakness", () => {
    const items = examEvidenceFromQuestions([q({ topicId: "t2" }), q({ id: "q2", topicId: "t2" })], [exam()]);
    const out = computeWeaknessSignals({ logs: [], cards: [], topics, subjects, nowMs: NOW, examItems: items });
    expect(out).toHaveLength(1);
    expect(out[0].topicId).toBe("t2");
    expect(out[0].label).toBe("Waves");
    // Two weight-2 misses: the strongest evidence the engine accepts.
    expect(out[0].score).toBeGreaterThanOrEqual(60);
  });

  it("exam misses raise a topic's score where reviews are mostly passing", () => {
    const cards = [card({ id: "c1", topicId: "t1", subjectId: "s1" })];
    const logs = [log("c1", 0, 1), log("c1", 5, 2), log("c1", 5, 3), log("c1", 5, 4), log("c1", 5, 5)];
    const base = computeWeaknessSignals({ logs, cards, topics, subjects, nowMs: NOW });
    const fed = computeWeaknessSignals({
      logs,
      cards,
      topics,
      subjects,
      nowMs: NOW,
      examItems: examEvidenceFromQuestions([q(), q({ id: "q2" })], [exam()]),
    });
    expect(base[0].score).toBeGreaterThan(0);
    expect(fed[0].score).toBeGreaterThan(base[0].score);
    expect(fed[0].evidence).toContain("exam miss");
  });
});
