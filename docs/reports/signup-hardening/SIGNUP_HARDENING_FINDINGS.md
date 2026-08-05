# Signup Hardening — repository findings (the pre-planning census)

Date: **2026-08-02**. Measured at `main` = `b007ffa` (BYOK close), migration head `202608010069`,
working tree clean. This document is the evidence base for `docs/initiatives/signup-hardening/SIGNUP_HARDENING_PRD.md` and
`docs/initiatives/signup-hardening/SIGNUP_HARDENING_IMPLEMENTATION_PLAN.md`. Every claim below was measured against the
repository at that commit — nothing is inferred from memory of earlier phases. Where a claim
depends on hosted (dashboard) state rather than repository state, that is said explicitly, because
the two have already diverged once in this project's history (G05 attempt 1).

**How to read this:** §1–§10 are inventories. §11 is the list of defects and gaps the census found,
each with the requirement family that owns it. §12 is what this census could **not** measure.

---

## 1. Auth entry points — complete inventory

Five routes under `src/app/[locale]/auth/` plus one layout; five Server Actions in
`src/features/auth/actions.ts`; one proxy. There are no other auth surfaces.

| Surface | File | Provider call |
| --- | --- | --- |
| Login page | `src/app/[locale]/auth/login/page.tsx` | — (renders `signIn`) |
| Register page | `src/app/[locale]/auth/register/page.tsx` | — (renders `signUp`) |
| Recover page | `src/app/[locale]/auth/recover/page.tsx` | — (renders `recoverPassword`) |
| Reset page | `src/app/[locale]/auth/reset/page.tsx` | — (renders `updatePassword`) |
| Callback route | `src/app/[locale]/auth/callback/route.ts` | `exchangeCodeForSession` (`:21`) |
| `signIn` | `actions.ts:32` | `signInWithPassword` |
| `signOut` | `actions.ts:65` | `signOut` |
| `signUp` | `actions.ts:91` | `signUp` with `emailRedirectTo` (`:98-105`) |
| `recoverPassword` | `actions.ts:114` | `resetPasswordForEmail` with `redirectTo` (`:121-123`) |
| `updatePassword` | `actions.ts:132` | `getUser` + `updateUser({password})` + forced `signOut` |
| Session proxy | `src/proxy.ts` | `getClaims` (local) on every request; `getUser` (network) only to break the revoked-token redirect loop (`:85`) |

Facts that shape the initiative:

- **The register surface is fully live.** No application-level gate, invite check, feature flag or
  consent field exists between the form and `supabase.auth.signUp`. The only thing refusing
  signups today is the hosted `disable_signup: true` dashboard setting (G05). The register page
  renders the provider's refusal as the generic "We could not create the account" because
  `authProviderErrorCode` (`flow.ts:48-55`) does not map `signup_disabled`.
- **Password policy is app-side only.** `schema.ts:11-18` demands 12–128 chars with four character
  classes; `supabase/config.toml:182` sets `minimum_password_length = 6` with
  `password_requirements = ""`. Any client that bypasses the form (raw GoTrue call) gets the
  6-char policy. The hosted project's value was never read back.
- **No CAPTCHA exists anywhere** — 0 matches for `captcha|turnstile|hcaptcha|recaptcha` across
  `src/`, `e2e/`, `scripts/`; the `config.toml` captcha block is commented out.
- **No application-level throttle exists on any auth action.** The only throttles in the product
  are provider-side GoTrue limits (values unverified for the hosted project) and BYOK's
  credential-validation throttle, which covers exactly one operation.
- **Email confirmation** is required by the hosted project (`mailer_autoconfirm: false`, G05 §3)
  but **disabled locally** (`config.toml:226` `enable_confirmations = false`). Only the
  `?code` + `exchangeCodeForSession` flow exists; there is no `token_hash`/`verifyOtp` route in
  `src/`.
- **Enumeration posture is mixed.** Login is resistant (single `invalid-credentials` code for all
  failures). Recovery is resistant in copy ("if the account exists…") but distinguishable through
  `over_email_send_rate_limit` (mapped to its own message at `flow.ts:52`) and through timing
  (the send path is slower than the no-op path). **Register is not resistant** once signup opens:
  an existing address and a fresh one produce different outcomes (`actions.ts:107-111`) — today
  masked only by `signup_disabled`.
