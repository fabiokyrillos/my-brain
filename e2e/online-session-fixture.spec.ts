import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";

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
 * **A positive result alone would prove nothing**, so the cases below are a
 * discrimination set rather than a single assertion. Five cookie states are
 * fed to the same deployed app, and the helper is only believable because the
 * four that *should* fail do:
 *
 * | case | expected |
 * | --- | --- |
 * | no session | login |
 * | correctly named cookie, malformed payload | login |
 * | valid session under the wrong project ref | login |
 * | correctly encoded session, expired | login |
 * | the helper's own session | the product |
 *
 * And authentication succeeding is not the same as authenticating *this*
 * account, so the last case also proves identity: the acceptance the helper
 * recorded through the product's own consent surface is attributed, in the
 * database, to the disposable account and to no one else.
 */

const supabaseUrl = process.env.ONLINE_SUPABASE_URL;
const publishableKey = process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY;
const onlineConfigured = Boolean(supabaseUrl && publishableKey && serviceRoleKey);

const admin = () =>
  createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** The `@supabase/ssr` cookie name for the project the app is configured against. */
const cookieName = () => `sb-${new URL(supabaseUrl!).hostname.split(".")[0]}-auth-token`;

const encode = (session: unknown) =>
  `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;

async function install(context: BrowserContext, baseURL: string, name: string, value: string) {
  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name,
      value,
      domain: hostname,
      path: "/",
      httpOnly: false,
      secure: baseURL.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);
}

/** A real session for `email`, obtained the same way the helper obtains one. */
async function mintSession(email: string) {
  const generated = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const generatedBody = await generated.text();
  expect(generated.ok, `generate_link: ${generated.status} ${generatedBody.slice(0, 200)}`).toBe(true);
  const { email_otp: emailOtp } = JSON.parse(generatedBody) as { email_otp: string };

  const verified = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey!, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: emailOtp }),
  });
  const verifiedBody = await verified.text();
  expect(verified.ok, `verify: ${verified.status} ${verifiedBody.slice(0, 200)}`).toBe(true);
  return JSON.parse(verifiedBody) as Record<string, unknown> & { expires_at: number };
}

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

  test("a malformed cookie under the right name does not authenticate", async ({ page, baseURL }) => {
    // The `base64-` marker is present and the payload is not JSON. `@supabase/ssr`
    // treats an undecodable chunk as absent rather than propagating it, and the
    // product must then behave exactly as it does for no session at all.
    await install(page.context(), baseURL!, cookieName(), "base64-this-is-not-json");
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/auth\/login/, { timeout: 30_000 });
  });

  test("a valid session under the wrong project ref does not authenticate", async ({ page, baseURL }) => {
    // Same bytes, same encoding, one wrong character in the name. This is the
    // control that separates "the payload is right" from "the name is right":
    // without it, a helper that got the name wrong and a product that ignored
    // cookies would be indistinguishable.
    const session = await mintSession(email);
    await install(page.context(), baseURL!, "sb-notthisproject-auth-token", encode(session));
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/auth\/login/, { timeout: 30_000 });
  });

  test("a correctly encoded but expired session does not authenticate", async ({ page, baseURL }) => {
    // Correct name, correct encoding, real tokens — and past its expiry, with a
    // refresh token that cannot renew it. The product must refuse. This is the
    // case that proves the app is reading the session rather than the mere
    // presence of a cookie.
    const session = await mintSession(email);
    const expired = {
      ...session,
      expires_at: Math.floor(Date.now() / 1000) - 10_000,
      refresh_token: "not-a-valid-refresh-token",
    };
    await install(page.context(), baseURL!, cookieName(), encode(expired));
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/auth\/login/, { timeout: 30_000 });
  });

  test("establishes a session without touching the login form", async ({ page, baseURL }) => {
    const session = await signInWithoutTheLoginForm(page, {
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
      locale: "pt-BR",
      appOrigin: baseURL!,
    });
    expect(session.userId).toBe(userId);

    // SH.4's gate was the second blocker, and it is cleared by walking through
    // it rather than around it.
    expect(session.acceptedPolicies, "the consent interposition was expected on a fresh account").toBe(true);

    // Landed on the authenticated route the controls above proved is gated, and
    // stayed there across a fresh navigation — so the session is in the cookies
    // the product itself reads, not a redirect artefact.
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/app$/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/auth\/login/);

    // The proxy does not rotate or clear a cookie it did not mint: the session
    // survives navigation byte-identical, which is why one install is enough
    // for a whole journey.
    const cookies = (await page.context().cookies(baseURL!)).filter((c) => c.name === cookieName());
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.value.startsWith("base64-")).toBe(true);
  });

  test("the product resolved this account, not merely some account", async () => {
    // `acceptPolicies` runs behind `getUser()`, so the row it wrote is a
    // server-side statement about who the session belongs to. Read back with
    // the service role, on the Node side, filtered to the disposable account.
    const { data, error } = await admin()
      .from("policy_acceptances")
      .select("document,version,user_id")
      .eq("user_id", userId!);
    expect(error).toBeNull();
    expect(data ?? [], "the acceptance recorded through the product names this account").not.toHaveLength(0);
    expect((data ?? []).every((row) => row.user_id === userId)).toBe(true);
  });

  test("no service-role capability reaches the browser", async ({ page, baseURL }) => {
    // The boundary this fixture is allowed to stand on: the service role signs
    // two HTTP calls from Node and stops there. If it ever leaked into a cookie,
    // into storage state or into anything page JavaScript can read, the helper
    // would have become a generic authentication shortcut — the thing it must
    // never be. `src/lib/closeout/online-session-boundary.test.ts` guards the
    // source; this guards the running artefact.
    await signInWithoutTheLoginForm(page, {
      supabaseUrl: supabaseUrl!,
      serviceRoleKey: serviceRoleKey!,
      publishableKey: publishableKey!,
      email,
      locale: "pt-BR",
      appOrigin: baseURL!,
    });

    const state = JSON.stringify(await page.context().storageState());
    expect(state.includes(serviceRoleKey!), "the service-role key is in storage state").toBe(false);

    const visible = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));
    const seenByPageScript = `${visible.cookie}${visible.local}${visible.session}`;
    expect(seenByPageScript.includes(serviceRoleKey!), "page JavaScript can read the service-role key").toBe(false);

    // And the token the browser does hold is a user token: its `role` claim is
    // `authenticated`, never `service_role`.
    const cookie = (await page.context().cookies(baseURL!)).find((c) => c.name === cookieName());
    expect(cookie, "the session cookie is missing").toBeTruthy();
    const decoded = JSON.parse(
      Buffer.from(cookie!.value.slice("base64-".length), "base64url").toString("utf8"),
    ) as { access_token: string };
    const claims = JSON.parse(
      Buffer.from(decoded.access_token.split(".")[1]!, "base64url").toString("utf8"),
    ) as { role?: string; sub?: string };
    expect(claims.role).toBe("authenticated");
    expect(claims.sub).toBe(userId);
  });
});
