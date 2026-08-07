# Phase 2H — Edge Function deployment evidence

`2H-DEPLOY-007`, `2H-DEPLOY-003`. Slice 2H.5. Written 2026-08-07.

**This record consumes deployment evidence that already exists. It does not
redeploy.** Both functions are at parity; redeploying to refresh a timestamp
would produce a newer number and no new information, and would put a live
deployment inside a slice whose declared work is documents, scripts and
assertions.

---

## 1. The audit ADR-086 asked for, and what happened to it

ADR-086 recorded `process-jobs` staleness as a separate owner decision and asked
`2H-DEPLOY-007` for a **written audit**: the diff between the deployed `8982d74`
and the current worker source read against every migration applied since, with
every RPC the worker calls checked for a signature or grant change — the exact
defect class that stalled `delete-account`.

That audit was produced and lives at
[`PHASE_2H_PROCESS_JOBS_AUDIT.md`](PHASE_2H_PROCESS_JOBS_AUDIT.md). Its
recommendation was subsequently acted on, under separate authorization, during
2H.4: `process-jobs` was deployed **v21 → v22** to carry the `mode=dispatch`
drain's dead-man reporting (`2H-DEADMAN-001`).

**So the decision ADR-086 left open is closed**, and this record states how
rather than leaving a reader to infer it from a version number.

---

## 2. Deployment history, read back from the provider

Read 2026-08-07 from `GET /v1/projects/ulvwzqlpsjyrnqzfxmck/functions`:

| Function | Old version | **Current version** | Status | Created | Last updated | `verify_jwt` |
| --- | --- | --- | --- | --- | --- | --- |
| `process-jobs` | v21 | **v22** | `ACTIVE` | 2026-07-16T21:07:04Z | 2026-08-07T14:36:42Z | `false` |
| `delete-account` | v2 | **v3** | `ACTIVE` | 2026-08-04T19:43:00Z | 2026-08-07T13:15:22Z | `true` |
| `heartbeat` | — | **never deployed** | — | — | — | — |

`verify_jwt=false` on `process-jobs` is correct and not an oversight: the drain
is invoked by `pg_cron`/`pg_net` and by the application's nudge, neither of
which carries a user JWT. Its authentication is `WORKER_DISPATCH_SECRET`, not
the gateway. `delete-account` carries `verify_jwt=true` because a deletion is
always initiated by an authenticated person.

### The commands that produced these versions

```
npx supabase functions deploy process-jobs   --project-ref ulvwzqlpsjyrnqzfxmck
npx supabase functions deploy delete-account --project-ref ulvwzqlpsjyrnqzfxmck
```

Deployed **by name**, one at a time. `npx supabase functions deploy` with no
argument deploys **every** function in `supabase/functions/`, which would deploy
`heartbeat` — undeployed on purpose (`SH-EXPOSURE-005`).

---

## 3. Post-deploy parity — the gate, executed

```
$ npm run verify:edge-parity

function          deployed              last commit           state
delete-account    2026-08-07T13:15      2026-08-07T02:10      ok
heartbeat         (never)               2026-07-16T21:20      not deployed, by design
  SH-EXPOSURE-005: undeployed on purpose -- pg_cron calls run_all_heartbeats()
  inside the database, so the HTTP wrapper was an internet-reachable
  service-role endpoint with no caller.
process-jobs      2026-08-07T14:36      2026-08-07T14:25      ok

every deployed function is at or ahead of its source
```

**Fully green.** Each deployed function's deployment timestamp is at or ahead of
its source's last commit.

`heartbeat`'s state is `not deployed, by design` and **not** `ok`, deliberately.
Flattening the two would let a function that silently stopped being deployed
hide inside the allowlist's shape.

---

## 4. Behavioural verification — deployed, not merely present

A version number proves an upload. These are the reads that prove the deployed
code *does* something:

| Function | Evidence | Where |
| --- | --- | --- |
| `process-jobs` | The `mode=dispatch` drain reports its own runs. 49 seconds after the v22 deploy, both per-minute jobs read `success_empty`; under a naive "the call returned" definition both would already have read `success_work`. | `PHASE_2H_SLICE_04_ACCEPTANCE.md`; `npm run ops:health` |
| `process-jobs` | `my-brain-entry-dispatch` reads `current`, 0 minutes since last success, in today's `ops:health`. | §6 below |
| `delete-account` | Deletion executes end-to-end against the hosted project, with the CAPTCHA-guarded surface and the `account_deletion_log` row it writes. | `e2e/online-account-deletion.spec.ts`, `e2e/deployed-deletion-captcha.spec.ts`; 2H.1 acceptance |
| `delete-account` | The `reap` mode exists and classifies, but **invokes nothing** — the reaper is unarmed. | `npm run ops:deletion-reaper-schedule` |

---

## 5. No unrelated deployment

`heartbeat` remains **never deployed**. Its `created_at` is absent from the
provider listing entirely, which is the strongest possible form of this
evidence: not "deployed and then removed", but never deployed at all.

No other Edge Function exists in the project. The provider lists exactly two.

---

## 6. Live reading at the time of writing

```
$ npm run ops:health

SCHEDULED JOBS
  byok-prune-validation-attempts   never_reported    17 4 * * *  never reported
  my-brain-entry-dispatch          current           * * * * *  0 min since last success
  my-brain-hourly-heartbeat        current           0 * * * *  34 min since last success
  my-brain-job-reaper              current           * * * * *  0 min since last success
  sh-prune-auth-event-attempts     never_reported    43 4 * * *  never reported

EDGE FUNCTION PARITY
  delete-account    ok (v3)
  heartbeat         undeployed_by_design
  process-jobs      ok (v22)
```

**The two `never_reported` jobs are not a gap.** Both are 04:xx daily prunes
whose sweeps 2H.4 did not instrument; they are unreportable by construction
rather than merely silent. `ops:health` names them and exits non-zero, which is
the exit-code contract ADR-089 leaves for alerting.

---

## 7. Rollback posture, stated honestly

**There is no Edge Function rollback.** The provider keeps versions but exposes
no promote-a-previous-version operation through the CLI. Rolling back means
checking out the previous source and deploying it forward as a **new** version:

- the rollback is a deploy, with the same gate and the same version read-back;
- it is fast but it is not instant, and it is not a button;
- if the previous source depended on a schema a migration has since changed, the
  ordering hazard in the runbook's §3 applies in reverse — and migrations are
  never reverted as a normal rollback.

For `process-jobs` specifically, a rollback to v21 would remove the dead-man
reporting from the `mode=dispatch` drain, which would make
`my-brain-entry-dispatch` read `never_reported` again. That is a visible,
detectable consequence rather than a silent one, and `ops:health` would say so
within one tick.
