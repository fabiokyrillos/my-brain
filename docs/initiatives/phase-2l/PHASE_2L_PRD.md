# Phase 2L — Work and execution · PRD

**Status:** planning only. Authorized for planning by ADR-102. **Implementation is not
authorized.** This document declares requirements; it does not permit a line of
product code, a migration, a deployment, or the start of any successor phase.

**Governing product document:** `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`
(Etapa 4, slices 4.1–4.3 only).
**Governing phase design:** `docs/initiatives/product-ux/PHASE_2K_2O_ROADMAP_DESIGN.md` §4.
**Evidence this PRD is written against:** `docs/reports/phase-2l/PHASE_2L_CURRENT_EXPERIENCE_AUDIT.md`
and `docs/reports/phase-2l/PHASE_2L_UX_GAPS_AND_OPPORTUNITIES.md`.
**Companion plan:** `PHASE_2L_IMPLEMENTATION_PLAN.md`.

**Baseline.** `main` at `044f541`, 89 migrations, hosted parity `202608090089`,
signup closed, rollout gate 25 pass · 3 fail · 2 owner-signature. Phase 2K concluded
2026-08-09; 79 declared, 79 classified, 67 built · 9 baseline · 3 partial.

---

## 1. Objective and user outcome

**A user can organise and operate their tasks quickly — especially on a phone —
without being surprised by what happened, and without the product hiding a consequence
to look fast.**

Concretely, at close a user can: change a task's title, dates, priority, status and
relations *without leaving the list*; select several tasks and apply one change to all
of them, seeing exactly which ones applied and which did not and why; find work through
named views that mean something; return from a task to the exact place they left; undo
what they just did inside the window the domain actually offers; and do all of it with
a thumb, with a keyboard, and with content that respects the same sensitivity promise
every other surface makes.

### 1.1 The five audit findings this PRD is written against

1. **The domain is strong and the surface is thin.** Fifteen policied verbs, a
   twelve-column staleness gate, a fingerprinted confirmation and an audited 24-hour
   undo all ship. The Work list exposes four buttons and a link.
2. **The undo ships and is unreachable.** The only rendered Undo control in the
   product is in the command console.
3. **The product's own Back control discards the user's view and page.**
4. **Work is the last ungoverned content surface for sensitivity — and `tasks` has no
   classification column**, so this is an owner decision, not a task.
5. **Work is absent from the accessibility lane** while Conversar has ten entries in
   it; and any *reported* new Work view costs a migration, because `workView` is an
   enum inside `private.validate_product_event_properties`.

### 1.2 What this phase is deliberately not

Not a redesign of the task domain. **No new verb, no new status, no new terminal
state, no delete, no recurrence, no set-valued RPC, no second write path.** Every
mutation Phase 2L surfaces is a mutation `public.apply_task_command` already performs
today under an authority that is already tested, audited and reversible.

---

## 2. Signed and inherited decisions

These are already binding when Phase 2L starts. They are restated because several
constrain requirements below.

| Decision | Source | Consequence for 2L |
|---|---|---|
| Task mutations go through `public.apply_task_command`, one task per call | Phase 2E; `202607260058`/`59`/`60` | Bulk is iteration. A set-valued RPC would be a migration and a second copy of eligibility, fingerprint, audit and undo. |
| A function's argument list cannot be extended with `create or replace` | ADR-057 | `apply_task_command` cannot grow a batch parameter. |
| Confirmations have no TTL; staleness is decided by facts, not a clock | ADR-047, re-measured by 2K.0 | A bulk confirmation cannot be a timer. Each destructive item needs its own server-issued confirmation. |
| `cancel_task` is the only destructive verb: `requiresConfirmation`, not one-step | `taxonomy.ts:341-348` | Bulk cancel, if offered at all, is per-item confirmed. |
| Undo window is 24 hours, declared by `undo_operations.expires_at` | `202607160003:153`, mirrored at `taxonomy.ts:149` | Any undo affordance states the window and disappears when the row is spent or expired. |
| A foreign task 404s rather than 403s | `work/[taskId]/page.tsx:46-48` | Selection and bulk must produce no differentiable existence signal. |
| The clicked id is authoritative; the rendered title is a hint | `2F-SURFACE-004` | Selection carries ids; a drifted title never gates. |
| No Work verb may reach `cancelled` | `2F-SURFACE-012`, `set_status.allowedTargetValues` | A bulk status change cannot become an unconfirmed cancel route. |
| Sensitivity is one central contract with per-surface presentation | ADR-095 / OD-2J-1 | Work joins it or is recorded as an evidenced negative. It may not invent its own rule. |
| `search` stays out of `GOVERNED_SURFACES` | ADR-093 | Nothing here re-opens it. |
| `product_events.event_name` and its property enums are database constraints | `202607170024`, `202608080087`, `202608090089` | New event names and a fourth `workView` value each cost a migration. |
| No service-role client on any product path | ADR-075, `operator-surface-boundary.test.ts` | Unchanged. |
| Public signup remains governed by its rollout gates | `signup-rollout-gate.test.ts` | Phase 2L is not progress toward it. |

