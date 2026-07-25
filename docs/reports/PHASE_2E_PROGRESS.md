# Phase 2E — Execution Progress

**Status: CONTINUATION REQUIRED — PHASE 2E NOT READY.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote, divergence `0 0`) |
| Branch HEAD | `120e4a1` |
| Phase base | `2e2acfd` |
| Commits on branch | pre-2E cutover (`739e3b9`…`350c7ad`) → `a2e4d87` (PRD) → Slice 2E.1 (`6db7827`, `837ae60`, `6c4a907`, `57b0d4d`, `79a3021`) → Slice 2E.2 (`b143b42`, `5de68eb`, `d7b4eb3`, `a2c263d`, `c32a5bd`, `120e4a1`) |
| Working tree | clean |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI on HEAD | **all three jobs green** (run 30178278987): `application`, `edge worker`, `database and journey` |
| Merged | nothing |
| Tagged / released | nothing |

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover |
| `202607250055`, `202607250056` (Phase 2E) | **local only.** Both apply from zero in CI; neither is applied to the linked project |
| Deployed worker | `process-jobs` v15, `heartbeat` v4 — unchanged; Slices 2E.1 and 2E.2 touch no worker code |
| Generated types | `database.types.ts` carries `list_task_command_candidates`, **hand-written** — see "The generated-types situation" below |

## Slice status

| Slice | Epic | Status |
|---|---|---|
| 2E.1 — Bounded task command contract | 2E-A | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** See `PHASE_2E_SLICE_01_REPORT.md` |
| 2E.2 — Deterministic matching and margins | 2E-B | **IMPLEMENTED, REVIEWED, CORRECTED, CI-GREEN — NOT YET ACCEPTED.** Outstanding work below |
| 2E.3 — Disambiguation and read-only preview | 2E-C | not started |
| 2E.4 — Reversible non-destructive updates | 2E-D | not started |
| 2E.5 — Destructive actions and confirmation | 2E-E | not started |
| 2E.6 — No-match activity creation | 2E-F | not started |
| 2E.7 — Conversational and task-surface integration | 2E-G | not started |
| 2E.8 — Convergence and closeout | 2E-H | not started |

## What Slice 2E.2 shipped

- `supabase/migrations/202607250056_phase_2e_task_command_matching.sql` — `public.list_task_command_candidates`, the read half of matching. Owner-scoped, filtered on the action's declared eligible statuses, ordered totally and deterministically **before** it truncates, returning one row beyond the limit so truncation is detectable, and projecting the full observed pre-state of every field §11.2 can change.
- `supabase/tests/phase_2e_task_command_matching.sql` — 34 pgTAP assertions, **executed against a from-zero database in CI run 30178278987**.
- `src/features/task-commands/match-policy.ts` — every weight, threshold, limit, tier and band, at `TASK_MATCH_POLICY_VERSION = 2026-07-25.2`.
- `src/features/task-commands/matching.ts` — the pure scorer, comparator and outcome classifier.
- `src/features/task-commands/candidates.ts` — the injectable data-access layer.
- Tests: `matching.test.ts`, `candidates.test.ts`, `match-baseline.test.ts`, `normalizer-divergence.test.ts`, `database-types-parity.test.ts`, `status-vocabulary-parity.test.ts`, plus match-policy additions to `policy-lock.test.ts`.
- `src/features/tasks/task-candidate-form.test.tsx` — a pre-existing flake fixed (`a2c263d`), unrelated to Phase 2E.

