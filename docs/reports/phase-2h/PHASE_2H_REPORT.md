# Phase 2H — Deploy and Operate — final report

**Status: COMPLETE.** Closed 2026-08-07.
`2H-CLOSE-003`. Written by slice 2H.6, which spent no migration.

---

## 1. What this phase was for

Phase 2G shipped a product that worked in a repository. Phase 2H was about the
gap between that and a system somebody can operate — and the gap was not
theoretical. `delete-account` had sat **undeployed for days** while every test
passed, because nothing in the repository knew what was deployed. A cron job had
recorded **29 042 successful ticks against four rows of work**, because
`pg_cron` records that a statement ran, not that anything happened. Both are
failures a green repository cannot see.

So the phase built the things that make a deployed system legible: recovery for
a deletion that stalls, an error sink, a dead-man switch over scheduled jobs,
distributed rate limiting, operator reads, a deployment contract, retention, and
a backup posture written from provider readback rather than from belief.

**Nothing in it opened a door.** Signup stayed closed at both layers, no purge
ran, the deletion reaper stayed unarmed, and every destructive step is marked
owner-only with the authorization it needs.

---

## 2. Final status

| | |
| --- | --- |
| Requirements declared | **44**, across nine families |
| Delivered and cited | **44** |
| Partial | **0** |
| Undelivered | **0** |
| Migration budget | **5 allocated · 5 spent · 0 remaining**, each by its allocated slice |
| Hosted migration parity | **`202608070083`**, 83 migrations, local = remote |
| Slices | 2H.0 … 2H.6, all closed |
| PRs | **#112 … #125** |
| Phase 2I | **not started** |

The machine-checked classification is
[`PHASE_2H_TRACEABILITY_MATRIX.md`](PHASE_2H_TRACEABILITY_MATRIX.md), regenerated
by `npm run docs:phase-2h:traceability`, which **refuses to write rather than
print an unresolved claim**.

---

## 3. Every requirement, by family

All 44 delivered and cited. The matrix carries the per-requirement evidence;
this is what each family bought.

| Family | Count | What it delivered |
| --- | --- | --- |
| `2H-DEPLOY` (7) | 7 | The deployment runbook, the machine-checked environment and secret contract, `verify:edge-parity` as a hard gate, migration-parity verification by a run rather than a reader, the hosting ADR, the owner-only marking of every destructive step, and the `process-jobs` audit ADR-086 asked for. |
| `2H-RECOVER` (6) | 6 | A stalled account deletion retries itself, bounded — 15-minute threshold, exponential backoff capped at 6 hours, a ceiling of 5 and a terminal `stalled` classification. The reaper **re-invokes the executor and never deletes**, so it cannot resurrect data or weaken a refusal. Proven against the *actual* historical defect. |
| `2H-SINK` (5) | 5 | An append-only error sink whose privacy property is **the absence of anywhere to put a message** — three text columns, each pinned to a closed vocabulary, and no `json`, `jsonb`, `bytea` or free-text column, asserted by the migration reading its own catalog. |
| `2H-DEADMAN` (4) | 4 | Every scheduled path records its own runs, with `last_success_at` and `last_useful_at` in **separate columns**, and Edge Function deployment parity readable beside liveness. |
| `2H-RATE` (6) | 6 | Per-user rolling-window rate limiting in the database, fail-closed, no exemptions including the owner, proven under genuine concurrency, and explicitly **not** a spend control. |
| `2H-RETENTION` (4) | 4 | A sweep and a count-only twin for every retained class, sharing one predicate; no migration schedules one; scheduling requires `--enable`; a policy claim and an enforced window cannot silently diverge. |
| `2H-BACKUP` (2) | 2 | The posture, read from the provider. The restore drill, built and **not executed**. |
| `2H-OPS` (5) | 5 | Two operator reads over an operator CLI — **no product admin UI, no generic service-role HTTP endpoint** (ADR-075) — and alerting *defined and deliberately not built* (ADR-089). |
| `2H-CLOSE` (5) | 5 | This report, the fail-closed generator, the per-slice budget reconciliation, the destructive-posture re-read, and the A13 re-verification. |

