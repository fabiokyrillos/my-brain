# SH.6 acceptance — quotas, retention, exposure closures

**Date:** 2026-08-05 · **Branches:** `codex/sh-slice-6-quotas` (PR #93),
`codex/sh-slice-6-retention` (PR #94) · **Migrations:** `202608050076`,
`202608050077` — **the last two of the eight-migration budget, which is now
fully spent and was not exceeded.**

## 1. What was delivered

### Quotas and fairness (`202608050076`)

| Requirement | Mechanism | Evidence |
| --- | --- | --- |
| SH-QUOTA-001 | Entries per owner per UTC day, statement trigger on `public.entries` | `signup_hardening_quotas.sql` §4, §4b |
| SH-QUOTA-002 | Live-job ceiling — claimable-or-running only | §5 (8 assertions) |
| SH-QUOTA-003 | Per-owner drain fairness, identical predicate on all three claim paths | §7 (two-user control) |
| SH-QUOTA-004 | Storage bytes and object count, app-side refusal before the storage write plus a table trigger | §6, `agent/actions.ts` |
| SH-QUOTA-005 | Attachments per entry and per day | §6 |
| SH-QUOTA-006 | One size limit, one MIME allowlist | `attachment-limits-parity.test.ts` |
| SH-QUOTA-007 | Declared AI input bounds | `ai-input-bounds.test.ts` |
| SH-QUOTA-008 | `process-jobs` body bound before JSON parse | `request-bounds.test.ts` (deno, 6 cases) |
| SH-QUOTA-009 | `QUOTA_*` vocabulary, distinct from lifecycle and throttle | §8, `quotas/refusal.test.ts` |
| SH-QUOTA-010 | Constants ↔ PRD ↔ database seed, three-way | `quotas-parity.test.ts` |
| SH-STORAGE-004 | One signed-URL constant, ≤ 600 s | `attachment-limits-parity.test.ts` |

### Retention and exposure (`202608050077`)

| Requirement | Mechanism | Evidence |
| --- | --- | --- |
| SH-RETENTION-002/003/004/005 | Seven sweeps, one predicate per class | `signup_hardening_retention.sql` §3–§6 |
| SH-RETENTION-007 | Scheduler-only, bounded per invocation, count returned | §2 |
| SH-RETENTION-008 | Seven count-only twins sharing the sweep's predicate; `sh6-retention-dry-run.mjs` | §2, §3 |
| SH-RETENTION-009 | Boundary one second either side, both outcomes asserted, per class | §3–§6 |
| SH-RETENTION-010 | `SIGNUP_HARDENING_RETENTION_SCHEDULE.md`, copy pins | `documents.test.ts` |
| SH-EXPOSURE-001 | `service_role` loses table DML on both BYOK tables; three narrow replacements | §7, ADR-081 |
| SH-EXPOSURE-002 | Full `authenticated` matrix: norm plus 27 named exceptions | `signup_hardening_grant_census.sql` Property 5 |
| SH-EXPOSURE-003 | Retained by decision, writer surface guarded | ADR-081, `audit-log-writers.test.ts` |
| SH-EXPOSURE-005 | Heartbeat Edge Function: no caller, disposition undeploy | `heartbeat-disposition.test.ts` |
| SH-EXPOSURE-006 | Proxy refuses `app/` routes in production when unconfigured | `proxy.test.ts` (6 new cases) |
| SH-COPY-006 | No surface promises what the schedule contradicts | `documents.test.ts` |

## 2. Three defects this slice's own adversarial review found

Recorded because the review is worth more as a record of what it caught than as
an assertion that it happened.

**The multi-row bypass.** The first draft used `BEFORE ... FOR EACH ROW`
triggers. A row trigger cannot see the rows its own statement inserted before
the current one — their `cmin` is the executing command, so MVCC hides them from
any query it runs. Every ceiling would have held against a hundred separate
INSERTs and failed completely against one INSERT of a hundred rows, which is a
single PostgREST POST with an array body. Caught by static review before CI; the
triggers are statement-level over transition tables, the comparison is `used >
ceiling` rather than `>=`, the migration's postcondition asserts the trigger
*shape* rather than its name, and §4b of the pgtap is the assertion that fails
if anybody converts them back.

**The exhausted-job lockout.** The live-job predicate was
`status in ('pending','running','failed')`, copied from
`enqueue_entry_reprocessing`. This schema has no `exhausted` status, so a job
that has burned every attempt stays in `failed` forever — meaning an owner who
accumulated fifty dead jobs would be refused every capture from then on, while
the new copy told them their queue was full and nothing was running. A ceiling
nobody can get back under is a lockout, and it would have been indistinguishable
from a product bug. Fixed to claimable-or-running, with two assertions rather
than one so that "exhausted does not count" cannot decay into "failed does not
count".

**`SH-EXPOSURE-001` did not survive contact with the repository.** The PRD
expected the DEFINER resolvers to be the only users of the `service_role` grant.
Two real callers were not: the deletion executor and the master-key rotation.
The closure was not weakened; both were routed through narrow named functions.

## 3. Three residuals, named

**T-26 is narrowed, not eliminated.** `admin_list_credential_envelopes` still
returns ciphertext to a `service_role` caller, because master-key rotation
cannot exist without it — the key lives in the operator's environment and never
in the database. The capability is now one greppable, separately revocable
function instead of an ambient table grant. ADR-081 records this rather than
claiming a total closure, because a closure claimed as total is one nobody
checks again.

**Genuine concurrency is argued, not demonstrated.** A pgtap file is one
session, so the sequential ceiling is necessary and not sufficient — a
sequential test passes identically whether the advisory locks exist or not.
`npm run sh6:quota-concurrency` is the deployed half and **has not run**,
because `202608050076` is not applied to the hosted project.

**Multi-account quota evasion (T-22) is unaddressed and out of scope here.**
Signup is closed, so the only accounts that exist are ones an operator created.
It belongs to the rollout gate, not to a quota migration.

## 4. What did NOT happen, stated as a decision rather than as incompleteness

**No production purge has run, and none is authorized.** Amendment P-1 is
explicit that approving the schedule was not approving a purge. The mechanism is
built so nothing else is possible: the seven destructive functions are
executable by **no role at all**, including the `service_role` the operator
script authenticates as. Only a scheduler can run them, against a database these
migrations have not been applied to.

**The retention `sweepActive` flags stay `false`,** so the Privacy Policy keeps
rendering its honest-notice warning. They flip at deployment, not at merge — a
policy announcing enforcement on the strength of a merged file is false for
exactly the window in which nobody is looking. A new assertion pins that every
unenforced window nonetheless has a sweep *and a twin* built for it, so "not
implemented" and "implemented, not yet deployed" stay distinguishable.

**Neither migration is applied to the shared environment.** Both are validated
every CI run by `supabase db reset` over an empty database. `202608050076` fails
closed by refusing writes, so it must be applied before application code that
consumes the ceilings runs against the hosted project; `202608050077` fails
closed by deleting nothing, so its order does not matter.

## 5. Owner actions this slice stops at

1. **Merge PR #93, then PR #94** (retarget #94 to `main` after #93 lands). Both
   are green; the merge itself is an action this loop is not permitted to take.
2. **Apply `202608050076` and `202608050077` to the hosted project**, in that
   order, and record the readback.
3. **Run `npm run sh6:retention-dry-run`** and file the transcript here. A
   non-zero count is information, not authorization.
4. **Run `npm run sh6:quota-concurrency`** against the deployed project to
   convert the advisory-lock claim from argued to demonstrated.
5. **Undeploy the `heartbeat` Edge Function** and record the readback
   (SH-EXPOSURE-005). Nothing calls it; `pg_cron` calls
   `run_all_heartbeats()` directly inside the database. If it is retained
   instead, rotate `HEARTBEAT_SECRET` and record that readback in its place.
6. **Then, and only then, flip the `sweepActive` flags** in
   `src/features/legal/retention.ts` and delete the "at least one window is
   genuinely unenforced" test in the same commit.

## 6. SH.6 closes when

Every row in §1 is proven — done in the repository — **and** items 2, 3 and 5 of
§5 are recorded. Until then SH.6 is *repository-complete and
deployment-pending*, which is a different state from incomplete and is written
here as such.

**The first live purge is NOT AUTHORIZED. That is a deliberate stop, not
unfinished implementation.**
