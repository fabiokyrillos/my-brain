# Signup Hardening — SH.3 acceptance record

Slice: **SH.3 — suspension and the administrative boundary.** Branch
`codex/sh-slice-3`, from `main` at `497aa36` (the SH.2 handoff merge).
**Migrations: 1** — `202608040073` — exactly the plan §1 allocation; head
`202608040072` → `202608040073`, with `AUTHORIZED_MIGRATION_HEAD` moved in the
same change. Four of the initiative's eight migrations are now spent.

## 1. What exists now that did not

- **The administrative boundary, as SQL** (`202608040073`). `suspend_account`,
  `reactivate_account` and `begin_account_deletion_admin` — `SECURITY DEFINER`,
  empty `search_path`, `execute` granted to `service_role` and revoked from
  every client role, each validating its reason against a **per-verb** closed
  set and writing through the SH.1 machine so the audit row is unconditional.
  Plus `admin_account_lifecycle_status`, the readback that resolves an account
  by id **or email** (the resolution needs `auth.users`, which PostgREST does
  not expose) and returns a status, a reason, an actor and a timestamp — no
  email, no display name, no product data.
- **The reasons are not interchangeable words.** `reactivate_account` validates
  the reason **against the current status**: `operator_reactivation` from
  `suspended`, `deletion_reverted` from `deleting`. Calling off a deletion the
  user asked for cannot be done by muscle memory while typing the suspension
  reason.
- **`defer_job_for_inactive_owner`** — the answer to SH-WORKER-001 that is not
  `fail_job`. A job claimed while its owner was active and executing after a
  suspension goes back to `pending` with its lease cleared, no `jobs.error`, no
  `failed` status, and only the claim's own attempt burned. It writes its own
  audit row, and it **refuses when the owner is active**, so it cannot become a
  generic put-this-back primitive. ADR-078 §3.
- **The worker gate** (`supabase/functions/_shared/lifecycle-gate.ts`) — one
  module, wired into **both** handlers at their ownership reload, so the entry
  path and the attachment path cannot disagree about what a suspended owner
  means. Three verdicts: proceed (`active`), defer (`suspended`), terminal
  (`deleting`, or no lifecycle row — SH-WORKER-002, which SH.2 scoped and did
  not deliver, closed here). An **unreadable** lifecycle defers rather than
  failing: we do not know whether this owner may be worked on, so we do not work
  on them, and we destroy nothing while not knowing.
- **The operator CLI** (`npm run account:lifecycle`) — dry-run by default,
  explicit `--apply`, one verb, one account selector (`--id` or `--email`, never
  both), `--reason` from the verb's closed set, before/after readback, and no
  user content printed anywhere. It holds no logic the database does not
  enforce: if it were deleted tomorrow, nothing about the boundary would weaken.
- **The suspended surface says why, within the closed vocabulary.** The reason
  code travels to the page as a code and is rendered only as a public label
  (`operator_suspension` → "under review"; `_abuse` → acceptable-use review;
  `_security` → security precaution). An unknown or absent code falls back to
  the generic label — the same fail-closed instinct as the `unknown` state.
- **No retroactive reminder burst** (SH-SUSPEND-005). Reminders that came due
  during a suspension are **untouched** — still `scheduled`, still in the user's
  list — and are not turned into notifications after the fact. The suspended
  surface states this in both locales *before* it happens. ADR-078 §2 records
  why this is a predicate rather than a status change, and why it is gated on
  the reason code (an ungated version would have swallowed the SH.1 backfill's
  accounts at deploy).
- **The admin runbook** (`docs/reports/SIGNUP_HARDENING_ADMIN_RUNBOOK.md`) —
  suspension, reactivation, administrative deletion-start, the provider-side
  sign-in ban, each with exact commands, expected readbacks and stop conditions.
  Marked **written, not drilled**, with a per-section execution record that is
  empty.

## 2. Evidence

