// ─────────────────────────────────────────────────────────────────
// Data layer — Dexie (IndexedDB) is the SINGLE source of truth.
// Fully local & offline, per-device. No server database.
// Function names/signatures mirror the old Prisma server actions so
// every page keeps working without import changes.
// ─────────────────────────────────────────────────────────────────
import { z } from "zod";
import {
  db,
  uid,
  type SubjectRec,
  type TopicRec,
  type NoteRec,
  type BundleRec,
  type FlashcardRec,
  type StudySessionRec,
  type ReviewLogRec,
  type PomoPresetRec,
  type GoalRec,
  type MilestoneRec,
  type GoalHorizon,
  type GoalStatus,
  type GoalRepeat,
  type CardKind,
} from "@/lib/db";
import { cardKind, cleanChoices, isCloze } from "@/lib/card-kinds";
import {
  subjectSchema,
  topicSchema,
  noteSchema,
  bundleSchema,
  bundleCardSchema,
  importBatchSchema,
  pomoPresetSchema,
  type SubjectInput,
  type PomoPresetInput,
} from "@/lib/validations";

// ─── Include helpers (mirror Prisma `include` shapes) ────────────
async function topicInclude(topicId?: string | null) {
  if (!topicId) return null;
  const topic = await db.topics.get(topicId);
  if (!topic) return null;
  const subject = topic.subjectId ? await db.subjects.get(topic.subjectId) : undefined;
  return {
    id: topic.id,
    name: topic.name,
    subject: subject ? { id: subject.id, name: subject.name, color: subject.color } : null,
  };
}

async function bundleInclude(bundleId?: string | null) {
  if (!bundleId) return null;
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) return null;
  return { id: bundle.id, name: bundle.name, color: bundle.color };
}

async function cardTagsInclude(cardId: string) {
  const links = await db.cardTags.where("cardId").equals(cardId).toArray();
  const out: { tag: { id: string; name: string } }[] = [];
  for (const l of links) {
    const tag = await db.tags.get(l.tagId);
    if (tag) out.push({ tag: { id: tag.id, name: tag.name } });
  }
  return out;
}

async function noteTagsInclude(noteId: string) {
  const links = await db.noteTags.where("noteId").equals(noteId).toArray();
  const out: { tag: { id: string; name: string } }[] = [];
  for (const l of links) {
    const tag = await db.tags.get(l.tagId);
    if (tag) out.push({ tag: { id: tag.id, name: tag.name } });
  }
  return out;
}

async function subjectCounts(subjectId: string) {
  const [topics, flashcards, studySessions, sessionRecs, cardRecs] = await Promise.all([
    db.topics.where("subjectId").equals(subjectId).count(),
    db.flashcards.where("subjectId").equals(subjectId).count(),
    db.studySessions.where("subjectId").equals(subjectId).count(),
    db.studySessions.where("subjectId").equals(subjectId).toArray(),
    db.flashcards.where("subjectId").equals(subjectId).toArray(),
  ]);
  return {
    topics,
    flashcards,
    studySessions,
    // Spec §2: rich subject cards — study time, last studied, mastery %.
    minutes: sessionRecs.reduce((a, s) => a + (s.durationMin ?? 0), 0),
    lastStudiedAt: sessionRecs.length
      ? sessionRecs.reduce<Date | null>(
          (latest, s) =>
            !latest || new Date(s.startedAt) > latest ? new Date(s.startedAt) : latest,
          null
        )
      : null,
    mastered: cardRecs.filter((c) => (c.intervalDays ?? 0) >= 21).length,
  };
}

async function topicCounts(topicId: string) {
  const [resources, notes, flashcards] = await Promise.all([
    db.resources.where("topicId").equals(topicId).count(),
    db.notes.where("topicId").equals(topicId).count(),
    db.flashcards.where("topicId").equals(topicId).count(),
  ]);
  return { resources, notes, flashcards };
}

async function upsertTag(name: string): Promise<{ id: string; name: string }> {
  // Normalize so "Verbs", "verbs " and "VERBS" share one row (`&name` is unique).
  const clean = name.trim().toLowerCase();
  const existing = await db.tags.where("name").equals(clean).first();
  if (existing) return existing;
  try {
    const tag = { id: uid(), name: clean };
    await db.tags.add(tag);
    return tag;
  } catch {
    // Lost a concurrent insert race on the unique index — re-read the winner.
    const winner = await db.tags.where("name").equals(clean).first();
    if (winner) return winner;
    throw new Error(`Could not create tag "${clean}"`);
  }
}

// ─── Subjects ─────────────────────────────────────────────────────
export async function getSubjects() {
  const all = await db.subjects.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    all.map(async (s) => ({ ...s, _count: await subjectCounts(s.id) }))
  );
}

export async function getSubject(id: string) {
  const subject = await db.subjects.get(id);
  if (!subject) throw new Error("Subject not found");
  const topics = await db.topics.where("subjectId").equals(id).sortBy("order");
  const topicsWithCounts = await Promise.all(
    topics.map(async (t) => ({ ...t, _count: await topicCounts(t.id) }))
  );
  return { ...subject, topics: topicsWithCounts, _count: await subjectCounts(id) };
}

export async function createSubject(input: SubjectInput) {
  const parsed = subjectSchema.parse(input);
  const now = new Date();
  const subject: SubjectRec = { id: uid(), ...parsed, createdAt: now, updatedAt: now };
  await db.subjects.add(subject);
  return subject;
}

export async function updateSubject(id: string, input: Partial<SubjectInput>) {
  const parsed = subjectSchema.partial().parse(input);
  await db.subjects.update(id, { ...parsed, updatedAt: new Date() });
  return db.subjects.get(id);
}

export async function deleteSubject(id: string) {
  const subject = await db.subjects.get(id);
  // Cascade: topics → (resources, notes, flashcards), subject's flashcards/sessions
  const topics = await db.topics.where("subjectId").equals(id).toArray();
  for (const t of topics) {
    await db.resources.where("topicId").equals(t.id).delete();
    const notes = await db.notes.where("topicId").equals(t.id).toArray();
    for (const n of notes) await db.noteTags.where("noteId").equals(n.id).delete();
    await db.notes.where("topicId").equals(t.id).delete();
    const cards = await db.flashcards.where("topicId").equals(t.id).toArray();
    for (const c of cards) {
      await db.cardTags.where("cardId").equals(c.id).delete();
      await db.reviewLogs.where("flashcardId").equals(c.id).delete();
    }
    await db.flashcards.where("topicId").equals(t.id).delete();
  }
  await db.topics.where("subjectId").equals(id).delete();
  await db.flashcards.where("subjectId").equals(id).modify({ subjectId: null });
  await db.studySessions.where("subjectId").equals(id).modify({ subjectId: null });
  if (subject) await db.subjects.delete(id);
  return subject;
}

// ─── Topics ───────────────────────────────────────────────────────
export async function getTopics(subjectId: string) {
  const topics = await db.topics.where("subjectId").equals(subjectId).sortBy("order");
  return Promise.all(topics.map(async (t) => ({ ...t, _count: await topicCounts(t.id) })));
}

export async function createTopic(data: {
  subjectId: string;
  name: string;
  description?: string;
  order?: number;
}) {
  const parsed = topicSchema.parse(data);
  const now = new Date();
  const topic: TopicRec = { id: uid(), ...parsed, createdAt: now, updatedAt: now };
  await db.topics.add(topic);
  return topic;
}

export async function deleteTopic(id: string) {
  const topic = await db.topics.get(id);
  await db.resources.where("topicId").equals(id).delete();
  const notes = await db.notes.where("topicId").equals(id).toArray();
  for (const n of notes) await db.noteTags.where("noteId").equals(n.id).delete();
  await db.notes.where("topicId").equals(id).delete();
  const cards = await db.flashcards.where("topicId").equals(id).toArray();
  for (const c of cards) {
    await db.cardTags.where("cardId").equals(c.id).delete();
    await db.reviewLogs.where("flashcardId").equals(c.id).delete();
  }
  await db.flashcards.where("topicId").equals(id).delete();
  // Detach everywhere the topic was referenced — no orphan links:
  // sessions keep the record, drop the topicId; bundles keep their cards,
  // drop topicId + denormalized subjectId. Goals link to subjects (not
  // topics) so they stay valid.
  await db.studySessions.where("topicId").equals(id).modify({ topicId: null });
  // Unlink bundles that were owned by this topic — keep the bundle/cards, just detach
  await db.bundles.where("topicId").equals(id).modify({ topicId: null, subjectId: null, updatedAt: new Date() });
  if (topic) await db.topics.delete(id);
  return topic;
}

export async function updateTopic(
  id: string,
  data: { name?: string; description?: string }
) {
  const parsed = topicSchema.partial().parse(data);
  await db.topics.update(id, { ...parsed, updatedAt: new Date() });
  return db.topics.get(id);
}

