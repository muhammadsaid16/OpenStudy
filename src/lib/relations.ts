// ─── Knowledge/relationship model (pure) — Agent 8 (Relator) ─────
// Entities know how they relate: subject → topic → {notes, cards, bundles,
// sessions, tasks, exams}. These are the typed traversal queries the rest
// of the Study OS can build on — traceability over graphs is a function
// call, not a page-by-page scavenger hunt.
//
// Pure: takes records, returns records. Callers gather inputs (usually one
// Promise.all over the tables); nothing here touches db or Date.now().

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
import { isDueCard } from "@/lib/review-queue";

// ─── Topic graph: the hub view of every entity under a topic ─────

export interface TopicNode {
  topic: TopicRec;
  subject: SubjectRec | null;
  counts: {
    cards: number;
    notes: number;
    bundles: number;
    sessions: number;
    openTasks: number;
    dueCards: number;
  };
  cardsTotalMinutes: number; // session minutes attributed to the topic
}

export function getTopicGraph(input: {
  topics: TopicRec[];
  subjects: SubjectRec[];
  cards: FlashcardRec[];
  notes: NoteRec[];
  bundles: BundleRec[];
  sessions: StudySessionRec[];
  tasks: TaskRec[];
  nowMs: number;
}): TopicNode[] {
  const subjectById = new Map(input.subjects.map((s) => [s.id, s]));
  const cardsByTopic = groupBy(input.cards.filter((c) => c.topicId), (c) => c.topicId!);
  const notesByTopic = groupBy(input.notes.filter((n) => n.topicId), (n) => n.topicId!);
  const bundlesByTopic = groupBy(input.bundles.filter((b) => b.topicId), (b) => b.topicId!);
  const sessionsByTopic = groupBy(input.sessions.filter((s) => s.topicId), (s) => s.topicId!);
  const tasksByTopic = groupBy(input.tasks.filter((t) => t.topicId), (t) => t.topicId!);

  return input.topics.map((topic) => {
    const cards = cardsByTopic.get(topic.id) ?? [];
    const sessions = sessionsByTopic.get(topic.id) ?? [];
    return {
      topic,
      subject: subjectById.get(topic.subjectId) ?? null,
      counts: {
        cards: cards.length,
        notes: (notesByTopic.get(topic.id) ?? []).length,
        bundles: (bundlesByTopic.get(topic.id) ?? []).length,
        sessions: sessions.length,
        openTasks: (tasksByTopic.get(topic.id) ?? []).filter((t) => t.status !== "done").length,
        dueCards: cards.filter((c) => isDueCard(c, input.nowMs)).length,
      },
      cardsTotalMinutes: sessions.reduce((acc, s) => acc + s.durationMin, 0),
    };
  });
}

// ─── Card traceability: everything a card is connected to ────────

export interface CardTrace {
  card: FlashcardRec;
  topic: TopicRec | null;
  subject: SubjectRec | null;
  bundle: BundleRec | null;
  reviewHistory: ReviewLogRec[];
  reviewAccuracy: number | null; // 0..1, null when never reviewed
  examAppearances: { examId: string; examTitle: string; isCorrect: boolean | null }[];
  lapses: number;
  isDue: boolean;
}

export function getCardTraceability(
  cardId: string,
  input: {
    cards: FlashcardRec[];
    topics: TopicRec[];
    subjects: SubjectRec[];
    bundles: BundleRec[];
    reviewLogs: ReviewLogRec[];
    exams: ExamRec[];
    examQuestions: ExamQuestionRec[];
    nowMs: number;
  }
): CardTrace | null {
  const card = input.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const topic = card.topicId ? input.topics.find((t) => t.id === card.topicId) ?? null : null;
  const subject = (topic ? input.subjects.find((s) => s.id === topic.subjectId) : null)
    ?? (card.subjectId ? input.subjects.find((s) => s.id === card.subjectId) ?? null : null);
  const bundle = card.bundleId ? input.bundles.find((b) => b.id === card.bundleId) ?? null : null;

  const reviewHistory = input.reviewLogs
    .filter((l) => l.flashcardId === cardId)
    .sort((a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime());
  const correct = reviewHistory.filter((l) => l.quality >= 3).length;
  const lapses = reviewHistory.filter((l) => l.quality < 3).length;

  const examAppearances = input.examQuestions
    .filter((q) => q.flashcardId === cardId)
    .map((q) => {
      const exam = input.exams.find((e) => e.id === q.examId);
      return {
        examId: q.examId,
        examTitle: exam?.title ?? "Exam",
        isCorrect: q.isCorrect ?? null,
      };
    });

  return {
    card,
    topic,
    subject,
    bundle,
    reviewHistory,
    reviewAccuracy: reviewHistory.length ? correct / reviewHistory.length : null,
    examAppearances,
    lapses,
    isDue: isDueCard(card, input.nowMs),
  };
}

// ─── Exam traceability: exam → topics → evidence ─────────────────

export interface ExamTrace {
  exam: ExamRec;
  topics: { topicId: string | null; label: string; correct: number; total: number }[];
  mistakeCards: string[]; // flashcardIds answered wrong (feed targets)
  unanswered: number;
}

export function getExamTraceability(
  exam: ExamRec,
  questions: ExamQuestionRec[],
  labelFor: (topicId: string | null) => string
): ExamTrace {
  const byTopic = new Map<string, { topicId: string | null; label: string; correct: number; total: number }>();
  const mistakeCards: string[] = [];
  let unanswered = 0;
  for (const q of questions) {
    if (q.isCorrect == null) {
      unanswered++;
      continue;
    }
    const key = q.topicId ?? "general";
    const entry = byTopic.get(key) ?? { topicId: q.topicId ?? null, label: labelFor(q.topicId ?? null), correct: 0, total: 0 };
    entry.total++;
    if (q.isCorrect) entry.correct++;
    else mistakeCards.push(q.flashcardId);
    byTopic.set(key, entry);
  }
  return {
    exam,
    topics: [...byTopic.values()].sort((a, b) => a.correct / a.total - b.correct / b.total),
    mistakeCards,
    unanswered,
  };
}

// ─── helpers ─────────────────────────────────────────────────────
function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
