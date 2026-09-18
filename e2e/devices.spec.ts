import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// ─── Devices (sync foundation §19) ───────────────────────────────
// The unit tests prove the merge rules against two Dexie instances in Node.
// This proves the thing only a browser can: that the panel actually exports a
// file from one install and merges it into a second, genuinely separate one
// (a second Playwright context = a second IndexedDB), and that the newer local
// copy survives the merge.
//
// That last assertion is the point. A merge that "works" by overwriting is
// indistinguishable from one that works by reconciling — until someone loses a
// day of study.

const SUBJECT_ID = "e2e-device-subject";

/** Seed rows straight into IndexedDB, as the app's own Dexie DB already exists
 *  after the first page load. `updatedAt` is set because the merge orders on it
 *  (the app's write hooks stamp it for real writes). */
async function seedSubject(page: Page, name: string, id = SUBJECT_ID, offsetMs = 0) {
  await page.evaluate(
    async ({ id, name, offsetMs }) => {
      const open = () =>
        new Promise<IDBDatabase>((res, rej) => {
          const rq = indexedDB.open("studymax");
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => rej(rq.error);
        });
      const idb = await open();
      await new Promise<void>((res, rej) => {
        const tx = idb.transaction(["subjects"], "readwrite");
        const now = new Date(Date.now() + offsetMs);
        tx.objectStore("subjects").put({
          id,
          name,
          description: null,
          color: "#4ade80",
          icon: "book-open",
          createdAt: now,
          updatedAt: now,
        });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
    { id, name, offsetMs }
  );
}

async function readSubject(page: Page, id = SUBJECT_ID) {
  return page.evaluate(async (id) => {
    const open = () =>
      new Promise<IDBDatabase>((res, rej) => {
        const rq = indexedDB.open("studymax");
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const idb = await open();
    return new Promise<{ name?: string; updatedAt?: string } | null>((res, rej) => {
      const tx = idb.transaction(["subjects"], "readonly");
      const rq = tx.objectStore("subjects").get(id);
      rq.onsuccess = () => res(rq.result ?? null);
      rq.onerror = () => rej(rq.error);
    });
  }, id);
}

async function waitForDevicesPanel(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible({ timeout: 20_000 });
}

test("a device file moves data between two installs without clobbering newer work", async ({ page, browser }) => {
  await waitForDevicesPanel(page);
  await seedSubject(page, "E2E Physics");

  // 1. Export from this install — a real download, the file a user would carry.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export for another device" }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bundle = JSON.parse(readFileSync(path!, "utf8"));
  expect(bundle.format).toBe("openstudy-sync");
  expect(bundle.deviceId).toBeTruthy();
  // The seeded row is in the file, with the metadata a merge needs.
  const exported = bundle.rows.subjects.find((r: { key: string }) => r.key === SUBJECT_ID);
  expect(exported.row.name).toBe("E2E Physics");
  expect(exported.row.updatedAt).toBeTruthy();

  // 2. A second install: separate context, so a separate IndexedDB profile.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await waitForDevicesPanel(pageB);
  expect(await readSubject(pageB)).toBeNull(); // genuinely empty before the merge

  await pageB
    .getByLabel("Merge from another device")
    .setInputFiles(path!);

  await expect.poll(async () => (await readSubject(pageB))?.name, { timeout: 20_000 }).toBe("E2E Physics");

  // 3. Nothing is replaced: B now edits its copy *after* the export, and a
  //    re-merge of the same (now older) file must not undo that edit.
  await seedSubject(pageB, "B renamed it", SUBJECT_ID, 60_000);
  await pageB.getByLabel("Merge from another device").setInputFiles(path!);
  await pageB.waitForTimeout(1000); // let the merge apply
  expect((await readSubject(pageB))?.name).toBe("B renamed it");

  // 4. The other direction carries B's newer rename back to A, so a two-way
  //    exchange converges instead of one device winning forever.
  const [downloadBack] = await Promise.all([
    pageB.waitForEvent("download"),
    pageB.getByRole("button", { name: "Export for another device" }).click(),
  ]);
  const pathBack = await downloadBack.path();
  await page.getByLabel("Merge from another device").setInputFiles(pathBack!);
  await expect.poll(async () => (await readSubject(page))?.name, { timeout: 20_000 }).toBe("B renamed it");

  // 5. Feeding a device its own file is refused with a warning rather than
  //    self-merged — the sign of a mixed-up pair of devices.
  await page.getByLabel("Merge from another device").setInputFiles(path!);
  await expect(page.getByRole("status")).toContainText("That file came from this device", {
    timeout: 10_000,
  });

  await contextB.close();
});

test("a backup file is refused by the devices panel, with a pointer to the right action", async ({ page }) => {
  await waitForDevicesPanel(page);

  // The panel only accepts a device bundle. A backup is a different shape, and
  // saying so is better than a merge that quietly does nothing.
  await page.getByLabel("Merge from another device").setInputFiles({
    name: "openstudy-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), subjects: [] })),
  });

  await expect(page.getByRole("status")).toContainText("not a device file", { timeout: 10_000 });
});