// ─── Notes ────────────────────────────────────────────────────────
export async function getNotes(topicId: string) {
  const notes = await db.notes.where("topicId").equals(topicId).toArray();
  notes.sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return Promise.all(notes.map(async (n) => ({ ...n, tags: await noteTagsInclude(n.id) })));
}

export async function createNote(data: {
  topicId: string;
  title: string;
  content?: string;
  explanation?: string | null;
  isPinned?: boolean;
  tags?: string[];
}) {
  const parsed = noteSchema.parse(data);
  const { tags, ...noteData } = parsed;
  const now = new Date();
  const note: NoteRec = { id: uid(), ...noteData, explanation: (parsed as any).explanation ?? null, explanationUpdatedAt: (parsed as any).explanation ? now : null, createdAt: now, updatedAt: now } as NoteRec;
  await db.notes.add(note);
  for (const tagName of tags ?? []) {
    const tag = await upsertTag(tagName);
    await db.noteTags.add({ noteId: note.id, tagId: tag.id });
  }
  return { ...note, tags: await noteTagsInclude(note.id) };
}

export async function updateNote(
  id: string,
  data: { title?: string; content?: string; explanation?: string | null; isPinned?: boolean; tags?: string[]; topicId?: string | null }
) {
  // topicId: null explicitly clears the link (Remove topic). Run that
  // path without zod so empty-string -> null doesn't trip min(1).
  if (data.topicId === null) {
    const { topicId: _tid, tags, ...rest } = data as any;
    const parsedRest = noteSchema.partial().omit({ topicId: true } as any).parse(rest);
    await db.notes.update(id, { ...parsedRest, topicId: null as any, updatedAt: new Date() });
    if (tags) {
      await db.noteTags.where("noteId").equals(id).delete();
      for (const tagName of tags) {
        const tag = await upsertTag(tagName);
        await db.noteTags.add({ noteId: id, tagId: tag.id });
      }
    }
    return db.notes.get(id);
  }
  if (data.topicId === "") {
    const { topicId: _tid, ...rest } = data as any;
    return updateNote(id, { ...rest, topicId: null });
  }
  const parsed = noteSchema.partial().parse(data);
  const { tags, ...noteData } = parsed;
  const patch: Record<string, unknown> = { ...noteData, updatedAt: new Date() };
  if (noteData.explanation !== undefined) (patch as any).explanationUpdatedAt = noteData.explanation ? new Date() : null;
  await db.notes.update(id, patch);
  if (tags) {
    await db.noteTags.where("noteId").equals(id).delete();
    for (const tagName of tags) {
      const tag = await upsertTag(tagName);
      await db.noteTags.add({ noteId: id, tagId: tag.id });
    }
  }
  return db.notes.get(id);
}

export async function deleteNote(id: string) {
  const note = await db.notes.get(id);
  await db.noteTags.where("noteId").equals(id).delete();
  if (note) await db.notes.delete(id);
  return note;
}

// ─── Flashcards ───────────────────────────────────────────────────
export async function getFlashcards(topicId?: string, subjectId?: string) {
  let cards = await db.flashcards.toArray();
  if (topicId) cards = cards.filter((c) => c.topicId === topicId);
  if (subjectId) cards = cards.filter((c) => c.subjectId === subjectId);
  cards.sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime());
  return Promise.all(cards.map(async (c) => ({ ...c, topic: await topicInclude(c.topicId) })));
}

export async function getDueFlashcards() {
  const now = Date.now();
  const all = await db.flashcards.toArray();
  const due = all
    .filter((c) => c.nextReview.getTime() <= now)
    .sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime())
    .slice(0, 20);
  return Promise.all(due.map(async (c) => ({ ...c, topic: await topicInclude(c.topicId) })));
}

// All due cards across every bundle (for "Study All Due").
export async function getAllDueFlashcards() {
  const now = Date.now();
  const all = await db.flashcards.toArray();
  const due = all
    .filter((c) => c.nextReview.getTime() <= now)
    .sort((a, b) => a.nextReview.getTime() - b.nextReview.getTime())
    .slice(0, 2000);
  return Promise.all(
    due.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      bundle: await bundleInclude(c.bundleId),
    }))
  );
}

export async function createFlashcard(data: {
  topicId: string;
  subjectId?: string;
  front: string;
  back: string;
  frontDescription?: string | null;
  backDescription?: string | null;
  description?: string | null;
  difficulty?: number;
  kind?: CardKind;
  choices?: string[];
}) {
  const parsed = z.object({
    topicId: z.string().min(1),
    subjectId: z.string().min(1).optional(),
    front: z.string().min(1).max(2000),
    back: z.string().min(1).max(5000),
    frontDescription: z.string().max(2000).nullish(),
    backDescription: z.string().max(2000).nullish(),
    description: z.string().max(2000).nullish(),
    difficulty: z.number().int().min(1).max(5).optional(),
    kind: z.enum(["basic", "cloze", "choice"]).optional(),
    choices: z.array(z.string().min(1).max(200)).max(8).optional(),
  }).parse(data);
  const kind = parsed.kind ?? "basic";
  const choices = cleanChoices(parsed.choices ?? []);
  if (kind === "cloze" && !isCloze(parsed.front)) {
    throw new Error("Cloze cards need at least one {{blank}} in the question.");
  }
  if (kind === "choice" && choices.length < 2) {
    throw new Error("Choice cards need at least 2 options.");
  }
  const now = new Date();
  const card: FlashcardRec = {
    id: uid(),
    topicId: parsed.topicId,
    subjectId: parsed.subjectId ?? null,
    bundleId: null,
    front: parsed.front,
    back: parsed.back,
    frontDescription: parsed.frontDescription ?? null,
    backDescription: parsed.backDescription ?? parsed.description ?? null,
    description: parsed.description ?? parsed.backDescription ?? null,
    difficulty: parsed.difficulty ?? 1,
    kind,
    choices: kind === "choice" ? choices : null,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now, // immediately due
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.flashcards.add(card);
  return card;
}

export async function updateFlashcard(
  id: string,
  data: { front?: string; back?: string; topicId?: string; tags?: string[]; frontDescription?: string | null; backDescription?: string | null; description?: string | null; kind?: CardKind; choices?: string[] }
) {
  const parsed = z.object({
    front: z.string().min(1).max(2000).optional(),
    back: z.string().min(1).max(5000).optional(),
    topicId: z.string().min(1).optional(),
    frontDescription: z.string().max(2000).nullish(),
    backDescription: z.string().max(2000).nullish(),
    description: z.string().max(2000).nullish(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    kind: z.enum(["basic", "cloze", "choice"]).optional(),
    choices: z.array(z.string().min(1).max(200)).max(8).optional(),
  }).parse(data);
  // Validate kind-specific rules against the merged front/choices so a
  // kind change can't strand a card in an unrunnable state.
  const current = await db.flashcards.get(id);
  const nextKind = parsed.kind ?? cardKind(current ?? {});
  const nextFront = parsed.front ?? current?.front ?? "";
  const nextChoices = parsed.choices !== undefined ? cleanChoices(parsed.choices) : (current?.choices ?? []);
  if (nextKind === "cloze" && !isCloze(nextFront)) {
    throw new Error("Cloze cards need at least one {{blank}} in the question.");
  }
  if (nextKind === "choice" && nextChoices.length < 2) {
    throw new Error("Choice cards need at least 2 options.");
  }
  const { tags, ...rest } = parsed;
  // Legacy compat: description -> backDescription if backDescription absent
  const normalizedRest: Record<string, unknown> = { ...rest };
  if (parsed.description !== undefined && parsed.description !== null && parsed.backDescription === undefined) {
    normalizedRest.backDescription = parsed.description;
    // keep description for backwards compat as well
  }
  await db.flashcards.update(id, {
    ...normalizedRest,
    ...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
    ...(parsed.choices !== undefined ? { choices: nextKind === "choice" ? nextChoices : null } : {}),
    // Switching away from choice drops stale distractors.
    ...(parsed.kind !== undefined && parsed.kind !== "choice" ? { choices: null } : {}),
    updatedAt: new Date(),
  });
  if (tags) await setCardTags(id, tags);
  return db.flashcards.get(id);
}

// (The legacy reviewFlashcard() was removed — it had drifted from
// reviewFlashcardWithLog: no lapse reset, no leech tracking, no ReviewLog,
// which corrupted scheduling and made reviews invisible to streaks/heatmaps.)

// ─── Flashcard Management (MANAGE ALL) ──────────────────────────
export async function getAllFlashcards() {
  const all = await db.flashcards.toArray();
  all.sort((a, b) => a.reviewCount - b.reviewCount || b.createdAt.getTime() - a.createdAt.getTime());
  const cards = all.slice(0, 2000);
  return Promise.all(
    cards.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      bundle: await bundleInclude(c.bundleId),
      tags: await cardTagsInclude(c.id),
    }))
  );
}

