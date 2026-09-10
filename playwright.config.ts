import { defineConfig } from "@playwright/test";

// E2E suite: runs against a production build served locally (npm run build + start).
// Launches with a persistent-less context; IndexedDB starts empty per test via
// the storageState-free context (each test gets a fresh profile).
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // IndexedDB + localStorage are per-profile; serialize to avoid flake
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3457",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- -p 3457",
        url: "http://localhost:3457",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
