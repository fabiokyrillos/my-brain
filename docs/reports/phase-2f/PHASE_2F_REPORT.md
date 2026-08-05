# Phase 2F — One Write Path: final phase report

**Verdict: complete.** Six slices, 68 requirements, two migrations, one removed write-path family, one documented exception, and a measurement instrument that makes the next expensive decision decidable on data. Governed by `docs/PHASE_2F_PRD.md` Revision 4.3.

All six slices are accepted and merged. Slice 2F.6 merged as **PR #33 → `7e3e5f0`** on 2026-07-30, with **merge-SHA CI run `30520514810` green on all three jobs on the first attempt**, and every closeout gate re-executed from merged `main` content. `main` is clean and synchronized with `origin`; parity is `202607300063` before and after. The per-gate ledger is `docs/reports/phase-2f/PHASE_2F_SLICE_06_ACCEPTANCE.md` §4.

This report claimed none of those facts until they existed — the discipline ADR-063 states for §10's gate cells, applied to the report about them.

---

## 1. The original objective

Phase 2E built a task-mutation contract — owner-scoped, expected-pre-state gated, operation-key idempotent, fingerprint replay-safe, audited with a real actor, undoable through a fail-closed registry — and left the pre-existing write path standing beside it. `persistTaskStatus` was a plain client `UPDATE` with no undo row, no staleness guard and no operation history; `createRecord`'s task branch was a plain client `INSERT`; `updateTaskStatus` was an exported Server Action with no caller whose status vocabulary reached `cancelled`; and `authenticated` held direct `insert/update/delete` on `public.tasks` and `public.reminders`.

Phase 2F's objective: **`public.tasks` has exactly one validated write path — no application module may directly insert, update or delete it** — narrowed by owner decision so the invariant is fully truthful, with independent reminder creation retained as one documented, bounded exception. Plus the measurement instruments that make the semantic-retrieval question decidable, and the house closeout discipline.

## 2. Final delivered scope

**68 of 68 requirements delivered.** None undelivered. **Eleven carry a recorded scope note, measurement partial or unmet-by-design tier** — the count the traceability generator reports, and the basis used in every document: `2F-MEASURE-001`…`-006`, `2F-REVOKE-003`, `2F-REVOKE-004`, `2F-REMINDER-004`, `2F-PRECOND-003` and `2F-OPERATIONS-002`. Within it, one is a measurement partial (`2F-MEASURE-005`), two are computable-but-unmet evidence tiers by design (`2F-MEASURE-003/004`), **one is a genuine operational partial (`2F-OPERATIONS-002`, §13)**, and the rest carry scope that must travel with any quotation. `2E-COMMAND-012` is **not** a Phase 2F requirement — it is deferred past the phase by ADR-057 — and is not counted here.

| Family | Count | Outcome |
|---|---|---|
| `2F-GUARD` | 3 | two CI guards, proven red-first |
| `2F-DECISION` | 4 | ADR-054 … ADR-057 |
| `2F-PRECOND` | 3 | four gate artifacts preserved; clamping pinned; the gate ledger swept at closeout |
| `2F-SURFACE` | 14 | four Work actions converged; two legacy writers deleted |
| `2F-CREATE` | 6 | manual creation converged; the creation contract extended by drop-and-recreate |
| `2F-REMINDER` | 4 | Option C retained and documented; UPDATE/DELETE revoked on a written determination; `snoozed` recorded dormant |
| `2F-REVOKE` | 8 | grants revoked, denial proven non-vacuously, rollback committed and rehearsed |
| `2F-TESTMIG` | 8 | 13 pgTAP statements dispositioned individually |
| `2F-MEASURE` | 7 | funnel reader and end-to-end baseline; both tiers computable; expiry dated |
| `2F-OWNERSHIP` | 2 | two-owner probes with positive controls first |
| `2F-ANALYTICS` | 3 | existing vocabulary reused; no allowlist widening, no migration |
| `2F-OPERATIONS` | 6 | parity, merge-SHA CI (**partial** — §13), traceability, cleanup, census, documentation |

## 3. Slice by slice

