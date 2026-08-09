# Phase 2L — Work and execution · current-experience audit

**Status:** planning evidence. This document declares no requirement, authorizes no
implementation, and creates no migration. It is the G1 artifact the Phase 2L PRD is
written against.

**Baseline.** `main` at `044f541acb40d9a8507380afbe6a199c731dc0a8`, worktree clean,
`main = origin/main`. 89 migrations; hosted parity `202608090089`, local = remote.
Phase 2K concluded 2026-08-09 after the extraordinary post-phase correction
(`202608090089`, charged to no phase). Signup closed; rollout gate 25 pass · 3 fail ·
2 owner-signature. A13 targets Phase 2L, which is not started.

**Method.** Every claim below cites a route, component, Server Action, module,
migration, constraint, test or CSS rule that exists in this repository at that SHA.
Where a behaviour is *absent*, the absence is stated as a search that returned
nothing, naming the search. **No hosted probe was executed for this audit** — the
parity and rollout-gate readings above are the only live readings, and both are
read-only.

---

## 1. What "Trabalho" is today

### 1.1 Routes

| Route | File | What it does |
|---|---|---|
| `/app/work` | `src/app/[locale]/app/work/page.tsx` | The Work surface. Reads `?view=` and `?page=`, loads `loadWorkProjection`, renders `WorkView`. |
| `/app/work/[taskId]` | `src/app/[locale]/app/work/[taskId]/page.tsx` | Task detail. Loads `loadTaskDetailProjection`, renders `TaskDetailView` with `WorkItemActions` and `TaskDetailControls`. |
| `/app/work/cancelled` | `src/app/[locale]/app/work/cancelled/page.tsx` | Cancelled-task recovery (`2E-DESTRUCTIVE-006`). Data source is a Phase 2E RPC, not `work-projection`. |
| `/app/tasks` | `src/app/[locale]/app/tasks/page.tsx` | **Redirect** to `/app/work?view=all&page=N`. |
| `/app/waiting` | `src/app/[locale]/app/waiting/page.tsx` | **Redirect** to `/app/work?view=waiting&page=N`. |
| `/app/today` | `src/app/[locale]/app/today/page.tsx` | **Redirect to Hoje (`/app`)**, not to Work — changed by `2J-HOJE-001`/`002`. |

`capabilities.ts:88` registers `work` as a primary destination with
`aliases: ["tasks", "waiting"]` and `nested: true`; `mobileBarSlots`
(`capabilities.ts:155`) puts `work` in the five-slot mobile bar. `nested: true` drives
active-state highlighting only — navigation links render from
`primaryNavigationKeys`/`moreNavigationGroups`, which is why `/app/work/cancelled` is
reachable only through the link `WorkView` renders itself (`work-view.tsx:89-91`).

### 1.2 The three views, and where they come from

`work-projection.ts:18` — `workViews = ["today", "all", "waiting"]`, page size 50
(`WORK_PAGE_SIZE`, line 17). `parseWorkView` (line 27) falls back to `today` for
anything else, so an unknown `?view=` is silently normalised rather than refused.

| View | Predicate (`work-projection.ts:139-156`) | Order |
|---|---|---|
| `today` | `due_at is not null` **and** `due_at < start of next local day` **and** `status not in (completed, cancelled)` | `due_at asc, id asc` |
| `waiting` | `status = 'waiting'` | `updated_at desc, id asc` |
| `all` | `status <> 'cancelled'` | `updated_at desc, id asc` |

The local-day boundary is computed from `profiles.timezone` with a three-iteration
offset fixpoint (`localMidnightUtc`, lines 70-79), falling back to
`defaultAgentPreferences.timezone` when the stored value is not a resolvable IANA zone
(`validTimezone`, lines 33-41).

Relations are hydrated per page, never per user, by `loadTaskRelations`
(lines 203-294): four `in (taskIds)` reads over `task_projects`, `task_contexts`,
`task_people`, `task_dependencies`, then four label reads. The comment at lines
199-202 records that this is deliberately a two-step flat select rather than Supabase
embedded-resource syntax.

### 1.3 The row, and what it can do

`TaskList`/`TaskRow` (`src/features/operations/task-list.tsx`). A row is an
`<article class="list-row">` containing:

- the title as a `<Link>` to the detail route when the projection produced `open_task`
  (`task-list.tsx:102-107`);
- description, origin (`Sugerida pelo <agent>` / `Criada por você`);
- relation badges — projects, contexts, people, waiting-on people, parent, depends-on
  (lines 110-138);
- due date, planned date, priority badge, `Sem prazo` badge, human state badge
  (lines 140-152);
- `WorkItemActions` — the status buttons.

`availableActions` (`work-projection.ts:103-108`) is derived from status:

| Status | Actions offered |
|---|---|
| `completed` | `open_task`, `reopen_task` |
| `waiting` | `open_task`, `complete_task`, `resume_task` |
| anything else | `open_task`, `complete_task`, `wait_task` |

`WorkItemActions` filters to `WORK_SURFACE_ACTIONS` (`taxonomy.ts:489-494`), so
`open_task` addresses the row rather than the button strip.

### 1.4 The write path

`applyWorkItemAction` (`src/features/operations/actions.ts:287-393`) is the only write
the Work list can make. It:

1. resolves locale and copy, parses `workItemActionSchema` (lines 245-251:
   `taskId` uuid, `locale`, `action` ∈ `WORK_SURFACE_ACTIONS`, `title` bounded,
   `operationKey` uuid);
2. `requireUser(locale)`, reads `profiles.timezone`;
3. calls `applyWorkCommand`, which maps the surface verb through
   `WORK_ACTION_MAPPING` (`taxonomy.ts:525-533`) into a taxonomy action and applies it
   through `public.apply_task_command`;
4. renders a declared outcome — `applied`, `no_change`, `refused`, `failed` — with a
   localized heading, detail, `refreshable` and `retryable` flags, and an
   `announcement` for the live region (`settled`, lines 253-264).

**Nothing throws out of it** (`2F-SURFACE-011`): known precondition faults become the
honest "nothing changed" state and unknown errors re-throw
(`actions.ts:327-341`).

Field edits from the detail page go through `applyTaskDetailCommand`
(`src/features/task-commands/detail-actions.ts`), whose controls are derived from the
taxonomy by `detailControlsFor(status)` (`detail-controls.ts:121-128`) and whose values
are bounded by `buildDetailPatch` (lines 206-236). Both paths land on the **same**
`public.apply_task_command`; the detail route's own header comment says so explicitly
(`work/[taskId]/page.tsx:14-32`): *"Neither slice adds a write path."*

### 1.5 The domain authority that already exists

`src/features/task-commands/taxonomy.ts` is the executable form of PRD §11.2. It
declares:

- **8 statuses** (`TASK_STATUSES`, lines 16-25) pinned to `tasks_status_check`
  (`202607160003:111`); 6 non-terminal (`NON_TERMINAL_STATUSES`).
- **4 priorities** (`TASK_PRIORITIES`) pinned to `tasks_manual_priority_check`.
- **15 mutation actions** (`TASK_COMMAND_ACTIONS`, lines 44-60) plus one creation
  intent (`TASK_COMMAND_CREATE_ACTION`, line 179) that is deliberately not a
  sixteenth member.
- One `TaskCommandActionPolicy` per action (lines 322-442) carrying
  `eligibleFrom`, `allowedTargetValues`, `targetValueField`, `targetStatus`,
  `requiredPatchFields`, `allowedPatchFields`, `changedFields`, `destructive`,
  `oneStepEligible`, `requiresConfirmation`, `reversible`, `undoStrategy`.
- `TASK_COMMAND_POLICY_VERSION = "2026-08-05.1"` (line 132), a fingerprint input.
- `TASK_COMMAND_UNDO_WINDOW_HOURS = 24` (line 149), a *mirror* of
  `undo_operations.expires_at`'s default (`202607160003:153`), pinned by
  `policy-lock.test.ts`.

**Exactly one action is destructive**: `cancel_task`
(`taxonomy.ts:341-348`) — `destructive: true`, `oneStepEligible: false`,
`requiresConfirmation: true`. `restore_task` is `oneStepEligible: false` for symmetry
(lines 367-372). Every other action is non-destructive, one-step eligible and
reversible.

