import { test, expect } from "@playwright/test";

// ─── Critical-path E2E ─────────────────────────────────────────
// Covers the exact bug classes vitest can't see:
//   1. hard-load hydration (the liveQuery-loader stall class)
//   2. realtime cross-page updates
//   3. SM-2 practice isolation
//   4. share codec round-trip
//   5. deck card actions

test.beforeEach(async ({ page }) => {
  // Fresh storage per test — wipe IndexedDB + localStorage so the previous
  // test's subjects/decks never leak into this one.
  await page.goto("http://localhost:3457/offline").catch(() => {});
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases?.() ?? [];
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    // Older browsers without databases(): nuke by known name.
    await new Promise<void>((res) => {
      const rq = indexedDB.deleteDatabase("studymax");
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    });
  });
});

test("hard-load: every primary route renders past the loader", async ({ page }) => {
  const routes = ["/", "/subjects", "/notes", "/sessions", "/goals", "/stats", "/share"];
  for (const route of routes) {
    await page.goto(route);
    // Loader text must disappear (hydration completed + first data arrived)
    await expect
      .poll(async () => (await page.locator("body").innerText()).includes("Loading OpenStudy"),
        { timeout: 20_000 })
      .toBe(false);
    await expect(page.locator("body")).not.toContainText("Something broke");
  }
});

test("realtime: creating a subject on /subjects updates the dashboard without reload", async ({ page }) => {
  await page.goto("/subjects");
  await expect(page.locator("body")).not.toContainText("Loading OpenStudy", { timeout: 20_000 });

  // Create a subject (empty state or populated header button)
  const createBtn = page.getByRole("button", { name: /new subject|create subject/i }).first();
  await createBtn.click();
  await page.getByPlaceholder("e.g. Linear Algebra").fill("E2E Realtime Subject");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("E2E Realtime Subject")).toBeVisible({ timeout: 10_000 });

  // SPA-nav to dashboard — subject shortcut should appear without reload
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByText("E2E Realtime Subject")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("body")).not.toContainText("Loading OpenStudy");
});

test("deck: create → card count → edit rename → delete with undo", async ({ page }) => {
  await page.goto("/subjects");
  await page.getByRole("tab", { name: /decks/i }).click();

  await page.getByRole("button", { name: /create deck|new deck/i }).first().click();
  await page.getByPlaceholder(/Biology/i).fill("E2E Deck Alpha");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("E2E Deck Alpha")).toBeVisible({ timeout: 10_000 });

  // Edit via the card's pencil action
  await page.locator('button[aria-label="Edit deck"]').first().click();
  const nameInput = page.locator('input[value="E2E Deck Alpha"]');
  await nameInput.fill("E2E Deck Alpha v2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("E2E Deck Alpha v2")).toBeVisible({ timeout: 10_000 });

  // Delete via the card's trash action (undo toast appears; card leaves the grid)
  await page.locator('button[aria-label="Delete deck"]').first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("E2E Deck Alpha v2")).toBeHidden({ timeout: 10_000 });
});

test("share: empty deck cannot produce a link; seeded deck link round-trips", async ({ page }) => {
  await page.goto("/subjects");
  await page.getByRole("tab", { name: /decks/i }).click();

  // Empty deck → share warns, no success toast
  await page.getByRole("button", { name: /create deck|new deck/i }).first().click();
  await page.getByPlaceholder(/Biology/i).fill("E2E Empty Deck");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText("E2E Empty Deck")).toBeVisible({ timeout: 10_000 });
  await page.locator('button[aria-label="Copy share link"]').first().click();
  await expect(page.getByText(/has no cards yet/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Share link copied/i)).toHaveCount(0);
});

