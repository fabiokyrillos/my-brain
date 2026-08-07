# Phase 2H — Slice 2H.4 — deployment record

**Date:** 2026-08-07
**Merge SHA:** `70d26a5` (PR #121, branch `codex/phase-2h-slice-4` preserved)
**Migration applied:** `202608070082_phase_2h_operator_surfaces.sql`
**Hosted parity after:** `202608070082`, **82 migrations, local = remote**
**Edge Function deployed:** `process-jobs` **v21 → v22**

---

## 1. The gates, in the order they were cleared

| # | Gate | Result |
| --- | --- | --- |
| 1 | PR-head CI on `4f1956f` | **green ×3**, read per job |
| 2 | The new pgTAP file actually *ran* | `phase_2h_operator_surfaces.sql ................. ok`, against the whole chain applied from an empty database |
| 3 | Merge | `70d26a5` |
| 4 | **Exact merge-SHA CI on `70d26a5`** | **green ×3** (`application`, `database and journey`, `edge worker`), read per job rather than from the run's overall conclusion |
| 5 | `db push --dry-run` | exactly one pending migration, `202608070082`, nothing riding along |
| 6 | Migration applied | `202608070082` |
| 7 | `verify:edge-parity` | reported `process-jobs` **STALE**, naming commit `4f1956f` |
| 8 | Rollback target recorded | `process-jobs` **v21**, `2026-08-07T13:19:36Z` |
| 9 | `process-jobs` deployed | **v22**, `2026-08-07T14:36Z` |
| 10 | `verify:edge-parity` | *every deployed function is at or ahead of its source* |
| 11 | Hosted acceptance | **39 pass · 0 fail** |
| 12 | Live liveness readback | both per-minute jobs reporting |

**Gate 2 is not ceremony.** A pgTAP file that is present but silently skipped
passes every gate that only reads the job's conclusion. The line was read out of
the run log.

---

## 2. Why the ordering was merge → migrate → deploy

2H.3 established that **a merge to `main` auto-deploys the application to Vercel
Production with no operator act**, while the database and the Edge Functions do
not move with it. 2H.3 therefore applied its migration *inside the merge window*,
because the deployed application would immediately call a function only the
migration created.

**2H.4 is the opposite case.** No `src/` file calls any of these RPCs —
`operator-surface-boundary.test.ts` asserts it by walking the tree — so the
application Vercel shipped at merge is behaviourally identical to the one before
it. The only new consumer is the `mode=dispatch` branch of `process-jobs`, which
is an Edge Function and does **not** move with a merge.

So the safe order is the one that was executed, and each window is harmless:

* **merge → migration applied**: the deployed application depends on nothing new;
  the deployed worker is still v21, which does not call the new RPCs.
* **migration applied → worker deployed**: the RPCs exist with no caller.

The reverse order — worker first — would have had the drain call
`record_scheduled_job_run` before it existed, receive `PGRST202`, log the code and
carry on. The drain's own work would be unaffected, so the failure mode is a
**silently unreported run**: precisely the thing this slice exists to remove.

**Merge-SHA CI green ×3 was still required and still verified.** Dependency
ordering decides *what happens in which order*, never *whether the gate applies*.

---

## 3. What was proved on the deployed system

### 3.1 The wiring reports, and it reports honestly

Read back 49 seconds after the deploy:

```
my-brain-entry-dispatch   success_empty  success 1  useful 0  empty-streak 1  failures 0
my-brain-job-reaper       success_empty  success 2  useful 0  empty-streak 2  failures 0
```

Two things this shows that a weaker check would not:

1. **`my-brain-entry-dispatch` reporting at all proves the Edge Function deploy
   worked end to end** — the drain reached PostgREST as `service_role` and the
   guarded RPC accepted it. Nothing in the repository could have shown that.
2. **Both say `success_empty`, not `success_work`.** The queue is idle, the ticks
   are succeeding, and the ledger says exactly that. Had `useful` been derived
   from "the call returned", both would already read `success_work` and the
   2H.0 census defect would have been rebuilt inside the mechanism designed to
   catch it.

`my-brain-job-reaper` shows 2 successes to entry-dispatch's 1 because the
in-database reaper began reporting the moment the migration applied, while the
drain could not report until the worker was deployed a few minutes later. The
asymmetry is the deployment order, visible in the data.

### 3.2 Three jobs still read `never_reported`, and that is correct

`my-brain-hourly-heartbeat` (top of the hour), `sh-prune-auth-event-attempts`
(04:43 UTC) and `byok-prune-validation-attempts` (04:17 UTC) had not ticked since
the migration. **They classify `never_reported`, not healthy**, which is the
whole design: no evidence of a successful run reads as *no evidence*, never as
health. They will report on their next scheduled tick with no further action.

`npm run ops:health` therefore **exits 1** and names all three under NEEDS
ATTENTION. That exit code is the entire interface ADR-089 leaves for an alerting
integration, and it is working on the first run.

### 3.3 `2H-SINK-005` proved live

The ERROR SINK section reads the 2H.2 calibration row — a genuinely stored event,
written by the real writer during 2H.2's own hosted acceptance:

```
server_action  other  unclassified  x1  0 with an owner  last 2026-08-07T07:39:38Z
```

The consumer is reading storage, not returning an empty set that would satisfy
the requirement's letter while repeating ADR-084's defect.

### 3.4 The privacy and grant contract, from the deployed catalog

* All five new reads `stable`; all six operator reads return a declared `TABLE`.
* No operator read declares a content-, credential- or session-shaped column,
  asserted from `pg_get_function_result` on the deployed project.
* The sink consumer returns no `id`, no `correlation_id` and no owner — checked
  both in the declared shape **and** in the rows it actually returned.
* Six new doors: `service_role` yes, `authenticated` no, `anon` no.
* `private.apply_scheduled_job_run`, `apply_scheduled_job_failure` and
  `scheduled_job_name`: executable by **no role**.
* **The Management API is refused.** It executes as `postgres` with a null
  `auth.role()`, so a guarded read must refuse it — and it does. That is kept as
  a *control*, not merely a gotcha: it proves the caller check is real rather
  than a grant, and it is why every behavioural probe above goes through
  PostgREST instead.

### 3.5 The queue read no longer inflates with age

`claimable now` reads **0** against four completed jobs. The first draft counted
`next_attempt_at <= now()`, which reports every finished job as backlog — a
queue-depth read that grows with age looks like a worsening problem and would
have shipped as a permanent false alarm.

---

## 4. A finding this deployment surfaced

**`src/lib/supabase/database.types.ts` had been stale for five migrations.**
Regenerating it against the hosted schema added 343 lines covering
`account_deletion_attempts` (2H.1), `error_events` and `scheduled_job_health`
(2H.2), `rate_limit_events` (2H.3), SH.6's twelve retention functions, and
BYOK's three narrow admin replacements — none of them Phase 2H.4's.

Nothing broke, and nothing could have: not one of those objects has a TypeScript
caller, so `tsc` had nothing to disagree with. But `ENGINEERING_STANDARDS`
requires the regeneration in the same change as the schema move, and four
changes did not do it. The regenerated file is adopted here, with `typecheck`,
`lint` and the full suite (**4179 passed**) green over it.

**The lesson is the same shape as ADR-084's**: a contract with no consumer
decays silently, because nothing is reading it closely enough to notice.

---

## 5. Posture, re-read after the deployment

| | |
| --- | --- |
| Signup | **disabled** at both layers |
| CAPTCHA | **enforced** |
| SMTP | **unconfigured** |
| Cron jobs | exactly **five**, unchanged |
| Deletion reaper | **unarmed** — no cron job, **0 of 2** Vault secrets |
| Retention sweeps | **none scheduled** — five user-content sweeps and both 2H.2 sweeps unscheduled |
| Purge | **none authorized, none executed** |
| Restore drill | **not executed** |
| Edge Functions | `delete-account` v3 ok · `process-jobs` v22 ok · `heartbeat` undeployed by design |
| Phase 2I | **not started** |

**Migration budget: 5 allocated · 4 spent · 1 remaining** — 2H.5's, and 2H.6
holds none.

---

## 6. What did not happen

Nothing was created, deleted, scheduled, armed or purged. Every probe is a read;
the one command that writes anything is the CLI's own `--enable` on the deletion
reaper, which was not run. No disposable fixture was created, so there is no
residue to clean up.

---

## 7. The defect the deployment record's own CI run found

**Instrumenting a live scheduled function made every test that used its name
flaky, and it took three runs to show.**

`202607170019` schedules `my-brain-job-reaper` **every minute**, and that cron
job is active inside the CI container. 2H.4 made `reap_expired_jobs` write to
`scheduled_job_health` — so a real tick began **committing** a row under the
exact key 2H.2's suite used as a ledger fixture. When a minute boundary lands
inside the suite's ~5-second window, `record_scheduled_job_run` takes its
`ON CONFLICT DO UPDATE` path against the committed row and the counts are one
higher: `have: 3/1, want: 2/1`.

**It passed on the slice PR and on the merge SHA, and failed on the docs-only
PR that followed.** A change that touches nothing pgTAP reads is the clearest
possible signal that a test is time-dependent rather than input-dependent, and
that is the only reason it was caught rather than absorbed as noise.

Section 9 was exposed twice over: it *backdates* the same row to prove
`stale`, which races the same tick.

### The fix, and the rule behind it

**A fixture that shares a key with a live writer is a fixture that will flake.**

* **Section 8** now uses `2h2-ledger-control` — synthetic, no cron entry, no
  writer. Those assertions are about the ledger's arithmetic; the name was never
  part of the claim.
* **Section 9** needs a *real* cron job, because `scheduled_job_liveness` joins
  the catalog. It uses `my-brain-entry-dispatch`, the one 1-minute job that
  cannot self-report in CI: its statement posts over HTTP guarded by
  `where exists (... vault.decrypted_secrets ...)`, and those secrets do not
  exist there, so it calls no reporter. Same interval, so every 3×/30×
  threshold is unchanged.
* **The `never_reported` subject** moved off `my-brain-hourly-heartbeat`, which
  now reports its own runs and would read `current` for a suite that ran at the
  top of an hour, onto `sh-prune-notifications`, whose sweep 2H.4 did not
  instrument — **unreportable by construction rather than unlikely to have
  reported**.

`phase_2h_operator_surfaces.sql` deliberately keeps asserting against the real
`my-brain-job-reaper`, because *that* file's subject is the real path. Its
assertions survive a concurrent tick for a reason now written into the file:
only `last_outcome` is asserted absolutely, `useful_count` cannot be moved by a
tick (reaping needs a **committed** expired lease and the fixture lives inside
the transaction), and once the first call touches the row it holds the lock for
the rest of the section.
