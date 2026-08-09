# Phase 2L — Slice 2L.0 · acceptance record

**Status:** executed. **Zero migrations. Zero product surfaces. One executable
foundation contract**, which the plan explicitly permits this slice and only this
slice to produce.

**Baseline:** `main` at `6ad8cff7eb46027038d8ea8adcb0122d1007f650` (the planning merge
SHA), CI green on all three jobs. Branch `codex/phase-2l-slice-0`.
**Authorization:** ADR-103 (implementation through closeout; all five decisions signed).
**Requirements covered:** `2L-AUDIT-001` … `2L-AUDIT-006`.

---

## 1. What this slice delivers

| Artifact | Purpose |
|---|---|
| `src/features/sensitivity/task-derivation.ts` (+ test) | **M4** — OD-2L-1 option B's derivation contract, as executable code |
| `src/lib/closeout/phase-2l-work-authority-guard.test.ts` | **M1** — the task-authority census, and `2L-AUDIT-002`'s derivation assertions |
| `src/lib/closeout/phase-2l-vocabulary-guard.test.ts` | **M3** — the Work telemetry vocabulary, by name, at every enforcement point |
| `src/lib/closeout/phase-2l-requirement-declarations.test.ts` | **G-2L.0** — the 82-requirement extraction and `R-15`'s prose check |
| This record | **M5** — residual disposition, and the measurements |

**Deviation from the plan's file list, recorded rather than absorbed.** The plan named
two guards; three exist. `phase-2l-requirement-declarations.test.ts` is the third, and
it implements gate G-2L.0's own words — *"82 requirements extracted mechanically with
no duplicate and no unclassifiable family name"* — which the two named guards do not
cover. It is a narrowing, not an expansion: it adds a check, no capability and no
authority.

---

## 2. M1 — the authority census

**Re-derived from source at the implementation baseline, not from the audit.**

`taxonomy.ts` declares **8 statuses** (`TASK_STATUSES`), **6 non-terminal**, **4
priorities**, **15 mutation actions** plus one creation intent that is deliberately not
a sixteenth, and **one policy row per action** carrying `eligibleFrom`,
`allowedTargetValues`, `targetValueField`, `targetStatus`, `requiredPatchFields`,
`allowedPatchFields`, `changedFields`, `destructive`, `oneStepEligible`,
`requiresConfirmation`, `reversible` and `undoStrategy`.
`TASK_COMMAND_POLICY_VERSION` is `2026-08-05.1`; `TASK_COMMAND_UNDO_WINDOW_HOURS` is
**24**, a mirror of `undo_operations.expires_at`'s default pinned by
`policy-lock.test.ts`.

**Exactly one action is destructive** — `cancel_task`: `destructive: true`,
`oneStepEligible: false`, `requiresConfirmation: true`. `restore_task` is
`oneStepEligible: false` for symmetry. **No divergence from the audit's §1.5.**

**The call-site census, now a guard rather than a paragraph:**

| RPC | Call sites |
|---|---|
| `apply_task_command` | **1** — `src/features/task-commands/apply.ts` |
| `create_task_command` | 1 — `creation.ts` |
| `preview_task_command_creation` | 1 — `creation.ts` |
| `issue_task_command_confirmation` | 1 — `confirmation.ts` |
| `issue_task_command_creation_confirmation` | 1 — `creation.ts` |
| `list_task_command_candidates` | 1 — `candidates.ts` |
| `task_command_fingerprint` | 1 — `fingerprint.ts` |
| `undo_operation` (shared router) | 4 — `agent/`, `interpretations/`, `task-commands/`, `tasks/` `actions.ts` |

**Two detector properties this census had to pay for, and one it caught.** Three of the
seven RPCs are called in the **multi-line** form `client.rpc(\n "name",\n payload)`; a
line-oriented scan finds `apply_task_command` and silently misses `create_task_command`,
`preview_task_command_creation` and `issue_task_command_creation_confirmation`. The
first draft of the census did exactly that — a census that misses call sites is a census
that would let a fourth one in. The extractor is newline-tolerant and a fixture proves
it. Comments are stripped before scanning, and a fixture proves a comment naming
`apply_task_command` does **not** fire while a real call in the same file does — Phase
2K's lesson, mechanised.

