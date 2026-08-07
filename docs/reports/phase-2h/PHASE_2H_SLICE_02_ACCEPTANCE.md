# Phase 2H — Slice 2H.2 — error sink and cron dead-man switch — ACCEPTANCE

- **Slice:** 2H.2. **One migration** (`202608070080`) — the slice's entire allocation. Phase budget after this slice: **5 allocated · 2 spent · 3 remaining**, per-slice and non-transferable.
- **Requirements:** `2H-SINK-001…004` and `2H-DEADMAN-001…003`. All seven delivered and cited below. `2H-SINK-005` and `2H-DEADMAN-004` are **not** claimed here — a producer's consumer is 2H.4's work, and claiming it in the slice that built the producer is the ADR-084 failure exactly.
- **Nothing destructive was enabled, scheduled, purged or opened.** Both retention sweeps are built, executable by **no role including `service_role`**, and unscheduled. The migration asserts that about itself.

---

## 1. The two defects this answers, both already paid for

**No error record existed at all.** On 2026-08-04 every account deletion failed for two days and nothing recorded it. The sole evidence the failure ever happened was a person noticing.

**A succeeded tick is not work done.** The 2H.0 census read `my-brain-entry-dispatch` at **29 042 successes** while the `jobs` table held **four rows**, newest five days earlier. `pg_cron` records that the *statement* ran. Any liveness claim built on tick counts would have been measuring silence — and would have reported that dispatcher healthy throughout.

## 2. Requirement-by-requirement

| Requirement | Delivered | Evidence |
| --- | --- | --- |
| **2H-SINK-001** — bounded, append-only, classified, correlated | ✅ | `error_events` + `record_error_event`; pgTAP §1 (no role reaches the table), §6 (UPDATE and DELETE refused **even to the table owner**, by trigger as well as by grant) |
| **2H-SINK-002** — never user content, prompts, credentials, tokens, filenames | ✅ | pgTAP §2 proves from the catalog that the table has **exactly three text columns and no json/jsonb/bytea column at all**; §3 pushes six content- and credential-shaped sentinels through the writer and each is refused `23514`; §4 asserts none appears in storage; `error-sink.test.ts` asserts the same over the serialised RPC payload |
| **2H-SINK-003** — the writer cannot fail the failing operation, and its own failure is counted | ✅ | `error-sink.test.ts`: an RPC error and a thrown transport failure both resolve rather than reject, both increment `sinkWriteFailures()`, and a **control** proves a working sink increments nothing |
| **2H-SINK-004** — bounded by a declared window, not scheduled | ✅ | `prune_error_events` / `count_prunable_error_events` share one predicate; pgTAP §7 proves the boundary in **both** directions and that the sweep is executable by **no role** |
| **2H-DEADMAN-001** — last successful **run**, not last successful tick | ✅ | `scheduled_job_health` keeps `last_success_at` and `last_useful_at` as separate columns; pgTAP §8 asserts `success_count/useful_count` diverge (`2/1`) and that the useful timestamp stays put while the success timestamp moves |
| **2H-DEADMAN-002** — staleness is a readable classification against the job's own interval | ✅ | `scheduled_job_liveness(p_staleness_multiple)` — a required argument; pgTAP §9 shows the multiple actually decides (the same backdated row is `stale` at 3× and `current` at 30×) |
| **2H-DEADMAN-003** — proven by an executed negative control | ✅ | pgTAP §9: the **same job**, the **same function**, the **same threshold**, only the timestamp differs — `current`, then `stale` |

## 3. The design decisions worth defending

**The privacy property is the absence of a column, not a careful writer.** `error_events` has three text columns, each CHECK-bound to a closed set, and no `json`, `jsonb`, `bytea` or free-text column whatsoever. A migration postcondition reads that from `pg_catalog` and fails the apply if a future `ALTER TABLE` adds one. This is 2H-SINK-002 in the strongest form available: not "we reviewed the writer" but "there is nowhere to put a message".

