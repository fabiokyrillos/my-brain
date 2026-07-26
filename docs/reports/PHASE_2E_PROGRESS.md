# Phase 2E — Execution Progress

**Status: IN PROGRESS — Slice 2E.2 accepted, Slice 2E.3 next.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote, divergence `0 0`) |
| Branch HEAD | `56111ac` |
| Phase base | `2e2acfd` |
| Working tree | clean |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI | **all three jobs green** on `56111ac` (run 30182925282): `application`, `edge worker`, `database and journey`. The pgTAP suite reports `Files=26, Tests=883, Result: PASS` |
| Merged | nothing |
| Tagged / released | nothing |

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover |
| `202607250055`, `202607250056` (Phase 2E) | **local only.** Both apply from zero in CI; neither is applied to the linked project. Deferral is deliberate — see the slice report §10 |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged; Slices 2E.1 and 2E.2 touch no worker code |
| Generated types | `database.types.ts` carries `list_task_command_candidates`, **hand-written** (ADR-041). No claim of regeneration is made anywhere |

## Slice status

| Slice | Epic | Status |
|---|---|---|
| 2E.1 — Bounded task command contract | 2E-A | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_01_REPORT.md` |
| 2E.2 — Deterministic matching and margins | 2E-B | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_02_REPORT.md` |
| 2E.3 — Disambiguation and read-only preview | 2E-C | **next** |
| 2E.4 — Reversible non-destructive updates | 2E-D | not started |
| 2E.5 — Destructive actions and confirmation | 2E-E | not started |
| 2E.6 — No-match activity creation | 2E-F | not started |
| 2E.7 — Conversational and task-surface integration | 2E-G | not started |
| 2E.8 — Convergence and closeout | 2E-H | not started |

## Slice 2E.2 — the eleven outstanding items, all closed

| # | Item | Disposition |
|---|---|---|
| 1 | Boundary mutation survivors | **Closed.** Fixtures at exactly the declared limit, exactly 0.55, exactly 0.12, seven qualifying candidates against a cap of five, and exactly 24h/72h temporal bands |
| 2 | `localeCompare` survived | **Closed.** `"B"` vs `"a"` behavioural fixture, plus a structural guard forbidding `.localeCompare(` and `Intl.Collator(`, extended into the existing normalizer-divergence architecture guard. The acceptance review defeated the first version by *moving* the comparator to a new module, so the guard now enumerates the feature directory instead of a hard-coded file list |
| 3 | Relation arguments permutable undetected | **Closed.** Three distinct values, each asserted by name |
| 4 | Row-schema refinements untested | **Closed.** Table-driven over 17 invalid values and 14 missing keys, asserting the **specific** error code so a removed refinement cannot pass on the strength of a different layer |
| 5 | Corpus triples not provably reachable | **Closed.** `describeUnreachableCandidates` in `matching.ts`, pinned against the migration text by `sql-reachability.test.ts`, enforced by `loadTaskCandidates`, asserted over every fixture in both corpora. One fixture was genuinely unreachable and was corrected |
| 6 | Normalizer cross-file check catches single-sided drift only | **Closed as far as it can be.** Anchored on the whole `select is(...)` form and the executed-assertion count must equal `CORPUS.length`. Co-drift remains pgTAP's to catch, by design |
| 7 | No slice report; `STATE`/`CHANGELOG`/`DECISIONS` untouched | **Closed.** `PHASE_2E_SLICE_02_REPORT.md`, plus **ADR-040** (security definer) and **ADR-041** (hand-maintained type, three-way parity) |
| 8 | 2E-OPERATIONS-003 focused remote smoke | **Recorded as owed and blocked on deployment; not run, not claimed.** Non-blocking for the verdict — Epic 2E-B's criteria do not name one, and PRD §19.3 makes it a phase-level gate. Slice report §11, `TODO.md` |
| 9 | Rollback undocumented | **Closed.** Slice report §10: routing-level, nothing calls it, no index or trigger changed any write path, no destructive down migration, and the grant posture on rollback |
| 10 | Injection-string fixtures | **Closed.** `_`, embedded backslash, trailing backslash (the `22025` case), a wholly-metacharacter hint proven equal to an absent one *and pinned to 4*, owner scope under a bare wildcard, and ordering stability. Plan 34 → 48, after the acceptance review added symmetric cross-owner absence, owner-scoped relation laterals, and the limit clamp at 0/101/null |
| 11 | `SECURITY.md` has no entry | **Closed.** A full Phase 2E Slice 2E.2 section, including the residual impact if the ownership predicate regresses |

### Mutation verification

Thirty-six mutations were applied one at a time across three rounds, run against the focused suite, and reverted. **All thirty-six are killed.** The fifteen from the sixth review are enumerated in the slice report §8, followed by the twenty-one the acceptance review added - including four that deleted this slice's own correction-pass fixes without reddening anything.