---

## 3. Scope

### 3.1 In scope

- Quick edit of a task's supported fields from the list, and a responsive task detail
  surface — side panel on wide screens, full screen on narrow.
- An undo affordance on the surfaces where the operations are performed.
- Explicit multi-selection, a preview of what a bulk operation would do, confirmation
  where the operation requires it, execution that continues past a per-item refusal,
  and a truthful per-item result.
- A canonical Work view taxonomy, with URL-expressible filtering, ordering and
  grouping within a view.
- Return-state continuity between the list and the detail.
- Mobile interaction: thumb reach, compact rows, stable selection, no hover
  dependency, and any gesture strictly as an accelerator for a visible control.
- A sensitivity posture for Work — chosen by the owner, implemented or recorded as an
  evidenced negative.
- Work's entry into the automated accessibility lane, executed per slice.
- Content-free telemetry for the Work surface, with a consumer.

### 3.2 Out of scope, with reasons

| Excluded | Reason |
|---|---|
| Kanban board | Drag is the least accessible primary verb in the product and needs a user-ordering model `dynamic_priority` does not provide. A phase, not a slice. |
| Timeline view | The parent PRD hedges it; Phase 2M owns calendar. Two date surfaces designed a phase apart will disagree. |
| Persisted saved views or saved filters | A table, an RLS policy, a retention class and a deletion-cascade entry, bought to replace a URL. |
| Adjustable density | A preference with no home; triples the accessibility matrix for a cosmetic gain. |
| Any set-valued or batch RPC | ADR-057 plus a second copy of every guarantee. |
| Task delete or archive | The product has no task delete by standing design; `cancel_task` + `/app/work/cancelled` is the terminal state. A second terminal state is a product decision. |
| Recurrence | `recurrence_requested` is a declared *refusal reason* in the taxonomy. Building it is a domain. |
| Drag-to-reorder priority | Same ordering-model problem as kanban without its payoff. |
| Calendar, reminders machinery, daily planning, reviews, notifications | Phase 2M. |
| A new project/person/context model | Phase 2N. |
| Re-opening ADR-093 (search sensitivity) or ADR-047 (confirmation TTL) | Both signed; Work's sensitivity posture is a *new* decision, not an amendment. |
| Opening public signup; executing rollout residuals | Independent owner-controlled gate. |
| `2K-AUDIT-002` (zero-source provider prose) and `2K-EXPL-007` (interpretation correction) | Neither is a Work capability. §11 states their destinations. |

### 3.3 Boundary with 2M–2O

Phase 2L **may** define reusable contracts later phases consume: the selection and
partial-result contract, the return-continuity pattern, the Work view taxonomy and the
Work telemetry surface. **A contract produced here does not authorize its consumer.**
Phase 2L links to calendar, people and project surfaces; it does not redesign them.

---

## 4. Requirement families

**Ten families, 76 requirements.** Every requirement carries exactly one `2L-*` id and
is declared exactly once, in the shape `- **2L-FAMILY-000:** …`.

> **A count that is emitted, not typed.** Phase 2K stated 68 in five documents and
> declared 79; the undercount was `2K-A11Y`, whose family name contains digits and
> which every prose extraction missed. This phase names its accessibility family
> **`2L-ACCESS`** for exactly that reason — a family whose name matches `[A-Z]+` is a
> family the A13 detector and the traceability generator can both see. The number
> above is a claim the traceability contract requires to be re-derived mechanically
> before closeout, and this sentence is not evidence that it is right.

### 4.1 `2L-AUDIT` — evidence foundation and signed decisions (slice 2L.0)

