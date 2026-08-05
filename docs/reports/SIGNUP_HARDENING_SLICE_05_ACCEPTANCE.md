# SH.5 — acceptance, adversarial review, and what stays unclaimed

Signup, confirmation, recovery, CAPTCHA and throttling. Migration
`202608040075` (one, as allocated — **six of eight spent**), ADR-080.

This report is written to be falsifiable. Where a requirement is satisfied it
says by what; where it is not, it says so in the same table rather than in a
footnote.

---

## 1. Traceability

| Requirement | State | Evidence |
| --- | --- | --- |
| SH-SIGNUP-001 app gate defaults closed | **done** (SH.5a) | `signup-policy.test.ts`; deployed probe returns `error=signup-disabled` |
| SH-SIGNUP-002 / SH-COPY-005 honest closed copy | **done** (SH.5a) | `flow.ts`, both locales |
| SH-SIGNUP-003 configured origin, not the header | **done** (SH.5a) | `signup-policy.ts`; verified at the provider — `SIGNUP_HARDENING_ORIGIN_VERIFICATION.md` |
| SH-SIGNUP-004 allowlist readback, no wildcard | **done** | 12 exact URLs; a preview host was offered and **rewritten** |
| SH-SIGNUP-005 confirmation required | **partial** | `mailer_autoconfirm=false` read back. The behavioural half needs a delivered mail → **blocked on SMTP** |
| SH-SIGNUP-006 `config.toml` convergence | **done** (SH.5a) | config guard test |
| SH-SIGNUP-007 hosted password policy | **not done** | owner dashboard action; app-side Zod policy is in force |
| SH-SIGNUP-008 dedicated resend surface | **done** | `/[locale]/auth/resend`, `resendConfirmation`, own ceiling |
| SH-SIGNUP-009 recovery still works | **done** | deployed probe → `?message=recovery-sent`, zero 5xx |
| SH-SIGNUP-010 callback allowlist guard-of-the-guard | **done** | `throttle-policy.test.ts`; **found a real defect** — see §3 |
| SH-SIGNUP-011 enumeration-uniform | **done, with a measured gap** | `captcha.test.ts`; timing not measured — §4 |
| SH-SIGNUP-012 session fixation | **done** | `captcha.test.ts` pins |
| SH-SIGNUP-013 disposable-email posture | **done** | recorded in `throttle-policy.ts`; v1 accepts them |
| SH-CAPTCHA-001 vendor by ADR | **done** | ADR-076 |
| SH-CAPTCHA-002 provider enforcement | **SATISFIED** as specified | deployed probes 2026-08-05: missing token, invalid token and four bypass shapes all `400 captcha_failed`; refusal identical for known vs unknown — §5. Residual: the valid-token probes could not run from automation and are SKIPPED, not passed |
| SH-CAPTCHA-003 widget + token | **done** | four forms; `captcha.test.ts` |
| SH-CAPTCHA-004 one external origin, absent from product | **done** | repo-wide scan asserts the offender list exactly |
| SH-CAPTCHA-005 CI never claims the hosted control | **done** | no site key in CI → no widget, no token |
| SH-THROTTLE-001 ledger shapes | **done** | 46 pgTAP assertions |
| SH-THROTTLE-002 ceilings under concurrency | **done** | pgTAP + **the concurrency script, executed** — §2 |
| SH-THROTTLE-003 consulted before the provider | **done** | ordering asserted textually per action |
| SH-THROTTLE-004 30-day retention, scheduler-only | **done** | pgTAP; job scheduled on the deployed project |
| SH-THROTTLE-005 app ceilings ≤ provider's | **partial** | stable limits satisfied; the mail limit is a default-SMTP artefact and `resend` stays **provisional** |
| SH-THROTTLE-006 lockout matrix | **done** | pgTAP: a spent recovery ceiling leaves sign-in available |
| SH-THROTTLE-007 no plaintext of a non-existing account | **done** | pgTAP (columns absent by name) + unit (payload contains neither address nor IP) |
| SH-COPY-004 refusals are distinct | **done** | five codes, distinct in both locales |

---

## 2. The concurrency proof, executed

`scripts/sh5-throttle-concurrency.mjs`, run against the deployed project as
`anon` — the same role and endpoint the Server Actions use.

| Run | Ceiling | Simultaneous claims | Admitted | Throttled |
| --- | --- | --- | --- | --- |
| 1 | 3 | 10 | **3** | 7 |
| 2 | 5 | 20 | **5** | 15 |

This is the property a pgTAP file structurally cannot show. A sequential test
passes identically whether the advisory locks exist or not; the naive
"count, then decide, then insert" fails only here, because under READ COMMITTED
both racers read `ceiling - 1` and both proceed.

---

## 3. What writing the tests found

