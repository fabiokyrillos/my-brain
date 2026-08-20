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
  /**
   * The same fact about latency, applied one level down.
   *
   * Raising only the *test* timeout was half a fix: a `toBeVisible` still gave
   * up after Playwright's 5-second default, so a Server Action round trip to
   * the hosted database — `apply_task_command` hashes a twelve-column
   * pre-state, writes, audits and reserves an undo — expired the assertion
   * while the form was still showing "Aplicando…". The journey then reported a
   * *missing outcome region* for an outcome that was on its way, which is the
   * wrong finding about a working product.
   *
   * Scoped to this lane for the same reason the test timeout is: the CI
   * journeys run against a local stack and must keep failing fast.
   */
  expect: { timeout: isOnlineLane ? 20_000 : 5_000 },
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
    /**
     * `2P-MOBILE-001` — the iPhone-sized lane, and what it is honestly worth.
     *
     * Until slice 2P.8 there were two projects and neither was an iPhone. The
     * requirement asks for *"an iPhone-sized production browser"*, which is a
     * **viewport, a device-pixel-ratio, a touch profile and a user agent** —
     * and this delivers exactly those, against the production build.
     *
     * It also delivers more than the requirement asks, and the extra is worth
     * naming precisely. `devices["iPhone 15"]` carries
     * `defaultBrowserType: "webkit"`, so this lane runs **Playwright's WebKit**
     * rather than Chromium wearing an iPhone user agent — the same engine
     * family Safari renders with, which is the one thing the `Pixel 7` project
     * structurally cannot cover, since it is Chromium too. That makes the lane
     * *"prova de layout e navegador"* in a real sense.
     *
     * **What it still cannot prove**, and `2P-MOBILE-005` keeps reserved for the
     * owner: an actual device, iOS Safari itself (Playwright's WebKit is a
     * patched build, not Safari), the software keyboard, the installed PWA
     * shell, and VoiceOver. Engine coverage is not hardware coverage.
     *
     * Naming matters here more than usual. `iphone` reads as *an iPhone* in a
     * report skimmed six months from now, and this repository has already paid
     * for a lane that was believed to be more than it was — so the project is
     * called `iphone-emulated`, and every record that cites it inherits the
     * word.
     *
     * `iPhone 15` rather than an older profile because it is the narrowest
     * common viewport still in wide use (393 × 659 CSS px with the browser
     * chrome) and it carries the safe-area insets the composer and the bottom
     * navigation are built around.
     *
     * **CI does not select this project**, and that is deliberate rather than an
     * oversight: `.github/workflows/ci.yml` installs `chromium` only, and adding
     * a WebKit install plus a third journey lane to the gate is a change to the
     * CI contract that this slice was not authorized to make. The lane is run
     * locally and its results are recorded per slice, which is the same standing
     * every `online-*.spec.ts` lane already has.
     */
    { name: "iphone-emulated", use: { ...devices["iPhone 15"] } },
  ],
});