- **One real redirect-construction residual.** `requestOrigin()` (`actions.ts:28-30`) reads the
  untrusted `Origin` request header (falling back to `http://localhost:3000`) and uses it as the
  base for `emailRedirectTo` and `redirectTo`. A forged header produces a confirmation/recovery
  link pointing at an attacker host, contained **only** by the provider's server-side redirect
  allowlist — a dashboard setting whose contents G05 verified as *unchanged* but never recorded.
  In-repo redirect handling is otherwise sound: `safeAuthNext` (`flow.ts:57-63`) allowlists exactly
  three own-origin shapes, and the proxy constructs every redirect from literals.
- **The proxy fails open on missing configuration** (`proxy.ts:31`, tested as intentional at
  `proxy.test.ts:182-183`): absent Supabase env vars pass every request through unauthenticated.
  Defensible for local development; must be revisited before any shared deployment.
- **Session invalidation is self-service only.** Three signOut paths exist; there is no admin
  revocation, no sign-out-all-devices, no session listing. `jwt_expiry = 3600` (local config) means
  a revoked-but-unexpired access token can live up to an hour — the proxy's `getUser` branch
  exists precisely because this was hit once.

## 2. Account lifecycle — confirmed absent

- `public.profiles` has never been altered since creation: `user_id, display_name, avatar_path,
  locale, timezone, created_at, updated_at`. **No status/suspended/deleting/deleted_at/role/tier
  column exists on any user-level table.**
- `requireUser` (`src/lib/auth/require-user.ts`, 10 lines, 192 call references) knows exactly two
  states: user or redirect-to-login. It swallows the provider error field, so an outage is
  indistinguishable from signed-out.
- **No admin concept exists.** The only roles in all 69 migrations are `public`, `anon`,
  `authenticated`, `service_role`. No `is_admin`, no admin RPC, no admin surface.
- **No deletion path exists in product code.** `deleteUser`/`admin.deleteUser` appears only in e2e
  teardown and operator smoke scripts; two guards actively assert its absence from product code
  (`src/lib/closeout/phase-2f-cleanup.test.ts:274`, `src/lib/closeout/egc-operations.test.ts:248`).
  Any deletion design must either relocate its executor outside those guards' scan scope or amend
  the guards deliberately — never silently.
- **No legal surface exists.** Zero hits for terms/privacy/consent in `src/`, `e2e/`, `supabase/`;
  no `/terms` or `/privacy` route among the 32 routes; no consent field on the register form.
  `BYOK-COPY-002` references "the privacy policy" as a future artifact.

## 3. Table census — what deletion of an `auth.users` row does and does not remove

43 tables (42 `public`, 1 `private`). The full matrix is in the census record; the material
conclusions:

1. **Cascade coverage over rows is complete.** All 41 user-owned tables declare
   `user_id references auth.users(id) on delete cascade` — zero exceptions, zero plain columns.
   The two non-cascading tables (`ai_model_pricing`, `private.undo_operation_handlers`) hold no
   user data.
2. **The cascade has never been executed against a fully-populated account in a test.** 43
   composite owner FKs (`(user_id, ref_id) references parent(user_id, id)`, added by
   `202607170016:12-114` and successors) declare **no `on delete` action** (`NO ACTION`).
   Because every involved table also cascades from `auth.users` directly, deletion *should*
   succeed — but PostgreSQL evaluates NO-ACTION checks and cascade deletes from the same trigger
   queue, and none of the 41 pgTAP files exercises `delete from auth.users` against a row-complete
   fixture. The two production deletions that did run (G05 probe, `GENERATED_ACCOUNT_CLEANUP`)
   succeeded, but neither account had rows in the association tables that carry the composite FKs.
   **This is a pre-code gate, not an assumption.**
3. **What survives a user delete, measured:** (a) storage objects under `user-files/<uid>/…` —
   no cascade, no sweep, and six live orphans from 2026-07-16 prove it; (b) `cron.job_run_details`
   / `net._http_response` operational history (platform-side, no user content beyond ids);
   (c) nothing else in the database.
4. **`anon` holds zero privileges on all 43 tables and zero EXECUTE anywhere.** Every
   table-creating migration revokes it explicitly.
5. **`service_role` retains platform-default full DML on every public table except three**
   (`product_events`, `task_command_confirmations`, `private.undo_operation_handlers`). In
   particular it was **not** revoked from `user_ai_credentials` and
   `credential_validation_attempts` — `202608010065:205-206` revokes only
   `public, anon, authenticated`, and the migration's own postcondition checks only
   `anon`/`authenticated`. `service_role` can read ciphertext directly, bypassing both resolvers.
   Mitigated in depth (the master key is not in the database), but it is a boundary the resolvers
   were built to be the only crossing of.
