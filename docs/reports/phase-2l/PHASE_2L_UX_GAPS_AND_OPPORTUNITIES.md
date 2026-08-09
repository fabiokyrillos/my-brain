# Phase 2L — Work and execution · UX gaps and opportunities

**Status:** planning evidence. Declares no requirement and authorizes nothing.
Companion to `PHASE_2L_CURRENT_EXPERIENCE_AUDIT.md`; every gap below cites that
document's section rather than restating its evidence.

**Ranking rule.** Gaps are ordered by *user cost × cheapness to fix*, not by how
interesting they are to build. A gap whose fix is a query string outranks a gap whose
fix is a board.

---

## The ranked gaps

### G-01 — The product's own Back control loses your place

**Symptom.** Read page 3 of `Todas`, open a task, press *Voltar* → page 1 of *Hoje*.

**Evidence.** Audit §3. `task-detail-view.tsx:113` hardcodes `/${locale}/app/work`;
`parseWorkView(undefined)` → `today`, `parsePage(undefined)` → 1.

**Why it matters more than it looks.** This is the same class Phase 2K spent a whole
slice on for Conversar — *going to look at something destroys where you were* — and on
Work it costs a scroll and a re-navigation every single time a user inspects a task.
Work is the surface people iterate on.

**Cost.** Carry `view` and `page` into the detail route and back. No state, no
storage, no schema. The position is already in the URL.

**Trap to avoid.** Do not solve it with a stored per-user "last view". That is a table
with an RLS policy, a retention class and a deletion-cascade entry, bought to replace
a query string.

---

### G-02 — A 24-hour undo ships, and no operating surface offers it

**Symptom.** Complete the wrong task from the list. The outcome region says it worked
and offers *refresh*. There is no way back except finding the reverse verb.

**Evidence.** Audit §1.6. `undo_operations` rows are written on every apply;
`loadTaskCommandUndoOperation` validates ownership from the row; the **only** rendered
Undo control is in the command console (`command-console.tsx:433-440`).

**Why it matters.** Every "are you sure?" the product might otherwise need is a tax
paid because undo is unreachable. Reversibility is what lets a fast surface stay fast.

**Cost.** An affordance over an existing validated projection and an existing router.
No new authority. The honest part is the hard part: the window is 24 hours and the
control must say so, and it must disappear — not fail — when the row is spent or
expired, both of which `undo-listing.ts` already distinguishes from data.

**Trap to avoid.** Do not promise undo where the domain does not give one.
`cancel_task` is undoable inside the window and recoverable afterwards through
`/app/work/cancelled`; those are two different sentences and must not be merged.

---

### G-03 — Editing anything means leaving the list

**Symptom.** Renaming a task, moving a due date or setting a priority costs a
navigation, a page load and a navigation back — which then lands you somewhere else
(G-01).

**Evidence.** Audit §1.4, §2. `rename_task` and the eleven other field verbs are
reachable only from `/app/work/[taskId]` or by typing a sentence into the console.

**Why it matters.** This is the parent PRD's slice 4.1 in one line, and it is the
difference between a list you *read* and a list you *operate*.

**Cost.** `detailControlFor(action)` already returns the control's kind, field, bounds
and destructiveness from the policy, independent of any task; `buildDetailPatch`
already refuses four named value faults with localized sentences. The list needs a
mount, not a mechanism.

**Trap to avoid.** Inline edit must not become a second write path. The moment a
"quick edit" endpoint exists beside `applyTaskDetailCommand`, the eligibility gate,
the fingerprint and the audit row have two implementations.

---

### G-04 — There is no way to act on more than one task

**Symptom.** Ten tasks slipped to next week. That is ten navigations, or ten sentences
typed into a console.

**Evidence.** Audit §2 (no selection model anywhere in Work), §4 (the one adjacent
precedent).

**Why it matters.** It is the single largest time cost in the surface, and it is the
parent PRD's slice 4.2.

**Cost.** Iterating the existing single-item authority. `apply_task_command` takes one
`p_task_id` and cannot grow one (ADR-057); a set-valued RPC would be a migration *and*
a second copy of the eligibility, fingerprint, audit and undo logic.

**Traps to avoid — all four are visible in the existing precedent (audit §4):**
1. **Stopping at the first failure.** `NeedsAttentionList` breaks out of its loop and
   shows one sentence; the user never learns which items applied. Any Work bulk action
   must continue and report per item.
2. **No preview.** A set the user did not see is a set the user did not choose.
3. **No confirmation where the operation is destructive.** Retry is idempotent and
   needs none; `cancel_task` needs one per item and by contract cannot be applied
   without a server-issued confirmation.
4. **A derived set instead of a chosen one.** "Everything currently filtered" is a
   different promise from "these eight".

---

### G-05 — Work has no sensitivity policy, and its table has no column to read

**Symptom.** A task extracted from a `highly_sensitive` entry renders its title and
description in the clear on Work — including in the mobile bar's default destination —
while the same content is masked on Hoje, on the attention queue and now on Conversar.

