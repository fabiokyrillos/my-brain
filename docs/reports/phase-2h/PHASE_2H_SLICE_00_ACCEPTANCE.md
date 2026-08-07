# Phase 2H — Slice 2H.0 — pre-code gates — ACCEPTANCE

- **Slice:** 2H.0, the pre-code gates. **Zero migrations** (budget: 0 allocated, 0 spent; phase total unchanged at **5 allocated · 0 spent**).
- **Authorization:** the owner authorized 2H.0 only, after PR #112 merged at `05e418d` with exact merge-SHA CI green ×3.
- **Nothing was deployed, enabled, scheduled, purged or opened.** No hosted mutation occurred: every hosted interaction below is a read or a refused read.
- **Requirements touched:** `2H-DEPLOY-005` (via ADR-087). The remaining gates are plan-level gates (`G-2H.1…G-2H.6`), not PRD requirements, and are recorded here.

---

## 1. Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| **G-2H.1** — merge-SHA CI green ×3 for the baseline | ✅ **PASS** | `508cf6c` run `31116254874` attempt 6: `application` success (11 steps), `database and journey` success (21), `edge worker` success (9) |
| **G-2H.2** — deployment census | ✅ **PASS, one gap recorded** | §2 |
| **G-2H.3** — scheduled-job census | ✅ **PASS, zero stale, zero duplicated** | §3 |
| **G-2H.4** — deletion-stall reproduction | ✅ **PASS, exact error reproduced** | §4 |
| **G-2H.5** — owner value signature | ✅ **PASS** | Signed 2026-08-06; `PHASE_2H_PRD.md` §14.2 |
| **G-2H.6** — hosting decision recorded | ✅ **PASS** | ADR-087 |

**All six pre-code gates are green.** Slice 2H.1 is unblocked *by the gates* and remains **unauthorized by the owner**.

## 2. G-2H.2 — deployment census

### Application

| Property | Value |
| --- | --- |
| Platform | Vercel |
| Production deployment | `05e418d`, created `2026-08-07T00:37:12Z` |
| Trigger | **Automatic** on merge to `main` |
| Preview deployments | one per branch push (five observed this session) |

**Finding D-1 — merging deploys production.** The PR #112 merge created a Production deployment without an operator act. This is intended Vercel behaviour, but it had never been written down, and it means *a docs-only merge ships the application*. Recorded in ADR-087 §Decision 2.

### Edge Functions

| Function | Deployed | Newest deployable source | State |
| --- | --- | --- | --- |
| `delete-account` | `2026-08-06T14:40` | `2026-08-05T19:27` | **ok** |
| `heartbeat` | **never** | `2026-07-16T21:20` | **not deployed, by design** (SH-EXPOSURE-005) |
| `process-jobs` | `2026-08-02T02:42` | `2026-08-05T18:55` | **STALE** |

**Finding D-2 — one parity gap, already governed.** `process-jobs` is behind by three deployable commits (`715dc15`, `7d84a2b`, `8982d74`). Fully audited under `2H-DEPLOY-007`; ADR-086 is Accepted with four binding conditions and **the deployment was not performed** — condition 3 (`508cf6c` green ×3) is now satisfied, condition 4 (no deploy during the incident) has lapsed with the incident's recovery, but **execution remains a separate owner action that this slice does not take.**

### Database

| Property | Value |
| --- | --- |
| Local migration files | **78** |
| Local chain head | `202608060078` |
| Hosted head | `202608060078` |
| Parity | **exact** — every listed version matches local, remote and both |

**Finding D-3 — migration parity is exact and requires no action.**

### Parity gaps, complete list

1. `process-jobs` — stale by three deployable commits (D-2). **The only gap.**

`heartbeat`'s undeployed state is not a gap: it is a recorded decision with a guard (`heartbeat-disposition.test.ts`).

## 3. G-2H.3 — scheduled-job census

Enumerated from the hosted `cron.job` catalog at run time, with last-run evidence from `cron.job_run_details`. **No job was enabled, disabled, created or removed.** Catalog values are treated as data.

| jobid | jobname | schedule | active | last run (UTC) | succeeded | failed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `my-brain-hourly-heartbeat` | `0 * * * *` | true | 2026-08-07 00:00:00 | 508 | **0** |
| 2 | `my-brain-job-reaper` | `* * * * *` | true | 2026-08-07 00:43:00 | 29 549 | **0** |
| 3 | `my-brain-entry-dispatch` | `* * * * *` | true | 2026-08-07 00:43:00 | 29 042 | **0** |
| 4 | `byok-prune-validation-attempts` | `17 4 * * *` | true | 2026-08-06 04:17:00 | 5 | **0** |
| 5 | `sh-prune-auth-event-attempts` | `43 4 * * *` | true | 2026-08-06 04:43:00 | 1 | **0** |

Catalog clock at census: `2026-08-07 00:44:00Z`. `job_count = 5`, `distinct_names = 5`.

### Classification

