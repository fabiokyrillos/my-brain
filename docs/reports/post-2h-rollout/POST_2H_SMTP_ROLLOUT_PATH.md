# Post-2H — The SMTP rollout path (`RG-DEP-1`)

**Date:** 2026-08-07 · **Track:** A4 · **Not part of Phase 2H.**
**Nothing in this document opens signup.** Configuring SMTP and opening signup
are two separate owner acts, and §7 says why conflating them is the specific
hazard here.

---

## 1. Current hosted state, read live

`node scripts/hosted-auth-config.mjs`, project `ulvwzqlpsjyrnqzfxmck`,
2026-08-07:

| Field | Value | Reading |
| --- | --- | --- |
| `smtp_host` | `null` | **No custom SMTP.** |
| `smtp_port` | `null` | |
| `smtp_user` | `null` | |
| `smtp_pass` | `null` | |
| `smtp_admin_email` | `null` | No sender address exists. |
| `smtp_sender_name` | `null` | |
| `smtp_max_frequency` | `60` | Seconds between mails to one address. Provider default, survives the cutover. |
| `rate_limit_email_sent` | `2` | **Per hour, project-wide.** The default-SMTP artefact — see §4. |
| `external_email_enabled` | `true` | Email/password is the only sign-in method. |
| `mailer_autoconfirm` | `false` | Confirmation **required** — `RG-SIG-1`. |
| `mailer_secure_email_change_enabled` | `true` | Change requires confirming both addresses. |
| `mailer_otp_exp` / `mailer_otp_length` | `3600` / `8` | |
| `mailer_*_custom_contents` | all `false` | Every template is the provider default. |
| `site_url` | `https://my-brain-dusky.vercel.app` | |
| `disable_signup` | `true` | **Signup closed. Unchanged by anything here.** |
| `security_captcha_enabled` / `provider` | `true` / `turnstile` | Enforced. |
| `password_min_length` | `12` | |

**So: the project has no sender at all.** Supabase's shared default SMTP exists
for development and is explicitly not for production traffic — which is why
`rate_limit_email_sent` is 2/hour.

---

## 2. The provider decision is already made, and is not re-opened

