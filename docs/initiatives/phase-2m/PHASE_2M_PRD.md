# Phase 2M — Calendar, daily planning and notifications · PRD

**Status:** planning artifact. Authorized by **ADR-104** for **planning only**.
This document authorizes no implementation, no migration, no deploy, no
database change and no outbound delivery of any kind.

**Baseline:** `main` at `5e6174bb3f50da5f8560c5b7702642b0b1e83545`; 89
migrations; hosted parity `202608090089`, confirmed live and read-only on
2026-08-09; public signup closed; Phase 2L complete (82 declared, 82 classified:
73 built, 5 baseline, 3 partial, 1 not-built-by-rule, 0 undelivered; migration
budget 1 allocated · 0 spent).

**Evidence base:** `docs/reports/phase-2m/PHASE_2M_CURRENT_EXPERIENCE_AUDIT.md`.
Every claim of current state in this PRD is a reference to that document, which
carries the file and line.

---

## 1. Objective and user outcome

**For the user:** *"I can see what my days actually contain, decide what I will
do today, close the day honestly, and be told about the few things that matter —
on my phone, without the product ever telling my lock screen what I am working
on."*

Today the product can record a deadline, a planned day, a reminder and a review,
and it can notify inside the app. What it cannot do is show them **together on a
timeline**, act on the planned day at all, turn a review into an action, or let
a user govern what they are told and when.

### 1.1 The seven audit findings this PRD is written against

1. **`planned_at` is write-then-display.** It is stored, audited, editable by
   command and rendered on two surfaces, and **no predicate, filter, ordering,
   view or notification anywhere consults it** (audit §1.2). There is also no
   `clear_planned` counterpart to `clear_due` (§1.3).
2. **A service worker already exists and is registered in production**
   (`public/sw.js`, `layout.tsx:3,21`), caching static assets only. The Phase 2L
   re-audit's "no service worker" is corrected. The push-absence guard's scope
   excludes `public/` and non-`.ts` files, so it cannot see that file
   (audit §4.3).
3. **Five review/planning schedule preferences are inert.**
   `daily_review_time`, `weekly_review_day`, `weekly_review_time`,
   `planning_day`, `planning_time` are read by the settings surface and by
   nothing else; reviews are on-demand only and the surface says so
   (audit §5.2–§5.3).
4. **No event entity exists**, and the committed-versus-suggested distinction the
   parent PRD's slice 4.4 asks for is **already representable** from five
   existing sources (audit §6, §6.1).
5. **Reminder sensitivity is derivable and nobody has derived it.**
   `reminders.entry_id` is the same relationship `task-derivation.ts` consumes
   for tasks (audit §7.3).
6. **Telemetry has five enforcement points, and they are now enumerable by
   name** (audit §8). The writer holds no vocabulary copy; the migration must
   still precede every producer.
7. **Two local-day implementations exist** — TypeScript `localDayBounds` and
   PL/pgSQL inside `run_user_heartbeat` — and `localDayBounds` returns
   `start + 24h`, which is not a DST-transition day's true end (audit §2.3–§2.4).

### 1.2 What this phase is deliberately not

- Not an external-calendar integration. No provider, no OAuth, no sync, in any
  direction. The phase boundary in `PHASE_2K_2O_ROADMAP_DESIGN.md` §5 already
  says integrations remain backlog unless a separate owner decision authorizes
  them; this PRD does not request one.
- Not a recurrence engine (§10, OD-2M-7).
- Not an automatic scheduler. Nothing may move a user's task, plan or day
  without a confirmed operation.
- Not an event/appointment domain (§10, OD-2M-3).

---

## 2. Inherited decisions this phase may not reopen

| Decision | Effect on Phase 2M |
|---|---|
| **OD-2L-1 option B** — task sensitivity is derived from the source entry, consulted at presentation, never persisted | Every new surface rendering a task title inherits it. `undetermined` carries no level. |
| **OD-2L-2 option A** — Work is exactly three views; every other destination is a filter | A calendar is a **separate surface**, never a fourth `workView`. |
| **OD-2L-3 option A** — destructive operations are excluded from bulk | A bulk reschedule may not include cancelling. |
| **OD-2L-4** — the selection ceiling is 50 | Any calendar multi-select inherits it. |
| **OD-2L-5 option A** — no gesture on any Work surface, including one added "in preparation" | Work is untouched by any gesture this phase might want. The calendar's own policy is OD-2M-6. |
| **ADR-090** — one complete green CI run | A flake is a defect. |
| **ADR-055** — expires **2026-10-27**, neither satisfied nor superseded, and **ADR-099 retired the semantic-retrieval widening from the active roadmap** | Restated, not acted on. Phase 2M neither satisfies nor renews it. |
| **ADR-057** — `2E-COMMAND-012` sits behind an unexecuted reopening gate | Not this phase's. |
| **`notificationCopy(locale)` takes one parameter** | A payload that leaves the application may carry **no content**. |