- **Active: 5.** All five above.
- **Stale: 0.** Measured against the proposed `2H-DEADMAN-002` threshold of 3× each job's own interval: the two per-minute jobs last ran 1 minute before the census; the hourly job 44 minutes before, inside one interval; the two daily jobs ~20 hours before, inside one interval.
- **Duplicated: 0.** Five jobs, five distinct names, five distinct ids. The migrations' unschedule-then-schedule pattern held.
- **Unscheduled by design: 5 retention sweeps.** Seven `prune_*` functions exist; **two are scheduled** (`prune_auth_event_attempts`, `prune_credential_validation_attempts` — throttle-attempt tables, not user content), and **five are built and deliberately not scheduled**: `prune_heartbeat_runs`, `prune_notifications`, `prune_product_events`, `prune_terminal_jobs`, `prune_undo_operations`. This is ADR-082's posture exactly — scheduling *is* authorization.
- **Intentionally removed: 0.**

**Finding S-1 — "retention is unscheduled" needs the qualifier, or it reads as false.** Two `prune_*` jobs *are* on the schedule and run daily. They prune authentication and credential-validation **attempt** records, not user content, and they are not what the owner's retention-activation task refers to. Anyone reading the catalog without this distinction will conclude retention is already running. Recorded so the runbook and the rollout gate cannot be misread.

**Finding S-2 — a succeeded tick is not work done.** `my-brain-entry-dispatch` has 29 042 successes, while the `jobs` table holds 4 rows, all completed, newest `2026-08-02T13:06:59Z`. The cron status records that the *statement* succeeded, not that anything was processed. `2H-DEADMAN-001` must record last-successful-**run**, and any future "healthy" claim built on tick counts would be measuring silence.

## 4. G-2H.4 — historical deletion-stall reproduction

**The failure being reproduced.** The build deployed on 2026-08-04 (`eb92035`) read `user_ai_credentials` **directly** with `service_role`. On 2026-08-05, migration `202608050077` (SH-EXPOSURE-001) revoked that grant while `357cd63` narrowed the executor to the `admin_credential_status` RPC **in the repository only**. From then the deployed executor's step 5 errored for **every** account and stopped with `credential_not_erased`.

**Method, and its limits stated plainly.** The reproduction is in two parts because the old build is no longer deployed and deploying it is neither authorized nor safe:

**(a) The dependency shape, reproduced live against the hosted project — read-only.** No account was created, stalled or mutated; no fixture was written; the user id used is a random UUID and appears only in a `SELECT` of one column.

| Probe | Call | Result |
| --- | --- | --- |
| **A — old shape** | `service_role` `SELECT status FROM user_ai_credentials` | **`403` / `42501` — `permission denied for table user_ai_credentials`** |
| **B — new shape** | `service_role` `rpc admin_credential_status(<random uuid>)` | **`200 null`** |
| **C — control** | `service_role` `SELECT status FROM account_lifecycle` | **`200 [{"status":"active"}]`** |

Probe **A reproduces the exact error the stall report recorded**, verbatim. **B** shows the current shape answers `null` — the "no credential row" case the executor treats as success, which is why the redeploy fixed it. **C exists because A alone proves nothing**: had the service-role key been broken, A would have failed for the wrong reason and the probe would have agreed with itself. C makes A's refusal attributable to the revocation rather than to the credential.

**(b) The failure branch, proven in code.** The executor's behaviour when that check errors is pinned by the existing Deno test **`stops, and deletes nothing, when the credential check itself fails`** (`supabase/functions/delete-account/executor.test.ts`, added by PR #110). It is cited rather than duplicated. Its sibling, `completes for an account that never configured a credential`, pins the `null` case so the first is not passing for want of a check.

**What this does *not* claim.** The end-to-end `409 credential_not_erased` HTTP response was **not** re-elicited from a live deployment, because that would require deploying the old build. (a) proves the cause is live and reproducible; (b) proves the consequence follows from it. Stating the seam is the point — a reproduction that quietly substitutes a unit test for a live cause is the failure mode this gate exists to avoid.

**Residue: zero.** Nothing was created, so nothing required cleanup. Verified by construction rather than by a sweep: probes A and C are `SELECT`s, B is a `security definer` function whose body is a single `SELECT` (`202608050077:640-664`), and no `INSERT`, `UPDATE`, `DELETE` or storage call was issued.

**The reaper was not implemented.** `2H-RECOVER` remains unbuilt and unauthorized.

## 5. What this slice did not do

No migration created. No product code changed. No Edge Function deployed. No hosted configuration changed. No cron job enabled, disabled or altered. No retention schedule enabled. No purge executed. No signup setting touched. No SMTP configured. No restore drill performed. No `process-jobs` deployment. Phase 2H.1 not started.

## 6. Destructive-posture read-back

| Control | State |
| --- | --- |
| `disable_signup` | **`true`** |
| `security_captcha_enabled` | **`true`** (turnstile) |
| Retention sweeps | **5 built, unscheduled** (ADR-082) |
| Purge | **none due, none authorized** — total prunable across all classes **0** |
| `process-jobs` | **not deployed**, still `2026-08-02T02:42` |
| Migration head | `202608060078`, local = remote |
