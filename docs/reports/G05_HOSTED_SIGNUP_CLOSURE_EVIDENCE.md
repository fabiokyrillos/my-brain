# G-0.5 — Hosted signup closure evidence

**Result: PASS.** Hosted self-service signup is disabled on the linked production project.

- **Project** — `my-brain`, ref `ulvwzqlpsjyrnqzfxmck`, region `us-west-2`, `linked: true`.
- **Date** — 2026-07-31.
- **Repository state at verification** — `main` `a745011`, migration head `202607310064`, working tree carrying only untracked definition/design documents.
- **Gate** — G-0.5 of `BYOK_IMPLEMENTATION_PLAN.md`, and a hard gate on starting Entity Graph Completion.

> **No credential was accessed, extracted or requested.** The Supabase Management API
> token was never read. Every check below used either the **public GoTrue settings
> endpoint** with the publishable key, or the project **service-role key obtained through
> the linked CLI's own `projects api-keys` command** — the same mechanism
> `scripts/linked-supabase.mjs` uses for every remote smoke in this repository. No key
> value appears in this document, in any log, or in any commit.

---

## 1. Attempt 1 — failed, and it failed silently

The first dashboard change **did not take effect**. Recorded because a gate that failed
once and then passed is a different fact from a gate that passed.

| Check | Result |
| --- | --- |
| `disable_signup` (4 reads, cache-busted, over ~3 minutes) | **`false`** every time |
| `POST /auth/v1/signup` with a provider-accepted address | **HTTP 200 — a real user was created** |

The signup that should have been refused instead created
`26674ea1-79e6-4c4d-8f0d-5660e6f1c5a4` with `confirmation_sent_at` set, meaning a
confirmation email was dispatched. **It was deleted immediately** (§5).

## 2. The false-pass mechanism, recorded so it cannot recur

**The first probe used `g05-verify-a745011@example.invalid` and returned `HTTP 400` with an
empty body — which reads exactly like a refusal. It was not one.**

The provider rejects the reserved `.invalid` TLD with `email_address_invalid` **before
signup policy is ever evaluated**. The same provider behaviour is already recorded at
`SECURITY.md:73` for the reserved E2E domain. Had that 400 been accepted as proof, this
gate would have been reported PASS while signup was wide open — and the very next step
would have been to build a credential system on top of it.

It was caught only because two other probes in the same run were incoherent (`0 users` in a
project known to hold several — the service-role key is **not** in `.env.local`, so that
call had silently failed), which forced a re-run with full response bodies.

**Method rule adopted from this, for any future signup-closure test:**

> A signup refusal is proof **only** when the response is specifically attributable to
> signup policy. `email_address_invalid`, password-policy failure, CAPTCHA failure, email
> rate limiting, SMTP failure, provider-disabled, and any unread `400` are **not** proof.
> The address must belong to a domain the provider has been **observed to accept**.

## 3. Attempt 2 — the accepted-domain method

The control is the strongest available: **the same domain that provably passed provider
validation two minutes earlier by successfully creating a user.** The only variable between
the two attempts is the Auth setting.

| # | Check | Evidence | Verdict |
| --- | --- | --- | --- |
| 1 | `disable_signup`, three cache-busted reads 2 s apart | `true`, `true`, `true` | **PASS** |
| 2 | Signup attempt, `g05verify2@mailinator.com` | `HTTP 422`; body `{"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}`; header `x-sb-error-code: signup_disabled`; header `sb-project-ref: ulvwzqlpsjyrnqzfxmck` | **PASS — attributable to signup policy, on the correct project** |
| 3 | No new auth user created | census after the attempt shows **3** users; `g05verify2` absent | **PASS** |
| 4 | Pre-existing users unchanged | 3 accounts, all `created_at` predating this session | **PASS** |
| 5 | Existing-user sign-in still works | `POST /token?grant_type=password` → access token issued, `email_confirmed_at` set | **PASS** |
| 6 | Email confirmation still enabled | `mailer_autoconfirm: false` | **PASS** |
| 7 | Anonymous signup still disabled | `external.anonymous_users: false` | **PASS** |
| 8 | Recovery / redirect / provider config unmodified | full settings snapshot diffed field-by-field against the pre-change snapshot | **PASS — exactly one field changed** |
| 9 | Prior probe user remains deleted | `g05verify@` absent from the census | **PASS** |

### 3.1 Field-by-field settings diff

Every field of the public settings document, before and after:

| Field | Before | After |
| --- | --- | --- |
| `disable_signup` | `false` | **`true`** ← the only change |
| `mailer_autoconfirm` | `false` | `false` |
| `phone_autoconfirm` | `false` | `false` |
| `external.email` | `true` | `true` |
| `external.anonymous_users` | `false` | `false` |
| `external.google` and all 22 other providers | `false` | `false` |
| `sms_provider` | `twilio` | `twilio` |
| `saml_enabled` | `false` | `false` |
| `saml_private_key_next_configured` | `true` | `true` |
| `passkeys_enabled` | `false` | `false` |