---

## 3. Scope

### 3.1 In scope

1. A **calendar surface** over data that already exists: deadlines, intentions,
   reminders, reviews and unconfirmed extracted dates — day, week and agenda
   orientations, mobile-first, with the URL carrying the complete view state.
2. **Giving `planned_at` a meaning**: read-side semantics, a `clear_planned`
   counterpart, and a daily planner that makes overload and conflict visible
   without ever moving anything by itself.
3. **Review-to-action**: turning a review's conclusions into confirmed domain
   operations, and resolving the inert schedule preferences honestly.
4. **Notification governance**: an explicit consent model, per-type and
   frequency controls, quiet-hours behaviour the user can see and change, and a
   content policy that is enforced by the payload having nowhere to put content.
5. **Timezone and DST correctness** as a first-class, tested property across
   both implementations.
6. Accessibility, mobile behaviour, content-free telemetry, real-device
   verification and closeout.

### 3.2 Out of scope, with reasons

| Out | Reason |
|---|---|
| External calendar providers | Roadmap boundary; needs its own owner authorization. Not requested. |
| Recurrence / repeating schedules | A domain, not a slice (§10 OD-2M-7). The product already refuses it deterministically via `recurrence_requested`. |
| An `events`/appointments entity | §10 OD-2M-3. Nothing slice 4.4 asks for requires it. |
| Automatic rescheduling or plan generation by AI | Nothing may move a user's work without confirmation; and an AI-generated plan is a provider call whose cost, consent and provenance are a separate decision. |
| Email delivery | No product-owned email path exists; adding one is a second egress boundary. |
| Kanban / user ordering | Named as missing by Phase 2L; still missing; not needed here. |
| Opening public signup | Independent fail-closed track. Untouched. |

### 3.3 Boundary with 2N–2O

Phase 2M produces the calendar, planning, review-action and notification-consent
contracts. It does **not** consume or produce person/project/memory context
beyond the links tasks already carry. Anything about *what the Brain knows* is
2N's.

---

## 4. Requirement families

**Phase 2M declares 94 requirements across thirteen families.** The count is
declared here and must be **regenerated from these declarations** by the
traceability generator, never typed into a report.

| Family | Subject | Slice |
|---|---|---|
| `2M-AUDIT` | evidence foundation, signed decisions, guards | 2M.0 |
| `2M-CAL` | the calendar surface | 2M.1 |
| `2M-PLAN` | `planned_at` semantics and the daily planner | 2M.2 |
| `2M-REVIEW` | reviews, closure and the inert preferences | 2M.3 |
| `2M-NOTIFY` | notification consent, content, frequency, delivery | 2M.4 |
| `2M-TIME` | timezone, day boundaries, DST | cross-cutting, closed 2M.5 |
| `2M-RECUR` | recurrence, as a governed exclusion | 2M.0, closed 2M.5 |
| `2M-PRIVACY` | sensitivity across every new surface | cross-cutting |
| `2M-MOBILE` | mobile interaction | 2M.1–2M.4, closed 2M.5 |
| `2M-ACCESS` | accessibility | per slice, closed 2M.5 |
| `2M-METRICS` | content-free telemetry | 2M.5 |
| `2M-DEVICE` | real-device verification | 2M.5 |
| `2M-CLOSE` | closeout | 2M.5 |

### 4.1 `2M-AUDIT` — evidence foundation and signed decisions (slice 2M.0)

- **2M-AUDIT-001:** Re-derive, at the implementation baseline, every read and write of `tasks.planned_at` in application code, SQL and worker code, and record any divergence from `PHASE_2M_CURRENT_EXPERIENCE_AUDIT.md` §1 before any product code is written. The absence of a read-side predicate must be re-proved by search, not carried forward on this document's authority.
- **2M-AUDIT-002:** Enumerate, by name, every enforcement point a new product event and a new product surface must pass, and record which of them a migration changes and which application code changes. A count is not the measurement; the names are.
- **2M-AUDIT-003:** Measure whether a reminder's sensitivity is derivable from `reminders.entry_id` using the existing `task-derivation.ts` mechanism without schema change, and present the result as the input to OD-2M-1 rather than as a chosen answer.
- **2M-AUDIT-004:** Measure both local-day implementations — the TypeScript `localDayBounds` and the PL/pgSQL boundary computation inside the heartbeat — against the same instants across a DST transition in at least one southern-hemisphere and one northern-hemisphere zone, and record every case where they disagree.
- **2M-AUDIT-005:** Record which of the five inert scheduling preferences the phase will give a consumer, which it will retire, and which it will leave inert with a stated reason. Leaving one inert without a stated reason is refused.
- **2M-AUDIT-006:** Record the exact scope of the existing push-absence assertion, prove it cannot see `public/sw.js`, and record the guard change required before any push work could begin — as a measurement, not as a change.
- **2M-AUDIT-007:** Record, before implementation, which Phase 2L residuals this phase inherits (`2L-MOBILE-008`, `2L-ACCESS-008`, `2L-METRICS-005`) and which it does not, with a destination for each that leaves this phase.
- **2M-AUDIT-008:** Publish the signed answers to OD-2M-1 … OD-2M-7 in the phase record before the slice each one gates begins, and fail the slice's gate if its decision is unsigned.

