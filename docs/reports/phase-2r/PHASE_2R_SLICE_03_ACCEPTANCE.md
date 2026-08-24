# Phase 2R — Slice 2R.3 acceptance record

**The surface: one select, a preview, and a boundary that held.**

- **Authorization:** ADR-133 (implementation, slices 2R.0 … 2R.5).
- **Requirements:** `2R-SURFACE-001` … `-008`, `2R-ACCESS-001` … `-005`,
  `2R-MOBILE-001` … `-003` (16 here; **47 of 73 cumulatively**).
- **Migrations: none created.** 101 before, 101 after. Parity `202608230101`
  untouched. Budget stays **1 allocated · 1 spent · 1 created**.
- **Baseline:** `main` `de21c97cbcf8ae07e06f283887cd76904581ea25`, CI green 3/3
  on that exact merge SHA.
- **Merged:** `30df320846fe895d26d583ff46192bc9092810ad`, **CI green 3/3 on that
  exact merge SHA** and on the head `0c5f3c5` before it.
- **Hosted writes: none. AI calls: none. BYOK credit spent: none.**

> **`2R-MOBILE-003` — the checkpoint RAN, and returned partial approval with two
> defects.** It is still **not delivered**: a checkpoint that found defects is a
> checkpoint that has to be run again after they are fixed, and `2R-CLOSE-009`
> refuses a record that closes it any other way. §10 records what the owner
> tested, what passed, what failed, and what was done about it.

---

## 0. The owner device checkpoint — run 1, on iPhone/PWA

**Approved:** the recurrence control is usable, the preview appears, the Create
button stays reachable, and the recurring reminder was created correctly.

**Two defects, both real, both fixed without a migration:**

| | reported | cause | disposition |
|---|---|---|---|
| 1 | *"Para repetir segunda, quarta e sexta, eu teria de criar três lembretes."* | the surface offered one day; **the model had always stored an array** | fixed — §11 |
| 2 | *"O iPhone aplica zoom e o modal fica visualmente quebrado."* | every text field in the product was below iOS's 16px threshold | fixed — §12 |

Neither was a limitation of the deployed contract, and neither needed one.
**A second run of this checkpoint is owed and is not assumed.**

---

## 1. The stop condition, and why it was not reached

The plan makes turning the composer into a form a stop condition. The form it
would have become is the obvious one: a frequency picker, then seven weekday
checkboxes for `weekly`, a day-of-month number for `monthlyDay`, an ordinal plus
a weekday for `monthlyWeekday`, a month plus a day for `yearly`. Five groups, in
a dialog that already had five.

**Every one of those parameters was already on the screen.** The composer asks
for a date and time before it asks anything about repeating, so *every week*
means the weekday of that date, *every month* means its day, and *every year*
means its month and day. The control collapses to **one `<select>` with no new
fields**, and `recurrence-derivation.ts` holds the reading the component does not
know — it submits a word.

Measured rather than asserted: `phase-2r-foundation.test.ts` counts the
composer's named inputs, and the count went from four to **five**. The one new
name is `recurrence`. A `reminder-composer.test.tsx` case compares the field list
before and after a repetition is chosen and requires them equal.

> **Superseded in part by §11.** The owner's checkpoint found that this reading
> was too narrow for `weekly`: the model had always stored several weekdays and
> the surface offered one, so repeating on Monday, Wednesday and Friday would
> have taken three reminders. A day picker was added **for `weekly` only**, the
> count is now six, and the stop condition was re-evaluated rather than assumed.
> The paragraph above still describes the other four frequencies exactly.

That is also why the preview matters. A control this small is only honest if the
owner can see what it derived, so the next three occurrences are shown **before
saving** — from `public.reminder_series_preview`, resolved in the owner's profile
zone and formatted there. No instant is computed in the browser (`2R-TIME-007`).

## 2. A signed boundary refused the obvious wiring

`2R-SURFACE-003` asks **every** surface that lists a recurring reminder to say
that it repeats and how, and the calendar is one. The first implementation had
the calendar select the rule's own columns and join the series table.

`phase-2m-recurrence-guard.test.ts` refused it. **Correctly.** ADR-132 Decision 1
lifted the recurrence refusal *"strictly limited to reminders — it does not reach
tasks, the calendar, or any other object"*, and the guard enumerates the files
the lift authorizes rather than globbing a directory.

