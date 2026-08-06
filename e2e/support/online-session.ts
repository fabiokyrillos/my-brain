import { expect, type Page } from "@playwright/test";

/**
 * A signed-in browser context without going through the login form.
 *
 * **Why this exists, measured rather than assumed.** SH.5 enabled hosted
 * CAPTCHA on 2026-08-05. Every `e2e/online-*.spec.ts` signs in by filling the
 * login form, and from that day every one of them lands on
 * `?error=captcha-failed` — Turnstile declines automated browsers by design,
 * which is the control working exactly as intended. Slice 2G.4 reproduced it
 * against the deployment with `online-assistant-name.spec.ts` before writing
 * a line of this file.
 *
 * **This weakens nothing.** The CAPTCHA still guards the login form, which is
 * the surface an attacker reaches. A test that does not use that surface does
 * not remove its protection, and this helper needs the **service-role key** to
 * work at all — a capability no attacker has and every online spec already
 * holds in order to create its disposable account.
 *
 * **Two routes were tried and rejected, both for measured reasons**, recorded
 * so the next person does not spend the same afternoon:
 *
 *   1. *`admin/generate_link` → the app's `/auth/callback`.* GoTrue **silently
 *      rewrote** the `redirect_to` to `site_url` — the allow-list behaviour
 *      SH.5 documented, where a disallowed target returns 200 and quietly
 *      becomes something else — so the browser landed on the deployed
 *      `/auth/login` instead of the app under test.
 *   2. *The same link's own redirect.* Magiclink verification returns its
 *      tokens in the URL **fragment** (implicit flow), while
 *      `/{locale}/auth/callback` reads `?code=` and calls
 *      `exchangeCodeForSession` (PKCE). The two do not meet, and no allow-list
 *      entry would have made them.
 *
 * So the session is exchanged over HTTP and installed as the cookie
 * `@supabase/ssr` reads. The cookie shape is the one dependency this helper
 * has on a library internal, and `online-session-fixture.spec.ts` is what
 * catches it if that shape ever changes — the failure mode this guards against
 * is every journey reporting a product bug that is really a fixture bug.
 */

function projectRef(supabaseUrl: string): string {
  const host = new URL(supabaseUrl).hostname;
  const ref = host.split(".")[0];
  expect(ref, `could not derive a project ref from ${supabaseUrl}`).toBeTruthy();
  return ref;
}

/** `@supabase/ssr`'s encoding: a `base64-` marker plus base64url of the JSON. */
function encodeSessionCookie(session: unknown): string {
  return `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
}

export async function signInWithoutTheLoginForm(
  page: Page,
  input: {
    readonly supabaseUrl: string;
    readonly serviceRoleKey: string;
    readonly publishableKey: string;
    readonly email: string;
    readonly locale: "pt-BR" | "en";
    /** The app origin under test, e.g. Playwright's `baseURL`. */
    readonly appOrigin: string;
    /** Where to land once the session exists. Defaults to the app home. */
    readonly next?: string;
  },
): Promise<void> {
  const { supabaseUrl, serviceRoleKey, publishableKey, email, locale, appOrigin } = input;
  const next = input.next ?? `/${locale}/app`;
  const admin = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };

  // SH.5's own observation mechanism: compose the link GoTrue *would* send,
  // without sending it. No SMTP, and no CAPTCHA — the challenge guards the
  // surfaces that start a session from untrusted input, and this one is minted
  // by the service role.
  const generated = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const generatedBody = await generated.text();
  // Read once: `expect`'s message is evaluated eagerly, so consuming the body
  // inside it leaves nothing to parse — which is how this helper first failed
  // with "Body is unusable" instead of reporting the refusal it meant to.
  expect(
    generated.ok,
    `admin/generate_link refused: ${generated.status} ${generatedBody.slice(0, 200)}`,
  ).toBe(true);
  const { email_otp: emailOtp } = JSON.parse(generatedBody) as { email_otp: string };
  expect(emailOtp, "generate_link returned no email_otp").toBeTruthy();

  // `email_otp`, never `hashed_token`: verify refuses the hash with "Only an
  // email address or phone number should be provided on verify".
  const verified = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: emailOtp }),
  });
  const verifiedBody = await verified.text();
  expect(verified.ok, `verify refused: ${verified.status} ${verifiedBody.slice(0, 200)}`).toBe(true);
  const session = JSON.parse(verifiedBody) as { access_token: string; refresh_token: string };
  expect(session.access_token, "verify returned no access_token").toBeTruthy();

  // The app is server-rendered and reads its session from cookies, so the
  // cookie is where the session has to be. The origin matters: it must be the
  // app under test, not the Supabase project.
  const { hostname } = new URL(appOrigin);
  await page.context().addCookies([
    {
      name: `sb-${projectRef(supabaseUrl)}-auth-token`,
      value: encodeSessionCookie(session),
      domain: hostname,
      path: "/",
      httpOnly: false,
      secure: appOrigin.startsWith("https://"),
      sameSite: "Lax",
    },
  ]);

  await page.goto(next);
  await expect(
    page,
    "the session cookie did not authenticate — see this file's header on the cookie shape",
  ).toHaveURL(new RegExp(`${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 30_000 });
}
