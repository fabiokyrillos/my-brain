# Phase 2H — Slice 2H.1 — deletion recovery — ACCEPTANCE

- **Slice:** 2H.1, the stalled-deletion recovery mechanism. **One migration** (`202608070079`) — the slice's entire allocation. Phase budget after this slice: **5 allocated · 1 spent · 4 remaining**, per-slice and non-transferable.
- **Requirements:** `2H-RECOVER-001` … `2H-RECOVER-006`. All six delivered; each is cited below against executed evidence.
- **Decision recorded:** ADR-088 — the reap door on `delete-account`, and why a database-issued lease rather than a target parameter is what bounds it.
- **Authorization:** the owner's Phase 2H execution authorization (2026-08-07), which covers 2H.1 through 2H.6, the five allocated migrations, merging on green gates, and applying each migration after exact merge-SHA CI is green ×3.
- **Nothing destructive was enabled, scheduled, purged or opened.** The migration schedules no job and asserts that about itself. Retention stays unscheduled, signup stays closed, CAPTCHA stays enforced, SMTP stays unconfigured.

---

## 1. The defect this closes, restated so the evidence can be judged against it

On 2026-08-04 migration `202608050077` revoked the grant the **deployed** `delete-account` build's step 5 depended on, while the narrowing that replaced it (`357cd63`) existed only in the repository. Every deletion answered `credential_not_erased`. Every affected account stayed in `deleting` with all writes refused, and **nothing re-ran the executor**. What surfaced it, two days later, was a person trying to delete an account.

The closeout record named the gap in these words: *"`re-runnable` was implemented as a property, not a mechanism."* The executor was idempotent and resumable — both true, both good — and unreachable, because the only door it had derives the account from a Bearer token and a stranded account has nobody holding one.

## 2. The order this was built in, and why the order is the safety property

The plan fixes it (§2H.1) and it was followed exactly: **(1)** the attempt/backoff/terminal state; **(2)** the bounded classification; **(3)** the reaper that consumes it; **(4)** the operator projection; **(5)** the audit hook; **(6)** the historical reproduction. A reaper written before its ceiling is an unbounded retry loop against the most destructive operation in the product, and the file is laid out so that reading it top to bottom meets the bound before it meets the loop.

## 3. Requirement-by-requirement

| Requirement | Delivered | Evidence |
| --- | --- | --- |
| **2H-RECOVER-001** — retried automatically | ✅ | `202608070079` §3 `claim_stalled_account_deletions` + §7 `reap_stalled_account_deletions`; pgTAP §5 ("an account whose last attempt is older than the declared threshold is claimed with no human action"); `reap.test.ts` "a claimed account is deleted by the same executor the product uses" |
| **2H-RECOVER-002** — bounded, backed off, terminal | ✅ | pgTAP §4–§8: ceiling validated as a required argument, backoff asserted **exactly** (`next_attempt_at - last_attempt_at = 15 minutes` at attempt 1), five attempts spent and not six, terminal `stalled`, and a stalled row never claimed again "however overdue it looks" |
| **2H-RECOVER-003** — re-invokes, never deletes, no wider capability | ✅ | pgTAP §10 reads the function bodies from `pg_proc`: no recovery function contains a `DELETE` at all, none mentions `auth.users` or the storage catalog. `reap.test.ts` proves a valid secret cannot point the executor at an unclaimed account. `deletion-capability-guard.test.ts` asserts `reap.ts`'s **absence** from the capability allowlist |
| **2H-RECOVER-004** — operator-readable reason, log not widened | ✅ | `operator_stalled_deletions`; pgTAP §1 proves `account_deletion_log` is still unreadable by every role **including `service_role`**, §8 proves the reason, the attempt count and the classification are readable, §10 proves no recovery function so much as mentions the log |
| **2H-RECOVER-005** — every retry auditable | ✅ | Three `audit_logs` action types, `actor = 'system'`; pgTAP §5, §7 assert one row per claim, one per result and one for going terminal, and that a **forged token writes none** |
| **2H-RECOVER-006** — the actual historical defect | ✅ | pgTAP §7 drives an account through five attempts each stopping with exactly `credential_not_erased` — the shape `202608050077` produced — to its terminal classification. `reap.test.ts` covers the worker half through the reap door. The pre-existing executor test `stops, and deletes nothing, when the credential check itself fails` is cited, not duplicated |

## 4. What the mechanism is, in one paragraph

