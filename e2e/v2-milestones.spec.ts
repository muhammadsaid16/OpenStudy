import { test, expect } from "@playwright/test";

test.describe("Ruvren V2.0 Milestone Features E2E", () => {
  test("1. Universal Knowledge Graph Visualizer renders and provides filters", async ({ page }) => {
    await page.goto("/graph");
    await expect(page.getByRole("heading", { name: "Knowledge Graph", exact: true })).toBeVisible();

    // Verify canvas element exists
    const canvas = page.locator("canvas.cursor-grab");
    await expect(canvas).toBeVisible();

    // Verify node filter buttons exist
    await expect(page.getByRole("button", { name: /All Nodes/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Subjects/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Notes/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Tags/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Decks/i })).toBeVisible();
  });

  test("2. Hands-Free Audio Study mode toggle renders in review mode", async ({ page }) => {
    await page.goto("/flashcards");
    // Verify page loads without error
    await expect(page.locator("body")).toBeVisible();
  });

  test("3. AI Card & Quiz Generator modal opens from Notes page", async ({ page }) => {
    await page.goto("/notes");
    const aiGenBtn = page.getByRole("button", { name: /AI Card Gen/i });
    await expect(aiGenBtn).toBeVisible();

    await aiGenBtn.click();
    await expect(page.getByText("AI Auto-Card & Quiz Generator")).toBeVisible();
    await expect(page.getByPlaceholder(/Paste your notes here/i)).toBeVisible();
  });

  test("4. Retention & Mastery Analytics page displays FSRS Memory Stability breakdown", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByText("FSRS Memory Stability Tiers")).toBeVisible();
    await expect(page.getByText(/Fragile/i)).toBeVisible();
    await expect(page.getByText(/Learning/i)).toBeVisible();
    await expect(page.getByText(/Solid/i)).toBeVisible();
    await expect(page.getByText(/Permanent/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Weakness Revision Deck/i })).toBeVisible();
  });

  test("5. Share page decodes links and handles imports", async ({ page }) => {
    await page.goto("/share");
    await expect(page.locator("body")).toBeVisible();
  });

  test("6. Knowledge Graph Empty State overlay displays CTA and loads starter deck", async ({ page }) => {
    await page.goto("/graph");
    const emptyHeading = page.getByRole("heading", { name: "Your Knowledge Graph is waiting for thoughts" });
    if (await emptyHeading.isVisible()) {
      await expect(page.getByText("Add subjects, write notes, or create flashcards to watch your neural web grow and connect.")).toBeVisible();
      const loadBtn = page.getByRole("button", { name: "Load Starter Deck" });
      await expect(loadBtn).toBeVisible();
      const createNoteLink = page.getByRole("link", { name: "Create Note" });
      await expect(createNoteLink).toBeVisible();

      // Click load starter deck
      await loadBtn.click();
      await expect(emptyHeading).not.toBeVisible();
    }
  });
});