### 4.2 `2M-CAL` — the calendar surface (slice 2M.1)

- **2M-CAL-001:** A calendar surface exists at its own route, outside `/app/work`, and is not reachable as a `workView` value — the Work taxonomy stays exactly three views.
- **2M-CAL-002:** The calendar renders, as distinguishable lanes, the five sources that already exist: task deadlines (`due_at`), task intentions (`planned_at`), reminders (`remind_at`), reviews (`summaries` period ranges) and dates extracted from entries that the user has not confirmed.
- **2M-CAL-003:** A **committed** item and a **suggested** item are visually and programmatically distinguishable, and the distinction is derived from the item's existing state — never from a new stored flag.
- **2M-CAL-004:** The complete description of what a user is looking at — orientation, anchor date, lane visibility and any filter — is in the URL. No per-user calendar view state is stored.
- **2M-CAL-005:** An unknown, malformed, out-of-range or unauthorized calendar URL parameter resolves to the declared default and **never to a wider result set or a wider date range**.
- **2M-CAL-006:** Navigation range is explicitly bounded, the bound is declared once, and reaching it is a visible state rather than an empty grid.
- **2M-CAL-007:** Day, week and agenda orientations exist; the mobile default is chosen deliberately and recorded, and switching orientation preserves the anchor date.
- **2M-CAL-008:** Opening an item from the calendar opens the existing detail surface for that item and returns to the exact calendar position, using the return-continuity contract Phase 2L shipped rather than a second one.
- **2M-CAL-009:** Rescheduling from the calendar reuses the existing validated command path (`reschedule_due`, `set_planned` and their clears) — no Server Action, RPC, table or column is added for it, and a guard fails the build if a second task-mutation write path appears.
- **2M-CAL-010:** A calendar reschedule is confirmable, reports a truthful result including partial results when more than one item is affected, and offers undo **where the operation happened**, through `public.undo_operation`.
- **2M-CAL-011:** Empty, loading, error, offline and permission-denied states are defined for every orientation, and an empty day is distinguishable from a day that failed to load.

### 4.3 `2M-PLAN` — planned date semantics and the daily planner (slice 2M.2)

- **2M-PLAN-001:** `planned_at` has one declared meaning, stated in one module, and every surface that renders or edits it reads that declaration rather than restating it.
- **2M-PLAN-002:** A planned day can be **removed** through the same validated command path that sets it; the asymmetry with `clear_due` is closed.
- **2M-PLAN-003:** `planned_at` acquires read-side semantics: at minimum a filter and an ordering on the existing Work surface, expressed within the three-view taxonomy as filters rather than as a fourth view.
- **2M-PLAN-004:** A daily planner surface lets a user choose what they will do today from tasks and commitments that already exist. It creates nothing implicitly.
- **2M-PLAN-005:** The planner **never moves anything by itself.** Every change to a task is a confirmed operation through the existing command path, with the same audit row and the same undo.
- **2M-PLAN-006:** Overload is visible: the planner shows how much has been planned for a day relative to what the user has said is available, and shows it without inventing an estimate the user never gave.
- **2M-PLAN-007:** Conflicts are visible and named — two committed items at the same instant, an intention on a day whose deadline has passed, an intention in the past — and each is stated as a fact rather than as a correction the product has already applied.
- **2M-PLAN-008:** A conflict is never auto-resolved. Resolving one is an explicit, confirmed operation with a truthful result and an undo.
- **2M-PLAN-009:** Planning multiple items in one action reuses the Phase 2L selection, preview and partial-result contracts, including the ceiling of 50, and reuses the existing bulk eligibility rules rather than declaring new ones.
- **2M-PLAN-010:** Planning a task carries the same provenance every automatic action in this product carries: actor, source, reason, target, time and resulting state.

### 4.4 `2M-REVIEW` — reviews and closure (slice 2M.3)