An account entering `deleting` is seeded into `account_deletion_attempts` by a trigger on the lifecycle machine, so both the user's route (`request_account_deletion`) and the operator's (`begin_account_deletion_admin`) are covered without either function changing. A scheduled tick claims rows whose backoff has elapsed, hands each a single-use expiring lease, applies exponential backoff (base 2, from 15 minutes, capped at 6 hours) and, once the account has spent its ceiling of 5, classifies it terminally `stalled` instead of retrying it. Each claim is posted to the deployed executor through a second door guarded by a secret and the lease. The executor's refusals are unchanged and still final. An operator reads the whole population — count, reason, timestamps, classification — through one `service_role`-only function.

## 5. Three design decisions worth defending explicitly

**The lifecycle status does not move.** The obvious design adds `stalled` to `account_lifecycle.status`. It is wrong and dangerously so: every SH.1 predicate that blocks writes tests for `deleting`, so an account moved to a new status would silently become **writable again mid-deletion**. `stalled` is therefore a recovery classification carried in a separate table, and pgTAP §5 asserts the lifecycle status is still `deleting` after a claim.

**The migration schedules nothing.** ADR-082 is binding: scheduling *is* authorization, and Signup Hardening learned it when `202608050077` scheduled five destructive sweeps that no owner had approved. The reaper is armed by `npm run ops:deletion-reaper-schedule -- --enable` plus two Vault secrets. The migration's own postcondition fails if a future edit adds the schedule to it, and pgTAP §9 asserts the job is absent.

**Unarmed is not the same as absent.** The tick still claims, still applies the ceiling and still classifies — it simply invokes nothing. So the operator read answers *is anything stuck?* from the first minute, and arming only adds the automatic retry. pgTAP §9 asserts the reaper reports itself `armed: false` and `dispatched: 0` rather than pretending, which is also the CI database's honest state.

## 6. Concurrency, and what pgTAP could not prove

pgTAP runs in one session and one transaction. Two "concurrent" claims there serialise, agree with each other, and prove nothing about `FOR UPDATE ... SKIP LOCKED` — a serial loop dressed as a race. So exactly-once is proven separately, by `scripts/phase-2h-deletion-reaper-race.mjs`, added to the CI `database` job:

- **8** stuck accounts, **6** concurrent PostgREST connections, each racer permitted a limit of **10** so the limit is not what serialises them;
- asserts the union of claims has no duplicate, covers every seeded account, hands each out at attempt 1, and issues distinct lease tokens;
- a **control**: a further pass claims **0**, because every row is under a live lease. Without it, a claim function that returned rows without locking them would still pass every assertion above;
- the validator is **mutation-proven**: five mutations (a duplicate claim, a dropped row, a reused token, a spent attempt count, a lease that failed to hide its row) are each asserted to be rejected. A validator that only ever sees passing evidence is a validator nobody has exercised;
- disposable accounts are removed and the removal is **verified** through the operator read, not assumed.

It runs against the local stack deliberately: a hosted run would put disposable users in the production auth table to prove a property that is identical locally.

## 7. Local gates

| Gate | Result |
| --- | --- |
| `npm run lint` | ✅ zero errors |
| `npm run typecheck` | ✅ zero errors |
| `npm test` | ✅ **4110 passed, 0 failed** (3 file-load failures are the documented Windows-only shebang baseline; green in CI) |
| `deno test` over `delete-account/` | ✅ **28 passed, 0 failed** (17 executor + 11 reap) |
| `deno check` on the entrypoint | ✅ |
| pgTAP `phase_2h_deletion_recovery.sql` | 52 assertions — executed by the CI `database` job against the whole chain applied to an empty database |
| `phase-2h-deletion-reaper-race.mjs` | executed by the CI `database` job |

Five repository guards fired during this slice and were answered rather than suppressed: the history vocabulary demanded copy in both locales for the three new audit action types; the deletion-capability guard demanded the race script be allowlisted with a reason and its census line updated; the cleanup partition demanded `account_deletion_attempts` be scanned or excused; the documentation guard demanded `SECURITY.md` name the new chain head; and the traceability guard found two now-false "not yet applied to the hosted project" claims about `202608060078` in `STATE.md` and `TODO.md`, which were struck and corrected rather than deleted.

## 8. Adversarial review

