# Phase 2F — Slice 2F.2 Report: Work-surface mutation convergence

Branch `codex/phase-2f-slice-2`, cut from `main` at `8c59c1d` (the merge of accepted `c7e03b3`). Governed by `docs/PHASE_2F_PRD.md` Revision 4. Implemented 2026-07-29. Execution plan: `docs/reports/PHASE_2F_SLICE_02_PLAN.md`.

**This slice ships no SQL, no migration, no grant change, no new RPC and no change to `list_task_command_candidates`.** It does not touch the manual-creation path. It is a single-concern, mechanically revertible PR.

---

## 1. What changed, in one paragraph

The four Work-surface buttons stopped writing `public.tasks` directly and started routing through the deployed `public.apply_task_command`. A click resolves at click time through the deployed `public.list_task_command_candidates` — the rendered title as `p_title_query`, the mapped taxonomy action, the caller's own `auth.uid()` scope — selects the row whose `task_id` equals the clicked id, projects that row's nineteen-key pre-state and its single database-derived `observed_before`, derives the canonical patch, and hands the result to the shared payload builder. `persistTaskStatus` and `updateTaskStatus` are deleted.

---

## 2. Requirement traceability (14 SURFACE + 5 cross-cutting owned by 2F.2)

| Requirement | Delivered by | Evidence |
|---|---|---|
| 2F-SURFACE-001 | `src/features/task-commands/work-command.ts` | `work-command.test.ts` — every Work verb reaches `apply_task_command`; the call sequence is exactly `[list_task_command_candidates, apply_task_command]`. `git diff main -- supabase/` is empty |
| 2F-SURFACE-002 | `WORK_ACTION_MAPPING` in `taxonomy.ts` | Preserved Gate 3 suite: shipped mapping deep-equals the gate's independently pinned literal; a placement assertion fails if any component, Server Action or the resolution module redeclares it |
| 2F-SURFACE-003 | §3 below | `work-command.test.ts` — the nineteen keys are read out of the migration guard and compared exactly; `p_observed_before` is the row's instant and provably not the injected clock; exactly two RPC calls happen |
| 2F-SURFACE-004 | select-by-id from `rows` | Drifted-title apply carries the current title; a clicked row placed **after** six same-titled rows still resolves; e2e drift journey in both locales |
| 2F-SURFACE-005 | `WorkCommandRefusal` | Absent id and ineligible row both refuse **and make no apply call** — asserted on the call list, not on the outcome alone. No `public.tasks` read exists on this path |
| 2F-SURFACE-006 | `TaskRow`'s key ref | `task-list.test.tsx` — never in markup; on FormData at submit; different per action and per row; reused while idle; rotated after applied **and** after refusal |
| 2F-SURFACE-007 | the RPC | Audit actor `'user'` and the undo row are the RPC's own writes; asserted in the e2e journey against `audit_logs` and `undo_operations`. `task_status_changed` continues (§6) |
| 2F-SURFACE-008 | the RPC's reconciliation | e2e: reminder `scheduled → cancelled` on completion with a **positive pre-assertion**; reminder row byte-identical after `wait_task` **and** after `resume_task` |
| 2F-SURFACE-009 | `availableActions` → `isWorkSurfaceAction` | `task-list.test.tsx` — reopen only on a completed row and never beside the active actions; resume replaces wait on a waiting row; a non-Work action renders nothing |
| 2F-SURFACE-010 | `"use client"` + `useActionState` | `task-list.test.tsx` — Enter and Space submit; focus lands on the named result region after every outcome including refusals; one polite `role="status"` region with `aria-busy`; refresh affordance keyboard-reachable and named in both locales. **The no-JS path is lost and recorded** (§8) |
| 2F-SURFACE-011 | `applyWorkItemAction`'s outcome table | Every branch returns a state; `actions.test.ts` drives applied, no-change, refusal, malformed-request; unknown throws are re-thrown rather than swallowed |
| 2F-SURFACE-012 | deletion + assertions | `updateTaskStatus` gone with its only caller; the Gate 3 assertion is **inverted** to prove the eight-status enum's absence; a new assertion proves no Work verb maps to a destructive or confirmation-requiring action |
| 2F-SURFACE-013 | deletion in this PR | `direct-write-guard.test.ts`'s `tasks` allowlist reduced to one entry; the gate compares by exact equality, so a stale entry fails as hard as a new writer |
| 2F-SURFACE-014 | §9 | Single revert boundary; the reminder-data residual stated |
| 2F-ANALYTICS-001 | `emitStatusChanged` | `actions.test.ts` — surface `work`, subject the task, `{fromStatus, toStatus}` from the click-time pre-state and the canonical patch; not emitted on `no_change` or on a refusal |
| 2F-ANALYTICS-002 | `emitApplied` | `actions.test.ts` — `task_command_applied`, `commandOrigin: 'work'`, `applyRoute: 'direct'`, replay flag round-trips. Value already allowlisted at `202607280061:434`; **no migration** |
| 2F-ANALYTICS-003 (touched, owned by 2F.3) | the existing builders | Asserted here anyway: no payload contains the task title |
| 2F-OWNERSHIP-001 | `loadTaskCandidates` | Three assertions, in order: the owner's own row **resolves** (non-vacuous), a foreign row **raises** rather than being filtered, and a stranger's id refuses. §5 records what is still owed in the deployment session |
| 2F-OPERATIONS-001 | pending | Parity re-check before/after belongs to the deployment session (§5) |
| 2F-OPERATIONS-002 | CI run `30425313872` | All three jobs green on `836ced3`. **Owed again on the exact merge SHA** |