**There is no delete and no archive for a task.** A repository search for a task
delete path returns nothing: the taxonomy has no such verb, and cancellation plus the
`/app/work/cancelled` recovery surface is the product's terminal state.

### 1.6 Undo, as it actually ships

- Every apply writes an `undo_operations` row through `apply_task_command`; the three
  registered `action_type`s are named in `undo-listing.ts`
  (`apply_task_command`, `apply_task_command_relation`, `create_task_command`).
- `loadTaskCommandUndoOperation` reads the row first, so a client-supplied `undoId`
  that is not the caller's, not a Phase 2E operation, or already spent never reaches
  the router.
- **The only surface that renders an Undo control is the command console**
  (`command-console.tsx:433-440`). A grep for `undo` across
  `task-detail-controls.tsx`, `detail-actions.ts` and `detail-action-state.ts`
  returns **nothing**, and `work-item-actions.tsx` renders a heading, a detail, an
  optional title and a `refresh` button — no undo.

So: **the domain is undoable for 24 hours and the two surfaces a user actually
operates tasks from offer no way to use it.** The capability exists; the affordance
does not.

### 1.7 Concurrency and staleness

`apply_task_command` refuses on a twelve-column staleness gate, raising `55P03`
mapped to the declared `stale_pre_state` failure. `applyWorkItemAction`
(`actions.ts:390`) marks exactly `stale_pre_state` and `task_not_found` as
`refreshable`, which is the localized "reload" affordance that replaced the pre-2F
blind overwrite (`2F-SURFACE-005`).

Operation keys are minted **per (row, action) pair**, lazily, in a ref
(`work-item-actions.tsx:50-69`) — never in the render body, because
`useActionState`'s pending→settled transition re-renders and StrictMode double-renders.
A second submit under one key replays instead of writing twice; a key is rotated after
every terminal outcome (lines 79-84).

`task_command_confirmations` has **no `expires_at`, no TTL and no age check** —
ADR-047, re-measured and closed by `2K-AUDIT` slice 2K.0. Three fact-based refusals
replace a clock: `55P03`, `2E_CONFIRMATION_REQUIRED`, `2E_IDEMPOTENCY_MISMATCH`.

### 1.8 Telemetry that exists for Work today

`src/features/product-analytics/contracts.ts`:

| Event | Surface | Properties |
|---|---|---|
| `work_view_viewed` | `work` | `{workView: "today" \| "all" \| "waiting"}` (line 327) |
| `task_status_changed` | `work` | `{fromStatus, toStatus}` (line 328) |
| `task_command_applied` | `task_command` | `{commandOrigin: "chat" \| "work", outcomeCategory, applyRoute, replayed}` |
| `task_command_previewed` / `_disambiguated` / `_undone` | `task_command` | closed enums |

**The `workView` enum is enforced in the database.** `private.validate_product_event_properties`
carries `perform private.require_product_event_enum(p_properties, 'workView', array['today','all','waiting'])`
— present since `202607170024:224` and carried forward through
`202607210034:215`, `202607220038:1216`, `202607220044:1816`. **A fourth canonical
Work view that is reported to telemetry therefore costs a migration.** So does any
new event name: `product_events.event_name` is a CHECK constraint, and the
post-2J/post-2K corrections (`202608080087`, `202608090089`) exist precisely because
copies of that vocabulary drifted.

### 1.9 Accessibility, as proved and as unproved

- `.work-view-tabs a` and `.work-page .row-action` both declare `min-height:44px`
  (`operations.css:197`, `:202`); `.task-detail-actions .row-action` and
  `.task-control .row-action` likewise (`operations.css:21`, `:61`).
  `operations.css:203` gives the mobile breakpoint full-width row actions.
- `WorkItemActions` renders one polite `role="status"` live region with `aria-busy`
  (lines 98-105), focuses the outcome region after every round (lines 92-94), and
  gives that region `role="region"`, a label and `tabIndex={-1}`.
- `operations.css:199` declares `:focus-visible` outlines for the tabs and row
  actions.

**But the automated accessibility lane does not cover Work at all.**
`e2e/accessibility.spec.ts:384-395` lists ten surfaces — the command palette (closed
and open), global search, Library and six Conversar surfaces. Work, the task detail
and the cancelled-recovery surface are **absent**. The lane also renders **static HTML
fixtures** through `render(page, body())`, not the real routes, which is why Phase 2K's
report classes "hydrated interactivity in a browser" as *not executed*.