- **2L-AUDIT-001:** Re-derive, from the repository at the implementation baseline, the complete list of task statuses, taxonomy actions, per-action policies, eligibility rules and undo strategies, and record any divergence from `PHASE_2L_CURRENT_EXPERIENCE_AUDIT.md` §1.5 before any product code is written.
- **2L-AUDIT-002:** Measure which fields the Work list and the task detail may edit without new authority, by deriving the answer from `actionPolicy` rather than by listing fields, and record the derivation.
- **2L-AUDIT-003:** Measure the true cost of a bulk operation expressed as iteration over `public.apply_task_command`: the number of round trips, the audit rows and undo rows produced, and whether any per-item failure can leave a partially applied state that the domain cannot describe.
- **2L-AUDIT-004:** Measure every place the value set of a Work view is enforced — application, table CHECK and `private.validate_product_event_properties` — and state, name by name, which of them a new view would require changing. A count of enforcement points is not the measurement; the names are.
- **2L-AUDIT-005:** Measure whether a task's sensitivity is representable today without schema change, by reading the `tasks` columns and the `source_entry_id` relationship, and present the result as the input to the owner's sensitivity decision rather than as a chosen answer.
- **2L-AUDIT-006:** Record, before implementation, which of Phase 2K's three partials and which earlier residuals do and do not belong to this phase, with a destination for each that leaves this phase.

### 4.2 `2L-EDIT` — quick edit and the responsive task surface (slice 2L.1)

- **2L-EDIT-001:** A task's supported fields are editable from the Work list without navigating away from it, and the set of editable fields is derived from `actionPolicy` so a control can never offer a value or transition the command path would refuse.
- **2L-EDIT-002:** Quick edit reuses the existing validated command path; no Server Action, RPC, table or column is added for it, and a guard fails the build if a second task-mutation write path appears.
- **2L-EDIT-003:** Every quick edit renders one of the declared outcomes — applied, no change, refused, failed — with localized copy in both locales, never a silent success and never a bare error string.
- **2L-EDIT-004:** A value a control cannot represent is refused with a sentence naming the control and the correction, distinguishing at minimum a missing value, an invalid date, an out-of-range date and a value the policy does not allow.
- **2L-EDIT-005:** A task that changed since the row was rendered refuses rather than overwriting, and offers a refresh affordance rather than a retry that would overwrite.
- **2L-EDIT-006:** A repeated submission under one operation key replays rather than writing twice, and the surface says so rather than reporting a second success.
- **2L-EDIT-007:** The task detail is a side panel on wide viewports and a full-screen surface on narrow ones, from one implementation with one set of controls — not two components with two behaviours.
- **2L-EDIT-008:** Every reversible operation performed from Work or from the task detail offers an undo affordance while the domain still admits it, states the window in the user's own words, and disappears rather than fails once the operation is spent or expired.
- **2L-EDIT-009:** An operation the domain cannot reverse never offers undo, and where a recovery path exists instead the surface names that path rather than implying reversal.
- **2L-EDIT-010:** Destructive operations remain unreachable in one step from any quick-edit control: the destructive verb requires a server-issued confirmation and the control opens that confirmation rather than applying.

### 4.3 `2L-BULK` — selection and bulk actions (slice 2L.2)

- **2L-BULK-001:** A user can explicitly select and deselect individual tasks in a Work list, and the selection is visible, countable and dismissible without applying anything.
- **2L-BULK-002:** Selection is an explicit user act on each item or on a stated "select all shown"; no operation is ever applied to a set the user did not see.
- **2L-BULK-003:** The selectable set is bounded by a declared maximum, the bound is stated to the user before it is reached, and exceeding it is refused rather than silently truncated.
- **2L-BULK-004:** Only operations whose per-item semantics are identical, independently safe and derivable from the taxonomy may be offered in bulk; the set of bulk-eligible operations is derived from `actionPolicy` and never hand-written.
- **2L-BULK-005:** Before any bulk operation is applied, a preview states the operation, the number of items it would change, the number it would refuse, and the reason class for each refusal — computed from the same eligibility rules the apply path uses.
- **2L-BULK-006:** A bulk operation containing at least one item the domain marks destructive requires confirmation; a bulk operation containing none is applied directly, and the difference is derived from the policy rather than from the control that was clicked.
- **2L-BULK-007:** A confirmation authorizes exactly the previewed set and exactly the previewed operation; it cannot be reused for a different set, a different operation or a later attempt.
- **2L-BULK-008:** A per-item failure or refusal does not abort the remaining items; execution continues and the outcome is reported per item.
- **2L-BULK-009:** The result of a bulk operation states, in the user's own words, how many items changed, how many did not, and why each one did not — a partial result is never presented as a complete success and never as a total failure.
- **2L-BULK-010:** Each item in a bulk operation carries its own operation key, so a repeated submission replays per item rather than duplicating any write.
- **2L-BULK-011:** Items whose ownership, existence or eligibility cannot be established are refused with an outcome that reveals no differentiable existence signal.
- **2L-BULK-012:** Where the domain provides a reversal, a bulk result offers undo per item or for the applied subset only, states which items it would reverse, and never claims to reverse an item that was not applied.

