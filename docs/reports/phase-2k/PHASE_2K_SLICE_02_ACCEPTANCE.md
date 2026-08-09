# Phase 2K — Slice 2K.2 acceptance

**Confirm, edit before confirming, discard, truthful results, and the memory undo that archives.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101 (2026-08-09), which also signs **OD-2K-1** — the closed, per-action editable set this slice implements.

**Baseline.** `main` = `0865a9a1412dcef3cba90aeee7bb36c6bff16dae` (PR #147, slice 2K.1), **CI green on that exact merge SHA across all three jobs** (`application`, `database and journey`, `edge worker`). Hosted parity unchanged at `202608080087`.

**Migration budget.** **`1 allocated · 0 spent`.** This slice creates none, and the plan's two known pressures — registering a handler in `undo_operation`, and teaching `match_internal_knowledge` the lifecycle window — are both refused rather than spent.

---

## 1. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-ACT-001` | **baseline, re-proved** | Confirm and discard both resolve inside the composer's one `useActionState`; no navigation. The memory card's confirm and the console's controls all post to the same form action |
| `2K-ACT-002` | **built** | `discardTaskCommand` **takes no Supabase client**, loads no context and carries no session forward. `edit-controls.test.ts` asserts that from the handler's own body, so "leaves no trace" is checkable by reading a signature rather than by auditing what a body happened not to call. Memory discard stays local (`setDiscarded`), which is what it was |
| `2K-ACT-003` | **built** | `conversation-cards/editable-parameters.ts` narrows the taxonomy's own `allowedPatchFields`; free-text patches, invented field names and fields the action does not admit are all refused. Asked **server-side** in `editTaskCommand`, from the **re-derived** action, never from the form |
| `2K-ACT-004` | **built** | `withEditedParameter` writes one value into the envelope and `runCommandRound` re-derives. The canonical patch changes, and the canonical patch is a fingerprint input — so a confirmation minted against the pre-edit digest can no longer be consumed |
| `2K-ACT-005` | **baseline** | Unchanged. Slice 2K.0 measured the three fact-based refusals (`55P03`, `2E_CONFIRMATION_REQUIRED`, `2E_IDEMPOTENCY_MISMATCH`). No TTL was created, and `TASK_COMMAND_OUTCOMES` was not widened |
| `2K-ACT-006` | **built** (memory) / **baseline** (tasks) | Tasks keep their twelve declared outcomes. The memory proposal's four statuses now map onto four **distinct** card states through `memoryProposalCardState`, exhaustively |
| `2K-ACT-007` | **baseline** | The 24-hour window and restore-afterwards disclosure are untouched |
| `2K-ACT-008` | **built** | `undoProposedMemory` **delegates to `setMemoryLifecycle`** with the `archive` transition. No new column, no new RPC, no migration, no second write path. Reachable from the conversation that created the memory |
| `2K-ACT-009` | **built** | The copy says archived or withdrawn from use, and `undo.test.ts` asserts **negatively** in both locales that none of it says deleted. The memory card advertises `{ kind: "archival" }` and claims **no** 24-hour window. Undo-of-the-undo **is** offered, because `restore` is the audited, owner-scoped inverse that already ships |
| `2K-CARD-006` | **built** | The proposal card now renders inside the shared grammar, with an honestly asymmetric preview: a create has no pre-state, so there is no before/after table. The "staleness witness" for a create is the duplicate check, which resolves to `no_change` rather than pretending to have created something |

---

## 2. The three decisions inside this slice

**Relation references are not editable, and that is a decision.** `projectRef`, `contextRef` and `personRef` are excluded from the editable set. Editing one means typing a *name*, which needs a name-to-entity resolution whose ambiguous, foreign and non-existent outcomes Phase 2K does not model as card states. OD-2K-1's instruction for exactly this case is to exclude by default and omit rather than widen. The consequence is named rather than hidden: `assign_project`, `assign_context`, `assign_person` and `set_waiting_on` expose **no** editable parameter, and `editable-parameters.test.ts` asserts that directly.

**A duplicate is `no_change`, not `accepted`.** The sentence the owner asked to keep is kept, but **this turn created nothing**. Reporting it as accepted would claim a write that did not happen — and it is also why the undo is withheld for a duplicate: archiving a memory this turn did not create would act on something the owner never asked about.

**The undo of the undo is offered, not declared absent.** `2K-ACT-009` permits it "only if the current domain can prove it safely". `setMemoryLifecycle`'s `restore` clears `valid_until`, writes its own audit row with before and after states, and is owner-scoped by an explicit predicate over forced RLS. The condition is met, so declaring absence would have been the inaccuracy rather than the caution. The pgTAP suite performs the round trip and asserts the memory is unchanged by it.

---

## 3. Why this cost no migration

The archive transition already existed, is already audited, and is already the product's signed answer to "this stopped being true" — `memories` has no delete path by standing product decision, even though `authenticated` holds `delete`. Registering a handler in `undo_operation` **would** have spent the ceiling, and the plan pre-excluded it. Teaching `match_internal_knowledge` the `valid_from`/`valid_until` window would also have spent it; the TypeScript filter in `chat/actions.ts` stays, sharing `isMemoryInForce` with the badge the owner reads, so the page and the retrieval provably cannot disagree.

That last point is what makes the undo **true rather than decorative**: an archived memory stops being retrievable as a source, not merely listed differently.

---

## 4. Gates, as executed

| Gate | Command | Result |
|---|---|---|
| Tests first | new tests run before implementation | **Executed.** Red for the right reasons — `withEditedParameter is not a function`, and two unresolved module imports |
| Focused | `npx vitest run src/features/task-commands src/features/memories src/features/conversation-cards src/features/assistant src/lib/closeout` | **Executed, green** — 90 files, **2173 tests**, 0 failures |
| Lint | `npm run lint` | **Executed, zero errors** |
| Types | `npm run typecheck` | **Executed, zero errors** |
| Full unit | `npm test` | **Executed** — 284 files passed, **4724 tests passed, 0 failing tests**. 3 files fail to *load* on Windows (`hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner`) — the known local baseline, green in CI |
| Task pipeline untouched | `src/features/task-commands` in full | **Executed, green.** The mature pipeline's own suite passes with the two new intents present |
| Build | `npm run build` | **Executed, green** |
| Browser, both viewports | `npx playwright test e2e/accessibility.spec.ts --project=desktop --project=mobile` | **Executed** — 23 passed, 1 skipped. The new `Conversar controls` surface passes axe at both viewports; targets and focus are measured from paint |
| Database | `supabase/tests/phase_2k_memory_undo.sql` | **Written, and executed only in CI.** There is no local Docker on this machine, so pgTAP runs in CI's `database` job. Reported as such rather than as a local pass |
| Whitespace | `git diff --check` | **Executed, clean** |
| Migrations | none created | **`1 allocated · 0 spent`** |
| Real device / assistive technology | not run | **NOT PROVED** |
| Authenticated online journey | written, not executed | **Deferred to 2K.8**, where the online lane runs, exactly as the plan specifies |

---

## 5. Negative controls and non-vacuity

- **The editable set is proved a subset**, per action, against the taxonomy — so it can narrow but never widen. And proved **non-vacuous**: at least five actions really expose a parameter, with three named exactly.
- **Refusals are proved against real inputs**: an invented field name, `__proto__`, a genuine patch field the action does not allow, and every field for an action with no patch surface.
- **The edit's re-validation has a positive control.** `priority: "catastrophic"` is refused **and** `priority: "urgent"` derives cleanly, so the refusal is not a derivation that fails for any input.
- **The pgTAP denial has a positive control.** Owner A archives its **own** memory successfully in the same transaction before owner B's row is shown to be untouchable — otherwise "cannot archive" would be satisfied by a database where nobody can archive anything. Section 0 additionally proves both memories start **in force**, so the archive is a real change rather than a no-op.
- **The choice labels are walked, not listed.** `edit-controls.test.ts` derives every reachable choice value from the taxonomy and asserts a label exists in both locales, so a second list cannot drift from the policy.
- **One editable parameter per action is asserted**, because the console renders a single control and would otherwise silently edit whichever field sorted first.

---

## 6. Security and authority

- **No new write path.** The memory undo delegates to `setMemoryLifecycle`; the task edit delegates to `runCommandRound`. Both keep their existing ownership proof — RLS plus an explicit `user_id` predicate for memories, and the database's own `auth.uid()` checks for task commands.
- **The editable-parameter rule is asked on the server**, from the **re-derived** action rather than from the form. A caller who could name the action could otherwise pair a permissive one with a field the real action refuses.
- **The edit adds no authority.** Every value still passes through `validateTaskCommand`, so per-action patch bounds, the temporal lexicon and closed target values apply to an edited value exactly as to a model-proposed one.
- **`set_status` cannot become a route to `cancel`.** The choices offered come from the policy's own `allowedTargetValues`, which excludes `cancelled`, and the validator refuses it independently.
- **No migration, no RLS policy, no grant, no secret, no external service, no service-role path.**
- **The transition constant cannot drift to a delete.** `MEMORY_UNDO_TRANSITION` is a named constant, `memoryLifecycleSchema` admits only `archive` and `restore`, and a tampered `transition` value falls back to `archive` rather than becoming a third thing.

---

## 7. Limitations, stated rather than rounded up

1. **No screen-reader session.** Never executed for this surface.
2. **pgTAP was not executed locally.** No Docker on this machine; it runs in CI's `database` job, and the PR-head result is the evidence.
3. **The authenticated journey confirming and undoing a memory is written for 2K.8**, not executed here — the online lane needs live credentials and is manual.
4. **The accessibility lane renders a mirror.** Bounded by `accessibility-mirror-guard.test.ts`, which this slice extended with the new controls and their submitted intents.
5. **Hydrated interactivity is not browser-proved.** The controls' behaviour is proved in jsdom and their markup in a browser; the two are not the third thing.
6. **Relation references remain uneditable.** Named as a residual with a destination: whichever later phase models entity-resolution outcomes as card states.

---

## 8. What this slice did not do

No migration, no deployment, no schema change. No delete path for a memory — and none was added, because OD-2K-3 forbids one and the product never had one. No TTL, no widening of `TASK_COMMAND_OUTCOMES`, no continuity payload, no suggestions, no source changes. `match_internal_knowledge` and the retrieval path are untouched. Signup remains closed; the rollout gate is untouched at 25 pass · 3 fail · 2 owner-signature.