| Attack | Answer |
| --- | --- |
| "The reaper deletes something the executor refused to" | It contains no `DELETE`, asserted from `pg_proc` (pgTAP §10). It posts; the executor decides |
| "The retry loop never ends" | Ceiling is a **required argument** with no default, hard-capped at 50 by a CHECK, and the terminal state is asserted after exactly five attempts |
| "The backoff overflows before the cap applies" | Real risk, and handled: `interval * 2^49` overflows, and an overflow raised *before* `least()` would turn the bound into the thing that breaks. The exponent is capped at 30 before the multiplication |
| "The reap secret is a service-role HTTP endpoint by another name" | It takes one action on one account, and cannot choose the account: a valid secret with an arbitrary id gets `409` (executed test). ADR-088 §"Why this is not the generic privileged endpoint" |
| "An unset secret opens the door" | It closes it. Asserted by a test where the presented value **matches** the configured one and is still refused, because both are below the minimum length |
| "The operator read leaks the session hash" | It reads neither the log nor any hash column; asserted three ways — the column census, the grant probe, and the body scan |
| "A cancelled deletion keeps being retried" | The lifecycle trigger deletes the recovery row on the way out of `deleting`; pgTAP §3 |
| "Two reapers delete one account twice" | §6, with a control and five rejected mutations |
| "The migration quietly schedules a purge" | Its own postcondition fails if it did; pgTAP §9 asserts the job's absence |
| "This claims a working reaper while nothing is deployed" | It does not, and §9 below is where that is stated rather than implied |

## 9. Threat-model rows this slice must answer

`PHASE_2H_THREAT_MODEL.md` is the per-slice review floor: no slice merges with an unanswered row that touches it. Six rows touch 2H.1.

| # | Answered by | Executed evidence |
| --- | --- | --- |
| **T-2H-01** — the reaper becomes a second write path to deletion | The reaper contains no `DELETE`, and the recovery functions hold no table privilege on anything they could delete from | pgTAP §10 reads `prosrc` from `pg_proc` for all five functions; §1 proves `service_role` holds no DML on the recovery table itself |
| **T-2H-02** — unbounded retry hiding a permanent failure | Ceiling as a required argument, hard-capped at 50 by CHECK; terminal `stalled` | pgTAP §7 drives past the ceiling and asserts it **stops and becomes visible** in the same section |
| **T-2H-03** — resurrecting a cancelled deletion | The lifecycle trigger removes the recovery row on the way out of `deleting`; the executor re-checks | pgTAP §3 (reverted account loses its row); `reap.test.ts` flips the state **between claim and invoke** and asserts `lifecycle_not_deleting` with nothing deleted |
| **T-2H-04** — two overlapping reapers invoke for one account | Lease plus `FOR UPDATE ... SKIP LOCKED` | pgTAP §6 for the single-session half; `phase-2h-deletion-reaper-race.mjs` for the real one, with a control and five rejected mutations |
| **T-2H-11** — the projection leaks `account_deletion_log`'s session hash | An explicit column allowlist, never `select *`, and the log is not read at all | pgTAP §1 proves the base table is unreadable by every role **and** that the projection declares ten arguments none of which match a hash/session/token/credential/content pattern — the column count asserted first, so the pattern check is not satisfied by an empty set |
| **T-2H-23** — a migration revokes a grant a deployed build depends on | This is the slice's subject. `2H-RECOVER-001` makes the resulting stall self-recovering and `2H-RECOVER-004` makes it visible | pgTAP §7 replays the exact `credential_not_erased` shape to its terminal classification; `reap.test.ts` covers the worker half |

**T-2H-05** (a migration scheduling a destructive sweep) is 2H.5's row, but this slice is subject to the same rule and answers it early: the migration schedules nothing and its own postcondition fails if a future edit adds the reaper's job to it (pgTAP §9).

**T-2H-25** is worth naming here rather than deferring to 2H.5, because this slice creates an instance of it: merging this PR deploys the application to Vercel Production automatically while the `delete-account` Edge Function stays behind. §10 below states that rather than letting the merge read as "shipped".

## 10. What this slice did NOT do — stated, not implied

- **The reap door is not live.** `delete-account`'s deployed build now differs from this repository. Closing that gap is a separate, explicitly recorded deployment operation in the shape ADR-086 established, and it has not been performed by this slice. Until it is, `verify:edge-parity` will report `delete-account` stale, and that report is correct.
- **The reaper is not armed.** No cron job exists, and neither Vault secret is set. Nothing retries anything on the hosted project today.
- **No live stalled deletion was reaped**, because there is none: the hosted `account_lifecycle` holds two accounts, both `active`.
- No hosted Auth configuration changed. No retention sweep was scheduled. No purge ran. `process-jobs` was not deployed. Phase 2H.2 has not started.

## 11. Hosted deployment and acceptance

*(Completed after exact merge-SHA CI green ×3; see §11.)*

## 12. Deployment record

*(Filled by the deployment operation.)*