### 4.4 `2L-VIEW` — the canonical Work taxonomy (slice 2L.3)

- **2L-VIEW-001:** Phase 2L declares one canonical set of Work views, each with a name the user reads, a predicate, a default ordering and a stated purpose; the set is declared in one module and consumed everywhere.
- **2L-VIEW-002:** No view is added whose telemetry identity cannot be recorded truthfully; a view that cannot be reported is either not added or is added with its unmeasurability stated explicitly as a limitation.
- **2L-VIEW-003:** Completed and cancelled work is reachable from the Work surface through a named destination rather than only through an unlinked nested route.
- **2L-VIEW-004:** Within a view, a user can filter by the attributes the projection already loads, and every filter is expressible in the URL.
- **2L-VIEW-005:** Within a view, a user can choose an ordering from a declared closed set, and the choice is expressible in the URL.
- **2L-VIEW-006:** Where grouping is offered, it groups only by attributes the page's own projection already loads, adds no unbounded per-user query, and states the group's item count.
- **2L-VIEW-007:** No view, filter, ordering or grouping introduces stored per-user state; the complete description of what a user is looking at is in the URL.
- **2L-VIEW-008:** An unknown, malformed or unauthorized view, filter, ordering or grouping parameter resolves to a declared default and never to an unfiltered or wider result set.
- **2L-VIEW-009:** Pagination composes with view, filter, ordering and grouping without losing any of them, and a page beyond the result set renders an empty state rather than an error.

### 4.5 `2L-RETURN` — return-state continuity (slice 2L.3)

- **2L-RETURN-001:** Opening a task from a Work list and returning through the product's own back affordance restores the same view, the same filters, the same ordering, the same grouping and the same page.
- **2L-RETURN-002:** The return position is carried in the URL and in nothing else; no server-side state, no stored preference and no client-persisted position is introduced.
- **2L-RETURN-003:** The return payload carries navigation position only; it can carry no confirmation, no operation key, no fingerprint, no patch and no computed preview, and is refused rather than ignored if it does.
- **2L-RETURN-004:** Returning re-authorizes and re-reads: the restored list is a fresh owner-scoped query, never a replay of what was rendered before the task was opened.
- **2L-RETURN-005:** A return position that is no longer valid — a page past the end, a filter that now matches nothing, a task that has moved out of the view — resolves to the nearest valid position and says so, rather than erroring or silently landing somewhere else.

### 4.6 `2L-MOBILE` — mobile Work interaction (slice 2L.4)

- **2L-MOBILE-001:** Every interactive control on the Work list, the task detail, the selection bar and the bulk result meets the product's touch-target minimum, measured from paint at a mobile viewport rather than asserted from source.
- **2L-MOBILE-002:** Primary actions on narrow viewports are reachable in the thumb zone without obscuring the content they act on, and the selection and bulk controls do not permanently cover a list row.
- **2L-MOBILE-003:** No action anywhere on the Work surface depends on hover or on a pointer that can hover.
- **2L-MOBILE-004:** Any gesture is an accelerator for a control that is visible and operable without it; a gesture is never the only route to any action.
- **2L-MOBILE-005:** A gesture that would apply a consequential change requires a deliberate completion — a threshold and a release, or a confirmation — so that a scroll or an accidental touch cannot apply it.
- **2L-MOBILE-006:** Selection survives scrolling, pagination-free re-render, orientation change and the appearance of the on-screen keyboard, and the selected count is announced when it changes.
- **2L-MOBILE-007:** A row's information density on narrow viewports is bounded so that the primary action of every row is reachable without horizontal scrolling, and the page body never scrolls horizontally.
- **2L-MOBILE-008:** Every mobile behaviour claimed by this family is proved at a mobile viewport in the automated lane, and any claim that requires physical hardware is reported as not executed rather than inferred.

