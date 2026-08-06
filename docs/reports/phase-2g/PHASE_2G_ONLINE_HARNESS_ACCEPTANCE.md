# The authenticated online session fixture works, and this is what it took

Repository maintenance, not a phase. It closes the blocker recorded in
[`PHASE_2G_ONLINE_JOURNEY_BLOCKER.md`](PHASE_2G_ONLINE_JOURNEY_BLOCKER.md) —
which is kept exactly as written, because a record that quietly becomes right
is a record nobody can check.

Requirements touched: **`2G-ROUTE-008`**, **`2G-CLOSE-003`**. Both move from
*not delivered* to **partially delivered**, with one named blocker each.

## 1. What the blocker report got wrong, and why that is the useful part

Its §2 pointed the next attempt at three things: the cookie name's project ref,
whether `src/proxy.ts` clears a session it did not mint, and whether
`@supabase/ssr@0.12.3` wants the chunked `.0` name for a single chunk.

**All three were fine.** The cookie the helper was already writing was correct
in every particular. What actually stopped it was never examined, because the
first attempt read the redirect and stopped at the word "redirect".

The measurement that settled it separated the two halves that had been assumed
to be one. A Node probe fed candidate cookies to the exact reader the proxy
uses — `createServerClient(...).auth.getClaims()` — with no browser involved:

| cookie fed to the proxy's own reader | `claims.sub` |
| --- | --- |
| absent | `null` |
| `base64-` + non-JSON | `null` |
| valid session, wrong project ref in the name | `null` |
| `sb-<ref>-auth-token` | **resolves** |
| `sb-<ref>-auth-token.0` | **resolves** |
| correctly encoded, expired, unusable refresh token | `null` — *Refresh token is not valid* |

So the encoding was right and the server accepted it. The browser run then
showed where it was really going: **`/pt-BR/consent`**, not `/pt-BR/auth/login`.

## 2. The cookie contract, established by execution

Against `@supabase/ssr@0.12.3` and `@supabase/auth-js@2.110.7`:

- **Name** — `sb-<ref>-auth-token`, where `<ref>` is the project the *app* is
  configured against (`NEXT_PUBLIC_SUPABASE_URL`), which must be the project the
  fixture administers. A one-character difference resolves nothing.
- **Chunking** — `combineChunks` tries the bare name **before** `.0`
  (`utils/chunker.js`), so a single-chunk session needs no suffix. Both work.
  At ~2.8 KB the session is well under the 3180-byte chunk threshold, so exactly
  one cookie is ever installed. Multiple cookies are not required.
- **Encoding** — `base64-` plus base64url of `JSON.stringify(session)`, where
  `session` is the body `/auth/v1/verify` returns unaltered. `Buffer.toString
  ("base64url")` matches `stringToBase64URL` byte for byte.
- **Shape** — `access_token`, `refresh_token` and `expires_at` are the three
  fields `GoTrueClient._isValidSession` requires; a session missing `expires_at`
  is discarded and *removed* rather than used. Both access-token and
  refresh-token state are therefore required.
- **Attributes** — `domain` = the app host (not the Supabase host), `path=/`,
  `secure` only on https, `sameSite=Lax`, `httpOnly=false`. Chromium accepts it
  for `localhost` with `domain: "localhost"`.
- **Ordering** — seeded into the browser context **before** the first
  navigation, so the very first request already carries it and the proxy runs on
  an authenticated request. No unauthenticated round trip has to be recovered
  from.
- **The proxy does not rotate or clear a cookie it did not mint.** After
  navigation the cookie is still present, byte-identical, same length. Storage
  state serialization changes nothing. No refreshed cookie is expected in place
  of the raw `/auth/v1/verify` session.

## 3. The second blocker, which was underneath the first

With the session installed, the browser reached the app **authenticated** and
was redirected to `/{locale}/consent`. That is SH.4's gate — `requireUser` →
`hasAcceptedCurrentPolicies` — behaving correctly: an account created through
`admin/users` has no `policy_acceptances` row, because the **registration form**
is what records one.

