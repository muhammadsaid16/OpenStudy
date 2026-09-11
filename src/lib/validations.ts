import { z } from "zod";

// ─── Subject ──────────────────────────────────────────────────────
export const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required").max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").default("#3B82F6"),
  icon: z.string().max(50).default("book-open"),
});

export type SubjectInput = z.infer<typeof subjectSchema>;

// ─── Topic ────────────────────────────────────────────────────────
export const topicSchema = z.object({
  subjectId: z.string().min(1),
  name: z.string().min(1, "Topic name is required").max(100),
  description: z.string().max(500).optional(),
  order: z.number().int().min(0).default(0),
});

export type TopicInput = z.infer<typeof topicSchema>;

// ─── Resource ─────────────────────────────────────────────────────
export const resourceSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1, "Title is required").max(200),
  url: z.string().url("Invalid URL").optional().or(z.literal("")),
  type: z.enum(["link", "video", "book", "pdf"]).default("link"),
  notes: z.string().max(1000).optional(),
});

export type ResourceInput = z.infer<typeof resourceSchema>;

// ─── Note ─────────────────────────────────────────────────────────
export const noteSchema = z.object({
  topicId: z.string().min(1).nullable().default(null), // optional — standalone notes allowed
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().default(""),
  explanation: z.string().max(50_000).nullable().optional(),
  isPinned: z.boolean().default(false),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

export type NoteInput = z.infer<typeof noteSchema>;

// ─── Flashcard ────────────────────────────────────────────────────
export const flashcardSchema = z.object({
  topicId: z.string().min(1),
  subjectId: z.string().optional(),
  front: z.string().min(1, "Front side is required").max(2000),
  back: z.string().min(1, "Back side is required").max(5000),
  difficulty: z.number().int().min(1).max(5).default(1),
});

export type FlashcardInput = z.infer<typeof flashcardSchema>;

export const flashcardReviewSchema = z.object({
  id: z.string().min(1),
  quality: z.number().int().min(0).max(5), // SM-2 quality rating
});

// ─── Study Session ────────────────────────────────────────────────
export const studySessionSchema = z.object({
  subjectId: z.string().optional(),
  topicId: z.string().optional(),
  title: z.string().min(1, "Session title is required").max(200),
  durationMin: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional(),
  completed: z.boolean().default(false),
});

export type StudySessionInput = z.infer<typeof studySessionSchema>;

// ─── Bundle ──────────────────────────────────────────────────────
export const bundleSchema = z.object({
  name: z.string().min(1, "Bundle name is required").max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .default("#DFE104"),
  topicId: z.string().min(1).optional().nullable(),
  subjectId: z.string().min(1).optional().nullable(),
});

export type BundleInput = z.infer<typeof bundleSchema>;

// ─── Bundle Flashcard ─────────────────────────────────────────────
// Cards can live in a bundle (no topic) — separate from flashcardSchema.
export const bundleCardSchema = z.object({
  bundleId: z.string().min(1),
  front: z.string().min(1, "Front side is required").max(2000),
  back: z.string().min(1, "Back side is required").max(5000),
  frontDescription: z.string().max(2000).optional(),
  backDescription: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  kind: z.enum(["basic", "cloze", "choice"]).optional(),
  choices: z.array(z.string().min(1).max(200)).max(8).optional(),
});

export type BundleCardInput = z.infer<typeof bundleCardSchema>;

// ─── Pomodoro Preset ─────────────────────────────────────────────
export const pomoPresetSchema = z.object({
  name: z.string().min(1, "Preset name is required").max(50),
  workMin: z.number().int().min(1).max(180),
  breakMin: z.number().int().min(1).max(60),
  longBreakMin: z.number().int().min(0).max(90).default(0),
  cyclesBeforeLongBreak: z.number().int().min(0).max(12).default(0),
  autoAdvance: z.boolean().default(true),
});

export type PomoPresetInput = z.infer<typeof pomoPresetSchema>;

// ─── Parsed import row (CSV/Anki/JSON) ────────────────────────────
export const importRowSchema = z.object({
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(5000),
  frontDescription: z.string().max(2000).optional(),
  backDescription: z.string().max(2000).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

export const importBatchSchema = z
  .array(importRowSchema)
  .min(1, "No valid cards found")
  .max(5000, "Too many cards (max 5000)");