### 4.7 `2L-PRIVACY` — sensitive content on Work (cross-cutting)

- **2L-PRIVACY-001:** Work's treatment of highly sensitive content is decided by the owner and implemented through the single central sensitivity contract; Work never tests a classification level on its own.
- **2L-PRIVACY-002:** If the chosen posture is that task content carries no classification, that is recorded as an evidenced negative naming the absent column and the surfaces that therefore differ, never left as an unstated default.
- **2L-PRIVACY-003:** If content is withheld, it is withheld in place: the row, the count, the filter and the selection remain truthful, and only the content is masked, with a deliberate local reveal.
- **2L-PRIVACY-004:** A preview, a bulk result, an undo affordance and a telemetry event may never reproduce withheld content, and a masked item may still be selected and operated on without revealing it.

### 4.8 `2L-ACCESS` — accessibility (executed per slice, closed in 2L.5)

- **2L-ACCESS-001:** The Work list, the task detail, the selection state, the bulk preview, the bulk result and the recovery surface each enter the automated accessibility lane at both viewports, and each is added in the slice that builds it rather than at closeout.
- **2L-ACCESS-002:** Every Work surface passes the automated scan with no serious or critical violation at both viewports.
- **2L-ACCESS-003:** Every interactive control has an accessible name that says what it does to which object, and controls that differ only by row are distinguishable.
- **2L-ACCESS-004:** Every focusable control paints a visible focus indicator, measured from paint.
- **2L-ACCESS-005:** Selection, quick edit, bulk preview, confirmation and bulk result are fully operable by keyboard, with a focus order that follows the visual order and no focus trap outside a dialog.
- **2L-ACCESS-006:** Outcomes are announced once and do not fight for focus: a single operation may move focus to its result, and a bulk operation announces its result without stealing focus per item.
- **2L-ACCESS-007:** Any motion introduced by this phase respects reduced-motion preferences.
- **2L-ACCESS-008:** A real screen-reader session and a real-device mobile session are reported as executed or as not executed; neither an automated scan nor an emulated device is reported as either.

### 4.9 `2L-METRICS` — content-free telemetry (slice 2L.5)

- **2L-METRICS-001:** Every Work event declared by this phase carries only closed enums, booleans and bounded counts; no title, description, note, person name, project name, context name, filter text or search term may appear in any property.
- **2L-METRICS-002:** Every event declared by this phase has a consumer before the phase closes; a producer with no consumer is not a delivered requirement.
- **2L-METRICS-003:** Each declared event is written through the production writer at least once in an automated test, so a vocabulary that is declared but unwritable cannot reach a deployment.
- **2L-METRICS-004:** Every enforcement point of a Work-related event vocabulary is enumerated by name and proved consistent; a new copy of any vocabulary is forbidden, and the phase must fail rather than add one.
- **2L-METRICS-005:** Quick edit, selection, bulk preview, bulk apply and undo each report an outcome from a closed vocabulary that distinguishes applied, no change, refused and failed, and bulk additionally reports the applied and refused counts as bounded values.
- **2L-METRICS-006:** The declared success measures for this phase are computable from the declared events alone, and any measure that is not is removed rather than approximated.
- **2L-METRICS-007:** No telemetry emitted by this phase requires a provider call, an AI operation or a rate-limit slot.

### 4.10 `2L-CLOSE` — closeout (slice 2L.5)

- **2L-CLOSE-001:** Every declared requirement is classified exactly once as built, baseline, partial, not-built-by-rule or undelivered, from executed evidence, with no unclassified row.
- **2L-CLOSE-002:** Every partial and every undelivered requirement names its remainder, its owner or destination, and the exact missing behaviour or proof.
- **2L-CLOSE-003:** The migration budget is reconciled per slice, not by count; a zero-spend close is legitimate and the ceiling is never treated as an obligation.
- **2L-CLOSE-004:** The phase states, from a live reading rather than from a filename, whether hosted parity moved, and reports the signup rollout gate unchanged.
- **2L-CLOSE-005:** Every check that was not executed — real device, screen reader, hydrated interactivity, authenticated online journeys, hosted probes — is reported as not executed and never rounded up.
- **2L-CLOSE-006:** ADR-055's expiry of 2026-10-27 is restated at close as neither satisfied nor superseded by this phase, which adds no semantic retrieval.
- **2L-CLOSE-007:** The successor phase is re-audited against the newly closed product and work stops for owner authorization; no successor artifact is created and no successor requirement is declared.

