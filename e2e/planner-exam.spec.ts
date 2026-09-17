import { test, expect, type Page } from "@playwright/test";

// ─── Planner + Exam E2E (regression suite for the plan/exam fix wave) ──
// Covers the cross-page bugs vitest can't see in a real browser:
//   1. an exam delivers EXACTLY the requested question count (the old
//      gcd-stride pick collapsed 8 requested from a 12-card pool to 3)
//   2. the runner's ANSWERED counter updates as questions are graded
//   3. results/history denominators show the built count, not the request
//   4. the setup pool count reacts to subject scope changes
//   5. /plan marks an in-progress exam on its start day (★)
//   6. /plan shows the user's task estimate, not the schedule-split remainder

const DAY = 86_400_000;

type Row = Record<string, unknown>;

test.beforeEach(async ({ page }) => {
  // Fresh storage per test — same hygiene as the other specs.
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

async function waitReady(page: Page) {
  await expect
    .poll(async () => (await page.locator("body").innerText()).includes("Loading OpenStudy"), {
      timeout: 20_000,
    })
    .toBe(false);
  await expect(page.locator("body")).not.toContainText("Something broke");
}

async function gotoReady(page: Page, route: string) {
  await page.goto(route);
  await waitReady(page);
}

// Load the app first so Dexie has created the current schema, then seed raw
// rows (same pattern as study-os.spec.ts), then reload so mount-fetches see
// the seeded data.
async function seedDb(page: Page, stores: Record<string, Row[]>) {
  await page.evaluate(async (stores) => {
    const idb = await new Promise<IDBDatabase>((res, rej) => {
      const rq = indexedDB.open("studymax");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = idb.transaction(Object.keys(stores), "readwrite");
      for (const [store, rows] of Object.entries(stores)) {
        for (const row of rows) tx.objectStore(store).put(row);
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    idb.close();
  }, stores);
}

async function readStore(page: Page, store: string): Promise<Row[]> {
  return page.evaluate(async (store) => {
    const idb = await new Promise<IDBDatabase>((res, rej) => {
      const rq = indexedDB.open("studymax");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const rows = await new Promise<Row[]>((res, rej) => {
      const rq = idb.transaction(store, "readonly").objectStore(store).getAll();
      rq.onsuccess = () => res(rq.result as Row[]);
      rq.onerror = () => rej(rq.error);
    });
    idb.close();
    return rows;
  }, store);
}

function subjectRow(id: string, name: string): Row {
  const now = new Date();
  return { id, name, description: null, color: "#4ade80", icon: "book-open", createdAt: now, updatedAt: now };
}

function cardRow(i: number, subjectId: string): Row {
  const now = new Date();
  return {
    id: `e2e-card-${i}`,
    topicId: null,
    subjectId,
    bundleId: null,
    front: `E2E Q${i}`,
    back: `E2E A${i}`,
    frontDescription: null,
    backDescription: null,
    description: null,
    difficulty: 3,
    kind: "basic",
    choices: null,
    easeFactor: 2.5,
    intervalDays: 1,
    nextReview: new Date(Date.now() - DAY), // due now
    lastReview: null,
    reviewCount: 0,
    consecutiveAgain: 0,
    isLeech: false,
    createdAt: now,
    updatedAt: now,
  };
}

test("exam delivers the exact requested count and tracks answers live", async ({ page }) => {
  await gotoReady(page, "/exam");
  // gcd(12, 8) = 4 — the old stride pick collapsed this pool to 3 questions.
  await seedDb(page, {
    subjects: [subjectRow("e2e-ex-subj", "E2E Physics")],
    flashcards: Array.from({ length: 12 }, (_, i) => cardRow(i, "e2e-ex-subj")),
  });
  await page.reload();
  await expect(page.getByText("E2E Physics")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("spinbutton").fill("8");
  await page.getByPlaceholder("Practice exam").fill("E2E Count Exam");
  await page.getByRole("button", { name: /start exam/i }).click();

  // Exactly 8 questions built: the runner header shows "1 / 8".
  await expect(page.getByText("1 / 8")).toBeVisible({ timeout: 15_000 });

  // Answer #1 — the answered counter must move off zero immediately.
  await page.getByRole("button", { name: /easy/i }).first().click();
  await expect(page.getByText("1/8 answered")).toBeVisible({ timeout: 10_000 });

  // Finish the remaining 7 questions.
  for (let i = 0; i < 7; i++) {
    await page.getByRole("button", { name: /easy/i }).first().click();
    await page.waitForTimeout(150);
  }

  // Results: all self-graded EASY → 100%.
  await expect(page.getByText("100%", { exact: true })).toBeVisible({ timeout: 15_000 });

  // History denominator = built count (8), not some other number.
  await page.getByRole("button", { name: /new exam/i }).click();
  await expect(page.getByText("100% · 8/8")).toBeVisible({ timeout: 15_000 });

  // DB truth: 8 questions stored; the exam row records what was BUILT.
  const exams = await readStore(page, "exams");
  const exam = exams.find((e) => e.title === "E2E Count Exam");
  expect(exam).toBeTruthy();
  expect(exam!["questionCount"]).toBe(8);
  const questions = await readStore(page, "examQuestions");
  expect(questions.filter((q) => q["examId"] === exam!["id"])).toHaveLength(8);
});

test("setup pool count follows the selected subject scope", async ({ page }) => {
  await gotoReady(page, "/exam");
  await seedDb(page, {
    subjects: [subjectRow("e2e-pool-a", "E2E Physics"), subjectRow("e2e-pool-b", "E2E Biology")],
    flashcards: [
      ...Array.from({ length: 12 }, (_, i) => cardRow(i, "e2e-pool-a")),
      ...Array.from({ length: 3 }, (_, i) => cardRow(100 + i, "e2e-pool-b")),
    ],
  });
  await page.reload();
  await expect(page.getByText("E2E Physics")).toBeVisible({ timeout: 15_000 });

  // The number under "Cards in pool" is the paragraph right after the label.
  const poolCount = page.getByText("Cards in pool").locator("xpath=following-sibling::p[1]");
  await expect(poolCount).toHaveText("15");

  await page.getByRole("button", { name: "E2E Physics" }).click();
  await expect(poolCount).toHaveText("12");

  await page.getByRole("button", { name: "E2E Biology" }).click();
  await expect(poolCount).toHaveText("15"); // 12 + 3

  await page.getByRole("button", { name: "E2E Physics" }).click(); // deselect
  await expect(poolCount).toHaveText("3");
});

test("plan surfaces today's exam marker and keeps task estimates intact", async ({ page }) => {
  await gotoReady(page, "/exam");
  const now = new Date();
  await seedDb(page, {
    subjects: [subjectRow("e2e-plan-subj", "E2E Physics")],
    flashcards: Array.from({ length: 6 }, (_, i) => cardRow(i, "e2e-plan-subj")),
    exams: [
      {
        id: "e2e-plan-exam",
        title: "E2E Midterm",
        status: "in_progress",
        subjectIds: [],
        topicIds: [],
        questionCount: 5,
        timeLimitSec: null,
        practiceOnly: false,
        scorePct: null,
        correctCount: null,
        durationSec: null,
        startedAt: now,
        completedAt: null,
      },
    ],
    tasks: [
      {
        id: "e2e-plan-task",
        title: "E2E Chapter Task",
        description: null,
        status: "todo",
        order: 0,
        subjectId: "e2e-plan-subj",
        topicId: null,
        goalId: null,
        examId: null,
        dueDate: new Date(Date.now() + DAY + 3_600_000),
        estimateMin: 90,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
    ],
  });

  await gotoReady(page, "/plan");

  // In-progress exam marks its start day on the calendar (★ marker).
  await expect(page.getByText("E2E Midterm")).toBeVisible({ timeout: 15_000 });

  // Review forecast: the 6 seeded cards are all due today.
  await expect(page.getByText(/6 cards due/)).toBeVisible();

  // The open-tasks line keeps the USER's 90m estimate — the planner's
  // day-split must not overwrite it (it used to render the remainder).
  await expect(page.getByText(/· 90m/)).toBeVisible();
});

test("timer expiry auto-completes with answered questions only", async ({ page }) => {
  // The 5-minute countdown must expiry-complete the exam on its own, scoring
  // ONLY what was answered (unanswered questions are never graded).
  await page.clock.install();
  await gotoReady(page, "/exam");
  await seedDb(page, {
    subjects: [subjectRow("e2e-timer-subj", "E2E Physics")],
    flashcards: Array.from({ length: 4 }, (_, i) => cardRow(i, "e2e-timer-subj")),
  });
  await page.reload();
  await expect(page.getByText("E2E Physics")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("spinbutton").fill("4");
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await page.getByRole("button", { name: /start exam/i }).click();
  await expect(page.getByText("1 / 4")).toBeVisible({ timeout: 15_000 });

  // Answer exactly one question, then let the clock blow past the deadline.
  await page.getByRole("button", { name: /easy/i }).first().click();
  await expect(page.getByText("1/4 answered")).toBeVisible({ timeout: 10_000 });
  await page.clock.runFor(310_000);

  // Results scored only the answered question → 100%. (The subtitle counts
  // against ANSWERED, so it reads "1 of 1 correct".)
  await expect(page.getByText("100%", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 1 correct")).toBeVisible();

  // DB truth: exam completed by expiry; exactly one graded question, three
  // left untouched; wall duration ≈ the 5-minute limit.
  const exams = await readStore(page, "exams");
  const exam = exams.find((e) => e["title"] === "Practice exam");
  expect(exam).toBeTruthy();
  expect(exam!["status"]).toBe("completed");
  const questions = await readStore(page, "examQuestions");
  const mine = questions.filter((q) => q["examId"] === exam!["id"]);
  expect(mine).toHaveLength(4);
  expect(mine.filter((q) => q["isCorrect"] === true)).toHaveLength(1);
  expect(mine.filter((q) => q["isCorrect"] === null)).toHaveLength(3);
  const duration = Number(exam!["durationSec"] ?? 0);
  expect(duration).toBeGreaterThanOrEqual(295);
  expect(duration).toBeLessThanOrEqual(320);
});

test("practice-only exam logs answers but never moves schedules", async ({ page }) => {
  // Contract 5, practice branch: logReviewOnly for everything — no FSRS
  // state, no reviewCount change, nextReview frozen; but review evidence
  // must still land in reviewLogs.
  await gotoReady(page, "/exam");
  await seedDb(page, {
    subjects: [subjectRow("e2e-pr-subj", "E2E Physics")],
    flashcards: Array.from({ length: 4 }, (_, i) => cardRow(i, "e2e-pr-subj")),
  });
  await page.reload();
  await expect(page.getByText("E2E Physics")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /start exam/i }).click();
  await expect(page.getByText("1 / 4")).toBeVisible({ timeout: 15_000 });

  // Fail all four on purpose (basic cards → self-grade AGAIN).
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /again/i }).first().click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByText("0%", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/nothing was scheduled/i)).toBeVisible();

  const cards = await readStore(page, "flashcards");
  expect(cards).toHaveLength(4);
  for (const card of cards) {
    // Schedule untouched: no FSRS state, no review count, no interval change.
    expect(card["fsrsStability"] ?? null).toBeNull();
    expect(card["fsrsDifficulty"] ?? null).toBeNull();
    expect(card["fsrsLapses"] ?? null).toBeNull();
    expect(Number(card["reviewCount"] ?? 0)).toBe(0);
    expect(Number(card["intervalDays"] ?? 1)).toBe(1);
    const due = new Date(card["nextReview"] as string).getTime();
    expect(due).toBeLessThan(Date.now()); // still due — nothing pushed it out
  }
  // But the practice evidence WAS logged.
  const logs = await readStore(page, "reviewLogs");
  expect(logs.length).toBeGreaterThanOrEqual(4);
});