**`2L-AUDIT-002`.** The editable field set is derived: `detailControlsFor` iterates
`TASK_COMMAND_ACTIONS`, asks `actionPolicy(action)` and `isEligibleStatus(action,
status)`, and takes each control's `choices` from `policy.allowedTargetValues`. The
guard additionally asserts that `detail-controls.ts` names **no** task status and **no**
priority as a literal — the two closed vocabularies a hand-written list would duplicate
first.

---

## 3. M2 — the bulk cost measurement, and the ceiling it confirms

**Per item, an iteration costs exactly two round trips:**
`resolveWorkCommand` → `list_task_command_candidates`, then `applyTaskCommand` →
`apply_task_command` (`work-command.ts:221,225`). Page-level reads — the profile
timezone, the page query, the four relation reads — happen **once per page**, not per
item.

**Per applied item, the database writes exactly two rows:** one `undo_operations`
reservation, which is the RPC's *first* write and is what proves a call is not a replay
(`202607270060:1124`), and one `audit_logs` row from `audit_task_change` co-firing on
the task UPDATE (`202607270060:1791`).

**At the signed ceiling of 50** that is at most **100 round trips, 50 undo rows and 50
audit rows** for one bulk operation — bounded, per-page, and with no unbounded per-user
scan anywhere on the path. **The ceiling is confirmed safe and this slice does not
stop.**

**A per-item failure cannot leave a state the domain cannot describe.** Each item is its
own transaction: a refusal raises and rolls back that item's reservation, so a refused
item leaves *nothing*, and an applied item leaves a complete reservation-plus-audit
pair. There is no partially-written item to describe — which is what makes
`2L-BULK-009`'s per-item result achievable at all.

---

## 4. M3 — the view-enforcement census, by name

**The names, not the count** — the measurement the post-2J and post-2K corrections both
paid for:

| Enforcement point | Where | Declares |
|---|---|---|
| Application view list | `work-projection.ts` → `workViews` | `today`, `all`, `waiting` |
| Application property validator | `product-analytics/contracts.ts` → `isOneOf(value.workView, …)` | `today`, `all`, `waiting` |
| Database property validator | `private.validate_product_event_properties`, effective in **`202608090088`** | `today`, `all`, `waiting` |
| Table CHECK (surfaces) | `product_events_surface_check`, effective in **`202608090089`** | 11 surfaces incl. `work`, `task_command` |
| The writer | `private.record_product_event`, effective in **`202608090089`** | **nothing** — no surface, no event name |

**All three view declarations are the same three values, in the same order.** The
surface CHECK and `productSurfaces` match element by element. **The writer holds no copy
of either vocabulary**, and the guard asserts that emptiness — because the defect that
cost two corrections was never a *wrong* list, it was a *second* list.

**`2L-AUDIT-004` conclusion: OD-2L-2 option A needs no migration.** The three signed
views are exactly what every gate already enforces, so the single allocation lapses
unspent. **A fourth value appearing anywhere fails the guard, whichever place it appears
in first.**

The extractors are proved on planted SQL: an in-list with a commented-out value, a
widened `workView` array, a vocabulary planted inside the writer's body, and — the
decisive one — a fixture proving `writerBody` reads **only** the function definition and
not the CHECK declared above it or the verification block below it, both of which live
in the same migration file and both of which legitimately name `'work'`.

---

## 5. M4 — the derived-sensitivity contract (OD-2L-1 option B)

`src/features/sensitivity/task-derivation.ts` is the executable form of the signed
contract. It is **pure**: no I/O, no client, no `async`.

**Three outcomes, and only two of them are levels:**

| Input | Result |
|---|---|
| `source_entry_id` present **and** readable | `{ kind: "derived", level }` — the source's **current** level |
| `source_entry_id` present, **absent from the owner-scoped read** | `{ kind: "derived", level: "highly_sensitive" }` |
| **No** `source_entry_id` (a manual task) | `{ kind: "undetermined" }` |