**Evidence.** Audit §1.10. `GOVERNED_SURFACES` has six members and `work` is not one;
`tasks` has no classification column (`database.types.ts:2472-2496`); the sensitivity
module's own header records that Work was left out.

**Why it matters.** It is the last ungoverned content surface, and it is the one a
phone shows first. Two surfaces of one product still disagree.

**Why it is a decision and not a task.** There is no predicate to apply. The options
are genuinely different products:
- *evidenced negative* — a task title is user-authored or model-extracted **into its
  own row**, and the product has never classified it; state that, and say so plainly;
- *derive from the source entry* — join `source_entry_id`, mask when the source is
  `highly_sensitive`; costs a read per page, changes nothing in schema, and creates a
  rule that only covers tasks that came from entries;
- *classify tasks* — a column, a CHECK, a backfill decision and a write path. A
  migration and then some.

**Signed: option B** (ADR-103). The owner chose coverage over cheapness and accepted
the partial coverage explicitly, which is why `2L-PRIVACY-004` makes *stating* the
partiality a requirement rather than a footnote: a task the user typed by hand still
has no derivable classification, and saying so is the whole difference between an
honest partial rule and a mask people over-trust.

**Trap the signed option carries.** "No mask" and "mask not applied" look identical
from outside — so the manual-task case needs a positive test proving it resolves to
*no derivable classification*, not merely that nothing was masked.

---

### G-06 — Work is absent from the accessibility lane

**Symptom.** Ten surfaces are scanned at two viewports; none of them is Work, the task
detail or the recovery list.

**Evidence.** Audit §1.9. `e2e/accessibility.spec.ts:384-395`.

**Why it matters.** Phase 2J found a real Phase 2I defect on the lane's *first*
execution (a 16px control on a Pixel 7). A phase whose subject is operating tasks on a
phone that ships without adding itself to that lane is choosing not to look.

**Cost.** Fixtures plus entries in `SURFACES`. It is the cheapest gap on this list
after G-01, and Phase 2J's lesson is that it belongs at the *start* of the phase, not
in its closeout — deferring it is what produced Phase 2I's partial.

**Trap to avoid.** Reporting the lane as proof of things it does not do. It renders
static fixtures, so it proves markup and computed style; it does not prove hydrated
interactivity and it does not simulate a screen reader.

---

### G-07 — The view taxonomy is narrower than the product's vocabulary, and widening it costs a migration

**Symptom.** Three views — *Hoje*, *Todas*, *Aguardando* — over eight statuses. There
is no *Em breve*, no *Concluídas*, no per-project or per-context view; cancelled work
lives behind an unlinked-from-navigation nested route.

**Evidence.** Audit §1.2, §1.8. `workViews` has three members;
`private.validate_product_event_properties` pins `workView` to exactly those three
(`202607170024:224`, carried through `202607220044:1816`).

**Why it matters.** *Todas* ordered by `updated_at desc` is not a work list, it is an
activity log. Completed work is invisible, which makes "did I finish that?" a search
problem.

**Why it is not free.** Any view that is *reported* needs the enum widened — one
migration. Views could be added without telemetry, but a Work view nobody can measure
is exactly the "producer with no consumer" failure this repository has now paid for
twice.

**Trap to avoid.** Treating filters and views as the same thing. A *view* is a named
destination with a predicate and a telemetry identity; a *filter* narrows within one.
Filters can be URL-expressible and free; views are not.

---

### G-08 — Mobile is adequate at the pixel and absent at the interaction

**Symptom.** Targets are 44px and actions go full-width below 600px, but there is no
gesture, no thumb-zone treatment of the action strip, and the relation badges plus
three date/priority/state badges make a row tall before the buttons even start.

**Evidence.** Audit §1.9 (`operations.css:197`, `:202`, `:203`, `:21`, `:61`), §2
(no pointer handlers anywhere in Work).

**Why it matters.** `work` is one of five slots in the mobile bar. It is a primary
destination on the smallest screen and it was laid out for a wide one — the CSS itself
says `.list-row` "was authored for the ~1036px `.list-stack` on Registros"
(`operations.css:99`).

**Opportunity, with its own trap.** A swipe is the most natural bulk-adjacent gesture
and the most dangerous: it is invisible, undiscoverable, easy to fire accidentally on
a scroll, and unavailable to keyboard and screen-reader users. If a gesture ships at
all it must be an *accelerator for a visible control*, never the only route to an
action — and the visible control is what the accessibility lane scans.

---

### G-09 — Every outcome is per-row and nothing composes

**Symptom.** Three consecutive completions produce three outcome regions, each of
which steals focus (`work-item-actions.tsx:92-94`). Correct for one action; noisy for a
sequence, and actively hostile once selection exists.

**Evidence.** Audit §1.4, §1.9.

**Why it matters.** The focus move is a genuine accessibility win for a single
operation and becomes a focus fight for a batch. Bulk cannot simply reuse the per-row
outcome component.