---

## 3. The mechanism, and the one place it departs from a literal reading of §5

PRD §5 names the resolution RPC, the clicked-id selection, the nineteen keys, the single `observed_before` and the shared payload builder. All five are used exactly as written.

**What is not used: `rankTaskCandidates` and `buildTaskCommandPreview`.** Both select the target through `result.candidates`, which is floored at `TASK_MATCH_THRESHOLDS.minCandidateScore = 0.1` and capped at `TASK_MATCH_LIMITS.ranked = 5`. Those bounds are correct for choosing a target out of ambiguous natural language and wrong for a surface that already knows its target:

- a title that drifted beyond token overlap would score below the floor, be dropped from `candidates`, and produce a stale shell — **refusing a click that 2F-SURFACE-004 says must not refuse on drift alone**;
- six tasks sharing a title would exhaust the ranked cap, and the clicked row could fall outside it.

2F-SURFACE-004's own wording is the rule followed instead: *"the row is selected by id wherever it appears in the resolution result."* Selection is from `rows`. This is recorded as a mechanism note rather than a PRD deviation — §5's named components are all used, and the requirement text is followed literally.

Two Phase 2E internals were **lifted, not copied**, so the invariant 2F.6 will audit ("one payload builder, one resolution mechanism") holds by construction:

- `toTaskPreState` moved out of `scoreRow` into an export of `matching.ts`. The RPC's guard is a `<> 19` count **and** a membership test, so two projections of it is how one silently stops matching.
- `buildCanonicalPatch` exported from `preview.ts`. The patch is hashed into the request fingerprint; two builders that agreed today and drifted tomorrow would surface as `2E_IDEMPOTENCY_MISMATCH` on a replay of an identical request — a failure whose cause is invisible from the failure.

`TaskCommandApplyInput.preview` was narrowed to a structural `source` (`{task:{taskId}, action, canonicalPatch, observedBefore, policyVersion}`). `TaskCommandPreview` satisfies it, so the chat path's behaviour is unchanged; the rename touched two production call sites (`actions.ts`, `confirmation.ts`) and `apply.test.ts`.

---

## 4. Executed-gate ledger (2F-PRECOND-003)

