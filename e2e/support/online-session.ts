import { expect, test, type Page } from "@playwright/test";

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
 * holds in order to create its disposable account. The key stays on the Node
 * side: it signs two HTTP calls and is never written into a cookie, into
 * storage state, or into anything page JavaScript can read.
 * `src/lib/closeout/online-session-boundary.test.ts` is what keeps that true.
 *
 * ## The four things that were tried, and what each settled
 *
 * 1. *Fill the login form.* `?error=captcha-failed`. Automated password
 *    sign-in is not available at all, by design.
 * 2. *`admin/generate_link` → the app's `/{locale}/auth/callback`.* GoTrue
 *    **silently rewrote** the `redirect_to` to `site_url` — the allow-list
 *    behaviour SH.5 documented, where a disallowed target returns 200 and
 *    quietly becomes something else — so the browser landed on the deployed
 *    `/auth/login` instead of the app under test.
 * 3. *The same link's own redirect.* Magiclink verification returns its tokens
 *    in the URL **fragment** (implicit flow), while `/{locale}/auth/callback`
 *    reads `?code=` and calls `exchangeCodeForSession` (PKCE). The two do not
 *    meet, and no allow-list entry would have made them.
 * 4. *Exchange the session over HTTP and install it as the `@supabase/ssr`
 *    cookie.* This is the one that works. Slice 2G.4's first pass reported it
 *    as failing and guessed at the cookie shape; the guess was wrong in an
 *    instructive way, recorded below.
 *
 * ## The cookie contract, established by execution rather than by reading
 *
 * A Node probe fed candidate cookies to the exact reader `src/proxy.ts` uses —
 * `createServerClient(...).auth.getClaims()` — and compared verdicts:
 *
 * | cookie | `claims.sub` |
 * | --- | --- |
 * | absent | `null` |
 * | `base64-` + non-JSON | `null` |
 * | valid value, wrong project ref in the name | `null` |
 * | `sb-<ref>-auth-token` | **resolves** |
 * | `sb-<ref>-auth-token.0` | **resolves** |
 * | correctly encoded but expired | `null` (`Refresh token is not valid`) |
 *
 * So the shape this helper writes was **already correct**: name
 * `sb-<ref>-auth-token` (the ref of the project the *app* is configured
 * against, which must match the one the fixture administers), value `base64-`
 * plus base64url of the session JSON exactly as `/auth/v1/verify` returns it —
 * `access_token`, `refresh_token`, `expires_at` are the three fields auth-js
 * requires (`GoTrueClient._isValidSession`). `combineChunks` tries the bare
 * name before `.0`, so a single-chunk session needs no suffix; at ~2.8 KB the
 * session is comfortably under the 3180-byte chunk threshold, so only one
 * cookie is ever installed. The proxy does not clear a cookie it did not mint:
 * after navigation the cookie is still present, byte-identical.
 *
 * **What was actually blocking it was not the cookie at all.** With the session
 * installed, the browser reached the app authenticated and was then redirected
 * to `/{locale}/consent` — never to `/auth/login`. That is SH.4's consent gate
 * (`requireUser` → `hasAcceptedCurrentPolicies`) doing its job: an account
 * created through `admin/users` has no `policy_acceptances` row, because the
 * **registration form** is what records one. Reaching that redirect is itself
 * proof of authentication, since `/consent` is only rendered for a user whose
 * lifecycle read succeeded.
 *
 * This is a second, independent blocker on the online suite, and it predates
 * the CAPTCHA one: every `online-*.spec.ts` that admin-creates an account and
 * expects `/{locale}/app` straight after sign-in has been unable to pass since
 * SH.4 shipped, regardless of Turnstile. So the helper clears it the only
 * honest way — by **accepting through the product's own consent surface**,
 * which records a real acceptance row at the current version. Nothing is
 * forged and no gate is bypassed; `acceptPolicies: false` is available for the
 * one spec whose subject *is* the gate.
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

/** The accept button on the consent interposition, in both locales. */
const ACCEPT_LABEL = {
  "pt-BR": "Aceitar e continuar",
  en: "Accept and continue",
} as const;

export type OnlineLocale = "pt-BR" | "en";

export interface OnlineSessionInput {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly publishableKey: string;
  readonly email: string;
  readonly locale: OnlineLocale;
  /** The app origin under test, e.g. Playwright's `baseURL`. */
  readonly appOrigin: string;
  /** Where to land once the session exists. Defaults to the app home. */
  readonly next?: string;
  /**
   * Clear SH.4's consent interposition through the product's own surface.
   * Default `true`. Set `false` when the interposition is what the spec is
   * about — `online-consent-interposition.spec.ts` — so it observes the gate
   * rather than a helper that already walked through it.
   */
  readonly acceptPolicies?: boolean;
  /**
   * Assert that the browser settled on `next`. Default `true`. Set `false` for
   * the journeys whose subject is an interposition — a suspended account
   * belongs on `/account-state`, and landing on the product would be the bug.
   */
  readonly assertDestination?: boolean;
}