`e2e/work-actions.spec.ts` and `e2e/task-detail-commands.spec.ts` do exercise the real
authenticated surfaces at both viewports — but both **skip themselves without
`ONLINE_*` credentials** and are manual by design (`2F-PRECOND-003`).

### 1.10 Sensitivity on Work

`GOVERNED_SURFACES` (`src/features/sensitivity/contracts.ts:65-72`) is
`hoje, attention, capture_receipt, review_summary, notification, chat`.
**`work` is not a member.** The module's own header says so at lines 15-18:
*"global search excludes `highly_sensitive` by default (ADR-093), while Hoje, the
attention queue and the Work views applied no sensitivity predicate at all"* — and
only the first two were brought in by Phase 2J.

The structural fact underneath it: **`tasks` carries no sensitivity column.**
`database.types.ts:2472-2496` lists every column on `tasks`; there is no
classification field. A task derived from an entry carries `source_entry_id`
(line 2489), and the *entry* is classified. So masking a task on Work is not a
predicate this schema can apply today without a join, and "no mask" and "mask not
applied" look identical from outside — which is exactly the ambiguity Phase 2K's
suggestion slice insisted on writing down.

### 1.11 Copy and i18n

`WorkView` holds an inline `copy` record (`work-view.tsx:15-38`) — the typed shape the
repository's canonical mechanism prescribes, but declared in the component file rather
than a `copy.ts` module. `TaskList` is worse: it computes `const pt = locale === "pt-BR"`
(line 69) and renders **seven** locale ternaries inline (lines 71, 109, 124, 129, 134,
143, 146, 152). This is the locale-ternary population `locale-ternary-guard.test.ts`
holds under a ceiling; Work is one of its larger single-file contributors.

---

## 2. What is genuinely absent

Each line is a search that returned nothing, named so it can be falsified.

| Absent | Evidence of absence |
|---|---|
| **Any multi-select or bulk action in Work** | Grep for `bulk`, `multi-select`, `selectedIds`, `checkbox` across `src/` returns no hit in `operations/`, `daily-cycle/work-*` or `task-commands/`. `type="checkbox"` appears in nine files, none of them a Work list. |
| **Any filter control in Work** | `WorkView` renders a view tab strip, the command console, the list, a recovery link and pagination. No filter form, no query parameter other than `view` and `page`. |
| **Any sort or grouping control** | Order is fixed per view in SQL (`work-projection.ts:139-156`). No `?sort=`, no `?group=`. |
| **Any search within Work** | `search` is a separate destination; `WorkView` mounts no search input. |
| **Saved views / saved filters** | No table, no column, no preference key. `agent_preferences` carries model routing, not view state. |
| **Kanban, timeline, density control** | Parent PRD slice 4.3 asks for these; nothing in `src/` renders a board, a timeline or a density toggle for tasks. |
| **Inline title edit in the list** | `rename_task` is reachable only from the detail page's `TaskDetailControls` or by typing a sentence into the console. |
| **An undo affordance on Work or on task detail** | §1.6. |
| **A side panel on wide screens** | The detail is a full route at both viewports; `operations.css:69` only stacks the header and fields below 600px. |
| **Swipe or any gesture** | No touch/pointer handler anywhere in `operations/` or `daily-cycle/work-*`. |
| **Sensitivity masking on Work** | §1.10. |
| **Work in the automated accessibility lane** | §1.9. |

---

## 3. Return-state continuity — the defect, precisely

`TaskDetailView`'s back link is hardcoded:

```
<Link className="back-link" href={`/${locale}/app/work`}>
```

— `src/features/daily-cycle/task-detail-view.tsx:113`.

`/app/work` with no query resolves through `parseWorkView(undefined)` to `today` and
`parsePage(undefined)` to page 1. So a user reading page 3 of `?view=all`, opening a
task and pressing the product's own Back control lands on **page 1 of Today**. The
browser's history back button does preserve the URL; the product's affordance does not.