**`undetermined` has no `level` field, and that is the requirement rather than an
omission.** The owner's contract says a manual task is never artificially classified and
that the absence of a source is never inferred to mean `normal`. A boolean flag beside a
`SensitivityLevel` would be one careless destructure away from doing exactly that; a
three-arm union with no level to misread cannot.

**Unreadability is expressed as absence from a map**, keyed by entry id and built from a
query scoped to the caller's own rows and bounded to the ids on the page — the shape
`attention-projection.ts` already uses. **Removed, foreign and unreadable are therefore
one case**: there is no branch that could distinguish them, so there is no branch that
could leak which one it was. A test asserts the three answers are byte-identical.

**It fails closed twice over.** A row whose stored level is `null`, empty or outside the
closed vocabulary resolves to `highly_sensitive` through `toSensitivityLevel`, which
already had that property. And an empty-string source id is treated as *no source*
rather than as a lookup — a `""` that reached the derivation was built from something
absent, and looking it up would find nothing and produce the far stronger *unreadable*
answer.

**What this slice deliberately does not do.** `work` does **not** join
`GOVERNED_SURFACES` here. Presentation is `presentationFor`/`resolveContent`'s job, and
a governed surface with no consumer is a producer nobody reads — the failure this
repository has paid for twice. `work` joins the contract in **2L.1**, in the same change
that ships the list and detail consumers and extends
`sensitivity-convergence.test.ts`'s positive half.

---

## 6. M5 — residual disposition

**Inherited from Phase 2K**, re-confirmed against the implementation baseline rather
than copied from the planning package:

| Residual | Belongs to 2L? | Destination |
|---|---|---|
| `2K-AUDIT-002` — zero-source provider prose | **No** | Needs a credentialed provider call; a Conversar answer property. Independent residual, unchanged. |
| `2K-EXPL-007` — interpretation correction has no domain | **No** | Its subject is *entries and interpretations*. Correcting a **task** is already first-class (`rename_task`, `append_note`, the twelve field verbs). Destination: the phase that owns entries, memory and provenance. |
| `2K-A11Y-007` — a real-device mobile session | **Inherited as a limitation only** | `2L-ACCESS-008`; same standing as `G-2J.4b`; cannot be closed without owner-run hardware. |
| Historical citation excerpts | No | Conversar residual, contained by a renderer that never reads one. |
| Relation references not editable from a card | No | The verbs exist on the task detail; the residual is about card states for entity resolution. |
| Old task-command confirmation rows | No | A data-lifecycle question with no user-visible symptom and no owner. A UX phase must not quietly acquire a retention decision. |
| `2E-COMMAND-012` (AI provenance) | No | Still deferred behind ADR-057's unexecuted reopening gate. |
| `2J-METRICS-001`/`005`, `G-2J.4b` | No | Capture, attention and voice. |

**Created by this slice:** none.

---

## 7. Gate G-2L.0

| Check | Result |
|---|---|
| Five measurements executed and recorded | ✅ §§2–6 |
| Guards fire on the mutation they exist to catch | ✅ planted second call site, planted multi-line call, planted comment-only mention, planted vocabulary in the writer, planted stale count |
| Derived-sensitivity contract fixed | ✅ §5 |
| 82 requirements extracted mechanically, no duplicate, every family expressible | ✅ 10 families, each `1..n` with no gap |
| Zero migrations | ✅ 89 before, 89 after |
| Divergence from a signed decision | **none** |

**Executed locally:** focused suites green (`task-derivation` 11, authority guard 13,
vocabulary guard 17, requirement declarations 11); lint and typecheck zero-error; full
suite; production build; `git diff --check` clean.

**NOT executed, and not inferred:** any hosted probe; any real-device session; any
screen-reader session; hydrated interactivity in a browser; any authenticated online
journey. This slice ships no surface, so none of them has a subject yet.

---

## 8. What this slice did not touch

No product surface, no route, no component, no Server Action, no RPC, no migration, no
RLS policy, no grant, no secret, no external service, no provider call, no telemetry
event, no signup or rollout state. `GOVERNED_SURFACES` is unchanged. Hosted parity
remains `202608090089`, 89 migrations.
