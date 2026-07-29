# Phase 2F — Slice 2F.2 execution plan: Work-surface mutation convergence

Branch `codex/phase-2f-slice-2`, cut from `main` at `8c59c1d` (the 2F.1 merge of accepted `c7e03b3`).
Normative: `docs/PHASE_2F_PRD.md` Revision 4 · the accepted 2F.1 artifacts and guards · `docs/reports/PHASE_2F_SLICE_01_REPORT.md`.

**Scope lock.** Code only. No SQL, no migration, no grant change, no new RPC, no change to
`list_task_command_candidates`, no touch of the manual creation path (`createRecord`'s task
insert stays exactly as it is and remains the `tasks` allowlist's one surviving entry), no
2F.3–2F.6 work.

---

## 1. Files expected to change

### New

| File | Why |
|---|---|
| `src/features/task-commands/work-command.ts` | The click-time resolution mechanism: map → validate → list → select-by-id → project pre-state → apply. The only new production module. |
| `src/features/task-commands/work-command.test.ts` | Behavioural coverage of the resolution mechanism against injected clients. |
| `src/features/operations/work-actions-copy.ts` | Typed feature copy (the `daily-cycle/copy.ts` shape, ADR-036) for the surface-specific strings: button labels, refresh affordance, live-region phrasing. |
| `src/features/operations/task-list.test.tsx` | The jsdom gate: keyboard, focus, live region, eligibility→rendering derivation, key lifecycle. |

### Modified

| File | Change |
|---|---|
| `src/features/operations/actions.ts` | Delete `persistTaskStatus`, delete `updateTaskStatus`, delete `statusSchema`, delete `statusByWorkItemAction`. Rewrite `applyWorkItemAction` as a `useActionState` Server Action over `resolveAndApplyWorkCommand`. `createRecord` untouched. |
| `src/features/operations/task-list.tsx` | Server → Client Component; `useActionState`; per-(row, action) key ref; submit-time `formData.set`; rendered outcome/refusal state; live region; focus preservation. |
| `src/features/operations/actions.test.ts` | Drop the `updateTaskStatus` import and its case; re-point the `applyWorkItemAction` cases at the new contract. |
| `src/features/task-commands/taxonomy.ts` | Add `WORK_SURFACE_ACTIONS` + `WORK_ACTION_MAPPING` as pinned data (2F-SURFACE-002). Pure data module, no logic added. |
| `src/features/task-commands/matching.ts` | Export `toTaskPreState(row)` — the nineteen-key projection currently inlined in `scoreRow`, lifted so there is exactly one projection. Behaviour-identical. |
| `src/features/task-commands/preview.ts` | Export `buildCanonicalPatch` — so there is exactly one canonical-patch builder. Behaviour-identical. |
| `src/features/task-commands/apply.ts` | Narrow `TaskCommandApplyInput.preview` to a structural `TaskCommandApplySource` (the five fields `buildApplyPayload` actually reads). `TaskCommandPreview` satisfies it, so the chat path is byte-identical in behaviour. |
| `src/features/task-commands/work-surface-reuse.test.ts` | **Add** a describe block asserting the shipped `WORK_ACTION_MAPPING` deep-equals the gate's own pinned literal. The gate's literal is not replaced by an import — it stays the independent expectation (2F-SURFACE-002). |
| `src/lib/supabase/direct-write-guard.test.ts` | Remove the `persistTaskStatus` update entry from `TASKS_ALLOWLIST`. The gate then fails if any tasks UPDATE survives. |
| `e2e/work-actions.spec.ts` (new) | Authenticated desktop+mobile journeys, both locales. |
| `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/reports/PHASE_2F_SLICE_02_REPORT.md` | Definition of Done. `DECISIONS.md` only if an architectural decision arises; none is anticipated (the PRD already carries ADR-054…057). |

---

## 2. Existing functions and payload builders reused (nothing re-implemented)

| Reused | From | Role on the Work path |
|---|---|---|
| `validateTaskCommand(input, temporalContext)` | `schema.ts` | The Work surface cannot construct a command the chat path could not. Produces `ValidatedTaskCommand` with `schemaVersion`/`policyVersion`. |
| `loadTaskCandidates({client, command, ownerId, now})` | `candidates.ts` | The single click-time read. Sends `p_eligible_statuses` from the taxonomy, `p_title_query` from the rendered title, `p_observed_before`. Raises on cross-owner rows. |
| `eligibleStatusesFor(action)` / `isEligibleStatus(action, status)` | `matching.ts` / `taxonomy.ts` | Eligibility, both for the query argument and for the render-time button gate. |
| `toTaskPreState(row)` | `matching.ts` (lifted) | The nineteen-key projection. |
| `buildCanonicalPatch({command, pre, resolvedId: null})` | `preview.ts` (exported) | The canonical patch. `resolvedId` is null because none of the four actions writes a relation. |
| `buildApplyPayload({source, preState, operationKey})` | `apply.ts` | **The shared payload builder.** Seven declared arguments, operation-key normalization. |
| `applyTaskCommand(client, input)` | `apply.ts` | The RPC call, result validation, error→failure mapping. |
| `mapTaskCommandApplyError` / `TASK_COMMAND_FAILURE_POLICY` / `getTaskCommandCopy` | `apply.ts` / `errors.ts` / `copy.ts` | Declared failures with their retry-ability and localized copy. |
| `buildTaskCommandAppliedProperties({origin:'work', …})` | `analytics.ts` | 2F-ANALYTICS-002. |
| `recordProductEvent` + `createProductEventIdempotencyKey` inside `after()` | `product-analytics/server` | 2F-ANALYTICS-001 and -002, best-effort, never failing the user's action. |
| `requireUser(locale)` | `lib/auth/require-user` | Authentication. |

**Not reused, deliberately:** `rankTaskCandidates` and `buildTaskCommandPreview`.
Both select through `result.candidates`, which is floored at `minCandidateScore = 0.1` and
capped at `TASK_MATCH_LIMITS.ranked = 5`. Routing a click through them would make a legitimate
click refuse whenever the clicked row scored below the floor (the exact title-drift case
2F-SURFACE-004 says must **not** refuse) or fell outside the top five (six same-titled tasks).
The ranker exists to choose a target from ambiguous natural language; the Work surface already
knows its target. 2F-SURFACE-004's own words are the rule followed: *"the row is selected by id
wherever it appears in the resolution result."* Selection is therefore from `rows` — the
complete resolution result — not from the ranked subset. This is recorded in the slice report as
a mechanism note, not a PRD deviation: PRD §5 names `list_task_command_candidates` and the
shared payload builder, and both are used.

---

## 3. Click-time resolution flow

```
click (taskId, action, renderedTitle, locale)
  └─ requireUser(locale)                              → supabase, user.id
  └─ profiles.timezone                                → timeZone (the read work-projection already makes)
  └─ WORK_ACTION_MAPPING[action]                      → { taxonomy, patch }
  └─ validateTaskCommand({ action: taxonomy,
        targetHints: { titleWords: titleWords(renderedTitle) },
        patch, operationKey }, { now, timeZone })     → ValidatedTaskCommand
  └─ loadTaskCandidates({ client, command,
        ownerId: user.id, now })                      → rows   ← the ONE database read of pre-state
  └─ rows.find(r => r.taskId === clickedTaskId)
        ├─ undefined                                  → refusal `unresolvable` + refresh affordance
        └─ row
             ├─ !isEligibleStatus(taxonomy, row.status) → refusal `ineligible` (defence in depth;
             │                                            p_eligible_statuses already filters)
             ├─ toTaskPreState(row)                   → the nineteen keys
             ├─ row.observedBefore                    → the ONE database-derived instant
             └─ buildCanonicalPatch({command, pre, resolvedId:null})
  └─ buildApplyPayload({ source:{ taskId, action, canonicalPatch,
        observedBefore, policyVersion }, preState, operationKey })
  └─ applyTaskCommand(client, …)                      → applied | no_change | failed
```

`titleWords(renderedTitle)`: split on whitespace, drop empties, cap at `MAX_TITLE_WORDS = 12`,
each word clamped to `MAX_HINT_LENGTH = 160` — the bounds `targetHintsSchema` already enforces.
No fallback read of `public.tasks` exists anywhere on this path (2F-SURFACE-005).

---

## 4. How the nineteen keys and the one `observed_before` are obtained

Both come from **one row of one call** to `list_task_command_candidates`.

- The nineteen keys are `toTaskPreState(row)` — `title, description, status, dueAt, plannedAt,
  manualPriority, completedAt, cancelledAt, intentionalNoDue, noDueReason, createdAt, updatedAt,
  projectIds, projectNames, contextIds, contextNames, personIds, personNames, personRoles`.
  The RPC's guard is a `<> 19` count **and** an `any(array[…])` membership test, so a missing key
  refuses as hard as an unknown one; the projection is exact by construction, and
  `work-surface-reuse.test.ts` already reads that guard out of the migration text.
- `observed_before` is `row.observed_before`, a query-scalar the `refs` CTE resolves once and
  cross-joins onto every row — a single instant the database itself declared, not a client clock.
- The Work projection is **never** consulted for pre-state. It supplies only the clicked id, the
  rendered title (as a *query hint*) and the action. The ten-key shortfall and the
  multi-round-trip problem that Gate 3 identified are therefore both unreachable
  (2F-SURFACE-003).

---

## 5. Pinned mapping (2F-SURFACE-002)

Declared once, in `taxonomy.ts`, as data:

| Work action | Taxonomy action | Patch sent to `validateTaskCommand` | Canonical patch the builder derives |
|---|---|---|---|
| `complete_task` | `complete_task` | `{}` | `{ status: "completed" }` (from `policy.targetStatus`) |
| `wait_task` | `set_status` | `{ status: "waiting" }` | `{ status: "waiting" }` |
| `resume_task` | `set_status` | `{ status: "todo" }` | `{ status: "todo" }` |
| `reopen_task` | `reopen_task` | `{}` | `{ status: "todo" }` (from `policy.targetStatus`) |

`resume_task` and `reopen_task` stay distinct taxonomy actions despite both landing on `todo`:
`reopen_task` is eligible only from `completed`, `set_status` never from `completed`. Collapsing
them would make one refuse on every row it is offered on. Never inlined in a component or a
Server Action; covered by the preserved static test.

---

## 6. Operation-key lifecycle (2F-SURFACE-006)

Follows `quick-capture-form.tsx:33-44` exactly, and is stricter in one respect.

- **Minted once per mount** — inside a `useRef` with a lazy null-guard, never in the render body.
  Every re-render (`useActionState` pending→settled, StrictMode's development double-render)
  would otherwise re-mint.
- **Scoped per (row, action)** — the key store is a `Map<`\``${taskId}:${action}`\``, string>` held
  in one ref for the whole list. A single per-row key shared by two actions would submit one key
  under two request fingerprints and earn `2E_IDEMPOTENCY_MISMATCH` for a legitimate action.
- **Stored in a ref**, not in state — minting must not schedule a render.
- **Injected at submit time** via `formData.set("operationKey", …)` inside the `useActionState`
  wrapper. **Never rendered into markup**: a client-minted hidden input would hydration-mismatch
  against the SSR value. The current `randomUUID()` hidden input at `task-list.tsx:106` is deleted.
- **Rotated after every terminal outcome** — `applied`, `no_change`, and every refusal/failure.
  Safe because a refused apply raises inside `apply_task_command`, aborting the transaction and
  rolling back the operation-key reservation, so a key is never burned by a refusal; reuse after
  refusal would also have been safe. Rotating unconditionally is the simpler invariant.
- **Not rotated while pending**, so a double-submit on one key replays rather than duplicating.

---

## 7. Localized refusal and refresh behaviour

Every outcome resolves to a rendered state; nothing throws out of the Server Action
(2F-SURFACE-011). The Server Action catches `TaskCommandApplyError`, `TaskCandidateQueryError`
and Zod failures the way `guard()` does in `actions.ts`, and re-throws anything unknown.

| State | Source | Copy | Retryable | Refresh affordance |
|---|---|---|---|---|
| `applied` | RPC | `copy.outcomes.applied` + **the current title from resolution** | — | — |
| `no_change` | RPC | `copy.outcomes.no_change` + current title | — | — |
| `unresolvable` | clicked id absent from resolution | new Work copy: "this task is no longer here / refresh" | yes | **yes** |
| `ineligible` | status no longer admits the action | same family, action-specific sentence | yes | **yes** |
| declared failure | `TASK_COMMAND_FAILURE_POLICY` | `copy.failures[detail]` | per policy | on staleness failures |
| unexpected | caught precondition fault | `copy.console.unexpected` | yes | yes |

The refresh affordance is a real `<button>` inside the row that calls `router.refresh()` — not a
link, not an icon-only control — labelled from the Work copy module in both locales.
`revalidatePath` for `/pt-BR/app/work`, `/en/app/work` and the four sibling routes continues to
run server-side on a successful apply, exactly as `persistTaskStatus` did.

---

## 8. Accessibility coverage (2F-SURFACE-010)

All assertable in jsdom, which is the ADR-051 constraint.

- **Keyboard** — the four controls stay `<button type="submit">` inside a `<form action={…}>`;
  no `onClick`-only handler, no `div[role=button]`. Tested by `userEvent.tab()` + `keyboard('{Enter}')`
  and by `{ }` (Space) on each of the four.
- **Focus preservation** — the submitting button's row keeps focus. On outcome, focus moves to
  the row's result region (`role="region"`, `tabIndex={-1}`, accessibly named), following
  `command-console.tsx:192-198`. Asserted: `document.activeElement` is never `document.body`
  after an outcome.
- **Live region** — one polite `role="status"` `aria-live="polite"` `aria-atomic="true"`
  `aria-busy={pending}` region per list, announcing the pending phrase while in flight and the
  outcome/refusal announcement when settled. Mirrors `command-console.tsx:216-224`.
- **Refresh affordance** — keyboard-reachable and accessibly named in both locales; asserted via
  `getByRole("button", { name })`.

---

## 9. Reminder behaviour (2F-SURFACE-008)

No reminder code is written in this slice. `apply_task_command` reconciles reminders itself and
reports `reminders_cancelled`; the Work path only observes it.

- **Terminal transition** — `complete_task` cancels the task's scheduled reminders. Proven in the
  two-owner probe by asserting a scheduled reminder exists before the apply (a non-vacuous
  positive) and is `cancelled` after, and by `applied.remindersCancelled >= 1`.
- **Non-interference** — `wait_task` and `resume_task` leave every reminder untouched. Proven in
  both directions in the same probe: reminder rows byte-identical before/after, and
  `applied.remindersCancelled === 0`.

This is the one **behaviour change** the slice ships, and it is disclosed as such (PRD §4 item 3).

---

## 10. Removals

1. `persistTaskStatus` — deleted. With it goes the `.from("tasks").select("status")` pre-read and
   the `.from("tasks").update({…})` write.
2. `updateTaskStatus` — deleted. Gate 2 showed it only delegates to `persistTaskStatus`; its only
   caller is `actions.test.ts:75`, which is removed in the same commit.
3. `statusSchema` (the eight-status enum reaching `cancelled`) and `statusByWorkItemAction` —
   deleted with them.
4. **Every remaining application direct UPDATE against `public.tasks`** — after (1), the
   architecture gate's `TASKS_ALLOWLIST` is reduced to the single `createRecord` insert
   (2F.3's target). The gate proves the reduction mechanically: it fails if a tasks UPDATE
   survives *and* fails if an allowlist entry names a writer that no longer exists.
5. A new assertion pins 2F-SURFACE-012's second clause: no exported Server Action can reach
   `cancelled` or any destructive transition outside the confirmed destructive contract —
   asserted by test over real source, not by review.

---

## 11. Observing `commandOrigin = 'work'` without an analytics migration

`202607280061:395,426,434,444` already constrains the property to `array['chat','work']`, and
`'work'` is already an allowed `surface` value. Nothing is widened.

- `task_command_applied` is emitted with `surface: "task_command"` (the event family, matching the
  chat path) and `commandOrigin: 'work'` (the property that names the mount) — built by the
  existing `buildTaskCommandAppliedProperties({ origin: 'work', outcome, route: 'direct',
  replayed })`, whose five keys are exactly the allowlisted set.
- `task_status_changed` continues with `surface: "work"` and its current `{fromStatus, toStatus}`
  shape (2F-ANALYTICS-001), emitted only when the status actually moved — `fromStatus` from the
  resolved pre-state, `toStatus` from the canonical patch.
- Both inside `after()`, both `.catch(() => {})`, both idempotency-keyed on the operation key.
- **Observed** at two levels: unit assertions on the emitted payloads (CI, every run), and a live
  owner-scoped `product_events` read in the deployment session confirming a real row carries
  `commandOrigin = 'work'`.
- No task or reminder titles and no user text in any payload (2F-ANALYTICS-003 holds by
  construction; the builders are content-free).

---

## 12. Revert boundary and the data residual (2F-SURFACE-014)

**One** squash-free merge commit for one concern. `git revert -m 1 <merge>` restores the prior
code entirely: no migration, no grant, no deployed contract change, no schema-cache dependency.

**The one residual a code revert does not undo:** reminders cancelled by terminal transitions
while the new path was live **stay cancelled**. That is a data effect of a disclosed behaviour
change, not a code effect. No compensating action is proposed and none is authorized here.

---

## 13. Gates that must execute

| Gate | Where | Requirement |
|---|---|---|
| `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | Local + CI `app` | 2F-OPERATIONS-002 |
| `deno check` + `deno test` (diff-free) | CI `worker` | 2F-OPERATIONS-002 |
| Empty-DB migration chain + full pgTAP + `db lint` | CI `database` | 2F-OPERATIONS-002 |
| Grammar-trap guard (`sql-grammar-guard.test.ts`) | CI | 2F-GUARD-001 — no new SQL, so it must stay green unchanged |
| Architecture gate (`direct-write-guard.test.ts`) with the **shrunk** `tasks` allowlist | CI | 2F-GUARD-002/003 — the mechanical proof of removal |
| Preserved Gate 3 static suite (`work-surface-reuse.test.ts`) incl. the new mapping assertion | CI | 2F-PRECOND-001, 2F-SURFACE-002 |
| jsdom component gate (`task-list.test.tsx`) | CI | 2F-SURFACE-009/010 |
| Authenticated journeys desktop + mobile, pt-BR + en | Deployment session | PRD §10 |
| Two-owner disposable mutation probe (ownership, eligibility, replay, drift, refusal, undo, audit actor, reminders) | Deployment session | 2F-OWNERSHIP-001 |
| Remote migration parity re-check **before and after**, recorded in `STATE.md` | Deployment session | 2F-OPERATIONS-001 |
| Live `commandOrigin = 'work'` observation | Deployment session | 2F-ANALYTICS-002 |

Per 2F-PRECOND-003, the slice report names the session each gate executed in, and no unexecuted
gate is cited as evidence.

---

## 14. Requirement map

| Requirement | Delivered by |
|---|---|
| 2F-SURFACE-001 | §3 flow; no RPC/migration/`list_task_command_candidates` change |
| 2F-SURFACE-002 | `taxonomy.ts` `WORK_ACTION_MAPPING` + the static-test assertion |
| 2F-SURFACE-003 | §4 — one row, one read, one instant; projection never consulted for pre-state |
| 2F-SURFACE-004 | select-by-id from `rows`; outcome renders `preState.title` |
| 2F-SURFACE-005 | absence → localized refresh refusal; no `public.tasks` fallback read |
| 2F-SURFACE-006 | §6 key lifecycle |
| 2F-SURFACE-007 | RPC records actor `'user'` + undo; `task_status_changed` continues |
| 2F-SURFACE-008 | §9 both directions |
| 2F-SURFACE-009 | eligibility-derived rendering, tested |
| 2F-SURFACE-010 | Client Component + §8; no-JS path recorded as lost |
| 2F-SURFACE-011 | §7 table; nothing throws out |
| 2F-SURFACE-012 | §10 items 2, 3, 5 |
| 2F-SURFACE-013 | §10 item 1, same PR as the green routing |
| 2F-SURFACE-014 | §12 |
| 2F-ANALYTICS-001 | §11 `task_status_changed` |
| 2F-ANALYTICS-002 | §11 `commandOrigin: 'work'` |
| 2F-OWNERSHIP-001 | two-owner probe, positive-count-before-absence |
| 2F-OPERATIONS-001 | parity re-check before/after in `STATE.md` |
| 2F-OPERATIONS-002 | all three CI jobs on the exact merge SHA |
