# `process-jobs` deployment audit — the evidence ADR-086 asked for

- **Status:** Audit complete. **Recommendation made. Nothing deployed.** ADR-086 stays `Proposed` until the owner decides.
- **Requirement:** `2H-DEPLOY-007`. **Authorization:** the owner authorized the audit and explicitly did **not** authorize deploying `process-jobs` in this run.
- **Date:** 2026-08-06. Every figure below was read, not recalled; the read commands are named beside each.

---

## 1. The deployed version

`npm run verify:edge-parity`:

```
function          deployed              last commit           state
delete-account    2026-08-06T14:40      2026-08-05T19:27      ok
heartbeat         (never)               2026-07-16T21:20      not deployed, by design
process-jobs      2026-08-02T02:42      2026-08-05T18:55      STALE
  undeployed: 8982d74 feat(bounds): one home for the file limits, the input bounds and the body bound
```

- **Deployed at:** `2026-08-02T02:42Z` (= `2026-08-01T23:42-03:00`).
- **Newest deployable source commit:** `8982d74`, `2026-08-05T15:55:40-03:00`.
- **Drift:** three days, three deployable commits.

The deployed build corresponds to the tree at **`7be25f0`** (`2026-08-01T17:58:53-03:00`) — the last commit touching deployable worker source before the deployment timestamp.

## 2. Every material source change since the deployed version

Read with `git log --since=2026-08-01 --name-only -- supabase/functions/process-jobs supabase/functions/_shared`, then filtered to **deployable** files (`.ts` excluding `*.test.ts`, `.json`) and to commits dated after `2026-08-01T23:42-03:00`.

| Commit | Date | Deployable files | What it changes | Material? |
| --- | --- | --- | --- | --- |
| `715dc15` | 2026-08-02 13:19 | `_shared/byok-adapter.ts`, `_shared/byok-rotation.ts` | The bounded two-key BYOK master-key rotation window | **Yes** |
| `7d84a2b` | 2026-08-04 14:49 | `_shared/lifecycle-gate.ts`, `process-jobs/{attachment,dispatch,entry}.ts` | The worker re-verifies account lifecycle at its own reload (SH-WORKER-002/003) | **Yes** |
| `8982d74` | 2026-08-05 15:55 | `process-jobs/{index,request-bounds}.ts` | A request body byte bound applied **before** `request.json()` (SH-QUOTA-008) | **Yes** |
| `9d23214` | 2026-08-05 20:13 | *(none — `dispatch.test.ts` only)* | Report re-filing | No — test-only, correctly not counted by the parity check |

**Three material changes.** Confirmed by direct comparison of the two trees rather than by reading commit messages:

| Property | Deployed build (`7be25f0`) | Current source | Read by |
| --- | --- | --- | --- |
| `_shared/lifecycle-gate.ts` present | **absent** | present | `git ls-tree` |
| `_shared/byok-rotation.ts` present | **absent** | present | `git ls-tree` |
| Lifecycle references in `dispatch.ts` | **0** | 1 | `grep -c` |
| Lifecycle references in `entry.ts` | **0** | 8 | `grep -c` |
| Lifecycle references in `attachment.ts` | **0** | 7 | `grep -c` |

So the deployed worker has **no lifecycle gate and no rotation-window support**, and parses request bodies with no byte bound.

## 3. Every migration and hosted contract that may affect it

Twelve migrations exist at or after the BYOK head; the deployed build was cut during `202608010069`'s era. Applied since, and their bearing on the worker:

| Migration | Bearing on `process-jobs` | Breaks the deployed build? |
| --- | --- | --- |
| `202608040070` `account_lifecycle` | new table the deployed build never reads | **No** — additive |
| `202608040071` `account_lifecycle_wiring` | puts the lifecycle predicate **inside** the claim RPCs | **No** — the refusal is server-side; the deployed build simply never sees such a job |
| `202608040072` `account_deletion` | deletion executor; disjoint from the worker | No |
| `202608040073` `account_lifecycle_admin` | admin surface; disjoint | No |
| `202608040074` `policy_acceptances` | consent; disjoint | No |
| `202608040075` `auth_event_attempts` | auth throttle; disjoint | No |
| `202608050076` `quota_enforcement` | per-user quotas on capture, not on the worker's own path | No |
| `202608050077` `retention_and_exposure` | **the migration that broke `delete-account`** by revoking a grant its deployed build depended on | **No — checked specifically.** The revocations target the BYOK credential tables and the deletion path, not the RPCs the worker calls |
| `202608060078` `phase_2g_composer_capture_source` | widens `captureSource` by `'composer'` and `failureKind` by `'quota'` | **No** — both widenings are **additive**, so no previously-valid payload became invalid |

