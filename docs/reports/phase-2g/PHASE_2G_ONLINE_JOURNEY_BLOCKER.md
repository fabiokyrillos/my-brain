# The authenticated online journey suite is blocked, and this is what was measured

Slice 2G.4's first task, per the handoff: establish whether hosted CAPTCHA
blocks the `online-*.spec.ts` sign-in path **before** planning a hosted lane
around journeys that may not run. It does. This records the measurement, the
three approaches tried, and what each eliminated.

**Scope: the whole authenticated online suite, not Phase 2G's journeys.**
Twenty-eight spec files reference `auth/login`.

## 1. The measurement

`node scripts/online-playwright.mjs e2e/online-assistant-name.spec.ts
--project=desktop` against the deployed project:

```
Expected pattern: /\/pt-BR\/app$/
Received string:  ".../pt-BR/auth/login?error=captcha-failed"
  7 × unexpected value ".../pt-BR/auth/login"
 52 × unexpected value ".../pt-BR/auth/login?error=captcha-failed"
```

**This is the control working, not a fault.** SH.5's record already said
Turnstile declines automated browsers by design, and SH-CAPTCHA-002 is
satisfied precisely because UI-only enforcement is structurally impossible.
What is new is the consequence: since CAPTCHA was enabled on 2026-08-05, every
authenticated online journey has been unrunnable, and nothing said so.

`?error=captcha-failed` is the application's **own declared refusal code**
(SH.5 requirement 11), so the product is reporting the situation correctly.
The gap is in the test harness, not in the product.

## 2. Three approaches, and what each eliminated

| # | Approach | Result | What it eliminates |
| --- | --- | --- | --- |
| 1 | Fill the login form (status quo) | `?error=captcha-failed` | Automated password sign-in is not available at all |
| 2 | `admin/generate_link` → the app's `/{locale}/auth/callback` | Landed on the **deployed** `/pt-BR/auth/login#access_token=…` | **Two** independent blockers: GoTrue **silently rewrote** the non-allow-listed `redirect_to` to `site_url` (the behaviour SH.5 documented — a disallowed target returns 200 and quietly becomes something else), and magiclink returns its tokens in the URL **fragment** (implicit flow) while the callback reads `?code=` and calls `exchangeCodeForSession` (PKCE). No allow-list entry would have made these two meet. |
| 3 | Exchange the session over HTTP, install it as the `@supabase/ssr` cookie | Session obtained; browser still redirected to login | The **session exchange works** — `generate_link` → `/auth/v1/verify` with `email_otp` returns a real `access_token`, and Slice 2G.3's deployment probe used exactly that path to run 5/5 against the deployed validator. What does not work is the cookie install. |

### What approach 3 has already ruled out

- **The cookie format is right.** `@supabase/ssr@0.12.3` decodes `base64-` plus
  base64url of the session JSON (`dist/main/cookies.js:7,23`), which is what
  the helper writes.
- **`email_otp`, not `hashed_token`.** `/auth/v1/verify` refuses the hash with
  *"Only an email address or phone number should be provided on verify"*.
- **`service_role` is not a shortcut** for the RPC probes this unblocks: the
  EXECUTE grant is checked before the function body, so a service-role caller
  never reaches the logic under test.

### Where to look next

The cookie name's project ref; whether `src/proxy.ts` clears a session it did
not itself refresh; and whether 0.12.3 expects the chunked (`.0`) cookie name
even for a single chunk.

## 3. What is in the repository now

- **`e2e/support/online-session.ts`** — the helper, with the full history
  above in its header so the next attempt starts from three eliminated
  hypotheses rather than zero.
- **`e2e/online-session-fixture.spec.ts`** — its guard. The **negative
  control passes**: an unauthenticated browser is redirected to the login form,
  which proves the route it targets is genuinely gated. The positive case is
  **`test.fixme`** with the exact status — marked, not deleted and not left
  red, because a red suite trains people to ignore red and a deleted test
  hides the work that remains.
- `e2e/online-conversational-creation.spec.ts` uses the helper, so it works the
  moment the helper does. It is separately gated on
  `BYOK_TEST_USER_A_OPENAI_API_KEY`, which is not currently provisioned.

## 4. What this does not propose

**Disabling hosted CAPTCHA to make tests pass is not on this list.** It is an
owner action, it weakens a control SH.5 proved is enforced at the provider
rather than in the UI, and the problem is a harness that has not caught up —
not a control that is wrong. A fixture that bypasses the login form using the
**service-role key** removes no protection: that key is a capability no
attacker has, and every online spec already holds it to create its disposable
account.

## 5. Consequence for Phase 2G's acceptance

`2G-ROUTE-008` and `2G-CLOSE-003` require authenticated journeys against the
deployment. They remain **WRITTEN, NOT EXECUTED**, now with a named blocker
and a measured path rather than an open question. Two things gate them:

1. this helper working, and
2. a disposable BYOK product credential — every conversational turn is a
   provider call, and `BYOK_TEST_USER_A_OPENAI_API_KEY` is unset.

Neither is a product defect, and neither is claimed as satisfied.
