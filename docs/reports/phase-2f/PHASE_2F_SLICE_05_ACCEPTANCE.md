# Phase 2F — Slice 2F.5 acceptance report

**Verdict:** accepted.
**Objective:** make ADR-055's semantic-retrieval evidence gate computable, and discharge `2E-MATCH-018`'s scope caveat by measuring the match baseline end to end.
**Scope:** `2F-MEASURE-001` … `2F-MEASURE-007` (epic 2F-E) plus `2F-OPERATIONS-002`. Nothing else.
**Definitive PRD:** `docs/reports/phase-2f/PHASE_2F_SLICE_05_PRD.md`.
**Implementation report:** `docs/reports/phase-2f/PHASE_2F_SLICE_05_REPORT.md`.
**Decisions:** ADR-058, ADR-059, ADR-060.

---

## 1. Final scope

A minimal internal command-funnel reader over the already-emitted `task_command_*` product events; an evidence-tier evaluator for both ADR-055 tiers plus the 90-day expiry; the exclusion mechanisms proven against the deployed project; and the end-to-end match baseline published pinned and scope-labelled.

**No migration. No deployment.** No RPC, view, grant, policy, index, type regeneration, new product event, allowlist change, production module change, UI, route, or i18n key. `src/` gained exactly two test files. Remote parity is `202607300063` before and after, verified directly with `npx supabase migration list --linked`.

## 2. Files changed (14)

| File | Change |
|---|---|
| `scripts/phase-2f-command-funnel.mjs` | new — the reader: aggregator, tier evaluator, expiry, thresholds, refusal subset, reachability facts |
| `scripts/phase-2f-command-funnel-reader.mjs` | new — the runner: owner read (writes nothing) and `--proof` mode |
| `src/features/product-analytics/command-funnel.test.ts` | new — 52 CI cases |
| `src/features/task-commands/end-to-end-match-baseline.remote.test.ts` | new — the end-to-end baseline lane |
| `vitest.remote.config.ts` | new — the credentialed lane (ADR-059) |
| `vitest.config.ts` | one `exclude` line keeping that lane out of CI |
| `supabase/tests/product_events.sql` | +3 read-only pgTAP catalog assertions, `plan(23)` → `plan(26)` |
| `package.json` | +3 scripts |
| `docs/reports/phase-2f/PHASE_2F_SLICE_05_PRD.md` | new — the definitive contract, with all four review cycles recorded |
| `docs/reports/phase-2f/PHASE_2F_SLICE_05_REPORT.md` | new — the implementation report |
| `docs/DECISIONS.md` | +ADR-058, ADR-059, ADR-060 |
| `docs/STATE.md` | Slice 2F.5 section |
| `docs/CHANGELOG.md` | Slice 2F.5 entry |
| `docs/TODO.md` | expiry entry re-pointed at ADR-060; the pre-existing CRLF defect recorded; the stale "2F.5 has not started" sentence corrected |

**Migrations: none.** The only SQL is three read-only pgTAP catalog assertions; pgTAP files are tests, not schema.

## 3. Commits

| SHA | Subject |
|---|---|
| `6704aff` | `docs(2f5)`: the definitive Slice 2F.5 PRD and its three decisions |
| `617da70` | `feat(2f5)`: the command-funnel reader and the end-to-end match baseline |
| `3e17664` | `fix(2f5)`: resolve the implementation review, and rebuild a degenerate corpus |
| `b2fa232` | `fix(2f5)`: the corpus never reached tier 2, and the guard could not tell |
| `da1d2f3` | `fix(2f5)`: close the last doc/code drift, and test the two untested fixes |

**Pull request:** #31 (`main` ← `codex/phase-2f-slice-5`), 14 files.
**Merge SHA:** `2ae2606238fa10d61f0ca0d6ef20eb2ab5dc60f0` — merged 2026-07-30T01:51:11Z, `git show -s --format=%cs` gives `2026-07-29`.
**Final `main` HEAD:** `2ae2606238fa10d61f0ca0d6ef20eb2ab5dc60f0`.

## 4. CI