Widening that list would have been precisely the quiet act the enumeration exists
to prevent. **So the code moved and the boundary held.** `repeat-labels.ts` is
where the lookup went: the calendar asks in its own terms — *these reminder ids,
which of them repeat* — and receives sentences. It never names a series, never
sees a rule, and could not render one if it tried. `calendar-projection.ts` and
its test carry none of the governed shapes, which is why neither is on the
allowlist.

`2R-SURFACE-005` needed **proving rather than building**. A materialised
occurrence is an ordinary `reminders` row, the calendar selects reminders by
status and date window, and no predicate excludes one — so it was already true
when the slice began. The re-audit found that before any code was written. An
unasserted "already true" is one refactor away from being false.

## 3. Three defects, two of them older than this slice

**A test of mine asserted `"Toda domingo"` and passed.** Five pt-BR weekdays end
in *-feira* and are feminine; **`sábado` and `domingo` are masculine**. The
fixture was written from the implementation instead of from the language, so
both agreed and both were wrong. Each noun now carries its gender and each locale
decides its own agreement — including the ordinal, where the same mistake hides a
second time (*toda última sexta-feira* against *todo último sábado*).

**A refused save discarded everything the owner had typed.** React empties an
uncontrolled form once a Server Action completes; this repository has the defect
recorded as *"a form action resets uncontrolled input"* and `memory-composer.tsx`
already solved it — but this surface still had it, and `2R-SURFACE-008` asking
the question is what found it.

**And the `<select>` needed more than the two `<input>`s did.** With all three
controlled, the inputs kept their values and the select did not: React's reset
returned it to the first option and no re-render followed, because `choice` had
not changed. A probe confirmed the asymmetry directly — the preview block was
still rendered, which only happens when a repetition is chosen, while the select
on screen read *Não repete*. **That is worse than losing the value: the surface
and the state disagree**, and the next save writes a repetition the owner cannot
see selected. The DOM is now reconciled to the state after every render,
confined to the one element with the problem.

**Also repaired: the shared dialog had no height bound on desktop.** Slice 2R.0
measured that and left *"update this record"* against the day something needed
it; a recurrence group plus a three-line preview is that day. Without it the
primary action leaves the screen, because the backdrop centres an unbounded box
in a padded grid. Every `ConfirmDialog` consumer gets the bound, and the 2R.0
assertion is **inverted in place** rather than deleted — a deleted assertion
would leave the repair unguarded.

## 4. Evidence

| what | where |
|---|---|
| the rule in words, and the refusal to render one | `recurrence-language.test.ts` — 14, including a sweep of every expressible rule through both locales asserting no frequency literal, brace, `RRULE` or `-1` reaches the sentence |
| the derivation that keeps the modal a control | `recurrence-derivation.test.ts` — 16, every derived rule parsed back through the schema the RPC uses |
| the lookup that moved | `repeat-labels.test.ts` — 9 |
| the composer | `reminder-composer.test.tsx` — the field-count comparison, the closed option list, the default, the refused-save case, keyboard operation, the pre-existing live region |
| the calendar | `calendar-projection.test.ts`, `calendar-view.test.tsx`, and the lane assertion in `e2e/calendar.spec.ts` **measured on the rendered page with the real stylesheet** |
| the journey | `e2e/online-phase-2r-recurrence.spec.ts` — desktop, phone viewport, both locales, axe at `serious`. **Manual lane** |
| mutation controls | **eight**, each verified to have landed before the run |

## 5. What is proved in CI and what is not

Stated rather than implied, because the difference is the whole of
`2R-ACCESS-004`'s *"on rendered pages"*:

- **In CI:** every component and unit case above, the calendar lane assertion
  (rendered page, real stylesheet, computed styles), and the whole pgTAP suite.
- **Manual lane only:** `online-phase-2r-recurrence.spec.ts`, which is where the
  axe pass and the phone-viewport assertions live. The composer is behind auth,
  so the credential-free lane cannot reach it. **No claim is made here that CI
  proved them.**
- **Not proved anywhere by automation:** `2R-MOBILE-003`. See §6.