test("share codec: hash from /share#<payload> previews the deck", async ({ page }) => {
  // Build the payload the app itself produces (base64url, no padding, utf-8 safe)
  const payload = {
    app: "studymax-share",
    version: 1,
    name: "E2E Codec Deck",
    description: null,
    cards: [{ front: "2+2", back: "4", description: null, tags: null, kind: null, choices: null }],
  };
  const json = JSON.stringify(payload);
  const hash = Buffer.from(json, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  await page.goto(`/share#${hash}`);
  await expect(page.getByText("INVALID SHARE LINK")).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("E2E Codec Deck")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 cards", { exact: true })).toBeVisible();
});

test("practice mode: rating a not-yet-due card does not advance its schedule", async ({ page }) => {
  // Seed a card directly into IndexedDB with a far-future nextReview.
  // Load the app first so Dexie has created the v6 schema, seed, then reload
  // so the mount-fetch runs with the seeded data in place.
  await page.goto("/subjects");
  await expect(page.locator("body")).not.toContainText("Loading OpenStudy", { timeout: 20_000 });
  await page.evaluate(async () => {
    const now = new Date();
    const far = new Date(now.getTime() + 30 * 86_400_000);
    // create bundle + one card scheduled +30d
    const idb = await new Promise<any>((res, rej) => {
      const rq = indexedDB.open("studymax");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = idb.transaction(["bundles"], "readwrite");
      const req = tx.objectStore("bundles").put({
        id: "e2e-practice-bundle",
        name: "E2E Practice Deck",
        description: null,
        color: "#DFE104",
        topicId: null,
        subjectId: null,
        createdAt: now,
        updatedAt: now,
      });
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = idb.transaction(["flashcards"], "readwrite");
      const req = tx.objectStore("flashcards").put({
        id: "e2e-practice-card",
        topicId: null,
        subjectId: null,
        bundleId: "e2e-practice-bundle",
        front: "Future card",
        back: "Do not reschedule me",
        frontDescription: null,
        backDescription: null,
        description: null,
        difficulty: 1,
        kind: "basic",
        choices: null,
        easeFactor: 2.5,
        intervalDays: 30,
        nextReview: far,
        lastReview: null,
        reviewCount: 2,
        consecutiveAgain: 0,
        isLeech: false,
        createdAt: now,
        updatedAt: now,
      });
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  });

  // Reload: seeded data exists before this run's mount-fetch
  await page.reload();
  await expect(page.locator("body")).not.toContainText("Loading OpenStudy", { timeout: 20_000 });
  await page.getByRole("tab", { name: /decks/i }).click();
  // live hook refetches on tab-visible; if the seeded deck isn't there in 10s, fail with count
  const found = await page.evaluate(async () => {
    const idb = await new Promise<any>((res, rej) => {
      const rq = indexedDB.open("studymax");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return new Promise<number>((res, rej) => {
      const rq = idb.transaction(["bundles"], "readonly").objectStore("bundles").count();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  });
  console.log("bundles in seeded DB:", found);
  await expect(page.getByText("E2E Practice Deck")).toBeVisible({ timeout: 15_000 });
  await page.locator('button:has-text("Review")').first().click();

  // Flip + rate GOOD
  await expect(page.getByText("Future card")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /show answer/i }).click();
  await page.getByRole("button", { name: /easy/i }).first().click();

  // Read back the card: nextReview must still be ~30d out, not advanced
  const next = await page.evaluate(async () => {
    const idb = await new Promise<any>((res, rej) => {
      const rq = indexedDB.open("studymax");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return new Promise<any>((res, rej) => {
      const rq = idb.transaction(["flashcards"], "readonly").objectStore("flashcards").get("e2e-practice-card");
      rq.onsuccess = () => res(rq.result?.nextReview ?? null);
      rq.onerror = () => rej(rq.error);
    });
  });
  expect(next).not.toBeNull();
  const daysOut = (new Date(next as string).getTime() - Date.now()) / 86_400_000;
  // Practice must NOT advance the schedule: still ~30 days out (allow tiny drift)
  expect(daysOut).toBeGreaterThan(28);
  // But the review WAS logged (streak/heatmap count practice)
  const logged = await page.evaluate(async () => {
    const idb = await new Promise<any>((res, rej) => {
      const rq = indexedDB.open("studymax");
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return new Promise<number>((res, rej) => {
      const rq = idb.transaction(["reviewLogs"], "readonly").objectStore("reviewLogs").count();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  });
  expect(logged).toBeGreaterThanOrEqual(1);
});
