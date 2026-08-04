# SH-GD.1 — hosted Auth configuration readback and the origin correction

Executed 2026-08-04 against the deployed project `ulvwzqlpsjyrnqzfxmck`, using
the Supabase Management API with the owner-supplied `SUPABASE_ACCESS_TOKEN`.
The token was read from `.env.local`, used only as a bearer header, and never
printed. `.env.local` is gitignored and untracked, and a scan of all 1,132
tracked files found **zero** containing the token value.

Reproduce with `node scripts/hosted-auth-config.mjs` (readback only; `--apply`
performs the targeted update).

---

## 1. The readback, before any change

242 fields were returned. Every value whose field **name** looks like a
credential is reduced to a presence flag before printing, so a secret field the
provider adds tomorrow is redacted by default rather than by having been listed.

| Field | Value |
| --- | --- |
| `site_url` | **`http://localhost:3000`** |
| `uri_allow_list` | **empty string** |
| `disable_signup` | `true` |
| `external_email_enabled` | `true` |
| `external_anonymous_users_enabled` | `false` |
| `mailer_autoconfirm` | `false` |
| `mailer_secure_email_change_enabled` | `true` |
| `mailer_otp_exp` / `mailer_otp_length` | `3600` / `8` |
| `password_min_length` | `6` |
| `password_required_characters` | `null` |
| `password_hibp_enabled` | `false` |
| `security_captcha_enabled` | **`false`** |
| `security_captcha_provider` | `hcaptcha` |
| `security_manual_linking_enabled` | `false` |
| `security_refresh_token_reuse_interval` | `10` |
| `refresh_token_rotation_enabled` | `true` |
| `jwt_exp` | `3600` |
| `sessions_timebox` / `sessions_inactivity_timeout` | `0` / `0` |
| `smtp_host` / `smtp_user` / `smtp_sender_name` / `smtp_admin_email` | all `null` |
| `smtp_max_frequency` | `60` seconds between mails to one address |

### Provider rate limits — the values SH.5's ceilings must sit at or below

| Field | Value | Window |
| --- | --- | --- |
| `rate_limit_email_sent` | **2** | per hour |
| `rate_limit_verify` | 30 | per 5 min per IP |
| `rate_limit_otp` | 30 | per 5 min per IP |
| `rate_limit_token_refresh` | 150 | per 5 min per IP |
| `rate_limit_anonymous_users` | 30 | per hour |
| `rate_limit_web3` | 30 | per 5 min |

**`rate_limit_email_sent = 2` per hour is the binding constraint**, and it is
the *default Supabase SMTP* limit rather than a chosen one — it exists because
no custom SMTP is configured. Any application-level confirmation-resend ceiling
must sit at or below it, and a resend surface permitting more would promise
something the provider will refuse.

---

## 2. The finding

**The production project's `site_url` was `http://localhost:3000`, with an empty
redirect allow list.** Supabase falls back to `site_url` for every auth
redirect, and an empty allow list means *only* `site_url` is permitted. So every
confirmation and recovery link the deployed product could send pointed at the
recipient's own machine, and any `redirectTo` the application supplied would
have been refused.

Nothing in the repository disagreed, because nothing in the repository had an
opinion about hosted configuration. `src/features/auth/hosted-auth-posture.ts`
now fixes that: the intended posture is repository truth, generated from the
same `buildAuthCallbackUrl` the Server Actions call, and therefore diffable
against the live project.

---

## 3. The change, and why it was a PATCH rather than a config push

`supabase config push` sends the whole `[auth]` block. The readback returns
**242 fields** — MFA, SAML, every OAuth provider, session timeboxes — most of
which `config.toml` does not mention and this initiative has no opinion about.
Pushing would set all of them, so a two-field change becomes a change to
everything and *"no unrelated hosted setting regressed"* degrades from a claim
into a hope.

So the update is a Management API `PATCH` carrying only the fields the posture
module names, followed by a re-read of all 242 and a field-by-field diff against
the pre-change snapshot.

**Result: 2 fields changed, 0 unintended.**

