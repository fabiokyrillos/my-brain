# Phase 2P — Slice 2P.7 acceptance: the calendar gets a real month, a reminder is written in a dialog, and the first working `revalidatePath` on that route froze it

**Requirements:** `2P-CALENDAR-001` … `-005`, `2P-REMINDER-001` … `-005`.

**Baseline:** `main` `d30177f45b3ddd5dfa4ede3189bd864fd82427d2`. **Zero
migrations** — 99 local = 99 hosted, parity `202608190099`, read live from the
hosted `supabase_migrations.schema_migrations` and unchanged by this slice. Both
Phase 2P allocations remain spent; a third remains a stop condition. Signup
closed; rollout 25 pass · 3 fail · 2 owner-signature. No automation enabled.

---

## 1. What the owner had already signed, and what this slice found

§100 recorded two owner decisions that went in opposite directions:
`2P-CALENDAR-001` was **confirmed** — a real month view, Agenda may not be
renamed as Mês, and the requirement's own wording is untouched — while
`2P-REMINDER-002` was **corrected** by amendment, with recurrence removed from
the phase and named as the remainder `2P-REMINDER-RECURRENCE`.

Both were honoured as written. This slice adds nothing to either decision. What
it did find is that building the month **cannot** be done without touching a
vocabulary that lives inside a deployed validator, and that the reminders route
has never once been re-rendered by any of its own actions.

---

## 2. The month, and the ledger that cannot hear about it

`CALENDAR_ORIENTATIONS` is now `["day","week","month","agenda"]`. The month is a
period of its own: a Monday-aligned grid of 28, 35 or 42 days — 28 is reachable
and a February beginning on a Monday proves it, so nothing pads to a phantom
fifth week — navigation that steps by whole months, and a label that names the
month rather than the grid's two edges.

The month arithmetic went into `src/lib/time/local-day.ts` beside the week
arithmetic rather than into the calendar feature, because
`phase-2m-local-day-guard.test.ts` fails the build on a module that derives day
boundaries of its own. `addLocalMonths` **clamps**: 31 January plus one month is
28 February, never 3 March, which is how a *next month* control comes to skip
February from the thirty-first — asserted in both directions and in a leap year.

### `2P-CALENDAR-MONTH-TELEMETRY` — a new remainder, not a migration

The orientation vocabulary has **three** copies. Two are in the repository;
the third is inside the deployed `private.validate_product_event_properties`,
which admits exactly `['day','week','agenda']` for `calendar_viewed`. Read live
against the hosted database on 2026-08-19, not inferred from the migration file:

```
perform private.require_product_event_enum(p_properties, 'orientation', array['day', 'week', 'agenda']);
```

Widening it is a **third Phase 2P migration**, which is a stop condition. The two
ways of pretending otherwise were both refused:

- **widening the client list anyway.** `recordProductEvent` maps the validator's
  `22023` to `invalid_payload` and *returns* rather than throwing, so the event
  would be accepted by the client, refused by the database, and lost with nothing
  anywhere saying so;
- **relabelling a month as `agenda`** to fit the enum, which would put a false
  statement in an append-only ledger.

So `calendar_viewed` is **not emitted** for `month`. The narrowing is what makes
that explicit rather than accidental: `CalendarViewed` takes the telemetry
vocabulary, so deleting the guard in the page does not silently start emitting —
it stops the build. This is also consistent with the requirement's own text,
which says the month view **creates no new write path**, and telemetry is one.

The test now reads the enum **out of the migration** and holds the client list to
it, so the coupling is executable rather than a comment: widening the client list
by hand fails, and the only legitimate way to widen it is to widen the deployed
CHECK, which needs a migration and a signature.

### The grid and the list, and why both are in the DOM

The month renders twice — a real `<table>` and a readable day list — and CSS
chooses. A viewport test in JavaScript would make the first paint disagree with
the second on every load.

That is only honest because the hidden one is hidden with `display: none`, which
removes a subtree from the **accessibility tree** as well as from the page. A
screen reader hears one month at any width, not two. `visibility: hidden`, an
opacity of zero and an off-screen clip would each leave both in the tree. The
browser lane asserts exactly one of the two is live at 1280 px and at 375 px.