**Append-only has two independent locks.** The revoke is the first. The second is a trigger that refuses `UPDATE` and `DELETE` **even from the table owner**, because a grant is exactly the kind of thing a future migration or a returning platform default restores in silence. The retention sweep is exempted through a narrow, named transaction-local flag rather than by holding a grant — so the one thing allowed to delete is the one thing that must, and nothing else acquires the capability alongside it. This bit the test suite honestly: §7's boundary rows had to be *inserted* at their timestamps because backdating by `UPDATE` is refused, and a test that needed the property weakened would have been the wrong test.

**`record_error_event` is granted to `anon`, deliberately.** ADR-080's reasoning, restated: the failures most worth recording happen before a session exists. The alternative — a service-role client in the Next.js runtime — trades a function that can only append a row of closed-vocabulary values for a credential that ignores RLS on every table. What bounds the grant is the shape: every field must already be a member of a closed set, and **the function takes no owner parameter**, so no caller can attribute a failure to somebody else. The owner is `auth.uid()` or nothing.

**The two timestamps are kept separate rather than merged.** A drain with nothing to drain is healthy; a drain that has *never* drained anything is a finding. Merging them would have made that choice silently, now, for every job. Keeping both lets a later reader ask either question.

**A job that has never reported is `never_reported`, not healthy.** It is precisely the state a silently-broken job is in. Likewise an unparseable schedule yields `unknown_interval` rather than a pass: a staleness check that cannot compute its threshold must not answer "fine".

## 4. Both validators, pinned in both directions

ADR-084 exists because SH.6 shipped a producer emitting a value its validator rejected — **every quota refusal recorded nothing for weeks** while the code read as though it recorded everything, and the lost events do not backfill.

`error-sink-parity.test.ts` reads the three `CHECK` constraint lists **out of the migration SQL** and compares them to the TypeScript constants as sets, failing on a value present in either and missing from the other. It asserts the extracted list is non-empty first, so a broken extractor cannot make every comparison pass against nothing. And it enumerates **31 real error shapes** through `classifyError`, asserting each output is a member of the database vocabulary — the direction ADR-084's defect actually travelled.

## 5. Threat-model rows this slice must answer