Local gates on HEAD: `lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **1324 passed / 108 files** · `build` clean · `deno check` clean · `deno test` 46 passed.

## The measured 2E-MATCH-018 baseline

From the committed 14-scenario corpus in `match-baseline.test.ts`, at policy version `2026-07-25.2`:

| Rate | Value |
|---|---|
| one-step | 0.429 |
| matched, needs deliberateness (`restore_task`) | 0.071 |
| confirmation required | 0.071 |
| ambiguous (incl. overflow) | 0.214 |
| no match | 0.214 |

**State the scope when citing these.** The corpus supplies `prefilterTier`/`tokenOverlap`/`queryTokenCount` by hand, so the rates measure the *scoring layer against declared SQL verdicts*, not end-to-end matching. Slice 2E.8 must carry them into the phase report with that caveat attached.

## Independent review of Slice 2E.2

Five reviewers across SQL/database, matching correctness, PRD conformance, architecture/operations, and security/test-rigour. Three ran code and proved defects by execution. **Five Criticals, all fixed:**

1. **The RPC could never have run.** `202607170020:314` revokes EXECUTE on `normalize_entity_alias` from `authenticated`, and its non-null `proconfig` stops the planner inlining it — `security invoker` meant `42501` for the only role that calls it. Now `security definer`, matching the `list_needs_attention` precedent and the `202607170022` workaround for the same revoke. Granting EXECUTE was refused: 2E-OWNERSHIP-003 says this phase widens no grant.
2. **The expression index would have broken task creation.** Index maintenance evaluates the expression as the *writing* role, and `createRecord` inserts into `public.tasks` as `authenticated` (`src/features/operations/actions.ts:68`) — the same `42501` on a live path. It was also unusable: qualification is a disjunction over lexical and relation signals, so the expression never sits in a sargable position. Removed.
3. **A bad clock manufactured a one-step apply.** `instantMs(now) ?? 0` fell back to the epoch and the age clamp then awarded full recency to everything; a designator-less instant made the outcome host-dependent. The instant is now a hard precondition (`TaskMatchInputError`), and an audit newer than it scores nothing.
4. **A relation hint rewarded the task that already held the relation.** `referencedProject`/`referencedPerson` sat at exactly `minMargin`, so one hint carried a pair from ambiguous to one-step — and for `set_waiting_on` it wrote a real `waiting_on` row on the wrong task. No single non-lexical signal now reaches the margin, and `scoreRow` refuses to score the relation the requested action writes.
5. **Two NUL bytes made the whole pgTAP file unrunnable.** A scripted edit turned `\00F3` into `0x00`; Postgres refuses it (22021) and the *file* aborted, silently voiding every SQL-side proof while TypeScript stayed green. Fixed, and `status-vocabulary-parity.test.ts` now fails on a NUL byte or any raw non-ASCII outside a comment.

Also fixed from Important findings: the projection widened to carry the full pre-state (because `create or replace` cannot add a `RETURNS TABLE` column — 42P13 — which would have forced a `_v2` in Slice 2E.3); relation ids and person roles now travel so 2E-PREVIEW-005 can detect an already-held relation without re-normalizing names in TypeScript; hints bounded server-side; `ambiguous_overflow` can no longer be returned with an empty candidate list; ordering uses the uncapped score; `effectiveLimit` is the minimum across rows; the temporal signal takes the nearer of due and planned and distinguishes its two bands; `resolveHintInstant` hoisted out of the per-row map; prefilter tiers declared as constants inside the policy digest; consumer-less band functions removed; the cross-owner proof made symmetric and a null-caller case added.

## Outstanding before Slice 2E.2 can be accepted

**These are known, specific, and none is a design defect — they are evidence and coverage gaps.** The fifth review (mutation testing, 41 real mutations) arrived after the correction pass and its PART B findings are not yet addressed.

1. **Mutation survivors — boundary fixtures.** Each of these mutations leaves the suite green: `overflowed` `>` → `>=` (no fixture at exactly `declaredLimit`); `topScore <` → `<=` and `margin <` → `<=` (2E-MATCH-011 says "at or above"; no fixture sits on either threshold); deleting `TASK_MATCH_LIMITS.ranked` entirely (no scenario produces more than three qualifying candidates); `distanceHours <= temporalExactHours` → `<`.
2. **`localeCompare` survives.** `matching.test.ts` "orders by score, then title, then id — and by nothing locale-dependent" uses titles `"a"`/`"b"`, which collate identically either way. Use `"B"` vs `"a"`, and add `expect(text).not.toMatch(/localeCompare/)` to `normalizer-divergence.test.ts`, which already forbids the other two re-implementation moves.
3. **The three relation hint arguments can be permuted undetected.** `candidates.test.ts` asserts them only as absent. Send distinct values and assert each by name.
4. **Row-schema refinements untested.** `owner_id.uuid()`, `token_overlap.min(0)`, `effective_limit.min(1)` and `prefilter_tier.int().min(0).max(3)` all survive removal — and `prefilter_tier: z.any()` defeats the one test written to catch it, because deleting the key then parses. Table-drive it.
5. **Corpus triples are not provably reachable.** `prefilterTier`/`tokenOverlap`/`queryTokenCount` are hand-invented in both test files; nothing asserts "tier 0 or 1 implies `tokenOverlap == queryTokenCount > 0`" or that a triple is one SQL can emit.
6. **The normalizer cross-file check catches single-sided drift only.** Co-drift (changing both files to a value the real function does not return) stays green; correctness rests on the pgTAP run, which is now genuinely wired up. Anchor the fragment on `/^select is\(public\.normalize_entity_alias\(/m` and assert the line count equals `CORPUS.length`.
7. **`docs/reports/PHASE_2E_SLICE_02_REPORT.md` does not exist**, and `STATE.md`, `CHANGELOG.md` and `DECISIONS.md` are untouched by this slice. Two decisions are architectural and owe an ADR (currently at ADR-039): the `security definer` choice forced by the `normalize_entity_alias` revoke, and hand-editing a generated file with tests rather than the generator as its verifier.
8. **2E-OPERATIONS-003** — a focused disposable remote smoke is owed, and is *blocked on deployment* rather than skipped: `202607250056` is local-only. Say so explicitly in the slice report, as Slice 2E.1 did.
9. **2E-OPERATIONS-005** — rollback for this slice is "nothing calls it", with no residual now that the index is gone. Undocumented.
10. **Injection-string fixtures.** pgTAP proves `%` cannot widen its own pattern; `_` and backslash are uncovered, and backslash matters because it is LIKE's default escape (a trailing one raises `22025`).
11. **`docs/SECURITY.md`** has no entry for this slice. Two residuals belong there: under `security definer` the `auth.uid()` predicate is the only ownership control inside the function, and the projection now carries `description` for up to 26 tasks per command.

## The generated-types situation

`supabase gen types typescript` cannot run here: Docker is unavailable on this workstation, and in CI the CLI refuses to start without an access token even when pointed at a local `--db-url` it never leaves. Satisfying that offline required a credential-shaped literal in the workflow, which GitHub push protection rejected — correctly. The whole-file regeneration check was therefore **withdrawn** (recorded in `docs/TODO.md`).

`list_task_command_candidates` is instead proven three ways, and all three are green: the migration declares the signature, `database-types-parity.test.ts` checks the generated types against that declaration (names, ordering, optionality, type mapping), and pgTAP pins both against `pg_proc.proargnames` from the real catalog.

## Next steps

**First**, close the eleven items above; items 1–6 are one focused test-hardening commit and items 7–11 are documentation. Then accept Slice 2E.2.

**Then Slice 2E.3 (Disambiguation and read-only preview, Epic 2E-C).** Read `docs/PHASE_2E_PRD.md` §13.3 and §13.4, then:

- `src/features/task-commands/matching.ts` — `TaskMatchResult` already carries `ownerId`, `observedBefore`, `qualifyingCount` and each candidate's full `preState`, so 2E-PREVIEW-004's fingerprint needs no second read of the task. That was deliberate; do not re-query.
- `TaskMatchResult.qualifyingCount === 1` with outcome `ambiguous` means "I found one but I am not sure", **not** a disambiguation list of one — 2E-MATCH-012 forbids that rendering.
- `src/features/agent/question-preview-projection.ts` is the `willMutate: false` precedent 2E-PREVIEW-001 mandates mirroring.
- `mapResolutionRpcError` (`src/features/tasks/actions.ts:542-593`) is the error-to-copy precedent.
- **Any change to the RPC's result columns needs a `_v2`** — `create or replace` raises `42P13`. The projection was widened in 2E.2 precisely to avoid that; check it really is sufficient before writing the preview.

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
- **Scripted edits to SQL files must not pass backslash escapes through a shell heredoc.** `\00F3` became a literal NUL twice this session and silently disabled the entire pgTAP suite. Build backslashes with `chr(92)`, or edit the file with a text-editing tool rather than a script.
- The linked project is reachable, so remote parity and deployed worker versions can be verified locally.
- `gh` is authenticated as `fabiokyrillos`.

## Stop reason

Session context exhausted after Slice 2E.2 was implemented, reviewed by five independent reviewers across nine dimensions, corrected against all five Criticals and every Important finding available at correction time, and verified through all local gates and three green CI jobs — including the database job, which executed the migration from zero and all 34 pgTAP assertions. Stopping with a clean tree at a green boundary, with the outstanding test-hardening and documentation work enumerated above rather than half-done.