**`safeAuthNext` did not hold.** It returned `/en/app/../../evil` verbatim — the
value passed the `startsWith("/en/app/")` branch, and a browser resolves it to
`/evil`. Not an open redirect, since it cannot leave the origin, so T-20 was
never reachable this way; but it defeated the subtree pin the allowlist exists
to enforce. Fixed in the guard, with a backslash rejected alongside for the
reason `//` already was.

**Three regressions this slice caused and repaired**, recorded because each is a
trap the next slice can walk into:

1. `actions.ts` reaches `server-only` transitively through the crypto core, so
   two unrelated suites stopped importing. This repository hit that exact trap
   once before. Stubbed in the tests, **not** removed at the source — the marker
   is a build-time guard and `npm run build` in CI is what enforces it.
2. The resend page pushed the inline locale-ternary count past its guarded
   ceiling. Fixed the way the guard names — a typed `auth/copy.ts` — not by
   raising the baseline.
3. The first ledger-emptiness check asked PostgREST as `service_role` and got
   `403`. Correct behaviour, but it made the check compare `"?"` with `"?"` and
   report a pass. A verification that cannot fail is not a verification.

---

## 4. Adversarial review

| Threat | Disposition |
| --- | --- |
| **T-14 signup flood** | App gate closed; ceiling 3/identifier/day, 10/IP/day, enforced under proven concurrency; **and CAPTCHA now enforced by the provider** (§5). **Residual:** a distributed botnet with genuinely solved CAPTCHAs, bounded per-IP and per-identifier, each account quota-boxed. |
| **T-15 email bombing** | `resend` has its own tighter ceiling (2/identifier/hour) and is the only surface whose purpose is to send to someone else's inbox. **Residual:** up to the ceiling per day, below the provider's own budget. |
| **T-16 recovery abuse** | Link base is the configured origin, verified at the provider; allow list verified by observation; recovery ceiling 3/day; the reset forces a sign-out. |
| **T-17 enumeration** | Throttle consulted before the provider so the timing difference is ours, not the provider's; one shared refusal code for existing and unknown; resend copy is conditional. **Residual: timing is not measured** — see below. |
| **T-18 CAPTCHA bypass** | **Closed by execution.** Provider enforcement is live and every direct-API shape that skips the widget is refused `400 captcha_failed` — no token, invalid token, empty string, `null`, token at the top level, meta object absent. UI-only enforcement is structurally impossible, which is what the threat asked for. |
| **T-19 session fixation** | `exchangeCodeForSession` issues a fresh session; `updatePassword` re-validates with `getUser()` before writing and forces `signOut()` after; no action accepts a caller-supplied session identifier (asserted). |
| **T-20 open redirect** | `safeAuthNext` allowlist, now including traversal and backslash rejection; every permitted value is asserted same-origin in both locales. |
| **T-21 throttle race** | Closed by §2. |
| **New — throttle fails open** | Considered and rejected as a design. An unreachable throttle **refuses**, because a control an attacker can switch off by inducing errors, with nothing reporting it, is worse than an outage. |
| **New — ceiling parameter tampering** | `anon` can call the RPC directly and choose its own ceilings. Bounded by `private.auth_event_ceiling_cap()` and, more fundamentally, pointless: a claimed slot sends no mail, creates no account and authenticates nobody. The protection is the Server Action passing the correct ceiling. |
| **New — identifier stuffing to lock a victim out** | Impossible without the pepper, which is not in the database. A direct caller cannot compute a victim's hash. |

**SH-SIGNUP-011's measured residual, stated as required rather than argued
away:** timing has **not** been measured. A request the throttle refuses returns
faster than one that reaches the provider, and an address that exists may take
longer inside GoTrue than one that does not. The requirement asks for this to be
measured once and recorded; it has not been, and it is carried into the rollout
gate rather than counted as done.

---

## 4b. The deployed Turnstile boundary — one defect found and fixed, one question open

The deployment probe was not a formality. It found a defect that **no test in
this repository would have caught**, and it left one question that automation
cannot settle.

### The defect: CSP blocked the widget's script

Every static check passed — widget markup on all five auth forms, correct site
key, correct response-field name, zero secret-shaped strings across ten served
chunks — and the browser said:

```
Loading the script 'https://challenges.cloudflare.com/turnstile/v0/api.js'
violates the following Content Security Policy directive:
"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

So Turnstile never injected its response input and **no token could exist**.
The failure is silent while hosted CAPTCHA is off, and the moment it is switched
on it becomes *every sign-in refused for a missing token* — locking out every
account including the owner's.

Fixed in `next.config.ts`, route-scoped. The obvious implementation would not
have worked: **two `Content-Security-Policy` headers on one response are
enforced as an intersection**, so a looser policy layered on the global strict
one changes nothing while looking exactly like a fix. The sources are mutually
exclusive by construction and `csp.test.ts` asserts every route matches exactly
one — including the case where a route matches *neither* and silently loses its
CSP.

Verified live after deploy: the auth route now serves
`script-src … https://challenges.cloudflare.com` with matching `frame-src` and
`connect-src`; the product route serves none of them.

