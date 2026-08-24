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

> **`2R-MOBILE-003` IS DELIVERED — approved on the owner's own iPhone at the
> THIRD run (2026-08-24).** It took three: the first returned two defects, the
> second three more, and the third confirmed every item. §10–§13 record the first
> run, §14–§19 the second — including the one whose report said *visual* and
> whose cause was a wrong write — and §20 the approval. Nothing automated closed
> it, which is what `2R-CLOSE-009` exists to require.

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
| `2R-SURFACE-001` | **built** | §11 — the delivered contract: **one frequency select plus one conditional weekday group shown only for `weekly`**, named inputs five → **six** where the sixth is a single name for all seven day controls, and `monthlyDay`, `monthlyWeekday` and `yearly` still add no field at all. The requirement's property — *the modal gains the control without becoming a form* — is asserted by comparing the field list before and after each choice. *(§1 recorded "one select, four → five" and that was true of the first version; the device checkpoint superseded it when Monday/Wednesday/Friday would otherwise have taken three reminders. The earlier reading is kept in §1 and §11 rather than rewritten.)* |
| `2R-SURFACE-002` | **built** | §1 — three occurrences before saving, from the RPC, in the owner's zone |
| `2R-SURFACE-003` | **built** | §2 — the list and the calendar both say it repeats and how, from one formatter |
| `2R-SURFACE-004` | **built** | §4 — the rule never leaves the server; the sweep asserts what cannot appear |
| `2R-SURFACE-005` | **baseline** | §2 — already true by construction; asserted rather than built |
| `2R-SURFACE-006` | **built** | the typed `copy.ts` block; no locale ternary added |
| `2R-SURFACE-007` | **built** | `satisfies Record<Locale, …>` makes a missing key a build error; the journey renders the second locale |
| `2R-SURFACE-008` | **built — evidence corrected in §15** | §3 named "controlled fields plus the select reconciliation". That evidence was **incomplete**: the requirement was silently false for `weekdays` and `important`, which a form reset emptied while the surface still showed them. The reconciliation it cites is now **deleted**; the requirement holds because the reset no longer happens |
| `2R-ACCESS-001` | **built** | the composer case operates the control by keyboard; the journey repeats it in a browser |
| `2R-ACCESS-002` | **built** | the scope choice is a `fieldset`/`legend` radiogroup (slice 2R.2); the new select is labelled |
| `2R-ACCESS-003` | **built** | both live regions render **empty before** their first sentence, asserted on an idle page |
| `2R-ACCESS-004` | **partial** | axe at `serious` is written and runs **only in the manual lane**. Remainder: **`2R-AXE-MANUAL-LANE`** — destination, the closing record's evidence list |
| `2R-ACCESS-005` | **not-built-by-rule** | the signed rule is the requirement's own: no screen-reader claim is made anywhere in this phase. No record describes any part of it as screen-reader evidence; `phase-2r-declarations.test.ts` enforces the refusal and was not touched. Its destination is `2P-ACCESS-005`, which stays **NOT EXECUTED — OWNER WAIVED**. *(Class corrected at closeout: it read `built`, and a rule's delivery is its recorded refusal.)* |
| `2R-MOBILE-001` | **partial** | now asserted at 375px on a **rendered page in CI** for the public surfaces (§12), and in the manual lane behind auth. The remainder is the lane, not the behaviour |
| `2R-MOBILE-002` | **built** | the dialog gained a height bound and a scroll container at every width (§3), guarded by the inverted 2R.0 assertion; the journey scrolls save into view and asserts it is in the viewport |
| `2R-MOBILE-003` | **built** | approved on the owner's own iPhone at the **third** run, 2026-08-24 (§20). Three runs, five defects, all fixed and each re-tested on hardware. **Not substituted and not claimed** — no Playwright project, including the emulated WebKit one, was ever offered as evidence for it |

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

## 14. The second checkpoint run — three defects, and the first was not visual

`2R-MOBILE-003` ran a **second** time, on the owner's iPhone, after the two
defects of §11 and §12 were fixed. Five things it had reported now hold: no zoom
on a field, one recurrence accepting Monday, Wednesday and Friday, a preview
showing the right dates, one series rather than three, and the button still
reachable.

It came back with **three more**, and the checkpoint remains **undelivered —
awaiting a third run**. `2R-CLOSE-009` refuses a record that closes it any other
way, and slice 2R.4 is still not started.

| | |
|---|---|
| corrective PR | #302 |
| migrations | **zero created.** 101 = 101, parity `202608230101` |
| gates | lint 0 errors · typecheck clean · **9315/9315** · build passes |
| journeys | **266/266** CI e2e · **15/15** new browser lane, desktop + Pixel 7 + iPhone 15 (WebKit) |

