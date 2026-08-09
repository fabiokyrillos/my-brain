# Phase 2L — Step 2L.6 · successor re-audit, then stop

**This is not a slice.** It delivers no requirement, builds nothing, **creates no
successor artifact and declares no successor requirement.** It exists to report
what Phase 2L changed under the successor's feet, and then to stop.

**Nothing here authorizes anything.** The successor is not started, not scoped
and not planned by this document, and retargeting the A13 guard belongs to the
authorizing commit rather than to this one.

**Baseline for the audit:** `main` after slice 2L.5, hosted parity
`202608090089`, 89 migrations, public signup closed.

---

## 1. What Phase 2L changed that the roadmap did not anticipate

The master roadmap's successor task lists calendar, daily planning, review,
recurrence, timezone, notification consent/content/frequency, and the
task-versus-event distinction. Five things it assumes are now different.

### 1.1 The Work surface has contracts a calendar phase will want to reuse

Four of them, and none was in the roadmap's description of what 2L produces:

| Contract | Where | Why it matters to a calendar phase |
|---|---|---|
| **The URL is the state** | `work-query.ts`, `work-position.ts` | A calendar has a date range, a granularity and a selected day. The successor should carry them the same way, and the `.strict()` return payload already refuses every authorizing field by name |
| **Selection, preview and truthful partial results** | `selection.ts`, `bulk-preview.ts`, `bulk-result.ts` | "Reschedule these five" is the same shape as a bulk task edit, and the partial-result vocabulary already exists |
| **Derived sensitivity** | `sensitivity/task-derivation.ts` + `ProtectedContent` | A calendar renders task titles. Whatever it renders, it must render **through this**, or it recreates the divergence 2L.1 found on Hoje |
| **Undo where the operation happened** | `UndoAffordance` + `undoWorkOperation` | Rescheduling is reversible, and the affordance exists |

**A contract produced here does not authorize its consumer.** These are available;
using any of them is the successor's decision to take with the owner.

### 1.2 Hoje already renders classified task content

The finding from slice 2L.1: Hoje's priority list and its "for today" list are
fed by the *same* projection the Work list reads, so they already carry
`TaskSensitivity` and already mask through `ProtectedContent`.

**Consequence for a daily-planning phase:** any new surface that renders a task
title inherits an obligation, not a choice. The convergence guard will fail a
surface that renders task content without going through the contract — which is
the outcome the guard exists for, and worth knowing before the work is scoped
rather than after.

### 1.3 The Work event vocabulary is full, and the next event costs a migration

`2L-METRICS-005` closed **partial** for exactly this reason: selection and bulk
preview have no admitting event name, and Phase 2L had no migration to spend.

**Consequence:** a successor that wants to measure planning behaviour —
"how often is a plan rescheduled", "how often is a review completed" — will need
a migration for the vocabulary **before** the producers exist, not after.
Declaring the producers first is what cost `202608080087` and `202608090089`.

### 1.4 There is no gesture anywhere on Work, and a guard enforces it

OD-2L-5 signed option A, and `phase-2l-no-gesture-guard.test.ts` fires on a
handler added "in preparation".

**Consequence:** a calendar with drag-to-reschedule is a **decision the owner has
to take**, not a design detail. It would also need the user-ordering model the
kanban exclusion already named as missing. The guard is scoped to Work surfaces,
so it does not pre-decide a calendar — but it does mean "we'll add drag later"
cannot happen quietly.

### 1.5 `2L-MOBILE-008` and `2L-ACCESS-008` are open, and the successor's scope is worse

Both closed **partial** for want of owner-run hardware. The successor's declared
scope includes **notifications**, which cannot be verified at all in an emulated
viewport: permission prompts, delivery, lock-screen rendering and quiet hours are
platform behaviour.

**Consequence:** the roadmap already says the successor's package needs
"real-device gates where notifications or mobile platform behavior require them".
That is now a **hard** dependency rather than a preference, and it inherits two
open items rather than starting clean.

---

## 2. Which successor items are already built or baseline

| Roadmap item | State today | Note |
|---|---|---|
| Timezone semantics | **baseline** | Per-user timezone is resolved and used by the Work projection, the heartbeat and every date control; the ±730-day lexicon bound is enforced |
| Task-versus-event distinction | **not started** | `tasks` has `due_at` and `planned_at` and no event model at all |
| Recurrence | **not started, and refused by name** | `recurrence_requested` is a declared *refusal reason* in the taxonomy. Building it is a domain, not a slice |
| Daily planning | **partial** | `planned_at` exists and is editable; Hoje composes priorities; there is no planner surface |
| Review | **baseline** | Reviews exist with their own projection and surface; "review-to-act" is the gap |
| Notifications | **baseline, in-app only** | `notifications` rows render inside the authenticated app. **There is no push payload anywhere** — no service worker, no `PushManager`, no `showNotification`, asserted by `sensitivity-convergence.test.ts` |
| Calendar | **not started** | No calendar surface, no external-calendar boundary, no consent model for one |