## 6. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2R-SURFACE-001` | **built** | §1 — one select, field count four → five, no new field when a repetition is chosen |
| `2R-SURFACE-002` | **built** | §1 — three occurrences before saving, from the RPC, in the owner's zone |
| `2R-SURFACE-003` | **built** | §2 — the list and the calendar both say it repeats and how, from one formatter |
| `2R-SURFACE-004` | **built** | §4 — the rule never leaves the server; the sweep asserts what cannot appear |
| `2R-SURFACE-005` | **baseline** | §2 — already true by construction; asserted rather than built |
| `2R-SURFACE-006` | **built** | the typed `copy.ts` block; no locale ternary added |
| `2R-SURFACE-007` | **built** | `satisfies Record<Locale, …>` makes a missing key a build error; the journey renders the second locale |
| `2R-SURFACE-008` | **built** | §3 — controlled fields plus the select reconciliation, with two mutation controls |
| `2R-ACCESS-001` | **built** | the composer case operates the control by keyboard; the journey repeats it in a browser |
| `2R-ACCESS-002` | **built** | the scope choice is a `fieldset`/`legend` radiogroup (slice 2R.2); the new select is labelled |
| `2R-ACCESS-003` | **built** | both live regions render **empty before** their first sentence, asserted on an idle page |
| `2R-ACCESS-004` | **partial** | axe at `serious` is written and runs **only in the manual lane**. Remainder: **`2R-AXE-MANUAL-LANE`** — destination, the closing record's evidence list |
| `2R-ACCESS-005` | **built** | no record in this phase describes any part of it as screen-reader evidence; `phase-2r-declarations.test.ts` enforces it and was not touched |
| `2R-MOBILE-001` | **partial** | now asserted at 375px on a **rendered page in CI** for the public surfaces (§12), and in the manual lane behind auth. The remainder is the lane, not the behaviour |
| `2R-MOBILE-002` | **built** | the dialog gained a height bound and a scroll container at every width (§3), guarded by the inverted 2R.0 assertion; the journey scrolls save into view and asserts it is in the viewport |
| `2R-MOBILE-003` | **undelivered — awaiting a second run** | the checkpoint RAN and returned partial approval with two defects (§0). Both are fixed; a checkpoint that found defects has to be run again. **Not substituted, not claimed** |

**Sixteen addressed here; 47 of 73 cumulatively.** Two are `partial` with a named
remainder and one is `undelivered` with a destination, as `2R-CLOSE-002`
requires.

## 7. What this slice deliberately did not do

No migration. No recurring tasks and no `RRULE` — the only occurrences of that
word in this slice are assertions that it must not appear. No change to the
heartbeat, quiet hours, the daily cap, the 24-hour cooldown or the per-user lock.
No AI call and no BYOK credit. Nothing under `src/features/tasks/`. Signup stays
closed and the rollout gate is untouched. `2P-ACCESS-005` stays **NOT EXECUTED —
OWNER WAIVED**.

## 8. Remainders carried

- **`2R-AXE-MANUAL-LANE`** — *new*. The axe pass and the phone-viewport
  assertions for this surface run only in the manual lane, because the composer
  is behind auth. Destination: the closing record's evidence list, and the
  owner's decision about whether an authenticated CI lane is worth its cost.
- **`2R-OCCURRENCE-CANCEL-IRREVERSIBLE`** — needs DDL.
- **`2R-UNDO-LEDGER-NOT-CLOSED`** — measured, not repaired. 1 of 20 handlers.
- **`2R-TZ-SECOND-AUTHORITY`** — routed by ADR-134.
- **`2R-TASK-RECURRENCE`** — out by `OD-2R-6`.
- **`OD-2R-9`'s two defects**; **the interval gap**, refusal still pinned.
- Unchanged: `2P-ACCESS-005`, `2P-ATTENTION-008`, `RG-DEP-3`,
  `2P-CHAT-007-JOURNEY`, ADR-055 expiring 2026-10-27.

## 9. Where the next session starts

**With the owner.** `2R-MOBILE-003` needs a real device, and `2R-CLOSE-009`
refuses a record that closes it any other way. Slices 2R.4 and 2R.5 are not
started; building 2R.4 on top of an open 2R.3 requirement only the owner can
close would stack work on a pending decision.

Once the checkpoint is done, 2R.4 (`2R-NOTIFY-001` … `-007`) can proceed with no
further authorization — ADR-133 already covers it.

---

## 10. What the checkpoint changed in this record

Three classifications moved, and one of them moved **backwards**, which is the
point of running a checkpoint at all.

| requirement | was | is | why |
|---|---|---|---|
| `2R-SURFACE-001` | built | **built** | the control still is not a form: named inputs went five to six, and the sixth is one name for the whole day picker, shown only for `weekly` |
| `2R-MOBILE-001` | partial | **partial** | now proved on a **rendered page in CI** for the public surfaces, and in the manual lane behind auth. The remainder is the lane, not the behaviour |
| `2R-MOBILE-003` | undelivered — awaiting the owner | **undelivered — awaiting a second run** | the checkpoint ran and found two defects. A checkpoint that found defects has to be run again after they are fixed |