## 15. Defect 3 — the modal showed three days and would have saved one

> *"Ao selecionar segunda, quarta e sexta e tocar em 'Ver próximas datas', os
> dias ficam visualmente desmarcados. Apesar de desmarcados na interface, a
> prévia continua correta."*

Reported as a visual defect. **It was a write defect.** The round trip was
instrumented before a line was changed:

```
before the preview   .checked = 1,3,5
FormData -> preview  weekdays = [1,3,5]     <- why the preview looked right
after the response   .checked = 1
FormData -> save     weekdays = [1]         <- what would have been written
```

React resets a form it submitted once the action settles, returning every
control to its `defaultChecked`. It restores a controlled *text* input
afterwards; it does **not** restore a controlled `checked`. So the preview,
computed from the `FormData` captured at submit time, was always right — and the
save, computed from the DOM the reset had emptied, was always wrong.
`deriveRecurrenceRule` reads an empty set as *the owner said nothing* and falls
back to the anchor's own weekday.

**The dialog showed three days, promised three days, and would have written
one.** The same reset silently unticked *importante*. A field that lies about
what will be saved is precisely the shape `2R-SURFACE-008` exists to prevent.

### Fixed by removing the reset, not by compensating for it

This file already carried a `useEffect` that pushed `choice` back into the
`<select>` after every render, because that element had the same problem.
Extending that shape to seven checkboxes and a tickbox would have been four more
places where the DOM is corrected behind React's back — the *"duplicação de
autoridade entre DOM, estado React e servidor"* the checkpoint's contract forbids
in terms.

So `onSubmit` and a plain button hand the `FormData` to `useActionState`'s
dispatch directly. React only resets a form it submitted itself, so nothing is
reset and nothing needs restoring, and **the `<select>` workaround was deleted
rather than joined**. Constraint validation still runs — `onSubmit` fires only
for a valid form. `startTransition` is required with it: a dispatch React did not
route reports `pending` only from inside one, and the suite said so directly the
first time it was written without.

It also restored a claim this file made and did not honour. The preview button
carried `formNoValidate` and a comment saying previewing before naming a reminder
is reasonable — but it was a submit button, so an empty `required` title was
refused by constraint validation and the action never ran at all.

**The mutation controls**, because a test that passes beside a defect is not a
test that detects it:

| mutation | result |
|---|---|
| preview back to `formAction` | 3 fail |
| save back to `action={submit}` | 2 fail — including the `<select>` case, proving the deleted workaround was load-bearing *before* and obsolete *after* |

## 16. Defect 4 — nothing in this repository had ever locked the document

> *"Com o modal aberto, ainda consigo rolar a página atrás dele."*

A census of `overflow: hidden`, `body.style.overflow` and `overscroll` across the
whole repository found three horizontal-scroll containers and **nothing that
touched the document**. Every modal the product has ever shown — six
`ConfirmDialog` consumers, the command palette, the trust panel — let the page
move behind it. This was never a Lembretes defect.

`useScrollLock` takes the body **out of flow**. `overflow: hidden` on `<body>` is
the answer everyone writes first and iOS ignores it for touch, which is exactly
the device the checkpoint is performed on. The rest is the half that is easiest
to leave out:

- the offset rides in `top` and is given back on release — *"ao fechar, a página
  retorna exatamente à posição anterior"*;
- the scrollbar's width is measured and **added to the computed padding**, not
  assigned over it, so `env(safe-area-inset-right)` survives;
- a module-scope counter means a stacked dialog cannot release someone else's
  lock, and the restore uses what the **first** lock saw;
- release runs from the effect's cleanup, so a route change under an open dialog
  still unlocks — a lock that outlives its dialog is a page that can never
  scroll again.

Mutation control: dropping the stacking counter fails two tests.

## 17. Defect 5 — the backdrop was a `<div>` with no handler

> *"Tocar fora do modal não fecha o modal."*

Literally true, on every dialog in the product. It now means cancel, with
`pointerdown` and `click` **paired**: a drag that begins in a field and ends past
the panel produces a `click` whose target is the backdrop, and acting on that
alone interrupts someone mid-edit. Escape and the cancel button route through the
same `requestClose`, because three copies of one rule is how two of them end up
different.

A dialog holding something asks first — **inside the same panel**, so there is no
second backdrop and no nested dialog. The body is `hidden`, never unmounted,
because unmounting the form would empty exactly what the question is asking
whether to throw away.

### `discard` is required and nullable, and it earned that immediately

The first typecheck after the change **refused two call sites**. The census:

