import { defineConfig, devices } from "@playwright/test";

// In CI the app under test is the production build the same job just produced,
// so the journey gate proves the artifact that would ship rather than the dev
// compiler. Locally nothing changes: `npm run dev`, reusing a server already up.
const isCI = Boolean(process.env.CI);

/**
 * The deployment-session lane, and why it gets a different clock.
 *
 * `scripts/online-playwright.mjs` is the only thing that sets
 * `ONLINE_SUPABASE_URL`, so its presence is an exact statement that the run
 * talks to the hosted project. Those journeys pay for it: a round trip to
 * GoTrue to mint the session, SH.4's consent interposition to walk through, and
 * every subsequent page render reading a database on the other side of the
 * internet. The 30-second default was fitting none of that once the login form
 * stopped being usable — which is a fact about latency, not about the product,
 * and a timeout that expires before the assertion runs reports the wrong thing.
 *
 * Deliberately scoped rather than raised globally: the CI journeys run against
 * a local stack and must keep failing fast if they get slow.
 */
const isOnlineLane = Boolean(process.env.ONLINE_SUPABASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: process.env.PLAYWRIGHT_JSON_REPORT
    ? [["json", { outputFile: "playwright-results.json" }]]
    : undefined,
  timeout: isOnlineLane ? 90_000 : 30_000,
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