- **2M-REVIEW-001:** A daily review flow exists that composes what the user's day actually contained from records that already exist, and states plainly what it could not read.
- **2M-REVIEW-002:** A next-day / forward-looking review flow exists that presents what is committed and what is intended for the following day, without proposing changes the user has not asked for.
- **2M-REVIEW-003:** A review conclusion becomes a domain change **only** through an explicit, typed, confirmed operation on the existing command path — carry-forward, reschedule, plan, archive or follow-up.
- **2M-REVIEW-004:** Nothing in a review flow writes a task, reminder, memory or plan without confirmation, and a guard fails the build if a review path acquires a direct write.
- **2M-REVIEW-005:** A review action reports a truthful result, including partial results, and is undoable wherever the underlying domain supports undo; where it is not undoable, it is confirmed explicitly as irreversible before it runs.
- **2M-REVIEW-006:** The five inert scheduling preferences reach a declared end state per **2M-AUDIT-005**: given a consumer, retired, or left inert with a stated reason. The settings surface never offers a control that changes nothing.
- **2M-REVIEW-007:** If any review becomes scheduled rather than on-demand, the surface copy that currently promises *"nothing runs from a configured schedule"* is corrected in the same change; if no review becomes scheduled, that copy is re-asserted by a test so it cannot drift.
- **2M-REVIEW-008:** Review content rendered on any new surface goes through the `review_summary` presentation contract, not around it.

### 4.5 `2M-NOTIFY` — notifications: consent, content, frequency, delivery (slice 2M.4)

- **2M-NOTIFY-001:** Notification behaviour is governed by an explicit, per-user consent record with a declared shape, a recorded time, and a revocation that takes effect without a further step.
- **2M-NOTIFY-002:** Nothing is delivered on any channel the user has not opted into. Absence of a consent record means **no delivery**, never a default-on.
- **2M-NOTIFY-003:** No permission of any kind is requested on first load, on sign-in, or from any surface the user did not navigate to for that purpose.
- **2M-NOTIFY-004:** The user can control notifications by **type**, by **frequency** and by **quiet period**, and every control the surface offers has a consumer that reads it.
- **2M-NOTIFY-005:** Quiet hours, the daily cap, the 24-hour per-item cooldown and deduplication continue to hold on every channel, and are proved on each channel rather than inherited by assumption from the in-app path.
- **2M-NOTIFY-006:** Any payload that leaves the application's control carries **no content**: no task title, no reminder title, no description, no person, no project, no entry text, no count that could identify an item. It carries `notificationCopy(locale)` and a destination, and nothing else.
- **2M-NOTIFY-007:** The content prohibition is enforced by construction — the payload type has nowhere to put content — and a guard fails the build if a content-carrying parameter is added to the payload or to `notificationCopy`.
- **2M-NOTIFY-008:** The existing in-app notification rows continue to be the surface where content is shown, behind authentication, and any change to what they carry is deliberate and recorded.
- **2M-NOTIFY-009:** Every delivery is auditable: what was sent, to which channel, why, when, and under which consent record — without recording the content, which there is none of.
- **2M-NOTIFY-010:** A revoked consent, an expired subscription and a delivery failure are each distinguishable states with defined behaviour, and none of them is retried indefinitely.
- **2M-NOTIFY-011:** If OD-2M-4 is not signed for outbound delivery, this family closes with the in-app half delivered and the outbound half classified **not-built-by-rule** against the unsigned decision — the phase still closes.

### 4.6 `2M-TIME` — timezone, day boundaries and DST (cross-cutting)

- **2M-TIME-001:** "The user's local day" has **one** declared definition that both the application and the database agree with, and the agreement is proved by a test that runs both against the same instants.
- **2M-TIME-002:** A local day's end is computed from the local calendar, not as `start + 24h`, so a 23-hour or 25-hour DST day is correct.
- **2M-TIME-003:** Every calendar, planner and review boundary is computed in the user's timezone as stored on `profiles`, never in the server's zone and never in the browser's, and a missing or invalid zone is a caller error rather than a silent default.
- **2M-TIME-004:** DST transitions are tested in both directions, in at least one southern-hemisphere and one northern-hemisphere zone, at the transition instant and at the instants either side of it.
- **2M-TIME-005:** A user changing their timezone produces a defined, tested result on every dated surface, and no stored value is silently rewritten by the change.
- **2M-TIME-006:** An instant rendered on two surfaces renders identically, and a test proves it for at least the calendar, the planner, the task detail and the notification list.
- **2M-TIME-007:** No date arithmetic anywhere in the phase's code uses a fixed offset, a fixed day length or the host's local zone; a guard names the surfaces this applies to.

### 4.7 `2M-RECUR` — recurrence, as a governed exclusion

- **2M-RECUR-001:** Recurrence is **out of scope by rule**. No series model, no occurrence model, no expander, no exception row and no repeat field ships in this phase.
- **2M-RECUR-002:** The existing deterministic refusal (`recurrence_requested`, with copy in both locales) remains correct and is re-asserted by a test, so the product's stated limit and its behaviour cannot diverge.
- **2M-RECUR-003:** A guard fails the build if a recurrence field, column, parameter or expander appears in this phase's surfaces, including one added "in preparation".
- **2M-RECUR-004:** The destination for recurrence is named explicitly in the closing record as a separately authorized initiative with its own decision, not as a deferred slice of this phase.

### 4.8 `2M-PRIVACY` — sensitive content on the new surfaces (cross-cutting)