| consumer | holds | declares |
|---|---|---|
| `delete-entity-control` | hidden inputs, buttons | `null` |
| `command-console` | hidden `intent`, buttons | `null` |
| `task-detail-controls` | hidden fields, buttons | `null` |
| `company-panel` | a typed name, a select | guard |
| `memory-composer` | a textarea | guard |
| `reminder-composer` | the whole form | guard |

Whether anything changed is derived **by the dialog, from its own forms** — not
by each consumer, because every consumer that had to answer it would answer it
slightly differently and one of them would be wrong. Two consequences are
requirements rather than bonuses: a focused field is not a changed one, and
reverting an edit by hand returns to clean. It also covers the two fields that
live only in the DOM, which a check built from React state would have called
clean while holding both.

A **seventh** close path turned up during the census: the memory composer's own
*Cancelar* called that component's `closeDialog` directly, straight past the
question, on the one dialog whose whole content is a sentence the owner wrote. It
is marked `data-dialog-close` now and the panel delegates it.

Mutation controls: a backdrop that closes on any click fails the drag case; a
body unmounted instead of hidden fails the content-intact case.

## 18. What the browser corrected, and what it did not

The new lane runs on desktop, Pixel 7 and **iPhone 15 — WebKit**, the engine
closest to the owner's device. Three things it corrected, **none of them in the
product**:

- the pre-existing `online-phase-2r-recurrence.spec.ts` **cannot be listed or run
  in this development environment at all**: its `createRequire(import.meta.url)`
  is transformed to CommonJS and Node then refuses the `import.meta`. Reproduced
  against the pristine file *before* anything was added to it. That lane also
  opens the composer by the **save** button's label rather than the opener's — so
  slice 2R.3's authenticated acceptance has evidently never executed;
- `reminder_series` grants `authenticated` select and nothing else, so a
  service-role read returns `42501`. Reading as the owner is both the only key
  that works and the more honest one, since RLS applies;
- `locator.click()` scrolls its target into view. The first scroll test therefore
  put the page back to zero **before the lock engaged** and measured the harness
  rather than the product — it read `top: 0px`. **Two speculative product changes
  were made on that false reading and both were reverted**: the defect was
  entirely in the test, and the lock needed neither.

The last of these is the one worth carrying: *a failing browser test is a claim
about the harness until it is measured.* The probe named the captured offset, and
the offset was the answer.

## 19. Where the next session starts

**With the owner, and the same device — a third run.** Nothing here discharges
`2R-MOBILE-003`, and a Playwright run on emulated WebKit is not an iPhone.

1. open `/pt-BR/app/reminders` on the phone;
2. select **Monday, Wednesday and Friday**, open and refresh the preview, and
   confirm **the three stay ticked**;
3. save, and confirm **one** recurrence carrying all three days;
4. open the modal and try to scroll the page behind it;
5. tap outside with the form **clean** — it should close;
6. tap outside with content filled — it should **ask**;
7. choose *continuar editando*, and confirm nothing was lost;
8. tap outside again and confirm the discard;
9. repeat with **Escape** on the desktop;
10. confirm there is still no zoom and no sideways scrolling.

## 20. The third run — approved

`2R-MOBILE-003` **ran a third time on the owner's own iPhone and passed.** Every
item on the list came back confirmed:

| Checked on hardware | Result |
|---|---|
| Monday, Wednesday and Friday stay ticked after opening **and refreshing** the preview | pass |
| one recurrence saved, carrying all three days | pass |
| the page behind the modal does not scroll | pass |
| tapping outside a **clean** form closes immediately | pass |
| tapping outside a **changed** form asks first | pass |
| *continuar editando* preserves the whole content | pass |
| confirming the discard closes correctly | pass |
| no zoom, no sideways scrolling | pass |
| Escape on the desktop follows the same clean/changed rule | pass |

**Three runs, five defects.** Two found by the first run, three by the second,
and none by the third. The record is worth keeping in that shape rather than
flattened into "the checkpoint passed", because the thing that made it work was
re-running it after every fix instead of reasoning that the fix must have held.

**What closed it was a person with the device.** No automated lane was offered as
a substitute at any point — not the jsdom suite, not the CI journeys, and
explicitly not the `iphone-emulated` Playwright project, which runs on WebKit and
is still not an iPhone. `2R-CLOSE-009` asks for exactly that distinction, and
the three-run history is the evidence that it was honoured rather than asserted.

**Slice 2R.3 is closed.** Every requirement it carries is classified, and the
remainders it carries forward are unchanged and undischarged:
`2R-AXE-MANUAL-LANE`, `2R-RECURRENCE-LANE-UNRUNNABLE`, `2R-DRAWER-NOT-LOCKED`.