export interface OnlineSession {
  /** The account the app will resolve through `getUser()`. */
  readonly userId: string;
  /** Whether the consent interposition was encountered and accepted. */
  readonly acceptedPolicies: boolean;
  /** Where the browser actually settled, for callers that assert it themselves. */
  readonly landedOn: string;
}

/**
 * An access token for `email`, minted the way the hosted project still allows.
 *
 * `signInWithPassword` is **not** an option any more, and that is measured
 * rather than assumed: `/auth/v1/token?grant_type=password` answers
 * `400 captcha_failed — "captcha protection: request disallowed (no
 * captcha_token found)"` for every client, browser or not. Specs that need to
 * act *as* the user against PostgREST — to prove RLS refuses something, say —
 * used to get their token that way and have been unable to since SH.5.
 *
 * Node-side only. The token it returns is a user token; the service role is
 * spent obtaining it and never travels with it.
 */
export async function mintOnlineAccessToken(input: {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly publishableKey: string;
  readonly email: string;
}): Promise<{ accessToken: string; userId: string }> {
  const session = await exchangeSession(input);
  return { accessToken: session.access_token, userId: session.user.id };
}

export type OnlineSessionAttempt =
  | { readonly ok: true; readonly accessToken: string; readonly userId: string }
  | { readonly ok: false; readonly stage: "generate_link" | "verify"; readonly status: number; readonly body: string };

/**
 * The same exchange, but reporting a refusal instead of failing on one.
 *
 * This is what lets a journey assert that a session **cannot** be obtained —
 * `online-account-suspension.spec.ts` proving a provider-side ban holds — and
 * assert it for the right reason. That distinction stopped being free when
 * hosted CAPTCHA started refusing `signInWithPassword` unconditionally: the old
 * assertion ("sign-in returns an error") became true for every account, banned
 * or not, and a control that cannot fail is not a control.
 */
export async function attemptOnlineSession(input: {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly publishableKey: string;
  readonly email: string;
}): Promise<OnlineSessionAttempt> {
  const attempt = await attemptExchange(input);
  return attempt.ok
    ? { ok: true, accessToken: attempt.session.access_token, userId: attempt.session.user.id }
    : attempt;
}

type ExchangeAttempt =
  | { readonly ok: true; readonly session: VerifiedSession }
  | { readonly ok: false; readonly stage: "generate_link" | "verify"; readonly status: number; readonly body: string };