---

## 4. Slices, PRs and merge SHAs

**Every merge SHA below was verified green ×3, per job**, across the three CI
jobs (`application`, `database and journey`, `edge worker`). Every branch is
preserved.

| Slice | PR | Merge SHA | Migration |
| --- | --- | --- | --- |
| planning package | #112 | `05e418d` | — |
| 2H.0 pre-code gates | #113 | `efc56bd` | — |
| **2H.1** deletion recovery | #114 | `d7d5091` | `202608070079` |
| 2H.1 deployment record | #115 | `57dab71` | — |
| **2H.2** error sink + dead-man | #116 | `88c9e3b` | `202608070080` |
| 2H.2 deployment record | #117 | `6d45bc7` | — |
| handoff §34 | #118 | `4046954` | — |
| **2H.3** rate limiting | #119 | `46f7244` | `202608070081` |
| 2H.3 deployment record | #120 | `d8aa4ed` | — |
| **2H.4** operator surfaces | #121 | `70d26a5` | `202608070082` |
| 2H.4 deployment record | #122 | `056e883` | — |
| handoff §37 addendum | #123 | `285d33e` | — |
| **2H.5** deploy / retention / backup | #124 | `40f2fac` | `202608070083` |
| **2H.6** closeout | #125 | *this PR* | — |