### The question is no longer open, and the earlier reading was wrong

> **Corrected 2026-08-05.** The section below concluded that the missing token
> "points at automation and local DNS rather than at a misconfiguration". A
> discriminating experiment settled it the other way. The text is kept because
> the reasoning that produced the wrong answer is worth seeing, but **the
> conclusion is superseded by §4c.**

### The open question: no token in an automated browser

After the fix, the widget **loads, renders and communicates**:
`window.turnstile` is defined, `turnstile.render()` returns a widget id
(`cf-chl-widget-…`), the response input is injected, roughly twenty
challenge-platform requests return `200`, and **zero CSP violations** are
recorded.

But no token materialised within 15–20 seconds, in headless *or* headed
Chromium, at any widget size including the default — and two requests to
`brunhild.challenges.cloudflare.com` failed with `ERR_NAME_NOT_RESOLVED` **in
this environment**.

That evidence points at automation and local DNS rather than at a
misconfiguration: a wrong hostname or an invalid site key produces an
`error-callback` with a code, and none fired. It is **not proof either way**,
and it is recorded as an open question rather than resolved by assertion.

**Consequence for the rollout order, and it is not optional:** the owner should
open an auth page in an ordinary browser and confirm the widget visibly
completes **before** enabling hosted CAPTCHA. Enabling enforcement while no
token is produced would lock every account out of the product, and the account
that would fix it is one of the locked-out ones.

---

## 4c. The site key does not work on this hostname — a second lockout-class defect

Cloudflare publishes site keys with fixed behaviour for exactly this question.
All three were rendered on the **live page**, in the same browser, through the
same CSP, in one session — only the key varied.

| Site key | Result |
| --- | --- |
| `1x00000000000000000000AA` (always passes) | **token, 21 chars** |
| `2x00000000000000000000AB` (always blocks) | **`error-callback` fired, code `600010`** |
| `0x4AAAAAAEHELS4NcaQk8Whr` (the real one, from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) | **timeout, 0 iframes, no callback** |

Two things follow, and the second one is why the first is trustworthy:

1. **This environment can complete a Turnstile challenge.** The always-passes
   key produced a real token through the deployed CSP. So automation, headless
   Chromium and local DNS are all **exonerated** — the earlier reading in §4b
   was wrong.
2. **Error callbacks do fire and do propagate here.** The always-blocks key
   returned `600010`. So the real key's silence is not a swallowed error; the
   widget genuinely never starts.

**Conclusion: the configured site key does not render a widget on
`my-brain-dusky.vercel.app`.** The overwhelmingly likely cause is the widget's
**hostname allowlist** in the Cloudflare dashboard — a Turnstile widget only
serves the domains registered against it, and a key created for a different
hostname (or before this one existed) behaves exactly like this.

### Why this had to be found before enabling, not after

This is the *second* defect on this path that is invisible until the switch is
flipped, and it has the same consequence: with hosted CAPTCHA on and no token
obtainable, **every sign-in, signup, recovery and resend is refused** — and the
owner account that would turn the setting back off is one of the locked-out
ones.

### The owner action this creates, and it comes first

In the **Cloudflare dashboard → Turnstile → the widget for this site**, confirm
the **Hostnames** list contains `my-brain-dusky.vercel.app` (add it if not), and
confirm the site key it shows is the one in
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The site key is public; the secret key is not
needed for this check and must not be pasted anywhere.

Re-run `node scripts/…` — or simply reload an auth page — until the widget
visibly completes. **Only then** enable hosted CAPTCHA.

---

## 4d. The site key was NOT broken — §4c's conclusion is withdrawn

> **Withdrawn 2026-08-05.** §4c concluded "the configured site key does not
> render a widget on `my-brain-dusky.vercel.app`… a genuine defect". That was
> wrong, and the flaw was in the control, not in the observation.

Cloudflare's `1x00000000000000000000AA` is documented to pass **regardless of
client**. It therefore never controlled for the one variable that actually
differed: **bot detection**. A real managed widget declining to serve a
challenge to a browser it fingerprints as automated produces exactly the
observed signature — no iframe, no token, no error callback — while working
perfectly for a human.

Confirmed by the owner reconfiguring nothing about the key and the widget then
being observed to render and complete in an ordinary browser, and by the raw
enforcement probes below, which required no token and passed immediately.

**The lesson is about the control, not the widget.** A control that is exempt
from the mechanism under test is not a control. `1x…AA` proved the *environment*
could run Turnstile's happy path; it could not, and did not, prove anything
about a key subject to bot detection. Two conclusions were published from it —
§4b's "automation and DNS" and §4c's "genuine defect" — and both were wrong in
opposite directions.