This is the Work-side instance of exactly the class Phase 2K closed for Conversar
(`2K-CONT-*`): *opening a referenced object destroys your place*. Phase 2K's answer
was a strict identifier-only payload re-derived server-side with a new clock
(ADR-100). Work's version is simpler — the position is already in the URL and needs
only to be carried — and it must **not** grow into a stored per-user view state, which
would be a new table.

---

## 4. The existing bulk precedent, and why it is not yet a contract

`NeedsAttentionList` (`src/features/daily-cycle/needs-attention-list.tsx`) already
ships a bulk control (`2J-ATTN-010`). Its shape is instructive and its limits are the
work Phase 2L would have to do:

**What it gets right.**
- Bulk is offered *only* where items are semantically equivalent and independently
  safe: same reason, same action, no per-item decision, each already idempotent
  (lines 148-159). `retry_processing` is the only qualifying set; the audit of the
  other four reasons is written into the module (lines 27-42).
- It is offered only when there is more than one item (line 248) — "a bulk control
  over a single item is a second button for the button beside it".
- It calls the **same** per-item Server Action the single control calls
  (lines 185-200). There is no generic executor and no second write path; the action
  is injected as a prop with a structural type (lines 44-53) precisely so a new write
  path would have to be written somewhere visible.
- Telemetry distinguishes `retry` from `bulk_retry` (line 182) through a closed enum
  (`contracts.ts:95`).

**What it does not do, and what Phase 2L would need.**
- **It stops at the first failure** (`break`, line 197) and shows one generic
  sentence. The user is not told *which* items applied and which did not — the
  `succeeded` array exists but never reaches the screen as a per-item result.
- There is **no preview**: the set is whatever the filter currently shows.
- There is **no confirmation**, correct for retry (idempotent, non-destructive) and
  wrong for anything that changes state.
- There is **no selection model** — the "set" is derived, not chosen.
- Loop-and-break gives **no partial-result truth**, which is the exact property the
  parent PRD slice 4.2 asks for.

**The structural constraint on any bulk design.**
`public.apply_task_command` takes one `p_task_id`
(`202607260058:363-371`, re-created at `202607260059:513` and `202607270060:377`).
PostgreSQL cannot extend an argument list with `create or replace` — ADR-057 records
this repository learning it the expensive way — so a *set-valued* RPC is a new
function, i.e. a migration. **Iterating the existing single-item authority costs
nothing and reuses every guarantee** (eligibility, fingerprint, staleness gate, audit
row, undo row, reminder reconciliation). That is the same trade `2J-ATTN-010` already
took.

---

## 5. Reconciliation against the roadmap's candidate slices

`PHASE_2K_2O_ROADMAP_DESIGN.md` §4 proposes six slices. Classified against §§1-4:

| Roadmap item | Classification | Evidence |
|---|---|---|
| 2L.0 — audit all task states, commands, permissions, projections, filters, destructive actions, bulk feasibility, mobile | **recommended, and this document is most of it** | §§1-4 |
| 2L.1 — edit title and supported properties without abandoning the list | **absent in the list; present on the detail route** | §1.4, §2 |
| 2L.1 — side panel on wide screens, full-screen detail on mobile | **absent** — one full route at both viewports | §2 |
| 2L.1 — immediate truthful feedback | **present** — declared outcomes, live region, focus move | §1.4, §1.9 |
| 2L.1 — bounded undo | **domain present, affordance absent** | §1.6 |
| 2L.2 — multi-select, preview, confirmation, partial success, per-item refusal | **absent**, with one adjacent precedent that lacks preview, confirmation, selection and partial-result truth | §2, §4 |
| 2L.2 — "only where existing domain authority permits" | **already enforceable without new authority** — `detailControlFor` derives shape and bounds from the policy | §1.4, §1.5 |
| 2L.3 — views for today, upcoming, waiting, projects, contexts, completed/cancelled | **partial**: today, waiting, all exist; cancelled exists as a nested recovery route; upcoming, projects, contexts and completed do not | §1.2, §1.1 |
| 2L.3 — preserve filters and return position | **absent, and actively wrong** | §3 |
| 2L.3 — "without inventing hidden task state" | **compatible** — the position is already in the URL | §3 |
| 2L.4 — thumb-reachable actions, compact controls, safe gestures, stable selection, no hover dependency | **partial**: 44px targets and a mobile breakpoint exist; hover styling is scoped to `a.list-row` which Work does not render as a link; gestures and selection do not exist | §1.9, §2 |
| 2L.5 — authenticated desktop/mobile journeys | **partial** — two real specs exist and are manual | §1.9 |
| 2L.5 — keyboard and focus coverage | **partial** — asserted in components, never scanned for Work | §1.9 |
| 2L.5 — traceability and residuals | **recommended** | — |