The gate that preceded all of it: `508cf6c` (PR #111), whose three-job green
ADR-085 made a precondition for the first Phase 2H deployment.

---

## 5. The five migrations

| Version | Slice | What it created |
| --- | --- | --- |
| `202608070079` | 2H.1 | `account_deletion_attempts` and the bounded reaper. RLS forced, **no policy**, revoked from every role including `service_role`; six `SECURITY DEFINER` functions are the only access. Schedules nothing. |
| `202608070080` | 2H.2 | `error_events` and `scheduled_job_health`. Append-only by **two independent locks** — the revoke *and* a trigger that refuses even the table owner, because a grant is exactly what a future migration restores in silence. Schedules nothing. |
| `202608070081` | 2H.3 | `rate_limit_parameters` (the signed ceilings as **rows**, not DDL) and `rate_limit_events`. The verdict returns as **data, not an exception**, because PostgREST runs an RPC in a transaction and a raising refusal would undo the `refused` row recording it. Schedules nothing. |
| `202608070082` | 2H.4 | Five `service_role`-only operator reads, and the dead-man mechanism moved to `private` because `pg_cron` runs as `postgres` with a **null** `auth.role()`. Schedules nothing. |
| `202608070083` | 2H.5 | Retention for the three classes this phase created: registry rows at the signed 90 days, `rate_limit_events`' first sweep, and zero-argument schedulable forms so a cron statement carries no number. **Asserts against `cron.job` inside its own transaction that it scheduled nothing.** |

**Hosted parity is exactly `202608070083`**, 83 migrations, local = remote,
verified before and after every deployment.

---

## 6. Edge Functions

| Function | History | Final state |
| --- | --- | --- |
| `process-jobs` | v21 → **v22** (2H.4, under ADR-086's four conditions) | `ok` |
| `delete-account` | v2 → **v3** | `ok` |
| `heartbeat` | **never deployed** | `not deployed, by design` |

`verify:edge-parity` is **fully green**, and its third state is deliberately not
folded into `ok`: flattening them would let a function that silently stopped
being deployed hide inside the allowlist's shape. `heartbeat` stays undeployed
because `pg_cron` calls `run_all_heartbeats()` inside the database, so the HTTP
wrapper was an internet-reachable service-role endpoint with no caller
(`SH-EXPOSURE-005`).

---

## 7. Operational state at close

**Cron — five jobs, each with a named owner:**

| Job | Schedule | Authorization |
| --- | --- | --- |
| `my-brain-entry-dispatch` | `* * * * *` | 2X.5 — drains `interpret_entry` |
| `my-brain-job-reaper` | `* * * * *` | `202607170019` — recycles expired leases |
| `my-brain-hourly-heartbeat` | `0 * * * *` | Phase 2B |
| `byok-prune-validation-attempts` | `17 4 * * *` | BYOK — **authorized attempt prune** |
| `sh-prune-auth-event-attempts` | `43 4 * * *` | SH.5 — **authorized attempt prune** |

No duplicate names. No Phase 2H sweep. No user-content sweep.

| | State |
| --- | --- |
| **Deletion reaper** | **UNARMED** — 0/2 Vault secrets, no cron job, 0 stalled rows |
| **Retention sweeps built** | **8** (SH.6's five + Phase 2H's three) |
| **Retention sweeps scheduled** | **0** |
| **Destructive sweep grants** | executable by **no role**, `service_role` included |
| **User-content purge** | **never run** |
| **Restore drill** | **NOT EXECUTED** |
| **SMTP** | **unconfigured** |
| **Public signup** | **disabled** at both layers |
| **CAPTCHA** | **enforced** (`turnstile`) |
| **Rollout gate** | **25 pass · 3 fail · 2 owner-signature — "SIGNUP MUST NOT OPEN"** |
| **Phase 2I** | **not started** (A13 green) |

---

## 8. Every defect this phase found

Twelve, and the pattern in them is the phase's most transferable output: **most
were found by a mechanism, and several were in the probes rather than the
product.**

### In the product

1. **`record_scheduled_job_run` had no caller at all** (2H.2 → 2H.4). Every job
   read `never_reported` forever. Shipping the producer and the consumer in
   different slices was deliberate — claiming the consumer in the slice that
   built the producer is ADR-084's defect — but it left a real window.
2. **`due_now_count` inflated with age** (2H.4). `next_attempt_at <= now()`
   counts every *completed* job, because a finished job keeps the attempt time
   it was last scheduled for. A queue-depth read that grows with age would have
   shipped as a permanent false alarm.
3. **`database.types.ts` had been stale for five migrations** (2H.4). Nothing
   broke and nothing could have: not one of those objects has a TypeScript
   caller, so `tsc` had nothing to disagree with. **That is why nobody noticed.**
4. **A live cron writer collided with a test fixture key** (2H.4). Instrumenting
   `reap_expired_jobs` made a real minute-boundary tick commit into
   `scheduled_job_health` under the exact key 2H.2's pgTAP suite used as a
   ledger fixture. It would have flaked one run in three, forever.
5. **`202608050077` still schedules five user-content sweeps at apply time**
   (2H.5). Removed from the **hosted** project by operator script, but the
   migration was not and could not be edited afterwards — so **any database
   built from the chain** schedules all five and begins deleting user content at
   04:11 UTC. **Open; see §10.**
6. **The 2H.5 migration managed its own transaction.** `supabase db push`
   already runs each file in a transaction, so the inner `commit;` would have
   ended it — leaving the migration's own "nothing is scheduled" assertion
   raising *after* its DDL was committed. A guard that travels with the DDL is
   worth nothing once it can no longer roll the DDL back.
7. **`.env.example` was missing a required variable** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
8. **There is no operator-restorable backup of this project.** `pitr_enabled:
   false`, `backups: []`, plan free. **Open; see §10.**

### In the probes and controls

9. **The pgTAP pre-flight harness corrupted every dollar-quoted body.** Splicing
   the migration in with `String.replace` and a replacement *string* turns each
   `$$` into a literal `$`, because `$$` is an escape there.
10. **The pre-flight's output was read wrong.** The Management API returns only
    the **last** result set, so `select * from finish()` returning nothing is
    identical whether the run was clean or whether the middle is invisible.
    `_get('failed')` / `_get('curr_test')` / `_get('plan')` cannot be misread.
11. **The pre-flight was editing the artifact it was tested.** To splice a
    migration into one transaction it must strip the file's own
    `begin;`/`commit;` — so defect 6 passed 31/31 while being untestable.
12. **The Edge environment scan matched a variable inside a comment.** The
    comment recorded the project-wide provider key BYOK *removed*; the "fix"
    would have re-declared in a contract the very name
    `project-key-guard.test.ts` exists to forbid, putting it back somewhere
    findable at 3am.

### False greens and bad controls

- **Two pgTAP assertions were about the environment, not the product** (2H.5).
  They passed the hosted pre-flight and would have failed in CI. The authorized
  BYOK prune is `byok-prune-credential-validation-attempts` in a chain-built
  database and `byok-prune-validation-attempts` on hosted; **the command is what
  the authorization was about, the name is an artifact of which environment
  wrote it.**
- **SH.6's registry assertion was a whole-table equality**, so a later phase
  adding a declared window broke a test about SH.6. Split into two assertions on
  the right subjects, and **proven in three directions** — because a repaired
  assertion that merely stopped failing is indistinguishable from a weakened
  one.
- **The Management API runs as `postgres` with a null `auth.role()`**, so a
  `service_role`-guarded read must *refuse* it. Used as a control rather than
  worked around: the refusal proves the caller check is real rather than a
  grant.

**Six of these were probe defects.** *Suspect the probe before the product* —
seven times across this phase.

---

## 9. Intentional append-only hosted artifacts

Recorded so a future reader does not mistake them for residue:

- **2H.2's calibration rows** in `error_events` and `scheduled_job_health`,
  written to prove the sink had stored data a consumer could read. Append-only
  by design; they cannot be deleted, only swept, and nothing is scheduled to
  sweep them.
- **`scheduled_job_health` rows** for the live jobs, accumulating counters. Not
  prunable while their job is in the catalog, at any age — deleting one would
  reset the history the dead-man switch reads.
- **One `error_events` row** from a real server-action failure, 0 with an owner.
- **One `rate_limit_events` row** from the concurrency proof.

The 2H.2 pgTAP suite is a **CI-only artifact**: it asserts against a fresh
database and fails against hosted, where those calibration rows persist. That is
expected and non-defective.

---

## 10. Unresolved, with a destination for each

Nothing here is undelivered work. These are decisions that are the owner's, or
facts about the environment that code cannot change.

### Owner actions

| # | Item | Destination |
| --- | --- | --- |
| **O-1** | **No operator-restorable backup exists.** `pitr_enabled: false`, `backups: []`, plan free. Schema recoverable from git; **rows are not**, Storage uncovered on any plan, and a restore arrives without `BYOK_MASTER_KEY` and so recovers every credential envelope as unreadable ciphertext. **Blocks `RG-DEP-3`.** | Upgrade to a plan with daily backups, or an owner-run `pg_dump` schedule. `PHASE_2H_BACKUP_AND_RETENTION.md` Part I |
| **O-2** | **`202608050077` still schedules five user-content sweeps at apply time.** Any new environment — CI, a restored disposable project — begins deleting user content at 04:11 UTC. **Not fixable inside Phase 2H:** migrations are append-only and the budget is spent, so unscheduling them needs a **sixth** migration. | An owner amendment, or the first migration of the next phase. `TODO.md` |
| **O-3** | Configure SMTP — `RG-DEP-1`. | Rollout gate |
| **O-4** | Execute the restore drill into a disposable project — `RG-DEP-3`, blocked by O-1. | Rollout gate |
| **O-5** | Sign professional legal review — `RG-LEG-4`. **Not satisfiable on the owner's behalf.** | Rollout gate |
| **O-6** | Sign monitoring adequacy — `RG-DEP-4`. **Not satisfiable on the owner's behalf.** | Rollout gate |
| **O-7** | Enabling any retention schedule **is** the authorization of the first live purge (ADR-082). Eight sweeps built, zero scheduled. | `npm run ops:retention-schedule -- --enable`, owner only |
| **O-8** | Arming the deletion reaper needs two Vault secrets **and** a cron job. 0/2 today. | `npm run ops:deletion-reaper-schedule -- --enable`, owner only |
| **O-9** | Should the Privacy Policy's retention table enumerate `error_events` and `rate_limit_events`? Both are per-user operational records with a 90-day window; neither carries user content and both are handled by account deletion, so the Policy makes no false claim today. Adding a class changes a **published legal document and its version**, forcing re-acceptance. | `TODO.md`, with the next policy version bump |

### Engineering residuals

| # | Item | Destination |
| --- | --- | --- |
| **R-1** | The application exposes **no deployed-commit identifier** over HTTP. `verify:edge-parity` can assert a function matches its source; nothing can assert the deployed application is the merge SHA. | `TODO.md`, deployment observability |
| **R-2** | `rate_limit_events` has no interval-taking count twin, so the dry run cannot produce two-window boundary evidence for it. Costs a migration. | Next phase's budget |
| **R-3** | `operator_stalled_deletions` (2H.1) is declared `VOLATILE` unlike 2H.4's five reads. It writes nothing, but nothing stops it. | Next phase; the pgTAP suite excludes it from the volatility assertion and says so |

### Inherited deferrals, re-raised by name

| Item | State |
| --- | --- |
| **`2E-COMMAND-012`** | Still deferred. Postgres cannot extend an argument list via create-or-replace (ADR-057), so it needs a new function name and a migration. Deferred past Phase 2F and untouched by 2G and 2H. |
| **Semantic retrieval / ADR-055** | **Expires 2026-10-27.** Deferred since Phase 2E; the expiry is now under three months away and it is the nearest dated commitment in the repository. |
| **Phase 2G's two partials** | `2G-ROUTE-008` and `2G-CLOSE-003` remain partial on **one** blocker: `BYOK_TEST_USER_A_OPENAI_API_KEY` is not provisioned, so the conversational-creation journey cannot make a provider call. One owner action. |
| **ADR-086's `process-jobs` decision** | **CLOSED.** The audit was produced, ADR-086 accepted it on four binding conditions, and the deploy was executed separately in 2H.4 — v21 → v22. It is no longer open. |

---

## 11. What this phase proved about how to work here

- **A merge bar and a deployment bar are different bars, and conflating them is
  how a defect survives a green repository.** A merge needs PR-head CI green ×3
  and an explicit authorization; a deployment additionally needs the **exact
  merge SHA** green ×3, parity read before and after, and `verify:edge-parity`.
- **Scheduling *is* authorization.** A migration may build a destructive sweep
  and must never schedule one — and `202608070083` asserts that against
  `cron.job` inside its own transaction, so the rule travels with the DDL rather
  than with the repository that happened to contain it.
- **A producer with no consumer is invisible on both sides** (ADR-084), and so
  is a consumer with no producer. Both halves need a slice that names the other.
- **A control must be subject to the mechanism it controls.** Every refusal
  census in this phase has a positive existence twin, because a census of
  refusals is satisfied perfectly by a schema in which nothing exists.
- **A fixture that shares a key with a live writer will flake**, and a test that
  fails on a change touching nothing it reads is the clearest available signal
  that it is time-dependent rather than input-dependent.
- **Suspect the probe before the product.** Seven times.

---

## 12. Phase 2I

**Not started.** A13 re-verified green at close: no Phase 2I PRD, no ADR
accepting a Phase 2I implementation, no `2I-*` requirement declarations, no
Phase 2I implementation files. Nothing in this phase created any of them, and
ADR-068 names no Phase 2I — the real successor gate is the fail-closed signup
rollout checklist, not A13.