---

## 5. UX contracts

### 5.1 Universal states

Every Work surface introduced or touched by this phase must express all of these, and
must not express a state it cannot reach:

| State | Contract |
|---|---|
| Empty | Says what the view means and what to do next; a filtered-empty result is distinguishable from a genuinely empty view. |
| Loading | A pending state that does not shift layout; a control mid-flight is disabled and says so. |
| Partial | The only state that may report a mixed outcome; it names counts on both sides. |
| Refused | Says what was refused and what would make it succeed; carries a refresh affordance where staleness is the cause. |
| Failed | Says nothing changed, and whether retrying is meaningful. |
| Unavailable | Deleted, foreign and unreadable are byte-identical to the user. |
| Masked | Present only if `2L-PRIVACY` chooses masking; the row survives, the content does not. |

### 5.2 Confirmation, partial success and undo

| Operation class | Preview | Confirmation | Partial result | Undo |
|---|---|---|---|---|
| Single non-destructive edit | Not required (the control shows the value) | No | N/A | Yes, while the domain admits it |
| Single destructive operation | Required | Required, server-issued | N/A | Yes inside the window; recovery path afterwards |
| Bulk non-destructive | Required | Not required | Required | Applied subset only |
| Bulk containing a destructive item | Required | Required, per item | Required | Applied subset only |
| Anything with no domain reversal | Required | Required | Required | **Never offered** |

**Two sentences that must not be merged.** "You can undo this for 24 hours" and "you
can recover this afterwards" describe different mechanisms with different guarantees.
Copy that says the first when the second is true is a false promise.

### 5.3 Copy

All user-facing copy goes through the repository's canonical typed mechanism — a
feature `copy.ts` module in the `src/features/daily-cycle/copy.ts` shape — in both
locales. Inline locale ternaries are not added; the phase's ceiling must not rise.
No copy may contain engineering vocabulary: not a status literal, not an action name,
not an error code, not an RPC name.

---

## 6. Cost, limits and security

- **No AI cost.** Nothing this phase builds constructs a provider, records an
  `ai_usage_events` row or requests a rate-limit slot. The command console remains the
  only AI path on the surface and is untouched.
- **No new authority.** No RLS policy, no grant, no role, no secret, no external
  service, no service-role client, no second write path.
- **Bounded work per request.** Bulk is bounded by `2L-BULK-003`; every projection
  stays per-page rather than per-user, as `loadTaskRelations` already is.
- **Ownership is RLS plus the authenticated query**, unchanged. Nothing in this phase
  may be relied on for isolation, including selection, filtering and masking.

---

## 7. Migration budget

**Ceiling: ONE migration, allocated to slice 2L.3 only, and `1 allocated · 0 spent` is
the preferred close.**

The ceiling exists for exactly one reason, named rather than reserved:
`private.validate_product_event_properties` enforces
`workView ∈ {today, all, waiting}`, so a **fourth canonical Work view that is reported
to telemetry** cannot exist without one. If the taxonomy chosen at gate G-2L.3 fits the
three existing values, or if a new destination is reachable without becoming a reported
`workView`, the allocation lapses unspent and that is the better outcome.

**Explicitly refused, whatever the implementation discovers:**

| Pressure | Refusal |
|---|---|
| A set-valued or batch `apply_task_command` | ADR-057; iteration reuses every guarantee |
| A saved-view or saved-filter table | `2L-VIEW-007`; the URL is the state |
| A sensitivity column on `tasks` | Not authorized by this budget; if the owner chooses classification, it is a budget amendment and a separate decision |
| A second product event name beyond what one migration can carry | A second migration is a stop condition, not a decision the implementer makes |
| A new `undo_operation` handler | The registered handlers already cover every verb this phase surfaces |
| A new index | No requirement here changes a query's shape enough to need one; if a measurement says otherwise, it is a stop |

**The ceiling is not an obligation.** Reconciliation is per slice: a migration
allocated to 2L.3 and unspent does not become available to 2L.5.