### 5.1 Parent-PRD items that this audit removes or narrows

| Parent PRD (Etapa 4) | Recommendation | Reason |
|---|---|---|
| Slice 4.3 — **kanban** | **Reject for 2L** | A board is a second projection of the same rows with drag as its primary verb; drag is the least accessible interaction in the product and would need a keyboard equivalent, a touch equivalent and a reorder persistence model (`dynamic_priority` is computed, not user-ordered). It is a phase, not a slice. |
| Slice 4.3 — **timeline** | **Reject for 2L** | The PRD itself hedges ("apenas onde datas suficientes existirem"), and the calendar surface is Phase 2M's subject. Two date surfaces designed one phase apart will disagree. |
| Slice 4.3 — **saved filters** | **Narrow to URL-expressible state** | Persisted saved views need a table, an RLS policy, a retention class and a deletion-cascade entry. The parent PRD's actual need — "come back to the same list" — is met by the URL plus the return-continuity fix in §3, at zero schema cost. |
| Slice 4.3 — **adjustable density** | **Defer** | A preference with no home; `agent_preferences` is model routing. A third rendering mode multiplies the accessibility matrix by three for a cosmetic gain. |
| Slice 4.1 — "ações rápidas por estado" | **Already delivered** | `availableActions` + `detailControlsFor` derive exactly this from the taxonomy. |

### 5.2 What the roadmap did not anticipate

1. **Work is the last ungoverned content surface for sensitivity** (§1.10), and it is
   the only one whose subject table has no classification column. This is a decision,
   not a task.
2. **The undo capability ships and is unreachable from Work** (§1.6). The roadmap
   lists "bounded undo" under 2L.1 as though it needed building; what it needs is an
   affordance.
3. **The product's own Back control loses the user's place** (§3). The roadmap phrases
   this as "preserve filters"; the defect is narrower, sharper and cheaper.
4. **Any new *reported* Work view costs a migration** (§1.8). The roadmap's view list
   is longer than the database's enum, and nobody had checked.
5. **Work is absent from the accessibility lane** (§1.9) while Conversar has ten
   entries in it. A phase whose subject is mobile operation cannot inherit that.

---

## 6. Inherited residuals — do they belong to Phase 2L?

### 6.1 Phase 2K's three partials

| Id | Remainder | Belongs to 2L? | Reason |
|---|---|---|---|
| `2K-AUDIT-002` | The prose a zero-source Conversar answer produces | **No** | Needs a credentialed OpenAI call and is a Conversar answer property. Nothing in Work composes an answer. It stays an independent residual awaiting an authorized credentialed environment. |
| `2K-EXPL-007` | An interpretation-correction domain — a record, a consumer, a surface | **No** | Its destination was written as "the roadmap successor's own audit", and this *is* that audit: the subject is *interpretation* correction, which lives on entries and interpretations, not on tasks. Correcting a task is already a first-class operation (`rename_task`, `append_note`, the twelve field verbs). Routing it into a task-operation phase would put an entries-domain record inside a Work slice. **Recommended destination: the phase that owns entries, memory and provenance** — Etapa 5 / Phase 2N in the roadmap's mapping. |
| `2K-A11Y-007` | A real-device mobile session | **Partly — as a named gate, not as a deliverable** | Phase 2L's whole point is mobile operation, so it must state the same limitation with the same honesty and must not report an emulated Pixel 7 as a phone. It carries the same standing as `G-2J.4b`. It cannot be *closed* by 2L without owner-run hardware. |

**None of the three is transported automatically.** Two leave Phase 2L entirely; the
third is inherited only as a stated limitation.

### 6.2 Other open residuals touching tasks

