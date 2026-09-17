import Dexie, { type Table } from "dexie";
import { rescueBeforeReset } from "@/lib/safety-net";

// ─── Record types (mirror the previous Prisma models 1:1) ───────
export interface SubjectRec {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicRec {
  id: string;
  subjectId: string;
  name: string;
  description?: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceRec {
  id: string;
  topicId: string;
  title: string;
  url?: string | null;
  type: string;
  notes?: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteRec {
  id: string;
  topicId: string | null; // optional link — standalone notes allowed
  title: string;
  content: string;
  explanation?: string | null;
  explanationUpdatedAt?: Date | null;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TagRec {
  id: string;
  name: string;
}

export interface NoteTagRec {
  noteId: string;
  tagId: string;
}

export interface CardTagRec {
  cardId: string;
  tagId: string;
}

export interface BundleRec {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  topicId?: string | null;
  subjectId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CardKind = "basic" | "cloze" | "choice";

export interface FlashcardRec {
  id: string;
  topicId?: string | null;
  subjectId?: string | null;
  bundleId?: string | null;
  front: string;
  back: string;
  frontDescription?: string | null;
  backDescription?: string | null;
  description?: string | null;
  difficulty: number;
  kind?: CardKind | null; // absent (pre-v5) = basic
  choices?: string[] | null; // distractors for choice cards; back stays the answer
  easeFactor: number;
  intervalDays: number;
  // FSRS state (Study OS wave) — the live scheduler. Null/absent on cards
  // not yet touched since the SM-2 era; reviewFlashcardWithLog derives the
  // state lazily from the legacy fields on first FSRS review.
  fsrsStability?: number | null;
  fsrsDifficulty?: number | null;
  fsrsLapses?: number | null;
  nextReview: Date;
  lastReview?: Date | null;
  reviewCount: number;
  consecutiveAgain: number;
  isLeech: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewLogRec {
  id: string;
  flashcardId: string;
  quality: number;
  reviewedAt: Date;
}

export interface StudySessionRec {
  id: string;
  subjectId?: string | null;
  topicId?: string | null;
  title: string;
  durationMin: number;
  notes?: string | null;
  completed: boolean;
  startedAt: Date;
  endedAt?: Date | null;
}

export interface PomoPresetRec {
  id: string;
  name: string;
  workMin: number;
  breakMin: number;
  longBreakMin: number;          // 0 = long break disabled
  cyclesBeforeLongBreak: number; // 0 = long break disabled
  autoAdvance: boolean;
  createdAt: Date;
}

// ─── Goals (kanban todo) ─────────────────────────────────────────
export type GoalHorizon = "long" | "regular"; // "regular" displays as "Todo"
export type GoalStatus = "backlog" | "in_progress" | "done";
export type GoalRepeat = "daily" | "weekly" | "monthly";

export interface GoalRec {
  id: string;
  title: string;
  description?: string | null;
  horizon: GoalHorizon;        // long = long-term vision, regular = todo
  status: GoalStatus;
  order: number;               // position within its status column
  dueDate?: Date | null;
  repeat?: GoalRepeat | null;  // repeating todo — reschedules on completion
  subjectId?: string | null;   // optional link to a Subject
  color?: string | null;       // optional accent override
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}

export interface MilestoneRec {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  order: number;
  createdAt: Date;
}

// ─── Settings (key/value) ───────────────────────────────────────────
export interface SettingRec {
  key: string;
  value: unknown;
  updatedAt: number;
}

// ─── User-uploaded wallpapers ────────────────────────────────────
// Blobs live in IndexedDB (no size budget beyond disk quota, survives
// reloads, works offline). The blob holds its own MIME type, so renderers
// can build object URLs without guessing.
export interface WallpaperRec {
  id: string;
  name: string;
  type: string; // e.g. "image/jpeg", "image/png", "image/webp"
  blob: Blob;
  createdAt: Date;
}

// ─── Exams (Study OS) ───────────────────────────────────────────
// A timed, mixed quiz built from the existing flashcard pool. The exam
// affects real learning state: on completion (non-practice), wrong answers
// are fed back through reviewFlashcardWithLog as lapses (see the frozen
// feeding rule in lib/contracts.ts).
export type ExamStatus = "in_progress" | "completed" | "abandoned";

export interface ExamRec {
  id: string;
  title: string;
  status: ExamStatus;
  subjectIds: string[]; // multi-select scope (empty = all subjects)
  topicIds: string[];   // optional narrower scope
  questionCount: number;        // number of questions requested at build time
  timeLimitSec: number | null;  // null = untimed
  practiceOnly: boolean;        // practice exams log reviews but never move schedules
  scorePct?: number | null;     // set on completion
  correctCount?: number | null; // set on completion
  durationSec?: number | null;  // wall time the exam actually took
  startedAt: Date;
  completedAt?: Date | null;
}

// One row per exam question. Snapshots of the card's front/choices are taken
// at build time so a graded exam stays displayable even if the card is later
// edited or deleted — flashcardId may dangle after a card deletion by design;
// grade evidence lives here, not on the card.
export interface ExamQuestionRec {
  id: string;
  examId: string;
  flashcardId: string;
  order: number;
  frontText: string;              // snapshot of the card front at build time
  backText: string;               // snapshot of the card back — choice cards
                                  // auto-grade against THIS, never the live
                                  // card, so later edits can't change grades
  kind: CardKind;                 // snapshot
  choicesSnapshot?: string[] | null; // frozen distractor order for choice cards
  answer?: string | null;         // choice → selected option; typed answers for others
  quality?: number | null;        // 0…5 self-grade recorded at grade time
  isCorrect?: boolean | null;
  answeredAt?: Date | null;
  // v12.1 snapshot additions (Examiner amendment): scope at build time so
  // per-topic breakdowns survive card edits AND deletions. Non-indexed,
  // so no schema-version bump is required.
  topicId?: string | null;
  subjectId?: string | null;
}

// ─── Tasks (Study OS) ────────────────────────────────────────────
// Fine-grained study work, traceable to subject / topic / goal / exam —
// the planner distributes tasks alongside due cards and weakness signals.
// Deliberately distinct from goals (long-horizon kanban) and todos
// (goal milestones): a task is a step of study work with a time estimate.
export type TaskStatus = "todo" | "in_progress" | "done";

export interface TaskRec {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  order: number;
  subjectId?: string | null;
  topicId?: string | null;
  goalId?: string | null;
  examId?: string | null;
  dueDate?: Date | null;
  estimateMin?: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}

// ─── Card images (Study OS) ─────────────────────────────────────
// Front/back images for flashcards, stored as blobs in IndexedDB (same
// pattern as wallpapers). `regions` is reserved for future image occlusion
// — rectangles over the image that can be hidden/quizzed — deliberately
// NOT implemented yet, but the data model carries it so occlusion later
// needs no migration.
export interface CardRegion {
  x: number; // 0..1, relative to image width
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
  label?: string;
}

export interface CardImageRec {
  id: string;
  cardId: string;
  side: "front" | "back";
  blob: Blob;
  type: string; // e.g. "image/png"
  name: string;
  regions?: CardRegion[] | null;
  createdAt: Date;
}

// ─── The database ────────────────────────────────────────────────
// Dexie/IndexedDB is the SINGLE source of truth — fully local,
// fully offline, per-device. No server database anywhere.
class OpenStudyDB extends Dexie {
  subjects!: Table<SubjectRec, string>;
  topics!: Table<TopicRec, string>;
  resources!: Table<ResourceRec, string>;
  notes!: Table<NoteRec, string>;
  tags!: Table<TagRec, string>;
  noteTags!: Table<NoteTagRec, [string, string]>;
  cardTags!: Table<CardTagRec, [string, string]>;
  bundles!: Table<BundleRec, string>;
  flashcards!: Table<FlashcardRec, string>;
  reviewLogs!: Table<ReviewLogRec, string>;
  studySessions!: Table<StudySessionRec, string>;
  pomoPresets!: Table<PomoPresetRec, string>;
  goals!: Table<GoalRec, string>;
  milestones!: Table<MilestoneRec, string>;
  settings!: Table<SettingRec, string>;
  wallpapers!: Table<WallpaperRec, string>;
  exams!: Table<ExamRec, string>;
  examQuestions!: Table<ExamQuestionRec, string>;
  tasks!: Table<TaskRec, string>;
  cardImages!: Table<CardImageRec, string>;

  constructor() {
    super("studymax");
    this.version(1).stores({
      subjects: "id, name, createdAt",
      topics: "id, subjectId, createdAt",
      resources: "id, topicId",
      notes: "id, topicId, updatedAt, isPinned",
      tags: "id, &name",
      noteTags: "[noteId+tagId], noteId, tagId",
      cardTags: "[cardId+tagId], cardId, tagId",
      bundles: "id, createdAt",
      flashcards: "id, topicId, subjectId, bundleId, nextReview, createdAt",
      reviewLogs: "id, flashcardId, reviewedAt",
      studySessions: "id, subjectId, startedAt",
    });
    // v2: custom pomodoro presets (additive — existing data untouched)
    this.version(2).stores({
      pomoPresets: "id, createdAt",
    });
    // v3: goals kanban — long-term + regular goals with milestones (additive)
    this.version(3).stores({
      goals: "id, status, horizon, subjectId, dueDate, createdAt, order",
      milestones: "id, goalId, order",
    });
    // v4: bundle topic link — bundle can be owned by a topic
    this.version(4).stores({
      bundles: "id, createdAt, topicId, subjectId",
    });
    // v5: card kinds — cloze + multiple-choice (additive index, old cards read as basic)
    this.version(5).stores({
      flashcards: "id, topicId, subjectId, bundleId, nextReview, createdAt, kind",
    });
    // v6: note explanation — AI-generated explanation stored alongside the lesson (additive, nullable)
    this.version(6).stores({
      notes: "id, topicId, updatedAt, isPinned",
    });
    // v7: settings key/value + Spotify OAuth tokens (additive)
    this.version(7).stores({
      settings: "key",
      spotify: "id",
    });
    // v8: remove Spotify OAuth table — replaced by zero-auth iframe embed
    this.version(8).stores({
      spotify: null,
    });
    // v9/v10: recovery — keep schema stable after the v8→v9 delete/recreate cycle
    this.version(9).stores({
      spotify: null,
    });
    this.version(10).stores({
      spotify: null,
    });
    // v11: user-uploaded wallpapers — blobs stored locally (additive)
    this.version(11).stores({
      wallpapers: "id, createdAt",
    });
    // v12: Study OS — exams + per-question grade evidence + traceable tasks
    // (all additive; no existing table reshaped)
    this.version(12).stores({
      exams: "id, status, startedAt, completedAt",
      examQuestions: "id, examId, flashcardId, order",
      tasks: "id, status, subjectId, topicId, goalId, examId, dueDate, order",
    });
    // v13: card images — blobs keyed by card + side, occlusion-ready regions
    this.version(13).stores({
      cardImages: "id, cardId, side, createdAt, [cardId+side]",
    });
  }
}

export const db = new OpenStudyDB();

db.on("versionchange", () => db.close());

// Auto-recover when Dexie cannot open the database at all — a failed or
// half-applied upgrade, a schema it cannot reconcile, a blocked delete. (A
// database from a NEWER build is not one of those: Dexie 4 opens it without
// complaint, which is a documented hazard of its own, covered by the "newer
// on-disk schema" test in lib/safety-net.test.ts.)
//
// This database is the user's only copy of their work, so the reset is the LAST
// resort rather than the first move: rescueBeforeReset() captures the data into
// a separate database first — a raw dump of the unopenable database plus the
// rolling snapshot — and records that a reset happened so the UI can hand the
// copy back. See lib/safety-net.ts for why it has to live elsewhere.
if (typeof window !== "undefined") {
  db.open().catch(async (err) => {
    console.error("[OpenStudy DB] Open error:", err);
    if (err?.name === "VersionError" || err?.name === "UpgradeError" || err?.name === "SchemaError") {
      console.warn("[OpenStudy DB] IndexedDB version mismatch detected. Capturing a recovery copy before reset...");
      const rescued = await rescueBeforeReset();
      console.warn("[OpenStudy DB] Recovery copy:", rescued);
      try {
        // Close first: an open connection can otherwise hold the delete back
        // with a `blocked` event, leaving the app hung on a database that will
        // never open.
        db.close();
        await db.delete();
        await db.open();
        console.log("[OpenStudy DB] Reset database successfully.");
      } catch (retryErr) {
        console.error("[OpenStudy DB] Failed to reset database:", retryErr);
      }
    }
  });
}


// Unique id generator (replaces Prisma cuid defaults)
export function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Legacy offline-cache helpers ────────────────────────────────
// Kept for import compatibility with the flashcards page. Dexie is
// now the primary store, so "caching" is a no-op (the data already
// lives here) and the "cached" reads just hit the primary tables.
export interface OfflineFlashcard {
  id: string;
  bundleId?: string | null;
  front: string;
  back: string;
  reviewCount: number;
  nextReview: number; // epoch ms
  isLeech: boolean;
  synced: boolean;
}

export interface OfflineBundle {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  cardCount: number;
  synced: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no-op sink kept for the legacy offline-cache call sites
export async function cacheBundles(_bundles?: OfflineBundle[]): Promise<void> {
  // no-op: bundles already live in the primary store
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no-op sink kept for the legacy offline-cache call sites
export async function cacheFlashcards(_cards?: OfflineFlashcard[]): Promise<void> {
  // no-op: flashcards already live in the primary store
}

export async function getCachedBundleCards(bundleId: string) {
  return db.flashcards.where("bundleId").equals(bundleId).toArray();
}

// NOTE: getCachedBundles / getSetting / setSetting were removed — nothing
// called them. App prefs live in localStorage (see lib/store.ts prefs), so
// the `settings` table stays in the Dexie schema but has no accessor. It is
// left in place deliberately: dropping a table needs a version bump.