| Run | SHA | Result |
|---|---|---|
| `30504213474` | `3e176640` | all three jobs `success` |
| `30505730745` | `b2fa232` | all three jobs `success` |
| `30506608871` | `da1d2f3` | all three jobs `success` (the merge SHA) |

`2F-OPERATIONS-002` is satisfied on the exact merge SHA. The `database` job reported `supabase/tests/product_events.sql … ok` on the whole migration chain applied from an empty database, which is where this slice's three new assertions run.

## 5. Review cycles

| Cycle | Findings | Outcome |
|---|---|---|
| Design review of the initial PRD | 23 (4 BLOCKING, 7 MAJOR, 9 MODERATE, 3 MINOR) | 22 confirmed and folded in; **1 BLOCKING rejected on evidence** — it held that the Work surface emits only `task_command_applied`, having inspected Slice 2F.2's direct-action emitter and missed `work-view.tsx:77`, which mounts the command console with `origin="work"`. |
| Implementation review of `617da70` | 21 (5 MAJOR, 9 MODERATE, 7 assorted) | 19 confirmed and fixed; 2 narrowed or rejected on executed evidence. |
| Final pre-merge review of PR #31 at `3e17664` | 10 (1 BLOCKING) | all 10 confirmed and fixed. |
| Verification of the fix commit `b2fa232` | 5 (all LOW/TRIVIAL), verdict **MERGE** | all 10 prior fixes confirmed genuine — the blocking one in each of its six sub-checks; all 5 new findings fixed. |

Recorded in PRD §23, §23.1, §23.2 and §23.3 with per-finding adjudication.

**Why four cycles.** Each of the first three found a defect in the previous one's fix, so the fix commit was itself put through a focused verification before merge rather than trusted. That fourth cycle returned MERGE and reproduced independently the properties the third cycle's fix rests on — `prefilterTier` being SQL-authoritative, the tier assertion's sort being harmless over a single-digit domain, `partial-overlap` returning exactly `[2]`, the five outcome buckets being a true partition, and the eleven-scenario pin reproducing at 5 / 0 / 1 / 3 / 2. Its own findings were documentation accuracy and test coverage rather than behaviour: stale published totals, a deleted field still named in the PRD's normative list, two fixes shipped without tests, positional indexing that bound meaning to array order, and a date. Convergence is therefore claimed on evidence, not on exhaustion.

**The lesson this slice earned, stated because its product is accurate measurement.** The first three cycles converged on one failure mode: **a check that reads its own input proves nothing.** The reachability block asserted a frozen constant against itself. The tier-coverage case grouped on a hand-written label while the SQL-assigned tier sat unused on the row. The pagination comment promised an exhaustion assertion that was never written. CI was green through every one of them. Each is fixed by making the check read the thing it is about — the emitter source, `prefilterTier`, a total sort key.

Three findings were resolved **better** than proposed, and that is recorded rather than glossed: `no_match` now computes ADR-055's final-outcome definition exactly instead of declaring a deviation from it; the cascade proof became a composite of CI schema truth and an asserted deletion instead of a downgraded claim; and the unbounded creation rate was fixed by bounding its numerator rather than by disabling the branch, which would have discarded real in-window evidence.

## 5a. The dated expiry (2F-MEASURE-006, ADR-060)

ADR-060 anchors go-live on the merge date because it is the only candidate that is already a durable git fact. The merge commit `2ae2606` carries `2026-07-29` (`git show -s --format=%cs`), so:

| Field | Value |
|---|---|
| Go-live | **2026-07-29** — the Slice 2F.5 merge date |
| Horizon | 90 days (ADR-055) |
| **Expiry** | **2026-10-27** |

The date was **computed, not written by hand**: `expiryDateFromGoLive` in `scripts/phase-2f-command-funnel.mjs` produced it, which is the single source ADR-060 points at. `docs/TODO.md` now carries the concrete date, and `2F-OPERATIONS-006` verifies that entry exists dated at closeout.