| Residual | Belongs to 2L? |
|---|---|
| Old task-command confirmation rows may persist as history (ADR-100, no owner) | **No.** It is a data-lifecycle question about an authorization-adjacent table, with no user-visible symptom. Naming it here would let a UX phase quietly acquire a retention decision. |
| `2E-COMMAND-012` (AI provenance) deferred behind ADR-057's unexecuted reopening gate | **No.** Explicitly deferred past 2F and not pulled into 2G/2H; nothing in 2L reopens it. |
| Relation references not editable from a conversation card (2K.2, OD-2K-1) | **Adjacent, and worth stating.** Work's detail page *does* edit relations, through `assign_project`/`assign_context`/`assign_person`/`set_waiting_on` with server-side name resolution. The card residual is about *card states for entity resolution*, not about the verbs. 2L should not claim to close it. |
| `2J-METRICS-001`/`005` undelivered for want of a third migration | **No.** They are capture/attention events. |
| G-2J.4b — voice on real devices | **No.** Voice is not a Work surface. |

---

## 7. Security posture of the surface as it stands

- **Ownership is RLS plus the authenticated query.** Every projection filters
  `.eq("user_id", options.userId)` *and* runs under forced RLS; `loadTaskRelations`
  filters relation tables by `user_id` as well as by `task_id`.
- **A foreign task 404s rather than 403s.** `work/[taskId]/page.tsx:46-48`:
  *"A task owned by someone else is indistinguishable from one that does not exist,
  which is the only answer that does not confirm its existence."*
- **The clicked id is authoritative, the rendered title is a hint.**
  `actions.ts:229-243` and `2F-SURFACE-004`; drift in the title does not by itself
  refuse, and the outcome renders the title the *resolution* returned.
- **No Work verb reaches `cancelled`.** `set_status`'s `allowedTargetValues` is
  `ACTIVE_ONLY` (`taxonomy.ts:333-340`), which closes structurally the route the
  deleted pre-2F `statusSchema` had left open (`2F-SURFACE-012`).
- **No service-role client on any product path** — `operator-surface-boundary.test.ts`
  walks `src/app` for the key and for an admin route.
- **Rate limiting** exists as `admitRateLimitedOperation` and is applied to AI
  operations; the Work verbs are not AI operations and are not admitted through it.

**No AI cost exists on the Work surface.** `applyWorkItemAction` and
`applyTaskDetailCommand` construct no provider, record no `ai_usage_events` row and
request no rate-limit slot. The **command console** is the AI path (natural-language
classification); the buttons and controls are not.

---

## 8. Measurements this audit did NOT make

Stated so the PRD cannot quietly promote any of them to evidence.

| Not measured | Why it matters |
|---|---|
| Any hosted probe of Work behaviour | The two `online-*`-class Work specs need credentials and are manual. Nothing in this audit was executed against the deployed project except `supabase migration list --linked` and the rollout-gate script. |
| Real-device mobile behaviour | Same standing as `2K-A11Y-007` and `G-2J.4b`. |
| A screen-reader session on Work | The lane does not simulate one and does not cover Work at all. |
| Hydrated interactivity in a browser for Work | The accessibility lane renders static fixtures; jsdom proves behaviour; neither is the third thing. |
| Row counts, list sizes or latency at any real corpus | No benchmark exists for Work; page size 50 is a constant, not a measurement. |
| Whether any user has ever used the `waiting` view | `work_view_viewed` ships and its consumer is the Phase 2J/2K funnel work; no reading was taken for this audit. |

---

## 9. Summary — the four sentences this audit exists to produce

1. **Work's domain layer is strong and its surface is thin.** Fifteen policied verbs,
   a fingerprinted TOCTOU gate, an audited undo with a 24-hour window and a
   confirmation contract all ship; the list exposes four buttons and a link, and the
   detail page exposes twelve controls with no undo.
2. **The three things the roadmap calls "build" are mostly "surface".** Quick edit
   reuses `apply_task_command`; bulk reuses it by iteration; undo reuses
   `undo_operation`. The only genuinely new *authority* anyone could be tempted to add
   is a set-valued RPC, and it is not needed.
3. **Two absences are not UX polish.** Work applies no sensitivity policy and is
   absent from the accessibility lane. A phase about operating tasks on a phone that
   left both alone would be closing on a narrower promise than it made.
4. **The cheapest high-value fix in the phase is a query string.** The product's own
   Back control discards the user's view and page.