Reaching that redirect is itself proof of authentication: `/consent` renders
only for a user whose lifecycle read succeeded.

**This is independent of CAPTCHA and predates it.** Every `online-*.spec.ts`
that admin-creates an account and expects `/{locale}/app` immediately after
sign-in has been unable to pass since SH.4 shipped, Turnstile or no Turnstile.
The CAPTCHA blocker simply arrived first and hid it.

Cleared the only honest way: the helper **accepts through the product's own
consent surface**, recording a real acceptance at the current version through
the same Server Action a person uses. Nothing is forged, no gate is bypassed,
and `acceptPolicies: false` exists for the one spec whose subject *is* the gate.

## 4. The third blocker: the password grant is gone for everyone

`POST /auth/v1/token?grant_type=password` against the deployed project:

```
400 {"error_code":"captcha_failed",
     "msg":"captcha protection: request disallowed (no captcha_token found)"}
```

Not browser-specific — **every** client. Two consequences, one of them a
product defect:

1. **Harness.** Five online specs minted a user access token that way in order
   to act as the user against PostgREST. They now use
   `mintOnlineAccessToken` (`admin/generate_link` → `/auth/v1/verify`).
2. **Product — `docs/TODO.md`, not fixed here.**
   `requestAccountDeletion` (`src/features/account/actions.ts`)
   re-authenticates with `supabase.auth.signInWithPassword({ email, password })`
   and passes **no `captchaToken`**, unlike all four surfaces in
   `src/features/auth/actions.ts`, every one of which forwards one. On the
   deployment that re-authentication cannot succeed, so **account deletion
   refuses a correct password with `A senha não confere.`** This is a product
   change and is deliberately out of a test-harness PR.

### A control that had stopped being a control

`online-account-suspension.spec.ts` asserted that a banned account cannot sign
in, by checking that `signInWithPassword` returns an error. Since SH.5 that is
true for **every** account, banned or not — the assertion had become
unfalsifiable. It now asserts through the link exchange, the same path the rest
of the suite uses to *succeed*, and the test that lifts the ban proves the
positive half immediately afterwards.

## 5. The security boundary, and what guards it

The service role may create a disposable account, mint and exchange an
authentication link, and delete the account. It is Node-side only.

- **Runtime** — `e2e/online-session-fixture.spec.ts` asserts the key is absent
  from `storageState()`, from `document.cookie`, from `localStorage` and
  `sessionStorage`, and that the token the browser holds carries
  `role: "authenticated"` with `sub` equal to the disposable account.
- **Source** — `src/lib/closeout/online-session-boundary.test.ts` allows the key
  to appear only in an enumerated set of shapes, refuses any browser-facing API
  in the helper (`addInitScript`, `page.evaluate`, `evaluateHandle`,
  `storageState`, `setExtraHTTPHeaders`), asserts exactly one cookie is
  installed and that its value is the session, and sweeps every online spec for
  service-role material crossing into a page. It caught two new shapes during
  this work, which is the only evidence that it is doing anything.

Nothing about hosted CAPTCHA, GoTrue, or product authentication was weakened.
The login form is still CAPTCHA-guarded; the fixture simply does not use it.

## 6. Two more things the run itself found

- **The 30-second test timeout was the binding constraint**, not the product.
  The first converted journey failed at an assertion that had never been
  reached. The online lane now gets 90 s, scoped by the presence of
  `ONLINE_SUPABASE_URL` so CI's local journeys keep failing fast.
- **A shared disposable account races itself.** A spec file creates one account
  and its cases run in parallel; GoTrue keeps one outstanding magiclink OTP per
  user, so a second `generate_link` invalidates the first and the late `verify`
  is refused. Seen once across seventeen files under six workers — the worst
  place to leave a flake, because it would be read as a product failure in
  whichever journey lost. The exchange now retries, bounded and staggered, and a
  genuine refusal still fails with the provider's own words.

## 7. What runs now

Command: `node scripts/online-playwright.mjs e2e/online-*.spec.ts --project=desktop`

