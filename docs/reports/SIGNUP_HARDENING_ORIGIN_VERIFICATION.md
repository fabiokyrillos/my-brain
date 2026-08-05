# SH-ORIGIN-001 / SH-SIGNUP-004 — the deployed origin, verified rather than trusted

The owner reported three things: `APP_ORIGIN` set in Vercel Production to
`https://my-brain-dusky.vercel.app`, a redeploy after setting it, and public
signup still closed. This is the record of checking all three against the
running system instead of accepting them, and of two findings the checking
produced that the report it supersedes could not.

Everything below was observed on **2026-08-04** against the production
deployment and the linked Supabase project `ulvwzqlpsjyrnqzfxmck`.

---

## 1. What was asked, and what answers it

| # | Claim to verify | Verdict | What proved it |
| --- | --- | --- | --- |
| 1 | The current Vercel production deployment is healthy | **verified** | `/pt-BR/auth/login`, `/en/auth/login`, `/pt-BR/auth/recover`, `/pt-BR/auth/register` all return `200`; `/` returns `307` to the locale route |
| 2 | Password recovery no longer returns HTTP 500 | **verified** | A submitted recovery landed on `/pt-BR/auth/login?message=recovery-sent` with **zero** 5xx responses observed on any request in the page's lifetime |
| 3 | The auth-misconfigured refusal no longer renders | **verified** | Neither locale's auth pages contain the refusal copy, and recovery returned no `error=auth-misconfigured` |
| 4 | Generated callback URLs use the configured origin | **verified** | The hosted GoTrue logged the deployment's own `/recover` call with `redirect_to = https://my-brain-dusky.vercel.app/pt-BR/auth/callback?next=%2Fpt-BR%2Fauth%2Freset` |
| 5 | Hosted `site_url` and allow list still match repository truth | **verified** | `hosted-auth-config.mjs --diff` reports `ok` on all five intended fields |
| 6 | No preview host or wildcard entered the allow list | **verified** | 12 enumerated URLs, no `*`; a preview host offered to GoTrue was actively **rewritten**, not honoured |
| 7 | Signup remains closed at both layers | **verified** | Application: register submits to `?error=signup-disabled`. Hosted: `disable_signup = true` |

Claim 4 is the one that mattered most and the one that could most easily have
been waved through. A successful recovery proves only that `authOrigin()`
returned *something* valid — `resolveConfiguredOrigin` accepts any https origin
and also accepts localhost, and localhost is on the allow list for the online
suite. So "recovery worked" is consistent with a wrong `APP_ORIGIN`.

`APP_ORIGIN` lives in Vercel, whose CLI in this environment is unauthenticated.
But the provider that *received* the value logs it: the hosted auth log records
each `/recover` request with the resolved `redirect_to`. Reading it back showed
the exact URL `buildAuthCallbackUrl` composes, from the deployment, in
production. That is the value itself rather than an inference about it.

---

## 2. Finding — the allow list is enforced by rewriting, not by refusing

§5 of the readback report recorded the allow list as correct-by-construction and
**unverified by observation**, with delivered email named as the only way to
close that gap. That was too pessimistic: `admin/generate_link` composes the
link GoTrue *would* send without sending anything, so the allow list can be
exercised with no SMTP at all.

Three recovery links were composed against the online test fixture account —
never the owner's — and only the resolved `redirect_to` was read out of each:

| `redirect_to` offered | `redirect_to` in the composed link |
| --- | --- |
| `https://my-brain-dusky.vercel.app/pt-BR/auth/callback?next=%2Fpt-BR%2Fauth%2Freset` | **preserved exactly** |
| `https://attacker.example.com/pt-BR/auth/callback` | `https://my-brain-dusky.vercel.app` |
| `https://my-brain-dusky-git-preview.vercel.app/pt-BR/auth/callback` | `https://my-brain-dusky.vercel.app` |

So the allow list **is** enforced, and SH-SIGNUP-004's "no wildcard, no preview
host" is now a behavioural claim rather than a configuration reading: the
preview host was offered and refused.

The shape of the enforcement is the part worth writing down. A disallowed
`redirect_to` does **not** produce an error — `POST /auth/v1/recover` returned
`200` for the attacker host and the preview host alike. GoTrue silently
substitutes `site_url`. Two consequences follow, and neither is obvious:

1. **`site_url` is the real backstop.** Whatever origin the application sends,
   a link that is not on the list becomes `site_url`. `site_url` being the
   production origin is therefore load-bearing, not cosmetic.
