import { test, expect } from "@playwright/test";

test.describe("Ruvren V2.0 Features E2E", () => {
  test("Dashboard date header renders properly formatted string", async ({ page }) => {
    await page.goto("/");
    // Wait for client hydration date to set
    const dateText = page.locator("p", { hasText: /2026|2025|2024|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i });
    await expect(dateText.first()).toBeVisible();
    const text = await dateText.first().textContent();
    expect(text).not.toContain("\u202f"); // Ensure U+202F narrow space is replaced by standard space
    expect(text).toMatch(/^[A-Za-z]+,\s[A-Za-z]+\s\d+,\s\d{4}$/); // "Saturday, Sep 19, 2026"
  });

  test("Starter Deck CTA button loads sample data when library is empty", async ({ page }) => {
    await page.goto("/");
    // Look for Starter Deck CTA card on empty library
    const starterButton = page.getByRole("button", { name: "Load Starter Deck" });
    if (await starterButton.isVisible()) {
      await starterButton.click();
      // Verify sample content loaded
      await expect(page.getByText("Modern Web Architecture")).toBeVisible({ timeout: 10000 });
    }
  });

  test("Daily progress widget contains share button", async ({ page }) => {
    await page.goto("/");
    const shareBtn = page.getByRole("button", { name: "Share today's progress" });
    await expect(shareBtn).toBeVisible();
  });
});
