# Phase 2E — Execution Progress

**Status: IN PROGRESS — Slice 2E.5 ACCEPTED. Slice 2E.6 next.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote, in sync) |
| Branch HEAD | `<HEAD>` |
| Phase base | `2e2acfd` |
| Working tree | clean |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI | **all three jobs green** on `<HEAD>` (run `<RUN>`). The pgTAP suite reports `Files=29, Tests=1155, Result: PASS` |
| Merged / tagged / released | nothing |

**Drift corrected on entry to this session** (docs-only, not a regression): this file named branch HEAD `bfa28a1` and CI run `30227374101`. Both were stale by one docs commit — the true HEAD on entry was `f0fa112`, with a *newer* green run `30227814871`. This is the third consecutive session to find that drift, and the cause is structural: this file is written before the docs commit that contains it. **Verify HEAD from `git rev-parse`, never from this table.**

Slices 2E.1–2E.4 remain accepted.

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover, verified this session with `npx supabase migration list --linked` |
| `202607250055`–`202607260059` | **local only.** The whole chain applies from an empty database in CI; none is applied to the linked project |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged. Slices 2E.1–2E.5 touch no worker code |
| Generated types | hand-written (ADR-041). Parity for `apply_task_command`, `issue_task_command_confirmation` and `list_task_command_candidates` is proven three ways — migration text, content comparison, and `pg_proc` from the real catalog |

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
| 2E.6 — No-match activity creation | 2E-F | not started |
| 2E.7 — Conversational and task-surface integration | 2E-G | not started |
| 2E.8 — Convergence and closeout | 2E-H | not started |

## Slice 2E.5 — what shipped

**All fifteen actions are now enabled on one RPC.** `cancel_task` behind a server-issued single-use confirmation; `restore_task` behind two collision guards.

| Artifact | Responsibility |
|---|---|
| `202607260059` (new, 3372 lines) | `public.task_command_confirmations`; `private.task_creation_undone`; `private.task_candidate_slot_taken`; `public.issue_task_command_confirmation`; the re-declared `apply_task_command`, `undo_apply_task_command_fields`, `undo_confirm_entry_tasks` and `list_task_command_candidates`; grants; one post-deploy DO block with 24 catalog greps |
| `supabase/tests/phase_2e_task_command_destructive.sql` | `plan(96)` |
| `phase_2e_task_command_apply.sql` | two catalog arrays widened, two destructive assertions rewritten; `plan(132)` unchanged |
| `rpc_version_retirement.sql` | the issuance RPC added to the posture array; `plan(24)` unchanged |
| `errors.ts` / `copy.ts` | 9 → 11 declared tokens; the fourth destructive disclosure |
| `apply.ts` | the `55P03` branch now reads the DETAIL before falling back to staleness |
| `confirmation.ts` (new) | the issuance wrapper, sharing `buildApplyPayload` with the apply |
| `preview.ts` / `taxonomy.ts` | `restorable_after_undo_window`; a false provenance comment corrected |

**Still no UI, route, Server Action, product event or model call.** Nothing calls either RPC; the consumer is Slice 2E.7.

## Decisions accepted in Slice 2E.5 — not re-litigable

- **ADR-047 — the confirmation is a server-minted row addressed by its own id, with no expiry.** The apply RPC's seven arguments are fixed, so the token is never presented; the apply resolves it by `(auth.uid(), btrim(operation_key))` and requires the digest it derives itself. No client role may write the ledger, so "server-issued" and "single-use" are properties of the **grants**. Expiry is refused because 2E-UX-001's outcome list is closed.
- **ADR-048 — two collisions, two tokens, two shared predicates, one lock order.** `2E_CREATION_UNDONE` and `2E_CANDIDATE_REMATERIALIZED`, each read from one `private` predicate by every door. `undo_operations` is locked before `public.tasks` everywhere, because `public.undo_operation` does the same and the reverse is a deadlock.
- **ADR-049 — a declared failure code is retired when nothing can raise it.** `2E_ACTION_NOT_ENABLED` is gone, enforced by a post-deploy grep over every shipped body.
- **The confirmation gate is one guarded UPDATE, after the replay branch, inside the mutating transaction.** A read-then-write pair was written and rejected: two halves can disagree. Placement is load-bearing in both directions — before the replay branch it would refuse a legitimate resubmission; outside the transaction a lost race would cost the user a deliberate act.
- **`restore_task` requires no confirmation.** §11.2 marks it non-destructive with "Confirmation: no"; its deliberateness is `oneStepEligible: false`, which is a match-layer property an RPC cannot observe.
- **The five hand-copied status-action lists are one declared constant.** Slice 2E.4's own comment named the hazard; Slice 2E.5 is what made it live.
- **The candidate listing excludes creation-undone tasks for *every* action**, not only `restore_task` — the correct reading of "treated as deleted".
- **A slot-taken task stays listed.** It is blocked, not deleted, and the duplicate is cancellable.

## What the reviews found, and where

**The design round ran before any code and was incomplete** — the synthesiser and three of twenty-five refutations died on a session limit, so it is recorded as incomplete and its three unrefuted findings were evaluated by hand. It still paid for itself twice:

1. **Five lockstep predicates, two failing silently.** Missing the step-21 list sends `cancel_task` into the *relation insert* branch; missing the step-23 list records a `cancelled_at` the row does not hold, which makes the ten-column guard refuse **every** cancel-undo forever.
2. **A second collision nobody had named.** A confirmed candidate writes no resolution-ledger row, so `cancel_task` frees its candidate slot under `202607220040`'s partial indexes and a re-confirmed duplicate makes the restore a bare `23505` — mapped to `undeclared_failure` with `retryable: true`, so the surface would invite an infinite retry and the cancellation the preview called "restorable" would be permanent.