| # | Answered by | Executed evidence |
| --- | --- | --- |
| **T-2H-07** — the sink records user content or a filename | No column can hold one | pgTAP §2 (catalog), §3 (a provider message quoting the user's own words, and a filename, both refused `23514`), §4 (absent from storage), plus the serialised-payload assertion in `error-sink.test.ts` |
| **T-2H-08** — the sink records a credential | Same | pgTAP §3 refuses an `sk-proj-…`-shaped string; the unit test proves no provider message reaches the RPC payload |
| **T-2H-09** — the sink records a session identifier | The correlation id is minted for the sink | pgTAP §3 refuses a JWT-shaped string; the unit test proves two calls with identical input produce **different** correlation ids and that a non-UUID caller value is discarded |
| **T-2H-13** — the switch fires on everything, or on nothing | An executed control in both directions | pgTAP §9: same job, same function, only the timestamp differs |
| **T-2H-14** — the switch is blind to an unregistered job | Enumerated from `cron.job` at run time | pgTAP §9 schedules a job **inside the test**, asserts it appears immediately with its interval parsed from its own schedule, and unschedules it |
| **T-2H-16** — the writer fails silently, so the sink reads as "no errors" | Failures are counted and printed with a fixed marker | `error-sink.test.ts`, with a control proving a working sink counts nothing |
| **T-2H-05** — a migration schedules a destructive sweep | ADR-082 | The migration's own postcondition fails if it did; pgTAP §7 asserts both job names are absent |

## 6. Calibrations, so the refusals mean something

Six refusals in §3 would be satisfied by a writer that refuses everything — which is a sink that records nothing, the exact defect this slice exists to prevent. So §3 ends with a **calibration**: a fully declared failure *is* recorded. §7's dry run is calibrated the same way, by proving the count moves from 0 to 1 across a one-second boundary rather than only that it is 0. §9's control is the same job as its positive. §"CONTROL: a working sink increments nothing" keeps the failure counter from being a call counter.

## 7. Local gates

| Gate | Result |
| --- | --- |
| `npm run lint` | ✅ zero errors |
| `npm run typecheck` | ✅ zero errors |
| `npm test` | ✅ **4127 passed, 0 failed** (3 file-load failures are the documented Windows-only baseline; green in CI) |
| New unit tests | 17 — `error-sink.test.ts` (12) and `error-sink-parity.test.ts` (5) |
| pgTAP `phase_2h_error_sink_and_deadman.sql` | 48 assertions — executed by the CI `database` job against the whole chain applied to an empty database |

Three chain guards were updated **before** the first push this time, having learned their demands in 2H.1: the cleanup partition excuses `error_events` with its reason; the cascade drill's populator creates a sink row (directly, because `record_error_event` attributes to `auth.uid()` and the populator has no session); and the grant census moves from seven RPC-only ledgers to **nine**, with both new entries stating why they are closed to `service_role` — an append-only failure log that can be rewritten is not evidence, and a writable `last_success_at` would let a dead job be made to look alive.

## 8. One decision a reviewer should challenge

`error-sink.ts` does **not** carry `import "server-only"`, unlike nearly everything else in `src/lib` that touches the database. The reasoning is in the module header: it holds no credential, constructs no client and reads no environment variable — the caller passes the client in. What the guard would cost is the only assertion T-2H-07 actually asks for, because Vitest runs under `jsdom` where `server-only` throws at import, so every module carrying it is tested by *reading its source* rather than by *running it*. The claim "a provider message never leaves the process" is not provable by reading. If a reviewer disagrees, the alternative is a second Vitest project with a node environment, which is a larger change than this slice should make on its own.

## 9. A real defect, caught by a guard that predates this phase

The first CI run failed the SH.0 cascade drill on seven assertions, and the finding was serious: **an append-only table whose rows `CASCADE` cannot coexist with a trigger that refuses `DELETE`, because the cascade IS a delete.** `error_events.user_id` was declared `ON DELETE CASCADE`, so deleting an `auth.users` row hit `error_events_refuse_delete` and the whole deletion was refused. In production that means **no account could be deleted at all** — a sink built to record failures causing the most serious failure in the product, and doing it in the exact area this phase exists to protect.

Two things are worth saying about it rather than just fixing it quietly.

**The drill caught it, not review.** SH.0's `deleting a ROW-COMPLETE account is not blocked by any owned row` exists because the cascade had never been executed against a fully populated account. It has now earned its cost twice.

**The fix is better than the original, not a workaround.** `ON DELETE SET NULL` de-identifies the row instead of destroying it. The row carries no user content — surface, operation, reason, two timestamps and a correlation id — so keeping it preserves the operational record without preserving the person, which is the precedent `account_deletion_log` set deliberately. Zero-residue still holds, because `account_owned_row_counts` counts rows `WHERE user_id = the owner` and a nulled row is not one. The append-only trigger now permits exactly one mutation — user_id going from non-null to null with **every other field compared unchanged** — so "de-identify" is enforced rather than trusted, and pgTAP §6 proves an update that tries to null the owner *and* change the reason is still refused.

Two smaller CI findings, both mine: an assertion compared `last_useful_at < last_success_at` inside a single pgTAP transaction, where `now()` is frozen and both are the same instant — replaced with a version that pins the useful timestamp to a fixed past value, so the claim is exact without depending on the clock. And the `anon`-grant census named two functions; `record_error_event` is a third, which the census correctly refused until the decision was written down beside it.

## 10. What this slice did NOT do

- **No consumer exists yet.** `2H-SINK-005` and `2H-DEADMAN-004` are 2H.4's, by the plan. Until then the sink is a producer with no reader, which is the ADR-084 shape — recorded here as a **known, scheduled** gap rather than left for the closeout to discover.
- **No scheduled job reports yet.** `record_scheduled_job_run` exists and nothing calls it, so every job classifies `never_reported` until the callers land. That is the honest state and the classification says so rather than reading `current`.
- **Nothing is scheduled.** Neither sweep is on `pg_cron`, and neither is executable by any role.
- No hosted configuration changed, no purge ran, signup stays closed, SMTP stays unconfigured, `process-jobs` untouched, and `delete-account`'s reap door remains undeployed from 2H.1.

## 11. Deployment record

| Step | Result |
| --- | --- |
| PR | **#116**, merged 2026-08-07 |
| PR-head CI | ✅ green ×3 |
| Merge SHA | **`88c9e3bc606d70954bf13cfb56bf297c2df64b30`** |
| Merge-SHA CI | ✅ **green ×3**, run `31158204968` — read per job |
| Migration applied | `202608070080_phase_2h_error_sink_and_deadman.sql`, 2026-08-07 |
| Parity after | local = remote = **`202608070080`**, 80 migrations |
| Branch | `codex/phase-2h-slice-2` preserved |

## 12. Hosted acceptance — **33 of 33**

| Group | Result |
| --- | --- |
| Parity | head `202608070080`, 80 migrations, local = remote |
| Objects | 14 of 14 — two tables, ten functions, two triggers |
| **No payload column** | 3 text columns, **0** that could hold free text, 3 closed-vocabulary CHECKs — read from the deployed catalog |
| **The drill's finding, verified live** | the owner FK reads `confdeltype = 'n'` — `ON DELETE SET NULL`, not `CASCADE` |
| Grants | no role reads either table; no role writes the sink directly; the writer IS reachable by `anon` and `authenticated`; **neither sweep is executable by any role including `service_role`**; liveness is `service_role`-only |
| Sentinels | all six refused `23514` against the deployed schema, and none appears anywhere in storage |
| Calibration | a fully declared failure IS recorded — so the six refusals are the vocabulary, not a broken writer |
| Append-only | UPDATE refused **even for the `postgres` owner**, DELETE refused outside the sweep, and the row survived both |
| Dead-man | all five real cron jobs enumerated from the catalog, each interval parsed from its own schedule (`1 min`, `1 min`, `1 hour`, `1 day`, `1 day`), every one `never_reported` |
| Posture | 5 cron jobs unchanged, neither 2H.2 sweep scheduled, signup disabled, CAPTCHA enforced, SMTP unset |

### 12.1 One permanent artifact, decided deliberately

**This run left one row in `error_events` that cannot be removed, and that was a choice rather than an accident.** The table is append-only and its sweep is executable by no role, so — unlike 2H.1's disposable accounts — there is no fixture story here by design.

The alternative was to skip the calibration. That would have been worse: six refusals are satisfied equally well by a writer that refuses *everything*, which is a sink that records nothing — the exact defect this slice exists to prevent. So the probe wrote exactly one row, `server_action` / `other` / `unclassified` with a correlation id and two timestamps. It contains no user content by construction, and it is a truthful record of an event that really happened: this acceptance probe. It will age out if and when retention is enabled by owner action.

No sweep was called — **not even through the Management API**, which executes as `postgres` and therefore could have.

### 12.2 `never_reported` across the board is the honest reading

Every one of the five scheduled jobs classifies `never_reported`, because nothing calls `record_scheduled_job_run` yet. That is the correct answer and not a gap in the switch: the classification exists precisely so that "no evidence of a successful run" reads as *no evidence*, rather than as health. Wiring the callers is downstream work, named in §10.

### 12.3 What was NOT done in the hosted step

No Edge Function deployed; `delete-account`'s reap door remains undeployed from 2H.1. No cron job created. No sweep executed. No hosted Auth configuration touched. No purge. `process-jobs` untouched.
