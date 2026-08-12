# Phase 2M — slice 2M.3 acceptance record

**Slice:** 2M.3 — reviews, closure, and the five inert preferences.
**Signed decisions executed against:** OD-2M-3 A (`planned_at` is an intention),
OD-2M-6 A (visible, labelled controls only), OD-2M-2 (`calendar` is this phase's
telemetry surface), OD-2L-1 B (zero classification persisted).
**Migrations spent:** **none.** Budget unchanged at `3 allocated · 2 spent`, all
three NON-TRANSFERABLE. Migration 2 stays reserved exclusively for push in 2M.4b;
migration 3 (`202608110091`) remains merged and **not deployed**.
**Hosted parity:** **unchanged at `202608110090`.**

---

## 1. Requirements

| Requirement | Status | Evidence |
|---|---|---|
| `2M-REVIEW-001` | **built** | `day-review-projection.ts` composes the day from five existing sources; each read is scored `read`/`unavailable` individually, and `unreadable` is rendered as its own announced section. `day-review-projection.test.ts` carries the negative control: a failed source and a quiet day both produce `[]`, and the two must not report the same thing |
| `2M-REVIEW-002` | **built** | `?scope=next_day` reads the same shapes for tomorrow. Nothing is proposed: no ranking, no preselected row, and `plan`'s date input arrives **empty** while only `carry_forward` — the verb whose name is the proposal — arrives filled |
| `2M-REVIEW-003` | **built** | `contracts.ts` maps the five verbs onto `set_planned`, `reschedule_due`, `cancel_task` and `set_status`. Every property is **derived from `actionPolicy`**, never restated; `contracts.test.ts` asserts each mapping against the taxonomy rather than against a copy of it |
| `2M-REVIEW-004` | **built** | `phase-2m-review-authority-guard.test.ts` — no direct write to six tables, no RPC, no Server Action declared, no privileged client, no timer, no apply-from-effect, no provider call, and no taxonomy verb named outside the mapping module |
| `2M-REVIEW-005` | **built** | `dayReviewRequiresConfirmation` and `dayReviewIsReversible` read the policy. `archive` is the one destructive verb, it carries the confirmation sentence before it runs, and the two-step `request_cancel` → dialog → `confirm_cancel` path is `TaskDetailControls`' existing one rather than a second copy |
| `2M-REVIEW-006` | **built** | `review-schedule.ts` is the consumer for `daily_review_time`, `weekly_review_day` and `weekly_review_time`; `phase-2m-inert-preferences-guard.test.ts` asserts the read exists, that `planning_day`/`planning_time` appear in no control, label or schema, **and** that the payload still carries them so retiring a control did not delete a column |
| `2M-REVIEW-007` | **built** | Nothing became scheduled, so the branch taken is *re-assert by test*: the sentence is asserted in both locales on the route, in the typed copy module, and in the browser lane; the guard also refuses `setTimeout`, `setInterval`, `pg_cron`, a `jobs` write and `enqueue` anywhere on the review path |
| `2M-REVIEW-008` | **built** | The stored review is rendered through `toReviewListItemView` and the surface adds no formatting of its own; a row the contract refuses renders as **null**, not as a half-built card |
| `2M-TIME-005` | **built** | `src/lib/time/instant-format.ts` — the zone is a required parameter with no default. `cross-surface-instant.test.ts` proves each surface moves between two zones, that the day boundary is crossed rather than the clock shifted, and that the stored string is unchanged |
| `2M-TIME-006` | **built** | One contract, four named surfaces driven through their own modules, plus a census refusing any `Intl.DateTimeFormat` without a `timeZone` in seven dated files |
| `2M-ACCESS-006` | **built** | `e2e/daily-surfaces.spec.ts` (planner + day review, 36 assertions × desktop and Pixel 7) **and** `calendar-mirror-guard.test.ts`, now table-driven over three surfaces with a mutation control. Both lanes are added to the CI Playwright step |
| `2M-MOBILE-004` | **built** | discharges the 2M.2 partial where its destination named; measured in a browser at 320 CSS px: every navigation target ≥ 44 px, every verb inside a form with an explicit submit, one outcome region outside every list, no horizontal scroll |
| `2M-ACCESS-004` | **built** | discharges the 2M.2 partial where its destination named; every region labelled and asserted by role in jsdom and in the browser; the unreadable list and the planner's overload are `role="status"`; `aria-current` marks the active scope |

---

## 2. The three defects this slice found