**2F.1 — Guardrails, decisions and preconditions.** PR #23 → `8c59c1d`, merge-SHA CI run `30423608181` (the branch-head run at `c7e03b3` was `30422655547`). No migration. Two CI guards proven red-first: the plpgsql grammar-trap guard (`pg_catalog.coalesce/nullif/greatest/least` cannot resolve under `search_path = ''`; a bare `case … then` inside an `if` condition raises `42601` at creation time) and the architecture regression gate holding the direct-writer inventory to exact allowlists. Four ADRs. `effective_limit` row semantics pinned by pgTAP. The pre-code gate package preserved and tracked.

**2F.2 — Work-surface mutation convergence.** PR #24 → `47c555e`, merge-SHA CI run `30452675573` (the branch-head run at `836ced3` was `30425313872`). Code only, no migration, no new RPC, no grant change, no change to `list_task_command_candidates` — Gate 3 had proven none was needed. A click resolves at click time through the deployed `list_task_command_candidates`, selects the row whose `task_id` equals the clicked id, and applies. `persistTaskStatus` and `updateTaskStatus` deleted, and with them the eight-status schema that made the Work surface an unconfirmed route to `cancelled`. Three disclosed behaviour changes, all owner-approved: unresolvable clicks refuse with a localized refresh affordance instead of blind-overwriting; completing a task now cancels its scheduled reminders while wait/resume leave every reminder untouched; progressive enhancement without JavaScript is intentionally lost for the four buttons. Authenticated journeys 32/32 across desktop/mobile × pt-BR/en.

**2F.3 — Manual task-creation convergence and the reminder exception.** PR #26 → `48d6a83`, merge-SHA CI run `30467623925`. Migration `202607290062` moved parity `202607280061` → `202607290062`. `create_task_command` gained one trailing origin parameter bounded to the column's closed domain and defaulted to `'agent'`, dropped and recreated **under the same name in one transaction** — a trailing defaulted parameter is a compatible extension, and a versioned pair would have left two live creation write paths. The same migration admits one bare-creation action, `create_title_only`, whose expected patch-key set is empty, because the deployed family's seven qualifier-bearing actions each require an exact patch-key match and none can represent the manual form's title-only intent. Two SQL traps recorded: `array_agg` over zero rows returns NULL rather than an empty array, so the one action whose patch must be empty would have been the only one impossible to call; and `create_task` was unavailable as a name because it already denotes the confirmation kind. All 21 deployment-session gates passed, including manual creation persisting `created_by = 'user'` with audit actor `'user'` and an executed undo — the exact case the pre-change contract refused.

**2F.4 — Task grant revocation and test-suite semantic migration.** PR #28 → `c174f8f`, merge-SHA CI run `30479818771`. Migration `202607300063` moved parity `202607290062` → `202607300063`, applied 2026-07-29 18:38:20Z–18:38:28Z with all nine post-deploy assertion groups holding. **No file under `src/` changed** — which is itself the verification: since 2F.3 no module issued those writes, so the migration removes a permission, not a caller. `authenticated` holds `SELECT` only on `public.tasks`, `SELECT` + `INSERT` on `public.reminders`; `anon` holds nothing. The 2F-REMINDER-003 determination is written and is a **revocation**, on repository evidence: no production module issues a reminder UPDATE or DELETE, every surviving UPDATE runs inside a definer context, and no `delete` against `public.reminders` exists anywhere in the repository. 13 pgTAP statements dispositioned — 10 changed vehicle, 3 reminder INSERTs stayed `authenticated` and double as living proof the retained grant works. One claim was **inverted rather than reworded**: `apply.sql`'s "a plain client-side task UPDATE still works" is false by construction now, so the denial moved to a new file and the property that write was carrying — the audit trigger tolerating an unset `app.audit_actor` — was restaged privileged, plus a definer-context assertion because a `postgres` vehicle proves nothing about production. Gate 9 needed a prerequisite correction of two stale Slice 2E.1 assertions (PR #29 → `ba63204`), a defect that predated the slice. No rollback required or executed.

