// ─── Interconnection wiring (Study OS wave 2) ────────────────────
// These are the seams that existed as libraries but had no live path:
//   • exam evidence → Weakness Engine (via getPlannerData)
//   • a study session closing the task it advanced
//   • card images surviving into an exam as snapshots
//   • the relationship layer reachable from the UI's actions
// Each test fails if the wiring is removed, which is the point: the library
// itself was already covered by its own unit tests.

import { beforeEach, describe, expect, it } from "vitest";
import {
  createExam,
  createStudySession,
  createTask,
  getCardTrace,
  getExamTrace,
  getPlannerData,
  moveTask,
} from "./actions";
import { db, uid, type ExamQuestionRec, type ExamRec, type FlashcardRec } from "@/lib/db";
import { setCardImage } from "@/lib/card-images";

const DAY = 86_400_000;
const NOW = () => Date.now();

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seedTopicGraph() {
  const subject = { id: uid(), name: "Physics", color: "#fff", icon: "x", createdAt: new Date(), updatedAt: new Date() };
  const topic = {
    id: uid(),
    subjectId: subject.id,
    name: "Mechanics",
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.subjects.add(subject);
  await db.topics.add(topic);
  return { subject, topic };
}

async function seedCard(topicId: string, subjectId: string, over: Partial<FlashcardRec> = {}) {
  const card: FlashcardRec = {
    id: uid(),
    topicId,
    subjectId,
    front: "F",
    back: "B",
    difficulty: 3,
    easeFactor: 2.5,
    intervalDays: 10,
    nextReview: new Date(NOW() + 10 * DAY), // never overdue in these tests
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
  await db.flashcards.add(card);
  return card;
}

async function seedExamWithQuestion(opts: {
  card: FlashcardRec;
  topicId: string | null;
  subjectId: string | null;
  isCorrect: boolean;
  practiceOnly?: boolean;
  answeredAt?: Date;
}) {
  const exam: ExamRec = {
    id: uid(),
    title: opts.practiceOnly ? "Practice" : "Midterm",
    status: "completed",
    subjectIds: [],
    topicIds: [],
    questionCount: 1,
    timeLimitSec: null,
    practiceOnly: opts.practiceOnly ?? false,
    scorePct: opts.isCorrect ? 100 : 0,
    correctCount: opts.isCorrect ? 1 : 0,
    durationSec: 60,
    startedAt: new Date(NOW() - DAY),
    completedAt: new Date(NOW() - 3600_000),
  };
  const question: ExamQuestionRec = {
    id: uid(),
    examId: exam.id,
    flashcardId: opts.card.id,
    order: 0,
    frontText: opts.card.front,
    backText: opts.card.back,
    kind: "basic",
    topicId: opts.topicId,
    subjectId: opts.subjectId,
    answer: null,
    quality: opts.isCorrect ? 5 : 0,
    isCorrect: opts.isCorrect,
    answeredAt: opts.answeredAt ?? new Date(NOW() - 3600_000),
  };
  await db.exams.add(exam);
  await db.examQuestions.add(question);
  return { exam, question };
}

describe("exam evidence reaches the weakness engine", () => {
  it("a topic known only through exam misses surfaces in the planner's weak list", async () => {
    const { subject, topic } = await seedTopicGraph();
    const card = await seedCard(topic.id, subject.id);
    await seedExamWithQuestion({ card, topicId: topic.id, subjectId: subject.id, isCorrect: false });

    const data = await getPlannerData();
    const signal = data.weakness.find((w) => w.topicId === topic.id);
    expect(signal).toBeDefined();
    expect(signal!.label).toBe("Mechanics");
    expect(signal!.evidence).toContain("exam miss");
  });

  it("practice-only exams do not add exam evidence (their reviews already did)", async () => {
    const { subject, topic } = await seedTopicGraph();
    const card = await seedCard(topic.id, subject.id);
    await seedExamWithQuestion({
      card,
      topicId: topic.id,
      subjectId: subject.id,
      isCorrect: false,
      practiceOnly: true,
    });

    const data = await getPlannerData();
    expect(data.weakness.find((w) => w.topicId === topic.id)).toBeUndefined();
  });

  it("an unanswered question is not evidence", async () => {
    const { subject, topic } = await seedTopicGraph();
    const card = await seedCard(topic.id, subject.id);
    const { question } = await seedExamWithQuestion({
      card,
      topicId: topic.id,
      subjectId: subject.id,
      isCorrect: false,
    });
    await db.examQuestions.update(question.id, { isCorrect: null, answeredAt: null, quality: null });

    const data = await getPlannerData();
    expect(data.weakness.find((w) => w.topicId === topic.id)).toBeUndefined();
  });
});

describe("a session closes the task it advanced", () => {
  it("enough logged time marks the task done", async () => {
    const task = await createTask({ title: "Read chapter 4", estimateMin: 20 });
    await createStudySession({ title: task.title, durationMin: 25, taskId: task.id });
    expect((await db.tasks.get(task.id))?.status).toBe("done");
  });

  it("partial time advances it to in_progress instead", async () => {
    const task = await createTask({ title: "Problem set 3", estimateMin: 40 });
    await createStudySession({ title: task.title, durationMin: 15, taskId: task.id });
    expect((await db.tasks.get(task.id))?.status).toBe("in_progress");
  });

  it("a task with no estimate is completed by any logged time", async () => {
    const task = await createTask({ title: "Revise notes", estimateMin: null });
    await createStudySession({ title: task.title, durationMin: 5, taskId: task.id });
    expect((await db.tasks.get(task.id))?.status).toBe("done");
  });

  it("never resurrects a task that was already done", async () => {
    const task = await createTask({ title: "Old task", estimateMin: 60 });
    await moveTask(task.id, "done");
    await createStudySession({ title: task.title, durationMin: 5, taskId: task.id });
    const after = await db.tasks.get(task.id);
    expect(after?.status).toBe("done");
  });

  it("keeps the link and still saves when the task has vanished", async () => {
    const session = await createStudySession({
      title: "orphan",
      durationMin: 10,
      taskId: "does-not-exist",
      goalId: "g1",
      examId: "e1",
    });
    expect(session.taskId).toBe("does-not-exist");
    expect(await db.studySessions.count()).toBe(1);
  });
});

describe("card images survive into an exam", () => {
  it("snapshots both sides onto the question row at build time", async () => {
    const { subject, topic } = await seedTopicGraph();
    const card = await seedCard(topic.id, subject.id);
    await setCardImage(card.id, "front", new Blob(["front-bytes"], { type: "image/png" }), "front.png");
    await setCardImage(card.id, "back", new Blob(["back-bytes"], { type: "image/png" }), "back.png");

    const exam = await createExam({
      title: "Picture exam",
      subjectIds: [subject.id],
      topicIds: [],
      questionCount: 1,
      timeLimitSec: null,
      practiceOnly: false,
    });

    const questions = await db.examQuestions.where("examId").equals(exam.id).toArray();
    expect(questions).toHaveLength(1);
    expect(questions[0].frontImage?.name).toBe("front.png");
    expect(questions[0].backImage?.name).toBe("back.png");
    // The snapshot carries its own blob — it does not point at the card's row.
    expect(questions[0].frontImage?.cardId).toBe(card.id);
    expect(await questions[0].frontImage!.blob.text()).toBe("front-bytes");
  });

  it("leaves the fields null for cards without pictures", async () => {
    const { subject, topic } = await seedTopicGraph();
    await seedCard(topic.id, subject.id);
    const exam = await createExam({
      title: "Text exam",
      subjectIds: [subject.id],
      topicIds: [],
      questionCount: 1,
      timeLimitSec: null,
      practiceOnly: false,
    });
    const questions = await db.examQuestions.where("examId").equals(exam.id).toArray();
    expect(questions[0].frontImage).toBeNull();
    expect(questions[0].backImage).toBeNull();
  });
});

describe("the relationship layer is reachable from the actions", () => {
  it("getCardTrace reports the card's topic, subject, history and exam verdict", async () => {
    const { subject, topic } = await seedTopicGraph();
    const card = await seedCard(topic.id, subject.id);
    await db.reviewLogs.bulkAdd([
      { id: uid(), flashcardId: card.id, quality: 0, reviewedAt: new Date(NOW() - 2 * DAY) },
      { id: uid(), flashcardId: card.id, quality: 5, reviewedAt: new Date(NOW() - DAY) },
    ]);
    await seedExamWithQuestion({ card, topicId: topic.id, subjectId: subject.id, isCorrect: false });

    const trace = await getCardTrace(card.id);
    expect(trace).not.toBeNull();
    expect(trace!.topic?.name).toBe("Mechanics");
    expect(trace!.subject?.name).toBe("Physics");
    expect(trace!.reviewHistory).toHaveLength(2);
    expect(trace!.reviewAccuracy).toBe(0.5);
    expect(trace!.lapses).toBe(1);
    expect(trace!.examAppearances[0].isCorrect).toBe(false);
    expect(trace!.isDue).toBe(false);
  });

  it("getExamTrace lists the cards the exam proved were missed", async () => {
    const { subject, topic } = await seedTopicGraph();
    const card = await seedCard(topic.id, subject.id);
    const { exam } = await seedExamWithQuestion({
      card,
      topicId: topic.id,
      subjectId: subject.id,
      isCorrect: false,
    });

    const trace = await getExamTrace(exam.id);
    expect(trace).not.toBeNull();
    expect(trace!.mistakeCards).toEqual([card.id]);
    expect(trace!.topics[0].label).toBe("Physics › Mechanics");
  });

  it("returns null for an exam that does not exist", async () => {
    expect(await getExamTrace("ghost")).toBeNull();
  });
});