| Gate | Session | Result |
|---|---|---|
| `npm run lint` | Local, 2026-07-29 (this session) | 0 errors, 0 warnings |
| `npm run typecheck` | Local, 2026-07-29 | clean |
| `npm test` | Local, 2026-07-29 | **130 files: 129 passed, 1 failed · 2356 tests: 2354 passed, 2 failed** — see §7 |
| `npm run build` | Local, 2026-07-29 | production build green |
| Grammar-trap guard (2F-GUARD-001) | Local, 2026-07-29 | green, unchanged — this slice adds no SQL |
| Architecture gate with the **shrunk** allowlist (2F-GUARD-002/003) | Local, 2026-07-29 | green: `tasks` writers now equal the single `createRecord` insert |
| Preserved Gate 3 static suite + 4 new assertions | Local, 2026-07-29 | 14/14 |
| `work-command.test.ts` | Local, 2026-07-29 | 27/27 |
| `task-list.test.tsx` (jsdom a11y gate) | Local, 2026-07-29 | 23/23 |
| `operations/actions.test.ts` (rewritten) | Local, 2026-07-29 | 16/16 |
| pgTAP + empty-DB migration chain + `db lint` + foundation e2e | CI `database` job, 2026-07-29 | **green** — not executed locally (Docker unavailable on this workstation), and no local pgTAP result is claimed |
| `deno check` + `deno test` | CI `worker` job, 2026-07-29 | **green** — this slice touches no worker file |
| CI, all three jobs, exact SHA (2F-OPERATIONS-002) | CI run **`30425313872`** on `836ced37a3a59c403b6a129c86c369a891515855`, 2026-07-29 | **all three successful.** `application` green confirms §7.1: the two `sql-reachability.test.ts` failures are this workstation's, not the slice's |
| Authenticated journeys desktop+mobile, pt-BR+en | **Pending — deployment session** | `e2e/work-actions.spec.ts` written and credential-gated |
| Two-owner disposable mutation probe | **Pending — deployment session** | 2F-OWNERSHIP-001's remote half |
| Parity re-check before/after (2F-OPERATIONS-001) | **Pending — deployment session** | — |
| Live `commandOrigin: 'work'` observation | **Pending — deployment session** | Payload asserted in CI; the live row is not yet observed |

**No pending gate is cited as evidence anywhere above.**

---

## 5. What is not yet proven, stated plainly

The four remaining pending rows in §4 are all deployment-session gates. (CI executed: run `30425313872`, all three jobs green on `836ced3`; 2F-OPERATIONS-002 is owed once more on the exact merge SHA.) Until the deployment-session gates execute:

- the acceptance items *"all four Work actions successfully routed through `apply_task_command`"*, *"click-time ownership and eligibility proof"*, *"reminder cancellation and non-interference"*, *"audit actor `'user'`"*, *"undo"* and *"`commandOrigin` `'work'` observed in emitted events"* are proven **against injected clients and by construction**, not against the deployed project;
- the desktop and mobile authenticated journeys exist as a written, credential-gated spec that has not run.

The spec skips itself without `ONLINE_SUPABASE_*` credentials rather than failing, following `online-mobile-navigation.spec.ts`. It is deliberately **not** added to CI's Playwright list, because a spec that silently skipped in CI would be a gate counted without execution.

---

## 6. Analytics, without a migration

`202607280061` already constrains `commandOrigin` to `array['chat','work']` (`:395`, `:426`, `:434`, `:444`) and already admits `work` as a `surface`. So:

- **`task_command_applied`** — surface `task_command`, `commandOrigin: 'work'`, `applyRoute: 'direct'`, `outcomeCategory` from the union, `replayed` from the RPC. The surface value is the chat mount's, deliberately: `surface` names the *event family* and `commandOrigin` names the mount, and splitting the family by surface would make 2F.5's reader query two places for one measurement. The five property keys are exactly the allowlisted set.
- **`task_status_changed`** — unchanged: surface `work`, subject the task, `{fromStatus, toStatus}`. Emitted only when the status actually moved, which is what the deleted writer also did.