**2F.5 — Measurement reader and evidence gate.** PR #31 → `2ae2606`, merge-SHA CI run `30506807423` (the branch-head run at `da1d2f3` was `30506608871`, which three documents had cited as the merge-SHA run until this closeout corrected them). No migration; parity unchanged. `scripts/phase-2f-command-funnel.mjs` aggregates already-emitted `task_command_*` events into owner-scoped, content-free measures and evaluates both ADR-055 tiers plus the 90-day expiry. `windowDays` is a **ceiling**, not a floor, and each tier reports whether the window it ran at could satisfy it at all. The planning tier's ceiling is `met_pending_privileged_read`, structurally, because `distinctUsers` is out of an owner-scoped reader's range. The end-to-end match baseline was published pinned and scope-labelled through the **real** loader and the **real** scorer (ADR-059). Four adversarial review cycles, each finding a defect in the previous one's fix; the recurring lesson is that **a check which reads its own input proves nothing** — the first corpus never reached prefilter tier 2 and the case meant to guarantee tier coverage grouped on the hand-written label rather than the tier SQL assigned.

**2F.6 — Convergence and closeout.** No migration, no deployment, no production write. The fail-closed traceability generator and its 68-row matrix; the phase-wide cleanup verifier; the corrected and executed census stop-gate; the whole-phase convergence audit; the documentation reconciliation. Three ADRs (061–063). Its own report is `PHASE_2F_SLICE_06_REPORT.md`; its audit found three §10 gate-ledger defects, a misattributed CI citation, a previously unrecorded flaky test, and one intra-document contradiction — all filed, none smoothed.

## 4. Requirement traceability

`docs/reports/phase-2f/PHASE_2F_TRACEABILITY_MATRIX.md` maps all 68 requirements individually, generated from the PRD and the artifacts it names. The generator resolves every path it declares, derives ownership from the plan's own table, reads migrations and ADR coverage out of the repository, and resolves CI gates to a workflow step or to a file inside a path the workflow actually executes (ADR-062). It fails closed on eleven declared drift classes, each proven in both directions by fixture-root tests.

## 5. Migration history

**Exactly two, which is what the PRD declared from Revision 4 onward.**

| Migration | Slice | What it does |
|---|---|---|
| `202607290062_phase_2f_creation_origin.sql` | 2F.3 | `create_task_command` gains a trailing `p_created_by text default 'agent'`, dropped and recreated under the same name in one transaction; `private.undo_create_task_command`'s integrity guard widened to the column's closed domain, body-only; `private.task_command_creation_payload` admits `create_title_only` with an empty expected patch-key set |
| `202607300063_phase_2f_task_grant_revocation.sql` | 2F.4 | `revoke insert, update, delete on public.tasks from authenticated`; `revoke update, delete on public.reminders from authenticated`. Nine fail-closed post-deploy assertion groups. No policy, trigger, signature or row touched |

No analytics migration exists: `commandOrigin: 'work'` was already allowlisted. **Remote parity: `202607300063`**, verified before and after every deploying slice and again at closeout.

## 6. Architecture changes

- The Work surface became a Client Component with `useActionState`, and the four buttons route through one shared payload builder into `apply_task_command`. Click-time resolution is the only pre-state source; there is no fallback read of `public.tasks` on that path.
- The creation contract carries an origin, so a manual creation is recorded as a user act with a functional undo rather than as an agent act with a cosmetic one.
- The creation family admits one qualifier-free action, because the manual form's intent is a title and nothing else and the family had been built for a natural-language command where the qualifier *is* the payload.
- The ranker is deliberately **not** on the Work path: `rankTaskCandidates` selects through a score floor and a rank cap, which would refuse legitimate clicks in exactly the drift and same-title cases `2F-SURFACE-004` forbids.
- Nothing else changed. No new mutation RPC, no new shared-nothing contract, no new job type, no new table, no new event.

## 7. Write-path consolidation result

**`public.tasks` has exactly one validated write path, in both the application and the database.** The application half closed at Slice 2F.3, when the last direct writer was deleted; the database half closed at Slice 2F.4, when the grant that would still have permitted one was revoked. The surviving writers are enumerable and each was verified at closeout: the Phase 2E apply/destructive/creation family, the Phase 2C candidate-materialization family, the registered `private.undo_*` handlers reached through the `undo_operation` router, triggers firing inside those contexts, privileged workers and `pg_cron`, migrations, and isolated test fixtures.