- **2M-PRIVACY-001:** Every new surface that renders a task title derives sensitivity through the existing `task-derivation.ts` contract and renders through `ProtectedContent`; it is added to `GOVERNED_SURFACES` in the same change that ships its first consumer.
- **2M-PRIVACY-002:** A manual task with no source entry stays `undetermined` and is never artificially classified; absence of a source is never read as `normal`.
- **2M-PRIVACY-003:** A task whose source entry is absent from the owner-scoped map takes the most protective outcome, and no branch distinguishes "removed", "foreign" and "unreadable".
- **2M-PRIVACY-004:** No classification is persisted anywhere by this phase — not on `tasks`, not on `reminders`, not on `notifications`, not on any new row.
- **2M-PRIVACY-005:** Reminder titles rendered on any new surface are governed by the same derivation, via `reminders.entry_id`, or the surface does not render them; the choice is OD-2M-1's and is recorded either way.
- **2M-PRIVACY-006:** No refusal, empty state, count, aria label, error message or telemetry property on any new surface differs in a way that reveals the existence, classification or content of a record the reader may not see.

### 4.9 `2M-MOBILE` — mobile interaction

- **2M-MOBILE-001:** Every calendar, planner, review and notification-settings surface is usable one-handed at 375 px and at 412 px, in both locales, with no horizontal page scroll.
- **2M-MOBILE-002:** Every interactive target meets the declared minimum size, and controls that change or delete something are not adjacent to controls that navigate.
- **2M-MOBILE-003:** Gesture policy follows OD-2M-6. Whatever is signed, **every action reachable by a gesture is also reachable by a visible, labelled control and by the keyboard**, and a guard enforces the surfaces the decision names.
- **2M-MOBILE-004:** An accidental activation is recoverable: every gesture-initiated or touch-initiated change is confirmed or undoable, with the affordance where the action happened.
- **2M-MOBILE-005:** The mobile journeys for calendar, planner, review and notification settings run in the desktop and mobile Playwright projects in both locales.

### 4.10 `2M-ACCESS` — accessibility (executed per slice, closed in 2M.5)

- **2M-ACCESS-001:** Every new surface is fully operable by keyboard alone, including date navigation, orientation switching, item selection and every reschedule path.
- **2M-ACCESS-002:** The calendar's structure is conveyed programmatically — a grid is a grid, a day is labelled, an item's date and lane are available to assistive technology without relying on visual position.
- **2M-ACCESS-003:** Focus is managed on every open, close, confirm, undo and navigation, and never lost to the document body.
- **2M-ACCESS-004:** Every state change a sighted user perceives — result, partial result, conflict, empty, error — is announced.
- **2M-ACCESS-005:** Colour is never the only carrier of the committed-versus-suggested distinction, of a conflict, or of a lane.
- **2M-ACCESS-006:** Every new surface has an entry in the CI accessibility lane, or a mirror whose load-bearing attributes are re-derived from component source on every run.
- **2M-ACCESS-007:** A screen-reader session on real hardware covers the calendar, the planner and the notification settings; it is owner-run, and its result is recorded as executed or not executed, never as inferred.

### 4.11 `2M-METRICS` — content-free telemetry (slice 2M.5)

- **2M-METRICS-001:** The vocabulary migration lands **before** any producer exists, and a guard fails the build if a producer names an event the deployed vocabulary does not admit.
- **2M-METRICS-002:** The migration widens every enforcement point the audit enumerated in one change — the event-name CHECK, the property validator, and the surface CHECK if a new surface is declared — and its assertions prove that no pre-existing name or surface was lost.
- **2M-METRICS-003:** Every declared event has a **real consumer** before closeout: a reader that asks a question of it. An event nothing reads is not delivered.
- **2M-METRICS-004:** No event property can carry content. The property whitelist is the mechanism; there is no key that could hold a title, a description, a name, a date the user chose, or a free string.
- **2M-METRICS-005:** The measurements this phase records are stated as questions before any producer is written — how often a plan is made, how often a review produces an action, how often a notification is silenced — and an event that answers none of them is not created.
- **2M-METRICS-006:** If the migration is not spent, every requirement depending on it closes **not-built-by-rule** against the budget, with the destination named — never as a partial with an invented remainder.

### 4.12 `2M-DEVICE` — real-device verification (slice 2M.5)

- **2M-DEVICE-001:** The requirements that **cannot** be verified in an emulated viewport are named individually before implementation begins, and no other requirement claims real-device evidence.
- **2M-DEVICE-002:** For each, the phase records which **blocks its slice** and which **blocks closeout**, and the two lists are different.
- **2M-DEVICE-003:** A checklist exists for **iOS Safari** and for **Android Chrome**, naming the OS version, the browser, the exact steps and the expected observation for each item.
- **2M-DEVICE-004:** A real-device claim is recorded as **executed** with the device, date and observation, or as **not executed** — and an emulated run may never be recorded as satisfying one. A closeout that claims otherwise is refused.
- **2M-DEVICE-005:** The two inherited Phase 2L residuals (`2L-MOBILE-008`, `2L-ACCESS-008`) are executed in the same owner-run session or are re-stated as still open with their destination; they are not silently absorbed.

