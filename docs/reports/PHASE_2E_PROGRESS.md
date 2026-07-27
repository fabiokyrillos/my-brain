# Phase 2E — Execution Progress

**Status: IN PROGRESS — Slice 2E.6 ACCEPTED. Paused before Slice 2E.7 by explicit user request.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote, in sync) |
| Branch HEAD | `2540ca5` implementation/test HEAD (plus the docs commit that carries this file) |
| Phase base | `2e2acfd` |
| Working tree | Clean at the implementation/test HEAD; this file and the Slice 2E.6 report are carried by the following docs-only closeout commit |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI | **all three jobs green** on `2540ca5` (run `30292038500`). The pgTAP suite reports `Files=30, Tests=1277, Result: PASS` |
| Merged / tagged / released | nothing |

**Drift corrected on entry to this session** (docs-only, not a regression): this file named branch HEAD `bfa28a1` and CI run `30227374101`. Both were stale by one docs commit — the true HEAD on entry was `f0fa112`, with a *newer* green run `30227814871`. This is the third consecutive session to find that drift, and the cause is structural: this file is written before the docs commit that contains it. **Verify HEAD from `git rev-parse`, never from this table.**

Slices 2E.1–2E.5 remain accepted.

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover, verified this session with `npx supabase migration list --linked` |
| `202607250055`–`202607270060` | **local only.** The whole chain applies from an empty database in CI; none is applied to the linked project |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged. Slices 2E.1–2E.6 touch no worker code |
| Generated types | hand-written (ADR-041). Slice 2E.6 adds parity for the preview, confirmation and creation RPCs through migration-source, content and executable catalog contracts |

**`202607250056`'s amendment window is still closed by exhaustion** for its *result columns and argument list*. Slice 2E.5 amended its **body** by `create or replace`, which costs nothing — that distinction is now load-bearing and should not be misremembered as "the file is frozen".

**`202607260059` supersedes `202607260058`'s declaration of `apply_task_command` and `undo_apply_task_command_fields`**, and `202607250056`'s of `list_task_command_candidates`. Every test that greps an RPC's text was re-pointed at `…059` in the same commit. **This is now a standing obligation: a `create or replace` in a new migration silently invalidates every text-grep assertion pointed at the old file, in both directions — red for something correctly removed, green for a subject that no longer exists.**

## Slice status

| Slice | Epic | Status |
|---|---|---|
| 2E.1 — Bounded task command contract | 2E-A | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_01_REPORT.md` |
| 2E.2 — Deterministic matching and margins | 2E-B | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_02_REPORT.md` |
| 2E.3 — Disambiguation and read-only preview | 2E-C | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_03_REPORT.md` |
| 2E.4 — Reversible non-destructive updates | 2E-D | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_04_REPORT.md` |
| 2E.5 — Destructive actions and confirmation | 2E-E | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_05_REPORT.md` |
| 2E.6 — No-match activity creation | 2E-F | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_06_REPORT.md` |
| 2E.7 — Conversational and task-surface integration | 2E-G | not started |
| 2E.8 — Convergence and closeout | 2E-H | not started |

## Slice 2E.6 — what shipped

**A validated task-like no-match can now become one confirmed standalone inbox task.** Preview is
read-only; the server issues and consumes a single-use confirmation; creation is owner-scoped,
idempotent and auditable; undo cancels the task and its exact live reminder without allowing later
resurrection.

| Artifact | Responsibility |
|---|---|
| `202607270060` (new) | Canonical creation payload; owned relation resolution; preview, confirmation and creation RPCs; compensating undo; shared creation-family guards; grants; post-deploy assertions |
| `phase_2e_task_command_creation.sql` | `plan(127)` |
| `creation.ts` and tests | Capability-bound one-clarification continuation and terminal outcome contract |
| `creation-migration.test.ts` | Executable parser/AST gates over the shipped helper, final `DO` block and undo handler |
| `local-task-command-creation-race.mjs` | Real two-session same-key PostgREST proof plus evidence self-test |
| CI database job | Runs the race after migrations, pgTAP and database lint |

Created rows have `created_by = 'agent'`, `status = 'inbox'` and null
`source_entry_id`/`source_interpretation_id`/`candidate_index`. The existing task insert trigger remains
the only due-reminder creator. Exact replay returns the original identities, including after undo;
it never recreates or restores the task.

## Slice 2E.5 — what shipped

**All fifteen actions are now enabled on one RPC.** `cancel_task` behind a server-issued single-use confirmation; `restore_task` behind the creation-undo guard.