---

## 8. Definition of Ready

Phase 2L implementation may begin only when all of the following hold:

1. The owner has authorized implementation explicitly, in an ADR.
2. Every open decision in §10 is signed or is recorded as gating a named slice rather
   than blocking the phase.
3. The migration budget in §7 is accepted or amended.
4. The traceability contract's refusals are runnable and have been proved to refuse
   against a mutated repository.
5. Slice 2L.0's measurements have been executed and any divergence from the audit is
   recorded.

## 9. Definition of Done

Phase 2L closes only when all of the following hold:

1. Every one of the 76 declared requirements is classified exactly once, from executed
   evidence, by a generator that refuses rather than prints an unresolved claim.
2. Every partial and undelivered requirement names its remainder and destination.
3. Lint and typecheck are zero-error; the full test suite passes; the production build
   passes; `git diff --check` is clean.
4. The accessibility lane covers every Work surface at both viewports and is green.
5. Every declared event has a consumer and has been written through the production
   writer in an automated test.
6. The migration budget is reconciled per slice and hosted parity is read live if any
   migration was deployed.
7. Every unexecuted check is reported as unexecuted.
8. The signup rollout gate is re-read and reported unchanged.
9. The successor is re-audited and work stops for authorization.

---

## 10. Open decisions

Each is presented as a signable proposal. **Two block; three gate.** A blocking
decision stops a slice from starting; a gating decision stops a slice from being
accepted.

### OD-2L-1 — Work's sensitivity posture · **BLOCKING** slice 2L.1's acceptance and slice 2L.5

Work is the last content surface outside `GOVERNED_SURFACES`, and `tasks` carries no
classification column.

| Option | What it means | Cost | Consequence |
|---|---|---|---|
| **A — evidenced negative (recommended)** | Task rows carry no classification; Work states this rather than implying a policy. `work` stays out of `GOVERNED_SURFACES` and the absence is recorded, named and tested. | Zero | Honest and cheap; a task extracted from a highly sensitive entry still renders in the clear, and the product still differs across surfaces — but *knowably*. |
| **B — derive from the source entry** | Join `source_entry_id` and mask a task whose originating entry is `highly_sensitive`. | One extra bounded read per page; no schema | Covers extracted tasks only; manually created tasks stay unclassified, so the rule is partial by construction and must say so. |
| **C — classify tasks** | A classification column on `tasks`, a CHECK, a write path and a backfill decision. | A migration and a domain decision; **outside §7's budget** | Complete and consistent, and the largest thing in the phase. Would make Phase 2L a schema phase. |

**Recommendation: A**, with B named as the follow-up if the owner wants coverage. C is
a separate authorization.
**Affects:** `2L-PRIVACY-001…004`, `2L-EDIT-003`, `2L-BULK-009`, `2L-ACCESS-002`.

### OD-2L-2 — The canonical Work view taxonomy and whether it spends the migration · **BLOCKING** slice 2L.3

| Option | Views | Migration |
|---|---|---|
| **A — three views, richer filters (recommended)** | Keep `today`, `all`, `waiting` as the reported views; reach *upcoming*, *completed*, per-project and per-context through URL filters within them. | **Zero.** `workView` unchanged. |
| **B — widen to a fuller taxonomy** | Add at least *upcoming* and *completed* as reported destinations. | **One**, spending the whole budget on the `workView` enum. |
| **C — widen without reporting** | Add views and do not report them. | Zero, and rejected: a Work view nobody can measure is the "producer with no consumer" failure this repository has paid for twice. |

**Recommendation: A.** It leaves the budget unspent, keeps completed work reachable
through a filter rather than a new enum member, and avoids the cascade the audit
records for adding `cancelled` to `workViews`.
**Affects:** `2L-VIEW-001…003`, `2L-AUDIT-004`, `2L-METRICS-002`, §7.

### OD-2L-3 — Which operations may be applied in bulk · **GATES** slice 2L.2

| Option | Set | Note |
|---|---|---|
| **A — non-destructive, bounded-value operations only (recommended)** | Status change within active statuses, priority, due date, planned date, and relation assignment. **No `cancel_task`.** | Every member is reversible, one-step eligible and has a closed or validated value. The one destructive verb stays a per-task, per-confirmation operation. |
| **B — A plus bulk cancel with per-item confirmation** | Adds `cancel_task`. | Each item needs its own server-issued confirmation, so "bulk" becomes *n* confirmations — which is either an honest friction or a dialog the user clicks through *n* times without reading. |
| **C — status only** | The narrowest set. | Cheapest, and probably too narrow to be worth the selection model. |

