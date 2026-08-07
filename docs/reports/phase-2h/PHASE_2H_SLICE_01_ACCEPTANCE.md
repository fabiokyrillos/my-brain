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

## 11. Deployment record

| Step | Result |
| --- | --- |
| PR | **#114**, merged 2026-08-07 |
| PR-head CI | ✅ green ×3 (`application`, `database and journey`, `edge worker`) |
| Merge SHA | **`d7d5091e7063877b9876da4dcdaf0aa60132d365`** |
| Merge-SHA CI | ✅ **green ×3**, run `31148068318` — read back per job, not from the run's overall conclusion |
| Migration applied | `npx supabase db push` — `202608070079_phase_2h_deletion_recovery.sql`, 2026-08-07 |
| Parity after | `supabase migration list --linked`: local = remote = **`202608070079`**, 79 migrations |
| Branch | `codex/phase-2h-slice-1` preserved |

**Three CI iterations, and what each one caught.** Recorded because the sequence is the evidence that the gates work, and because the local suite could not have produced it. Iteration 1: the pgTAP file aborted with `Bad plan. You planned 52 tests but ran 0` — the fixture UUIDs began `2h1`, and `h` is not a hex digit; three chain guards also fired, all three living in files that fail to *load* on this Windows baseline, so CI was the first place they could speak. Iteration 2: 51 of 52 pgTAP assertions passed; test 19 claimed to check *"a cap equal to the retry interval"* while passing a 5-minute cap against a 15-minute interval — the refused case wearing the accepted case's description, which would only ever have gone green if the validation it bounded had been deleted. Iteration 3: green ×3.

## 12. Hosted acceptance — executed against the deployed schema

**29 of 30 checks passed on the first run, plus 7 of 7 on a corrected control.** The failure was in the probe, not the mechanism, and §12.2 is what that cost and what it proved.

### 12.1 What was verified

| Group | Result |
| --- | --- |
| Migration parity | head `202608070079`, 79 migrations, local = remote |
| Objects created | 8 of 8 — one table, six functions, one trigger |
| Grant posture | `service_role` can neither read nor write the recovery table; no client role can read it; forced RLS with **zero** policies; the operator read is `service_role`-only |
| **`account_deletion_log` not widened** | still unreadable by `service_role`, `authenticated` and `anon` — the claim that made 2H-RECOVER-004 worth doing this way, re-read against the live schema |
| Nothing scheduled | the cron catalog still holds exactly the **same 5 jobs**; no `my-brain-deletion-reaper`; **neither Vault secret set** (0 of 2) |
| The reaper is honest about being unarmed | `{"armed":false,"claimed":0,"dispatched":0}` |
| Audit | `account_deletion_retry_claimed` and `account_deletion_retry_result`, both `actor=system`, one each |
| Fixture residue | **zero** — attempts 0, lifecycle 0, auth.users 0 |
| Destructive posture | signup **disabled**, CAPTCHA **enforced** (turnstile), SMTP **unset**, exactly the **two** pre-authorized prune jobs scheduled |

### 12.2 The controls, including the one that was wrong

A probe whose controls agree with its positives has measured nothing, so the run carries five that must refuse:

1. **A freshly seeded account is not claimed.** 0 claimed against the signed 15-minute threshold — so the claim below is the threshold elapsing, not the predicate being vacuous.
2. **A lease token confirms nothing for a different account.** `{"confirmed":false}`. This is 2H-RECOVER-003 against the live schema: holding a token is not holding the capability.
3. **The non-`service_role` path is refused.** The Management API executes as `postgres`, and the reaper answered `42501 Service role required`. This began as an accident — the first probe called it that way and failed — and is kept as an assertion, so the reaper's PASS cannot be read as "any caller can run it".
4. **An undeclared outcome is refused before any write.** `22023`.
5. **Free text is refused by the closed stop-reason vocabulary.** `23514`, and the row still reads `last_stop_reason: null` — nothing was stored. **This control failed on the first run and the failure was mine:** it offered free text against a token the previous successful report had already consumed, so the function found no row, returned `attempt_row_absent`, and never reached the constraint. It measured a stale token while claiming to measure the vocabulary — a control exempt from the mechanism it was named after. Re-run against a **live** lease, with a calibration proving the same lease accepts a declared value, so the refusal is the vocabulary and not a broken function: **7 of 7**.

### 12.3 One observation, recorded rather than filed as a defect

`record_account_deletion_attempt` validates its **outcome** vocabulary in the function body (a declared `22023`) but leaves the **stop-reason** vocabulary to the table CHECK, so an undeclared reason surfaces as a raw `23514` rather than a declared error. Nothing invalid is stored either way, and this is the same shape SH.2's `record_account_deletion` already has, so it is consistent rather than novel. Named here so a future reader meeting a `23514` from this path knows it is the vocabulary working and not a schema fault.

### 12.4 What was NOT done in the hosted step

No Edge Function was deployed — `delete-account`'s deployed build still lacks the reap door, and closing that is a separate recorded operation. Nothing was armed: no cron job, neither Vault secret. No hosted Auth configuration was touched. No retention sweep was scheduled and no purge ran. `process-jobs` was not deployed. The two disposable accounts created by the probes were removed and their removal verified by read-back, not assumed.