---

## 3. Reminders

`2P-REMINDER-001`: the header carried `ReminderForm` — an inline creation form
permanently open above the list, one line of JSX with locale ternaries, three
ungrouped controls, no explanation and no step between typing and writing. It is
**deleted**, along with the writer it submitted to.

`ReminderComposer` is the **fourth consumer of `ConfirmDialog`**, not a fifth
dialog, and it reuses `.task-command-dialog-form` — the modifier slice 2P.6 added
for a dialog whose content is a real form. Groups in the declared order —
content; date and time; importance; an optional link; then save and cancel —
asserted by **DOM position**, because a presence test would pass on any
arrangement of them.

### `2P-REMINDER-003` is why the writer moved rather than being wrapped

The version in `agent/actions.ts` converted its `datetime-local` value with a
bare `new Date(...)`, which resolves a wall clock in the **host's** zone — UTC on
the server. A reminder set for 14:00 in São Paulo was stored as 14:00Z and would
have fired **three hours early**. Beside it, in the reminders feature, the
reschedule command had been resolving the same kind of value against
`profiles.timezone` since DEC-6.

The creation schema now reuses those exact declarations, and `schema.test.ts`
runs every case through **both** parsers and compares the verdicts — so the two
cannot drift apart while every assertion still passes. The journey reads the
instant back from the rendered row: a 09:30 reminder reads 09:30.

`assertActiveAccount` was carried by the previous writer, dropped in the first
draft of the move, and **put back**. Removing a check while relocating a function
is exactly the silent loss a move should make impossible.

The direct-write allowlist still holds **exactly one** entry. 2P.7 changed which
file it names, and the guard fired on the move before the allowlist was updated —
which is the property it exists to have.

### The optional link reaches into a `<select>`

`reminders.task_id` is the only link a person can choose, and a `<select>`
renders task titles, which are governed content. `ProtectedContent` cannot be
used inside an `<option>`, so `task-options.ts` asks the **same question through
the same contract** — `deriveTaskSensitivity` over an owner-scoped read, then
`resolveTaskContent` — and a withheld task keeps a **choosable, unreadable**
option. Masking withholds the words, never the ability to link.

---

## 4. `2P-REMINDER-REVALIDATE-HANG` — the freeze, and what it is not

The authenticated journey hung: the dialog stuck on *Criando…* with the row
written, the server answered **200**, and nothing appeared in the server log, the
browser console, or as a page error.

Measured against `next start`, ten consecutive creations:

| Shape | Result |
|---|---|
| no revalidation | 10/10, ~1.4 s each |
| `revalidatePath("/[locale]/app/reminders", "page")` | ~3.9 s each, hangs after two to five, past 120 s |
| refresh moved to the client, after the dialog closes | 10/10, ~1.88 s each |

Deriving openness from `pending` — slice 2P.6's fix, and correct — protects
against closing *too early*. Nothing protects against a transition that never
ends.

**It is not this slice's code, and that was established twice rather than
argued.** The hang reproduces with 2P.7's own `loadReminderTaskOptions` stubbed
out of the page entirely; and a worktree built at `main` `d30177f`, carrying the
*old* inline form and nothing from this branch, fails the same journey **2 times
in 12** with the same symptom — a creation that never completes.

**Why nobody had seen it:** `applyReminderCommand` still revalidates a *resolved*
path, which matches nothing under a dynamic `[locale]` segment. **No action on
this page has ever actually re-rendered it.** This was the first one that did.

So the refresh moved to the client, after the dialog has closed. The property
that makes it safe is **ordering**, not luck: it runs only once `pending` is
already false, so nothing it does can hold the dialog open, and a slow refresh
degrades to a list that updates late rather than to a control that cannot be
dismissed.

**This is a caution for the remaining `revalidatePath` repairs: fixing one of
those call sites can turn a dead call into a live freeze.**

---

## 5. What each requirement is

