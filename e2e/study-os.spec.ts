import { test, expect } from "@playwright/test";

// ─── Study OS E2E smoke (Conductor) ──────────────────────────────
// Covers the integration the unit tests can't see end-to-end in a browser:
//   1. /exam and /plan render past the loader
//   2. the dashboard Next Action appears (Conductor wiring)
//   3. the Contract-5 feeding rule: a wrong exam answer moves the card's
//      REAL schedule through reviewFlashcardWithLog (FSRS state written)

test.beforeEach(async ({ page }) => {
  // Fresh storage per test — same hygiene as critical.spec.ts.
  await page.goto("/offline").catch(() => {});
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    await new Promise<void>((res) => {
      const rq = indexedDB.deleteDatabase("studymax");
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    });
  });
});

test("study-os routes render: /exam and /plan", async ({ page }) => {
  for (const route of ["/exam", "/plan"]) {
    await page.goto(route);
    await expect
      .poll(async () => (await page.locator("body").innerText()).includes("Loading Ruvren"), {
        timeout: 20_000,
      })
      .toBe(false);
    await expect(page.locator("body")).not.toContainText("Something broke");
  }
});

test("exam run feeds wrong answers into the real review schedule", async ({ page }) => {
  await page.goto("/exam");

  // Seed one subject + topic + 4 cards via raw IndexedDB (the app's Dexie
  // DB already exists at its current version after the first goto).
  await page.evaluate(async () => {
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const rq = indexedDB.open("studymax");
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const idb = await open();
    await new Promise<void>((res, rej) => {
      const tx = idb.transaction(["subjects", "topics", "flashcards"], "readwrite");
      const now = new Date();
      const subjectId = "e2e-subject-1";
      const topicId = "e2e-topic-1";
      tx.objectStore("subjects").put({
        id: subjectId, name: "E2E Physics", description: null, color: "#4ade80", icon: "book-open", createdAt: now, updatedAt: now,
      });
      tx.objectStore("topics").put({
        id: topicId, subjectId, name: "E2E Mechanics", description: null, order: 0, createdAt: now, updatedAt: now,
      });
      ["Q1", "Q2", "Q3", "Q4"].forEach((front, i) => {
        tx.objectStore("flashcards").put({
          id: `e2e-card-${i}`, topicId, subjectId, bundleId: null, front, back: `A${i + 1}`,
          frontDescription: null, backDescription: null, description: null,
          difficulty: 3, kind: "choice", choices: [`W${i}a`, `W${i}b`, `W${i}c`],
          easeFactor: 2.5, intervalDays: 1,
          nextReview: new Date(Date.now() - 86_400_000), // due now
          lastReview: null, reviewCount: 0, consecutiveAgain: 0, isLeech: false,
          createdAt: now, updatedAt: now,
        });
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    idb.close();
  });
  await page.reload();
  await expect(page.getByText("E2E Physics")).toBeVisible({ timeout: 15_000 });

  // Start a real (non-practice) exam.
  await page.getByRole("button", { name: /start exam/i }).click();

  // Answer all questions WRONG on purpose (pick the last distractor).
  for (let i = 0; i < 4; i++) {
    await expect(page.locator(".glass button", { hasText: /^W/ }).first()).toBeVisible({ timeout: 10_000 });
    await page.locator(".glass button", { hasText: /^W/ }).last().click();
    await page.waitForTimeout(150);
  }

  // Results screen shows the score (exact: the topic rows also contain "0%").
  await expect(page.getByText("0%", { exact: true })).toBeVisible({ timeout: 15_000 });

  // THE integration assertion: wrong answers wrote real FSRS state + logs.
  const probe = await page.evaluate(async () => {
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const rq = indexedDB.open("studymax");
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const idb = await open();
    const getAll = (store: string) =>
      new Promise<unknown[]>((res, rej) => {
        const rq = idb.transaction(store, "readonly").objectStore(store).getAll();
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const cards = (await getAll("flashcards")) as Record<string, unknown>[];
    const logs = await getAll("reviewLogs");
    idb.close();
    return {
      cards: cards.length,
      scheduledSooner: cards.filter((c) => typeof c.fsrsStability === "number" && (c.fsrsStability as number) < 3.8).length,
      reviewCount: cards.reduce((a, c) => a + Number(c.reviewCount ?? 0), 0),
      logs: logs.length,
    };
  });
  expect(probe.cards).toBe(4);
  expect(probe.scheduledSooner).toBe(4); // every wrong answer moved its card
  expect(probe.reviewCount).toBe(4);
  expect(probe.logs).toBeGreaterThanOrEqual(4);
});

test("dashboard Next Action renders the Conductor wiring", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(async () => (await page.locator("body").innerText()).includes("Loading Ruvren"), { timeout: 20_000 })
    .toBe(false);
  // With no due cards/weakness, the engine falls through to the planned-session action.
  await expect(page.getByText(/start a focus session/i).first()).toBeVisible({ timeout: 15_000 });
});