This is why the slice needed two pull requests. The merge date is not knowable while the implementation PR is open, so writing the date inside it would have meant guessing — and a PR that merged a day late would have made the guess wrong. The same two-PR shape Slice 2F.4 used (implementation #28, then acceptance #30) applies here: implementation #31, then this acceptance change.

## 6. Important design decisions

1. **ADR-058** — `is_synthetic` becomes a fourth exclusion mechanism, classified as **hygiene, not a trust boundary**: it is client-supplied through `recordProductInteraction`, while the other three are enforced by the database.
2. **ADR-059** — the end-to-end baseline runs in an opt-in Vitest lane so it uses the **real** candidate loader and the **real** scorer. A reimplementation would have measured the reimplementation.
3. **ADR-060** — go-live is this slice's merge date, making ADR-055's expiry a git fact a closeout verifier can confirm.
4. **`windowDays` is a ceiling**, and each tier reports whether the window it was run at can satisfy it at all. Fifty commands over a year is weaker evidence than fifty over a fortnight; and a 14-day window admits at most 15 distinct local dates, so the planning tier's 20 active days is unreachable there for a reason that has nothing to do with the data.
5. **The reader publishes its own blind spots as data**, and a CI case derives them from the emitters rather than restating them.
6. **The aggregator lives in plain Node**, because Vitest (no network, in CI) and the runner (deployed project) cannot otherwise share one implementation.

## 7. Test results

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **2423 / 2425** — two pre-existing Windows-only failures (§12) |
| `npm run build` | compiled successfully |
| `deno check` both entrypoints | clean |
| `deno test supabase/functions/` | 46 / 46 |
| `npm run test:remote:2f:funnel` | **32 / 32 assertions, exit 0**, re-executed after every fix |
| `npm run test:remote:2f:baseline` | **9 / 9, exit 0**, stable across three runs at the final corpus |

## 8. Ownership, denial and RLS proof

Executed against the deployed project by `npm run test:remote:2f:funnel`, 32 assertions at exit 0:

| Proof | Result |
|---|---|
| Owner-scoping | Owner A's report exact over its own corpus; owner B's exact over its own |
| Cross-owner denial, **non-vacuous** | Each owner's **positive** count asserted **before** the other's invisibility, per `2F-OWNERSHIP-001`; both directions zero rows |
| Anonymous denial | An anonymous caller reads no product event |
| **Service-role denial** | The service-role key **cannot** read `product_events` — asserted, not assumed, because a dashboard grant would never appear in the migration chain |
| Synthetic exclusion | A synthetic row emitted through the real recorder is excluded and counted |
| Unsupported exclusion | Counted separately, absent from the qualifying distribution, and present in the refusal breakdown |
| Replay exclusion | A replayed creation is reported and not counted as a creation |
| Policy attribution | Every counted row attributed to the policy version that produced it |
| Cascade deletion | Both fixture owners deleted with the deletion asserted; the deleted owner cannot authenticate again; no owner survives |
| Fail-closed cleanup | Asserted before the run may exit 0 |

Read-side RLS is `product_events_select_own` (`202607170024:63-64`), unchanged. **No grant, policy, or privilege was created, widened or revoked.**

## 9. Data accuracy proof

The end-to-end match baseline (`2F-MEASURE-007`), measured against the deployed contract through the real `loadTaskCandidates` and the real `rankTaskCandidates`:

| Measure | **End-to-end** (Slice 2F.5) | Scoring layer (2E-MATCH-018, retained) |
|---|---|---|
| Policy version | `2026-07-25.3` | `2026-07-25.3` |
| Scenarios | 11 | 14 |
| One-step apply | **0.455** | 0.429 |
| Matched, needs deliberateness | **0** | 0.071 |
| Confirmation required | **0.091** | 0.071 |
| Ambiguous (incl. overflow) | **0.273** | 0.214 |
| No match | **0.182** | 0.214 |

**Cross-scope comparison remains prohibited.** These measure different things: the Phase 2E rates score hand-written `prefilterTier`/`tokenOverlap`/`queryTokenCount` triples; these score the triples SQL actually produced. Any resemblance is a coincidence of two differently-composed corpora.

Corpus tier coverage, **measured from SQL rather than from annotations**: six scenarios at tier 0 (`exactTitle`), two at tier 1 (`titlePhrase`), one at tier 2 (`connected`), one excluded by status before scoring, one unconnected. Every scenario's declared tier is asserted against the tier the deployed query assigned. Signals the corpus does **not** move: the relational (`referenced_project`/`context`/`person`) and temporal-proximity weights — no command carries such a hint and no relations are seeded. Stated in the test itself.

## 10. Residue proof

An independent probe against the deployed project after all six remote runs: **zero Slice 2F.5 fixture survivors** (2 users in the project, 4 tasks — all pre-existing real data). The temporary probe harness was removed and the working tree verified clean. Every remote run additionally asserts its own fixtures gone before it may exit 0.

## 11. Rollback status

**No rollback executed, and none possible to need.** Per the phase PRD §11, Slice 2F.5 is read-only: nothing was applied to any environment, so there is no migration to revert. The code rollback is a plain revert of a PR containing only scripts, tests, a pgTAP addition, config wiring and documentation. The only production writes were disposable fixtures the runs deleted and asserted gone, and those belonged to fixture users outside the real owner's range by RLS even had a run been killed mid-flight.

## 12. Known limitations

1. **`2F-MEASURE-005`'s unsupported-refusal volume is not measurable this phase.** Three allowlisted preview categories (`unsupported`, `applied`, `rejected_conflict`) are emitted by no deployed code path — both `unsupported` branches return before the emitter exists. The exclusion rule is implemented and unit-tested and is **vacuous against production data**. A named partial, not a zero counter passed off as an observation.
2. **`qualifyingCommands` counts preview rounds, not intents,** and errs in both directions: one intent emits one to three rounds, and some emit none. No command identifier exists to deduplicate on this phase.
3. **Undo results and the applied population measure two funnels** whose difference is not a clean measure; both are reported raw.
4. **Event-row absence after an owner's deletion is unreadable with any credential this repository holds.** The cascade is proven as schema truth in CI pgTAP plus an asserted owner deletion.
5. **Each tier must be read at its own window**; one report carries one window, so a single invocation can positively evaluate at most one tier.
6. **The real owner's funnel is empty.** Phase 2E's evidence is that zero real commands have been typed. This slice's value is that the gate is computable and its thresholds are pinned.
7. **Pre-existing, recorded, not fixed here.** `src/features/task-commands/sql-reachability.test.ts` fails two cases on a Windows checkout: it searches migration text with `\n`-anchored literals while `core.autocrlf=true` gives the working copy CRLF, and the probes match after normalisation. Proven pre-existing by reproducing both with every Slice 2F.5 change stashed; green in CI on Linux at `6628b02` (run `30496790432`) and again in this slice's own runs. Correcting it is unrelated cleanup and belongs in its own change; recorded in `docs/TODO.md` with its root cause.

## 13. Deferred work

Reason-level refusal granularity (needs an allowlist widening, post-2F); an emitter for the three unreachable preview categories; a UI surface for the funnel; the offline replay spike the spike tier may authorize; the privileged distinct-user read, performed at evaluation time; a command identifier enabling per-intent counting; `product_events` retention/purge; the `docs/PHASE_2F_PRD.md` §10 `database`-cell correction (`2F-OPERATIONS-006`); and every other Slice 2F.6 item.

## 14. Confirmation that Slice 2F.6 was not started

Absent, unmodified, unbegun:

- `scripts/generate-phase-2f-traceability.mjs` (`2F-OPERATIONS-003`) — does not exist.
- `scripts/verify-phase-2f-cleanup.mjs` (`2F-OPERATIONS-004`) — does not exist. This slice's fixtures are proven gone by its own fail-closed assertions and an independent residue probe, which is not the phase-wide verifier; the PRD hands that verifier this slice's fixture scope as a written handover.
- `scripts/phase-2f-reminder-census.mjs` (`2F-OPERATIONS-005`) — neither executed nor edited.
- Closeout documentation reconciliation (`2F-OPERATIONS-006`) — not performed beyond what this slice's own change requires. The stale Phase-2F `TODO.md` line, `SECURITY.md`, `DATABASE.md`, `PHASE_2_PLAN.md` and the §10 matrix row remain Slice 2F.6's.
- The whole-phase convergence audit — not performed.
