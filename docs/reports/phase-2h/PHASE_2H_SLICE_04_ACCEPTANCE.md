# Phase 2H — Slice 2H.4 — Operator surfaces — acceptance record

**Date:** 2026-08-07
**Branch:** `codex/phase-2h-slice-4`
**Migration:** `202608070082_phase_2h_operator_surfaces.sql` — the slice's whole
allocation. **Budget: 5 allocated · 4 spent · 1 remaining**, the last one 2H.5's
and 2H.6 holding none. Allocations are per-slice and non-transferable.

**Requirements:** `2H-OPS-001`, `2H-OPS-002`, `2H-OPS-003`, `2H-OPS-004`,
`2H-OPS-005`, `2H-SINK-005`, `2H-DEADMAN-004` — plus the `2H-DEADMAN-001`
*wiring* 2H.2 declared and deliberately left unbuilt.

---

## 1. What this slice is for

2H.2 shipped `error_events` and `scheduled_job_health` **with no consumer**, and
said so at the time. That was not an oversight: claiming the consumer in the
slice that built the producer is exactly the defect ADR-084 records, where
SH.6's quota refusals recorded nothing for weeks while each layer was
internally consistent and only reading them *against each other* found it.

So until this slice, `record_scheduled_job_run` had **no caller at all**. Every
job in `scheduled_job_liveness` read `never_reported`, which was the honest
answer to a question nobody was asking. This slice is the other half.

The failure it is ultimately built against is the 2026-08-04 deletion stall:
the schedule was healthy, the queue was empty, the code was correct, and the
deployed function was two days behind a migration that revoked the grant it
depended on. **Every surface, read alone, said fine.** That is why `ops:health`
is one command and not four.

---

## 2. The migration — `202608070082`

### 2.1 The failure half of the ledger (`2H-DEADMAN-001`)

`scheduled_job_health.last_outcome` already permitted `'failed'`. **Nothing
could write it** — 2H.2 shipped only `record_scheduled_job_run`, whose two
outcomes are both successes. A closed vocabulary with an unreachable member is
a promise nothing keeps.

`last_failure_at` and `failure_count` are added, and
`record_scheduled_job_failure` writes them. Neither the INSERT nor the UPDATE
branch mentions `last_success_at` or `last_useful_at`: **the omission is the
requirement.** A failure that advanced the success clock would make a job
failing every minute read `current`.

### 2.2 Why the mechanism moved to `private`

`pg_cron` executes as `postgres`, where **`auth.role()` is null**. The
`service_role`-guarded RPC would have refused every in-database scheduled path
with `42501` — the same trap the Management API's `/database/query` sets, and
the reason 2H.1's hosted probes had to move to PostgREST.

So the upsert is `private.apply_scheduled_job_run` / `apply_scheduled_job_failure`,
**executable by no role at all**, and `public.record_scheduled_job_run` becomes a
thin guarded wrapper with its signature, guard and grant unchanged — so 2H.2's
pgTAP coverage still holds and no caller moves.

### 2.3 The job name is resolved, not hard-coded

`private.scheduled_job_name(needle, fallback)` reads `cron.job` at call time and
matches on the **statement** the schedule runs, which is the one thing a rename
cannot change. It returns the fallback when the catalog holds no unambiguous
answer, because a reporter that stayed silent on ambiguity would be a dead-man
switch with a hole in it.

The fallback landing somewhere the catalog does not know is **not** assumed
correct: `operator_scheduled_job_findings` reports a health row with no matching
cron job as `health_without_cron_job`.

Resolution verified against the live catalog (inside a rolled-back transaction):

| needle | resolved |
| --- | --- |
| `run_all_heartbeats` | `my-brain-hourly-heartbeat` |
| `reap_expired_jobs` | `my-brain-job-reaper` |
| `prune_auth_event_attempts` | `sh-prune-auth-event-attempts` |
| `prune_credential_validation_attempts` | `byok-prune-validation-attempts` |
| `no_such_statement_anywhere` | `FALLBACK` |

### 2.4 The five operator reads

| function | answers | grant |
| --- | --- | --- |
| `operator_job_queue_health()` | depth by type and status, expired leases, claimable-now backlog, oldest and newest | `service_role` only |
| `operator_error_event_volume(interval)` | sink volume by surface, operation and classified reason | `service_role` only |
| `operator_account_lifecycle_summary()` | accounts per lifecycle state | `service_role` only |
| `operator_deletion_recovery_summary()` | recovery states, max attempts, next due | `service_role` only |
| `operator_scheduled_job_findings(interval)` | the three states `cron.job` enumeration cannot show | `service_role` only |