**Cost.** A result surface that can express *n* outcomes with one focus stop and one
live-region announcement. This is design work, not authority work.

---

### G-10 — Work's copy is the repository's largest remaining ternary cluster

**Symptom.** `task-list.tsx` computes `const pt = locale === "pt-BR"` and renders seven
inline ternaries; `WorkView` declares its copy record inside the component file.

**Evidence.** Audit §1.11.

**Why it matters.** The canonical mechanism is a typed feature `copy.ts` module
(ADR-036, `ENGINEERING_STANDARDS.md`), `locale-ternary-guard.test.ts` holds a ceiling,
and every new Work string added inline makes the phase's own copy surface harder to
review in two locales. A phase that touches every string on the surface is the cheapest
moment to fix it.

**Trap to avoid.** Making this a slice. It is a by-product of touching the files, not
a deliverable, and it must not be allowed to become a refactor that competes with the
phase's user outcome.

---

### G-11 — Empty, loading and error states are uneven

**Symptom.** The empty list is well handled (`empty-list` with an icon, a heading and a
per-view hint, `task-list.tsx:70-72`). There is no skeleton or pending state for the
list itself, and a projection failure surfaces through `requireSupabaseData` as a
thrown error rather than as a page state.

**Evidence.** Audit §1.2, §1.4.

**Why it matters.** Phase 2I's universal-state work exists
(`src/features/experience/universal-state.tsx`) and Work does not consume it. The
per-action states are excellent and the per-page states are not.

---

### G-12 — Cancelled work is reachable only from a link at the bottom of one view

**Symptom.** `/app/work/cancelled` renders only from `WorkView`'s own trailing link;
navigation never shows it because links come from `primaryNavigationKeys` and
`moreNavigationGroups`.

**Evidence.** Audit §1.1, `work-view.tsx:82-91`, `work/cancelled/page.tsx:9-24`.

**Why it matters.** It satisfies `2E-DESTRUCTIVE-006`'s "explicit affordance"
minimally. The *recovery* path for the product's only destructive verb deserves to be
findable from the place the verb is used.

**Opportunity.** If G-07 produces a canonical view taxonomy, cancelled work has an
obvious home — but the audit's own note is a warning: adding `"cancelled"` to
`workViews` would force it into `workItemHumanStates`, `projection-mappers.ts`,
`availableActions`, the `dailyCycleActions` allowlist, `humanStateCopy` **and** the
`work_view_viewed` enum in the database.

---

## Opportunities that are NOT recommended for Phase 2L

Recorded so that rejecting them is a decision rather than an omission.

| Opportunity | Recommendation | Reason |
|---|---|---|
| **Kanban board** | Reject | Drag is the least accessible primary verb in the product, needs keyboard and touch equivalents, and needs a user-ordering model `dynamic_priority` does not provide. It is a phase. |
| **Timeline view** | Reject | The parent PRD hedges it, and Phase 2M owns calendar. Two date surfaces designed a phase apart will disagree. |
| **Persisted saved views/filters** | Reject for 2L | A table, an RLS policy, a retention class, a deletion-cascade entry — bought to replace a URL. Confirmed by OD-2L-2 A. |
| **Adjustable density** | Defer | A preference with no home; triples the accessibility matrix for a cosmetic gain. |
| **A set-valued bulk RPC** | Reject | A migration plus a second copy of eligibility, fingerprint, audit and undo. Iteration reuses all of it. |
| **Task delete/archive** | Reject | The product has no delete for tasks by standing design; `cancel_task` plus the recovery surface is the terminal state. Introducing a second terminal state is a product decision, not a UX slice. |
| **Recurring tasks** | Reject | `recurrence_requested` is a *declared refusal reason* in the taxonomy (`taxonomy.ts:88`). Building it is a domain, not a Work view. |
| **Drag-to-reorder priority** | Reject | Same ordering-model problem as kanban, without kanban's payoff. |
| **A generic "resolve item" executor** | Reject | `2J-ATTN-010`'s own comment explains why: it makes a new write path look like one more prop on a list. |

---

## The three sentences a reviewer should take away

1. **Most of Phase 2L is surfacing authority that already exists** — quick edit, bulk
   and undo all reuse `apply_task_command` and `undo_operation`, and the only place
   anyone would be tempted to add authority (a set-valued RPC) is the one place it is
   least needed.
2. **Two gaps are not polish** — Work applies no sensitivity policy (G-05) and is
   absent from the accessibility lane (G-06). Both are decisions the phase must make
   out loud, and G-05 may be the only one that reaches the owner as a real product
   choice.
3. **The migration question has exactly one honest answer, and it is now signed** —
   everything in G-01 through G-06 and G-08 through G-12 costs zero migrations; only
   widening the *reported* view taxonomy (G-07) and only classifying tasks (G-05's
   third option) cost anything, and **both were refused**: OD-2L-2 signed option A and
   OD-2L-1 signed option B, which needs no schema. **The expected close is
   `1 allocated · 0 spent`.**
