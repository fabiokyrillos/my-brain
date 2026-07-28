import { expect, test } from "@playwright/test";

/**
 * Slice 2E.7's credential-free journeys.
 *
 * CI runs exactly the specs named in `.github/workflows/ci.yml`, and only a
 * spec that needs no OpenAI key and no seeded user can run there — the rest
 * skip themselves against the linked project and stay manual. So this file
 * proves what a credential-free browser genuinely can:
 *
 *   * the new recovery route is behind the auth boundary in both locales, on
 *     desktop and on mobile;
 *   * it participates in the same locale redirect contract every other route
 *     does;
 *   * an unauthenticated visitor never sees a command surface.
 *
 * The authenticated journeys — typing a command, resolving a disambiguation,
 * confirming a cancellation, restoring from this page — need a seeded user and
 * a deployed database. Remote migration parity is still `202607250054`, so
 * those cannot run anywhere yet and are recorded as pending in the slice
 * report rather than written as tests that would silently skip.
 */

test("the cancelled-task recovery route is protected in both locales", async ({ request }) => {
  for (const [source, target] of [
    ["/pt-BR/app/work/cancelled", "/pt-BR/auth/login"],
    ["/en/app/work/cancelled", "/en/auth/login"],
    ["/pt-BR/app/work/cancelled?page=2", "/pt-BR/auth/login"],
  ] as const) {
    const response = await request.get(source, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location;
    expect(location).toBeDefined();
    const redirected = new URL(location!, "http://localhost:3000");
    expect(`${redirected.pathname}${redirected.search}`).toBe(target);
  }
});

test("a locale-less recovery URL is not a way around the auth boundary", async ({ request }) => {
  /*
   * `src/proxy.ts` reads the locale from `parts[1]` and the section from
   * `parts[2]`, so a locale-less `/app/...` path is not an app path to it at
   * all — `inApp` is false, no redirect is issued, and Next.js answers 404
   * because no route exists there. That is the pre-existing contract, and the
   * only thing this slice must prove is that its nested route joins it rather
   * than opening a hole beside it.
   *
   * Asserted against an existing route rather than against a literal status,
   * so the test states the invariant ("the same as every other app path") and
   * cannot pass by accident if that contract is ever deliberately changed.
   */
  const [existing, added] = await Promise.all([
    request.get("/app/work", { maxRedirects: 0 }),
    request.get("/app/work/cancelled", { maxRedirects: 0 }),
  ]);
  expect(added.status()).toBe(existing.status());
  expect(added.status()).toBe(404);
});

test("no command surface is reachable without a session", async ({ page }) => {
  await page.goto("/en/app/work/cancelled");
  await expect(page).toHaveURL(/\/en\/auth\/login/);
  // The console's own input, by its accessible name. If it ever rendered here
  // it would mean a command surface mounted outside the auth boundary.
  await expect(page.getByLabel("What changed?")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Command result" })).toHaveCount(0);
});