All five are `stable`, `SECURITY DEFINER`, `set search_path = ''`, refuse a
non-`service_role` caller in the **body** as well as by grant, and declare
**columns**. A `returns jsonb` operator read is unauditable by construction —
it has no columns to census — which is why `2H-OPS-004` is asserted from
`pg_get_function_result` in the catalog rather than from reviewing the source.

**`due_now_count` was wrong in the first draft** and the pre-flight caught it:
`next_attempt_at <= now()` counts every *completed* job, because a finished job
keeps the attempt time it was last scheduled for. A queue-depth read that
inflates with age is worse than none — it looks like a growing problem. It is
now `status in ('pending','failed')` **and** the attempt time due.

### 2.5 What no operator read can return

No column in any of them can hold entry text, task text, a file name, a prompt,
model output, a provider message, a stack trace, a token, a session identifier
or a session hash.

- **`account_deletion_log` is untouched** by every operator read, asserted from
  `pg_proc`. That table holds the requesting session's hash, and 2H.1 already
  decided that answering *why did this stop?* by widening it would trade a
  privacy guarantee for an operability one.
- **The sink's consumer returns no `id`, no `correlation_id` and no owner.** A
  per-row operator read would restore exactly the identifiability the sink's
  schema exists to exclude. `has_owner_count` answers *did these failures happen
  to signed-in people?* without saying who.
- `operator_scheduled_job_findings` reads `cron.job_run_details` for **counts and
  times only**. `return_message` carries the raw error text and never leaves the
  function.

### 2.6 What the migration does not do

It schedules nothing, arms nothing and deletes nothing (ADR-082, asserted in
pgTAP §9). The two pre-authorized attempt prunes were re-declared to add their
report and their **DELETE and predicate are byte-identical** — this slice has no
authority over what they remove, and pgTAP asserts the predicate text from
`prosrc`.

---

## 3. The wiring — all five scheduled paths report themselves

| cron job | reporter | `useful` means |
| --- | --- | --- |
| `my-brain-hourly-heartbeat` | `run_all_heartbeats` | **notifications created** > 0 |
| `my-brain-job-reaper` | `reap_expired_jobs` | a lease requeued or exhausted |
| `sh-prune-auth-event-attempts` | `prune_auth_event_attempts` | rows actually deleted |
| `byok-prune-validation-attempts` | `prune_credential_validation_attempts` | rows actually deleted |
| `my-brain-entry-dispatch` | `process-jobs`, `mode=dispatch` | jobs processed > 0 |

**`useful` is derived from the path's own result and never from the call having
returned.** The heartbeat case is the sharp one: the batch iterates every user
every hour regardless, so a *user* count would report `success_work` on a system
that produced nothing — the 2H.0 census defect written back into the ledger
built to catch it.

**What the health row claims, exactly.** It says *this maintenance work ran*,
not *pg_cron invoked it*. An operator running a prune by hand advances the row,
deliberately: the work genuinely happened, and inferring the caller from
`application_name` would make the ledger depend on an undocumented pg_cron
detail. The schedule's own state is never inferred from this row —
`scheduled_job_liveness` reads `cron.job` at run time, so a disabled job
classifies `inactive` and a deleted one disappears from the enumeration, which
§2.3's finding makes visible rather than silent.

### 3.1 The drain's failure case needed its own field

`runEntryDispatchDrain` returned the identical summary — `processed: 0` — for an
empty queue and for a claim RPC that errored. Reporting both as `success_empty`
would file the dead-man switch's most reassuring answer for the one state it
exists to catch. `claimFailed` separates *found nothing* from *could not look*,
and the failed branch calls `record_scheduled_job_failure`.

**An in-database path cannot record its own death.** `pg_cron` runs each
statement in one transaction, so a function that caught its own exception,
recorded a failure and re-raised would have the record rolled back with the
raise. That is why `record_scheduled_job_failure` exists for callers *outside*
the database, and why `operator_scheduled_job_findings` reads
`cron.job_run_details` — the only place an in-database tick failure is durably
recorded.

---

## 4. The operator CLI (ADR-075)

- `npm run ops:health [--window 7d] [--staleness 3] [--json]` —
  `2H-OPS-001`, `2H-SINK-005`, `2H-DEADMAN-004`.
- `npm run ops:account-health [--limit N] [--json]` — `2H-OPS-002`.

Both are read-only, both exit **non-zero when something needs attention**, and
both take their ceilings as arguments with declared bounds rather than defaults
nobody chose.

`ops:health` reads Edge Function parity through `scripts/edge-function-parity.mjs`
— extracted from `verify-edge-function-parity.mjs`, whose printed output is
byte-identical after the refactor (verified by running it) and which remains the
only one of the two that exits non-zero. Parity is a git-and-platform fact no
database can compute, and `2H-DEADMAN-004` requires it **beside** liveness, not
in a second tool nobody runs.

