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

test("a locale-less recovery URL resolves to a locale before it resolves to auth", async ({ request }) => {
  // The nested route must not bypass the locale contract `src/proxy.ts` owns —
  // a route reachable only with an explicit locale prefix would be a route no
  // language switch could preserve.
  const response = await request.get("/app/work/cancelled", { maxRedirects: 0 });
  expect([307, 308]).toContain(response.status());
  const location = response.headers().location;
  expect(location).toBeDefined();
  expect(location).toMatch(/\/(pt-BR|en)\//);
});

test("no command surface is reachable without a session", async ({ page }) => {
  await page.goto("/en/app/work/cancelled");
  await expect(page).toHaveURL(/\/en\/auth\/login/);
  // The console's own input, by its accessible name. If it ever rendered here
  // it would mean a command surface mounted outside the auth boundary.
  await expect(page.getByLabel("What changed?")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Command result" })).toHaveCount(0);
});