## The measured 2E-MATCH-018 baseline

At policy version `2026-07-25.3`: one-step 0.429 · matched-needs-deliberateness 0.071 · confirmation-required 0.071 · ambiguous (incl. overflow) 0.214 · no-match 0.214.

**State the scope when citing these.** The 14-scenario corpus supplies `prefilterTier`/`tokenOverlap`/`queryTokenCount` by hand, so the rates measure the *scoring layer against declared SQL verdicts*, not end-to-end matching. Every triple is now proven to be one SQL can actually emit, which the caveat did not previously cover. Slice 2E.8 must carry the rates into the phase report with that scope attached.

## Local gates on HEAD

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **1462 passed / 109 files** · focused `src/features/task-commands` **373 passed / 11 files** · `build` clean · `deno check` clean · `deno test` 46 passed.

## Next: Slice 2E.3 — Disambiguation and read-only preview (Epic 2E-C)

Read `docs/PHASE_2E_PRD.md` §13.3 and §13.4, then `matching.ts`, `question-preview-projection.ts`, `mapResolutionRpcError`, and `PHASE_2E_SLICE_02_REPORT.md`.

- `TaskMatchResult` already carries `ownerId`, `observedBefore`, `qualifyingCount` and each candidate's full `preState`, so 2E-PREVIEW-004's fingerprint needs **no second read of the task**. That was deliberate; re-querying reopens the TOCTOU window `observedBefore` exists to close.
- `qualifyingCount === 1` with outcome `ambiguous` means "I found one but I am not sure", **not** a disambiguation list of one — 2E-MATCH-012 forbids that rendering.
- `src/features/agent/question-preview-projection.ts` is the `willMutate: false` precedent 2E-PREVIEW-001 mandates mirroring.
- `mapResolutionRpcError` (`src/features/tasks/actions.ts:542-593`) is the error-to-copy precedent.
- The preview must detect relation-aware `no_change`, show linked reminder effects, and disclose the 24-hour undo window.
- The fingerprint binds owner, task, observed pre-state, canonical patch, policy version and operation key.
- **Any change to the RPC's result columns needs a `_v2`** — `create or replace` raises `42P13`. Confirm the widened projection really is sufficient **first**; 2E.3 is also the last slice in which correcting `202607250056` in place is still possible, because nothing has deployed or merged it.
- **No mutation belongs in Slice 2E.3.**

Useful commands:

```powershell
npx vitest run src/features/task-commands           # focused
npm run lint; npm run typecheck; npm test; npm run build
deno check supabase/functions/process-jobs/index.ts supabase/functions/heartbeat/index.ts
deno test supabase/functions/
npx supabase migration list --linked                # parity
gh pr checks 18                                     # the database gate
```

## Environment constraints that shape the workflow

- **Docker is unavailable** on this workstation, so `supabase db reset`, `supabase test db` and `supabase db lint --local` cannot run locally. Draft PR #18's `database` job is the only way to execute them; push and read `gh pr checks 18`. Budget ~5 minutes per run.
- **Scripted edits to SQL files must not pass backslash escapes through a shell heredoc.** `\00F3` became a literal NUL twice and silently disabled the entire pgTAP suite. Build backslashes with `chr(92)`, or edit the file with a text-editing tool rather than a script. `status-vocabulary-parity.test.ts` now fails on a NUL byte or raw non-ASCII outside a comment, so the failure mode is caught rather than silent.
- The linked project is reachable, so remote parity and deployed worker versions can be verified locally.
- `gh` is authenticated as `fabiokyrillos`.

## Stop reason

Session context exhausted at a clean boundary: Slice 2E.2 accepted, Slice 2E.3 not started.

Slice 2E.2 was taken from "implemented and CI-green" to accepted by closing all eleven outstanding items, then submitting it to three independent acceptance reviewers across the seven named dimensions. That review was worth running: it found **one live defect** (the tautological status hint, which bought a one-step apply for a word that excluded no candidate), **three Criticals** that were all untested fixes from this slice's *own* earlier correction pass — including the `writesRelation` guard whose removal restores the exact "unconfirmed `waiting_on` write on the wrong task" defect it was added for — and two Importants found independently by two reviewers. All are fixed, each verified by applying the mutation and confirming the failure.

Stopping here rather than opening 2E.3 is deliberate. That slice designs the preview contract and the 2E-PREVIEW-004 fingerprint, and it is the last point at which `202607250056` can still be corrected in place; beginning it with little context left risks a half-specified contract that a later slice inherits. The next session starts from a clean tree, green CI, and the specific reading list above.

**What the next session must not assume:** that the widened projection is sufficient. Confirm it against PRD §13.3/§13.4 *before* writing the preview, because after 2E.3 the only way to change a result column is a `_v2` (`42P13`).
