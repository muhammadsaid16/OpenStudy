// ─── Deletions are recorded (sync foundation §19) ────────────────
// The foundation in lib/sync.ts is worth nothing if the app keeps deleting rows
// the old way: a hard delete never reaches a peer, so the deleted item simply
// comes back at the next merge. These tests drive the REAL action layer and
// assert a tombstone exists for every removal — and the last test is a static
// guard so a future `db.notes.delete(id)` cannot quietly reintroduce the hole.

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { collectSyncChanges, db } from "@/lib/db";
import {
  batchDeleteCards,
  createBundle,
  createBundleFlashcard,
  createExam,
  createFlashcard,
  createGoal,
  createMilestone,
  createNote,
  createSubject,
  createTask,
  createTopic,
  deleteBundle,
  deleteExam,
  deleteFlashcard,
  deleteGoal,
  deleteNote,
  deleteSubject,
  deleteTask,
  deleteTopic,
  setCardTags,
} from "@/app/actions";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** Everything the tombstone log knows about, keyed by `${table}`. */
async function tombstoned(table: string): Promise<string[]> {
  const rows = await db.tombstones.where("table").equals(table).toArray();
  return rows.map((r) => r.entityId).sort();
}

async function seedTopic() {
  const subject = await createSubject({ name: "Physics", color: "#ffffff", icon: "atom" });
  const topic = await createTopic({ subjectId: subject.id, name: "Waves", order: 0 });
  return { subject, topic };
}

describe("deletions are recorded, not just performed", () => {
  it("stamps rows on write, so a merge has something to compare", async () => {
    // Also proves the hooks survive the delete/reopen in beforeEach — if they
    // did not, every row would arrive at a peer with no `updatedAt` and lose
    // every conflict by default.
    const subject = await createSubject({ name: "Physics", color: "#ffffff", icon: "atom" });
    expect(subject.rev).toBe(1);
    expect(subject.updatedAt).toBeInstanceOf(Date);
    expect(subject.lastDeviceId).toBeTruthy();
  });

  it("deleteFlashcard tombstones the card, its tags and its review history", async () => {
    const { subject, topic } = await seedTopic();
    const card = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "q", back: "a" });
    await setCardTags(card.id, ["waves", "physics"]);
    expect(await db.cardTags.count()).toBe(2);

    await deleteFlashcard(card.id);

    expect(await db.flashcards.get(card.id)).toBeUndefined();
    expect(await tombstoned("flashcards")).toEqual([card.id]);
    // The tag links went through the same door, so they cannot come back.
    expect(await db.cardTags.count()).toBe(0);
    expect(await db.tombstones.where("table").equals("cardTags").count()).toBe(2);
  });

  it("setCardTags records the links it replaced", async () => {
    const { topic } = await seedTopic();
    const card = await createFlashcard({ topicId: topic.id, front: "q", back: "a" });
    await setCardTags(card.id, ["old"]);
    const [link] = await db.cardTags.toArray();
    const oldTagId = link.tagId;

    await setCardTags(card.id, ["new"]);

    const tombstones = await db.tombstones.where("table").equals("cardTags").toArray();
    expect(tombstones.map((t) => t.entityId)).toContain(`${card.id}|${oldTagId}`);
  });

  it("deleteNote tombstones the note and its tag links", async () => {
    const { topic } = await seedTopic();
    const note = await createNote({ topicId: topic.id, title: "Interference", tags: ["waves"] });
    expect(await db.noteTags.count()).toBe(1);

    await deleteNote(note.id);

    expect(await db.notes.get(note.id)).toBeUndefined();
    expect(await tombstoned("notes")).toEqual([note.id]);
    expect(await db.noteTags.count()).toBe(0);
    expect(await db.tombstones.where("table").equals("noteTags").count()).toBe(1);
  });

  it("deleteTopic cascades with a tombstone per table it empties", async () => {
    const { subject, topic } = await seedTopic();
    const card = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "q", back: "a" });
    await setCardTags(card.id, ["waves"]);
    await createNote({ topicId: topic.id, title: "Note" });

    await deleteTopic(topic.id);

    expect(await tombstoned("topics")).toEqual([topic.id]);
    expect(await tombstoned("flashcards")).toEqual([card.id]);
    expect(await db.notes.count()).toBe(0);
    // A cascade that only tombstones the parent is how a topic's cards return
    // from the other device with no parent to hang off.
    expect(await tombstoned("notes")).toHaveLength(1);
    expect(await db.tombstones.where("table").equals("cardTags").count()).toBe(1);
  });

  it("deleteSubject cascades to topics, notes and cards", async () => {
    const { subject, topic } = await seedTopic();
    const card = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "q", back: "a" });
    await createNote({ topicId: topic.id, title: "Note" });

    await deleteSubject(subject.id);

    expect(await db.subjects.count()).toBe(0);
    expect(await db.topics.count()).toBe(0);
    expect(await db.flashcards.count()).toBe(0);
    expect(await tombstoned("subjects")).toEqual([subject.id]);
    expect(await tombstoned("topics")).toEqual([topic.id]);
    expect(await tombstoned("flashcards")).toEqual([card.id]);
    expect(await tombstoned("notes")).toHaveLength(1);
  });

  it("batchDeleteCards tombstones every card in the batch", async () => {
    const { subject, topic } = await seedTopic();
    const a = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "a", back: "1" });
    const b = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "b", back: "2" });

    await batchDeleteCards([a.id, b.id]);

    expect(await db.flashcards.count()).toBe(0);
    expect(await tombstoned("flashcards")).toEqual([a.id, b.id].sort());
  });

  it("deleteGoal takes its milestones with it", async () => {
    const goal = await createGoal({ title: "Finish chapter 4", horizon: "regular" });
    const ms = await createMilestone(goal.id, "Read pages 40-60");

    await deleteGoal(goal.id);

    expect(await db.goals.get(goal.id)).toBeUndefined();
    expect(await db.milestones.get(ms.id)).toBeUndefined();
    expect(await tombstoned("goals")).toEqual([goal.id]);
    expect(await tombstoned("milestones")).toEqual([ms.id]);
  });

  it("deleteTask and deleteExam record their removals", async () => {
    const { subject, topic } = await seedTopic();
    await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "q", back: "a" });
    const task = await createTask({ title: "Read chapter 3" });
    const exam = await createExam({
      title: "Waves quiz",
      subjectIds: [subject.id],
      topicIds: [],
      questionCount: 1,
      timeLimitSec: null,
      practiceOnly: false,
    });
    expect(await db.examQuestions.count()).toBe(1);

    await deleteTask(task.id);
    await deleteExam(exam.id);

    expect(await tombstoned("tasks")).toEqual([task.id]);
    expect(await tombstoned("exams")).toEqual([exam.id]);
    // Exam questions must not survive their exam on the other device either.
    expect(await db.examQuestions.count()).toBe(0);
    expect(await db.tombstones.where("table").equals("examQuestions").count()).toBe(1);
  });

  it("deleting a deck tombstones the deck and each of its cards", async () => {
    const { subject, topic } = await seedTopic();
    const bundle = await createBundle({ name: "Waves deck", color: "#ffffff", topicId: topic.id, subjectId: subject.id });
    const card = await createBundleFlashcard({ bundleId: bundle.id, front: "q", back: "a" });

    await deleteBundle(bundle.id);

    expect(await tombstoned("bundles")).toEqual([bundle.id]);
    expect(await tombstoned("flashcards")).toEqual([card.id]);
  });

  it("an exported payload carries the deletions, so a peer can act on them", async () => {
    const { topic } = await seedTopic();
    const card = await createFlashcard({ topicId: topic.id, front: "q", back: "a" });
    await deleteFlashcard(card.id);

    const payload = await collectSyncChanges(0);

    expect(payload.tombstones.map((t) => t.entityId)).toContain(card.id);
    // The row itself is gone, so a merge cannot resurrect it from this payload.
    expect(payload.rows.flashcards ?? []).toHaveLength(0);
    expect(payload.deviceId).toBeTruthy();
  });
});

