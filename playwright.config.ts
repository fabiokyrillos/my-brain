import { defineConfig, devices } from "@playwright/test";

// In CI the app under test is the production build the same job just produced,
// so the journey gate proves the artifact that would ship rather than the dev
// compiler. Locally nothing changes: `npm run dev`, reusing a server already up.
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: process.env.PLAYWRIGHT_JSON_REPORT
    ? [["json", { outputFile: "playwright-results.json" }]]
    : undefined,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: {
    command: isCI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
