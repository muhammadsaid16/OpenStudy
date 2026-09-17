import { describe, expect, it } from "vitest";
import { getCardTraceability, getExamTraceability, getTopicGraph } from "@/lib/relations";
import type {
  BundleRec,
  ExamQuestionRec,
  ExamRec,
  FlashcardRec,
  NoteRec,
  ReviewLogRec,
  StudySessionRec,
  SubjectRec,
  TaskRec,
  TopicRec,
} from "@/lib/db";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function baseRecord(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, createdAt: new Date(NOW - DAY), updatedAt: new Date(NOW - DAY), ...extra };
}

const subject = { ...baseRecord("s1"), name: "Physics", color: "#fff", icon: "x" } as unknown as SubjectRec;
const topic = { ...baseRecord("t1"), subjectId: "s1", name: "Mechanics", order: 0 } as unknown as TopicRec;

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
    createdAt: new Date(NOW - DAY),
    updatedAt: new Date(NOW - DAY),
    ...over,
  };
}

describe("getTopicGraph", () => {
  it("aggregates every entity under its topic", () => {
    const cards = [card({ topicId: "t1", subjectId: "s1" }), card({ id: "c2", topicId: "t1", subjectId: "s1", nextReview: new Date(NOW - DAY) })];
    const notes = [{ ...baseRecord("n1"), topicId: "t1", title: "N", content: "", isPinned: false }] as unknown as NoteRec[];
    const bundles = [{ ...baseRecord("b1"), name: "B", color: "#fff", topicId: "t1" }] as unknown as BundleRec[];
    const sessions = [{ ...baseRecord("se1"), topicId: "t1", title: "S", durationMin: 25, completed: true, startedAt: new Date(NOW - DAY) }] as unknown as StudySessionRec[];
    const tasks = [{ ...baseRecord("tk1"), title: "T", status: "done", order: 0, topicId: "t1" }] as unknown as TaskRec[];
    const graph = getTopicGraph({
      topics: [topic], subjects: [subject], cards, notes, bundles, sessions, tasks, nowMs: NOW,
    });
    expect(graph).toHaveLength(1);
    const node = graph[0];
    expect(node.counts.cards).toBe(2);
    expect(node.counts.dueCards).toBe(1);
    expect(node.counts.notes).toBe(1);
    expect(node.counts.bundles).toBe(1);
    expect(node.counts.sessions).toBe(1);
    expect(node.counts.openTasks).toBe(0); // the one task is done
    expect(node.cardsTotalMinutes).toBe(25);
    expect(node.subject?.name).toBe("Physics");
  });
});

describe("getCardTraceability", () => {
  const exams = [{ ...baseRecord("e1"), title: "Midterm", status: "completed" }] as unknown as ExamRec[];
  const examQuestions = [
    { ...baseRecord("q1"), examId: "e1", flashcardId: "c1", isCorrect: false },
    { ...baseRecord("q2"), examId: "e1", flashcardId: "c1", isCorrect: true },
  ] as unknown as ExamQuestionRec[];

  it("traces a card to topic, subject, bundle, history, and exam appearances", () => {
    const logs = [
      { id: "l1", flashcardId: "c1", quality: 0, reviewedAt: new Date(NOW - 3 * DAY) },
      { id: "l2", flashcardId: "c1", quality: 5, reviewedAt: new Date(NOW - DAY) },
    ] as ReviewLogRec[];
    const trace = getCardTraceability("c1", {
      cards: [card({ topicId: "t1", subjectId: "s1", bundleId: "b1" })],
      topics: [topic], subjects: [subject],
      bundles: [{ ...baseRecord("b1"), name: "B", color: "#fff" } as unknown as BundleRec],
      reviewLogs: logs, exams, examQuestions, nowMs: NOW,
    });
    expect(trace).not.toBeNull();
    expect(trace!.topic?.name).toBe("Mechanics");
    expect(trace!.subject?.name).toBe("Physics");
    expect(trace!.bundle?.name).toBe("B");
    expect(trace!.reviewHistory).toHaveLength(2);
    expect(trace!.reviewAccuracy).toBeCloseTo(0.5, 5);
    expect(trace!.lapses).toBe(1);
    expect(trace!.examAppearances).toHaveLength(2);
    expect(trace!.examAppearances[0].examTitle).toBe("Midterm");
    expect(trace!.isDue).toBe(false);
  });

  it("returns null for unknown cards and tolerates orphans", () => {
    expect(getCardTraceability("ghost", {
      cards: [], topics: [], subjects: [], bundles: [], reviewLogs: [], exams: [], examQuestions: [], nowMs: NOW,
    })).toBeNull();
  });
});

describe("getExamTraceability", () => {
  it("breaks an exam down by topic and collects mistake cards", () => {
    const exam = { ...baseRecord("e1"), title: "Midterm", status: "completed" } as unknown as ExamRec;
    const questions = [
      { ...baseRecord("q1"), examId: "e1", flashcardId: "c1", topicId: "t1", isCorrect: true },
      { ...baseRecord("q2"), examId: "e1", flashcardId: "c2", topicId: "t1", isCorrect: false },
      { ...baseRecord("q3"), examId: "e1", flashcardId: "c3", topicId: null, isCorrect: false },
      { ...baseRecord("q4"), examId: "e1", flashcardId: "c4", topicId: "t1", isCorrect: null },
    ] as unknown as ExamQuestionRec[];
    const trace = getExamTraceability(exam, questions, (tid) => (tid === "t1" ? "Mechanics" : "General"));
    expect(trace.topics).toHaveLength(2);
    expect(trace.topics[0].label).toBe("General"); // 0% sorts first
    expect(trace.mistakeCards).toEqual(["c2", "c3"]);
    expect(trace.unanswered).toBe(1);
  });
});
