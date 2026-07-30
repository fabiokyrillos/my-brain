# Phase 2F — Slice 2F.5 implementation report

**Scope:** `2F-MEASURE-001` … `2F-MEASURE-007` (epic 2F-E) plus `2F-OPERATIONS-002`.
**Contract:** `docs/reports/PHASE_2F_SLICE_05_PRD.md` (definitive).
**Decisions:** ADR-058, ADR-059, ADR-060.
**Migrations:** none. Remote parity unchanged at `202607300063`.
**Slice 2F.6:** not started (§9).

---

## 1. What shipped

| Artifact | Role |
|---|---|
| `scripts/phase-2f-command-funnel.mjs` | The reader: aggregator, evidence-tier evaluator, expiry arithmetic, thresholds, refusal subset, reachability facts. One implementation, reachable from both Vitest and the Node runner. |
| `scripts/phase-2f-command-funnel-reader.mjs` | The runner: an owner read that writes nothing, and a `--proof` mode that writes disposable fixtures and deletes them. |
| `src/features/product-analytics/command-funnel.test.ts` | 50 cases in CI's `app` job: aggregator behaviour, exclusions, boundaries, tiers, expiry, vocabulary read/mirror parity, reachability derived from the emitters. |
| `src/features/task-commands/end-to-end-match-baseline.remote.test.ts` | The end-to-end baseline (2F-MEASURE-007), against the deployed contract, using the real loader and the real scorer. |
| `vitest.remote.config.ts` + one `exclude` line | The credentialed lane, kept out of CI (ADR-059). |
| `supabase/tests/product_events.sql` (+3 assertions) | The cascade delete action, the synthetic partial index, and `is_synthetic`'s not-null constraint, as schema truth in CI. |
| `package.json` (+3 scripts) | `test:remote:2f:funnel`, `test:remote:2f:baseline`, `measure:2f:funnel`. |

No migration, no RPC, no view, no grant, no policy, no new product event, no allowlist change, no `database.types.ts` change, no production module change, no UI, no i18n key. `src/` gained exactly two test files.

## 2. The gate is now computable

`evaluateEvidenceTiers` returns both ADR-055 tiers with every threshold, its measured value, the comparison it applies, and a per-threshold verdict.

- **Spike tier** — 50 qualifying commands / 10 active days / a 14-day window. Fully computable; can return `met`.
- **Planning tier** — 150 / 20 / 30-day window / ≥2 distinct users, with `noMatchRate ≥ 0.20` **or** `noMatchToCreationRate ≥ 0.15`. Structurally unable to return `met`: `distinctUsers` is `null` with `privilegedReadRequired: true`, and no branch produces `met` for it. At one user the tier authorizes nothing beyond the spike, exactly as ADR-055 says.
- **Expiry** — `expiryDateFromGoLive(goLive)` returns go-live + 90 days. Go-live is the merge date (ADR-060), so the date is written in the acceptance commit, when it is a git fact.

Three properties of the arithmetic are worth naming, because each was a defect the review caught:

1. **`windowDays` is a ceiling, not a floor.** ADR-055 reads "50 commands / 10 active days / a 14-day window": the window is the measurement period. Fifty commands over a *year* is weaker evidence than fifty over a fortnight, and an earlier draft would have returned `met` for it — making the reader's only authorizing verdict reachable by waiting.
2. **`no_match` follows the ADR's *final-outcome* definition.** `creation_offered` is emitted at preview time (`actions.ts:623`), and a command that goes on to create ends `applied` (`:981`). With no per-row join key, the split is still exact in aggregate: `creationsFromOffers = min(creationOffered, created)`, `finalNoMatch = stillUnmatched + (creationOffered − creationsFromOffers)`. The `min` is what keeps the creation rate inside its own denominator; creations beyond it came from offers in an earlier window and are reported as `windowBoundarySkew` rather than allowed to report a rate above 100%.
3. **The rate gates are decided by integer multiplication** against declared fractions (1/5, 3/20), so no rounded rate stands between the evidence and the gate, and a zero denominator can never satisfy one. The exact fraction travels beside the rounded rate in the output.