| Requirement | Class | Evidence |
|---|---|---|
| `2P-CALENDAR-001` | **built** | `CALENDAR_ORIENTATIONS` has `month`; grid, bound cells, overflow, today by a word, days outside the month, text alternative, phone presentation |
| `2P-CALENDAR-002` | baseline | `calendar-item.tsx` states lane and commitment in **visible** text; asserted in `calendar-view.test.tsx` |
| `2P-CALENDAR-003` | baseline | the return position travels in the link (`from=`), proved in `online-calendar.spec.ts`; reschedule applies in place. **The scroll half is not claimed** |
| `2P-CALENDAR-004` | baseline | `2M-CAL-011`'s empty / narrowed-empty / partial / failed states |
| `2P-CALENDAR-005` | baseline, extended | the existing reflow lane, plus the month's own phone presentation and its no-horizontal-scroll assertion |
| `2P-REMINDER-001` | **built** | header offers one action; no creation field until it is asked for |
| `2P-REMINDER-002` | **built** | five groups in the declared order, asserted by DOM position; **no recurrence in any shape** |
| `2P-REMINDER-003` | **built** | one writer, and both flows run through the same declarations; every case compared across both parsers |
| `2P-REMINDER-004` | **built** | cancel and Escape close without writing, focus returns, the draft does not survive |
| `2P-REMINDER-005` | baseline | title first, a state-aware next-occurrence label, and `.danger` is outline-only rather than filled |

**Cumulative: 72 of 87 — and that is one fewer than the inherited number, deliberately.**

The families divide the phase exactly: FOUNDATION 7, ATTENTION 8, CHAT 7,
CAPTURE 10, AUTONOMY 10, SETTINGS 8, PERSON 4, MEMORY 4, RELATION 4,
CALENDAR 5, REMINDER 5, MOBILE 5, ACCESS 5, CLOSE 5 — **87**. Slices 2P.0
through 2P.6 own the first seven groups, which is **62**, and this slice adds
CALENDAR and REMINDER, which is **72**. Slice 2P.8 owns MOBILE, ACCESS and
CLOSE — **15** — and 72 + 15 = 87.

The recorded figure was 63 after 2P.6, and it traces to one line: slice 2P.5
counted *"42 at the close of 2P.4, plus eight `2P-SETTINGS` requirements, plus
the `2P-CHAT-004` remainder closing"* as 51. Closing that remainder was real
work, but `2P-CHAT-004` is one of the seven CHAT requirements slice 2P.2 had
already counted — so it was added twice, and the off-by-one propagated through
2P.6.

**The earlier records are not rewritten.** They are the record of what was
believed when they were written, and the arithmetic is corrected forward from
here rather than backwards over a signature. The count of *requirements* is 72;
the closed remainder is real and stays real — it is simply not an 88th
requirement.

---

## 6. What the guards found, and none of them was weakened

Five guards reported real defects in this slice's own work:

- **`phase-2m-fixed-offset-guard`** caught a division by `86_400_000` in the
  month's day count. Fixed by not needing a subtraction at all —
  `localWeekdayIndex` was extracted from `startOfLocalWeek`, which already knew
  the answer.
- **`phase-2m-recurrence-guard`** caught two blocklists in this slice's tests
  that duplicated the enforcer. Replaced by **closed lists**, which are stronger:
  a blocklist refuses what somebody thought of. §100's *one enforcer, one
  recorder* was followed rather than broadening the single-file exemption.
- **`stylesheet-class-coverage`** caught two class names no rule reached.
  Removing them exposed a **specificity bug**: `.reminder-compose-check` at
  `0,1,0` lost to `.task-command-dialog-form label` at `0,1,1`, so the checkbox
  would have gone on stacking above its own words with a rule right there that
  looked correct.
- **`direct-write-guard`** fired on the writer's move before the allowlist was
  updated.
- **`calendar-mirror-guard`** required the browser lane to name every class the
  month renders, which is why the month has a browser lane at all.

And the 2P guard's month fact assertion **flipped**, which §100 said would be
the delivery. It is still a closed list, so a *fifth* orientation added without a
decision still fails it.

`max-height` on a `<td>` is inert. The month cell rule claimed a ceiling it did
not impose, and a "capped" cell measured 240 px in a real engine. The
declaration was removed rather than left to be believed, and the test now asserts
the property that is actually true: beyond `MONTH_CELL_ITEM_LIMIT`, more items
add nothing.

