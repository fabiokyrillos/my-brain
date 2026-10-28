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
    expect(redirected.pathname).toBe(target);
    /*
     * `2O-ENTRY-007` strengthened this rather than relaxing it.
     *
     * The assertion used to require the redirect to be *exactly* the login path,
     * which was an accurate statement of what the product did: it discarded the
     * surface that had been asked for, so anyone following a link to the
     * cancelled-task recovery route landed on the app's home instead. The
     * requested path now travels with the redirect, and what is checked is that
     * it is **the path that was asked for, query and all** — which the old form
     * could not express, and which is exactly what this route needs, since
     * `?page=2` is part of where the visitor was going.
     */
    expect(redirected.searchParams.get("next"), `${source} lost the requested surface`).toBe(source);
  }
});

test("a locale-less recovery URL is not a way around the auth boundary", async ({ request }) => {
  /*
   * `src/proxy.ts` used to read the locale from `parts[1]` and the section
   * from `parts[2]`, so a locale-less `/app/...` path was not an app path to
   * it at all — `inApp` was false, no redirect was issued, and Next.js
   * answered 404 because no route exists there.
   *
   * **That contract changed deliberately, and this test caught the change,
   * which is exactly what its previous form was written to do.** Every push
   * notification delivered before `57ea2d0` points at an unprefixed path, so
   * answering 404 there meant the product refused a destination it had itself
   * chosen, and a tapped notification was a dead end. The proxy now localizes
   * such a path.
   *
   * What this test defends did NOT change, and is now asserted far more
   * directly than a bare 404 ever did. A 404 proved the surface was out of
   * reach only by accident of there being no route; it would have said nothing
   * had a route appeared. So the invariant stays ("the same as every other app
   * path") and the redirect is now **followed**, to prove it arrives at the
   * login form rather than at the command surface.
   *
   * `Accept-Language` is stated because the locale is negotiated from it; an
   * unstated header would make the expected destination depend on whatever the
   * test agent advertises.
   */
  const headers = { "accept-language": "pt-BR,pt;q=0.9" };
  const [existing, added] = await Promise.all([
    request.get("/app/work", { maxRedirects: 0, headers }),
    request.get("/app/work/cancelled", { maxRedirects: 0, headers }),
  ]);
  expect(added.status()).toBe(existing.status());
  expect(added.status()).toBe(307);

  const localized = new URL(added.headers().location!, "http://localhost:3000");
  expect(localized.pathname).toBe("/pt-BR/app/work/cancelled");

  // The hole this test exists to refuse. The localized destination must still
  // demand a session, and must carry the requested surface into the login so
  // the redirect is a detour rather than a loss.
  const followed = await request.get(localized.pathname, { maxRedirects: 0, headers });
  expect(followed.status()).toBe(307);
  const login = new URL(followed.headers().location!, "http://localhost:3000");
  expect(login.pathname).toBe("/pt-BR/auth/login");
  expect(login.searchParams.get("next")).toBe("/pt-BR/app/work/cancelled");
});

test("no command surface is reachable without a session", async ({ page }) => {
  await page.goto("/en/app/work/cancelled");
  await expect(page).toHaveURL(/\/en\/auth\/login/);
  // The console's own input, by its accessible name. If it ever rendered here
  // it would mean a command surface mounted outside the auth boundary.
  await expect(page.getByLabel("What changed?")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Command result" })).toHaveCount(0);
});