## 11. Defect 1 — several weekdays, one series

### The contract was proved before the code was written

The plan makes a required contract change a stop condition, so the first act was
to ask the deployed database what it already accepts:

- `create_reminder_series_v1` with `weekdays: [1,3,5]` **stores the rule
  verbatim** and materialises **one** occurrence;
- the live occurrence landed on the first *matching* weekday rather than the
  anchor's own, so the multi-day rule was being honoured in full;
- `edit_future` moved it to `[2,4]`;
- `[]`, `[3,1]` and `[1,1]` were each refused at the CHECK constraint.

**No migration. No contract change.** The gap was one line in
`deriveRecurrenceRule`, which collapsed `weekly` to `[anchor.weekday]`.

### What changed

Seven checkboxes, rendered **only** for `weekly`, seeded from the date already on
screen and abandoning that seed the moment the owner ticks anything. The
normalisation the schema demands — range, duplicates, ascending order — lives in
the derivation, because each one is otherwise a refusal the owner meets *after*
pressing save. The operation key carries the days, so two different sets on one
title and date cannot mint one key.

### The stop condition, re-evaluated rather than assumed

`2R-SURFACE-001` says the modal gains the control *without becoming a form*, and
the day picker is new surface. It is still not a form, and the guard measures it
rather than asserting it: **one** new name for seven controls, conditional on one
frequency, while `monthlyDay`, `monthlyWeekday` and `yearly` still take every
parameter from the date above them. `reminder-composer.test.tsx` compares the
field list before and after **each** choice.

## 12. Defect 2 — the iOS field-zoom floor

### It was never this slice's surface

Safari zooms into any focused `input`, `textarea` or `select` below **16px**, and
does not zoom back out. Everything the owner saw after that is a consequence: the
page is wider than the screen, so a centred dialog sits half off it and its
primary action cannot be reached.

`--type-body` is **13.5px**, and a census found **nineteen field rules across ten
stylesheets** below the line — `reminders`, `settings-extended`, `operations`,
`assistant`, `palette`, `history`, `memories`, `relations`, `globals`,
`task-commands`. Every text field in the product did it.

**And it was already known, twice.** `globals.css` carried an explicit
`font-size: 16px` immediately after `font: var(--type-body)` on `.auth-form
input` and on `.settings-fields input` — two surfaces where somebody met the bug
and fixed it locally. *The fix worked and did not spread*, which is why every
field added afterwards reintroduced it.

### What changed

One floor: `--field-font-size-min: 16px`, applied to text fields under
`(pointer: coarse), (max-width: 640px)`. `!important`, because the rules it must
beat reach `(0,2,1)` and the alternative is `:root:root:root input`, which reads
like a typo and would be tidied away.

**No `user-scalable=no` and no `maximum-scale`.** Both would remove the reader's
ability to zoom deliberately — an accessibility regression traded for a layout
one.

Also `dvh` on the shared dialog, with `vh` **ordered before it** as the fallback.
`100vh` on iOS is the viewport with the browser chrome hidden, so a dialog
bounded by it is taller than the space it has — and taller still once the
keyboard is up, which is exactly when the owner needs the button. **That unit was
mine, introduced by this slice.**

### Proved where it can be, and only there

- **In CI, on a rendered page:** no field on any public surface computes below
  16px at 375px, *and* the floor does not match at 1280px. Both directions,
  because a floor applied everywhere would pass the first and silently redesign
  every desktop form.
- **In CI, on the stylesheets:** the floor exists, nothing outranks it, and the
  dialog carries `dvh` after its `vh` fallback.
- **Manual lane:** the authenticated composer, where the owner actually met it.
- **Nowhere by automation:** that the zoom is gone on a real iPhone. That is the
  second checkpoint run, and it is owed.

## 13. Two corrections the repository made during the fix

**The linter refused an effect that seeded state.** The picker's initial day was
first set by a `useEffect` watching the date, and `react-hooks/set-state-in-effect`
rejected it. It was right — that is the shape this repository has recorded three
times as the version that flickers. The value is **derived** per render instead,
with `null` meaning *the owner has not answered*; the effect and its companion
`touched` flag both disappeared.

**The field-count guard fired**, which is what it is for. Updating it was a
deliberate act with the reason written where the count is, rather than a number
raised to make a test pass.