**80 passed · 7 skipped · 0 failed**, 17.1 minutes, two workers, against hosted
parity `202608060078`. Before this work the number that could run was **zero**.

| spec file | pass | skip |
| --- | --- | --- |
| `online-account-deletion` | 0 | **2** |
| `online-account-suspension` | 5 | 0 |
| `online-assistant-composer` | 2 | **1** |
| `online-assistant-name` | 2 | 0 |
| `online-auth` | 2 | **1** |
| `online-consent-interposition` | 8 | 0 |
| `online-conversational-creation` | 0 | **3** |
| `online-entity-editing` | 3 | 0 |
| `online-entity-graph` | 4 | 0 |
| `online-entry-outcomes` | 5 | 0 |
| `online-history` | 8 | 0 |
| `online-memories` | 6 | 0 |
| `online-mobile-navigation` | 1 | 0 |
| `online-question-outcome` | 2 | 0 |
| `online-relationships` | 4 | 0 |
| `online-reminders` | 12 | 0 |
| `online-route-audit` | 9 | 0 |
| `online-session-fixture` | 7 | 0 |

**16 of the 18 files execute at least one case.** The 7 skips are three named
reasons and nothing vague:

| skipped | why | whose problem |
| --- | --- | --- |
| `online-conversational-creation` ×3, `online-assistant-composer` ×1 | every turn is a provider call under BYOK and `BYOK_TEST_USER_A_OPENAI_API_KEY` is unset | **one owner action** |
| `online-account-deletion` ×2 | the product defect in §4 — deletion re-auth has no `captchaToken` | a product change, `docs/TODO.md` |
| `online-auth` ×1 (signup journey) | no provider-routable test email domain, and public signup is disabled at both layers by design | unchanged, not a regression |

**No journey is marked passed because authentication succeeded.** Every one of
the 80 asserts what it was written to assert; the sign-in mechanism changed and
nothing else did. Two things the run itself repaired rather than papered over:
a greeting assertion in `online-auth` that only held in the afternoon, and the
suspension control described in §4 that had stopped being falsifiable.

Nothing is claimed for `--project=mobile`, which was not run.

## 8. What remains, and the single owner action

`2G-ROUTE-008` and `2G-CLOSE-003` are **partially delivered**. The
authenticated journey set runs against the deployed project on disposable
fixtures again; what does not run is the **conversational-creation** journey
itself — sentence → preview → confirm → task visible → undo — because every
turn is a provider call under BYOK and `BYOK_TEST_USER_A_OPENAI_API_KEY` is not
provisioned. `e2e/online-conversational-creation.spec.ts` already uses the
working helper and skips itself honestly rather than pretending.

**No provider credential is invented, and no BYOK provider behaviour is claimed.**

The owner action is one thing: provision a **disposable** OpenAI key as
`BYOK_TEST_USER_A_OPENAI_API_KEY` in `.env.local` (the same treatment
`BYOK_VALIDATION_OPENAI_API_KEY` already has — dedicated project, low budget
alert, restricted models). No secret value is requested here, and none should be
pasted anywhere but that file.

## 9. Residue

`npm run verify:online-residue` lists every account on the project whose address
ends in `@example.com` — RFC 2606 reserved, so a real account cannot land there
by accident — and exits non-zero if any remain. Report-only by design: removal
on a deployed project is an operator action with an operator's authorization
behind it, and a script that both detects and destroys is one bad predicate away
from being the incident.

Run immediately after the suite above:

```
accounts on the project : 2
fixture residue         : 0

zero fixture residue
```

Two accounts remain, and they are the two real ones the project has carried
since the BYOK cleanup. **Zero fixture residue**, across 87 cases that each
created and deleted their own account.

## 10. One thing the repository already knew

`e2e/online-auth.spec.ts` has installed the `@supabase/ssr` session cookie —
same name, same `base64-` encoding, same shape — since long before any of this.
The blocker report's three hypotheses were aimed at a contract that was already
demonstrated, in the same directory, in a spec that was passing. The lesson is
not about cookies: a "how does this work" question is worth grepping the
repository for before it is worth an afternoon of probes.