**The RPC surface the worker calls** (`begin_entry_interpretation`, `claim_next_entry_interpretation_job`, `complete_job`, `defer_job_for_inactive_owner`, `fail_entry_interpretation`, `fail_job`, `fail_job_terminal`, `mark_entry_awaiting_ai_configuration`, `persist_entry_interpretation`, `persist_reprocessed_entry_interpretation`, `record_ai_usage`, `record_product_event_for_user`, `resolve_job_ai_credential`, …) was checked against those migrations for the **specific defect class that stalled `delete-account`**: a signature change or a revoked grant under a build that still calls the old shape.

**No such change was found.** `defer_job_for_inactive_owner` is the one RPC the *current* source calls that the *deployed* build does not — which is the safe direction: a function the deployed build never invokes cannot break it.

## 4. Is the stale deployment currently reachable?

**Yes, reachable — and idle.** Read-only query against the hosted `jobs` table with the service role:

```
total jobs: 4
by type/status: {"interpret_entry/completed": 4}
non-terminal: 0
newest job activity: 2026-08-02T13:06:59Z
```

Three facts follow, and the third is the one that decides the recommendation:

1. **Nothing is stuck.** Zero jobs in `pending`, `running`, `failed` or any non-terminal state. There is no `delete-account`-shaped silent breakage waiting to be found.
2. **The deployed build has demonstrably worked.** The newest job completed at `2026-08-02T13:06:59Z` — *after* the `02:42Z` deployment — in one attempt, in about 15 seconds. The currently deployed build processed it successfully.
3. **There has been no traffic since.** Four jobs total, the newest four days old. So the absence of failures is **weak evidence**: the deployed build is not proven healthy against current contracts, it is merely unexercised against them. Saying "no observed breakage" without saying "and almost nothing has been observed" would overstate the case.

## 5. Risk of deploying

| Risk | Severity | Note |
| --- | --- | --- |
| A new build breaks the live capture path | **Low, not negligible** | The interpretation path is the one real user-facing dependency. It is exercised by CI's `worker` job (`deno check` + full `deno test`) on every commit, but **never against the hosted database** |
| The lifecycle gate refuses work it should not | Low | The gate's positive and negative cases are pgTAP- and Deno-tested; the database predicate has been live since `202608040071` with no incident |
| The body bound rejects a legitimate request | Low | The bound is on request *bytes* before parse; the nudge payloads are small and fixed-shape |
| BYOK rotation module misbehaves | Low | Rotation is dormant unless a previous key is configured; `npm run byok:verify-runtime` is the pre-flight |
| Deploying during the CI incident confuses attribution | **Moderate** | If capture broke afterwards, the cause would be ambiguous between the deploy and everything else in flight |

## 6. Risk of not deploying

| Risk | Severity | Note |
| --- | --- | --- |
| **No worker-side lifecycle re-verification** | **Moderate** | The database refuses the *claim* for a non-active owner (`202608040071`), so the primary control is deployed. What is missing is the defence-in-depth for the **reload window** — a job claimed while the owner was active, whose owner is suspended or set to `deleting` before the worker reloads the entry. Narrow, real, and the exact window SH-WORKER-002 was written for |
| **No request body bound before parse** | **Moderate** | `process-jobs` is internet-reachable and the deployed build calls `request.json()` on whatever arrives **before authentication**, because the dispatch branch is selected from the parsed body. `Content-Length` is not consulted. This is an unauthenticated memory-amplification surface — precisely what SH-QUOTA-008 closed |
| **No rotation-window support** | Low–Moderate | If a BYOK master-key rotation is ever begun, the deployed worker cannot decrypt with the previous key. Dormant today; would become an incident the moment rotation starts |
| Drift keeps growing | Moderate | Each further migration widens the window in which the `delete-account` failure mode can recur, and this is the finding's third consecutive closeout |

