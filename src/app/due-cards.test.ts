import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  createSubject,
  createTopic,
  createFlashcard,
  getDueCount,
  getDueFlashcards,
  getAllDueFlashcards,
  getFlashcards,
} from "@/app/actions";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

/** One overdue card and one card scheduled a month out. */
async function seedDueAndFuture() {
  const subject = await createSubject({ name: "Cells", color: "#00ff00", icon: "leaf" });
  const topic = await createTopic({ subjectId: subject.id, name: "Mitosis", order: 0 });
  const due = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "due", back: "a" });
  const future = await createFlashcard({ topicId: topic.id, subjectId: subject.id, front: "future", back: "b" });
  await db.flashcards.update(due.id, { nextReview: new Date(Date.now() - 60_000) });
  await db.flashcards.update(future.id, { nextReview: new Date(Date.now() + 30 * 86_400_000) });
  return { subject, topic, due, future };
}

describe("due-card queries", () => {
  it("getDueCount counts only cards at or before now", async () => {
    await seedDueAndFuture();
    expect(await getDueCount()).toBe(1);
  });

  it("getDueCount is 0 on an empty database", async () => {
    // Guards the `nextReview` index range query against an empty store.
    expect(await getDueCount()).toBe(0);
  });

  it("getDueCount treats a card due this instant as due (inclusive boundary)", async () => {
    const { future } = await seedDueAndFuture();
    await db.flashcards.update(future.id, { nextReview: new Date(Date.now() - 1) });
    expect(await getDueCount()).toBe(2);
  });

  it("getDueCount excludes a card that is not yet due", async () => {
    const { future } = await seedDueAndFuture();
    // Comfortably in the future, so the query's own Date.now() cannot race it.
    await db.flashcards.update(future.id, { nextReview: new Date(Date.now() + 5_000) });
    expect(await getDueCount()).toBe(1);
  });

  it("getAllDueFlashcards returns only due cards", async () => {
    const { due } = await seedDueAndFuture();
    const all = await getAllDueFlashcards();
    expect(all.map((c) => c.id)).toEqual([due.id]);
  });

  it("getAllDueFlashcards orders most-overdue first", async () => {
    const { due, future } = await seedDueAndFuture();
    await db.flashcards.update(future.id, { nextReview: new Date(Date.now() - 5 * 86_400_000) });
    const all = await getAllDueFlashcards();
    expect(all.map((c) => c.id)).toEqual([future.id, due.id]);
  });

  it("getDueFlashcards resolves the batched topic include", async () => {
    const { topic } = await seedDueAndFuture();
    const cards = await getDueFlashcards();
    expect(cards).toHaveLength(1);
    expect(cards[0].topic).toEqual({
      id: topic.id,
      name: "Mitosis",
      subject: expect.objectContaining({ name: "Cells" }),
    });
  });

  it("getFlashcards filters by topic through the index and keeps the include", async () => {
    const { topic } = await seedDueAndFuture();
    const byTopic = await getFlashcards(topic.id);
    expect(byTopic).toHaveLength(2);
    expect(byTopic[0].topic?.id).toBe(topic.id);
  });

  it("getFlashcards filters by subject, and returns everything with no filter", async () => {
    const { subject } = await seedDueAndFuture();
    expect(await getFlashcards(undefined, subject.id)).toHaveLength(2);
    expect(await getFlashcards()).toHaveLength(2);
  });

  it("getFlashcards intersects topic and subject filters", async () => {
    const { topic, subject } = await seedDueAndFuture();
    expect(await getFlashcards(topic.id, subject.id)).toHaveLength(2);
    expect(await getFlashcards(topic.id, "subject-that-does-not-exist")).toHaveLength(0);
  });
});