6. **`authenticated` can still INSERT directly into `audit_logs`** (`202607170016:196` revoked
   only UPDATE/DELETE). The one remaining direct client write into an audit surface, already
   documented in `DATABASE.md:190`.
7. **`public.handle_new_user()`** — the `auth.users` trigger that seeds `profiles` +
   `agent_preferences` — is the one SECURITY DEFINER function in the chain without an explicit
   EXECUTE revoke (default PUBLIC EXECUTE stands; harmless today, untidy).

## 4. PostgREST-reachable surface

- **33 function signatures are EXECUTE-granted to `authenticated`** (the full table with grant
  sites is in the census record). All but three are `SECURITY DEFINER`; every DEFINER function in
  the chain pins `set search_path = ''` (asserted in-catalog by the BYOK migrations). Ownership is
  uniformly derived from `auth.uid()`; no reachable function accepts a caller-supplied `user_id`.
- **14 signatures are `service_role`-only**, including the three claim functions, the reaper, the
  heartbeats, `fail_job`/`fail_job_terminal`, `mark_entry_awaiting_ai_configuration`,
  `record_product_event_for_user`, and `resolve_job_ai_credential`.
- One function is deliberately executable by **nobody**: `prune_credential_validation_attempts`
  (runs as the pg_cron scheduler role only).
- `private` schema: no client role holds USAGE.
- Retirement precedent exists: `confirm_entry_tasks` lost `authenticated` EXECUTE at
  `202607250054:49` with its body retained — the pattern Signup Hardening should reuse for any
  future narrowing.

## 5. Edge Functions and dispatch

- **`process-jobs`**: `verify_jwt = false`; the function authenticates internally — dispatch mode
  requires the Vault-held `x-dispatch-secret`; direct mode requires a Bearer access token
  validated by `auth.getUser` and scopes the job lookup to `user_id = user.id`. An anonymous
  caller reaches the body and gets 401 on every path. **No rate limit, no request-size bound**
  (`request.json()` unbounded at `index.ts:58`).
- **`heartbeat`**: gateway JWT check (platform default) + `x-heartbeat-secret`. **Nothing invokes
  it** — `pg_cron` calls `run_all_heartbeats()` directly in SQL. A deployed, secret-bearing,
  consumer-less surface (version 8, untouched since 2026-07-16).
- **Four cron schedules exist**: hourly heartbeat (direct SQL), per-minute reaper (direct SQL),
  per-minute entry dispatch (pg_net + two Vault secrets, no-op until both exist), daily BYOK
  validation-attempt prune. No cron exists for any other retention.

## 6. Worker behavior for absent/abnormal users

- **The worker checks no account state because none exists.** The only per-user gate is BYOK's
  active-credential `exists` predicate in `claim_next_entry_interpretation_job`
  (`202608010069:197-204`).
- A user deleted mid-flight degrades cleanly: the entry reload (`entry.ts:471-478`,
  `.eq("user_id", job.user_id)`) misses and raises `subject_not_found`, a terminal code; the job
  row itself cascades away if still queued. No FK error is reachable.
- **`run_all_heartbeats()` iterates every `auth.users` row unfiltered**
  (`202607160008:11-15`). It ran hourly for three weeks on an abandoned account and would run
  forever on a suspended one. Any lifecycle state must be consumed here.
- The scheduled drain claims per the BYOK predicate; the **direct** invocation path
  (`claim_entry_interpretation_job`) deliberately carries no credential predicate — a lifecycle
  predicate added to one and not the other would repeat the asymmetry BYOK.4 documented, this time
  as a hole.

## 7. Storage

- One bucket, `user-files`, private, 25 MiB per file, 8 allowed MIME types, created at
  `202607160007:293-295`; four `storage.objects` policies keyed on
  `(storage.foldername(name))[1] = auth.uid()::text`, `to authenticated` only.
- Object keys are `<user_id>/<uuid>-<sanitized-name>` (`src/features/agent/actions.ts:593`), so
  **ownership is enumerable from the key prefix alone** — account deletion can list exactly one
  user's objects via prefix.
- `attachments.storage_path` is a bare unique `text` column — no FK to `storage.objects`, no
  constraint tying it to the `<uid>/` prefix. **This is the orphan mechanism**: the row cascades,
  the object stays.