**The asymmetry, stated plainly.** The deploy risk is *speculative* (a regression that testing has not found). The no-deploy risk is *known and enumerated* — three specific controls that exist in the repository and are not running in production, one of them an unauthenticated parse of an unbounded body. That is the opposite of the balance ADR-086 assumed when it was drafted, and it is why this audit changes the recommendation's shape rather than merely confirming it.

## 7. The exact non-destructive verification lane

Executable in this order; **none of it writes production domain data**.

1. `npm run byok:verify-runtime` — proves the deployed master-key material matches what the new build expects. Memory of the 2026-08-02 incident: run this **first**, and suspect the harness before the product.
2. `deno test` over `supabase/functions/` — CI already does this on every commit with no `--allow-*` flags; re-read the `worker` job on the deploy candidate SHA rather than re-running by hand.
3. `npx supabase functions deploy process-jobs` — *the deploy step; owner-authorized, not part of verification.*
4. `npm run verify:edge-parity` — must report `process-jobs` **ok**, with `deployed` newer than `8982d74`.
5. Health probe with **no** job present: `POST` the function's nudge shape with an empty queue. Expect a well-formed "nothing to do" response, not a 5xx. Proves the new build boots, authenticates and reaches the database.
6. Body-bound probe: `POST` a body above the new byte bound and expect the declared refusal **before** parse — the control that is being added, exercised rather than assumed. Use a disposable payload, never real content.
7. End-to-end drain on a **disposable** account: capture one entry, confirm the job reaches `completed` and the interpretation persists, then delete the account through the proven deletion path. Zero residue verified by `npm run verify:online-residue`.
8. Re-read `jobs` for non-terminal rows: expect zero.

Step 7 is the only one that creates data, it uses a disposable account, and it is removed by the same terminal-deletion path proven end to end on 2026-08-06.

## 8. Rollback procedure

Supabase Edge Functions have **no version-pinned rollback command**; rollback is a forward deploy of the previous source.

1. **Before deploying, record the current deployed state**: `npm run verify:edge-parity` output and the function's `updated_at`, pasted into the deployment record. Without this the rollback target is a guess.
2. The rollback target is the tree at **`7be25f0`** — the build currently running.
3. To roll back: `git checkout 7be25f0 -- supabase/functions/process-jobs supabase/functions/_shared`, deploy, then **restore the working tree** (`git checkout HEAD -- …`). Never commit the reverted worker to `main`; the repository stays ahead and the deployment moves back.
4. **Rollback is not free.** The deployed-era build predates `lifecycle-gate.ts` and `byok-rotation.ts`, so rolling back re-opens exactly the three gaps in §6. Rollback is an incident response, not a resting state.
5. Verify rollback with `verify:edge-parity` (expected: `STALE` again — the honest reading) and one job drain.
6. **No migration is reverted in any rollback path.** The applied chain stays applied; that is the standing posture and nothing here changes it.

## 9. Recommendation

**Deploy `process-jobs` — as its own change, on its own authorization, after §7 steps 1–2, and not inside any Phase 2H slice merge.**

The reasoning, and where it departs from ADR-086's draft:

- ADR-086 assumed a genuine two-sided risk. The audit does not support that symmetry. **Not deploying has three named, live gaps**; deploying has one speculative gap that CI already tests on every commit.
- The strongest argument for waiting — "no observed breakage" — is **weak evidence, and the audit says so**: four jobs total, none since 2026-08-02. The deployed build is unexercised, not proven.
- The migration audit found **no signature or grant change** affecting any RPC the deployed build calls, so the `delete-account` failure mode is specifically **not** present here. The deploy is therefore ordinary rather than a repair under pressure.
- **Timing is the one real argument for waiting.** With the GitHub Actions incident unresolved and merge-SHA CI not yet green, a production worker deploy would land in a window where attribution is muddled. The recommendation is to deploy **after** baseline CI is green, not immediately.

**This audit deploys nothing.** ADR-086 stays `Proposed`. The owner decides, and the deploy — whenever it happens — is a standalone authorized action, never bundled into a slice.