### 4.13 `2M-CLOSE` — closeout (slice 2M.5)

- **2M-CLOSE-001:** Every declared requirement is classified exactly once, from the slice records, by a generator — never typed into a report.
- **2M-CLOSE-002:** Every `partial` carries a real remainder and a destination; a remainder that says nothing is pending is refused, quoting the words that made it vacuous.
- **2M-CLOSE-003:** The migration budget is reconciled against the migrations actually present, and a migration outside the budget fails the close.
- **2M-CLOSE-004:** Hosted parity is read live and read-only at close, and the reading is recorded with its date; a parity claim that was not executed fails the close.
- **2M-CLOSE-005:** Every residual leaving this phase has a named destination, and no residual is closed by writing a document.
- **2M-CLOSE-006:** The successor is re-audited and **not started**: no successor artifact, no successor requirement, no successor ADR, and the phase-start guard is retargeted only by the successor's own authorizing commit.

---

## 5. UX contracts

### 5.1 Universal states

Every new surface defines, and the plan tests: **empty** (nothing on this day /
nothing planned / no notifications), **loading**, **error** (and it is
distinguishable from empty), **partial** (some lanes loaded, some did not),
**offline**, **permission-denied** and **at the navigation bound**.

### 5.2 Confirmation, partial success and undo

- Nothing changes without a typed, confirmed operation.
- A result that is partial says so, names what did not change and why, in the
  vocabulary Phase 2L already shipped.
- Undo lives **where the operation happened**, within the 24-hour window
  `undo_operations.expires_at` declares, through `public.undo_operation`.
- An irreversible operation is confirmed explicitly as irreversible **before** it
  runs.

### 5.3 Copy

All user-facing copy goes through a typed feature `copy.ts` module in the
`src/features/daily-cycle/copy.ts` shape. No scattered locale ternaries; the
locale-ternary guard applies. Notification payload copy is `notificationCopy` and
takes only the locale.

---

## 6. Cost, limits and security

- **No provider call is added by this phase.** Reviews already call the provider
  on demand and that path is unchanged; the planner proposes nothing that
  requires a model. If any slice would introduce a model call, it stops and asks.
- **No BYOK change.** No credential path is touched.
- Authorization stays in the backend: Server Actions, validated RPCs, RLS. No
  sensitive mutation becomes a plain client write.
- Any outbound channel is a **new trust boundary** and is treated as one: it is
  the first thing in this product that would leave the application's control.
- `service_role` is never used as a shortcut for a user-scoped read or write.

---

## 7. Migration budget

**Ceiling: 2. Obligation: 0.** A ceiling is not a licence to spend.

| # | Candidate | Condition | Contents |
|---|---|---|---|
| 1 | **Telemetry vocabulary** | required only if the phase declares any new product event or surface | the event-name CHECK, `private.validate_product_event_properties`, and the surface CHECK if a `calendar` surface is declared — **one migration, all points at once**, landing before any producer |
| 2 | **Notification consent and delivery** | required **only** if OD-2M-4 is signed for outbound delivery | consent record, channel subscription, delivery audit, RLS, grants — with its own decision, its own slice and its own security review |

If OD-2M-4 is not signed, **the ceiling is 1**. If the phase declares no new
event, **the ceiling is 0** and every dependent requirement closes
`not-built-by-rule` per **2M-METRICS-006**.

Everything else in this PRD is achievable with **zero schema change**, which is
the reason the calendar is specified over sources that already exist.

---

## 8. Definition of Ready

A slice may begin when: its gating decisions are signed and published; its
requirements are declared here; its tests are written first; its migration (if
any) is already applied and parity-verified **before** its producers exist; and
the preceding slice is merged with CI green on the exact merge SHA.

## 9. Definition of Done

Test-first for new behaviour; zero lint and type errors; unit and behavioural
tests; Playwright journeys desktop and mobile in both locales where copy or
locale is affected; migrations applied and linted where spent; production build
passes; `STATE.md`, `CHANGELOG.md`, `TODO.md` updated, `DECISIONS.md` for
architectural decisions; an acceptance record per slice; CI green on the exact
merge SHA; and — for anything platform-dependent — a real-device record that was
**executed**.

---

## 10. Open decisions — options, recommendation and impact

Each is **blocking** for the slice named. None is decided by this document.

### OD-2M-1 — What the calendar renders, and how it is protected · blocks 2M.1

| Option | What it means | Impact |
|---|---|---|
| **A** | The calendar renders **tasks and reminders**, both through derived sensitivity and `ProtectedContent` | Full coverage; requires extending derivation to reminders via `reminders.entry_id` — no schema, but a real change |
| **B** | The calendar renders **tasks only**, through derived sensitivity; reminders appear as unlabelled markers | Smaller change; a calendar with anonymous markers is materially less useful |
| **C** | The calendar renders titles directly, without derivation | **Refused.** It recreates the divergence slice 2L.1 found on Hoje, and the convergence guard fails it |

