# Signup Hardening — PRD

Status: **Approved — owner approval 2026-08-04, recorded in `ADR-077` and Amendment `P-1`.**
Drafted 2026-08-02 as Proposed (that history stands). Drafted against `main` = `b007ffa`,
migration head `202608010069`, on the evidence in
`docs/reports/signup-hardening/SIGNUP_HARDENING_FINDINGS.md`. Authorized as an initiative by `ADR-068`; **nothing
in this document authorizes implementation** — the implementation plan's pre-code gates do that,
slice by slice.

This document is append-only once approved: factual corrections and scope changes are recorded as
numbered amendments (`P-1`, `P-2`, …), never edits, following the BYOK precedent.

---

## 1. Objective

Make the application safe for eventual self-service signup, by building the account lifecycle
(deletion, suspension), the legal surfaces (Terms, Privacy, versioned consent), the abuse
controls (CAPTCHA, throttling, quotas), the retention rules, and the fail-closed rollout
checklist that `ADR-068` requires — such that opening signup becomes **a checklist proven, never
a date chosen**.

Signup itself does **not** open in this initiative. `disable_signup` stays `true` on the hosted
project throughout; the final slice delivers the instrument that would prove readiness, not the
flip.

## 2. Scope boundaries

**In scope:** everything in §4–§19 below.

**Explicitly out of scope, named rather than implied:**

- **No operator dashboard, alerting, or credential-health view.** That is the operator-surface
  substance recorded against `BYOK-OPERATIONS`/`2F-OPERATIONS-002`, and it belongs to a
  dedicated Operations initiative aligned with Phase 2H (see plan §8). Signup Hardening builds
  the *administrative boundary* (suspension, deletion, audit) — not operations tooling on top of
  it.
- **No Phase 2G work.** Conversational Creation stays unauthorized (`ADR-067` signals guarded).
- **No hosting-platform selection, no deploy pipeline.** Those are Phase 2H. Where a control
  cannot be meaningfully final without a shared hosting environment (SMTP, production domain,
  CSP headers), this initiative defines the control, implements the repository half, and gates
  **rollout** — not its own slices — on the platform half.
- **No opening of self-service signup.** The rollout gate definition
  (`docs/reports/signup-hardening/SIGNUP_ROLLOUT_GATE_DEFINITION.md`) is the only path to that, and it is
  executed after this initiative closes, not by it.
- **No professional legal review.** The Terms and Privacy drafts are product documents written
  from repository truth; professional review before commercial launch is a named rollout gate
  this repository cannot self-satisfy.

## 3. Requirement families

`SH-LIFECYCLE` · `SH-DELETE` · `SH-SUSPEND` · `SH-ADMIN` · `SH-LEGAL` · `SH-SIGNUP` ·
`SH-CAPTCHA` · `SH-THROTTLE` · `SH-QUOTA` · `SH-RETENTION` · `SH-STORAGE` · `SH-EXPOSURE` ·
`SH-WORKER` · `SH-COPY` · `SH-ROLLOUT` · `SH-OPERATIONS`

**Requirement format.** Every requirement states one mechanically testable property. The columns
carry the metadata the initiative's quality rule demands:

- **Slice** — owning slice (`docs/SIGNUP_HARDENING_IMPLEMENTATION_PLAN.md`).
- **Mig** — `yes` if the requirement is expected to consume part of a migration, else `no`.
- **Boundary** — the trust boundary the requirement changes or defends: `db` (schema/RLS/grant/
  RPC), `edge` (Edge Function), `action` (Server Action/proxy), `ui`, `hosted` (dashboard/Auth
  config), `docs`, `ops` (operator script).
- **Flags** — `O` = requires an owner action; `S` = requires shared-environment execution to be
  claimable; `IRR` = irreversible once executed, or carries a rollback concern stated in the
  slice plan. Absence of a flag is a claim, not an omission.
- **Evidence** — the artifact class that proves it: `pgtap`, `unit` (Vitest), `deno` (worker
  test), `e2e` (Playwright), `journey` (authenticated online journey), `readback` (hosted config
  read back and recorded), `script` (executed verifier/census with transcript), `doc`.

---

## 4. SH-LIFECYCLE — the account state foundation

The product currently has no concept of an account that exists but must not act (FINDINGS §2).
Deletion and suspension both need one, and it must be enforced where the trust actually lives —
the database and the workers — not only in React.

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-LIFECYCLE-001** | A table `public.account_lifecycle` exists with exactly one row per user (`user_id` PK → `auth.users on delete cascade`), a closed `status` CHECK of `active`, `suspended`, `deleting`, and columns for `reason_code` (closed set), `changed_at`, `changed_by` (closed actor set), forced RLS. | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-002** | No client role can INSERT, UPDATE or DELETE `account_lifecycle`; `authenticated` can SELECT only its own row; `anon` holds nothing. Asserted by executed grant probes, not catalog reads alone. | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-003** | The row is created `active` by the same mechanism that seeds `profiles` (`handle_new_user`), so no account can exist without a lifecycle state; a backfill in the same migration covers every existing user, and the migration fails if any `auth.users` row ends without one. | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-004** | Every state transition writes an `audit_logs` row carrying actor, reason code, before and after state; transitions outside the declared machine (`active↔suspended`, `active→deleting`, `suspended→deleting`) are refused with a declared SQLSTATE. | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-005** | `capture_entry_async` and `enqueue_entry_reprocessing` refuse (declared error, no partial write) when the caller's lifecycle status is not `active`. | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-006** | Both entry-job claim paths (`claim_entry_interpretation_job` and `claim_next_entry_interpretation_job`) and `claim_attachment_job` refuse or skip jobs whose owner is not `active` — the same predicate in all three, so the direct path and the drain cannot disagree (the asymmetry `202608010069:137-145` documents for credentials must not be repeated as a hole). | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-007** | `run_user_heartbeat` skips a non-`active` user before any read of their data; `run_all_heartbeats` therefore does no work for them. | SH.1 | yes | db | — | pgtap |
| **SH-LIFECYCLE-008** | The authenticated app shell resolves the caller's lifecycle status server-side on every request path that renders product data; a non-`active` status renders the dedicated state surface (SH-COPY-002/003) and no product surface. Client-side state is never the enforcement point. | SH.1 | no | action | — | unit + e2e |
| **SH-LIFECYCLE-009** | A non-`active` user's Server Actions across every feature are refused server-side with the lifecycle refusal, not by UI absence alone — proven by calling actions directly, not by rendering. | SH.1 | no | action | — | unit |
| **SH-LIFECYCLE-010** | Sign-out remains available to a non-`active` user (the one action a suspended account may always take). | SH.1 | no | action | — | unit |