- **pgTAP, 42 assertions** (`signup_hardening_suspension_admin.sql`), all against
  a fixture where lifecycle is the only discriminator (both accounts hold active
  credentials and well-formed pending jobs): the boundary closed to
  `authenticated` and `anon` by **executed** probes on all five functions,
  including the sharpest form of T-11 — a client that *forges the service_role
  claim* still gets `42501`, because EXECUTE is decided by the PostgreSQL role
  and the claim is only read inside a function the caller cannot enter; one
  deliberate **positive** probe run as `service_role` itself, so the grant is
  proven by execution in both directions rather than by `pg_proc`; the readback's
  four cases; suspension audited, idempotent, refusing free text and naming a
  missing account; the deferral refusing an active owner, ignoring a worker that
  does not hold the lease, and leaving `pending/1/unlocked/no-lease`; the drain
  serving the bystander while skipping *both* of the suspended owner's jobs;
  reactivation's reason discipline and the queue resuming **with no operator
  re-enqueue**; the suspend/reactivate cycle leaving every owned table with
  identical row counts *while* `audit_logs` grows by exactly three (the census
  excludes the audit trail and asserts it separately — a census that hid the
  audit growth would be hiding the proof SH-ADMIN-004 demands); administrative
  deletion-start and the `deleting → active` return path; and the reminder
  section with its **negative control** — an account that was never suspended
  still receives its two-day-old reminder, so the window is scoped to
  reactivation rather than to age.
- **Deno, 14 new cases** across two files, 118 in the suite. The gate's verdicts
  in isolation (`_shared/lifecycle-gate.test.ts`, 10), and the gate **wired**
  (`process-jobs/ownership.test.ts`, 4) — the latter under the same
  `forbidProviderCalls` inversion the rest of that file uses, so "a suspended
  owner's job is deferred" is proven as *no provider was contacted, no credential
  was resolved, the entry was never moved into `interpreting`, and no `fail_job`
  of either kind ran*, on both handlers.
- **Unit, 37 cases** (`signup-hardening-admin-boundary.test.ts`,
  `lifecycle-copy.test.ts`): the both-directions caller allowlist (T-10 — no
  Edge Function, no route, no feature reaches the admin RPCs; the one executable
  caller is the CLI, and `database.types.ts` is listed with its class rather than
  skipped by scan scope); ten CLI refusals including a free-text reason and
  another verb's reason; the CLI's reason sets compared to the migration's own
  per-function validation text; the readback formatter proven not to echo an
  email it was handed; the label set pinned to the migration's CHECK in both
  directions; and the three refusal vocabularies (lifecycle, deletion, throttle)
  asserted disjoint, with `owner_not_active` asserted absent from
  `JOB_FAILURE_CODES` so it can never reach the column the Jobs page renders
  verbatim.

## 3. Adversarial review — findings fixed or recorded

1. **FIXED, and it was a real hole in the requirement as first read.**
   SH-SUSPEND-005's obvious implementations both change user data — cancelling
   the reminders, or adding a `missed` status. The first destroys an intent the
   user still holds; the second changes a CHECK, the generated types and the
   reminders UI for one edge case. The predicate-only design (ADR-078 §2) leaves
   the rows untouched. **And the first draft of that predicate was wrong**: gated
   on nothing but `changed_at`, it would have swallowed the overdue reminders of
   every account the SH.1 backfill seeded, because their `changed_at` is
   migration 070's run time. Gating on the reason code is what makes it a no-op
   for an account that was never suspended, and the pgTAP negative control is
   what proves it.
2. **FIXED, found by running the suite.** The new audit action
   (`job_deferred_inactive_owner`) and its entity type (`job`) would have
   rendered as the neutral fallback on the History page. `vocabulary.test.ts`
   scans the migrations for action types and named both — a guard written phases
   ago catching this slice's new writer. Both now carry copy in both locales, a
   category (`lifecycle`, not `failed`: nothing failed, and filing a suspension
   under failures puts it in the list a user scans for things that went wrong),
   and a `null` subject route (the Jobs page stamps no per-row anchor, so a link
   would be a guess).
3. **FIXED, found by running the suite.** `deno-parity.test.ts` enumerates every
   file in `_shared/` and named the two new ones. They are listed as Deno-owned
   with the reason stated: the Node-side lifecycle control is a different control
   at a different boundary (`requireUser` gates a *request*; this gates work
   already in flight), so a parity pair would be comparing two things that are
   not copies.