**Recommendation: A.** The audit found reminder sensitivity is derivable by the
same mechanism through `reminders.entry_id` and that nobody has derived it —
which means B would ship a surface that *could* have protected content and
chose not to. Under A: no title is rendered directly on any surface; manual
tasks stay `undetermined`; a source absent from the owner-scoped map is
fail-closed; and **nothing is persisted**. `calendar` joins `GOVERNED_SURFACES`
in the same change that ships its first consumer.

### OD-2M-2 — The migration and the event vocabulary · blocks 2M.5, gates 2M.1

**Recommendation:** one migration, spent **before** any producer, widening all
of the enforcement points the audit enumerated in a single change, with
assertions that prove nothing pre-existing was lost, and negative controls that
are **not vacuous** — the ordering defect `202608090089` recorded made a previous
phase's controls answer before the gate under test could. Decide explicitly
whether a `calendar` surface is declared (which adds the surface CHECK and
`productSurfaces`) or whether calendar events are attributed to an existing
surface. **Ceiling is proposed, not required**: if the phase declares no event
worth a consumer, the right answer is to spend nothing.

### OD-2M-3 — The semantics of `planned_at` · blocks 2M.1 and 2M.2

| Option | Meaning | Impact |
|---|---|---|
| **A** | `planned_at` is an **intention**: "I mean to work on this that day" | Zero schema. Gives the existing, already-audited, already-editable field the read-side semantics it has never had. Requires `clear_planned`. Does not model an appointment |
| **B** | `planned_at` is a **commitment**: a scheduled slot | Zero schema, but it **redefines a field users have already set** under the other meaning, silently reclassifying existing data. Also collides with `reminders`, which is already the committed-instant model |
| **C** | Keep `planned_at` as intention **and add a separate event/appointment entity** | A new domain: table, composite-FK ownership, RLS, grants, triggers, audit, undo handler, telemetry, conflict rules, and an interaction with recurrence. Not one migration and not one slice |

**Recommendation: A, with C explicitly deferred and its trigger named.**

The audit changes the premise the initial recommendation of C rested on. The
parent PRD's slice 4.4 asks for *"distinção visual entre compromisso confirmado
e sugestão"* — a **committed-versus-suggested** distinction, not a
task-versus-event entity split. That distinction is **already representable**
from five existing sources (audit §6.1): `reminders.remind_at` is a commitment,
`tasks.due_at` is a deadline, `tasks.planned_at` is an intention, `summaries`
are records of a period, and unconfirmed extracted dates are suggestions. So a
calendar does **not** need a new entity to be honest about commitment.

Option C would also make the phase hard to close: an appointment entity that
cannot repeat is an appointment entity users will immediately ask to repeat,
which pulls OD-2M-7 back in. **The named trigger for C:** when the product needs
an item that is neither a task nor a reminder — something with a duration, other
participants, or a location. Nothing in this phase's scope needs one.

Under A, B is **refused with a reason**: reclassifying data users already
entered, without asking them, is exactly the silent-move this phase forbids
everywhere else.

### OD-2M-4 — Whether anything leaves the application · blocks 2M.4

| Option | Impact |
|---|---|
| **A — no outbound delivery this phase** | Zero egress, zero new migration, zero real-device blocker for delivery. Notification *governance* (consent shape, per-type and frequency controls, quiet hours, content policy, audit) still ships and is provable in CI. The phase closes on schedule |
| **B — push, opt-in, content-free payload** | The first outbound egress in this product. Needs: a consent and subscription model (migration 2), VAPID secrets, a sender, a `push` handler added to the **already-registered** `public/sw.js`, permission UX, revocation, quiet-hours enforcement at send time, and delivery audit. **Blocks closeout on real hardware** |
| **C — push with governed content** | **Refused.** `notificationCopy` takes no content parameter by construction, and `omit` exists precisely because a payload leaves the application's control |
| **D — email** | No product-owned email path exists. A second egress boundary for no gain this phase |

**Recommendation: A for the phase body, with B available as a separately signed,
conditional slice.**

If the owner signs B, it is its own slice with its own migration, its own
security review and its own real-device gate, and **2M-NOTIFY-011** already
declares how the family closes if B is not signed — the outbound half classifies
`not-built-by-rule` against the unsigned decision and the phase still closes.
Under either answer the payload rules stand: explicit opt-in; no permission on
first load; generic content-free payload; quiet hours and frequency
configurable; revocation in one step.

**One correction the decision must be taken against:** the Phase 2L re-audit's
"no service worker" is wrong. `public/sw.js` exists and is registered in
production. B is therefore not a greenfield addition — it modifies a worker
already installed on every production client, which is a stale-worker and
update-ordering problem before it is a delivery problem.