## 5. SH-DELETE — account deletion as a lifecycle, not a call

Design constraints from the census: rows cascade completely (FINDINGS §3.1); the cascade is
untested against a row-complete account (§3.2); storage objects do not cascade (§7); the deleting
executor must hold service-role capability yet no service-role client may enter `src/` product
code (two guards pin that); and the whole flow must stop rather than force when it meets
something it cannot classify.

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-DELETE-001** | A cascade drill exists in the CI database job: it builds a fixture user with at least one row in **every** user-owned table (enumerated at run time from the catalog, the `byok_residue.sql` pattern, so a future table joins the drill unasked), executes `delete from auth.users`, and asserts zero surviving rows across all of them. The drill fails by name on any table it could not populate. | SH.0 | no | db | — | pgtap |
| **SH-DELETE-002** | Deletion is requested only from an authenticated session through a dedicated surface that requires **recent re-authentication** (password re-entry validated server-side against the provider) plus a typed confirmation phrase; both checks are server-side. | SH.2 | no | action | — | unit + journey (S) |
| **SH-DELETE-003** | A successful request transitions the account to `deleting` via the lifecycle machine (SH-LIFECYCLE-004); from that instant every new write is refused (SH-LIFECYCLE-005/009) and no job claim can pick up the user's work (SH-LIFECYCLE-006). | SH.2 | no | db | — | pgtap |
| **SH-DELETE-004** | The deletion executor runs outside `src/` product code, authenticated as the requesting user (Bearer validated server-side) and authorized only for **that user's own account**; it accepts no target-account parameter from any caller. | SH.2 | no | edge | — | deno + pgtap |
| **SH-DELETE-005** | The executor is a resumable state machine with recorded steps: (1) verify `deleting` status; (2) enumerate and delete storage objects under exactly the `user-files/<uid>/` prefix; (3) verify zero objects remain under that prefix; (4) delete the `auth.users` row; (5) write the deletion record. A crash between any two steps is re-runnable to completion without skipping a verification. | SH.2 | no | edge | — | deno |
| **SH-DELETE-006** | Step (2) deletes **only** objects whose first path segment equals the deleting user's id; the executor refuses to proceed (declared stop, nothing deleted) if it encounters an object under the prefix that a live `attachments` row of a *different* user references. | SH.2 | no | edge | — | deno |
| **SH-DELETE-007** | The executor **stops rather than forces** on any unknown residue: a table with a `user_id` column not covered by the cascade census, or a storage object it cannot classify. Stopping leaves the account in `deleting` (writes still blocked) and records the reason; nothing retries destructively. | SH.2 | no | edge | — | deno |
| **SH-DELETE-008** | Before the `auth.users` delete, the user's `user_ai_credentials` row is verified `removed`-or-absent-or-cascading — deletion never leaves credential ciphertext behind, and never requires reading it. | SH.2 | no | edge | — | deno + pgtap |
| **SH-DELETE-009** | A deletion record survives in `public.account_deletion_log`: no `user_id` FK (the user is gone), no email, no display name — an opaque event id, timestamps per step, per-table row counts and object counts removed, and the requesting session's hashed identifier under the existing rate-limit pepper. Append-only; no client role writes it. | SH.2 | yes | db | — | pgtap |
| **SH-DELETE-010** | The deletion receipt shown to the user (and the final signed-out state) contains counts and timestamps only — no internal error text, no paths, no identifiers beyond the opaque event id. | SH.2 | no | ui | — | unit |
| **SH-DELETE-011** | A zero-residue verifier extends the `byok_residue.sql` pattern to the whole account: after the drill (and after every real deletion in acceptance), every runtime-enumerated user-owned table holds zero rows for the deleted id **and** the storage prefix lists zero objects — with positive calibration (rows and an object seen before) and a negative control (a second account's rows and objects survive). | SH.2 | no | db + script | — | pgtap + script |
| **SH-DELETE-012** | The end-to-end deletion journey is executed against the deployed environment on a disposable account that owns at least one row in every populatable surface and one storage object: request → re-auth → deleting → executor → zero residue → deletion record. | SH.2 | no | edge | S | journey + script |
| **SH-DELETE-013** | The two guards that pin `deleteUser`'s absence from product code still pass, and a new guard pins the executor as the **only** site holding deletion capability — the allowlist names exactly it, compared in both directions. | SH.2 | no | action | — | unit |
| **SH-DELETE-014** | Undo posture is stated in copy and enforced by construction: deletion is irreversible after the executor starts step (2); before that instant, a `deleting` account can be returned to `active` only by the admin boundary (SH-ADMIN), and that path is tested. | SH.2 | no | db | IRR | pgtap + unit |
| **SH-DELETE-015** | The six orphaned objects from 2026-07-16 are classified by an executed procedure: enumerate; verify each prefix uuid against `auth.users` (absent) and each path against `attachments` (no referencing row of any live user); record the manifest in the acceptance report; **deletion of the six is a separate owner-authorized step** executed only after the manifest is recorded, and refused for any object that fails either check. | SH.2 | no | ops | O + S + IRR | script + doc |
| **SH-DELETE-016** | Deleting the last account of a fixture never touches another account's storage: the negative control of SH-DELETE-011 runs with two users holding objects whose names collide except for the prefix. | SH.2 | no | db | — | pgtap + deno |

## 6. SH-SUSPEND — administrative suspension and reactivation

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-SUSPEND-001** | Suspension and reactivation are performed only through the admin boundary (SH-ADMIN); no PostgREST-reachable function and no Server Action can set `suspended`. | SH.3 | yes | db | — | pgtap |
| **SH-SUSPEND-002** | A suspended account cannot use the product: every product Server Action refuses (SH-LIFECYCLE-009), every product route renders only the suspended surface (SH-LIFECYCLE-008), and both facts are proven with a genuinely suspended fixture account, not a mock. | SH.3 | no | action | — | unit + e2e |
| **SH-SUSPEND-003** | Suspension takes effect against live sessions within one proxy round-trip — the app-shell lifecycle read (SH-LIFECYCLE-008) is per-request, so an already-issued JWT does not extend access beyond the next request. The JWT-lifetime residual is stated, not hidden: provider-side sign-in blocking is a separate, recorded operator step. | SH.3 | no | action | — | unit |
| **SH-SUSPEND-004** | A suspended user's queued jobs stay queued and unclaimed (SH-LIFECYCLE-006), are not failed, not deleted, and become claimable again on reactivation with no operator re-enqueue — proven by suspending an account with a pending job, observing the drain skip it, reactivating, observing completion. | SH.3 | no | db | — | pgtap |
| **SH-SUSPEND-005** | A suspended user receives no heartbeat notifications and no reminders while suspended (SH-LIFECYCLE-007); reminders whose `remind_at` passed during suspension do not fire retroactively as a burst on reactivation — the post-reactivation behavior is declared and tested. | SH.3 | yes | db | — | pgtap |
| **SH-SUSPEND-006** | Suspension changes no user data: a before/after census over the runtime-enumerated owned tables shows identical row counts through a suspend/reactivate cycle. | SH.3 | no | db | — | pgtap |
| **SH-SUSPEND-007** | Every suspension and reactivation writes the audit row of SH-LIFECYCLE-004 with `changed_by = 'operator'` and a reason code from the closed set; a free-text reason is refused by the database. | SH.3 | yes | db | — | pgtap |
| **SH-SUSPEND-008** | The suspended surface shows the SH-COPY-002 copy (localized, no internal detail, a contact path) and offers exactly sign-out. | SH.3 | no | ui | — | unit + e2e |
| **SH-SUSPEND-009** | Suspension is distinguishable from deletion and from throttling in code and copy: three distinct refusal vocabularies, none sharing a code, so no surface can render the wrong explanation. | SH.3 | no | db | — | unit |

## 7. SH-ADMIN — the administrative boundary

There is exactly one operator today, no hosting platform, and an established pattern of
operator scripts (`byok-rotate-master-key.mjs`). The admin boundary follows it — **no product
admin UI, no service-role HTTP endpoint** (ADR-075, proposed).

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-ADMIN-001** | Administrative lifecycle transitions are `service_role`-only SQL functions (`suspend_account`, `reactivate_account`, `begin_account_deletion_admin`) with `SECURITY DEFINER`, empty `search_path`, closed reason vocabulary, and the SH-LIFECYCLE-004 audit write — callable by no client role, asserted by executed grant probes. | SH.3 | yes | db | — | pgtap |
| **SH-ADMIN-002** | The operator surface is a `scripts/` CLI in the `byok-rotate-master-key.mjs` family: named account (by email or id), explicit `--suspend/--reactivate` verb, `--reason` from the closed set, a dry-run default and an explicit `--apply`, printing a before/after status readback and never printing user content. | SH.3 | no | ops | — | unit (script tests) + script |
| **SH-ADMIN-003** | No route, Server Action, or Edge Function accepts a service-role credential from configuration to perform admin actions; the guard that enforces "no service-role client in `src/`" keeps passing, and the admin scripts are pinned as the only `service_role` lifecycle callers by a both-directions allowlist test. | SH.3 | no | action | — | unit |
| **SH-ADMIN-004** | Every admin script invocation that mutates state appends to `audit_logs` through the SQL boundary (never a direct table write), so admin action without audit is structurally impossible rather than procedurally forbidden. | SH.3 | no | ops | — | pgtap |
| **SH-ADMIN-005** | The provider-side sign-in block (ban) for a suspended account is a **recorded operator step** in the admin runbook with an exact command and a readback, not an automated product path — because it requires the admin API key, which stays outside product code. | SH.3 | no | ops | O | doc + readback |
| **SH-ADMIN-006** | An admin runbook exists (`docs/reports/` family): suspension, reactivation, admin-initiated deletion-start, the six-orphan procedure, each with exact commands, expected readbacks and stop conditions — marked "written, not drilled" until each section's first execution is recorded. | SH.3 | no | docs | — | doc |

## 8. SH-LEGAL — Terms, Privacy, and versioned consent

Repository truth the documents must state (FINDINGS §7, §8; BYOK security definition): user
content is processed by OpenAI as an external provider; the backend decrypts user-supplied
provider credentials to make those calls; processing is asynchronous; the user bears their own
provider charges; cost figures are estimates from a price snapshot; signed URLs to user files are
handed to the provider; audit and usage ledgers are retained.

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-LEGAL-001** | Draft Terms of Service and Privacy Policy exist as versioned product documents in both locales, rendered at public routes (`/[locale]/legal/terms`, `/[locale]/legal/privacy`) reachable without authentication. | SH.4 | no | ui | — | e2e |
| **SH-LEGAL-002** | The Privacy Policy names, at minimum: the data categories stored (entries, interpretations, tasks, entities, files, usage ledgers, audit trail); OpenAI as an external processor receiving entry content, file-derived content and time-boxed signed file URLs; BYOK — the user's own provider key, encrypted at rest, decrypted server-side per call, never readable back; asynchronous processing; retention rules per data class (SH-RETENTION) including what deletion removes and what the deletion log retains; suspension enforcement; and the operator's identity and contact as named placeholders pending owner values. | SH.4 | no | docs | O | doc + unit (content pins) |
| **SH-LEGAL-003** | The Terms name, at minimum: account eligibility; acceptable use and abuse enforcement (suspension); user responsibility for their own OpenAI charges; the estimate-only nature of cost displays; service-provided-as-is during pre-launch; termination (user deletion and administrative suspension); and governing-law/contact placeholders pending owner values. | SH.4 | no | docs | O | doc + unit (content pins) |
| **SH-LEGAL-004** | Both documents carry a machine-readable version identifier; the current version is a single repository constant per document, and rendering, acceptance and enforcement all read that constant — two surfaces cannot disagree about the current version. | SH.4 | no | action | — | unit |
| **SH-LEGAL-005** | `public.policy_acceptances` records acceptance: `user_id` (cascade), document kind (closed set), version, accepted_at, acceptance surface (closed set). Append-only for clients: `authenticated` may INSERT own-row and SELECT own-row, never UPDATE or DELETE. | SH.4 | yes | db | — | pgtap |
| **SH-LEGAL-006** | Acceptance is recorded through a validated write path that refuses a version that is not the current constant, so a stale client cannot record acceptance of a superseded version. | SH.4 | yes | db | — | pgtap |
| **SH-LEGAL-007** | The signup form requires an explicit, unchecked-by-default consent control naming both documents with links; the Server Action refuses submission without it; the refusal is server-side (removing the checkbox client-side does not bypass it). | SH.4 | no | action | — | unit + e2e |
| **SH-LEGAL-008** | Acceptance rows are written at the first authenticated session (not trusted from the pre-session form): an authenticated account lacking an acceptance row for the current version of either document is interposed by a consent surface before any product route renders, and acceptance there writes the SH-LEGAL-005 row. This single mechanism covers new signups and future policy-version bumps identically. | SH.4 | no | action | — | unit + e2e |
| **SH-LEGAL-009** | Bumping a document's version constant re-interposes the consent surface for every account on next session, and the account's product access resumes only after the new version's row exists — proven by bumping a fixture constant in test. | SH.4 | no | action | — | unit |
| **SH-LEGAL-010** | Declining the updated terms is a real path: it offers sign-out and the deletion surface, and is recorded content-free. | SH.4 | no | ui | — | unit |
| **SH-LEGAL-011** | Consent state is never stored client-side only: clearing browser state changes nothing about enforcement (the gate reads `policy_acceptances`). | SH.4 | no | action | — | unit |
| **SH-LEGAL-012** | The legal routes and consent surface pass the repository's accessibility and locale gates (one `h1`, both locales, no stored-enum leakage, 44 px touch targets). | SH.4 | no | ui | — | e2e |
| **SH-LEGAL-013** | A "requires professional legal review before commercial launch" banner is part of both drafts and its removal is a named owner action recorded in the rollout gate — the drafts are usable product surfaces and honestly labeled. | SH.4 | no | docs | O | doc |
| **SH-LEGAL-014** | What deletion retains (the SH-DELETE-009 log fields, `ai_usage_events` of other users referencing nothing of the deleted one, and nothing else) is stated in the Privacy Policy in the same terms the residue verifier proves — the copy and the verifier cannot drift apart because a unit test pins the enumerated retention list to the policy text. | SH.4 | no | docs | — | unit |

## 9. SH-SIGNUP — signup, confirmation, recovery

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-SIGNUP-001** | An application-level signup gate exists and defaults **closed**: with the gate closed, the register action refuses before any provider call, with honest localized copy — the product no longer depends on the dashboard setting alone (defense in depth, both layers stay). | SH.5 | no | action | — | unit + e2e |
| **SH-SIGNUP-002** | `signup_disabled` is mapped to its own localized, honest message on the register surface (today it renders a generic failure). | SH.5 | no | ui | — | unit |
| **SH-SIGNUP-003** | Auth-email link bases derive from a server-side configured application origin, never from the request `Origin` header; `requestOrigin()`'s header read is removed. | SH.5 | no | action | — | unit |
| **SH-SIGNUP-004** | The hosted redirect allowlist and `site_url` are read back and recorded (exact values) before and after any change; the recorded allowlist contains only the configured application origin(s) — no wildcard, no localhost in production. | SH.5 | no | hosted | O + S | readback |
| **SH-SIGNUP-005** | Email confirmation is required for every new account: hosted `mailer_autoconfirm` stays `false` and confirmation-required is verified behaviorally (a fresh signup cannot sign in before confirming) — not only by config read. | SH.5 | no | hosted | O + S | readback + journey |
| **SH-SIGNUP-006** | Local `supabase/config.toml` auth posture converges with the enforced posture (confirmations on, minimum password length ≥ 12) so CI and local dev exercise what production enforces; divergences that must remain are documented inline. | SH.5 | no | db | — | unit (config pin) |
| **SH-SIGNUP-007** | The hosted password policy is raised to the app policy (≥ 12, character classes as supported) and read back; the app-side Zod policy stays as the first line. | SH.5 | no | hosted | O + S | readback |
| **SH-SIGNUP-008** | An unconfirmed account that requests a fresh confirmation email is served by a dedicated resend surface with its own throttle (SH-THROTTLE), not by re-registering. | SH.5 | no | action | — | unit |
| **SH-SIGNUP-009** | Recovery keeps working end-to-end after every change in this family, proven by the existing recovery journey re-executed against the deployed environment. | SH.5 | no | action | S | journey |
| **SH-SIGNUP-010** | The callback route rejects a `next` value outside the `safeAuthNext` allowlist (existing behavior, pinned) and the allowlist itself is asserted to contain only own-origin shapes — a regression test guards the guard. | SH.5 | no | action | — | unit |
| **SH-SIGNUP-011** | Register, recover and resend responses are enumeration-uniform: identical outcome copy and identical response class for existing vs. unknown addresses, with the rate-limit refusal shared across both branches (an attacker cannot distinguish "throttled because exists" from "throttled"). Residual timing variance is measured once and recorded, not claimed away. | SH.5 | no | action | — | unit + doc |
| **SH-SIGNUP-012** | Session fixation posture is verified: `exchangeCodeForSession` issues a fresh session, sign-in does not reuse a pre-auth anonymous session identifier, and the recovery flow's forced sign-out (existing) is pinned by test. | SH.5 | no | action | — | unit |
| **SH-SIGNUP-013** | Disposable-email posture is a recorded decision, not silence: v1 accepts them (no list dependency), and the abuse ledger (SH-THROTTLE-002) records the address domain hash so a later posture change has data. | SH.5 | no | action | — | doc + unit |

## 10. SH-CAPTCHA

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-CAPTCHA-001** | The CAPTCHA provider is chosen by accepted ADR (ADR-076 proposes Cloudflare Turnstile as one of GoTrue's two natively supported providers) before any integration code is written. | SH.0 | no | docs | O | doc |
| **SH-CAPTCHA-002** | CAPTCHA is enforced by the **provider** (GoTrue `security.captcha`), so a raw API signup/recovery call without a valid token fails — UI-only enforcement is structurally impossible. Verified behaviorally against the deployed project with a missing and an invalid token. | SH.5 | no | hosted | O + S | readback + script |
| **SH-CAPTCHA-003** | The register, recover and resend forms carry the widget and pass `captchaToken` through the existing Server Actions; a failed token renders honest localized copy distinct from credential errors. | SH.5 | no | action | — | unit + e2e |
| **SH-CAPTCHA-004** | The widget's script origin is the only new external origin the auth pages load, and it is absent from every authenticated product route — asserted, not assumed. | SH.5 | no | ui | — | unit |
| **SH-CAPTCHA-005** | Local dev and CI run with CAPTCHA disabled by config divergence that is documented inline; the e2e that proves enforcement is the deployed-environment script of SH-CAPTCHA-002, so CI green never claims the hosted control. | SH.5 | no | docs | — | doc |

## 11. SH-THROTTLE — authentication abuse controls

The BYOK validation throttle (`202608010067`) is the pattern: attempts tabled, ceilings enforced
under advisory locks in the database, IP as HMAC under the dedicated rate-limit pepper, bounded
retention, scheduler-only prune.

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-THROTTLE-001** | `public.auth_event_attempts` records signup, sign-in failure, recovery and resend attempts: closed `kind` set, `ip_hash` (same canonicalization and pepper contract as `BYOK-SCHEMA-010…015`), a normalized-identifier hash (never the address), `attempted_at`, `outcome` from a closed set. No raw address, no raw IP, no free text — CHECK-enforced shapes. | SH.5 | yes | db | — | pgtap |
| **SH-THROTTLE-002** | Ceilings are enforced in the database under advisory locks (the `claim_credential_validation_slot` pattern): per-identifier and per-IP daily ceilings for signup and recovery, per-identifier failure ceilings for sign-in, with defaults declared in the plan and changeable without migration. Two concurrent attempts at the boundary admit exactly one — proven with genuine concurrency, not sequential calls. | SH.5 | yes | db | — | pgtap + script |
| **SH-THROTTLE-003** | The Server Actions consult the throttle **before** the provider call, and a throttled refusal is byte-identical in copy and shape for existing and unknown identifiers (SH-SIGNUP-011). | SH.5 | no | action | — | unit |
| **SH-THROTTLE-004** | Retention for `auth_event_attempts` is 30 days, swept by the same scheduler-only prune pattern as BYOK's; the sweep function is executable by no role. | SH.5 | yes | db | — | pgtap |
| **SH-THROTTLE-005** | Provider-side GoTrue rate limits for the hosted project are read back and recorded; the application ceilings are set at or below them so the app-level refusal, with its uniform copy, fires first. | SH.5 | no | hosted | O + S | readback |
| **SH-THROTTLE-006** | The throttle cannot lock the owner out of an owned account by identifier-stuffing alone: sign-in failure ceilings scope to identifier+IP pairs, and the recorded recovery path (email) remains available at its own ceiling — the design is written down and its lockout matrix tested. | SH.5 | no | db | — | pgtap |
| **SH-THROTTLE-007** | Nothing in the throttle path logs, returns or stores the plaintext identifier of a *non-existing* account beyond its hash — the abuse ledger cannot become a directory of guessed addresses. | SH.5 | no | db | — | unit + pgtap |

## 12. SH-QUOTA — infrastructure quotas

`ADR-068` re-scoped C1: under BYOK the user pays the provider, so the protective control is
infrastructure quotas. Ceiling values are declared in the plan (owner-adjustable without
migration); the requirements below fix the mechanisms.

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-QUOTA-001** | Entry creation is quota-bounded per user per UTC day inside `capture_entry_async` (count-based, same-transaction, concurrency-safe); the refusal is a declared code, stores nothing, and surfaces as honest localized copy. | SH.6 | yes | db | — | pgtap |
| **SH-QUOTA-002** | Queued-work quota: a per-user ceiling on live (`pending`/`failed`/`running`) `jobs` rows, enforced where jobs are enqueued (capture, reprocess, upload), refusing with a declared code. | SH.6 | yes | db | — | pgtap |
| **SH-QUOTA-003** | Per-user concurrency: the scheduled drain claims at most N jobs per owner per invocation, so one user cannot occupy all 25 slots every minute; fairness is proven with a two-user fixture where both make progress. | SH.6 | yes | db | — | pgtap |
| **SH-QUOTA-004** | Storage quota: per-user total-bytes and object-count ceilings enforced at upload time from `attachments` aggregates in the same validated path; refusal precedes the storage write, so a refused upload leaves no object. | SH.6 | no | action | — | unit |
| **SH-QUOTA-005** | Attachment-count-per-entry and per-day ceilings exist alongside the size limit. | SH.6 | no | action | — | unit |
| **SH-QUOTA-006** | The 25 MiB size limit and the MIME allowlist each have exactly one source of truth in TypeScript, and a contract test compares the bucket definition, the CHECK constraint and the TS constant so the three existing copies cannot drift (FINDINGS F-22). | SH.6 | no | action | — | unit |
| **SH-QUOTA-007** | Chat/AI request input bounds: every AI-bound Server Action enforces its declared max input size server-side (capture's 12 000 exists; chat and file paths get declared bounds), pinned by tests naming each bound. | SH.6 | no | action | — | unit |
| **SH-QUOTA-008** | `process-jobs` bounds its request body size and refuses oversized payloads before JSON parse (FINDINGS F-20). | SH.6 | no | edge | — | deno |
| **SH-QUOTA-009** | Quota refusals are distinguishable from throttle refusals and lifecycle refusals (three vocabularies, SH-SUSPEND-009) and every quota refusal is content-free in logs and product events. | SH.6 | no | action | — | unit |
| **SH-QUOTA-010** | Quota ceilings are declared in one constants module consumed by both the database defaults (as migration parameters) and the copy layer, with a parity test — no page can state a ceiling the database does not enforce. | SH.6 | no | action | — | unit |

## 13. SH-RETENTION — retention and deletion rules

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-RETENTION-001** | A single retention schedule exists as a repository document (plan §7 table): per data class — jobs, notifications, product_events, heartbeat_runs, undo_operations, auth_event_attempts, credential_validation_attempts, audit_logs, ai_usage_events, interpretation versions — stating the rule, the mechanism, and *why* the retained classes are retained. Owner-accepted before SH.6 implements it. | SH.0 | no | docs | O | doc |
| **SH-RETENTION-002** | `product_events` gets its documented 180-day purge: scheduler-only sweep in the BYOK-prune pattern, with the table comment's promise and the implementation now agreeing (FINDINGS F-16). | SH.6 | yes | db | — | pgtap |
| **SH-RETENTION-003** | Terminal `jobs` rows (`completed`/`exhausted`/`cancelled`) are pruned after the declared window; live rows are never touched; the sweep is scheduler-only and bounded per invocation. | SH.6 | yes | db | — | pgtap |
| **SH-RETENTION-004** | `notifications` and `heartbeat_runs` are pruned after their declared windows by the same pattern. | SH.6 | yes | db | — | pgtap |
| **SH-RETENTION-005** | `undo_operations` rows are pruned only after both: past `expires_at` **and** past the declared retention window — the lazy-expiry contract of `undo_operation` is unchanged. | SH.6 | yes | db | — | pgtap |
| **SH-RETENTION-006** | `audit_logs` and `ai_usage_events` are declared **retained** (no purge) with the reason recorded (audit integrity; billing reconciliation) and the Privacy Policy stating both (SH-LEGAL-014). | SH.6 | no | docs | — | doc + unit |
| **SH-RETENTION-007** | Every purge function is scheduler-only (executable by no role), bounded per invocation, and reports its deleted count to `cron.job_run_details` via return value — the BYOK prune shape, asserted per function. | SH.6 | yes | db | — | pgtap |
| **SH-RETENTION-008** | Every new purge ships with a dry-run: the same predicate as a count-only function executable by the operator script, whose output is recorded before the first live run against the shared environment. | SH.6 | yes | db | O + S + IRR | script + doc |
| **SH-RETENTION-009** | A purge boundary test per class proves the sweep takes rows strictly older than the window and leaves the newest in-window row — off-by-one in both directions. | SH.6 | no | db | — | pgtap |
| **SH-RETENTION-010** | Restoration limits are stated: purged rows are unrecoverable; the retention document says which product surfaces lose history at each window (Jobs page, notifications history) and the copy on those surfaces does not promise longer memory than retention grants. | SH.6 | no | docs | — | doc + unit |

## 14. SH-STORAGE — storage hygiene beyond deletion

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-STORAGE-001** | A storage-orphan scanner exists in the `verify-*-cleanup.mjs` family: lists every object in `user-files`, resolves each first path segment against `auth.users` and each full path against `attachments`, and reports (never deletes) orphans by class — absent owner, or absent attachment row. | SH.2 | no | ops | — | unit (script tests) + script |
| **SH-STORAGE-002** | The scanner runs in every future deletion acceptance and in the rollout gate; a non-zero orphan count with an unrecorded manifest fails the gate. | SH.7 | no | ops | S | script |
| **SH-STORAGE-003** | Abandoned-upload cleanup: an object whose upload succeeded but whose `attachments` insert failed is already compensated inline; the scanner's absent-attachment-row class is the detector for the residue of that compensation itself failing, and the runbook records the manual remediation for it. | SH.2 | no | ops | — | doc + script |
| **SH-STORAGE-004** | Signed URL duration stays ≤ 600 s and gains a single named constant with a test pinning both call sites (FINDINGS §7). | SH.6 | no | action | — | unit |
| **SH-STORAGE-005** | The bucket remains private with the four own-prefix policies; the rollout gate re-asserts `public = false` and the policy set by readback against the deployed project. | SH.7 | no | hosted | S | readback |
| **SH-STORAGE-006** | Malware/content-scanning posture is a recorded decision: v1 does not scan (the census records no scanner and no isolation worker); the MIME allowlist, size caps and private-bucket posture are the compensating controls, and `SECURITY.md`'s existing "detecção de assinatura real de arquivos" line stays an open pre-production item owned by the rollout gate, not silently satisfied. | SH.0 | no | docs | — | doc |

## 15. SH-EXPOSURE — privileged-boundary closures

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-EXPOSURE-001** | `service_role` loses table-level DML on `user_ai_credentials` and `credential_validation_attempts` (the resolvers and throttle RPCs are DEFINER and keep working); the revoke is asserted by executed probes both before (grant seen) and after (refused), so the assertion is non-vacuous. | SH.6 | yes | db | — | pgtap |
| **SH-EXPOSURE-002** | A census test enumerates, for every public table, which of the four roles holds which DML — and pins the full matrix, so any future grant drift fails by name (extends the BYOK postcondition pattern to the whole schema, covering `service_role` this time). | SH.6 | no | db | — | pgtap |
| **SH-EXPOSURE-003** | The direct `authenticated` INSERT on `audit_logs` is dispositioned by decision, not silence: either revoked (with every in-app direct writer moved behind an RPC in the same slice) or retained with the writer inventory recorded — ADR-scoped, executed as decided. | SH.6 | yes | db | — | pgtap + doc |
| **SH-EXPOSURE-004** | `handle_new_user` gets an explicit EXECUTE revoke from all client roles (trigger execution is unaffected). | SH.1 | yes | db | — | pgtap |
| **SH-EXPOSURE-005** | The deployed `heartbeat` Edge Function is dispositioned: undeployed (nothing calls it) or documented as retained with its secret rotated — recorded with a readback either way. | SH.6 | no | hosted | O + S | readback + doc |
| **SH-EXPOSURE-006** | The proxy's fail-open on missing env configuration is bounded to development: a production-mode build with absent Supabase configuration refuses requests to `app/` routes rather than passing them through. | SH.6 | no | action | — | unit |
| **SH-EXPOSURE-007** | The PostgREST-reachable surface after all SH migrations is re-censused (the §4 method) and the delta against FINDINGS §4 is exactly the set this PRD declares — no accidental exposure rode along. | SH.7 | no | db | — | pgtap + doc |
| **SH-EXPOSURE-008** | Every new SECURITY DEFINER function in this initiative carries the catalog assertions BYOK's migrations established (definer, empty search_path, exact grant set) in its own migration's postcondition block. | all | yes | db | — | pgtap |

## 16. SH-WORKER — worker behavior under the new lifecycle

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-WORKER-001** | A job claimed before a suspension and executing after it fails closed: every handler re-verifies lifecycle at its ownership reload, and a non-`active` owner yields a declared, non-terminal outcome that returns the job to the queue for post-reactivation completion (vocabulary member, no retry burned beyond the claim's own). | SH.3 | yes | db + edge | — | pgtap + deno |
| **SH-WORKER-002** | A job whose owner is `deleting` or absent at execution fails terminally with the existing `subject_not_found`/declared code and schedules nothing (existing behavior for absent, extended to `deleting`, pinned). | SH.2 | no | edge | — | deno |
| **SH-WORKER-003** | The dispatch drain's owner-eligibility predicate (credential + lifecycle) is asserted identical across the claim paths by a SQL-reachability test, the pattern that already guards the command surfaces. | SH.1 | no | db | — | unit |
| **SH-WORKER-004** | Worker suspension enforcement is executed against the deployed environment: suspend a disposable account with a queued job, observe the drain skip it across two ticks, reactivate, observe completion. | SH.3 | no | edge | S | script |
| **SH-WORKER-005** | The heartbeat skip (SH-LIFECYCLE-007) is likewise executed against the deployed environment on a disposable suspended account across one hourly tick. | SH.3 | no | db | S | script |

## 17. SH-COPY — user-facing truth

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-COPY-001** | Every new user-facing string in this initiative ships through typed feature `copy.ts` modules in both locales; the locale-ternary ceiling (266) does not rise. | all | no | ui | — | unit |
| **SH-COPY-002** | The suspended surface states: the account is suspended, data is intact, the contact path, and nothing about why beyond the closed reason's public label — no internal codes, no operator identity leakage. | SH.3 | no | ui | — | unit |
| **SH-COPY-003** | The deletion surface states irreversibility, what is removed, what the deletion log retains (mirroring SH-LEGAL-014), and the expected timeline — before the confirmation control is enabled. | SH.2 | no | ui | — | unit |
| **SH-COPY-004** | Refusal copy for lifecycle, throttle and quota refusals is distinct, localized, and free of provider/internal error text — pinned per vocabulary. | SH.5/6 | no | ui | — | unit |
| **SH-COPY-005** | The register surface under a closed gate states the product is not accepting signups — honest closed-state copy replacing today's generic failure (SH-SIGNUP-002). | SH.5 | no | ui | — | unit |
| **SH-COPY-006** | No surface promises data behavior the retention schedule contradicts (SH-RETENTION-010) — asserted by the same content-pin tests. | SH.6 | no | ui | — | unit |

## 18. SH-ROLLOUT — verification and the gate

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-ROLLOUT-001** | `docs/reports/signup-hardening/SIGNUP_ROLLOUT_GATE_DEFINITION.md` defines every gate with: the property, the exact readback or artifact that proves it, and the failure rule. **A missing artifact or unreadable configuration fails the gate** — absence is failure, never skip. | SH.0 | no | docs | — | doc |
| **SH-ROLLOUT-002** | A gate-verification script (`scripts/verify-signup-rollout.mjs` family) executes every machine-checkable gate: artifact presence, hosted config readbacks, residue scanner, deployed-behavior probes — and exits non-zero on the first unprovable gate, printing gate names and no secrets. | SH.7 | no | ops | — | unit (script tests) + script |
| **SH-ROLLOUT-003** | The synthetic end-to-end journey exists and is executed at rollout time: signup (gate open in a controlled window or via admin-created account until then) → confirm → accept terms → capture with BYOK key → process → delete account → zero residue including storage. Its transcript is a required gate artifact. | SH.7 | no | ops | O + S | script + journey |
| **SH-ROLLOUT-004** | The gate list includes every item in the plan's §6 rollout register (BYOK still closed and green; no project-key fallback; deletion executed; suspension executed; worker enforcement executed; legal + consent enforced; confirmation, CAPTCHA, throttles, quotas active; PostgREST and Edge reviews recorded; redirects verified; SMTP/domain ready; backup/restore verified; monitoring adequate; production smoke green). The script and the document enumerate the same set — a parity test compares them. | SH.7 | no | ops | — | unit |
| **SH-ROLLOUT-005** | Opening signup is executable only as: every gate green in one run of SH-ROLLOUT-002, then the owner flips `disable_signup`, then the same script re-runs green against the open state (CAPTCHA and throttles now observable live). Both transcripts are recorded. **No manual-confidence path exists in the document.** | post-SH | no | hosted | O + S + IRR | script + doc |
| **SH-ROLLOUT-006** | Backup/restore verification is a named owner gate: a restore of the hosted project's backup to a disposable project is executed and its transcript recorded before deletion or purges run against production (deployment gate), and again within the rollout window (rollout gate). | SH.0/SH.7 | no | ops | O + S | doc + script |

## 19. SH-OPERATIONS — initiative closeout

| ID | Requirement | Slice | Mig | Boundary | Flags | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **SH-OPERATIONS-001** | A fail-closed traceability generator (`scripts/generate-signup-hardening-traceability.mjs` + npm script) parses this PRD's family tables, resolves every artifact on disk, and fails on drift — the 2F/EGC pattern. | SH.7 | no | ops | — | unit + script |
| **SH-OPERATIONS-002** | Every slice merges through the standing discipline: own branch, thematic commits, PR-head CI green on all three jobs, exact merge-SHA CI green, preserved branch, acceptance report. | all | no | docs | — | doc |
| **SH-OPERATIONS-003** | An adversarial review runs per slice with findings fixed or recorded, never argued down; the plan's §9 review attacks are the floor, not the ceiling. | all | no | docs | — | doc |
| **SH-OPERATIONS-004** | `SECURITY.md`, `DATABASE.md`, `ARCHITECTURE.md`, `STATE.md`, `TODO.md`, `CHANGELOG.md` are updated at each slice boundary; the docs-consistency suites stay green throughout. | all | no | docs | — | unit |
| **SH-OPERATIONS-005** | The initiative's final report accounts for every requirement id (delivered / deferred-with-destination / not-delivered-and-named), and the rollout gate definition is re-generated against the final state. | SH.7 | no | docs | — | doc |
| **SH-OPERATIONS-006** | The residue verifier suite (SH-DELETE-011, SH-STORAGE-001) runs in CI from this initiative onward, so account-deletion residue becomes a permanently guarded property, not a one-time proof. | SH.2 | no | db | — | pgtap |

---

## 20. Quota and retention values — proposed defaults

Declared here for one place to argue with; enforced values live in the SH-QUOTA-010 constants
module; changing them is a constants change, not a migration. **Owner sign-off on this table is a
pre-code gate for SH.6.**

| Control | Proposed default | Rationale |
| --- | --- | --- |
| Entries per user per day | 300 | ~10× observed owner peak; bounds interpret-job fan-out |
| Live jobs per user | 50 | queue fairness; a full day's captures can still queue |
| Drain claims per owner per invocation | 5 of 25 | five owners make progress per tick worst-case |
| Storage per user | 500 MiB / 200 objects | 20 max-size files; pre-pilot posture |
| Attachments per entry / per day | 5 / 50 | matches existing UI affordances |
| Signup per IP per day | 5 | household-friendly, bot-hostile |
| Recovery per identifier per day / per IP per day | 5 / 15 | provider quota protection |
| Sign-in failures per identifier+IP per hour | 10 | below provider lockouts; uniform-copy refusal |
| Resend-confirmation per identifier per day | 3 | 2/h provider mail budget reality |
| `jobs` terminal retention | 90 days | Jobs page history window |
| `notifications` retention | 180 days | matches product_events |
| `product_events` retention | 180 days | the documented promise, implemented |
| `heartbeat_runs` retention | 30 days | operational telemetry only |
| `undo_operations` retention | 30 days past expiry | expiry is 24 h; generous margin |
| `auth_event_attempts` retention | 30 days | matches BYOK attempts |
| `audit_logs`, `ai_usage_events`, interpretation versions | retained | audit integrity; billing; product history — disclosed in Privacy Policy |

## 21. Amendments

Amendments are numbered `P-1`, `P-2`, … and append-only.

### P-1 — Owner approval of the package and the §20 value sheet (2026-08-04)

The owner approved this PRD, the implementation plan, the findings, the threat model, the
rollout gate definition, ADR-073…ADR-076, the eight-migration budget, and the SH.0–SH.7
sequence — recorded in `ADR-077`, which reproduces the approved quota and retention values
in full. Consequences for this document:

- **SH-G0.4 is satisfied**: the §20 quota/retention table is owner-signed **as proposed** —
  no value changed between proposal and approval. The values are repository constants under
  the SH-QUOTA-010 parity contract; changing one later is a constants change plus an
  amendment here, never a migration.
- **SH-CAPTCHA-001 is satisfied**: Cloudflare Turnstile, per ADR-076, now Accepted.
- **SH-RETENTION-001 is owner-accepted**; approval of the schedule is **not** authorization
  to execute a production purge (SH-RETENTION-008's dry-run/transcript/owner-authorization
  chain stands for every destructive sweep).
- **SH-STORAGE-006 is a recorded decision**: no malware scanner in v1, compensating
  controls declared, the rollout-gate open item retained.
- The status header flips to Approved; nothing else in §1–§20 is edited.
