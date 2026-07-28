# Phase 2E — Execution Progress

**Status: COMPLETE AS A BRANCH — all eight slices ACCEPTED, including Slice 2E.8 (Epic 2E-H, convergence and closeout). Nothing merged, deployed, tagged or released.**

**The phase report is `PHASE_2E_FINAL_REPORT.md`, and it supersedes this file for anything about the phase as a whole.** This file remains the session-to-session handoff and is authoritative only for *where the work stands*.

**118 of 122 requirements are delivered; four are not.** `2E-COMMAND-012` is reclassified to Phase 2F by recorded decision (ADR-053, PRD revision 4); `2E-OPERATIONS-003`, `2E-OPERATIONS-004` and `2E-OWNERSHIP-004`'s remote half are blocked on deployment authorization and on nothing else. `2E-MATCH-018` is delivered with a scope note rather than counted against the phase, because its own text is satisfied. Every requirement is individually mapped in `PHASE_2E_TRACEABILITY_MATRIX.md`.

**PR #18 is READY FOR REVIEW.**

This file is the handoff between execution sessions. It is authoritative for *where the work stands*; `docs/PHASE_2E_PRD.md` remains authoritative for *what the work is*.

## Repository state

| Field | Value |
|---|---|
| Branch | `codex/phase-2e-natural-language-task-updates` (tracks its remote, in sync) |
| Branch HEAD | `ffd66ca` implementation/test HEAD (plus the docs commit that carries this file) |
| Phase base | `2e2acfd` |
| Working tree | Clean at the implementation/test HEAD; this file and the Slice 2E.7 report are carried by the following docs-only closeout commit |
| Draft PR | [#18](https://github.com/fabiokyrillos/my-brain/pull/18) — CI evidence only, **must not be merged before Slice 2E.8** |
| CI | **all three jobs green** on `4af285d` (run `30369501161`). The pgTAP suite reports `Files=30, Tests=1277, Result: PASS` — unchanged from Slice 2E.6, which is the correct arithmetic: Slice 2E.7 adds no pgTAP file |
| Merged / tagged / released | nothing |

**The structural drift in this table is now on its fifth consecutive session.** It is written *before* the docs commit that carries it, so its HEAD is always one commit stale by the time anyone reads it. **Verify HEAD from `git rev-parse`, never from this table.** The entry check for Slice 2E.7 found exactly that again — the file named `2540ca5` and run `30292038500` while the true HEAD was `b6ea9dd` with a newer green run `30353196022`.

**A different drift was found and paid off this session, and it was not docs-only in effect.** Commit `291cc75` accepted Slice 2E.6 while touching only this file and that slice's report, so `STATE.md`, `CHANGELOG.md`, `TODO.md` and `DECISIONS.md` were never updated for an accepted slice — a Definition-of-Done §13 gap. Slice 2E.7's closeout pays it: `STATE.md` and `CHANGELOG.md` now carry Slice 2E.6 entries marked as recorded late rather than backdated.

Slices 2E.1–2E.6 remain accepted.

## Deployment state

| Artifact | State |
|---|---|
| Remote migration parity | `202607250054` — unchanged since the pre-2E cutover, verified this session with `npx supabase migration list --linked` |
| `202607250055`–`202607280061` | **local only.** The whole chain applies from an empty database in CI; none is applied to the linked project |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged. Slices 2E.1–2E.7 touch no worker code |
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
| 2E.7 — Conversational and task-surface integration | 2E-G | **ACCEPTED — READY WITH NON-BLOCKING NOTES.** `PHASE_2E_SLICE_07_REPORT.md` |
| 2E.8 — Convergence and closeout | 2E-H | **ACCEPTED.** `PHASE_2E_SLICE_08_REPORT.md`, `PHASE_2E_FINAL_REPORT.md`, `PHASE_2E_TRACEABILITY_MATRIX.md` |

## Slice 2E.8 — what shipped

**No product behaviour and no migration.** Its database footprint is zero, which is why pgTAP is expected to hold at `Files=30, Tests=1277`.

| Artifact | Responsibility |
|---|---|
| `scripts/generate-phase-2e-traceability.mjs` (new) | Fail-closed generator; 135 rows from 122 requirement IDs, 8 epics, 5 gates. Proven by four tamper runs, not asserted |
| `docs/reports/PHASE_2E_TRACEABILITY_MATRIX.md` (new) | Generated. `npm run docs:phase-2e:traceability` |
| `scripts/verify-phase-2e-cleanup.mjs` (new) | 18 owned tables. **Passes against the live linked project** |
| `scripts/remote-phase-2e-smoke.mjs` (new) | Two-owner aggregate smoke, drain-safe (creates no entries). Preflight exits 2 with `BLOCKED ON DEPLOYMENT` |
| `docs/reports/PHASE_2E_FINAL_REPORT.md` (new) | Phase report + deployment, rollback, merge and release checklists |
| `vocabulary.ts` / `policy-lock.test.ts` | The convergence audit's three fixes |
| ADR-053, PRD revision 4 | The `2E-COMMAND-012` reclassification, and the withdrawal of an unkeepable revision-2 promise |

**The convergence audit found a real defect seven slices had missed.** The `policy-lock.test.ts` case named *"pins the status and priority vocabularies to the same version"* digested `TASK_STATUSES`/`TASK_PRIORITIES` — the **closed database literals `vocabulary.ts` neither owns nor can change** — while the 61 bilingual term mappings it does own were digested by nothing. Re-pointing `bloqueada` from `blocked` to `deferred` would move a user's task to a state they never named, suite green. `TASK_VOCABULARY_VERSION` was orphaned and already stale at `.1` while the policy version was `.2`, contradicting its own docstring; `vocabularyCoversEveryLiteral()` was exported and never called. All three fixed; the new digest sorts by code unit, not `localeCompare`, so an ICU update cannot move a pinned gate.

**Running the closeout tooling is what found its own defect.** `verify-phase-2e-cleanup.mjs` detected an absent table by SQLSTATE `42P01`; PostgREST answers from its schema cache and returns `PGRST205` without reaching Postgres, so it died on the first Phase 2E table — the exact failure its branch existed to prevent. A verifier that has never run is a claim, not a gate.

**One obligation could not be met and is recorded as unmet.** PRD revision 2 promised nineteen refuted PRD-round findings would be recorded here. They were never persisted to the repository; revision 4 withdraws the promise rather than fabricating them.

## Slice 2E.7 — what shipped

**The phase has a user-visible surface for the first time.** One command console mounts on Chat (the
list page *and* a conversation, because `sendChatMessage` ends in `redirect()` to the latter) and on
the task surface, behind a single `runTaskCommand` dispatcher. `/app/work/cancelled` is the recovery
route, linked from the Work page.

| Artifact | Responsibility |
|---|---|
| `session.ts` (new) | The envelope: normalized proposal, **pinned** issuing instant, explicit selection, staleness witness, one bounded clarification |
| `console-state.ts` (new) | The state contract and closed control/intent vocabularies — separate because a `"use server"` module may export only async functions |
| `actions.ts` (new) | Eight Server Actions plus the dispatcher; auth, the caller's own timezone, AI-usage ordering, confirmation placement, fault mapping, analytics |
| `analytics.ts` (new) | The band mapper `match-policy.ts` deferred until a caller existed, and four content-free payload builders |
| `undo-listing.ts`, `recovery.ts` (new) | Server-only projections: task-scoped undo (2E-UNDO-005) and the cancelled-task listing |
| `command-console.tsx`, `confirm-dialog.tsx`, `cancelled-tasks-view.tsx` (new) | The surface and the hand-rolled modal |
| `202607280061` (new) | `task_command` surface + four event names in all three allowlists; three new property validators; both private functions re-declared in full |
| `product-event-vocabulary.mjs` (new) | 2E-ANALYTICS-006's reader, mirrored by a Vitest case |
| `e2e/task-command.spec.ts` (new), named in `ci.yml` | Credential-free, so it gates rather than skipping |

**Three decisions are recorded as ADRs and are not re-litigable:** ADR-050 (continuation is
re-derivation from a pinned clock), ADR-051 (the destructive confirmation is issued by the render,
and the dialog is hand-rolled because jsdom 29.1.1 has no `showModal`), ADR-052 (`task_command` is
its own analytics surface, and the smoke reads the vocabulary rather than restating it).

**Two defects were found by this slice's own tests, and one by the build alone.** The dialog focus
trap selected hidden inputs, so the modal opened with focus left on the page behind it; the result
region had no role, so its accessible name was announced only by accident. The build — not lint, not
typecheck — caught the state vocabulary being exported from a `"use server"` module.

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

**Slice 2E.8 tree:** `lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **2256 passed /
124 files** · `build` clean, with `/[locale]/app/work/cancelled` registered ·
deployed-entrypoint Deno checks clean · Deno tests **46/46** · `npx playwright test
e2e/foundation.spec.ts e2e/task-command.spec.ts --project=desktop --project=mobile` **12 passed**.

The Slice 2E.7 baseline was 2254 / 124 files, so Slice 2E.8 adds **2 assertions across 0 new files** —
the vocabulary digest and the call to the guard that was dead. A closeout slice that added a large
number here would be doing something other than closeout.

Also executed against the **live linked project**, the only two Phase 2E gates that can run before
deployment: `npm run test:remote:2e:cleanup` **passes** (zero disposable users, zero orphaned rows
across 17 existing tables, zero remote-smoke storage objects, `task_command_confirmations` correctly
reported absent-because-undeployed), and `npm run test:remote:2e` exits **2** with `BLOCKED ON
DEPLOYMENT`. The traceability generator's fail-closed behaviour was proven by four tamper runs
against a restored PRD copy; all four threw and the PRD was byte-identical afterwards.

**Slice 2E.7 tree, for comparison:** `npm test` 2254 / 124; the Slice 2E.6 baseline was 2110 / 118,
so Slice 2E.7 added **144 assertions across 6 files**.

pgTAP cannot run locally — Docker is unavailable, so `supabase db reset`, `supabase test db` and
`supabase db lint --local` never execute on this workstation. CI supplied the authoritative database
evidence on the exact SHA `4af285d` (run `30369501161`): the empty-database migration chain with
`Applying migration 202607280061_phase_2e_task_command_analytics.sql`, both lint schemas, the real
two-session race, `Files=30, Tests=1277, Result: PASS`, and `12 passed` for the two credential-free
Playwright specs across desktop and mobile. **That count is unchanged from Slice
2E.6, and that is the correct arithmetic** — this slice adds no pgTAP file and alters no RPC that
one asserts. Its database change is the analytics allowlist, guarded by the migration's own
post-deploy `DO` block and by `contracts.test.ts`.

**The first CI run on this slice was red, and the failure was this slice's own new e2e assertion.**
It claimed a locale-less `/app/work/cancelled` would redirect to a locale; it 404s, because
`src/proxy.ts` reads the section from `parts[2]`, so a locale-less `/app/...` path is not an app path
to the proxy at all. Migrations, pgTAP and database lint were green on that same run. The assertion
now pins the invariant that matters — the new route answers identically to an existing one — rather
than a status literal.

**A pre-existing test is flaky under CI load, and it is not this slice's.** The docs-only closeout
commit `7a3e4a5` — which changes two markdown files and no source — failed the `application` job on
`src/features/tasks/task-candidate-form.test.tsx` ("Unable to find an accessible element with the
role button and name *Resolver 2 sugestões*"). That file contains **zero** references to task-command
code, it passes 3/3 locally, and re-running the same job on the same SHA is green on all three jobs.
It is recorded here rather than left for the next session to rediscover: the failure is a timing
sensitivity in a Phase 2C component test, not a Phase 2E regression, and it is a real (if minor)
maintenance item for Slice 2E.8 or later.

## Open items after accepted Slice 2E.8 — the phase's final list

Fuller justification for every one of these is in `PHASE_2E_FINAL_REPORT.md` §7.

1. **Deployment is not authorized, and it gates everything else.** Items 2–5 below are blocked on it and on nothing else.
2. **`2E-OPERATIONS-003`** — focused per-slice remote smokes. None can run.
3. **`2E-OPERATIONS-004`** — the aggregate smoke, written and wired, refusing correctly at preflight.
4. **`2E-OWNERSHIP-004`'s remote half** — the two-owner disposable proof. The database half is proven by pgTAP from an empty database in CI.
5. **Every authenticated online journey for Epic 2E-G.** The credential-free route/auth/locale journeys do run in CI.
6. **`2E-COMMAND-012`** is reclassified to Phase 2F by decision, not blocked (ADR-053, PRD revision 4).
7. **The nineteen refuted PRD-round findings** are permanently unrecoverable; PRD revision 4 withdraws the promise.
8. **`src/features/tasks/task-candidate-form.test.tsx` flakiness** under CI load — a Phase 2C test, never reproduced locally, deliberately not fixed blind.
9. **`PHASE_2E_SLICE_07_DESIGN.md` §6** promises 42 findings the file does not contain.
10. **The `restore_task` >25-same-title cancelled-task edge**, disclosed with `hasMore`.
11. **PR #18 is READY FOR REVIEW** and remains open. Merge, deployment and release are three separate authorizations, none given.

## Open items recorded after Slice 2E.7 (historical — superseded by the list above)

1. **No deployment occurred.** The linked project remains at migration `202607250054`, so every
   Phase 2E RPC — including the three this slice calls — is unreachable online. **Every
   authenticated journey for Epic 2E-G is blocked on that, not on code**: typing a command, resolving
   a disambiguation, confirming a cancellation, creating from a no-match, undoing, and restoring from
   the recovery page. The credential-free route/auth/locale journeys do run in CI.
2. **`2E-COMMAND-012` is not discharged.** Prompt and strategy versions travel on the session and are
   available to the operation, but no Phase 2E RPC has a column for them, so recording them *on the
   operation* needs a schema change this slice has no mandate to make. Slice 2E.8 must either add the
   column or record a reclassification in the PRD.
3. **No focused remote smoke for this slice** (2E-OPERATIONS-003), blocked on the same deployment.
4. **No dedicated mutation-testing round ran.** The evidence used here is the adversarial design
   review, the re-verification of its twelve corrections against the tree, 141 new assertions, the
   architecture boundary gates, and CI's database job.
5. **`PHASE_2E_SLICE_07_DESIGN.md` promises a 42-finding set in its §6 that the file does not
   contain.** Only the twelve critical corrections and the follow-on paragraph survived the budget
   exhaustion that ended that session. Recorded rather than pretended away; the twelve are what this
   implementation was verified against.
6. **The `restore_task` recovery path depends on the task being ranked by its own title.** A user
   with more than 25 cancelled tasks sharing one title could see a stale-shell preview rather than a
   restore. Disclosed; `hasMore` already tells the user the list is truncated.
7. Draft PR #18 remains intentionally open and unmerged. Nothing was deployed, tagged or released.

## Next: there is no next slice

Phase 2E is complete as a branch. **The next action is a human authorization decision, not engineering** — merge (checklist in `PHASE_2E_FINAL_REPORT.md` §12), then deployment (§10), then release (§11 is the rollback plan, §13 the release steps). Phase 2F is out of scope and must not be started against this branch.

<details>
<summary>Historical: the continuation point Slice 2E.7 recorded for Slice 2E.8, now discharged</summary>

The next slice is **2E.8 — Convergence and closeout (Epic 2E-H)**. Its inputs:

- **The convergence audit finally has a surface to audit.** One taxonomy, one matching policy, one
  preview contract, one mutation contract, one error vocabulary, one undo registry and one analytics
  allowlist now each have exactly one consumer; until this slice they had none.
- **The traceability generator, the cleanup verifier and the aggregate remote smoke do not exist.**
  2E-OPERATIONS-004 additionally requires the aggregate smoke to be deterministic and to not compete
  with the shared queue drain.
- **`2E-MATCH-018`'s measured baseline** is computed by `match-baseline.test.ts` over the committed
  fixture corpus and needs transcribing into the phase report as the bar any future semantic signal
  must beat.
- **`2E-COMMAND-012`** needs the decision in item 2 above.
- **Deployment authorization gates every item in §Open items.** Deployment order for Slice 2E.7 is
  migrations only — it touches no worker code.

</details>

Useful commands:

```powershell
npx vitest run src/features/task-commands           # focused
npm run lint; npm run typecheck; npm test; npm run build
deno check supabase/functions/process-jobs/index.ts supabase/functions/heartbeat/index.ts
npx supabase migration list --linked                # parity
gh pr checks 18                                     # the database gate
gh run view <id> --log-failed                       # the first failing line, not the summary
npm run docs:phase-2e:traceability                  # must produce no diff before merge
npm run test:remote:2e:cleanup                      # runs today
npm run test:remote:2e                              # exits 2 until the chain is deployed
```

## Environment constraints that shape the workflow

- **Docker is unavailable.** Every SQL claim is proven only by draft PR #18's `database` job (~4 min/run). Budget for the round trip; never report a local pgTAP run.
- `supabase gen types typescript` cannot run here either (ADR-041).
- Remote smokes and authenticated online journeys stay manual.
- Edit SQL with a text editor, never a script. Where a large body must be re-pasted, **extract it byte-exactly by line range and verify with `diff` before editing** — that is how `202607260059` re-declared four functions totalling ~1900 lines without a transcription error.
- **Subagent work can fail on session limits mid-round.** When it does, say so and carry the round forward as an open item rather than reporting an empty result as a clean one. It happened again this session.