1. **The notification list rendered in the host's zone.** It built
   `new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" })`
   with **no `timeZone`** — UTC on the server — while the calendar, the planner,
   the reminders page and the task detail had all been passing the owner's zone
   since slice 2M.1. Changing the timezone in settings moved four surfaces and
   left this one. This is `2M-TIME-005` and `2M-TIME-006` failing on the same
   line, and it had been true since long before this phase.

2. **Both Phase 2M browser lanes were absent from CI.** `2M-ACCESS-006` offers
   *"an entry in the CI accessibility lane, **or** a mirror re-derived from
   component source"*, and slice 2M.1 chose the mirror. The mirror ran in CI as a
   vitest guard; **the lane it guards did not run anywhere**. Every browser
   assertion the calendar's lane makes — touch targets, focus, reflow, keyboard
   operation — had only ever executed on a developer's machine. Both lanes are
   now in the CI Playwright step at both viewports.

3. **`detailControlsFor` would have silently removed `follow_up`.** It excludes
   `set_status` because the Work list renders that verb through `WorkItemActions`
   and two routes to one transition on one screen is a defect. On a review row
   there is no second route, so reusing it would have shipped four verbs where
   the requirement names five — and the telemetry vocabulary would have had an
   `actionKind` no producer could ever emit.

---

## 3. The divergence, stated rather than absorbed

**The day review mounts on `/app/reviews`, and three merged comments said it
would be a sub-route of `/app/calendar`.**

The owner's brief for this slice is explicit: *reuse the existing surface at
`/app/reviews`, reuse `review-presentation.ts`*. Three artifacts merged in slices
2M.1 and 2M.2 — `product-analytics/contracts.ts`, the planner route and
`capabilities.ts` — said instead that the day review would live under the
calendar.

**Neither reading costs a migration, and that is what decides it.** The
constraint those comments were really about is the *surface value*: a `reviews`
entry the deployed `product_events_surface_check` does not admit would be a
fourth migration and a stop condition. The **route** was never the constraint.
`surface` is the product area an event belongs to rather than the route it was
emitted from — `task_command` has attributed to its own area from `/app/chat` and
`/app/work` since Phase 2E — so the day review mounts where the owner asked and
attributes to `calendar`, which is the value migration `202608110090` deployed
**naming the day review explicitly**.

All three comments were corrected in this change rather than left to disagree
with the code. **Zero migrations were spent and no new surface value exists.**

---

## 4. What is NOT proved, stated as a remainder

- **The applied case is not proved in a browser.** The lane composes its pages
  with `setContent`, so a carry-forward that succeeds, the row leaving the list,
  the undo, and a staleness refusal are **not** exercised. They need an
  authenticated app; the closest existing proof is `online-calendar.spec.ts`
  against the deployment, which covers the calendar's equivalent path and not
  this one. **Destination: an online journey, not this slice.**
- **A real screen reader and a real phone are not proved anywhere.**
  `2M-ACCESS-007` and the OD-2M-5 hardware checkpoint are the owner's, and
  nothing here may be cited as discharging either. **An emulated viewport is a
  viewport, not a device.**
- **The two review events have a producer and no execution.** They are emitted by
  the browser; nothing in this slice observed one arriving in `product_events` on
  the hosted project. The reader that would measure them
  (`phase-2m-daily-cycle-funnel-reader.mjs`) is proven executable and has only
  ever been run as a disposable owner with zero events.

---

## 5. Gates

| Gate | Result |
|---|---|
| `npm run lint` | zero errors, zero warnings |
| `npm run typecheck` | zero errors |
| `npm test` | **5753 passed**, 0 failed — 3 files unparsed, the Windows shebang baseline, green in CI |
| `npm run build` | green |
| Playwright `daily-surfaces.spec.ts` | **36 passed** — desktop and Pixel 7 |
| Playwright `calendar.spec.ts` + `accessibility.spec.ts` | **89 passed, 17 skipped** (the skips are the credential-gated online journeys) |
| `git diff --check` | clean |
| traceability | `node scripts/generate-phase-2m-traceability.mjs` — **declared 94, classified 63, built 60, partial 3, unclassified 31, migrations 2/3**, every number extracted rather than typed. **It writes no file mid-phase**: `phase-2m-declarations.test.ts` forbids the matrix before its closeout gate, and the first run of the generator tripped that guard — the fix was to make the artifact impossible before the gate, not to relax the guard |
| migrations | **none spent**; hosted parity read from the record, unchanged at `202608110090` |

**One local execution constraint, recorded rather than hidden.** Playwright's
`webServer` could not start within its 120 s timeout on this machine (Next
reports a slow filesystem), so the two lanes were executed through a temporary
config **without** `webServer` — legitimate because neither spec navigates to the
app. That config was deleted and is not in the tree. In CI the repository config
runs, against the production build.
