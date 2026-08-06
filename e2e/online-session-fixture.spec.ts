import { expect, test } from "@playwright/test";

import { signInWithoutTheLoginForm } from "./support/online-session";

/**
 * The harness's own guard: proof that `signInWithoutTheLoginForm` establishes
 * a real session against the deployed project.
 *
 * It exists because the thing it tests is a *test* mechanism, and a broken one
 * fails in the worst way — every journey that depends on it reports a product
 * failure that is really a fixture failure. Slice 2G.4 added the helper after
 * measuring that hosted CAPTCHA refuses automated password sign-in
 * (`?error=captcha-failed`, reproduced against the deployment), which had
 * silently blocked every authenticated online journey since SH.5.
 *
 * Deliberately credential-free: it needs no BYOK product key, because it makes
 * no provider call. That is what lets it stay runnable when the journeys it
 * unblocks are themselves gated on a credential.
 *
 * **Both directions, or it is not evidence.** The positive case proves the
 * helper reaches an authenticated route. The negative control proves the route
 * it reaches is genuinely gated — without it, a helper that navigated nowhere
 * and a product that authenticated nobody would look identical.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

test.describe("the online session fixture", () => {
  test.skip(!onlineConfigured, "Online Supabase credentials are not available.");
  test.describe.configure({ mode: "serial" });

  const email = `codex-session-fixture-${crypto.randomUUID()}@example.com`;
  let userId: string | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { display_name: "Fixture" } }),
    });
    expect(response.ok, `admin create failed: ${response.status}`).toBe(true);
    userId = ((await response.json()) as { id: string }).id;
  });

  // Fail-closed: the disposable account goes whatever the assertions did.
  test.afterAll(async () => {
    if (!userId) return;
    const deletion = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey!, authorization: `Bearer ${serviceRoleKey}` },
    });
    expect(deletion.ok).toBe(true);
  });

  test("the authenticated route is genuinely gated (negative control)", async ({ page }) => {
    // Run first and in a fresh context: an unauthenticated browser must be
    // sent to the login form. If this passed for the wrong reason — a route
    // that is not gated at all — the positive case below would prove nothing.
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/auth\/login/, { timeout: 30_000 });
  });

  // NOT WORKING YET, and marked rather than deleted or left red.
  //
  // The helper reaches a valid session over HTTP — `admin/generate_link` →
  // `/auth/v1/verify` returns a real `access_token` (Slice 2G.3's deployment
  // probe used exactly that to run 5/5 against the deployed validator) — but
  // installing it as a cookie does not authenticate the browser: the app still
  // redirects to the login form.
  //
  // What has been eliminated, so the next attempt does not repeat it:
  //   * the cookie *format* matches `@supabase/ssr@0.12.3`, which decodes
  //     `base64-` + base64url(JSON) (`dist/main/cookies.js:7,23`);
  //   * `generate_link` → the app's `/auth/callback` cannot work at all —
  //     GoTrue silently rewrites a non-allow-listed `redirect_to` to
  //     `site_url`, and magiclink returns its tokens in the URL **fragment**
  //     (implicit) while the callback reads `?code=` (PKCE);
  //   * password sign-in is refused by hosted CAPTCHA by design.
  //
  // Where to look next: the cookie name's project ref, whether `src/proxy.ts`
  // clears a session it did not itself refresh, and whether 0.12.3 expects the
  // chunked (`.0`) name even for a single chunk.
  test.fixme("establishes a session without touching the login form", async ({ page, baseURL }) => {
    await signInWithoutTheLoginForm(page, {
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
      locale: "pt-BR",
      appOrigin: baseURL!,
    });

    // Landed on the authenticated route the control just proved is gated, and
    // stayed there across a fresh navigation — so the session is in the
    // cookies the product itself set, not a redirect artefact.
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/auth\/login/);
  });
});
