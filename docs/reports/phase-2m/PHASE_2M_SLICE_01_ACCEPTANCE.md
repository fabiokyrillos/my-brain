# Phase 2M — Slice 2M.1 acceptance record

**The calendar, in three parts, and this record covers all three.** Part 1 created migration 1 (PR #168, merge `6ca0314`); part 2 shipped the surface at `/app/calendar` (PR #170, merge `054da4d`); part 3 — this change — adds rescheduling from the calendar, the return-continuity half of `2M-CAL-008`, and the browser journeys.

**Migration budget: `2 allocated · 1 spent`, non-transferable, unchanged by part 3.** Part 3 creates no migration, no RPC, no Server Action, no table and no column. Hosted parity stays `202608110090` across 90 migrations. Signup closed; the rollout gate untouched.

---

## 1. What part 3 adds, and the one sentence that describes it

**A calendar item can be rescheduled without leaving the calendar, through the command path that already existed.** Nothing about that path is new: `applyTaskDetailCommand` → `list_task_command_candidates` → `apply_task_command`, with the operation key, the request fingerprint, the twelve-column staleness gate, the server-issued confirmation, the audit row and the registered undo all inherited rather than reimplemented.

Four files carry the work, and three of them are small on purpose:

| File | What it is |
|---|---|
| `src/features/calendar/calendar-scheduling.ts` | Which verbs the calendar may offer, **derived** from `actionPolicy(...).changedFields` |
| `src/features/calendar/calendar-reschedule.tsx` | A `<details>` frame mounting `TaskDetailControls` — no client, no RPC, no Server Action |
| `src/features/calendar/calendar-position.ts` | The return position, on Phase 2L's mechanism with the calendar's own vocabulary |
| `src/features/daily-cycle/task-return.ts` | One `from`, two vocabularies, one decision — extracted so it is testable |

---

## 2. The three decisions inside it

### 2.1 The verb subset is derived, and a list would have been the defect

The obvious implementation is `["reschedule_due", "clear_due", "set_planned"]`. That list is a **second copy of taxonomy knowledge**, which is the shape `202608080087` and `202608090089` were both written to delete, one layer down.

So a scheduling action is one whose policy's `changedFields` touch `due_at` or `planned_at`. Nothing in `src/features/calendar/` names a verb, and `calendar-reschedule.test.tsx` asserts that by reading its own source.

**`reminders` is deliberately not in that field list**, and the test says why: `reschedule_due` declares it as a linked effect, and so do `complete_task`, `reopen_task` and `cancel_task` — a field list including it would put *complete* and *cancel* on the calendar as rescheduling controls.

**Two consequences worth stating.** `clear_planned` will appear here the day slice 2M.2 adds it, without a line changing. And a verb that stops touching a date stops appearing, which a list would not do.

### 2.2 The projection carries the answer, never the status

`CalendarItemView.reschedule` is `{ taskId, controls }` or `null`. It is deliberately **not** `status: string`.

Sending the status would mean the client decides which verbs to offer, in a place that cannot re-check the decision — the second authority `2M-CAL-009` forbids, and `humanState`'s lossiness on Work is the same lesson one surface over. `calendar-projection.test.ts` asserts the item carries no `status` key at all.

### 2.3 The return position is Phase 2L's mechanism, not Phase 2L's data shape

`2M-CAL-008` requires *"the return-continuity contract Phase 2L shipped rather than a second one"*. That contract is a **mechanism** with four properties — in the URL and nowhere else, versioned and `.strict()`, refusing by name rather than ignoring, failing to the declared default — and all four are reused, including `POSITION_FORBIDDEN_FIELDS` itself rather than a copy of it.

What is not reused is `WorkPosition`'s field list. A calendar position is not a Work query, and widening `positionSchema` to carry an orientation and an anchor would put calendar state inside the payload that describes a Work list. **Two vocabularies under one mechanism is the honest shape; one vocabulary describing two surfaces is not.**

One `from` parameter serves both, discriminated by each payload's version literal. The calendar is asked first and answers `null` rather than a default — so a Work return can never become a calendar return pointing at today, and anything unparseable lands on the pre-existing Work default rather than on an error page.

---

## 3. What part 3 deliberately does **not** do

- **It cannot clear a planned day.** `clear_planned` does not exist in the taxonomy, so the derivation finds nothing and the surface offers nothing. Inventing the verb here would be a second authority for a write path. **Destination: `2M-PLAN-002`, slice 2M.2**, and `calendar-scheduling.test.ts` asserts the absence with that destination named, so the day it is added this line fails and whoever adds it has to notice the calendar starts offering it.
- **It offers no destructive verb.** `cancel_task` changes no date, so the derivation excludes it — which makes the calendar's destructive surface **empty by construction** rather than by care. Asserted on the rendered intents: every one is `apply`, never `request_cancel`.
- **It adds no telemetry event.** `day_planned` belongs to slice 2M.2 in migration 1's own declaration table; a reschedule reports through `task_command_applied`, which is deployed. Declaring a producer for an event this slice does not own would be the producer-without-a-consumer shape twice over.
- **It changes no navigation.** The calendar stays in the `more` overflow. `2I-SHELL-001` pins the four primary destinations, and promotion is an open owner question in `docs/TODO.md`.

---

## 4. Masking withholds the words, not the ability to move a date

The reschedule controls render **beside** `ProtectedContent`, not inside it. A user who can see that something is due on Thursday and cannot read what it is may still push it to Friday, and the controls disclose nothing — a task id the caller already owns and a date the caller is choosing.

Hiding them behind the reveal would make a privacy setting into a **capability gate**, which is not what `2M-PRIVACY-001` asks for. Proved in both directions: a `highly_sensitive` item's title is absent from the DOM while its disclosure is present, and the title never reaches the DOM through the controls' own path.

---

## 5. Gates, as executed

| Gate | Result |
|---|---|
| `npm run lint` | **zero errors** |
| `npm run typecheck` | **zero errors** |
| `npm test` | **5492 passed** · 0 failing tests. 3 files fail to **load** on Windows — the known shebang baseline, green in CI |
| `npm run build` | green |
| `git diff --check` | clean |
| `npx playwright test e2e/calendar.spec.ts --project=desktop --project=mobile` | **42 passed**, both locales, both projects |
| Calendar unit and component suites | 108 passed across 7 files |

### The two defects the guards found before CI did

1. **`calendar-mirror-guard.test.ts` fired twice on its first run**, which is what it is for: the browser lane did not name `calendar-item-elapsed`, and its "what this cannot prove" sentence had been line-wrapped so the regex missed it. Both fixed; the lane now covers the elapsed state as its own journey.
2. **The tab-order journey encoded a control count.** It tabbed a fixed four times and asserted a button was reached, which failed on both projects because the number of stops depends on how many controls the taxonomy admits. Rewritten to assert the **property** — the picker is reached, a submit is reached, the picker comes first, and focus never starts on the body — with the actual focus trail in the failure message.

---

## 6. What is proved, and what is not — do not round this up

**Proved in a real browser, desktop and Pixel 7, both locales (`e2e/calendar.spec.ts`, 42 passed):** rendered structure; lane and commitment carried in text rather than in colour; an empty day distinguishable from a failed one; a reminder stating it has no task dates rather than showing nothing; an elapsed item still reschedulable; a masked item withholding its title and keeping its controls; the disclosure opening and closing by keyboard with a visible focus ring; tab order through the controls; no horizontal page scroll at 320, 375 and 412 px; every control at least 24 px from paint; reflow at an emulated 200% zoom.

**Written and NOT executed:** `e2e/online-calendar.spec.ts` — the applied reschedule, the audit row, the undo, the staleness refusal, the return to the exact position and the cancelled-task case. It needs the **deployment carrying this slice**, and part 3 is not deployed at this commit. It is not skipped-and-forgotten: it skips itself without `ONLINE_SUPABASE_*`, exactly as the other twenty-eight online specs do, and its destination is the first online run after this merges and Vercel redeploys.

**NOT proved anywhere, and never inferred:** a real screen reader; a real phone. `2M-ACCESS-007` and the OD-2M-5 hardware checkpoint are owner-run. **An emulated viewport is a viewport, not a device** — no touch digitiser, no on-screen keyboard, no real IME — and the browser lane says so in its own header, with the mirror guard asserting that the sentence is still there.

---

## 7. Requirements this slice claims

| Id | Class | Evidence |
|---|---|---|
| `2M-CAL-001` | **built** | `/app/calendar` at its own route, outside `/app/work`; `calendar-query.ts` can express no Work destination and `workViews` is untouched at three |
| `2M-CAL-002` | **built** | Five lanes over five existing sources, zero schema; `calendar-projection.test.ts` renders a deadline, an intention, a reminder, a review and a suggestion in one day |
| `2M-CAL-003` | **built** | Four commitment values derived from the lane, never a stored flag; the elapsed state carried in text and asserted in the browser lane |
| `2M-CAL-004` | **built** | Orientation, anchor and lane visibility are the URL; no cookie, preference or storage on the route, the view or the parser |
| `2M-CAL-005` | **built** | Fail-closed *narrower and nearer*: `day` by default, a malformed anchor to today, an unknown lane token dropped; per-parameter tests including the repeated-parameter case |
| `2M-CAL-006` | **built** | ±365 days declared once in `CALENDAR_BOUND_DAYS`; reaching it is a visible `role="status"` rather than an empty grid |
| `2M-CAL-007` | **built** | Three orientations; the mobile default recorded in the module with its reasoning; `withOrientation` preserves the anchor by construction |
| `2M-CAL-008` | **built** | `calendar-position.ts` on Phase 2L's mechanism with `POSITION_FORBIDDEN_FIELDS` imported rather than copied; `task-return.ts` decides; round-trip, refusal-by-name, malformed-day and never-throws cases all executed. The hosted return journey is written and not executed — see §6 |
| `2M-CAL-009` | **built** | `calendar-scheduling.ts` derives the subset from `changedFields`; no Server Action, RPC, table or column added; `direct-write-guard`'s `tasks` allowlist is still empty; the component asserts it names no verb, holds no client and calls no RPC |
| `2M-CAL-010` | **partial** | Confirmable, truthful result and undo **where the operation happened** are inherited from `TaskDetailControls` and asserted structurally; the destructive arm is unreachable by construction. **Remainder:** the applied result, the audit row and the undo observed against a real database, and the partial-result-over-many-items case, which has no subject until slice 2M.2's bulk reschedule exists. **Destination:** `e2e/online-calendar.spec.ts` on the first online run after deployment, and slice 2M.2 for the multi-item half |
| `2M-CAL-011` | **built** | Empty, partial and failed are three states; a lane that fails is named and the others render; a row whose instant will not parse fails its lane rather than disappearing |
| `2M-PRIVACY-001` | **built** | Every rendered task title goes through `ProtectedContent`; the mask withholds words and not controls, proved in both directions |
| `2M-PRIVACY-002` | **built** | One resolver dispatch for the `calendar` surface, asserted by the sensitivity-convergence census |
| `2M-PRIVACY-003` | **built** | Removed, foreign and unreadable are one branch — absence from an owner-scoped map — resolving to the most protective level |
| `2M-PRIVACY-004` | **built** | Nothing persisted: no column, no backfill, re-read on every load, and the route is uncached |
| `2M-PRIVACY-005` | **built** | Reminder sensitivity derived through `reminders.entry_id` by delegating to the task path, so the three outcomes are identical by construction |
| `2M-PRIVACY-006` | **built** | `itemCount` is computed over everything, masked or not, so a count can never be an oracle |
| `2M-TIME-001` | **built** | The single local-day contract from slice 2M.0 is the only boundary source; no fourth copy, guarded |
| `2M-TIME-002` | **built** | 23-, 24- and 25-hour days across both hemispheres, from slice 2M.0, consumed here unchanged |
| `2M-TIME-003` | **built** | The zone comes from `profiles` and is resolved inside the projection, so no caller can pass one; an unsupported zone is a caller error, never a silent default |
| `2M-MOBILE-001` | **built** | No horizontal page scroll at 320, 375 and 412 px, measured from paint with the disclosure open |
| `2M-MOBILE-002` | **built** | Every control ≥ 24 px measured from paint at 375 px; the destructive-adjacency clause is vacuous here because no destructive control renders |
| `2M-MOBILE-003` | **built** | The no-gesture guard names `calendar-reschedule.tsx`, its discovery assertion forces every calendar component into the list, and the browser lane proves no control is a bare div |
| `2M-MOBILE-004` | **built** | Every change is confirmed or undoable with the affordance where the action happened; structurally proved here, observationally in `online-calendar.spec.ts` |
| `2M-MOBILE-005` | **partial** | The **calendar** journeys run in the desktop and mobile projects in both locales — 42 passed. **Remainder:** the planner, review and notification-settings journeys, which have no surface yet. **Destination:** slices 2M.2, 2M.3 and 2M.4a, each adding its own |
| `2M-ACCESS-001` | **built** | Keyboard-only operation of navigation, orientation, lane visibility and the reschedule disclosure, executed in a browser |
| `2M-ACCESS-002` | **built** | A week is a `<table>`, a day and an agenda are lists, every day is labelled; asserted at both viewports |
| `2M-ACCESS-003` | **partial** | Focus is managed on open and close and never starts on the body, proved in the browser. **Remainder:** focus **restoration** after a settled round and after undo, which needs React running on an authenticated route. **Destination:** `e2e/online-calendar.spec.ts`, and it is the same limit `2J-ACCESS` recorded for hydrated interactivity |
| `2M-ACCESS-005` | **built** | Lane, commitment and elapsed are carried in visible text; colour is decoration on a distinction that already exists without it |
| `2M-ACCESS-006` | **partial** | The calendar has a browser lane with a mirror guard that re-derives every load-bearing class, attribute and copy string from component source on each run. **Remainder:** the lane runs in `npm run test:e2e` and is not yet wired into the CI accessibility job. **Destination:** slice 2M.5's closeout, with the planner and review lanes |

**No requirement outside this list is claimed, and none is deferred without a destination.**

---

## 8. Security posture

Unchanged. No RLS policy, grant, role, `SECURITY DEFINER` function, Auth setting or `config.toml` value moved. No service-role client reaches a product path — the two service-role uses in `online-calendar.spec.ts` are harness fixtures and are called out where they happen. `tasks` gains no direct writer: `direct-write-guard.test.ts` still holds its `tasks` allowlist **empty**, which is the invariant this slice existed to keep while adding a mutation surface.
