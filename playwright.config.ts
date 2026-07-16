import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: process.env.PLAYWRIGHT_JSON_REPORT
    ? [["json", { outputFile: "playwright-results.json" }]]
    : undefined,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
