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

## 2. Five defects: three caught by review, one by CI, one by the deployment itself

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

**The grant matrix pinned platform defaults, and CI refused it** — the fourth
defect, and the only one review missed. The first cut of Property 5 compared the
whole privilege set. `authenticated` also carries REFERENCES, TRIGGER and
TRUNCATE on most tables, not from anything in this chain but from the platform's
default privileges: the FINDINGS §12.3 local/hosted divergence, live. Pinning
them would have produced an assertion green in CI and meaningless about
production — precisely the failure Property 3's own comment is a monument to,
after two earlier cuts of *that* assertion were refused the same way. The matrix
now filters to DML, which is what SH-EXPOSURE-002 asks for in its own words.

The same run also proved two expected values wrong:
`entry_task_candidate_resolutions` and `task_command_confirmations` hold SELECT
rather than nothing. Derived from the migration text they looked like `(none)`,
because the grant they inherit is not written in any migration — which is the
whole reason a census reads the catalog rather than the chain, and a reminder
that deriving an expectation from the same source the code came from proves
less than it appears to.

**The migration scheduled the sweeps it was not allowed to authorize** — the
fifth, found by deploying. `202608050077` ends with a `cron.schedule` block, so
applying it to the hosted project scheduled all seven destructive sweeps: five
had never run against production and none was authorized. The first live purge
would have executed at 04:11 UTC the next morning, and the dry-run transcript
whose entire purpose is to precede that decision would have described a deletion
that had already happened. The gate was not bypassed by anybody — it was removed
by the same migration that documented it.

Every class measured zero eligible rows, so the run would have deleted nothing.
That is a fact about how young this project is, not about the design: the oldest
`heartbeat_runs` row crosses its 30-day line within a fortnight. Corrected the
same day by unscheduling the five plus a duplicate of BYOK's own sweep, leaving
the two that pre-date SH.6 untouched; `scripts/sh6-retention-schedule.mjs` is now
the gate, and ADR-082 records the general rule: **a migration may create a
destructive mechanism and may not schedule one.**

## 3. Residuals, named (one now closed and kept for the record)

**T-26 is narrowed, not eliminated.** `admin_list_credential_envelopes` still
returns ciphertext to a `service_role` caller, because master-key rotation
cannot exist without it — the key lives in the operator's environment and never
in the database. The capability is now one greppable, separately revocable
function instead of an ambient table grant. ADR-081 records this rather than
claiming a total closure, because a closure claimed as total is one nobody
checks again.

**~~Genuine concurrency is argued, not demonstrated.~~ RESOLVED at deployment.**
This residual is kept rather than deleted, because what closed it is the
interesting part. A pgtap file is one session, so the sequential ceiling is
necessary and not sufficient — a sequential test passes identically whether the
advisory locks exist or not. `npm run sh6:quota-concurrency` ran against the
deployed project on 2026-08-05: 60 simultaneous inserts, ceiling 50, **exactly
50 admitted and 50 stored**. The assertion is the stored row count, not the
responses; a count-then-insert design over-admits there and nowhere else.

**Deployed two-user fairness runs on the attachment claim path, not the
interpretation one.** The interpretation claim requires an active BYOK
credential, and SH.6's own exposure closure now makes minting one from outside
the database impossible — the closure working as intended, blocking its own test
fixture. The fairness predicate is byte-identical across all three claim paths
(`signup-hardening-invariants.test.ts`), and the interpretation path is exercised
by the pgTAP two-user control in CI.

**Multi-account quota evasion (T-22) is unaddressed and out of scope here.**
Signup is closed, so the only accounts that exist are ones an operator created.
It belongs to the rollout gate, not to a quota migration.

## 4. What did NOT happen, stated as a decision rather than as incompleteness

**No production purge has run, and none is authorized.** Amendment P-1 is
explicit that approving the schedule was not approving a purge. The seven
destructive functions are executable by **no role at all**, including the
`service_role` the operator script authenticates as — read back live, HTTP 403 —
and after the ADR-082 correction **nothing schedules them either**.

**The retention `sweepActive` flags stay `false`,** so the Privacy Policy keeps
rendering its honest-notice warning. The reason changed during deployment and is
stronger than the one written before it: deployed is not enforced. A window whose
sweep is not scheduled is not being applied to anyone, and a flag claiming
otherwise would be T-31 in its purest form.

**SMTP is still unconfigured** (`smtp_host = null`, read back), so no readiness
is claimed and the SMTP-blocked SH.5 residuals stay open.

## 5. Deployment evidence

Full readbacks — merge SHAs, pre-flight, per-migration parity, exposure probes,
both quota lanes, the retention transcript and the heartbeat disposition — are in
`SIGNUP_HARDENING_SH6_DEPLOYMENT.md`. Summary:

- Hosted parity **`202608050077`**; signup disabled throughout; Auth config never moved.
- Quota concurrency: 60 racers, ceiling 50, **exactly 50 admitted and 50 stored**.
- Deployed quota lane: **11/11**, residual rows **0**.
- Retention dry-run: **0 eligible in all seven classes**, boundary evidence recorded, no sweep executed.
- T-26: `service_role` now refused on both BYOK tables (**403**), with rotation proven still working through the narrow replacement.
- `heartbeat` Edge Function **undeployed**, reads back **404**; the in-database hourly path unaffected.

## 6. SH.6 status

**SH.6 is CLOSED.** Every requirement in §1 is proven, the migrations are
deployed, and all non-destructive evidence is recorded.

**First live production purge: NOT AUTHORIZED / NOT EXECUTED.** That is a
deliberate stop with a named owner action, not incomplete implementation.

## 7. The one owner action SH.6 leaves open

Enabling the retention schedule, when and if the owner wants the sweeps to run:

```powershell
npm run sh6:retention-dry-run          # read the counts first
npm run sh6:retention-schedule -- --enable
```

`--enable` **is** the authorization of the first live purge; the script says so
before it acts. Nothing else about SH.6 is waiting on anybody.