export async function deleteFlashcard(id: string) {
  const card = await db.flashcards.get(id);
  await db.cardTags.where("cardId").equals(id).delete();
  await db.reviewLogs.where("flashcardId").equals(id).delete();
  if (card) await db.flashcards.delete(id);
  return card;
}

/** Undo helper: reinsert an EXACT snapshot of a deleted card (id, SM-2
 * state, tags, topic/bundle links) so undo doesn't reset scheduling. */
export async function restoreFlashcard(
  card: FlashcardRec,
  tagIds: { cardId: string; tagId: string }[]
) {
  await db.flashcards.put(card);
  if (tagIds.length) await db.cardTags.bulkPut(tagIds);
}

export async function getFlashcardSnapshot(id: string): Promise<FlashcardRec | null> {
  return (await db.flashcards.get(id)) ?? null;
}

// ─── Study Sessions ───────────────────────────────────────────────
export async function getStudySessions(limit = 50) {
  const all = await db.studySessions.orderBy("startedAt").reverse().toArray();
  const sessions = all.slice(0, limit);
  return Promise.all(
    sessions.map(async (s) => {
      const subject = s.subjectId ? await db.subjects.get(s.subjectId) : undefined;
      const topic = s.topicId ? await db.topics.get(s.topicId) : undefined;
      return {
        ...s,
        subject: subject ? { id: subject.id, name: subject.name, color: subject.color } : null,
        topic: topic ? { id: topic.id, name: topic.name } : null,
      };
    })
  );
}

export async function createStudySession(data: {
  subjectId?: string;
  topicId?: string;
  title: string;
  durationMin: number;
  notes?: string;
  completed?: boolean;
  startedAt?: Date;
}) {
  const now = new Date();
  const session: StudySessionRec = {
    id: uid(),
    subjectId: data.subjectId ?? null,
    topicId: data.topicId ?? null,
    title: data.title,
    durationMin: data.durationMin,
    notes: data.notes ?? null,
    completed: data.completed ?? true,
    startedAt: data.startedAt ?? now,
    endedAt: now,
  };
  await db.studySessions.add(session);
  return session;
}

export async function deleteStudySession(id: string) {
  const session = await db.studySessions.get(id);
  if (session) await db.studySessions.delete(id);
  return session;
}

// ─── Pomodoro Presets (custom techniques, saved per-device) ───────
export async function getPomoPresets() {
  return db.pomoPresets.orderBy("createdAt").toArray();
}

export async function createPomoPreset(input: PomoPresetInput) {
  const data = pomoPresetSchema.parse(input);
  const preset: PomoPresetRec = { id: uid(), createdAt: new Date(), ...data };
  await db.pomoPresets.add(preset);
  return preset;
}

export async function updatePomoPreset(id: string, input: Partial<PomoPresetInput>) {
  const existing = await db.pomoPresets.get(id);
  if (!existing) throw new Error("Preset not found");
  const data = pomoPresetSchema.parse({ ...existing, ...input });
  await db.pomoPresets.update(id, data);
  return { ...existing, ...data };
}

export async function deletePomoPreset(id: string) {
  await db.pomoPresets.delete(id);
  return { id };
}

// ─── Due Count (sidebar badge) ────────────────────────────────────
export async function getDueCount(): Promise<number> {
  const now = Date.now();
  const flashcards = await db.flashcards.toArray();
  return flashcards.filter((c) => c.nextReview.getTime() <= now).length;
}

// ─── Dashboard Stats ──────────────────────────────────────────────
export async function getDashboardStats() {
  const [subjectCount, topics, flashcards, sessions, subjects] = await Promise.all([
    db.subjects.count(),
    db.topics.count(),
    db.flashcards.toArray(),
    db.studySessions.orderBy("startedAt").reverse().toArray(),
    db.subjects.toArray(),
  ]);
  const now = Date.now();
  const dueCards = flashcards.filter((c) => c.nextReview.getTime() <= now).length;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMin, 0);
  const recent = sessions.slice(0, 5);
  const recentSessions = await Promise.all(
    recent.map(async (s) => {
      const subject = s.subjectId ? await db.subjects.get(s.subjectId) : undefined;
      return {
        ...s,
        subject: subject ? { name: subject.name, color: subject.color } : null,
      };
    })
  );
  // Per-subject breakdown for the dashboard shortcut grid
  const nowMs = Date.now();
  const subjectBreakdown = await Promise.all(
    subjects.map(async (subj) => {
      const cards = flashcards.filter((c) => c.subjectId === subj.id);
      return {
        id: subj.id,
        name: subj.name,
        color: subj.color,
        cardCount: cards.length,
        dueCount: cards.filter((c) => c.nextReview.getTime() <= nowMs).length,
      };
    })
  );
  return {
    totalSubjects: subjectCount,
    totalTopics: topics,
    totalFlashcards: flashcards.length,
    totalSessions: sessions.length,
    dueCards,
    totalMinutes,
    recentSessions,
    subjectBreakdown,
  };
}

// ─── getWeeklyAnalytics — dashboard chart + deadline data ──────────
export interface WeeklyAnalyticsResult {
  weekDays: { label: string; minutes: number }[];
  deadlines: {
    subjectId: string;
    subjectName: string;
    color: string;
    dueCount: number;
    overdueDays: number;
  }[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function getWeeklyAnalytics(): Promise<WeeklyAnalyticsResult> {
  const [sessions, flashcards, subjects] = await Promise.all([
    db.studySessions.toArray(),
    db.flashcards.toArray(),
    db.subjects.toArray(),
  ]);

  // Last 7 days, Monday-first
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - todayIdx);

  const minutes = Array(7).fill(0) as number[];
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    if (d >= monday) {
      const idx = Math.floor((d.getTime() - monday.getTime()) / 86_400_000);
      if (idx >= 0 && idx < 7) minutes[idx] += s.durationMin;
    }
  }
  // Build Monday-first labels aligned with index 0 = monday
  const weekDays = DAY_LABELS.map((label, i) => ({ label, minutes: minutes[i] }));

  // Deadlines per subject (due cards + oldest overdue)
  const nowMs = Date.now();
  const bySubject = new Map<string, { due: number; oldest: number }>();
  for (const c of flashcards) {
    if (!c.subjectId) continue;
    if (c.nextReview.getTime() <= nowMs) {
      const entry = bySubject.get(c.subjectId) ?? { due: 0, oldest: 0 };
      entry.due += 1;
      entry.oldest = Math.max(entry.oldest, nowMs - c.nextReview.getTime());
      bySubject.set(c.subjectId, entry);
    }
  }
  const deadlines = [...bySubject.entries()]
    .map(([subjectId, e]) => {
      const subj = subjects.find((s) => s.id === subjectId);
      return {
        subjectId,
        subjectName: subj?.name ?? "Unknown",
        color: subj?.color ?? "#64748B",
        dueCount: e.due,
        overdueDays: Math.floor(e.oldest / 86_400_000),
      };
    })
    .sort((a, b) => b.dueCount - a.dueCount);

  return { weekDays, deadlines };
}

// Expose today's minutes/streak/cards through the existing stats action too.
// getDashboardStats already returns totals; we extend it minimally here via a
// second helper so page.tsx can read both in parallel.
export async function getTodayProgress() {
  const [sessions, reviews] = await Promise.all([
    db.studySessions.toArray(),
    db.reviewLogs.toArray(),
  ]);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const minutesToday = sessions
    .filter((s) => new Date(s.startedAt) >= startOfDay)
    .reduce((a, s) => a + s.durationMin, 0);
  const cardsReviewedToday = reviews.filter(
    (r) => new Date(r.reviewedAt) >= startOfDay
  ).length;
  // Streak is based on REVIEW DAYS, not session days. A user can review cards
  // without starting a "session" and that should still count.
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const activeDays = new Set(reviews.map((r) => dayKey(new Date(r.reviewedAt))));
  let streakDays = 0;
  const cursor = new Date(now);
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { minutesToday, cardsReviewedToday, streakDays };
}

/** Returns all review logs (oldest first). For the heatmap + stats page. */
export async function getAllReviewLogs() {
  return db.reviewLogs.orderBy("reviewedAt").toArray();
}

// ─── Global Queries (for Notes page) ─────────────────────────────
export async function getAllTopics() {
  const all = await db.topics.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    all.map(async (t) => {
      const subject = t.subjectId ? await db.subjects.get(t.subjectId) : undefined;
      return {
        ...t,
        subject: subject ? { id: subject.id, name: subject.name, color: subject.color } : null,
        _count: await topicCounts(t.id),
      };
    })
  );
}