**Resend**, selected in the Signup Hardening record and carried in
`docs/DECISIONS.md` (ADR-079's throttle reasoning), `docs/DATABASE.md` §"tetos",
`SIGNUP_HARDENING_HOSTED_AUTH_READBACK.md` §"owner actions", and
`SIGNUP_HARDENING_ORIGIN_VERIFICATION.md` ("Resend is selected but not landed").

Repository truth selects it, so per the instruction it is used and **no new
provider decision is invented.** Resend exposes standard SMTP
(`smtp.resend.com`), which is what Supabase Auth consumes — no application code
changes.

---

## 3. What in the application depends on email

Every one of these is **broken today** for a real user, because there is no
sender. That is currently masked by signup being closed and by there being three
accounts, all created by hand.

| Flow | Surface | Today, without SMTP |
| --- | --- | --- |
| **Signup confirmation** | `src/features/auth/` register | `mailer_autoconfirm: false`, so the account is created and **cannot sign in**. The user is stranded. |
| **Password recovery** | `auth/recover` → `auth/reset` | The link never arrives. |
| **Email change** | account settings | `mailer_secure_email_change_enabled: true` needs **two** deliveries. |
| **Invite** | not used by the product | — |
| **Magic link** | not used by the product | — |
| **Re-authentication OTP** | not used by the product | — |

**Account deletion does not depend on email** — it re-authenticates with a
password plus Turnstile (the SH deletion hotfix), so the deletion path is
unaffected by this gate in either direction.

**Redirect targets are already correct and need no change.** `uri_allow_list`
holds all twelve callback URLs (both locales × `callback`, `callback?next=/app`,
`callback?next=/auth/reset`, for localhost and the production origin). A
disallowed `redirect_to` returns **200** and silently becomes `site_url` — it
does not error — so this is verified by `admin/generate_link`, never by
eyeballing.

---

## 4. The one number that must move with the cutover

`rate_limit_email_sent = 2` is **per hour, project-wide**, and it is an artefact
of the shared default SMTP, not a chosen policy. This was recorded during SH.5
precisely so it would not be forgotten:

> `rate_limit_email_sent = 2/hora` é artefato do SMTP padrão e muda quando o
> Resend entrar. — `docs/DATABASE.md` §311

**Two accounts per hour makes public signup non-functional**, so this gate and
signup are coupled in one direction only: SMTP must land *before* signup opens,
and raising this ceiling is part of landing SMTP.

**The application-side ceilings are already independent of it, by design.**
ADR-079 made every `auth_event_attempts` ceiling a required parameter with no
default, clamped by `private.auth_event_ceiling_cap()`, exactly so that this
provider number could change without a migration. `src/lib/…` holds the
application values; nothing in DDL freezes 2.

**Owner decision required with the cutover: the new value.** It is **not
recommended-and-adopted here.** Ceilings in this project are signed by the owner
(the PRD §14.2 pattern), never minted by a report — and an earlier draft of this
document offered a single number, which is exactly how a report's suggestion
becomes a product value nobody decided. The consolidated decision, with its
options and their consequences, is **§9**.

---

## 5. Exact configuration steps

No credential appears in this repository, in this document, or in chat.

### 5.1 Owner-only, outside the repository

1. **Create the Resend account** and add the sending domain.
2. **Publish the DNS records Resend issues** — SPF (`TXT`), DKIM (`CNAME` ×3
   typically), and DMARC (`TXT`, start at `p=none`). **This is a domain action
   and is the true blocker.**
3. **Wait for Resend to report the domain `verified`.** Sending before that
   produces deliveries that land in spam, which reads as "SMTP is broken".
4. **Create an SMTP credential** in Resend (username `resend`, password = the
   API key).

> **Which domain?** The application origin is `my-brain-dusky.vercel.app`, a
> Vercel-owned domain **whose DNS the owner does not control**, so it cannot be
> used as a sending domain. This gate therefore needs a domain the owner owns.
> If one is not yet registered, that is the first action, and it is a
> prerequisite this document cannot remove.

### 5.2 In the Supabase dashboard — Authentication → Emails → SMTP Settings

| Field | Value |
| --- | --- |
| Enable Custom SMTP | on |
| Host | `smtp.resend.com` |
| Port | `465` (implicit TLS) |
| Username | `resend` |
| Password | the Resend API key — **paste into the dashboard only** |
| Sender email | `no-reply@<verified-domain>` |
| Sender name | `My Brain` |

Then **Authentication → Rate Limits → Emails sent per hour**: raise from `2` to
the value the owner signs (**§9**).

### 5.3 The trap that must not be sprung

> **Do NOT run `npx supabase config push`.**

It is **all-or-nothing**: it pushes the whole of `supabase/config.toml`, and
this repository's local config has `enable_signup = true` for local development.
Pushing it would **open public signup** as a side effect of configuring email —
the single worst outcome available in this whole rollout. Recorded from an
earlier session's near-miss; SMTP is configured **through the dashboard**, and
so are the rate limits.

---

## 6. Verification, after the owner's steps

Runnable from this repository, no new tooling.

1. **Readback — the fields are set.**
   `node scripts/hosted-auth-config.mjs | grep -E "^  smtp|rate_limit_email_sent"`
   → `smtp_host = "smtp.resend.com"`, `smtp_admin_email` set, `smtp_pass`
   `<redacted:present>`, `rate_limit_email_sent` at the signed value.
2. **The gate agrees.** `npm run rollout:verify` → **`RG-DEP-1` PASS**. It is a
   readback gate, so it moves on its own once the fields are set — no document
   needs writing to make it pass, unlike `RG-DEP-3`.
3. **A real delivery, on a disposable address.** Supabase → Authentication →
   Users → *Invite user*, or `POST /auth/v1/admin/generate_link` with
   `type: "recovery"`. Confirm arrival, and confirm the **From** header is the
   verified domain rather than a Supabase default.
4. **The redirect is honoured rather than silently rewritten.** Take the link
   from `admin/generate_link` with an explicit `redirect_to` of a value in
   `uri_allow_list`, and confirm the returned link's `redirect_to` is what was
   asked for. A disallowed value returns **200** and becomes `site_url` — the
   failure is invisible unless read this way. **No SMTP is needed for this
   check**, so it can be run before step 3.
5. **Recovery end to end** on the disposable account: request reset in the
   product, follow the mail, land on `/{locale}/auth/reset`, set a password,
   sign in. Both locales if any template is customised; none is today.
6. **Deliverability sanity.** Send to one Gmail and one Outlook address, and
   read the received headers for `spf=pass`, `dkim=pass`, `dmarc=pass`. A
   verified domain with a broken DMARC alignment still delivers to spam.
7. **Re-read the posture.** `disable_signup` must still be `true` and
   `security_captcha_enabled` still `true`. **Configuring email must not have
   moved either.**

---

## 7. Signup stays closed

`RG-DEP-1` going green moves the gate from **3 fail** to **2 fail**. It does not
open signup, and nothing in this document does.

The reason to say it this plainly: SMTP is the gate that *feels* like the
launch. It is the one whose completion produces a working signup funnel, so it
is the one most likely to be followed by "well, it works now". The rollout gate
is fail-closed and will still read `SIGNUP MUST NOT OPEN` with `RG-DEP-3`
failing and two owner signatures unsigned. **Opening signup is a separate,
explicit owner act, taken after the gate is fully satisfied — never as the last
step of configuring a mail provider.**

---

## 8. Status

| Item | State |
| --- | --- |
| Current hosted SMTP state | **inventoried, read live** |
| Provider decision | **Resend** — repository truth, not re-opened |
| Affected flows | **inventoried** — confirmation, recovery, email change |
| Redirect allow list | **already correct**, no change needed |
| Application code changes | **none required** |
| Migration required | **none** |
| `rate_limit_email_sent` new value | **owner signature** — recommendation 30/h, not signed here |
| Configuration steps | **written, exact** |
| Verification steps | **written, exact, runnable** |
| `config push` hazard | **recorded and forbidden** |
| **Blocker** | **an owner-controlled sending domain + its DNS records + a Resend credential** |

**Everything not dependent on the domain is finished.** The subtask stops
exactly at the DNS/credential boundary, and no other work was held behind it.

---

## 9. The one compact owner decision, surfaced after all independent work

Every part of the SMTP path that does not need a secret, a domain or a DNS
record is **finished**: the hosted state is inventoried, the provider decision
is repository truth and unchanged, the affected flows are enumerated, the
redirect allow list is verified correct, the dashboard settings are exact, the
`config push` hazard is recorded, and seven verification steps are written and
runnable.

**One product/security value remains, and it is a single decision.**

### The question

> **What should `rate_limit_email_sent` be after custom SMTP lands?**

It is **per hour, project-wide**. Today it is **2**, which is an artefact of
Supabase's shared default SMTP and not a chosen policy — recorded during SH.5
precisely so it would not be mistaken for one. **At 2/hour, public signup is
non-functional**, so this value must move with the cutover.

### Why it is a *signed* value rather than a configuration detail

It is the ceiling that bounds **email-based abuse of a public signup funnel** —
confirmation-mail flooding at a third party's address, and password-reset
harassment. Set too high it is not a control; set too low the product looks
broken to legitimate users, and the two failure modes are indistinguishable from
inside the product.

The application-side ceilings are **already independent of it by design**
(ADR-079: required parameters, no defaults, clamped by
`private.auth_event_ceiling_cap()`), so this number can change without a
migration. That is what makes it a decision rather than a schema change.

### The options, with the consequence of each

Resend's free tier is **100 emails/day** and **3 000/month**, which is the outer
bound on any value here.

| Value | Real signups/hour it supports | Consequence |
| --- | --- | --- |
| **2/h** (today) | ~2 | Status quo. Public signup **does not work**. Only viable while signup stays closed. |
| **10/h** | ~10 | Comfortable for invitation-scale rollout. A burst of invitees hits the ceiling and waits. Tightest control. |
| **30/h** | ~30 | Removes the blockage with headroom; still under the 100/day free tier even after a bad hour. **This was the earlier draft's suggestion and it is NOT adopted** — it is one option among these. |
| **100/h** | ~100 | Exhausts the daily free-tier allowance in one hour. Not recommended: a single abusive burst silences the product's email for the rest of the day. |

Each figure is *emails*, and one signup can cost more than one email
(confirmation, then a resend, then a password reset).

### What is needed to close it

One value, recorded. Then the cutover applies it in
**Authentication → Rate Limits → Emails sent per hour**, and §6 step 1's readback
confirms it.

**Until it is signed, nothing else in this document is blocked** — every other
step waits on the sending domain, its DNS records and the Resend credential
(§5.1), which are separate owner actions.

### `RG-DEP-1` is not complete

It is a readback gate on `smtp_host` and the related fields, all of which are
`null`. **No part of this document makes it pass**, and none should be read as
claiming otherwise.