---

## 7. Evidence

- **Unit and component:** `npm test` — **8672 passing**. Three *files* fail to
  parse on Windows (`hosted-auth-parity`, `signup-hardening-admin-boundary`,
  `storage-orphan-scanner`), which is the recorded local baseline and green in
  CI: **0 failing tests**.
- **Types and lint:** `tsc --noEmit` clean; `npm run lint` reports nothing in
  this slice's files. The six errors it does report are all inside
  `.worktrees/`, which is gitignored and never reaches CI.
- **Build:** `npm run build` passes.
- **Browser, fixture lane:** `e2e/calendar.spec.ts` — 70 passing on desktop and
  Pixel 7, including that exactly one month presentation is live at each width.
- **Browser, the exact CI foundation command:** 383 passing, 5 skipped, on
  desktop and Pixel 7.
- **Authenticated journeys:** `e2e/online-phase-2p-planning.spec.ts` — **24
  passing on desktop and Pixel 7**, against a rebuilt `next start` whose served
  stylesheet was checked for this slice's own rules before the run, so no proof
  was made against a stale artefact.
- **Telemetry, at the network boundary:** the month emits no `calendar_viewed`,
  and **the control is the other half** — the same page in `week` does emit, so a
  run where telemetry was broken entirely fails rather than passing by silence.
- **Residue:** every account these journeys create is deleted in `afterAll`;
  the account delete cascades to its reminders, tasks and audit rows.

---

## 8. Open, and not closed by this record

Ten remainders, none of them closed here:

- `2P-ATTENTION-008`'s browser half;
- `2P-CHAT-007-JOURNEY` → 2P.8, carrying the owner's one-turn BYOK authorization;
- `RG-DEP-3`, still INCOMPLETE and **not re-run**, because this slice deploys
  nothing;
- the four missing review flows — `2P-AUTONOMY-FLOW-PROJECT`, `-ORGANIZATION`,
  `-MEMORY`, `-RELATION`;
- `2P-APPEARANCE-HYDRATION`;
- the remaining `revalidatePath` call sites — **now with a caution attached**;
- the first-action warm-up;
- `2P-REMINDER-RECURRENCE`;
- **new:** `2P-CALENDAR-MONTH-TELEMETRY`;
- **new:** `2P-REMINDER-REVALIDATE-HANG`.

**Also not claimed by 2P.7:** anything on real hardware — the mobile lane is a
Pixel 7 emulation, not a device; any screen-reader run; and any automation. All
six categories still read `suggest_only` and nothing was enabled.

**Both new remainders are this session's classification, applying the principle
the owner signed twice in this phase** — when the deployed schema cannot support
part of a requirement and a migration is a stop condition, the gap becomes a
named traceable remainder rather than a lie or a fake control. Neither has an
owner signature of its own, and both are put forward for one.

Inherited residuals — push HTTP 403 / Android, retention scheduling, SMTP, the
restore drill, the legal and monitoring signatures, four touch-target exceptions,
the unstyled elements, `2N-FILES-WRITER`, `2N-IDENTITY-EXTRACTION`,
`2N-RELATION-TRIGGER` — remain untouched and unclaimed.

---

## 9. The merge

PR #268, head `ff09684`, **merge SHA `03a978e`**. Green at the exact head and
again at the exact merge SHA, both times on all three jobs, with the
`database and journey` step list read at both points: **21 success · 2 skipped ·
0 cancelled**. The two skipped are the artifact collectors, which run only on
failure. Every substantive step executed — the whole migration chain applied to
an empty database, the pgTAP suite, `db lint`, the three concurrency proofs, the
deterministic foundation journey, and the re-grant rollback rehearsal.

Two earlier runs on the branch show `cancelled`; both were superseded by a later
push, and their step counts confirm they were interrupted rather than failed.
**Neither was counted as green.**

Parity was re-read live **after** the merge rather than cited from before it:
**99 local = 99 hosted, `202608190099`**, unchanged. Worktree clean, zero open
PRs.