Both inside `after()`, both swallowing their own rejection, both idempotency-keyed on the operation key.

---

## 7. Repository contradictions and pre-existing failures

1. **The two `sql-reachability.test.ts` failures are pre-existing and environment-dependent**, exactly as recorded in the 2F.1 report §5.2. `git diff main --name-only -- src/features/task-commands/sql-reachability.test.ts supabase/` is **empty** — the test and every file it reads are byte-identical to `main`, and CI on `main` is green. Vitest isolates test files. CI's `app` job is the authoritative verdict.
2. **Two accepted tests were deliberately inverted, and both inversions are the point.**
   - `work-surface-reuse.test.ts`'s "the Work surface's status vocabulary is not a superset the taxonomy can absorb" read the eight-status `statusSchema` out of `operations/actions.ts` and proved the mismatch. 2F.2 deleted that schema, so the gate now proves its **absence** — still against real source, never against a restated claim.
   - `work-view.test.tsx` asserted that a server-rendered `operationKey` hidden input carried a uuid. 2F-SURFACE-006 forbids exactly that; the assertion now proves the input is absent and that the title travels instead.
3. **`docs/STATE.md` carried a statement that Slice 2F.2 falsified** and it has been corrected rather than left: "the command console is the only entry point to every Phase 2E RPC, and `persistTaskStatus`/`applyWorkItemAction` were never migrated onto it." Both halves are now false.
4. **No PRD contradiction was found.**

---

## 8. Deliberate trades, each recorded

- **Progressive enhancement without JavaScript is lost for the four buttons** (2F-SURFACE-010, PRD §4 item 5). Rendering declared outcomes requires `useActionState`. The alternative — keeping the plain `<form action>` and letting refusals be silent — is what this slice exists to end.
- **`TaskList` takes its Server Action as a prop** rather than importing it. `actions.ts` is `"use server"` and reaches `@/lib/supabase/server`, whose `server-only` guard throws the moment a Client Component module imports it; injection also lets the jsdom gate drive every declared outcome without a database. This is the shape `QuickCaptureForm` and `CommandConsole` already use.
- **No undo control was added to the Work surface.** 2F-SURFACE-007 requires the apply to *record* an undo operation, which the RPC does; rendering a control is not among the fourteen SURFACE requirements and is not in PRD §4's complete list of visible behaviour changes, so adding one would be an undisclosed change. The undo operation is recorded and reachable through the deployed contract. Before 2F.2 a Work completion had no undo at all, so this is strictly an improvement, not a gap this slice opened.
- **A click whose row falls outside the `p_limit` window refuses.** PRD §5 anticipates this explicitly ("or outside the result window") and forbids building a completeness claim on `p_limit`. None is built.

---

## 9. Rollback (2F-SURFACE-014)

**One revert boundary:** the merge commit of this PR. `git revert -m 1 <merge>` restores the prior code entirely — no migration, no grant, no deployed contract change, no schema-cache dependency, nothing to coordinate with the database.

**The one residual a code revert does not undo:** reminders cancelled by terminal transitions while the new path was live **stay cancelled**. That is a data effect of a disclosed, owner-approved behaviour change, not a code effect. No compensating action is proposed, and none is authorized by this slice.

---

## 10. What this slice deliberately did not do

- No 2F.3–2F.6 work: no creation-contract migration, no reminder-contract change, no revocation, no test-suite semantic migration, no measurement reader, no closeout documentation reconciliation.
- **The manual creation path is untouched.** `createRecord` is byte-identical and remains the `tasks` allowlist's single entry, which 2F.3 takes.
- No grant was added, widened or narrowed.
- No SQL file was created or edited: `git diff main -- supabase/` is empty.
- `SECURITY.md`, `DATABASE.md` and `PHASE_2_PLAN.md` are untouched — they are 2F-OPERATIONS-006's closeout obligation, not this slice's.