**One correction the successor must not inherit uncorrected:** `notifications`
carries `task.title` and `reminder.title` in its body, and **none of `tasks`,
`reminders` or `notifications` has a sensitivity column**. Phase 2J recorded that
as a named limit. Phase 2L's derivation now makes a task's classification
*knowable* — so a notification surface that leaves the application's control
would have to consult it, and the existing `notificationCopy(locale)` takes no
content parameter precisely so it cannot carry one.

---

## 3. What conflicts with a signed decision

| Candidate | Conflict |
|---|---|
| A calendar *view* added to `workView` | **OD-2L-2 A.** The Work taxonomy is three views and every other destination is a filter. A calendar is a different surface, not a fourth Work view |
| Drag-to-reschedule on a Work surface | **OD-2L-5 A**, and the guard fires |
| A bulk reschedule that includes cancelling | **OD-2L-3 A.** `cancel_task` is excluded from bulk by being destructive |
| Storing a computed plan on the task | **OD-2L-1 B's shape.** Not the same decision, but the same principle the phase applied twice: re-read rather than copy |

None of these is refused *for the successor*. Each is a decision the owner would
have to take explicitly, and each would be visible as one.

---

## 4. Newly discovered decisions the successor will face

1. **Does a calendar render task content?** If yes, it inherits the sensitivity
   contract and the partial coverage that comes with OD-2L-1 B.
2. **Does the Work event vocabulary grow, and when?** The migration must precede
   the producers.
3. **Is a planned date a commitment or a suggestion?** `planned_at` exists and is
   editable; nothing today distinguishes "I intend to do this Tuesday" from "this
   is scheduled for Tuesday", and a planner surface has to.
4. **Does anything ever leave the application?** A push payload is the first
   thing in this product that would, and `notificationCopy` was built with no
   content parameter so that the decision has to be taken deliberately.
5. **Real-device verification: who runs it, and what blocks on it?** Two Phase 2L
   requirements are already waiting on this.

---

## 5. Inherited residuals, and whether they belong to the successor

| Residual | Belongs to the successor? |
|---|---|
| `2L-MOBILE-008`, `2L-ACCESS-008` — real device and screen reader | **Yes, by dependency.** Its own scope needs the same hardware |
| `2L-METRICS-005` — no selection/preview event | **Yes, if it wants planning telemetry**; the migration is the same one |
| `2L-CLOSE-004` — no live parity reading | **No.** It exists because this phase changed no schema; a phase that spends a migration has to read parity live anyway |
| `2L-BULK-011` — the recorded phrasing divergence | **No.** No behaviour is outstanding |
| `2K-AUDIT-002` — zero-source provider prose | **No.** A Conversar answer property; needs a credentialed provider call |
| `2K-EXPL-007` — interpretation correction | **No.** Its subject is entries and interpretations |
| `2E-COMMAND-012` — AI provenance on task commands | **No.** Still behind ADR-057's unexecuted reopening gate |
| Old task-command confirmation rows | **No.** A data-lifecycle question with no user-visible symptom and no owner |

---

## 6. Estimate, reported rather than smoothed

The roadmap's successor is **five slices plus a closing step**, the same shape
Phase 2L used. Phase 2L took six slices to deliver 82 requirements with zero
migrations, and the successor differs in two ways that both add time:

- **it needs at least one migration** (calendar or event model, and probably the
  telemetry vocabulary), which brings back G8, hosted parity verification and a
  deployment record — all of which Phase 2L legitimately skipped;
- **it needs real-device verification** for notifications, which is owner-run and
  therefore not schedulable by an implementer.

**No estimate in weeks is offered here.** Phase 2L's own estimate came from its
authorized planning package, and producing one for the successor would be
planning it.

---

## 7. Stop

**Work stops here.**

- No successor artifact was created. No `docs/initiatives/phase-2m/` directory,
  no PRD, no plan, no proposal.
- No successor requirement was declared, in any namespace.
- The A13 guard is **not** retargeted by this commit. That belongs to the
  authorizing decision's commit.
- ADR-055's **2026-10-27** expiry is restated as neither satisfied nor superseded.

**What the owner is being asked for:** authorization to plan — and nothing else.