async function attemptExchange(input: {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly publishableKey: string;
  readonly email: string;
}): Promise<ExchangeAttempt> {
  const { supabaseUrl, publishableKey, email } = input;
  const generated = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: input.serviceRoleKey,
      authorization: `Bearer ${input.serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const generatedBody = await generated.text();
  if (!generated.ok) {
    return { ok: false, stage: "generate_link", status: generated.status, body: generatedBody.slice(0, 300) };
  }
  const { email_otp: emailOtp } = JSON.parse(generatedBody) as { email_otp?: string };
  if (!emailOtp) {
    return { ok: false, stage: "generate_link", status: generated.status, body: "no email_otp" };
  }

  const verified = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email, token: emailOtp }),
  });
  const verifiedBody = await verified.text();
  if (!verified.ok) {
    return { ok: false, stage: "verify", status: verified.status, body: verifiedBody.slice(0, 300) };
  }
  return { ok: true, session: JSON.parse(verifiedBody) as VerifiedSession };
}

interface VerifiedSession {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: number;
  readonly user: { id: string };
}

/**
 * The exchange, retried — because a shared disposable account is the norm here.
 *
 * A spec file creates **one** account and its cases run in parallel, so two
 * sign-ins for the same address can overlap. GoTrue keeps one outstanding
 * magiclink OTP per user, so the second `generate_link` invalidates the first
 * and whichever `verify` arrives late is refused. Observed exactly once in
 * seventeen files under six workers, which is the worst kind of failure to
 * leave in a *fixture*: it would be read as a product flake in whatever journey
 * happened to lose the race.
 *
 * The loser simply asks again. Bounded, and a genuine refusal (a banned
 * account, a wrong project) still fails after the last attempt with the
 * provider's own words.
 */
async function exchangeSession(input: {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly publishableKey: string;
  readonly email: string;
}): Promise<VerifiedSession> {
  let last: ExchangeAttempt = { ok: false, stage: "verify", status: 0, body: "not attempted" };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await attemptExchange(input);
    if (last.ok) {
      const session = last.session;
      expect(session.access_token, "verify returned no access_token").toBeTruthy();
      expect(session.expires_at, "verify returned no expires_at").toBeTruthy();
      expect(session.user?.id, "verify returned no user").toBeTruthy();
      return session;
    }
    // Staggered, so two racers do not simply collide again on the same beat.
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1) + Math.floor(Math.random() * 250)));
  }
  expect(
    last.ok,
    `could not open a session for the disposable account: refused at ${
      last.ok ? "" : last.stage
    } — ${last.ok ? "" : `${last.status} ${last.body}`}`,
  ).toBe(true);
  throw new Error("unreachable");
}

/**
 * Mints a session for `email` over HTTP and installs it in `page`'s context.
 *
 * Returns the account id so a caller can prove — with the service role, on the
 * Node side — that the identity the *product* resolved is this disposable
 * account and not some other session lying around.
 */
export async function signInWithoutTheLoginForm(
  page: Page,
  input: OnlineSessionInput,
): Promise<OnlineSession> {
  const { supabaseUrl, serviceRoleKey, publishableKey, email, locale, appOrigin } = input;
  const next = input.next ?? `/${locale}/app`;
  const acceptPolicies = input.acceptPolicies ?? true;
  const session = await exchangeSession({ supabaseUrl, serviceRoleKey, publishableKey, email });

  // The app is server-rendered and reads its session from cookies, so the
  // cookie is where the session has to be. The origin matters: it must be the
  // app under test, not the Supabase project. Seeded before the first
  // navigation, so the very first request already carries it — the proxy runs
  // on that request and there is no unauthenticated round trip to recover from.
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

  const consentPath = `/${locale}/consent`;
  let acceptedPolicies = false;
  if (acceptPolicies && new URL(page.url()).pathname === consentPath) {
    // The product's own surface, not a seeded row: this records a real
    // acceptance at the current version, through the same Server Action a
    // person uses. If the gate ever stops working, this click stops working
    // with it.
    await page.getByRole("button", { name: ACCEPT_LABEL[locale] }).click();
    await expect(
      page,
      "the consent interposition did not clear after accepting",
    ).not.toHaveURL(new RegExp(`${consentPath}$`), { timeout: 30_000 });
    acceptedPolicies = true;
    await page.goto(next);
  }

  if (input.assertDestination !== false) {
    await expect(
      page,
      "the session cookie did not authenticate — see this file's header on the cookie contract",
    ).toHaveURL(new RegExp(`${next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 30_000 });
  }

  return { userId: session.user.id, acceptedPolicies, landedOn: page.url() };
}

/**
 * The three values every online spec already reads, in one place.
 *
 * They come from `scripts/online-playwright.mjs`, which resolves them from the
 * linked Supabase project — never from a tracked file. A spec that cannot see
 * all three skips itself rather than failing, which is what keeps the online
 * lane out of CI without a second mechanism to remember.
 */
export const onlineEnvironment = {
  supabaseUrl: process.env.ONLINE_SUPABASE_URL,
  publishableKey: process.env.ONLINE_SUPABASE_PUBLISHABLE_KEY,
  serviceRoleKey: process.env.ONLINE_SUPABASE_SERVICE_ROLE_KEY,
  get configured(): boolean {
    return Boolean(this.supabaseUrl && this.publishableKey && this.serviceRoleKey);
  },
} as const;

/**
 * `signInWithoutTheLoginForm` with the environment already resolved — the
 * one-line form the journeys use, so a spec's sign-in is a statement about
 * *who* is signed in and nothing else.
 */
export async function signInOnline(
  page: Page,
  input: {
    readonly email: string;
    readonly locale: OnlineLocale;
    /**
     * Playwright's `baseURL`. Optional: most journeys sign in from a
     * module-level helper that never received the fixture, so it is read from
     * the running project when it is not passed.
     */
    readonly appOrigin?: string;
    readonly next?: string;
    readonly acceptPolicies?: boolean;
    readonly assertDestination?: boolean;
  },
): Promise<OnlineSession> {
  expect(
    onlineEnvironment.configured,
    "signInOnline needs the ONLINE_SUPABASE_* environment; run through scripts/online-playwright.mjs",
  ).toBe(true);
  const appOrigin = input.appOrigin ?? test.info().project.use.baseURL;
  expect(appOrigin, "no baseURL is configured for this project").toBeTruthy();
  return signInWithoutTheLoginForm(page, {
    supabaseUrl: onlineEnvironment.supabaseUrl!,
    serviceRoleKey: onlineEnvironment.serviceRoleKey!,
    publishableKey: onlineEnvironment.publishableKey!,
    ...input,
    appOrigin: appOrigin!,
  });
}