4. **FIXED, found by running the Deno suite.** The `ownership.test.ts` double
   answered every unknown RPC with `{data: null}`, which is exactly the real
   RPC's *lost lease* signal — so the deferral read as a 409 and the test failed
   for the right reason. The double now answers `defer_job_for_inactive_owner`
   with the real success shape. The equivalent trap in the gate's own test —
   `rpcResult: null` swallowed by a `??` default — got its own flag rather than a
   nullish value, with the reason written beside it.
5. **FIXED, caught by static review before CI.** The pgTAP fixture's ciphertext
   was 16 bytes; the BYOK CHECK floors it at 17 (the 128-bit tag plus one byte).
   It would have failed the `database` job on the first run. Found by reading the
   constraint rather than by running the test, which is the discipline this
   repository adopted when Docker stopped being available locally.
6. **FIXED, caught by static review.** `admin_account_lifecycle_status` declared
   a record variable named `found` — plpgsql's own special variable. Renamed.
7. **RECORDED, and it is a limit of the design rather than of the
   implementation.** `begin_account_deletion_admin` **freezes** an account; it
   does not erase one. The executor is self-only by ADR-074 and accepts no
   target, so there is no operator path to erase an account whose owner never
   returns. Closing that would mean either an executor taking a target account
   (T-01's exact shape) or an operator surface holding deletion capability —
   neither authorized. The runbook says this in those words rather than leaving
   an operator to discover it mid-incident.
8. **RECORDED:** suspension does not block sign-in. A suspended user still
   authenticates and lands on the suspended surface; the product is closed to
   them on every request because the lifecycle read is per-request
   (SH-SUSPEND-003). Blocking authentication itself is the provider-side ban —
   an owner step with the admin API key, recorded in the runbook with its exact
   command and readback, and **unexecuted**.
9. **RECORDED, deployment ordering, third slice running:** `202608040073` must
   reach the hosted project before this slice's app code runs against it. The
   failure mode is milder than SH.1's (the CLI's RPCs simply would not exist) but
   it is stated rather than discovered.

## 4. CI evidence

- Local gates: lint **0**, typecheck **0**, production build green. Full vitest:
  **3679 passed**, with the three known local-only failures unchanged from
  `main` — two `sql-reachability` assertions and the `storage-orphan-scanner`
  suite's parse failure, all three reproduced on a stashed working tree at
  `main` before this branch's work was measured, and all three green in CI (the
  CRLF/line-ending consequence recorded in the handoff since BYOK).
- Deno worker suite: **118 passed / 0 failed**, run locally; `deno check` green
  on all three deployed entrypoints.
- PR-head and exact merge-SHA CI runs: recorded below at the PR boundary.

## 5. What SH.3 does not claim — the deployment-gated evidence, NOT EXECUTED

Every claim in §1–§4 is repository-and-CI evidence. The following are recorded
as **NOT EXECUTED**, each with its exact blocker:

| Requirement | What is not executed | Blocker |
| --- | --- | --- |
| SH-WORKER-004 | suspend a disposable account holding a queued job against the deployed project, observe the drain skip it across two ticks, reactivate, observe completion | SH-GD.3 (disposable accounts) **and** `202608040070`–`202608040073` not applied to the hosted project |
| SH-WORKER-005 | the heartbeat skip against the deployment across one hourly tick | same |
| SH-ADMIN-005 | the provider-side sign-in ban and its `banned_until` readback | owner action with the admin API key; command and readback recorded in the runbook |
| SH-SUSPEND-002/008 (deployed half) | the authenticated journey over a genuinely suspended account's routes | SH-GD.3; the credential-free half — the route is authenticated-only in both locales — is in `e2e/foundation.spec.ts` |
| SH-ADMIN-006 | every runbook section's first execution | the above; the runbook is marked *written, not drilled* with empty per-section execution records |

None of these is a repository blocker, and none of them was allowed to become
one: the coherent slice is built, tested and merged, and the gates are named
rather than quietly assumed satisfied.