- **The 25 MiB limit exists in three unlinked copies** (bucket, `attachments` CHECK, TS literal)
  and **the MIME allowlist in two** (bucket, TS array). Nothing keeps them converged.
- Signed URLs: two creation sites, both 600 s. One hands the URL to OpenAI as a file/image URL —
  a disclosure the privacy policy must state.
- **The six orphaned objects from 2026-07-16**: recorded in five documents; discovered by the BYOK
  fixture sweep; deliberately not deleted ("irreversible, and outside this initiative's scope");
  every phase cleanup verifier lists only its own fixture prefixes and none checks owner liveness.
  No storage-orphan scanner exists.

## 8. Quotas, limits and retention — what exists and what does not

Exists: per-file 25 MiB; capture content 1–12 000 chars; heartbeat notification display cap
(default 3/day — rows are inserted then dismissed, a display cap, not a creation cap); BYOK
validation 10/user/day + 30/IP/day with 30-day retention; dispatch bounds (25 jobs / 50 s per
invocation, leases 120 s/300 s); reaper 100/min; PostgREST `max_rows` 1000; job error text 500
chars; provider timeout 120 s.

Confirmed absent: entry-creation rate limit; per-user queued-job quota; per-user concurrent-job
cap (one user can occupy all 25 drain slots every minute); per-user storage quota (bytes or
object count); attachment-count limit; any retention for `jobs`, `notifications`,
`product_events` (a 180-day policy exists **as a table comment only**, `202607170024:59-60`),
`heartbeat_runs`, `audit_logs`, `ai_usage_events`, `entry_interpretations` versions,
`undo_operations` (a 24 h `expires_at` that is only ever read lazily); any Edge Function rate
limit or request-size cap; any account-creation quota.

The only real retention mechanism in the database is BYOK's 30-day validation-attempt prune.

## 9. Deployment, SMTP and domain posture

- **There is no shared Next.js hosting environment.** No deploy artifact of any kind exists;
  `.env.local` *is* the Next.js runtime configuration of the deployed environment; the census
  re-verified the absence (no `vercel.json`, `.vercel`, `netlify.toml`, `Dockerfile`, deploy
  workflow). Edge Functions were deployed manually.
- **Custom SMTP is the longest-standing pre-production dependency** (14+ documents), unresolved
  since Sprint 1.5. The hosted mailer's quota has been exhausted during testing before
  (`email_sent = 2/hour` in local config; hosted value unverified). Email confirmation +
  recovery + (future) policy-update notices all ride on it.
- `site_url` and `additional_redirect_urls` are loopback-shaped in local config; the hosted
  values were verified *unchanged* by G05 but never *recorded*. The redirect allowlist contents
  are an explicit readback gate for this initiative.
- CI runs three jobs (`app`, `worker`, `database`); the only e2e in CI is
  `foundation.spec.ts` + `task-command.spec.ts` (credential-free, desktop + Pixel 7). Every
  authenticated journey is credential-gated and manual. Remote smokes are manual.

## 10. Conventions the planning artifacts must honor

- Requirement IDs: `SH-<FAMILY>-NNN`, following the BYOK `| ID | Requirement |` family-table
  shape. **The `2G-` namespace is off-limits** — ADR-067's phase-start guard fails the build on a
  declared `2G-` requirement family.
- New ADRs start at **ADR-073** (`ADR-060` and `ADR-061` are each used twice in the ledger; any
  citation of those numbers must disambiguate by title).
- Migration budgets are declared per slice in the implementation plan, mirrored in the PRD, and
  changed only by owner ADR (`ADR-070` precedent). Every migration must update
  `AUTHORIZED_MIGRATION_HEAD` in `egc-invariants.test.ts` in the same commit.
- Docs-consistency tests assert on the real `STATE.md`/`TODO.md`/`CHANGELOG.md`: the
  `Active milestone:` line in `TODO.md` must keep naming Phase 2F; the ADR-055 expiry string
  `2026-10-27` must survive; the UX ledger counts must stay consistent across four documents;
  traceability matrices are generated, never hand-edited.
- The project-key guard scans `src`, `supabase/functions`, `scripts`, `e2e`, `.github` — not
  `docs/` — so documentation may name environment variables; code may not, outside the pinned
  allowlist.

## 11. Defects and gaps found by this census, with owners

Each row becomes one or more requirements in `docs/initiatives/signup-hardening/SIGNUP_HARDENING_PRD.md`; the family column is
the owner.