`undeployed_by_design` is a **separate state from `ok`**. Flattening the two
would let a function that silently stopped being deployed hide inside the
allowlist's shape.

**No product admin UI and no generic service-role HTTP endpoint.**
`src/lib/closeout/operator-surface-boundary.test.ts` mechanises that: it walks
`src/app` for an admin route, walks every route and page for `SERVICE_ROLE_KEY`,
asserts no application file calls an operator RPC, and asserts the CLI names
only operator reads — matching **both** the `.rpc("name")` and `call("name")`
shapes, because matching only the first would have made the assertion vacuous
for exactly the two files this slice added.

---

## 5. `2H-OPS-005` — alerting is defined and deliberately not built

ADR-089. A destination, a threshold and a receiving owner are all owner
decisions; the PRD's value sheet signs ceilings, not addresses, and `RG-DEP-4`
(monitoring adequacy) is an owner signature that is still unsigned. Building a
notifier against a guessed destination produces an unread channel, which is
worse than none — an unread alert channel is an *argument* that someone is
watching.

What exists instead is the exit-code contract in §4, which is the whole
interface an integration needs. The decision left open is where the exit code
goes, not whether the state is computable.

---

## 6. Evidence

### 6.1 pgTAP — `supabase/tests/phase_2h_operator_surfaces.sql`

**47 assertions, 47 passing**, executed against a real Postgres with the
migration applied inside a transaction that was rolled back (see §6.2). Nine
sections:

1. all five reads reachable by `service_role`, by neither other role, **and** six
   in-body `42501` refusals each with a positive `lives_ok` twin — a refusal set
   without twins is satisfied by a surface that refuses everyone;
2. the private mechanism executable by **no** role, each with an empty
   `search_path`;
3. read-only proved three ways: `stable` from `pg_proc`, a source census for
   INSERT/UPDATE/DELETE/TRUNCATE/GRANT, and an **executed** before/after control
   over the four tables an operator read touches;
4. `2H-OPS-004` from `pg_get_function_result` — no content-, credential- or
   session-shaped column, every read returns a declared `TABLE`, none names
   `account_deletion_log`, the sink consumer exposes no id or owner;
5. the sink consumer reads **stored** events written through the real writer,
   with the window proved in both directions and the append-only refusal
   asserted;
6. a failure records `failed`, leaves `last_success_at` pinned to a fixed
   literal, counts separately — and a later success **does** move the clock, so
   the assertion is not passing because nothing ever moves;
7. the real paths report: the reaper `success_empty` with an empty queue and
   `success_work:1` after a genuinely expired lease is requeued, its own
   behaviour unchanged; the heartbeat and both prunes reporting under the
   scheduled names; the unmatched-needle fallback;
8. `health_without_cron_job` fires, the finding vocabulary is closed, both
   windows are validated rather than defaulted;
9. ADR-082 — nothing scheduled, no touched function can schedule, both prune
   predicates byte-identical.

**`now()` is transaction time**, so §6 pins the success clock to
`2026-01-01 00:00:00+00` before asserting it did not move — the same trap 2H.2's
suite had to work around.

### 6.2 The pre-flight, and what it caught

`pgtap` is not installed on the hosted project, and extension creation is
transactional in Postgres. So the suite was run as:

```
begin;
create extension pgtap;
<migration 202608070082>
<the whole suite>
rollback;
```