## 3. What the reader says it cannot measure

The report carries a `reachability` block as data, because a measurement that prints a structurally-impossible zero as though it were an observation is worse than no measurement.

| Fact | Consequence |
|---|---|
| `unsupported`, `applied` and `rejected_conflict` are allowlisted on `task_command_previewed` and **emitted by no code path** — both `unsupported` branches return before the emitter exists (`actions.ts:347-358`, `:719-726`; `report` is defined at `:400`) | `unsupportedRefusals` is structurally `0` against production. The exclusion rule is implemented and unit-tested and is **vacuous against production data** until an emitter exists. **`2F-MEASURE-005`'s unsupported-refusal *volume* is therefore not measurable this phase** — reported as a named partial, not silently satisfied by a zero counter. |
| One user intent emits **1–3** preview rounds (first round; disambiguation re-round `:746-777` → `:466`; clarification re-round `:573` → `:546`/`:558`/`:623`), and the allowlist carries no command identifier | `qualifyingCommands` counts **qualifying preview rounds**, named `countingUnit` in the output. It over-counts intents on those paths. |
| Some intents emit **no** preview event: the creation round returns its failure state before reporting (`:615-622`) | The same count under-counts in the other direction. |
| Work-surface direct actions apply with no preview round (`operations/actions.ts:386`) | The previewed and applied populations are reported **raw and side by side**, never subtracted: a subtraction can read zero while that path is busy. |
| The Work direct-action path has **no** undo event; the only emitter is `actions.ts:1070` | Undo results measure the console only. |
| Policy version is recorded per row | A mid-window policy bump shows as two keys in `policyVersions` instead of being averaged away. |

A CI case **reads** `actions.ts` and derives the unreachable set from the literals actually handed to the emitter, so a future `report("unsupported")` fails the build and forces the claim to be corrected. Asserting the frozen constant against itself would have proven nothing.

## 4. Exclusion mechanisms, and what remains unprovable

ADR-058 adds `is_synthetic` as a **fourth** mechanism and classifies it as hygiene rather than a trust boundary — the field is client-supplied through `recordProductInteraction`, unlike the three enforced by the database.

| Mechanism | How it is proven |
|---|---|
| (i) `user_id` cascade to `auth.users` | **Composite proof.** CI pgTAP asserts the foreign key's delete action is `cascade` on the chain applied from empty; the remote proof captures owner A's **positive** own-session count, deletes both fixture owners with the deletion asserted, and proves the deleted owner cannot authenticate again. |
| (ii) fail-closed cleanup | The proof deletes in a `finally`, asserts the deletion, and re-checks each owner is absent before it may exit 0. Exit-2 conditions are raised as a tagged throw, never a bare `process.exit`, so cleanup always runs. |
| (iii) owner-scoping by RLS | Cross-owner reads asserted empty **after** asserting each owner's own positive count, per `2F-OWNERSHIP-001`'s standing lesson; anonymous reads denied. |
| (iv) `is_synthetic` | A synthetic row emitted through the real recorder is excluded and counted; the CI suite pins the same behaviour. |

**Recorded residual, owned rather than claimed away.** `revoke all … from service_role` is real, and the proof **asserts** it: no credential this repository holds can read an event row once its owner is gone. So the cascade's *effect on event rows* is proven at the schema level and by the owner's deletion, not by reading the absent rows. Orphan non-synthetic events from a run killed before cleanup remain possible; they belong to disposable fixture users and are outside the real owner's range by mechanism (iii), so they can never enter the real gate. `2F-OPERATIONS-004`'s cleanup verifier (Slice 2F.6) is the phase-wide mitigation, and §22 of the PRD hands it this slice's fixture scope.

## 5. The end-to-end match baseline (2F-MEASURE-007)