| Artifact | Responsibility |
|---|---|
| `202607260059` (new) | `public.task_command_confirmations`; `private.task_creation_undone`; `public.issue_task_command_confirmation`; the re-declared `apply_task_command`, `undo_apply_task_command_fields`, `undo_confirm_entry_tasks` and `list_task_command_candidates`; grants; one post-deploy DO block of catalog greps |
| `supabase/tests/phase_2e_task_command_destructive.sql` | `plan(91)` |
| `phase_2e_task_command_apply.sql` | two catalog arrays widened, two destructive assertions rewritten; `plan(132)` unchanged |
| `rpc_version_retirement.sql` | the issuance RPC added to the posture array; `plan(24)` unchanged |
| `errors.ts` / `copy.ts` | 9 → 10 declared tokens; the fourth destructive disclosure |
| `apply.ts` | the `55P03` branch now reads the DETAIL before falling back to staleness |
| `confirmation.ts` (new) | the issuance wrapper, sharing `buildApplyPayload` with the apply |
| `preview.ts` / `taxonomy.ts` | `restorable_after_undo_window`; a false provenance comment corrected |

**Still no UI, route, Server Action, product event or model call.** Nothing calls either RPC; the consumer is Slice 2E.7.

## Decisions accepted in Slice 2E.5 — not re-litigable

- **ADR-047 — the confirmation is a server-minted row addressed by its own id, with no expiry.** The apply RPC's seven arguments are fixed, so the token is never presented; the apply resolves it by `(auth.uid(), btrim(operation_key))` and requires the digest it derives itself. No client role may write the ledger, so "server-issued" and "single-use" are properties of the **grants**. Expiry is refused because 2E-UX-001's outcome list is closed.
- **ADR-048 — one collision, one token, one shared predicate, one lock order.** `2E_CREATION_UNDONE`, read from `private.task_creation_undone` by all three doors. `undo_operations` is locked before `public.tasks` everywhere, because `public.undo_operation` does the same and the reverse is a deadlock. **ADR-048's second half was withdrawn on evidence before acceptance** — see the review section below and the ADR's own withdrawal note.
- **ADR-049 — a declared failure code is retired when nothing can raise it.** `2E_ACTION_NOT_ENABLED` is gone, enforced by a post-deploy grep over every shipped body.
- **The confirmation gate is one guarded UPDATE, after the replay branch, inside the mutating transaction.** A read-then-write pair was written and rejected: two halves can disagree. Placement is load-bearing in both directions — before the replay branch it would refuse a legitimate resubmission; outside the transaction a lost race would cost the user a deliberate act.
- **`restore_task` requires no confirmation.** §11.2 marks it non-destructive with "Confirmation: no"; its deliberateness is `oneStepEligible: false`, which is a match-layer property an RPC cannot observe.
- **The five hand-copied status-action lists are one declared constant.** Slice 2E.4's own comment named the hazard; Slice 2E.5 is what made it live.
- **The candidate listing excludes creation-undone tasks for *every* action**, not only `restore_task` — the correct reading of "treated as deleted".
- **`record_entry_task_candidate_confirmation` is now load-bearing for this slice's reasoning.** It is why a cancelled task keeps its candidate slot and why no guard is needed on that transition; both the migration and the pgTAP suite assert the trigger still exists, because nothing else would notice if it were dropped.

## What the reviews found, and where

**The design round ran before any code and was incomplete** — the synthesiser and three of twenty-five refutations died on a session limit, so it is recorded as incomplete and its three unrefuted findings were evaluated by hand. It still paid for itself twice:

1. **Five lockstep predicates, two failing silently.** Missing the step-21 list sends `cancel_task` into the *relation insert* branch; missing the step-23 list records a `cancelled_at` the row does not hold, which makes the ten-column guard refuse **every** cancel-undo forever.
2. **A second collision nobody had named — and it did not exist.** The round argued that a confirmed candidate writes no resolution-ledger row, so `cancel_task` frees its candidate slot and a re-confirmed duplicate would make the restore a bare `23505`. A whole guard shipped on it. **The shipped-code round disproved it**, four lenses independently: `public.record_entry_task_candidate_confirmation` (`202607220041:299-364`) is an `after insert or update` trigger that writes exactly that row — which is *why* v6 does not — it survives the cancellation, and `2C_TERMINAL_DISPOSITION` reads it, so the duplicate cannot be created. All of it was removed under ADR-049, the doctrine this slice wrote. **Cost: a token, a predicate, two guards, two traps, a pgTAP section, and a "correction" to `taxonomy.ts` that inverted a true comment.**