The architecture gate holds this mechanically rather than by review: the `tasks` allowlist is `[]` and the `reminders` allowlist holds exactly one entry, both compared by **exact equality in both directions** — a second direct writer fails the build, and so does an allowlist entry whose writer no longer exists. The closeout audit additionally swept every write outside `src/` and found only `service_role` fixture clients and the Option C exception; the two e2e specs and the local race harness read only.

**One exception, documented and bounded:** `createReminder` performs an `authenticated` direct `INSERT` on `public.reminders`. It is INSERT only, RLS-scoped, has no cancel or edit surface, and its reopening condition is named (a future validated authoring contract). `SECURITY.md` records what it is not: no operation key, no expected pre-state, no undo row, no own audit actor.

## 8. Security result

| Object | `anon` | `authenticated` | `service_role` / definer |
|---|---|---|---|
| `public.tasks` | nothing | **SELECT only**, RLS-scoped | unchanged |
| `public.reminders` | nothing | **SELECT + INSERT** (the Option C exception) | unchanged |
| `public.task_command_confirmations` | nothing | SELECT | **nothing** (explicitly revoked) |
| `public.product_events` | nothing | SELECT (own rows) | **nothing** (explicitly revoked) |
| RLS policies | — | **unchanged**, all eight present | — |
| `record_ai_usage` | — | **signature unchanged** (provenance deferred) | — |

**No grant widened anywhere in the phase.** The 2E PRD §16.4 residual risk is **closed for `public.tasks`** and narrowed-and-documented for `public.reminders`.