Measured against the deployed project with disposable fixtures, through the **real** `loadTaskCandidates` against the deployed `list_task_command_candidates` and the **real** `rankTaskCandidates`. Eleven scenarios, policy `2026-07-25.3`.

| Measure | **End-to-end** (this slice) | Scoring layer (2E-MATCH-018, retained) |
|---|---|---|
| Scenarios | 11 | 14 |
| One-step apply | **0.455** | 0.429 |
| Matched, needs deliberateness | 0 | 0.071 |
| Confirmation required | **0.091** | 0.071 |
| Ambiguous (incl. overflow) | **0.273** | 0.214 |
| No match | **0.182** | 0.214 |

**These are two scopes and they are never compared.** The Phase 2E numbers measure the scoring layer against hand-written `prefilterTier`/`tokenOverlap`/`queryTokenCount` triples; these measure the whole path with the triples SQL actually produced. `PHASE_2E_FINAL_REPORT.md` prohibits cross-scope comparison, and the near-agreement above is a coincidence of two differently-composed corpora, not a validation of either. Quoting one against the other is forbidden wherever either appears.

**The corpus is designed against the prefilter's tier ladder**, and it took two corrections to make that true rather than claimed.

The first attempt wrote every hint as a non-contiguous subset of a title containing stopwords: nothing reached tier 0 or 1, every scenario scored `0.22`, and `exactTitle` — the policy's strongest weight — was never exercised. Two assertions passed vacuously as a result: the destructive scenario refused one-step because **nothing matched**, not because `cancel_task` is destructive, and the duplicate-title scenario was ambiguous for the same weak reason a single copy would have been. Stopword-free titles fixed that.

The second correction is subtler and was caught by the final review. The scenario labelled *tier 2* — a single hint word `["report"]` — actually reaches **tier 1**: the ladder's phrase rung accepts any hint of three characters or more that appears in the title as complete words (`202607260059:2864-2868`), so `' send quarterly report ' LIKE '% report %'` matches. It scores `0.62`, *above* the confidence threshold, and is ambiguous only because two rows tie on it. So the corpus reached tiers 0 and 1 and **never visited tier 2** — while the case that was supposed to guarantee coverage grouped on the hand-written `tier` annotation and passed anyway. That is the same defect class wearing a guard's uniform.

Both halves are now fixed. `prefilterTier` is read off the rows the deployed query returned, the coverage case asserts the **measured** tier set, and each scenario's annotation is checked against SQL — the assertion that would have caught the mislabelling. And a genuine tier-2 scenario was added rather than the claim being narrowed: `["review","spreadsheet"]` against *"Review the budget spreadsheet"* is present but non-contiguous, so the phrase rung fails and only lexical overlap remains. That is the rung where a semantic signal would plausibly help, which makes it the one an evidence gate for semantic retrieval should least like to skip. The corpus is now six scenarios at tier 0, two at tier 1, one at tier 2, one status-excluded and one unconnected — re-measured and re-pinned, stable across three runs.

**Signals this corpus does not move, stated so the rates are not over-read:** no command carries a project, context, person or temporal hint, and no relations are seeded, so `referenced_project`, `referenced_context`, `referenced_person` and both temporal-proximity weights are untested here. The measurement instant is derived from the newest seeded row rather than fixed as a literal, so the recency signal's relationship to the corpus is deterministic on every run instead of depending on the hour the run happened.

## 6. Evidence executed

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **2418 / 2420** — the two failures are pre-existing and Windows-only (§8) |
| `npm run build` | compiled successfully |
| `deno check` both entrypoints | clean |
| `deno test supabase/functions/` | 46 / 46 |
| `npm run test:remote:2f:funnel` | **32 / 32 assertions, exit 0**, fixtures proven gone |
| `npm run test:remote:2f:baseline` | **9 / 9, exit 0**, stable across three independent runs at the final corpus |
| CI, all three jobs on the merge SHA | recorded in the acceptance report |

