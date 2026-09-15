import Dexie, { type Table } from "dexie";

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

// ─── Settings (key/value) — home for the Spotify OAuth tokens ──────
// Single-row table. The Spotify row holds the ONLY long-lived secrets
// in this accountless app, so they live in IndexedDB (per-device, never
// synced, never in git) rather than in a cookie or localStorage.
export type SpotifyProduct = "premium" | "free" | "open" | null;

export interface SpotifyTokens {
  id: "spotify"; // fixed key — one connection per device
  accessToken: string;
  refreshToken: string | null;
  // Epoch ms when the access token expires. We refresh ~60s early.
  expiresAt: number;
  scope: string | null;
  // Account tier, learned post-auth from /me. Drives SDK vs embed mode.
  product: SpotifyProduct;
  updatedAt: number;
}

// Generic settings bucket for future key/value prefs (theme overrides,
// feature flags, etc.). Typed loosely on purpose.
export interface SettingRec {
  key: string;
  value: unknown;
  updatedAt: number;
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
  spotify!: Table<SpotifyTokens, string>;

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
  }
}

export const db = new OpenStudyDB();

// Multi-tab upgrades (e.g. v4→v5 card kinds) would otherwise block
// forever: an older tab holding the DB open stalls every query in the
// newer tab with no error. Closing on versionchange lets the upgrade
// through; the stale tab reloads on its next navigation.
db.on("versionchange", () => db.close());

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

export async function getCachedBundles() {
  return db.bundles.toArray();
}

// ─── Spotify token storage (IndexedDB, per-device) ────────────────
// Tokens never touch localStorage (XSS-readable) or cookies. IndexedDB
// is origin-scoped and not readable from a stolen token in another tab's
// fetch context without JS execution in this origin.
export async function getSpotifyTokens(): Promise<SpotifyTokens | undefined> {
  return db.spotify.get("spotify");
}

// Upsert: keep the prior refresh token when Spotify omits it (it does on
// silent refresh), so the connection never silently dies.
export async function saveSpotifyTokens(tokens: SpotifyTokens): Promise<void> {
  const existing = await db.spotify.get("spotify");
  const merged: SpotifyTokens = {
    id: "spotify",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? existing?.refreshToken ?? null,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope ?? existing?.scope ?? null,
    product: tokens.product ?? existing?.product ?? null,
    updatedAt: Date.now(),
  };
  await db.spotify.put(merged);
}

export async function clearSpotifyTokens(): Promise<void> {
  await db.spotify.delete("spotify");
}

// Generic key/value settings read/write (used for misc prefs).
export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value, updatedAt: Date.now() });
}
