# Phase 2M — `e2e/online-calendar.spec.ts`, executed

**Status:** executed and green — 12/12 (desktop + Pixel 7), 2026-08-11.
**Requirements closed by execution:** the remainder of `2M-CAL-010`, and the
authenticated half of `2M-ACCESS-003`.
**Migrations spent:** none. Budget stays `2 allocated · 1 spent`, non-transferable.
**Parity:** `202608110090`, unchanged.

This is the obligation slice 2M.1 left open and that `docs/TODO.md` recorded as
*"may not be closed by writing a document"*. It was not. The journey ran, failed
six ways, and each failure was diagnosed to its cause before anything was
changed. **Five of the six causes were in the probe. One was in the product, and
two more were found behind it.**

---

## 1. What ran

`npm run test:e2e:online -- e2e/online-calendar.spec.ts` against the hosted
project `ulvwzqlpsjyrnqzfxmck`, the app served from the repository's own build of
the branch, both Playwright projects:

| project | cases | result |
| --- | --- | --- |
| desktop | 6 | **6 passed** |
| mobile (Pixel 7) | 6 | **6 passed** |

The six: an empty day distinguishable from a failed one; a deadline rescheduled,
audited and undone, in each locale; the return to the exact date and orientation;
a task changed underneath refusing to be overwritten; a cancelled task offering
no reschedule at all.

**Control.** `e2e/online-reminders.spec.ts` — a spec this phase has not touched —
was run before and after. **Before: 11 failed, 1 passed. After: 12 passed.** The
lane was broken for every online journey, not for the calendar, and the control
is what says so.

---

## 2. The three product defects

### 2.1 The authenticated gates had stopped being server-side

`5edc205` ("perf: make authenticated navigation responsive", 2026-08-10) added
`src/app/[locale]/app/loading.tsx`. In the App Router a segment's `loading.tsx`
wraps that segment's **children** in Suspense while its own `layout.tsx` renders
outside it — so from that commit every `/{locale}/app/**` request flushed the
shell before reaching `requireUser`, and its `redirect()` could no longer be a
307. It was serialized into the RSC payload and executed after hydration.

Measured against the running app for an authenticated, unconsented account:

| request | expected | observed |
| --- | --- | --- |
| `GET /pt-BR/app` | `307 → /pt-BR/consent` | **`200`**, 63 KB of shell |
| `GET /pt-BR/app/calendar` | `307 → /pt-BR/consent` | **`200`**, 64 KB |

Two consequences, in the order they matter. **The interposition weakened**:
`SH-LIFECYCLE-008` and `SH-LEGAL-008/009` specify a suspended or unconsented
account is refused server-side, and an answer that ships the shell and asks the
browser to leave survives exactly as long as hydration does. **And it broke every
deployment journey**: `page.goto` resolves on `load`, before hydration, so
`e2e/support/online-session.ts` saw `/{locale}/app`, concluded no consent had
been interposed, and the redirect then fired *during the next navigation* and
aborted it — `net::ERR_ABORTED`, which reads exactly like a product defect in
whatever page was being opened.

**Fix:** the gate runs in `src/app/[locale]/app/layout.tsx`, above the boundary.
The pages keep their own `requireUser` call, so Server Actions and anything not
reached through this layout are unaffected. Verified by re-measurement: both
routes answer `307 → /pt-BR/consent` again.

**Guard:** `src/lib/closeout/server-side-gate-guard.test.ts`. For every
`loading.tsx` under `src/app`, if any page in that segment's subtree is gated,
the segment's own `layout.tsx` must run the gate. It fails on exactly the defect
above when the fix is reverted.

### 2.2 `2M-CAL-010` was self-defeating on the successful path

Slice 2M.1 put the outcome and the undo inside the item's disclosure — where the
requirement asks for them, *"where the operation happened"*. On a task detail
that is enough. On a **date-partitioned** view the successful case is precisely
the one where the item leaves: reschedule 13 Aug → 16 Aug from the 13 Aug column,
`applyTaskDetailCommand` revalidates, the 13 Aug projection no longer contains
the task (nor the reminder `apply_task_command` moves with it), and the item
unmounts — taking the outcome region and the undo button with it at the instant
there is finally something to undo. The journey observed the page reading
**"0 itens neste período"** with no region anywhere.

**No jsdom test could have found this**, because the disappearance is caused by
the server re-running its query.

**Fix:** `src/features/calendar/calendar-outcome.tsx` renders the outcome on the
calendar, which the day's contents cannot unmount; `TaskDetailControls` takes
`renderResult={false}` so nothing is announced twice.

**The first attempt at the fix was wrong, and instructively.** It reported the
outcome upward from an effect inside `TaskDetailControls`. That never fired:
React applies the settled state and the revalidated tree together, so the subtree
is already gone when effects run. **A component cannot report its own outcome if
the outcome is what removes it.** The recording moved into a wrapper around the
action, owned by `CalendarView`.

**Regression cover:** `calendar-view.test.tsx` applies, then re-renders with the
day emptied — the projection's real post-reschedule state — and requires the
region to still be there.