### OD-2M-5 — Real-device verification: who runs it, and what blocks · blocks closeout

**Recommendation:** the phase declares **before implementation** which
requirements are hardware-dependent; splits them into *blocks-its-slice* and
*blocks-closeout*; publishes an iOS Safari and an Android Chrome checklist with
OS and browser versions, steps and expected observations; and records each claim
as **executed** (device, date, observation) or **not executed**. An emulated run
may never satisfy one, and the traceability contract refuses a close that claims
otherwise. The two inherited Phase 2L residuals are run in the same session or
re-stated as open.

**The owner runs these.** An implementer cannot schedule owner hardware, so any
plan that assumes otherwise is wrong on its first day.

### OD-2M-6 — Gesture policy on the calendar · blocks 2M.1

| Option | Impact |
|---|---|
| **A — visible controls only, no gesture** | Consistent with OD-2L-5 A one surface over. Keyboard and screen-reader parity for free. No accidental-touch class of defect. No second hardware-dependent verification |
| **B — drag as an accelerator of an action that is also a visible control** | The gesture is never the only path; still needs threshold tuning, a confirm/undo story, conflict feedback during the drag, and real-device verification on two platforms |
| **C — drag as the primary interaction** | **Refused.** It makes the primary path unreachable by keyboard and unusable by screen reader, and it collides with `2M-ACCESS-001` |

**Recommendation: A for Phase 2M, with B pre-specified so a later authorization
is cheap.**

Reasons, in order of weight: the phase already carries notifications and
real-device gates, and B adds a **second** hardware-dependent verification to a
phase that must stay closable; reversing the signed no-gesture posture one phase
after signing it, on an adjacent surface, is the kind of inconsistency this
repository has paid for; and accidental activation on a dense mobile grid is a
defect class with no cheap test. **The condition under which B becomes right:**
when the visible reschedule control has shipped, been used, and been measured as
too slow — which is a fact this phase can produce and the next can act on.

Whatever is signed, **2M-MOBILE-003** stands: any gesture-reachable action is
also reachable by a visible labelled control and by the keyboard, and the
no-gesture guard is extended to name the calendar's files so a handler cannot
appear "in preparation".

### OD-2M-7 — Recurrence · blocks 2M.0

**Recommendation: explicit separation. Recurrence does not belong to Phase 2M.**

Evidence: the product already refuses it **deterministically and honestly** —
`recurrence_requested` is a declared refusal reason with copy in both locales and
an instruction in the extraction contract. Building it means a series model, an
occurrence model (materialized or virtual), an exception/override model,
edit-this-one versus edit-this-and-future, cancellation of one versus of the
series, DST-safe expansion, per-occurrence versus per-series undo, telemetry, and
an interaction with every bulk and calendar contract above. That is a domain
with its own PRD, not a slice.

Phase 2M therefore declares `2M-RECUR-001 … -004`: out of scope by rule, the
refusal re-asserted by a test, a guard against any recurrence field appearing
"in preparation", and a **named destination** — a separately authorized
recurrence initiative. If the owner instead wants recurrence in 2M, the phase
must be re-scoped, because it cannot carry calendar, planning, reviews,
notifications **and** a recurrence domain and still close.

### 10.1 Decisions that are **not** open

- Whether Work gains a calendar view — **no**, OD-2L-2 A.
- Whether a bulk operation may cancel — **no**, OD-2L-3 A.
- Whether Work gains a gesture — **no**, OD-2L-5 A and its guard.
- Whether a classification is persisted on a task — **no**, OD-2L-1 B.
- Whether public signup opens — **no**, and this phase does not touch it.

---

## 11. Residuals

### 11.1 Inherited, and where each goes

| Residual | Destination |
|---|---|
| `2L-MOBILE-008`, `2L-ACCESS-008` | **This phase**, by dependency — `2M-DEVICE-005` |
| `2L-METRICS-005` | **This phase, conditionally** — the same migration serves it if OD-2M-2 spends one; otherwise it stays open with its destination unchanged |
| `2K-AUDIT-002`, `2K-EXPL-007` | **Not this phase.** Conversar properties |
| `2E-COMMAND-012` | **Not this phase.** Behind ADR-057's unexecuted reopening gate |
| ADR-055's 2026-10-27 expiry | **Restated, not acted on.** Neither satisfied nor superseded by this phase |

### 11.2 Residuals this phase expects to create

- Whatever OD-2M-4 does not authorize.
- Recurrence, with its destination named by `2M-RECUR-004`.
- Any real-device claim recorded as **not executed**.

---

## 12. What this document does not authorize

No implementation. No migration. No deploy. No database, RLS, grant, policy,
Auth or signup change. No notification sent. No service-worker change. No
permission requested. No telemetry event created. No provider call. No BYOK use.
No rollout. No acceptance report, no final matrix, no closing report. No merge of
the planning PR. No start of the roadmap successor.