**The pre-push audit found a deployment blocker.** Reading the post-deploy block's 24 grep literals back against the bodies they target found one looking for `and confirmation_row.status = 'issued'` while the UPDATE aliases the table as `confirmation`. The migration would have failed to deploy, with a guard refusing the thing it protects. Second consecutive slice in which that audit paid for itself.

**CI found a fixture defect the audit did not.** `tasks_candidate_provenance` (`202607220041:260-272`) refuses an *active* task whose `candidate_index` is not less than `jsonb_array_length(task_candidates)`, and the fixture interpretation used that column's default of `[]`. A `cancelled` row is exempt, which is why only the one live duplicate tripped — and why the exemption could not be leaned on, since `restore_task` takes those rows back out of `cancelled`. **The sixteen assertions that ran before the fixtures all passed**, which is what proved the migration applies and its post-deploy block holds.

## Local gates on HEAD

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **2041 passed / 115 files** · focused `src/features/task-commands` **949 passed / 17 files** · `build` clean · `deno check` clean.

pgTAP cannot run locally — Docker is unavailable, so `supabase db reset`, `supabase test db` and `supabase db lint --local` never execute on this workstation. It ran **in CI**: `Files=29, Tests=1155, Result: PASS`. That is `1059 + 96` against Slice 2E.4's baseline and `28 + 1` files. **The arithmetic is the evidence, not the pass.**

## Open items owed by Slice 2E.5

1. **The design round was incomplete** (session limit); the shipped-code round is recorded in the slice report.
2. **No dedicated mutation round ran**, for the second slice running.
3. **2E-OPERATIONS-003's focused remote smoke — owed, blocked on deployment.** Epic 2E-E adds to Epic 2E-D's list: a real two-session race on one confirmation, consumption across two PostgREST requests, cross-owner confirmation denial with two real owners, and the `unique_violation` backstop that pgTAP cannot provoke inside one transaction.
4. **Authenticated desktop/mobile Playwright journeys** — blocked on there being no surface (ADR-043).
5. **2E-DESTRUCTIVE-006's rendered affordance is Slice 2E.7's.** The owner-scoped query and its exclusion ship here and are asserted; the rendering of `restore_task` beside each cancelled row is not.
6. **2E-UNDO-005's task-scoped undo listing is not built.** Owed by Slice 2E.7.
7. **`apply.ts`, `confirmation.ts` and `errors.ts` have no production caller.** By design; Slice 2E.7.
8. **The pre-existing flaky test** `src/features/tasks/task-candidate-form.test.tsx` still reds CI intermittently.
9. **Alias-driven relation resolution remains unproven in pgTAP** — unchanged, and this slice does not depend on it.

## Next: the continuation point, precisely

**Slice 2E.5 is accepted. Begin Slice 2E.6 — No-match activity creation (Epic 2E-F).** Read PRD §13.7 (`2E-NOMATCH-001..009`), §12.4, §12.5, §10.3, §19.1 (Epic 2E-F), then `202607260059` — which 2E.6 extends or sits beside, and whose primitives it is required to share.

What 2E.6 inherits:

- **2E-NOMATCH-004 requires a *creation* RPC "in the same versioned family as the mutation RPC, sharing its operation-key, fingerprint, audit and undo-registry primitives"** — and explicitly forbids reusing the entry-scoped candidate materialization path, which cannot create a standalone task. So this is a **new** function, unlike 2E.5's `create or replace`, and it needs its own undo handler and registry row.
- **`created_by = 'agent'` is the distinguishing mark** (2E-NOMATCH-007), and `audit_task_change`'s INSERT branch already derives `'agent'` from it without any change — ADR-046 recorded that deliberately.
- **The candidate-provenance trigger is the trap.** `202607220041:224-272` refuses an active task carrying a `candidate_index` that no interpretation backs. A command-created task has **no** entry and **no** candidate, so it must leave `source_entry_id`, `source_interpretation_id` and `candidate_index` all null — and 2E.5's fixture failure is the evidence of what happens when that is got wrong.
- **The two collision predicates are `private` and shared.** A created task has no creation operation in the `confirm_entry_task*` family, so `task_creation_undone` is false for it — but the undo of a *2E.6 creation* is a third member of the "compensating operation that deletes a task" family, and §13.6's guard reads a hardcoded four-element `action_type` list. **2E.6 must decide whether its own creation action_type joins that list**, and the answer is almost certainly yes: undoing a command-created task and then restoring it would be the same resurrection 2E-DESTRUCTIVE-008 forbids.
- **The confirmation ledger's `action` CHECK is `in ('cancel_task')`.** 2E-NOMATCH-005 requires creation to be "previewed before it happens and confirmed by the user" — if that confirmation is to be the same server-issued kind, the CHECK and the issuance RPC's action list both widen, and `2E-DESTRUCTIVE-002`'s properties come along for free. If it is a lighter confirmation, say why.

**Run the review the way this slice did.** Attack the design *before* writing code — it found the two defects that mattered, and both were invisible from the requirement text alone. Then audit the post-deploy greps by hand before pushing. Then expect CI to find a fixture problem anyway, and read the first failing line rather than the summary: `Failed 80/96` meant "16 ran, 80 never got the chance", and the sixteen that ran had already proven the migration.

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