// ─── The guard ───────────────────────────────────────────────────
// A rule that lives only in a doc comment rots. This walks the source and
// fails if any `db.<table>...delete()` / `bulkDelete()` reappears outside the
// two modules allowed to do it (sync.ts owns the tombstone write, db.ts binds
// the helpers and deletes the whole database in its recovery path).
describe("no hard deletes outside the tombstone helper", () => {
  const ALLOWED = new Set([
    join("src", "lib", "sync.ts"),
    join("src", "lib", "db.ts"),
    join("src", "lib", "safety-net.ts"),
  ]);

  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, acc);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
    }
    return acc;
  }

  it("every removal in the app goes through deleteMatching / deleteWithTombstones", () => {
    const offenders: string[] = [];
    // `db.` followed by a table then a `.delete(` / `.bulkDelete(` — the whole
    // chain is collapsed to one line first, because these calls are usually
    // written across three lines.
    const pattern = /db\.[A-Za-z]+[^;]{0,240}?\.(?:delete|bulkDelete)\s*\(/g;

    for (const file of sourceFiles("src")) {
      const relative = file.replace(/\\/g, "/");
      if (ALLOWED.has(relative)) continue;
      const source = readFileSync(file, "utf8");
      const collapsed = source.replace(/\s+/g, " ");
      for (const match of collapsed.matchAll(pattern)) {
        offenders.push(`${relative}: ${match[0].slice(0, 90)}`);
      }
    }

    expect(offenders, `Hard deletes found — use deleteWithTombstones/deleteMatching:\n${offenders.join("\n")}`).toEqual([]);
  });
});