export async function getAllNotes() {
  const all = await db.notes.toArray();
  all.sort((a, b) =>
    Number(b.isPinned) - Number(a.isPinned) || b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return Promise.all(
    all.map(async (n) => {
      const topic = n.topicId ? await db.topics.get(n.topicId) : undefined;
      let topicInc: { id: string; name: string; subject: { name: string; color: string } | null } | null = null;
      if (topic) {
        const subject = topic.subjectId ? await db.subjects.get(topic.subjectId) : undefined;
        topicInc = {
          id: topic.id,
          name: topic.name,
          subject: subject ? { name: subject.name, color: subject.color } : null,
        };
      }
      return { ...n, tags: await noteTagsInclude(n.id), topic: topicInc };
    })
  );
}

// ─── Bundles (Flashcard Decks) ─────────────────────────────────
export async function getBundles() {
  const all = await db.bundles.orderBy("createdAt").reverse().toArray();
  return Promise.all(
    all.map(async (b) => {
      const topic = b.topicId ? await topicInclude(b.topicId) : null;
      // topicInclude returns { id, name, subject } — attach for badges
      return {
        ...b,
        topic,
        _count: { flashcards: await db.flashcards.where("bundleId").equals(b.id).count() },
      };
    })
  );
}

export async function getBundle(id: string) {
  const bundle = await db.bundles.get(id);
  if (!bundle) return null;
  const topic = bundle.topicId ? await topicInclude(bundle.topicId) : null;
  return {
    ...bundle,
    topic,
    _count: { flashcards: await db.flashcards.where("bundleId").equals(id).count() },
  };
}

export async function createBundle(data: { name: string; description?: string; color?: string; topicId?: string | null; subjectId?: string | null }) {
  const parsed = bundleSchema.parse(data);
  // If topicId supplied without subjectId, denormalize from topic
  let subjectId = parsed.subjectId ?? null;
  if (parsed.topicId && !subjectId) {
    const topic = await db.topics.get(parsed.topicId);
    subjectId = topic?.subjectId ?? null;
  }
  const now = new Date();
  const bundle: BundleRec = { id: uid(), name: parsed.name, description: parsed.description ?? null, color: parsed.color, topicId: parsed.topicId ?? null, subjectId, createdAt: now, updatedAt: now };
  await db.bundles.add(bundle);
  return bundle;
}

export async function updateBundle(id: string, data: { name?: string; description?: string; color?: string; topicId?: string | null; subjectId?: string | null }) {
  const parsed = bundleSchema.partial().parse(data);
  // Keep subjectId in sync if topicId changes
  if (parsed.topicId !== undefined && parsed.subjectId === undefined) {
    if (parsed.topicId) {
      const topic = await db.topics.get(parsed.topicId);
      (parsed as Record<string, unknown>).subjectId = topic?.subjectId ?? null;
    } else {
      (parsed as Record<string, unknown>).subjectId = null;
    }
  }
  await db.bundles.update(id, { ...parsed, updatedAt: new Date() });
  return db.bundles.get(id);
}

export async function getBundlesByTopic(topicId: string) {
  const all = await db.bundles.where("topicId").equals(topicId).toArray();
  all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(
    all.map(async (b) => ({
      ...b,
      topic: await topicInclude(b.topicId),
      _count: { flashcards: await db.flashcards.where("bundleId").equals(b.id).count() },
    }))
  );
}

export async function createBundleFromTopic(topicId: string, overrides?: { name?: string; color?: string; description?: string }) {
  const topic = await db.topics.get(topicId);
  if (!topic) throw new Error("Topic not found");
  const subject = topic.subjectId ? await db.subjects.get(topic.subjectId) : undefined;
  const name = overrides?.name?.trim() || topic.name;
  const color = overrides?.color || subject?.color || "#DFE104";
  const now = new Date();
  const bundle: BundleRec = {
    id: uid(),
    name,
    description: overrides?.description ?? null,
    color,
    topicId,
    subjectId: topic.subjectId,
    createdAt: now,
    updatedAt: now,
  };
  await db.bundles.add(bundle);
  return { ...bundle, topic: await topicInclude(topicId), _count: { flashcards: 0 } };
}

export async function linkBundleToTopic(bundleId: string, topicId: string | null) {
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) throw new Error("Bundle not found");
  if (topicId) {
    const topic = await db.topics.get(topicId);
    if (!topic) throw new Error("Topic not found");
    await db.bundles.update(bundleId, { topicId, subjectId: topic.subjectId, updatedAt: new Date() });
    // Backfill: existing cards in this bundle that have no topic get the bundle's topic
    const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
    for (const c of cards) {
      if (!c.topicId) await db.flashcards.update(c.id, { topicId, subjectId: topic.subjectId, updatedAt: new Date() });
    }
  } else {
    await db.bundles.update(bundleId, { topicId: null, subjectId: null, updatedAt: new Date() });
  }
  const updated = await db.bundles.get(bundleId);
  if (!updated) return null;
  return { ...updated, topic: updated.topicId ? await topicInclude(updated.topicId) : null, _count: { flashcards: await db.flashcards.where("bundleId").equals(bundleId).count() } };
}

export async function deleteBundle(id: string) {
  // Delete the bundle's flashcards first (and their tags/logs),
  // then the bundle itself — matches "DELETE & ALL ITS FLASHCARDS".
  const cards = await db.flashcards.where("bundleId").equals(id).toArray();
  for (const c of cards) {
    await db.cardTags.where("cardId").equals(c.id).delete();
    await db.reviewLogs.where("flashcardId").equals(c.id).delete();
  }
  await db.flashcards.where("bundleId").equals(id).delete();
  const bundle = await db.bundles.get(id);
  if (bundle) await db.bundles.delete(id);
  return bundle;
}

export async function getBundleCards(bundleId: string) {
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  cards.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return Promise.all(
    cards.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      tags: await cardTagsInclude(c.id),
    }))
  );
}

// ─── Card tag helpers ────────────────────────────────────────
export async function setCardTags(cardId: string, tagNames: string[]) {
  await db.cardTags.where("cardId").equals(cardId).delete();
  for (const name of tagNames) {
    const tag = await upsertTag(name);
    await db.cardTags.add({ cardId, tagId: tag.id });
  }
}