The funnel proof's controls: owner-scoping, cross-owner isolation, anonymous denial, **service-role denial**, synthetic exclusion, unsupported exclusion, final-outcome no-match, replay exclusion, policy-version attribution, origin cross-tabulation, distinct-user out-of-range, tier evaluation, expiry, cascade deletion, fail-closed cleanup.

## 7. Review cycles

Three independent adversarial reviews, all recorded in the PRD (§23, §23.1, §23.2).

- **Design review** — 23 findings; 22 confirmed and folded in, one BLOCKING claim rejected on evidence.
- **Implementation review** — 21 findings; 19 confirmed and fixed, two narrowed or rejected on executed evidence. Five changed behaviour: the window-as-ceiling inversion, the unbounded creation rate, the self-asserting reachability test, the exit-2 path that skipped cleanup, and the degenerate corpus.
- **Final pre-merge review** — 10 findings, one BLOCKING. All ten confirmed and fixed. The blocking one is above: the tier-coverage guard asserted its own annotation, and the corpus never reached tier 2.

Across the three cycles the recurring lesson is the same, and it is worth stating because it is the lesson of this slice: **a guard that reads its own input proves nothing.** The reachability block asserted a frozen constant against itself; the tier-coverage case grouped on a hand-written label; the pagination comment claimed an exhaustion assertion that did not exist. Each was fixed by making the check read the thing it is about — the emitter source, the SQL-assigned tier, a total sort key.

## 8. The two failing tests, and why they are not this slice's

`src/features/task-commands/sql-reachability.test.ts` fails two cases on this workstation. **Proven pre-existing and Windows-specific:**

1. Both failures reproduce with every Slice 2F.5 change stashed.
2. The root cause is line endings, not logic: the test searches migration text with `\n`-anchored literals (`migration.indexOf("\n  select\n    r.id,")`, a `\n\s*order by\n` regex), `core.autocrlf=true` gives the working copy CRLF, and the probe matches after CRLF normalisation — verified directly.
3. CI checks out LF on Linux and was green on this file at `6628b02` (run `30496790432`).

The file is untouched by this slice. It is **not** corrected here: fixing it is unrelated cleanup, and this slice's PR is a single concern. It is recorded in `docs/TODO.md` as a named defect with its root cause, so the next session does not re-diagnose it.

## 9. Slice 2F.6 did not start

Absent, unmodified, unbegun: `scripts/generate-phase-2f-traceability.mjs` (2F-OPERATIONS-003) and `scripts/verify-phase-2f-cleanup.mjs` (2F-OPERATIONS-004) do not exist; `scripts/phase-2f-reminder-census.mjs` was neither run nor edited (2F-OPERATIONS-005); no closeout documentation reconciliation was performed beyond what this slice's own change requires (2F-OPERATIONS-006); no convergence audit was performed. The stale Phase-2F `TODO.md` line, `SECURITY.md`, `DATABASE.md` and `PHASE_2_PLAN.md` reconciliation items remain Slice 2F.6's.

## 10. Known limitations

1. `2F-MEASURE-005`'s unsupported-refusal volume is **not measurable** this phase (§3). Reported as a partial.
2. `qualifyingCommands` counts preview rounds, not intents, in both error directions (§3).
3. Undo results and the applied population mix two funnels whose difference is not a clean measure; both are reported raw.
4. Event-row absence after an owner's deletion is unreadable with any credential this repository holds; the cascade is proven at the schema level instead (§4).
5. The end-to-end corpus exercises all three title-tier weights and the status filter, but **not** the relational (`referenced_project`/`context`/`person`) or temporal-proximity ones: no command carries such a hint and no relations are seeded. Stated in the test itself so the rates are not over-read (§5).
6. The real owner's funnel is expected to be **empty**: Phase 2E's own evidence is that zero real commands have been typed. The reader's value this phase is that the gate is computable and its thresholds are pinned, not that it has data to report.