**The shipped-code round ran complete — five lenses, no agent errors, fifteen findings, none refuted as wrong.** Beyond the withdrawal it fixed an unfalsifiable ordering-A assertion (every instant in one transaction is `transaction_timestamp()`, so the comparison passed either way) and three comments describing code that had been removed. See the slice report §3.3.

**The pre-push audit found a deployment blocker.** Reading the post-deploy block's 24 grep literals back against the bodies they target found one looking for `and confirmation_row.status = 'issued'` while the UPDATE aliases the table as `confirmation`. The migration would have failed to deploy, with a guard refusing the thing it protects. Second consecutive slice in which that audit paid for itself.

**CI found a fixture defect the audit did not.** `tasks_candidate_provenance` (`202607220041:260-272`) refuses an *active* task whose `candidate_index` is not less than `jsonb_array_length(task_candidates)`, and the fixture interpretation used that column's default of `[]`. A `cancelled` row is exempt, which is why only the one live duplicate tripped — and why the exemption could not be leaned on, since `restore_task` takes those rows back out of `cancelled`. **The sixteen assertions that ran before the fixtures all passed**, which is what proved the migration applies and its post-deploy block holds.

## Local gates on HEAD

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **2110 passed / 118 files** ·
focused `src/features/task-commands` **1018 passed / 20 files** · migration parser/AST **17/17** ·
`build` clean · deployed-entrypoint Deno checks clean · Deno tests **46/46** · race evidence
validator self-test clean.

pgTAP cannot run locally — Docker is unavailable, so `supabase db reset`, `supabase test db` and
`supabase db lint --local` never execute on this workstation. Exact-SHA run `30292038500` supplied the
authoritative database evidence: empty-database migration chain, both lint schemas, real two-session
race, `phase_2e_task_command_creation.sql ............. ok`, and
`Files=30, Tests=1277, Result: PASS`. That is exactly `29 + 1` files and `1150 + 127` assertions.

## Open items after accepted Slice 2E.6

1. **No deployment occurred.** The linked project remains at migration `202607250054`, so an
   authenticated online smoke of the new RPCs is blocked on separate deployment authorization.
2. **No rendered production caller exists yet.** Conversational integration, task-scoped undo listing,
   cancelled-task restore affordance and authenticated surface journeys belong to Slice 2E.7.
3. **No dedicated mutation-testing round ran.** The adversarial review, executable parser/AST gates,
   127-assertion pgTAP suite and real two-session race are the acceptance evidence used here.
4. **The earlier Slice 2E.5 design round remained incomplete.** Its limitation is preserved in that
   slice's report; Slice 2E.6's shipped-code review and scoped CI re-reviews completed.
5. Draft PR #18 remains intentionally open and unmerged. Nothing was deployed, tagged or released.

## Next: the continuation point, precisely

**Stop here. Slice 2E.6 is accepted and the user explicitly requested that Slice 2E.7 not start in this
session.** No 2E.7 source, test or design artifact was created.

When separately authorized, the next slice is 2E.7 — Conversational and task-surface integration
(Epic 2E-G). Its starting contract is the accepted 2E.1–2E.6 stack, especially:

- the one production caller must select among update, destructive-confirmation and confirmed-creation
  continuations without widening their closed outcome vocabularies;
- task-scoped undo listing and cancelled-task restore affordances must stay owner-scoped;
- desktop/mobile, pt-BR/en and accessibility evidence belongs to that rendered slice;
- no task row belongs inside an LLM prompt; the existing bounded command contracts remain the boundary.

Useful commands:

```powershell
npx vitest run src/features/task-commands           # focused
npm run lint; npm run typecheck; npm test; npm run build
deno check supabase/functions/process-jobs/index.ts supabase/functions/heartbeat/index.ts
npx supabase migration list --linked                # parity
gh pr checks 18                                     # the database gate
gh run view <id> --log-failed                       # the first failing line, not the summary
```

## Environment constraints that shape the workflow

- **Docker is unavailable.** Every SQL claim is proven only by draft PR #18's `database` job (~4 min/run). Budget for the round trip; never report a local pgTAP run.
- `supabase gen types typescript` cannot run here either (ADR-041).
- Remote smokes and authenticated online journeys stay manual.
- Edit SQL with a text editor, never a script. Where a large body must be re-pasted, **extract it byte-exactly by line range and verify with `diff` before editing** — that is how `202607260059` re-declared four functions totalling ~1900 lines without a transcription error.
- **Subagent work can fail on session limits mid-round.** When it does, say so and carry the round forward as an open item rather than reporting an empty result as a clean one. It happened again this session.
