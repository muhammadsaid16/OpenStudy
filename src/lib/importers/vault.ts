// ─── Vault Backup & Restore Engine ───────────────────────────────
// Full-database export and restore for Ruvren — Your Knowledge OS.
// Exports all subjects, topics, flashcards, notes, study sessions, exams,
// tasks, goals, and settings into a single structured JSON vault.
// Restores records into IndexedDB with duplicate collision resolution.

import { db } from "@/lib/db";
import type {
  SubjectRec,
  TopicRec,
  BundleRec,
  FlashcardRec,
  NoteRec,
  StudySessionRec,
  ExamRec,
  ExamQuestionRec,
  TaskRec,
  GoalRec,
} from "@/lib/db";

export interface RuvrenVaultBackup {
  version: "ruvren-vault-v2";
  exportedAt: string;
  metadata: {
    totalSubjects: number;
    totalFlashcards: number;
    totalNotes: number;
    totalSessions: number;
  };
  data: {
    subjects: SubjectRec[];
    topics: TopicRec[];
    bundles: BundleRec[];
    flashcards: FlashcardRec[];
    notes: NoteRec[];
    studySessions: StudySessionRec[];
    exams?: ExamRec[];
    examQuestions?: ExamQuestionRec[];
    tasks?: TaskRec[];
    goals?: GoalRec[];
  };
}

export interface RestoreVaultResult {
  ok: boolean;
  subjectsCount: number;
  flashcardsCount: number;
  notesCount: number;
  sessionsCount: number;
  error?: string;
}

/**
 * Export full database vault to a downloadable JSON file.
 */
export async function exportVaultToJson(): Promise<void> {
  const [subjects, topics, bundles, flashcards, notes, studySessions, exams, examQuestions, tasks, goals] =
    await Promise.all([
      db.subjects.toArray(),
      db.topics.toArray(),
      db.bundles.toArray(),
      db.flashcards.toArray(),
      db.notes.toArray(),
      db.studySessions.toArray(),
      db.exams.toArray(),
      db.examQuestions.toArray(),
      db.tasks.toArray(),
      db.goals.toArray(),
    ]);

  const backup: RuvrenVaultBackup = {
    version: "ruvren-vault-v2",
    exportedAt: new Date().toISOString(),
    metadata: {
      totalSubjects: subjects.length,
      totalFlashcards: flashcards.length,
      totalNotes: notes.length,
      totalSessions: studySessions.length,
    },
    data: {
      subjects,
      topics,
      bundles,
      flashcards,
      notes,
      studySessions,
      exams,
      examQuestions,
      tasks,
      goals,
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);

  const a = document.createElement("a");
  a.href = url;
  a.download = `ruvren-vault-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Restore and merge database records from a Vault JSON backup file.
 * Handles duplicate collision gracefully using Dexie bulkPut (upsert).
 */
export async function restoreVaultFromJson(file: File): Promise<RestoreVaultResult> {
  try {
    const text = await file.text();
    const raw = JSON.parse(text.trim());

    if (!raw || typeof raw !== "object" || !raw.data) {
      return { ok: false, subjectsCount: 0, flashcardsCount: 0, notesCount: 0, sessionsCount: 0, error: "Invalid vault file format." };
    }

    const data = raw.data;

    // Helper to sanitize dates in objects before bulk write
    const fixDates = <T extends Record<string, any>>(rows: T[] = []): T[] => {
      return rows.map((r) => {
        const copy: any = { ...r };
        for (const k in copy) {
          if (copy[k] && (k.endsWith("At") || k === "nextReview" || k === "lastReview")) {
            copy[k] = new Date(copy[k]);
          }
        }
        return copy as T;
      });
    };

    const subjects = fixDates<SubjectRec>(data.subjects ?? []);
    const topics = fixDates<TopicRec>(data.topics ?? []);
    const bundles = fixDates<BundleRec>(data.bundles ?? []);
    const flashcards = fixDates<FlashcardRec>(data.flashcards ?? []);
    const notes = fixDates<NoteRec>(data.notes ?? []);
    const studySessions = fixDates<StudySessionRec>(data.studySessions ?? []);
    const exams = fixDates<ExamRec>(data.exams ?? []);
    const examQuestions = fixDates<ExamQuestionRec>(data.examQuestions ?? []);
    const tasks = fixDates<TaskRec>(data.tasks ?? []);
    const goals = fixDates<GoalRec>(data.goals ?? []);

    // Perform bulk upserts inside a transaction for atomicity
    await db.transaction(
      "rw",
      [
        db.subjects,
        db.topics,
        db.bundles,
        db.flashcards,
        db.notes,
        db.studySessions,
        db.exams,
        db.examQuestions,
        db.tasks,
        db.goals,
      ],
      async () => {
        if (subjects.length) await db.subjects.bulkPut(subjects);
        if (topics.length) await db.topics.bulkPut(topics);
        if (bundles.length) await db.bundles.bulkPut(bundles);
        if (flashcards.length) await db.flashcards.bulkPut(flashcards);
        if (notes.length) await db.notes.bulkPut(notes);
        if (studySessions.length) await db.studySessions.bulkPut(studySessions);
        if (exams.length) await db.exams.bulkPut(exams);
        if (examQuestions.length) await db.examQuestions.bulkPut(examQuestions);
        if (tasks.length) await db.tasks.bulkPut(tasks);
        if (goals.length) await db.goals.bulkPut(goals);
      }
    );

    return {
      ok: true,
      subjectsCount: subjects.length,
      flashcardsCount: flashcards.length,
      notesCount: notes.length,
      sessionsCount: studySessions.length,
    };
  } catch (e) {
    return {
      ok: false,
      subjectsCount: 0,
      flashcardsCount: 0,
      notesCount: 0,
      sessionsCount: 0,
      error: e instanceof Error ? e.message : "Failed to restore vault file.",
    };
  }
}