| Field | From | To |
| --- | --- | --- |
| `site_url` | `http://localhost:3000` | `https://my-brain-dusky.vercel.app` |
| `uri_allow_list` | empty | 12 exact URLs |

The other four named fields — `disable_signup: true`, `external_email_enabled:
true`, `mailer_autoconfirm: false`, `external_anonymous_users_enabled: false` —
already matched and were re-asserted rather than assumed.

### The allow list, enumerated

Six per origin, across two origins. **No wildcard, no preview host.**

```
https://my-brain-dusky.vercel.app/pt-BR/auth/callback
https://my-brain-dusky.vercel.app/pt-BR/auth/callback?next=%2Fpt-BR%2Fapp
https://my-brain-dusky.vercel.app/pt-BR/auth/callback?next=%2Fpt-BR%2Fauth%2Freset
https://my-brain-dusky.vercel.app/en/auth/callback
https://my-brain-dusky.vercel.app/en/auth/callback?next=%2Fen%2Fapp
https://my-brain-dusky.vercel.app/en/auth/callback?next=%2Fen%2Fauth%2Freset
http://localhost:3000/...  (the same six)
```

Both the bare callback and the `next`-bearing forms are listed because providers
differ on whether the query string participates in matching, and an over-narrow
list fails only inside a real email. Every entry is an exact URL, so the extra
entries widen nothing.

**localhost is enumerated, never wildcarded.** Repository truth requires it: the
online acceptance suite and `npm run dev` both serve the app at
`http://localhost:3000` against this hosted project, and `signup-policy.ts`
documents that exact value as the non-production fallback. A dedicated
development Supabase project would remove the need entirely — recorded for SH.7
rather than left implicit.

---

## 4. The production regression this uncovered

Probing the deployment found **password recovery returning a bare HTTP 500**.

`APP_ORIGIN` is not configured in Vercel Production. PR #82 replaced the
request-`Origin` read with a configured origin that **throws** when unset, so
`recoverPassword` crashed before reaching the provider. The user saw *"A server
error occurred"*; nothing declared reached the operator.

Refusing to guess an origin is the security property and it is unchanged — the
resolver still throws, which is the honest signal for a caller that must decide.
Crashing was never part of it. `authOrigin()` now converts the throw into a
declared `auth-misconfigured` error: no mail is attempted, nothing is guessed,
and the reader gets a sentence naming no environment variable, because the
person reading it cannot fix it.

**This does not make recovery work.** It makes the failure honest. Recovery
stays down until `APP_ORIGIN` is set in Vercel Production — an owner action (§6).

---

## 5. Configured but NOT behaviourally verified

**The redirect allow list has not been exercised**, and cannot be yet: verifying
it requires a delivered confirmation or recovery email, and **no custom SMTP is
configured** (`smtp_host` is `null`). The default Supabase SMTP sends 2 mails per
hour and is not a production sender.

So the allow list is correct *by construction* — generated from the application's
own URL builder, with a parity test forbidding drift — and unverified *by
observation*. The distinction is recorded rather than blurred.

The verification step, once SMTP exists: request a password reset for a real
disposable account, open the delivered link, and confirm it lands on the
callback route and completes the session.

---

## 6. Owner actions still open

| Action | Why it is owner-only | What it unblocks |
| --- | --- | --- |
| Set `APP_ORIGIN=https://my-brain-dusky.vercel.app` in **Vercel Production**, then redeploy | The Vercel CLI here is unauthenticated and its login is an interactive OAuth device flow this session cannot complete | Password recovery, which is currently refusing |
| Configure **Resend** custom SMTP in Supabase | Requires a sending domain, DNS records and credentials that do not exist | Every email-dependent journey, and the allow-list verification in §5 |
| Enable **Turnstile** in hosted Auth | `security_captcha_enabled` is `false` and the provider is still `hcaptcha`; the secret is a hosted setting | Provider-enforced CAPTCHA (SH-CAPTCHA-002) |

`disable_signup` remains `true` and was re-asserted by this change. Public
signup is untouched and stays closed.