// ─── Review with Logging + Leech Detection ────────────────────
export async function reviewFlashcardWithLog(id: string, quality: number) {
  const q = z.number().int().min(0).max(5).parse(quality);
  const card = await db.flashcards.get(id);
  if (!card) throw new Error("Flashcard not found");

  // SM-2 algorithm
  let newEF = card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  let newInterval: number;
  let newReviewCount: number;
  if (q < 3) {
    // Lapse: reset the repetition ladder (1-day step), like standard SM-2.
    newInterval = 1;
    newReviewCount = 0;
  } else if (card.reviewCount === 0) {
    newInterval = 1;
    newReviewCount = card.reviewCount + 1;
  } else if (card.reviewCount === 1) {
    newInterval = 6;
    newReviewCount = card.reviewCount + 1;
  } else {
    newInterval = Math.min(Math.round(card.intervalDays * newEF), 365);
    newReviewCount = card.reviewCount + 1;
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  // Leech detection: 5 consecutive Again → flag
  const newConsecutive = q < 3 ? card.consecutiveAgain + 1 : 0;
  const isLeech = newConsecutive >= 5;

  await db.flashcards.update(id, {
    easeFactor: newEF,
    intervalDays: newInterval,
    nextReview,
    lastReview: new Date(),
    reviewCount: newReviewCount,
    difficulty: q,
    consecutiveAgain: newConsecutive,
    isLeech,
    updatedAt: new Date(),
  });

  // Log the review
  const log: ReviewLogRec = { id: uid(), flashcardId: id, quality: q, reviewedAt: new Date() };
  await db.reviewLogs.add(log);

  return db.flashcards.get(id);
}

// ─── Leech Cards ──────────────────────────────────────────────
export async function getLeechCards(bundleId?: string) {
  // IndexedDB can't index booleans, so filter in JS.
  let cards = (await db.flashcards.toArray()).filter((c) => c.isLeech === true);
  if (bundleId) cards = cards.filter((c) => c.bundleId === bundleId);
  return Promise.all(
    cards.map(async (c) => ({
      ...c,
      topic: await topicInclude(c.topicId),
      bundle: await bundleInclude(c.bundleId),
    }))
  );
}

// ─── Practice-mode rating: log WITHOUT mutating SM-2 ─────────
// Practice serves not-yet-due cards; writing their review would advance/reset
// real schedules (a +30d card practiced today got rescheduled as if reviewed).
// Log the activity (streak/heatmap) but keep scheduling untouched.
export async function logReviewOnly(id: string, quality: number) {
  const q = z.number().int().min(0).max(5).parse(quality);
  const card = await db.flashcards.get(id);
  if (!card) throw new Error("Flashcard not found");
  const log: ReviewLogRec = { id: uid(), flashcardId: id, quality: q, reviewedAt: new Date() };
  await db.reviewLogs.add(log);
  return db.flashcards.get(id);
}

export async function unLeechCard(id: string) {
  await db.flashcards.update(id, { isLeech: false, consecutiveAgain: 0, updatedAt: new Date() });
  return db.flashcards.get(id);
}

// ─── Heatmap & Streak ─────────────────────────────────────────
export async function getHeatmapData() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const logs = await db.reviewLogs
    .where("reviewedAt")
    .aboveOrEqual(ninetyDaysAgo)
    .toArray();

  const counts = new Map<string, number>();
  for (const log of logs) {
    // Local date (not UTC) so buckets align with the user's midnight
    const d = new Date(log.reviewedAt);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

export async function getStreak() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - 365);
  const logs = await db.reviewLogs.where("reviewedAt").aboveOrEqual(lookback).toArray();

  const reviewDates = new Set<string>();
  for (const log of logs) {
    // Local date bucketing — UTC shifted late-evening reviews to "tomorrow"
    // in positive-offset timezones (e.g. UTC+3), silently breaking streaks.
    const d = new Date(log.reviewedAt);
    reviewDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  // Yesterday-grace (parity with lib/stats computeStreak + getTodayProgress):
  // no review yet today → the streak is still alive if yesterday was active.
  // Without this, the streak showed 0 every morning until the first review.
  let streak = 0;
  const checkDate = new Date(today);
  const keyOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (!reviewDates.has(keyOf(checkDate))) checkDate.setDate(checkDate.getDate() - 1);
  while (reviewDates.has(keyOf(checkDate))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

// ─── Bundle Flashcard Creation ────────────────────────────────
export async function createBundleFlashcard(data: {
  bundleId: string;
  front: string;
  back: string;
  frontDescription?: string | null;
  backDescription?: string | null;
  description?: string | null;
  tags?: string[];
  kind?: CardKind;
  choices?: string[];
}) {
  const parsed = bundleCardSchema.parse(data);
  const { tags, ...rest } = parsed;
  const kind = parsed.kind ?? "basic";
  const choices = cleanChoices(parsed.choices ?? []);
  if (kind === "cloze" && !isCloze(parsed.front)) {
    throw new Error("Cloze cards need at least one {{blank}} in the question.");
  }
  if (kind === "choice" && choices.length < 2) {
    throw new Error("Choice cards need at least 2 options.");
  }
  const now = new Date();
  // If bundle is topic-linked, propagate topicId/subjectId onto the card
  const bundle = await db.bundles.get(rest.bundleId);
  const topicId = bundle?.topicId ?? null;
  const subjectId = bundle?.subjectId ?? null;
  const card: FlashcardRec = {
    id: uid(),
    topicId,
    subjectId,
    bundleId: rest.bundleId,
    front: rest.front,
    back: rest.back,
    frontDescription: (rest as any).frontDescription ?? null,
    backDescription: (rest as any).backDescription ?? (rest as any).description ?? null,
    description: (rest as any).description ?? (rest as any).backDescription ?? null,
    difficulty: 1,
    kind,
    choices: kind === "choice" ? choices : null,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now,
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.flashcards.add(card);
  if (tags?.length) await setCardTags(card.id, tags);
  return card;
}

// ─── Import a batch of cards (parsed from CSV/Anki/JSON) ──────
export async function importCardsIntoBundle(
  bundleId: string,
  cards: { front: string; back: string; tags?: string[]; description?: string; frontDescription?: string; backDescription?: string; kind?: CardKind; choices?: string[] }[]
) {
  const parsed = importBatchSchema.parse(
    (cards ?? []).map((c) => ({ front: c.front, back: c.back, tags: c.tags, description: c.description, frontDescription: (c as any).frontDescription, backDescription: (c as any).backDescription ?? (c as any).description }))
  );

  const now = new Date();
  const bundle = await db.bundles.get(bundleId);
  const topicId = bundle?.topicId ?? null;
  const subjectId = bundle?.subjectId ?? null;
  const newCards: FlashcardRec[] = parsed.map((c, i) => {
    // Lenient kind restore: imports never fail the batch — an invalid
    // kind spec just becomes a basic card.
    const raw = cards[i] as { kind?: CardKind; choices?: string[] };
    let kind: CardKind = raw.kind === "cloze" || raw.kind === "choice" ? raw.kind : "basic";
    const choices = cleanChoices(raw.choices ?? []);
    if (kind === "cloze" && !isCloze(c.front)) kind = "basic";
    if (kind === "choice" && choices.length < 2) kind = "basic";
    return {
      id: uid(),
      topicId,
      subjectId,
      bundleId,
      front: c.front,
      back: c.back,
      frontDescription: (c as any).frontDescription ?? null,
      backDescription: (c as any).backDescription ?? c.description ?? null,
      description: c.description ?? (c as any).backDescription ?? null,
      difficulty: 1,
      kind,
      choices: kind === "choice" ? choices : null,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now,
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
    };
  });
  await db.flashcards.bulkAdd(newCards);

  // Tag links
  const links: { cardId: string; tagId: string }[] = [];
  for (let i = 0; i < parsed.length; i++) {
    for (const name of parsed[i].tags ?? []) {
      const tag = await upsertTag(name);
      links.push({ cardId: newCards[i].id, tagId: tag.id });
    }
  }
  if (links.length) await db.cardTags.bulkAdd(links);

  return { count: parsed.length };
}

// ─── Import / Export ──────────────────────────────────────────
export type ExportBundle = {
  name: string;
  description?: string | null;
  color?: string;
  cards: { front: string; back: string; description?: string | null }[];
};

export async function exportBundle(bundleId: string) {
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) throw new Error("Bundle not found");
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  const payload: ExportBundle = {
    name: bundle.name,
    description: bundle.description,
    color: bundle.color,
    cards: cards.map((c) => ({
      front: c.front,
      back: c.back,
      // Omit when absent so exports of description-less cards stay byte-identical.
      ...((c as any).frontDescription ? { frontDescription: (c as any).frontDescription } : {}),
      ...((c as any).backDescription ? { backDescription: (c as any).backDescription } : {}),
      ...(c.description ? { description: c.description } : {}),
      // Omit basic kind so old exports/imports stay byte-identical.
      ...(cardKind(c) !== "basic" ? { kind: cardKind(c) } : {}),
      ...(cardKind(c) === "choice" && c.choices?.length ? { choices: c.choices } : {}),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBundleCards(
  bundleId: string,
  cards: {
    front?: string;
    back?: string;
    question?: string;
    answer?: string;
    description?: string;
    desc?: string;
    frontDescription?: string;
    backDescription?: string;
    tags?: string[];
    kind?: unknown;
    choices?: string[];
  }[]
) {
  if (!Array.isArray(cards) || cards.length === 0) return { count: 0 };
  // Accept both {front,back} (app export) and {question,answer} (external JSON).
  const normalized = cards
    .map((c) => {
      const k = String(c.kind ?? "").toLowerCase();
      return {
        front: String(c.front ?? c.question ?? "").trim(),
        back: String(c.back ?? c.answer ?? "").trim(),
        description: String(c.description ?? c.desc ?? "").trim() || undefined,
        frontDescription: String((c as any).frontDescription ?? (c as any).front_description ?? "").trim() || undefined,
        backDescription: String((c as any).backDescription ?? (c as any).back_description ?? c.description ?? c.desc ?? "").trim() || undefined,
        tags: Array.isArray(c.tags)
          ? c.tags.map((t) => String(t).trim()).filter(Boolean)
          : undefined,
        kind: k === "cloze" ? ("cloze" as const) : k === "choice" ? ("choice" as const) : undefined,
        choices: Array.isArray(c.choices) ? c.choices.map((x) => String(x)) : undefined,
      };
    })
    .filter((c) => c.front && c.back);
  if (normalized.length === 0) return { count: 0 };
  return importCardsIntoBundle(bundleId, normalized);
}

// ─── Markdown export ─────────────────────────────────────────
export async function exportBundleMarkdown(bundleId: string): Promise<string> {
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) throw new Error("Bundle not found");
  const cards = await db.flashcards.where("bundleId").equals(bundleId).toArray();
  cards.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lines: string[] = [];
  lines.push(`# ${bundle.name}`);
  if (bundle.description) lines.push(`\n> ${bundle.description}`);
  lines.push(`\n_Study source exported from Hymerious Study. ${cards.length} cards._\n`);
  if (cards.length === 0) {
    lines.push("_No flashcards in this bundle yet._");
  } else {
    cards.forEach((c, i) => {
      lines.push(`## ${i + 1}. ${c.front}`);
      if ((c as any).frontDescription) lines.push(`\n> ${(c as any).frontDescription.replace(/\s*\n+\s*/g, " ")}`);
      if (c.description && !(c as any).backDescription) lines.push(`\n> ${c.description.replace(/\s*\n+\s*/g, " ")}`);
      lines.push(`\n${c.back}\n`);
      if ((c as any).backDescription && (c as any).backDescription !== c.description) lines.push(`\n> ${(c as any).backDescription.replace(/\s*\n+\s*/g, " ")}\n`);
    });
  }
  return lines.join("\n");
}

export async function exportNotesMarkdown(): Promise<string> {
  const notes = await getAllNotes();
  const lines: string[] = ["# Study Notes", ""];
  if (notes.length === 0) {
    lines.push("_No notes yet._");
  } else {
    notes.forEach((n) => {
      lines.push(`## ${n.title}`);
      if (n.topic) lines.push(`_${n.topic.subject?.name ?? ""} › ${n.topic.name}_\n`);
      lines.push(`${n.content}\n`);
    });
  }
  return lines.join("\n");
}

// ─── Edit bundle from flashcards page ────────────────────────
export async function editBundleFromFlashcards(
  id: string,
  data: { name?: string; description?: string; color?: string }
) {
  const parsed = bundleSchema.partial().parse(data);
  await db.bundles.update(id, { ...parsed, updatedAt: new Date() });
  return db.bundles.get(id);
}

// ─── Batch Card Operations ──────────────────────────────────
export async function batchDeleteCards(ids: string[]) {
  if (!ids.length) return { count: 0 };
  for (const id of ids) {
    await db.cardTags.where("cardId").equals(id).delete();
    await db.reviewLogs.where("flashcardId").equals(id).delete();
  }
  await db.flashcards.bulkDelete(ids);
  return { count: ids.length };
}

export async function batchTagCards(ids: string[], tagNames: string[]) {
  if (!ids.length || !tagNames.length) return { count: 0 };
  const links: { cardId: string; tagId: string }[] = [];
  for (const cardId of ids) {
    for (const name of tagNames) {
      const tag = await upsertTag(name);
      links.push({ cardId, tagId: tag.id });
    }
  }
  // Skip links that already exist
  const newLinks: { cardId: string; tagId: string }[] = [];
  for (const l of links) {
    const exists = await db.cardTags.get([l.cardId, l.tagId]);
    if (!exists) newLinks.push(l);
  }
  if (newLinks.length) await db.cardTags.bulkAdd(newLinks);
  return { count: ids.length };
}

export async function batchMoveCards(ids: string[], targetBundleId: string | null) {
  if (!ids.length) return { count: 0 };
  // Cards carry their bundle's topicId/subjectId (see createBundleFlashcard),
  // so moving must propagate the target bundle's linkage — otherwise the card
  // keeps its old topic and shows up under both the old topic and the new bundle.
  const target = targetBundleId ? await db.bundles.get(targetBundleId) : null;
  for (const id of ids) {
    await db.flashcards.update(id, {
      bundleId: targetBundleId,
      ...(target ? { topicId: target.topicId, subjectId: target.subjectId } : {}),
      updatedAt: new Date(),
    });
  }
  return { count: ids.length };
}

// ─── Goals (kanban todo) ─────────────────────────────────────────

export async function getGoals(): Promise<GoalRec[]> {
  return db.goals.orderBy("createdAt").toArray();
}

export async function createGoal(data: {
  title: string;
  description?: string;
  horizon: GoalHorizon;
  dueDate?: Date | null;
  repeat?: GoalRepeat | null;
  subjectId?: string | null;
  color?: string | null;
}): Promise<GoalRec> {
  const inBacklog = await db.goals.where("status").equals("backlog").count();
  const now = new Date();
  const goal: GoalRec = {
    id: uid(),
    title: data.title.trim(),
    description: data.description?.trim() || null,
    horizon: data.horizon,
    status: "backlog",
    order: inBacklog,
    dueDate: data.dueDate ?? null,
    repeat: data.repeat ?? null,
    subjectId: data.subjectId ?? null,
    color: data.color ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await db.goals.add(goal);
  return goal;
}

export async function updateGoal(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    horizon: GoalHorizon;
    dueDate: Date | null;
    repeat: GoalRepeat | null;
    subjectId: string | null;
    color: string | null;
  }>
): Promise<void> {
  await db.goals.update(id, { ...data, updatedAt: new Date() });
}

// Advance a date by one repeat interval (daily/weekly/monthly).
function nextRepeatDate(base: Date, repeat: GoalRepeat): Date {
  const d = new Date(base);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export async function moveGoal(id: string, status: GoalStatus, index: number): Promise<void> {
  // Pull the goal, reindex the target column, insert at `index`.
  const goal = await db.goals.get(id);
  if (!goal) return;

  // Repeating todo completed → reschedule and bounce back to the backlog
  // for the next cycle instead of parking it in Done.
  if (status === "done" && goal.repeat) {
    const base = goal.dueDate && new Date(goal.dueDate).getTime() > Date.now()
      ? new Date(goal.dueDate)
      : new Date();
    const backlogCount = await db.goals.where("status").equals("backlog").count();
    await db.goals.update(id, {
      status: "backlog",
      order: backlogCount,
      dueDate: nextRepeatDate(base, goal.repeat),
      completedAt: null,
      updatedAt: new Date(),
    });
    return;
  }

  const col = await db.goals.where("status").equals(status).sortBy("order");
  const rest = col.filter((g) => g.id !== id);
  const clamped = Math.max(0, Math.min(index, rest.length));
  await db.transaction("rw", db.goals, async () => {
    for (let i = 0; i < rest.length; i++) {
      const newOrder = i >= clamped ? i + 1 : i;
      if (rest[i].order !== newOrder) {
        await db.goals.update(rest[i].id, { order: newOrder });
      }
    }
    await db.goals.update(id, {
      status,
      order: clamped,
      updatedAt: new Date(),
      completedAt: status === "done" ? new Date() : null,
    });
  });
}

export async function deleteGoal(id: string): Promise<void> {
  // Genuine cascade — milestones must die with the goal.
  await db.milestones.where("goalId").equals(id).delete();
  await db.goals.delete(id);
}

export async function getMilestones(goalId: string): Promise<MilestoneRec[]> {
  return db.milestones.where("goalId").equals(goalId).sortBy("order");
}

export async function getAllMilestones(): Promise<MilestoneRec[]> {
  return db.milestones.toArray();
}

export async function createMilestone(goalId: string, title: string): Promise<MilestoneRec> {
  const count = await db.milestones.where("goalId").equals(goalId).count();
  const ms: MilestoneRec = {
    id: uid(),
    goalId,
    title: title.trim(),
    done: false,
    order: count,
    createdAt: new Date(),
  };
  await db.milestones.add(ms);
  await db.goals.update(goalId, { updatedAt: new Date() });
  return ms;
}

export async function toggleMilestone(id: string, done: boolean): Promise<void> {
  await db.milestones.update(id, { done });
}

export async function deleteMilestone(id: string): Promise<void> {
  await db.milestones.delete(id);
}

// ─── Full Data Export / Import ───────────────────────────────
// v2: cards carry full SM-2 scheduling (easeFactor/intervalDays/nextReview/
// reviewCount/isLeech) and the export includes reviewLogs — a v1 backup of a
// spaced-repetition app silently reset every card's schedule and wiped
// streaks/heatmaps/accuracy on restore.
export type FullExport = {
  version: 2;
  exportedAt: string;
  subjects: {
    name: string;
    description?: string | null;
    color: string;
    icon: string;
    topics: {
      name: string;
      description?: string | null;
      order: number;
      notes: { title: string; content: string; isPinned: boolean; tags: string[] }[];
      flashcards: ExportedCard[];
    }[];
  }[];
  bundles: {
    name: string;
    description?: string | null;
    color: string;
    /** v2: re-link the bundle to its topic on import (matched by name). */
    topicName?: string | null;
    subjectName?: string | null;
    flashcards: ExportedCard[];
  }[];
  sessions: {
    title: string;
    durationMin: number;
    notes?: string | null;
    completed: boolean;
    startedAt: string;
    /** v2.1: re-link the session to its subject/topic on import (matched by name). */
    subjectName?: string | null;
    topicName?: string | null;
    endedAt?: string | null;
  }[];
  goals?: {
    title: string;
    description?: string | null;
    horizon: GoalHorizon;
    status: GoalStatus;
    order: number;
    dueDate?: string | null;
    repeat?: GoalRepeat | null;
    /** v2.1: re-link the goal to its subject on import (matched by name). */
    subjectName?: string | null;
    color?: string | null;
    completedAt?: string | null;
    milestones: { title: string; done: boolean; order: number }[];
  }[];
  /** v2: raw review logs so streak/heatmap/accuracy survive a restore. */
  reviewLogs?: { flashcardId?: string; cardIndex?: number; reviewedAt: string; quality: number }[];
};

/** Scheduling snapshot attached to every exported card (v2). */
type ExportedCard = {
  front: string;
  back: string;
  difficulty?: number;
  tags: string[];
  description?: string | null;
  // v2 scheduling (omitted by v1 backups → import treats them as absent)
  easeFactor?: number;
  intervalDays?: number;
  nextReview?: string;
  lastReview?: string | null;
  reviewCount?: number;
  consecutiveAgain?: number;
  isLeech?: boolean;
  // v2.2 card kinds (omitted for basic cards → import treats them as basic)
  kind?: CardKind;
  choices?: string[];
};

export async function exportAllData(): Promise<string> {
  const [subjects, bundles, sessions, goals, reviewLogs] = await Promise.all([
    db.subjects.toArray(),
    db.bundles.toArray(),
    db.studySessions.orderBy("startedAt").toArray(),
    db.goals.toArray(),
    db.reviewLogs.toArray(),
  ]);

  // Per-card scheduling snapshot (v2)
  const schedOf = async (c: FlashcardRec): Promise<ExportedCard> => ({
    front: c.front,
    back: c.back,
    difficulty: c.difficulty,
    tags: (await cardTagsInclude(c.id)).map((ct) => ct.tag.name),
    description: c.description ?? null,
    easeFactor: c.easeFactor,
    intervalDays: c.intervalDays,
    nextReview: new Date(c.nextReview).toISOString(),
    lastReview: c.lastReview ? new Date(c.lastReview).toISOString() : null,
    reviewCount: c.reviewCount,
    consecutiveAgain: c.consecutiveAgain,
    isLeech: c.isLeech,
    ...(cardKind(c) !== "basic" ? { kind: cardKind(c) } : {}),
    ...(cardKind(c) === "choice" && c.choices?.length ? { choices: c.choices } : {}),
  });

  // Subject/topic lookup for session attribution (v2.1)
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const topicsById = new Map((await db.topics.toArray()).map((t) => [t.id, t]));
  const sessionEntries: FullExport["sessions"] = sessions.map((s) => ({
    title: s.title,
    durationMin: s.durationMin,
    notes: s.notes,
    completed: s.completed,
    startedAt: new Date(s.startedAt).toISOString(),
    subjectName: s.subjectId ? (subjectsById.get(s.subjectId)?.name ?? null) : null,
    topicName: s.topicId ? (topicsById.get(s.topicId)?.name ?? null) : null,
    endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
  }));

  // Card traversal order (v2.1): topic cards (bundle-owned excluded, matching
  // the subject loop below) then bundle cards. Review logs carry the card's
  // index in this order so import can re-attach them to the re-created cards.
  const cardOrder = new Map<string, number>();
  for (const s of subjects) {
    const topics = await db.topics.where("subjectId").equals(s.id).sortBy("order");
    for (const t of topics) {
      const cards = await db.flashcards.where("topicId").equals(t.id).toArray();
      for (const c of cards) {
        if (c.bundleId) continue;
        if (!cardOrder.has(c.id)) cardOrder.set(c.id, cardOrder.size);
      }
    }
  }
  for (const b of bundles) {
    const cards = await db.flashcards.where("bundleId").equals(b.id).toArray();
    for (const c of cards) {
      if (!cardOrder.has(c.id)) cardOrder.set(c.id, cardOrder.size);
    }
  }
  const orderedLogs = [...reviewLogs].sort((a, b) => {
    const ia = cardOrder.has(a.flashcardId) ? cardOrder.get(a.flashcardId)! : Infinity;
    const ib = cardOrder.has(b.flashcardId) ? cardOrder.get(b.flashcardId)! : Infinity;
    if (ia !== ib) return ia - ib;
    return new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime();
  });

  const exportData: FullExport = {
    version: 2,
    exportedAt: new Date().toISOString(),
    subjects: [],
    bundles: [],
    sessions: sessionEntries,
    goals: [],
    reviewLogs: orderedLogs.map((r) => ({
      flashcardId: r.flashcardId,
      cardIndex: cardOrder.has(r.flashcardId) ? cardOrder.get(r.flashcardId)! : -1,
      reviewedAt: new Date(r.reviewedAt).toISOString(),
      quality: r.quality,
    })),
  };

  for (const s of subjects) {
    const topics = await db.topics.where("subjectId").equals(s.id).sortBy("order");
    const topicEntries = [];
    for (const t of topics) {
      const notes = await db.notes.where("topicId").equals(t.id).toArray();
      const noteEntries = [];
      for (const n of notes) {
        const tags = (await noteTagsInclude(n.id)).map((nt) => nt.tag.name);
        noteEntries.push({ title: n.title, content: n.content, isPinned: n.isPinned, tags });
      }
      const cards = await db.flashcards.where("topicId").equals(t.id).toArray();
      const cardEntries: ExportedCard[] = [];
      for (const c of cards) {
        // Cards owned by a bundle are exported WITH their bundle below —
        // exporting them here too duplicated them on import.
        if (c.bundleId) continue;
        cardEntries.push(await schedOf(c));
      }
      topicEntries.push({
        name: t.name,
        description: t.description,
        order: t.order,
        notes: noteEntries,
        flashcards: cardEntries,
      });
    }
    exportData.subjects.push({
      name: s.name,
      description: s.description,
      color: s.color,
      icon: s.icon,
      topics: topicEntries,
    });
  }

  for (const b of bundles) {
    const cards = await db.flashcards.where("bundleId").equals(b.id).toArray();
    const cardEntries: ExportedCard[] = [];
    for (const c of cards) {
      cardEntries.push(await schedOf(c));
    }
    // Topic context for re-linking on import (v2)
    const bTopic = b.topicId ? await db.topics.get(b.topicId) : undefined;
    const bSubject = bTopic?.subjectId ? await db.subjects.get(bTopic.subjectId) : undefined;
    exportData.bundles.push({
      name: b.name,
      description: b.description,
      color: b.color,
      topicName: bTopic?.name ?? null,
      subjectName: bSubject?.name ?? null,
      flashcards: cardEntries,
    });
  }

  for (const g of goals) {
    const ms = await db.milestones.where("goalId").equals(g.id).sortBy("order");
    exportData.goals!.push({
      title: g.title,
      description: g.description,
      horizon: g.horizon,
      status: g.status,
      order: g.order,
      dueDate: g.dueDate ? new Date(g.dueDate).toISOString() : null,
      repeat: g.repeat ?? null,
      subjectName: g.subjectId ? (subjectsById.get(g.subjectId)?.name ?? null) : null,
      color: g.color,
      completedAt: g.completedAt ? new Date(g.completedAt).toISOString() : null,
      milestones: ms.map((m) => ({ title: m.title, done: m.done, order: m.order })),
    });
  }

  return JSON.stringify(exportData, null, 2);
}

export async function importAllData(json: string): Promise<{ imported: string }> {
  const data = JSON.parse(json) as FullExport;
  if (!data.version || !data.subjects) throw new Error("Invalid backup file");
  // v1 (scheduling-free) and v2 (full SM-2 + review logs) are both accepted;
  // anything newer is rejected — importing a future v3 with v2 rules would
  // silently drop fields the user expects to survive.
  if (data.version > 2) {
    throw new Error(
      `Backup version ${data.version} is newer than this app supports (v2). Update the app first.`
    );
  }

  let imported = "";

  // Card ids in export traversal order (subjects' topics, then bundles) —
  // review logs carry cardIndex into this order for re-attachment below.
  const importedCardIds: string[] = [];

  // NOTE: not wrapped in db.transaction() — the import path re-enters the
  // same IndexedDB tables through many small awaited helpers and Dexie
  // disallows awaiting non-Dexie promises inside a transaction. A mid-import
  // failure therefore leaves a partial import; the caller surfaces the error
  // and can delete duplicates manually (each import re-runs with fresh ids).
  // Import subjects → topics → notes + flashcards
  for (const s of data.subjects) {
    const subject = await createSubject({
      name: s.name,
      description: s.description ?? undefined,
      color: s.color,
      icon: s.icon,
    });
    imported += `subject "${s.name}" `;
    for (const t of s.topics) {
      const topic = await createTopic({
        subjectId: subject.id,
        name: t.name,
        description: t.description ?? undefined,
        order: t.order,
      });
      for (const n of t.notes) {
        await createNote({
          topicId: topic.id,
          title: n.title,
          content: n.content,
          isPinned: n.isPinned,
          tags: n.tags,
        });
      }
      for (const c of t.flashcards) {
        const card = await createFlashcard({
          topicId: topic.id,
          subjectId: subject.id,
          front: c.front,
          back: c.back,
          // AGAIN reviews store difficulty 0, which createFlashcard rejects
          // (min 1) — clamp so reviewed cards survive a round-trip.
          difficulty:
            c.difficulty !== undefined
              ? Math.min(5, Math.max(1, c.difficulty))
              : undefined,
          description: c.description ?? undefined,
          // v2.2 kinds — validated inside createFlashcard for topic cards;
          // invalid specs throw here (full-backup path is strict, unlike
          // the lenient bundle-batch path).
          kind: c.kind,
          choices: c.choices,
        });
        if (c.tags.length) await setCardTags(card.id, c.tags);
        // v2: restore SM-2 scheduling (v1 backups have no scheduling fields —
        // those cards legitimately import as new).
        if (data.version >= 2) {
          await db.flashcards.update(card.id, {
            ...(c.easeFactor !== undefined ? { easeFactor: c.easeFactor } : {}),
            ...(c.intervalDays !== undefined ? { intervalDays: c.intervalDays } : {}),
            ...(c.nextReview ? { nextReview: new Date(c.nextReview) } : {}),
            ...(c.lastReview ? { lastReview: new Date(c.lastReview) } : {}),
            ...(c.reviewCount !== undefined ? { reviewCount: c.reviewCount } : {}),
            ...(c.consecutiveAgain !== undefined ? { consecutiveAgain: c.consecutiveAgain } : {}),
            ...(c.isLeech !== undefined ? { isLeech: c.isLeech } : {}),
          });
        }
        importedCardIds.push(card.id);
      }
    }
  }

  // Import bundles → flashcards. v2 restores the topic link (matched by
  // subject+topic name) so topic-owned bundles come back topic-owned.
  for (const b of data.bundles) {
    let topicId: string | null = null;
    let subjectId: string | null = null;
    if (b.topicName) {
      const topics = await db.topics.where("name").equals(b.topicName).toArray();
      let match: TopicRec | undefined;
      if (b.subjectName) {
        const subj = await db.subjects.where("name").equals(b.subjectName).first();
        if (subj) match = topics.find((t) => t.subjectId === subj.id);
      }
      // fallback: most recently created topic with that name
      if (!match) match = topics[topics.length - 1];
      if (match) {
        topicId = match.id;
        subjectId = match.subjectId;
      }
    }
    const bundle = await createBundle({
      name: b.name,
      description: b.description ?? undefined,
      color: b.color,
      topicId,
      subjectId,
    });
    imported += `bundle "${b.name}" `;
    for (const c of b.flashcards) {
      const card = await createBundleFlashcard({
        bundleId: bundle.id,
        front: c.front,
        back: c.back,
        description: c.description ?? undefined,
        kind: c.kind,
        choices: c.choices,
      });
      if (c.tags.length) await setCardTags(card.id, c.tags);
      if (data.version >= 2) {
        await db.flashcards.update(card.id, {
          ...(c.easeFactor !== undefined ? { easeFactor: c.easeFactor } : {}),
          ...(c.intervalDays !== undefined ? { intervalDays: c.intervalDays } : {}),
          ...(c.nextReview ? { nextReview: new Date(c.nextReview) } : {}),
          ...(c.lastReview ? { lastReview: new Date(c.lastReview) } : {}),
          ...(c.reviewCount !== undefined ? { reviewCount: c.reviewCount } : {}),
          ...(c.consecutiveAgain !== undefined ? { consecutiveAgain: c.consecutiveAgain } : {}),
          ...(c.isLeech !== undefined ? { isLeech: c.isLeech } : {}),
          updatedAt: new Date(),
        });
      }
      importedCardIds.push(card.id);
    }
  }

  // Import sessions (v2.1 re-links subject/topic by name; ids are fresh)
  for (const s of data.sessions) {
    let subjectId: string | null = null;
    let topicId: string | null = null;
    if (s.subjectName) {
      const subj = await db.subjects.where("name").equals(s.subjectName).first();
      if (subj) {
        subjectId = subj.id;
        if (s.topicName) {
          const topic = await db.topics.where("subjectId").equals(subj.id).filter((t) => t.name === s.topicName).first();
          if (topic) topicId = topic.id;
        }
      }
    }
    const now = new Date();
    await db.studySessions.add({
      id: uid(),
      subjectId,
      topicId,
      title: s.title,
      durationMin: s.durationMin,
      notes: s.notes ?? null,
      completed: s.completed,
      startedAt: new Date(s.startedAt),
      endedAt: s.endedAt ? new Date(s.endedAt) : now,
    });
  }
  imported += `${data.sessions.length} sessions`;

  // Import goals → milestones (optional field — old backups still work)
  if (data.goals) {
    for (const g of data.goals) {
      let goalSubjectId: string | null = null;
      if (g.subjectName) {
        const subj = await db.subjects.where("name").equals(g.subjectName).first();
        if (subj) goalSubjectId = subj.id;
      }
      const goal = await createGoal({
        title: g.title,
        description: g.description ?? undefined,
        horizon: g.horizon,
        dueDate: g.dueDate ? new Date(g.dueDate) : null,
        repeat: g.repeat ?? null,
        subjectId: goalSubjectId,
        color: g.color ?? null,
      });
      if (g.status === "done" && g.repeat) {
        // Bypass moveGoal's repeat-reschedule branch — a restore must land
        // in Done, not bounce back to the backlog with a new due date.
        await db.goals.update(goal.id, {
          status: "done",
          order: g.order,
          completedAt: g.completedAt ? new Date(g.completedAt) : new Date(),
          updatedAt: new Date(),
        });
      } else {
        await moveGoal(goal.id, g.status, g.order);
        if (g.status === "done" && g.completedAt) {
          await db.goals.update(goal.id, { completedAt: new Date(g.completedAt) });
        }
      }
      for (const m of g.milestones ?? []) {
        const ms = await createMilestone(goal.id, m.title);
        if (m.done) await toggleMilestone(ms.id, true);
      }
    }
    imported += ` ${data.goals.length} goals`;
  }

  // v2: restore review logs. Card ids are fresh (import re-creates everything),
  // so logs are re-attached to the imported cards by cardIndex — the export's
  // cards (subjects' then bundles') walk the same order as importedCardIds
  // above. Logs without a usable index (v1/v2.0 files, or cards not in this
  // file) are still imported as unattached history rows so streak/heatmap
  // counts survive.
  if (data.reviewLogs?.length) {
    const logs: ReviewLogRec[] = data.reviewLogs.map((r) => ({
      id: uid(),
      flashcardId:
        r.cardIndex !== undefined && r.cardIndex >= 0 && r.cardIndex < importedCardIds.length
          ? importedCardIds[r.cardIndex]
          : "imported",
      quality: r.quality,
      reviewedAt: new Date(r.reviewedAt),
    }));
    await db.reviewLogs.bulkAdd(logs);
    imported += ` ${logs.length} review logs`;
  }

  return { imported };
}

// ─── Bulk import (NotebookLM / any LLM → flashcards) ─────────────
import { parseAiCardsInput, AiCardInput } from "@/lib/ai-import";

export async function bulkCreateFlashcards(
  bundleId: string,
  cardsJson: string
): Promise<{ ok: boolean; created: number; error?: string }> {
  let parsed: AiCardInput[];
  try {
    parsed = parseAiCardsInput(cardsJson);
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    return {
      ok: false,
      created: 0,
      error:
        code === "EMPTY_INPUT" ? "Paste some JSON first." :
        code === "INVALID_JSON" ? "That isn't valid JSON. Strip any markdown fences and try again." :
        code === "SHAPE_MISMATCH" ? "JSON shape is wrong — expected an array of {front, back} objects, or { cards: [...] }." :
        "Failed to parse input.",
    };
  }
  const bundle = await db.bundles.get(bundleId);
  if (!bundle) return { ok: false, created: 0, error: "Bundle not found." };

  const now = new Date();
  const rows = parsed.map((c) => {
    // Lenient kind restore (same rule as CSV/batch import): an invalid
    // kind spec becomes a basic card rather than failing the batch.
    let kind: CardKind = c.kind === "cloze" || c.kind === "choice" ? c.kind : "basic";
    const choices = cleanChoices(c.choices ?? []);
    if (kind === "cloze" && !isCloze(c.front)) kind = "basic";
    if (kind === "choice" && choices.length < 2) kind = "basic";
    return {
      id: uid(),
      topicId: null,
      subjectId: null,
      bundleId,
      front: c.front,
      back: c.back,
      frontDescription: (c as any).frontDescription ?? null,
      backDescription: (c as any).backDescription ?? c.description ?? null,
      description: c.description ?? (c as any).backDescription ?? null,
      difficulty: c.difficulty ?? 1,
      kind,
      choices: kind === "choice" ? choices : null,
    easeFactor: 2.5,
    intervalDays: 0,
    nextReview: now,
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
    };
  });
  await db.flashcards.bulkAdd(rows);
  return { ok: true, created: rows.length };
}

/** Bulk import cards into a bundle, from a note's text. Verifies note + bundle exist. */
export async function bulkCreateFlashcardsFromNote(
  noteId: string,
  bundleId: string,
  cardsJson: string
): Promise<{ ok: boolean; created: number; error?: string }> {
  const note = await db.notes.get(noteId);
  if (!note) return { ok: false, created: 0, error: "Note not found." };
  return bulkCreateFlashcards(bundleId, cardsJson);
}

// ─── Reset card progress (used by bulk reset + hardest-cards table) ──
export async function batchResetCardProgress(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const now = new Date();
  await db.flashcards.where("id").anyOf(ids).modify({
    easeFactor: 2.5,
    intervalDays: 1,
    nextReview: now,
    lastReview: undefined,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    updatedAt: now,
  });
  return ids.length;
}