| # | Finding | Family |
| --- | --- | --- |
| F-01 | No account lifecycle state exists anywhere; `requireUser`, the proxy, every RPC, both workers and the heartbeat assume every `auth.users` row is a full citizen | SH-LIFECYCLE |
| F-02 | No deletion path exists; guards actively pin its absence from product code | SH-DELETE |
| F-03 | Storage objects survive account deletion (bare-text `storage_path`, no cascade, no sweep); six live orphans prove it | SH-STORAGE / SH-DELETE |
| F-04 | The `auth.users` cascade has never been executed against a row-complete fixture; 43 composite NO-ACTION FKs are in the path | SH-DELETE (pre-code gate) |
| F-05 | No suspension state, no admin boundary, no admin audit vocabulary | SH-SUSPEND / SH-ADMIN |
| F-06 | `run_all_heartbeats` iterates all users unfiltered; claim functions check credentials but no lifecycle | SH-WORKER |
| F-07 | Register surface fully live behind a dashboard-only closure; `signup_disabled` renders as a generic error | SH-SIGNUP |
| F-08 | No consent capture, no Terms, no Privacy Policy, no versioned acceptance | SH-LEGAL |
| F-09 | No CAPTCHA anywhere; provider block commented out | SH-CAPTCHA |
| F-10 | No app-level auth throttling; abuse evidence has no home table | SH-THROTTLE |
| F-11 | Register outcome enumerates existing addresses once signup opens; recovery enumerable via rate-limit code and timing | SH-THROTTLE |
| F-12 | `requestOrigin()` trusts the `Origin` header for auth-email link bases; the provider allowlist contents were never recorded | SH-SIGNUP |
| F-13 | Password policy is app-side only; provider minimum unverified (local default 6, no complexity) | SH-SIGNUP |
| F-14 | Email confirmation divergence: hosted requires it, local config does not; no `token_hash` fallback route | SH-SIGNUP |
| F-15 | No per-user quotas: entries, jobs, concurrency, storage bytes, attachment count | SH-QUOTA |
| F-16 | No retention anywhere except BYOK's 30-day prune; `product_events` 180-day policy is a comment; `undo_operations` expiry is never swept | SH-RETENTION |
| F-17 | `service_role` holds full DML on `user_ai_credentials` and `credential_validation_attempts`; BYOK postcondition checks only client roles | SH-EXPOSURE |
| F-18 | `authenticated` can INSERT `audit_logs` directly | SH-EXPOSURE |
| F-19 | `handle_new_user` retains default PUBLIC EXECUTE | SH-EXPOSURE |
| F-20 | `process-jobs` has no request-size bound and no rate limit; `heartbeat` is a deployed consumer-less surface | SH-EXPOSURE / SH-WORKER |
| F-21 | The proxy fails open on missing env configuration | SH-EXPOSURE |
| F-22 | 25 MiB limit ×3 and MIME allowlist ×2, unlinked | SH-QUOTA |
| F-23 | Session invalidation is self-service only; suspension needs a revocation story within the 1 h JWT window | SH-SUSPEND |
| F-24 | No SMTP; hosted mail quota unfit for production auth delivery | SH-ROLLOUT (deployment gate) |
| F-25 | Redirect allowlist, hosted password policy, hosted rate limits: all unverified-by-readback | SH-ROLLOUT (readback gates) |
| F-26 | No storage-orphan scanner; cleanup verifiers check only their own fixture prefixes | SH-STORAGE |
| F-27 | Deletion evidence precedent exists (`GENERATED_ACCOUNT_CLEANUP_EVIDENCE.md`) but is manual prose, not a repeatable instrument | SH-DELETE |

## 12. What this census could not measure

Named rather than glossed, in the house rule's spirit:

1. **Hosted Auth configuration beyond what G05 recorded.** The redirect allowlist contents,
   hosted password policy, hosted rate limits, hosted SMTP state and hosted JWT expiry were not
   read back by this census (no Management API access was attempted, consistent with G05's
   credential-hygiene rule). They are defined as readback gates, not assumed.
2. **Bulk-delete behavior of the composite NO-ACTION FKs** (§3.2) — needs an executed drill.
3. **Whether `service_role`'s platform-default grants differ on the hosted project** from the
   local replay in §3.5 — the local chain is authoritative for intent, the hosted catalog for
   fact; the drill in SH.0 reads the hosted catalog.
4. **`cron.job_run_details` / `net._http_response` retention on the hosted project** — platform
   defaults assumed (pg_cron keeps a bounded history), not verified.