Three properties are stated rather than implied. **Write-side RLS on `public.tasks` is permanently untestable from a client role**, because the grant check precedes any policy; the compensating evidence is read-side RLS proven in both directions plus RPC-boundary denial (`P0002` against another owner's task). **Five policies are present but unreachable by direct client DML** and were deliberately retained (owner decision A5), so the committed re-grant restores the prior posture exactly. **`product_events` row absence after an owner's deletion is unreadable with any credential this repository holds**; it is proven as a composition of an asserted refusal, zero surviving fixture owners, and a CI-asserted cascade.

**C1 — distributed rate limiting and spend caps — remains open and is re-raised here deliberately**, discharging the commitment `PHASE_2F_PROPOSAL.md:218` placed on this closeout. It is the architecture review's only Critical, it is not implemented by this phase, and Phase 2F added no AI spend path. If public signup opens before it is addressed, it jumps the queue.

## 9. Ownership result

Cross-owner denial is proven end-to-end through the real entry points, and every isolation assertion in the phase asserts the owner's own **positive** row count before the stranger's absence — the permanent fixture `2F-OWNERSHIP-001` demands, because a zero-row result must never pass an isolation check vacuously. The mutation path was proven by the Gate 3 two-owner probe, the creation family by Slice 2F.3's own probe, the funnel reader by 32 assertions including anonymous **and service-role** denial, and the closeout by `anon` denial asserted after a privileged positive control on the same table.

## 10. Measurement result

**ADR-055's evidence gate is computable, and neither tier is met.** The real owner's funnel is empty: zero real commands have been typed. That is evidence, not a gap, and it is exactly why the phase built the instrument instead of the infrastructure.

| Measure | End-to-end (2F.5) | Scoring layer (2E-MATCH-018, retained) |
|---|---|---|
| Policy version | `2026-07-25.3` | `2026-07-25.3` |
| Scenarios | 11 | 14 |
| One-step apply | **0.455** | 0.429 |
| Matched, needs deliberateness | **0** | 0.071 |
| Confirmation required | **0.091** | 0.071 |
| Ambiguous (incl. overflow) | **0.273** | 0.214 |
| No match | **0.182** | 0.214 |

**Cross-scope comparison is prohibited.** These measure different things — the Phase 2E rates score hand-written `prefilterTier`/`tokenOverlap`/`queryTokenCount` triples; the Phase 2F rates score the triples SQL actually produced. The near-agreement is a coincidence of two differently-composed corpora, not a validation of either. The end-to-end corpus reaches all three title tiers, and the coverage case asserts the tier **SQL assigned**, not the corpus's own annotation.

**Expiry: `2026-10-27`** — go-live `2026-07-29` (the Slice 2F.5 merge date, ADR-060) plus 90 days, computed by `expiryDateFromGoLive` and carried in `docs/TODO.md`. If neither tier is met by then, an ADR removes semantic retrieval from the active roadmap until a new demand signal appears.

## 11. Remaining partials

Each is a scope the next reader must carry forward, not a gap being minimised.

1. **`2F-MEASURE-005`'s unsupported-refusal volume is not measurable this phase.** Three allowlisted preview categories (`unsupported`, `applied`, `rejected_conflict`) are emitted by no deployed code path. The exclusion rule is implemented and unit-tested and is **vacuous against production data**. A CI case derives the unreachable set from the emitters, so a future emitter reds the build rather than the claim. The requirement's own normative text — that the ADR states the non-authorizing list — is satisfied.
2. **`qualifyingCommands` counts preview rounds, not intents,** and errs in both directions: one intent emits one to three rounds, and some emit none. No command identifier exists to deduplicate on.
3. **`2F-REVOKE-003`'s rehearsal is SQL-level only.** It proves the committed rollback applies and restores the versioned chain privileges. It does **not** prove PostgREST schema-cache convergence, in-flight session behaviour, or an operational production rollback. The live schema-cache residual was closed by measurement in the 2F.4 session instead; an operational rehearsal is not planned.
4. **`2F-REVOKE-004`'s evidence loss** — write-side RLS on `public.tasks`, permanently, with the compensation named.
5. **Undo results and the applied population measure two funnels** whose difference is not a clean measure; both are reported raw.

## 12. Deferred product work

| Item | Destination |
|---|---|
| AI provenance (`2E-COMMAND-012`) | a future phase, behind ADR-057's reopening gate: `scripts/phase-2f-gate1-record-ai-usage-dry-run.sql` executed and passed on a **disposable hosted** project with the transcript captured. Verified intact at closeout: script present, no transcript exists |
| Semantic retrieval | ADR-055's two tiers, expiring **2026-10-27** |
| The ≤3-day offline replay spike | only if the spike tier is met |
| Reason-level refusal granularity | post-2F; needs a product-event allowlist widening |
| An emitter for the three unreachable preview categories | post-2F |
| A funnel UI surface | post-2F |
| The privileged distinct-user read | ADR-055 evaluation time |
| A command identifier for per-intent counting | post-2F |
| `product_events` retention/purge | pre-production checklist |
| Retiring the dormant `snoozed` status | `2F-REMINDER-004`; census measured 0 rows carrying it |
| **C1 — rate limiting / spend caps** | re-raised here, not implemented |
| Retroactive history, date semantics, review invalidation, recurrence | unscheduled, gated on repairing review generation (ADR-056) |
| Split/merge sub-epic (`2C-STRUCTURE-004`) | GitHub issue #8 |
| Windows CRLF normalisation in `sql-reachability.test.ts` | `TODO.md`, unrelated cleanup |
| Two flaky component tests | `TODO.md`; neither reproduces on demand |
| `intelligent-capture.spec.ts` determinism | GitHub issue #21 |

## 13. Final CI and remote validation

**`2F-OPERATIONS-002` — the merge-SHA CI ledger, corrected and completed by this closeout.** The audit's first draft cited five runs as merge-SHA runs; **three were branch-head runs at a different SHA**, which is exactly the class of misattribution this same audit was correcting elsewhere. Every merge commit in the phase was then read directly with `gh run view --json headSha,conclusion,event`:

| Merge SHA | PR | Run | Conclusion |
|---|---|---|---|
| `8c59c1d` | #23 — 2F.1 implementation | `30423608181` | success |
| `47c555e` | #24 — 2F.2 implementation | `30452675573` | success |
| `08bf5bc` | #25 — 2F.2 acceptance | `30456426400` | success |
| `48d6a83` | #26 — 2F.3 implementation | `30467623925` | success |
| `e8b4bf2` | #27 — 2F.3 acceptance | `30479707004` | **success**, after this closeout re-ran it — the original attempt was `cancelled` by the workflow's own `cancel-in-progress` concurrency group when the next `main` push landed |
| `c174f8f` | #28 — 2F.4 implementation | `30479818771` | success |
| `6628b02` | #30 — 2F.4 acceptance | `30497118489` | **failure**, twice — see below |
| `2ae2606` | #31 — 2F.5 implementation | `30506807423` | success |
| `918ab23` | #32 — 2F.5 acceptance | `30507154042` | success |

**Nine of ten green; one is not, and it is recorded rather than smoothed.** `6628b02` — a documentation-only acceptance merge — has never had a green `application` job. This closeout re-ran it, and the rerun failed on a **different** test than the original: first `src/features/agent/question-answer-form.test.tsx:162`, then `src/features/tasks/task-candidate-form.test.tsx`. Both are jsdom timing flakes already recorded in `docs/TODO.md`; the `edge worker` and `database and journey` jobs were green in both runs, no Phase 2F change is implicated, and the commit altered no source. `2F-OPERATIONS-002` is therefore recorded **partial**, with its destination the two flaky-test items — not complete, because the requirement says *every* slice PR's merge SHA and one does not qualify. The `database` job proves the whole migration chain applies from an empty database on every run, then the full pgTAP suite, then `db lint --fail-on error`, then the same-key creation race with two real sessions, then the foundation and task-command journeys against a production build, and finally — added by 2F.4 — the re-grant rollback rehearsal with three explicit posture boundaries so no earlier assertion can have run under the wrong privileges.

**Remote validation, executed in the Slice 2F.6 implementation session against `ulvwzqlpsjyrnqzfxmck` from branch content:** the full remote suite at exit 0; the funnel proof at 32 assertions; the end-to-end baseline 9/9, stable across three runs; the census stop-gate clear on two independent runs; the authenticated journeys 36/36; and the phase-wide cleanup verifier CLEAN.

The verifier's scope is stated exactly rather than rounded: **zero orphans across the seventeen orphan-scanned tables**, plus **two asserted `service_role` refusals** on the posture-protected pair (`task_command_confirmations`, `product_events`) which are scanned for that refusal and never for orphans, plus zero fixture-prefix users, zero fixture objects in `user-files`, and the deferred-object absences including `record_ai_usage`'s unchanged ten-argument signature. Saying "zero residue across nineteen tables" would contradict this report's own §8 — `product_events` row absence is **unreadable** with any credential this repository holds.

**Re-executed post-merge from merged `main` content** (`R3`), all green: census stop-gate clear, cleanup verifier CLEAN with zero residue, traceability regenerating content-identically, funnel proof 32/32, end-to-end baseline 9/9, full remote suite exit 0, and a second census-plus-cleanup pass after the fixture-minting runs — still clear, still CLEAN. `main` is clean and synchronized at `7e3e5f0`; parity `202607300063`. The per-gate ledger is `docs/reports/phase-2f/PHASE_2F_SLICE_06_ACCEPTANCE.md` §4.

## 14. Final repository state

- `main` clean and synchronized with `origin` at `7e3e5f0` — verified after the merge.
- Remote migration parity `202607300063`, no drift.
- Two Phase 2F migrations, both applied; no third.
- `tasks` direct-write allowlist empty; `reminders` allowlist holds exactly the Option C exception.
- 68-row traceability matrix generated and regenerable byte-stably.
- **Phase 2G not started**: named only as a recommendation in `docs/PHASE_2F_PROPOSAL.md`; no PRD, plan, ADR, requirement ID, migration, script, test or document section exists for it, established by scoped grep and asserted by a CI case.

## 15. Final production state

The deployed project runs the full chain through `202607300063`. `authenticated` cannot write `public.tasks` by any route except the validated contracts, verified live on both a stale pre-migration session and a fresh one. The Option C reminder INSERT works and is exercised. `create_due_task_reminder` is still `security invoker` and now always fires inside a definer context, because no task INSERT can originate in a client context. No rollback was required or executed at any point in the phase, and no applied migration was reverted — the standing posture.

## 16. Final closeout verdict

**Phase 2F is complete.** Every requirement is delivered or explicitly and traceably deferred; every completed claim rests on an executed gate; every partial is still labelled partial; every deferral still has a destination. The phase's own closeout found three inaccurate cells in its gate ledger, a misattributed CI citation, an unrecorded flaky test and one intra-document contradiction — and filed all of them rather than smoothing any, which is what a convergence audit is for. The two properties the phase set out to establish now hold mechanically rather than by assertion: **one validated write path for `public.tasks`**, and **one bounded, documented exception on `public.reminders`** — with a fail-closed guard that reds the build if either becomes false.