**Recommendation: A.**
**Affects:** `2L-BULK-004…007`, `2L-BULK-012`, §5.2.

### OD-2L-4 — The selection ceiling · **GATES** slice 2L.2

Bulk is iteration, so the ceiling is a real latency and a real number of audit and undo
rows. Options: **50** (one page, recommended — the set is exactly what the user can
see), **25** (conservative), or a stated ceiling derived at G-2L.2 from a measured
per-item cost. Whichever is chosen, `2L-BULK-003` requires it to be *stated to the user*
and *refused* rather than silently truncated.
**Recommendation: 50, matching `WORK_PAGE_SIZE`.**
**Affects:** `2L-BULK-003`, `2L-AUDIT-003`.

### OD-2L-5 — Gesture policy on mobile · **GATES** slice 2L.4

| Option | Behaviour |
|---|---|
| **A — no gesture (recommended for this phase)** | Visible controls only. Nothing to mis-fire, nothing undiscoverable, nothing to teach. |
| **B — swipe as an accelerator for one non-destructive verb** | A threshold-and-release swipe that duplicates a visible button, never a destructive one, with the visible control being what the accessibility lane scans. |
| **C — swipe with destructive actions** | Rejected outright: the product's one destructive verb requires a server-issued confirmation by contract, so a swipe could not apply it anyway, and a swipe that opens a confirmation is slower than the button. |

**Recommendation: A**, with B permitted only if `2L-MOBILE-004` and `2L-MOBILE-005`
are both proved first.
**Affects:** `2L-MOBILE-004`, `2L-MOBILE-005`, `2L-ACCESS-005`.

### 10.1 Decisions that are NOT open

Recorded so nobody re-opens them inside this phase: the confirmation has no TTL
(ADR-047); search sensitivity is signed (ADR-093); `apply_task_command` cannot grow an
argument (ADR-057); tasks have no delete; recurrence is a declared refusal; the undo
window is 24 hours and lives in the database.

---

## 11. Residual destinations

### 11.1 Inherited from Phase 2K — and where each actually goes

| Residual | Belongs to 2L? | Destination |
|---|---|---|
| `2K-AUDIT-002` — the prose a zero-source answer produces | **No.** Not a Work capability. | An authorized credentialed environment; independent residual, unchanged. |
| `2K-EXPL-007` — interpretation correction has no domain | **No.** Its subject is entries and interpretations; correcting a *task* is already a first-class operation. | The phase that owns entries, memory and provenance — Etapa 5 in the parent roadmap. Re-stated rather than transported. |
| `2K-A11Y-007` — a real-device mobile session | **Inherited as a limitation only.** | `2L-ACCESS-008` restates it with the same honesty and the same standing as `G-2J.4b`; it cannot be closed without owner-run hardware. |
| Historical citation excerpts | No | Conversar residual; contained by a renderer that never reads one. |
| Relation references not editable from a conversation card | No | The verbs exist on the task detail; the residual is about card states for entity resolution. |
| Old task-command confirmation rows | No | A data-lifecycle question with no user-visible symptom and no owner; a UX phase must not quietly acquire a retention decision. |
| `2E-COMMAND-012` (AI provenance) | No | Still deferred behind ADR-057's unexecuted reopening gate. |
| `2J-METRICS-001`/`005`, G-2J.4b | No | Capture, attention and voice. |

### 11.2 Residuals this phase expects to create

Named in advance so closeout cannot invent a comfortable list: anything OD-2L-1
option A leaves uncovered; anything OD-2L-2 option A defers to a filter rather than a
view; the screen-reader and real-device sessions; and hydrated-interactivity proof for
Work, which the current lane's fixture-based design cannot produce.

---

## 12. What this document does not authorize

Implementation of any slice. Any migration. Any deployment. Any database, RLS, grant,
policy or Auth change. Any new RPC or Server Action. Opening public signup. Executing
any rollout residual. Spending a BYOK credential or calling any provider. Creating an
acceptance record, a traceability matrix or a closing report. Starting, scoping or
naming a successor phase.