2. **A mis-set `APP_ORIGIN` fails silently.** No error, no log line at the
   application layer, and mail that still arrives — just pointing at the wrong
   place. Nothing in the application can detect it. This is precisely why claim
   4 was checked at the provider rather than inferred from a green flow, and
   why it must be re-checked after any change to the deployment's environment.

What still requires SMTP is narrower than §5 claimed: not "is the allow list
correct" but "does a link, once *delivered*, complete a session end to end".

---

## 3. Hosted state at verification time

Read back in full — 242 fields, all five intended fields `ok`:

| Field | Value |
| --- | --- |
| `site_url` | `https://my-brain-dusky.vercel.app` |
| `uri_allow_list` | 12 exact URLs (2 origins × 2 locales × 3 shapes), no wildcard |
| `disable_signup` | `true` |
| `external_email_enabled` | `true` |
| `mailer_autoconfirm` | `false` |

### SMTP — **NOT CONFIGURED**, established by reading, not by asking

The owner's brief left the SMTP field as an unfilled placeholder. The hosted
configuration answers it without ambiguity:

`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email` and
`smtp_sender_name` are **all `null`**. There is no verified sending domain
because there is no sender at all. Resend is selected but not landed.

`rate_limit_email_sent = 2` per hour is the **default Supabase SMTP** ceiling —
it exists *because* no custom sender is configured and it will change when one
is. Per the standing instruction, no resend throttle is frozen against it; see
§4.

### Turnstile — **NOT CONFIGURED**

`security_captcha_enabled = false`, `security_captcha_provider = "hcaptcha"`,
`security_captcha_secret` absent. The provider selected by ADR-076 is Turnstile,
so both the enable flag *and* the provider field are wrong for the decision on
record. No credential value was requested, displayed or needed to establish
this.

### Provider ceilings

| Limit | Value | Stable? |
| --- | --- | --- |
| `rate_limit_email_sent` | 2 / hour | **no — a default-SMTP artefact** |
| `rate_limit_verify` | 30 / 5 min / IP | yes |
| `rate_limit_otp` | 30 / 5 min / IP | yes |
| `rate_limit_token_refresh` | 150 / 5 min / IP | yes |
| `rate_limit_anonymous_users` | 30 | yes |

---

## 4. The resend ceiling stays pending, and the migration does not

SH-THROTTLE-005 requires application ceilings at or below the provider's. The
binding provider ceiling for resend is the 2/hour above, which is temporary. A
number chosen against it and then frozen would be wrong the day Resend lands.

This does **not** block migration `202608040075`, and the reason is structural.
The declared pattern — `claim_credential_validation_slot`
(`202608010067`) — takes its ceilings as **function parameters**, and
SH-THROTTLE-002 requires defaults "changeable without migration". So no ceiling
value needs to enter DDL. The SH.5 migration carries the *mechanism* (table
shapes, advisory-lock claim, finalize, retention) and the application supplies
the *numbers*.

The one thing that must be right on the first attempt is the argument list:
Postgres cannot extend a function's parameters via `create or replace`
(ADR-057 / 2E-COMMAND-012). The SH.5 signature therefore takes ceilings as
**required parameters with no defaults**, so that no provider-derived value is
baked in and no later widening is needed.

Recorded consequence: **the resend ceiling is pending the post-SMTP hosted
readback.** It is a constant in application code, marked as provisional at its
definition, and the readback that settles it is the one that runs after Resend
is configured.

---

## 5. What is still owner-only

| Action | Why | What it unblocks |
| --- | --- | --- |
| Configure **Resend** custom SMTP | Needs a sending domain, DNS and credentials that do not exist | Delivered-link verification; settles the resend ceiling |
| Enable **Turnstile** and switch the provider from `hcaptcha` | Both are hosted Auth settings; the secret never belongs in the repository | SH-CAPTCHA-002's provider enforcement |

`APP_ORIGIN` is no longer on this list — it is set, deployed, and verified at
the provider.

---

## 6. How to re-run this

```powershell
node scripts/hosted-auth-config.mjs --diff      # hosted parity, no writes
```

The deployment probes and the link-composition probe were run from the session
scratchpad rather than committed: they exercise a live account and a live
deployment, and the repository's own re-runnable acceptance journeys
(`e2e/online-*.spec.ts`) are the maintained path for that. What is committed is
this record of what they returned.

Public signup was closed before this verification and is closed after it. No
configuration was changed by any step in this document.