against the linked project — a real database with real data and a real
`cron.job` catalog. **Nothing persisted**, verified afterwards by reading back
`scheduled_job_health` (0 rows), the new column (absent), the operator function
count (1, 2H.1's), and `pg_extension` (no `pgtap`).

Four defects it found before CI did:

1. **`$$` in a `String.replace` replacement is an escape for a literal `$`**, so
   splicing the migration into the suite silently turned every dollar-quoted
   function body into `as $` — a syntax error. This one failed loudly; the
   general form does not. *Suspect the probe before the product*, for the fourth
   time in this phase.
2. `having count(*) = 1` without `GROUP BY` while selecting a non-aggregated
   column — invalid.
3. `account_lifecycle.status_changed_at` does not exist; the column is
   `changed_at`.
4. `jobs.idempotency_key` is `NOT NULL` with no default, and an `interpret_entry`
   payload is trigger-validated — the control job needed both.

And one assertion that was **brittle rather than wrong**: counting *all* sink
groups in the window assumed an empty table, which is true in CI and false on
the hosted project (2H.2's permanent calibration row). It is now scoped to the
classifications the section itself wrote — an assertion that silently means
"nothing else has ever failed" breaks the first time a real event exists.

### 6.3 Deno — `supabase/functions/process-jobs/dispatch-liveness.test.ts`

Seven tests, no network and no database: an empty queue reports
`processed: 0, claimFailed: false`; a claim error reports `claimFailed: true`
with **every other field identical**; the three report branches call the right
RPC with the right arguments; the failure branch is asserted **not** to call the
success reporter; a failing report does not throw.

### 6.4 Repository gates

| gate | result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | clean |
| `npm test` | **4179 passed** (Windows baseline: 3 files fail to *load* on a shebang parse error — `hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner` — green in CI) |
| `npm run verify:edge-parity` | output byte-identical after the refactor |
| `operator-surface-boundary.test.ts` | 12 passed |

**A guard fired correctly and was not weakened.** `phase-2f-traceability` exempts
the *chain head* from stale-deployment claims, so `STATE.md`'s "not deployed
yet" line about `202608070081` was legitimately exempt while `…081` was the
head. Moving the head to `…082` un-exempted a genuinely stale sentence. It is
now discharged in place — struck, with the correction beside it — rather than
deleted, because the deployment ordering it describes is the one every later
slice inherits.

**A second guard of my own fired on a false positive and was narrowed, not
disabled.** `operator-surface-boundary` matched `\boperator_[a-z_]+` anywhere in
`src/`, and hit `operator_suspension` — a lifecycle *reason code* in
`shell/lifecycle-copy.ts` with nothing to do with these functions. A guard that
failed on it would teach people to rename product vocabulary to satisfy a test.
It now matches the **call shape**.

---

## 7. Deployment ordering, and why it is this way

2H.3 established that **a merge to `main` auto-deploys the application to Vercel
Production with no operator act**, while the database and the Edge Functions do
not move with it. 2H.3 therefore applied its migration *inside the merge window*,
because the application called a function the migration created.

**This slice is the opposite case, and the ordering follows from that:**

1. **The deployed application depends on nothing new.** No `src/` file calls any
   of these RPCs — `operator-surface-boundary.test.ts` asserts it. Merging first
   ships an application whose behaviour is unchanged.
2. **Apply `202608070082`.** Additive: two nullable-or-defaulted columns and
   seven new functions. Nothing existing changes shape; the four re-declared
   functions keep their signatures, grants and predicates.
3. **Redeploy `process-jobs`.** Its dispatch branch is the only new consumer,
   and it must not run before the RPC exists. Between steps 2 and 3 the RPCs
   exist with no caller, which is harmless; between 1 and 2 the deployed worker
   (v21) does not call them, which is also harmless.
4. **Regenerate `database.types.ts`** if the new functions change it, in the
   deployment-record commit — `supabase gen types --linked` reads the hosted
   schema, so it cannot be run correctly before step 2.

The reverse order — worker first — would have the drain call
`record_scheduled_job_run` before it exists, get `PGRST202`, log the code and
carry on. The drain's own work is unaffected, so the failure mode is a
*silently unreported run*, which is precisely what this slice exists to remove.

**Exact merge-SHA CI green ×3 is required regardless, and ordering is never a
reason to skip it.**

---

## 8. Posture, unchanged by this slice

Signup **disabled** at both layers · CAPTCHA **enforced** · SMTP **unconfigured**
· exactly **five** cron jobs, unchanged · the deletion reaper **unarmed** (0/2
Vault secrets, no cron job) · five user-content sweeps and both 2H.2 sweeps
**unscheduled** · **no purge authorized or executed** · no restore drill executed
· **Phase 2I not started**.

---

## 9. Requirement disposition

| Requirement | State | Where |
| --- | --- | --- |
| `2H-OPS-001` | delivered | migration §4.1/§4.5, `scripts/phase-2h-operator-health.mjs`, pgTAP §1, §3, §8 |
| `2H-OPS-002` | delivered | migration §4.3/§4.4, `scripts/phase-2h-account-health.mjs`, pgTAP §1 |
| `2H-OPS-003` | delivered | pgTAP §1, §2, §3; `operator-surface-boundary.test.ts` |
| `2H-OPS-004` | delivered | pgTAP §4; `operator-surface-boundary.test.ts` |
| `2H-OPS-005` | delivered as a bounded scope statement | ADR-089; §5 above; the exit-code contract in §4 |
| `2H-SINK-005` | delivered | migration §4.2, pgTAP §5, `ops:health`'s ERROR SINK section |
| `2H-DEADMAN-004` | delivered | `scripts/edge-function-parity.mjs`, `ops:health`'s EDGE FUNCTION PARITY section, `operator-surface-boundary.test.ts` |
| `2H-DEADMAN-001` (wiring) | delivered | migration §3, `dispatch.ts`, pgTAP §6, §7, Deno suite |