### 2.3 The undo control has never rendered, on any surface

The one that was not about the calendar at all.

`apply_task_command` returns the undo window as
`to_char(undo_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`. Postgres's `OF`
emits the shortest offset it can — `+00` for UTC — and ECMAScript's Date Time
String Format accepts `Z` or `±HH:mm` and nothing else:

```js
Date.parse("2026-08-12T19:30:00.123456+00")     // NaN
Date.parse("2026-08-12T19:30:00.123456+00:00")  // 1786563000123
```

`UndoAffordance` gated its control on `Number.isFinite(Date.parse(expiresAt))`
and treated an unparseable expiry as *do not offer* — fail-closed, correct in
principle, and because the value was never parseable in a whole-hour zone, it
meant **the undo button has not rendered since Phase 2L shipped it**.

Its own comment recorded the reasoning that hid it: *"the column is `not null`
with a default so this is unreachable through the database"*. True of the column,
and irrelevant — **what crosses the boundary is a rendering of the column, and a
rendering has its own contract.**

Every existing test passed throughout. All of them expressed `expiresAt` as
`…Z`; `2E`/`2L` proved the `undo_operations` row and the `undo_operation` RPC,
both of which work; **none asserted the button.**

**Fix:** `src/features/task-commands/rendered-instant.ts`, app-side, **no
migration** — the RPC is not wrong, and `apply.ts` already documents that its
rendering *"is not an ISO promise; rendering it for a user is the surface's
job"*. Reading it is part of that job.

**Regression cover:** `undo-affordance.test.tsx` now carries the rendering byte
for byte, in both offset signs, offering and withdrawing across the window.

---

## 3. The five probe defects

Recorded because they are the recurring cost of this project, and because four
of the six failing cases were the probe's fault.

1. **A locator that ignores the dimension the surface is organized by finds the
   surface working and calls it broken.** `.calendar-item` filtered by title
   matched **two** correct elements: seeding a task with a `due_at` fires
   `tasks_create_due_reminder` (`202607160007`), so the day holds a reminder at
   11:00 and the deadline at noon, both bearing the title. Now scoped by
   `[data-lane]`.
2. **A journey that guesses at copy tests the guess.** `resultRegion` was the
   Work list's *"Resultado da ação"*; the calendar's control is
   `taskDetailControlsCopy`'s *"Resultado da alteração"*. `back` was *"Voltar"*;
   that affordance names its destination, never the gesture.
3. **A date assertion that ignores the zone is asserting about UTC.** A bare date
   resolves to 23:59:59 local (`END_OF_DAY`), which in America/Sao_Paulo is
   already the next day in UTC, so slicing the stored ISO string reported a
   correct write as an off-by-one. The comparison now formats in
   `profiles.timezone` — read, not assumed.
4. **A query written from what the columns are called in one's head fails at the
   database, not at the assertion.** `audit_logs?target_id=…&select=actor,action`
   — neither column has ever existed; PostgREST answered `42703`. The table is
   `(action_type, entity_type, entity_id, actor)`. **This is Phase 2K's
   `occurred_at` defect again, five days later.**
5. **A raised test timeout is not a raised assertion timeout.** The online lane
   set `timeout: 90_000` and left `expect` at Playwright's 5-second default, so a
   round trip to the hosted database expired the assertion while the form still
   read *"Aplicando…"* — reporting a missing outcome region for an outcome that
   was on its way. `playwright.config.ts` now scopes `expect.timeout` to the same
   lane, for the same stated reason.

---

## 4. The product defect that was *not* there

The staleness case was suspected of being a false premise — the pre-state is
re-read server-side at submit time, so the twelve-column gate looked unable to
fire from this path, and the day being empty looked like the stale submit having
succeeded. **It was not.** Once the four probe defects above were repaired the
case passed on its own terms: the task changed underneath, the submit was
refused, and the deadline did not move to the day it asked for. The inference was
wrong and the assertion was right, which is the argument for not rewriting a
failing test until its cause is known.

---

## 5. Verification

| gate | result |
| --- | --- |
| `npm run lint` | zero errors, zero warnings |
| `npm run typecheck` | zero errors |
| `npm test` | **5525 passed**, 0 failed (3 files unparsed — the Windows shebang baseline, green in CI) |
| `npx playwright test e2e/calendar.spec.ts` | **42 passed**, desktop + Pixel 7, both locales |
| `e2e/online-calendar.spec.ts` | **12 passed**, desktop + Pixel 7 |
| `e2e/online-reminders.spec.ts` (control) | **12 passed**, from 11 failed |
| `npm run build` | green |

Migrations: none. Schema: untouched. Rollout gate: untouched. Signup: closed.

---

## 6. What is still not proved

**A real screen reader and a real phone.** Every accessibility claim in this
phase rests on an emulated viewport and a DOM assertion. **An emulated viewport
is a viewport, not a device**, and this record does not pretend otherwise — it is
the owner-checkpoint obligation the loop stops at, not something a later slice
can quietly absorb.