---

## 5. SH-CAPTCHA-002 — SATISFIED as specified, with one residual named

**The requirement:** *"CAPTCHA is enforced by the provider (GoTrue
`security.captcha`), so a raw API signup/recovery call without a valid token
fails — UI-only enforcement is structurally impossible. Verified behaviorally
against the deployed project with a **missing** and an **invalid** token."*

Executed 2026-08-05 by `scripts/sh5-captcha-enforcement-probes.mjs` against the
deployed project, as `anon`, with hosted `security_captcha_enabled = true` and
`security_captcha_provider = "turnstile"` read back first.

| # | Probe | Result |
| --- | --- | --- |
| 1 | raw `/recover`, **no** token | **`400 captcha_failed`** |
| 2 | raw `/recover`, **invalid** token | **`400 captcha_failed`** |
| 4 | four bypass shapes — empty string, `null`, token at the top level instead of inside `gotrue_meta_security`, meta object absent | **all four `400 captcha_failed`** |
| 6 | the refusal for a **known** address vs an **unknown** one | **identical** — `400 captcha_failed` both |
| — | raw `/signup`, no token | `400 captcha_failed` |

**UI-only enforcement is structurally impossible**: every shape of a direct API
call that skips the widget is refused by the provider, and the refusal does not
vary with whether the address exists — so enforcement did not reintroduce the
enumeration channel SH-SIGNUP-011 closes.

The deployed **application** path was checked too: with no token, both
`/pt-BR/auth/recover` and `/pt-BR/auth/login` land on `?error=captcha-failed` —
its own declared code, not `invalid-credentials` and not `recovery-failed`.
Requirement 11's "distinguish CAPTCHA failures from credential, throttle and
configuration failures" is therefore verified end to end on the deployment, not
just in unit tests.

### The residual, stated rather than smoothed over

**Probes 3 and 5 — the ones needing a *valid* token — could not be executed
here, and are recorded SKIPPED rather than passed.** Turnstile declines to serve
a challenge to an automated browser, headless or headed, which is the product
working as designed and not a defect. A probe that cannot run has proven nothing
in either direction.

Log evidence is **ambiguous and is not being read as confirmation**: three
`grant_type=password` sign-ins returned `200` at 15:59–16:00 UTC, but the
earliest refusal that is provably post-enablement is 16:11, so those successes
cannot be placed inside the enforced window. `grant_type=refresh_token` traffic
is excluded from that count — it is not CAPTCHA-protected, and counting it would
let a refresh storm masquerade as proof.

**What settles it:** one interactive sign-in at
`https://my-brain-dusky.vercel.app/pt-BR/auth/login`. A subsequent
`/token?grant_type=password → 200` in the auth log, timestamped after the
16:11 refusals, is the confirmation — and its absence would mean auth is
currently refused for everyone, which is an outage rather than a control.

---

## 5b. What SH-CAPTCHA-002 does not cover

It is a statement about the **provider**, not about the widget's usability. It
says a call without a valid token fails; it says nothing about how pleasant the
challenge is, whether a given browser can solve it, or whether the widget is
reachable on every network. Those belong to the rollout gate.

`captcha.ts` still deliberately exposes no `verifyToken`. Verification happens
inside GoTrue against the secret, and a helper here would invite a caller to
believe the application enforces something it does not.

**The sign-in form carries the widget too**, though SH-CAPTCHA-003 names only
register, recover and resend. Supabase's CAPTCHA protection is a per-project
switch GoTrue applies to the password grant as well; enabling it with no widget
on sign-in would lock every existing account out of the product, the owner's
included, the moment the setting is flipped.

---

## 6. Blocked on custom SMTP, and carried to the rollout gate

No custom SMTP and no verified sending domain exist. Therefore:

- **No production email readiness is claimed.**
- `rate_limit_email_sent = 2/hour` is the **default Supabase SMTP** value, not a
  product ceiling, and is never presented as one.
- `AUTH_EVENT_CEILINGS.resend` keeps its `provisional` marker, with a test
  asserting the marker so removing it is a reviewable deletion.
- **Deployment-blocked journeys:** recovery-link delivery and confirmation-link
  delivery end-to-end (SH-SIGNUP-005's behavioural half, SH-SIGNUP-009's
  delivered half). Both carry into the public-rollout gate.

---

## 7. Gate

`npm run lint` zero; `npm run typecheck` zero; `npm run build` passes; vitest
**3852 passing**, with four **pre-existing local-only** failures (three `.mjs`
shebang import errors and `sql-reachability`'s two CRLF assertions) that fail
identically on `main` and are green in CI. 46 pgTAP assertions and 37 new unit
cases. The concurrency script passes against the deployed project.