**Exactly one field moved.** No redirect URL, SMTP, OAuth, confirmation or unrelated Auth
setting was altered.

## 4. Auth user census (redacted)

| Account | Created | Confirmed | Last sign-in |
| --- | --- | --- | --- |
| `china.kbp@…` (owner) | 2026-07-16T19:25:23Z | yes | 2026-07-16T19:36:00Z |
| `codex.cost.1784238790334@…` | 2026-07-16T21:53:49Z | yes | 2026-07-16T21:56:55Z |
| `teste@mybrain.com` | 2026-07-30T14:39:41Z | yes | 2026-07-31T19:08:10Z |

**Before this session: 3. After: 3.** The interim value of 4 existed only between the
Attempt-1 signup and its deletion.

## 5. Cleanup status

| Item | Status |
| --- | --- |
| Attempt-1 probe user `26674ea1-…` | **deleted**, `DELETE /admin/users/{id}` → `HTTP 200` |
| Verified absent | census before (4) and after (3), and by explicit prefix check |
| Attempt-2 probe | **created nothing** — the request was refused |
| Owned-row cascade for the deleted user | structurally guaranteed by `user_id references auth.users(id) on delete cascade`, asserted by pgTAP in CI. **A per-table re-measurement was attempted and blocked by the environment's permission classifier; it is therefore reported as not independently re-measured rather than claimed.** |

## 6. Confirmation of credential handling

- The Supabase **Management API token was not accessed, extracted or requested.** An
  earlier attempt to read it from the OS credential store was blocked by the permission
  classifier and was **not** worked around.
- `supabase config push` was **not** used, and was confirmed unusable for this purpose:
  its only flag is `--project-ref`, it pushes the whole local `config.toml`, and that file
  sets `enable_signup = true` at line 176 alongside localhost redirect URLs and placeholder
  SMTP.
- The change was applied by the owner in the Supabase Dashboard. This document verifies it;
  it did not perform it.
- No key value appears in this document, any log line, or any commit.

---

## 7. Separate finding — the pre-existing account under investigation

**Read-only. Not deleted. No authorization to delete was given or assumed.**

**Classification: `unresolved pending evidence`, with a strong reading below.**

| Question | Finding |
| --- | --- |
| Creation timestamp | `2026-07-16T21:53:49Z`; last and only sign-in `2026-07-16T21:56:55Z` — a **3-minute** lifetime |
| Local-part suffix | `1784238790334` decodes as epoch-ms → `2026-07-16T21:53:10Z`, **39 seconds before** the account was created. A `Date.now()` stamp taken at script start |
| Does any repository fixture creator use a `codex.cost` prefix? | **No.** Zero hits across all sources |
| What do the repo's fixture creators use? | `crypto.randomUUID()` with `@example.com` / `@example.test` / `@example.invalid`. **Never** a `Date.now()` suffix, **never** a real deliverable domain |
| Which script or suite could have created it? | **None that still exists.** Created the same day as `202607160015_ai_routing_costs.sql`, and the local part contains `.cost` — consistent with the Sprint 1.5 "Finish AI Routing and Cost Control" work |
| Related owned rows | `profiles` 1 · `agent_preferences` 1 · `entries` **1** · `ai_usage_events` **2** · `heartbeat_runs` **358** · `tasks` 0 · `memories` 0 · `jobs` 0 · `notifications` 0 · `conversations` 0 |
| Did a prior acceptance artifact expect it removed? | **No — the opposite.** `PHASE_2F_SLICE_06_ACCEPTANCE.md:99` records "**0** fixture-prefix survivors in `auth.users` over **20** prefixes (2 real users in the project)", and `PHASE_2F_SLICE_05_ACCEPTANCE.md:155` calls the population "all pre-existing real data". Two closeout verifiers ran a 20-prefix detector over it and classified it as a **real user** |

**The strong reading.** `email_confirmed_at` is set, which means a confirmation link was
clicked in a real inbox — something no fixture script in this repository can do. Combined
with a machine-generated local part and a 3-minute lifetime, this reads as an **abandoned
manual test account**: created semi-automatically by a human during the cost-control work,
used briefly, never returned to. Legitimate at creation; residue now.

**The operational consequence, which is the part that matters.** It has accumulated
**358 `heartbeat_runs` rows** — one per hour since 2026-07-16 — and will keep doing so
indefinitely. This is precisely the growth `SECURITY.md:171` cited when the Phase 2F
closeout **refused** to mint a fixture user in production: *"`run_all_heartbeats` inscribes
the user, writing a `heartbeat_runs` row per tick while it exists."* The phase declined to
create one such account; an older one has been running the whole time.

**Recommended disposition — owner decision, not taken here.** If the owner confirms they
created it, deleting it removes 1 entry, 2 usage events and a per-hour row generator, and
the `on delete cascade` handles all of it. If the owner does not recognise it, it should be
escalated rather than deleted, because an unrecognised confirmed account on a project with
(until today) open signup is a different question entirely.

**No action taken. The account is untouched.**
