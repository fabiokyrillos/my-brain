# Phase 2R — Rotina: o que se repete

**Status: PLANNING ONLY. Nothing here is implemented, and nothing here is
classified as delivered.** This document declares requirements; it does not
report them. No requirement below carries a delivery class, because a
requirement classified before it is built is a claim nobody measured.

**Governing pair:** this PRD and
[`PHASE_2R_IMPLEMENTATION_PLAN.md`](./PHASE_2R_IMPLEMENTATION_PLAN.md).
**Evidence:** [`docs/reports/phase-2r/`](../../reports/phase-2r/).
**Derived from:** [`PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md`](../../reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md) — read it first.
**Theme comparison:** [`PHASE_2R_THEME_OPTIONS.md`](./PHASE_2R_THEME_OPTIONS.md).

---

## 1. The subject

**The product has no concept of anything that repeats.**

`public.reminders` is created in `202607160007_agent_operations.sql` with
`id · user_id · task_id · entry_id · title · remind_at · important · status ·
snoozed_until · sent_at · created_at · updated_at`, and altered exactly once
since. **There is no recurrence column of any kind**, and no `rrule`,
`recurrence` or `repeat_*` anywhere in `supabase/migrations/`.

A personal contextual agent that cannot hold *"toda segunda-feira"*, *"todo dia
1º"* or *"a cada trimestre"* cannot hold the part of a life that is routine.
Phase 2P met this edge and refused it on budget: `2P-REMINDER-002` named
recurrence, recurrence needed a third migration that phase had not allocated, and
the remainder `2P-REMINDER-RECURRENCE` was **refused by name**. That refusal was
about budget, not about desirability, and only the owner could lift it.
**`OD-2R-8` is SIGNED as option A and the refusal is LIFTED** (ADR-132
Decision 1), **strictly limited to reminders** — it does not reach tasks, the
calendar, or any other object.

**What the owner should be able to do when this phase closes:** create a reminder
that repeats, see the next occurrences before saving, change *this one* without
changing *all of them*, end a series without deleting its history, and have every
one of those arrive at the right wall-clock time across a daylight-saving
boundary.

### 1.1 What this phase is not

It is **not** a container for the project's accumulated debt. The audit's §7
names every inherited item with a destination, and §6 of the theme document names
every exclusion. Both are binding.

---

## 2. Owner decisions — ALL NINE SIGNED (ADR-132, 2026-08-23)

**All nine are SIGNED, and every one took its recommendation.** ADR-132 records
them; **ADR-131 is not edited**. Each decision below keeps its original context,
options, recommendation and consequence **exactly as they were written before
the signature** — the record of what was offered is what makes a signature
auditable, so nothing here is rewritten to agree with the outcome.

**Signing is not authorizing implementation.** No slice may start, no product
code may be written and **no migration file may be created** until a separate
owner decision authorizes implementation. That authorization does not exist.

| decision | signed | ADR-132 |
|---|---|---|
| `OD-2R-8` — lift the recurrence refusal | **A** — lifted, **limited to reminders** | Decision 1 |
| `OD-2R-1` — the theme | **A** — Rotina: o que se repete | Decision 2 |
| `OD-2R-2` — the recurrence model | **A** — closed set; `RRULE` refused by name | Decision 3 |
| `OD-2R-3` — how occurrences exist | **A** — exactly one materialised at a time | Decision 4 |
| `OD-2R-4` — this one, or all of them | **A** — always ask, default to the narrower | Decision 5 |
| `OD-2R-5` — daylight saving | **A** — wall-clock, three edge cases decided | Decision 6 |
| `OD-2R-6` — recurring tasks | **A** — OUT; remainder `2R-TASK-RECURRENCE` | Decision 7 |
| `OD-2R-7` — the migration budget | **A** — **1 ALLOCATED**, exclusive destination | Decision 8 |
| `OD-2R-9` — the two proved defects | **A** — separate small initiative | Decision 9 |

### `OD-2R-1` — the theme itself

**SIGNED — option A**, as recommended. ADR-132 Decision 2 — the theme is Rotina; B, C and D are declined by name.

**Context.** The published roadmap ends at Phase 2O. Phases 2P and 2Q were each
derived from a measured census, and so is this. There is no predefined theme for
the letter after 2Q, and inventing one would be the error the phase-start guard
exists to prevent.

- **(A) Rotina — what repeats (recommended).** The subject of §1.
- **(B) Autonomy — the agent acts.** Highest value; **disqualified today** by
  audit §4 as corrected by §10.2 — `automation_calibration_observations` holds
  **2** rows against a `task` threshold of 50 at 0.90 precision, evidence accrues
  at two rows per reviewed entry, and **four of the six categories still have no
  producer at all**.
- **(C) Find it, and come back to it.** Audit §8's two proved defects. Low risk,
  **zero migrations**, and honestly **a slice rather than a phase**.
- **(D) Evidence for autonomy** — `project` and `organization` review flows only.

**Consequence.** Choosing B, C or D **replaces** the requirement set below rather
than amending it, and the estimate is re-derived. This is stated so that the
recommendation cannot be mistaken for a decision already taken.

**Effect if A:** budget and estimate as in §5 and the plan. **If C:** zero
migrations, roughly a third of the schedule. **If B or D:** a new audit of what
evidence could exist is a precondition, not a slice.

### `OD-2R-2` — the recurrence model

**SIGNED — option A**, as recommended. ADR-132 Decision 3 — a closed set of enumerated patterns; **`RRULE` is refused by name**.

**Context.** Nothing exists to inherit. The two shapes that could work differ in
cost by more than they differ in capability.

- **(A) A closed set of enumerated patterns (recommended)** — daily, weekly on
  chosen weekdays, monthly on a day-of-month, monthly on an ordinal weekday,
  yearly. Stored as a validated JSON object with a `version` field.
- **(B) An RFC 5545 `RRULE` subset**, stored as text and parsed.

**Recommendation A**, for one reason that is not taste: **option B's failure mode
is silent.** An `RRULE` the parser accepts and interprets differently from the
writer produces reminders at wrong times with no error anywhere. A closed set is
validated at the boundary, is exhaustively testable, and covers every pattern a
personal reminder actually needs.

**Consequence of B:** a parser and a generator become the highest-risk code in
the phase, plus a dependency decision. **+2 to +4 days.**

### `OD-2R-3` — how occurrences exist

**SIGNED — option A**, as recommended. ADR-132 Decision 4 — exactly one materialised occurrence at a time.

**Context.** `reminders` rows are consumed by the heartbeat, which runs hourly
via `pg_cron` and selects on `(user_id, status, remind_at)`.

- **(A) Compute on read, materialise one row ahead (recommended).** The series
  holds the rule; exactly one concrete `reminders` row exists for the next
  occurrence, and completing it materialises the following one.
- **(B) Materialise a horizon** — every occurrence for the next N months as real
  rows.
- **(C) Compute entirely on read**, with no concrete row.

**Recommendation A.** It keeps the heartbeat's existing query, its per-user lock,
its quiet hours, its daily cap and its 24-hour cooldown **completely unchanged**
— they already operate on `reminders` rows and would keep operating on exactly
one. **C** would require every one of those to learn about rules. **B** creates
an unbounded row count and makes *"edit the series"* a bulk rewrite.

**Consequence of B:** a backfill, a horizon-extension job, and a bulk-edit path.
**+3 days and probably a second migration.** **Of C:** the heartbeat, the agenda,
the calendar and notifications all change. **+5 days.**

### `OD-2R-4` — this one, or all of them

**SIGNED — option A**, as recommended. ADR-132 Decision 5 — every edit asks, and the default is **this occurrence**.

**Context.** The product has **no vocabulary** for either concept today, so both
the semantics and the words are new.

- **(A) Every edit asks, and the default is "this one" (recommended).**
- **(B) Editing always changes the series**, with a separate control to detach an
  occurrence.
- **(C) Editing always changes only the occurrence**, with a separate control to
  edit the series.

**Recommendation A**, with the default being the **narrower** action. A control
whose default silently changes every future occurrence is the shape of an
irreversible surprise, and this repository's standard requires an explicit
confirmation for exactly that.

### `OD-2R-5` — daylight saving

**SIGNED — option A**, as recommended. ADR-132 Decision 6 — wall-clock intention, and all three unrepresentable cases signed.

**Context.** This is the decision most likely to be got wrong, and this
repository has been wrong here before: three different local-day implementations
existed simultaneously, two wrong in opposite directions, and a fixed instant
lands in the previous day where local midnight does not exist.

- **(A) A recurrence is a wall-clock intention (recommended).** *"09:00 every
  weekday"* means 09:00 local, before and after a DST transition, and the
  absolute instant moves.
- **(B) A recurrence is a fixed interval.** The absolute instant is preserved and
  the local time shifts by an hour.

**Recommendation A.** It is what a person means. **B** is defensible only for
machine schedules, and this is a reminder for a human.

**The two unrepresentable cases must be decided, not discovered**, and neither
has a natural answer:

1. a local time that **does not exist** on a spring-forward day;
2. a local time that **occurs twice** on a fall-back day;
3. *"the 31st"* in a month with 30 days or fewer.

**Recommendation:** skip-forward to the first valid instant, take the **first**
occurrence of a doubled time, and **clamp** a too-large day-of-month to the
month's last day — each asserted by a test that fails if the behaviour changes.

### `OD-2R-6` — recurring tasks

**SIGNED — option A**, as recommended. ADR-132 Decision 7 — recurring tasks are OUT; remainder **`2R-TASK-RECURRENCE`**.

**Context.** Tasks are a different object with a confirmation lifecycle,
dependencies, projects, people and an undo contract. Reminders are not.

- **(A) Out of this phase (recommended).** Named as a remainder with a
  destination.
- **(B) In.**

**Consequence of B:** the confirmation lifecycle, the task graph and the undo
compensation all acquire a recurrence dimension. **This is a second phase in
disguise: +6 to +9 days and at least one further migration.**

### `OD-2R-7` — the migration budget

**SIGNED — option A**, as recommended. ADR-132 Decision 8 — exactly one migration **ALLOCATED**; a second is a stop condition.

**Context.** §5 proves the need. Phase 2Q spent exactly one and treated a second
as a stop condition; that shape is proposed again.

- **(A) Exactly one, whose sole destination is the recurrence model
  (recommended).** A second of any kind is a **stop condition**.
- **(B) Two**, the second reserved for notification or agenda needs.
- **(C) None** — which makes this phase unbuildable and is listed only so that
  the budget has a floor as well as a ceiling.

**This ADR-authored package allocates none.** Allocation requires the owner's
signature in the implementation authorization.

### `OD-2R-8` — lifting the `2P-REMINDER-RECURRENCE` refusal

**SIGNED — option A**, as recommended. ADR-132 Decision 1 — the refusal is **LIFTED**, strictly limited to reminders.

**Context.** ADR-123's amendment refused recurrence **by name** while correcting
`2P-REMINDER-002`. A refusal recorded by the owner is lifted by the owner and by
nobody else — least of all by a later phase quietly planning the thing.

- **(A) Lift it, scoped to reminders (recommended).**
- **(B) Keep it refused** — which makes `OD-2R-1` option A void and forces
  another theme.

**This is a genuine gate, not a formality.** If the owner does not lift it, the
phase does not have its subject.

### `OD-2R-9` — audit §8's two proved defects

**SIGNED — option A**, as recommended. ADR-132 Decision 9 — a separate small initiative.

**Context.** A search cannot be linked or returned to; the *Precisa de você*
filter is lost on back navigation. Both are proved in the audit. Neither is about
recurrence.

- **(A) A small separate initiative (recommended).** Keeps this phase coherent.
- **(B) Into Phase 2R as one extra family.** **+2 days**, and it makes the phase
  two things.
- **(C) Backlog**, unscheduled.

**Recommendation A**, on the owner's own standing instruction that the successor
must not become a container for accumulated debt.

---

## 3. Requirements

**Seventy-three requirements across ten families.** Every one has a stable
identifier, belongs to exactly one family, is sequential within it, states an
**observable** criterion, names the slice that delivers it, and declares its
dependencies and the decisions it rests on.

**No requirement carries a delivery class.** Classification happens at closeout,
from the slices' own acceptance records, and never from this document.

**Family names contain letters only.** `2K-A11Y` was invisible to every prose
count *and* to the phase-start detector because its family name contained
digits — the detector's family pattern is `[A-Z]+`. This phase therefore names
its accessibility family **`2R-ACCESS`**, and `2R-CLOSE-006` makes the property
checkable rather than remembered.

**Legend for the *Kind* column — what the requirement asks for, not what happened:**
**build** = new behaviour; **baseline** = an existing property this phase must
prove still holds; **rule** = something deliberately not built, whose delivery is
the recorded refusal.

### `2R-FOUNDATION` — measure before changing anything · slice 2R.0

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-FOUNDATION-001` | The absence of recurrence is re-proved at slice start, not inherited from this PRD | A record shows `reminders`' live column list and the migration scan, both taken at the slice's own baseline SHA | baseline | — |
| `2R-FOUNDATION-002` | The heartbeat's current behaviour is measured before anything touches it | Quiet hours, daily cap, 24-hour cooldown and the per-user lock each recorded as observed, with the query that observed them | baseline | — |
| `2R-FOUNDATION-003` | The reminder surface's current shape is recorded | The modal's current field groups listed from the component, not from Phase 2P's description | baseline | — |
| `2R-FOUNDATION-004` | The owner's timezone resolution path is identified and named | The single function every surface uses is named, and any second path is reported as a defect | baseline | — |
| `2R-FOUNDATION-005` | Zero product behaviour changes in this slice | The slice's diff contains no change under `src/features/**` or `supabase/migrations/**` that alters behaviour | build | — |
| `2R-FOUNDATION-006` | The audit's automation finding is re-checked against the live database at slice start | `automation_category_policies` is re-read **whatever its row count**, and the record confirms or corrects audit §10.3. *(The criterion said "the four rows" until 2026-08-23, when there were none — a criterion that names a count cannot survive the count changing, which is the defect it exists to catch.)* | baseline | — |

### `2R-MODEL` — the recurrence model · slice 2R.1

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-MODEL-001` | A reminder may carry a recurrence rule | A reminder created with a rule persists it and reloads it unchanged | build | `OD-2R-2`, `OD-2R-7` |
| `2R-MODEL-002` | The rule is validated at the boundary, and an invalid rule is refused | A malformed rule is rejected with a named reason; no invalid rule reaches storage | build | `OD-2R-2` |
| `2R-MODEL-003` | The rule is versioned | Every stored rule carries a version; a rule of an unknown version is refused rather than guessed at | build | `OD-2R-2` |
| `2R-MODEL-004` | A reminder without a rule behaves exactly as it does today | The existing reminder journeys pass unchanged, asserted as an equality against the pre-slice behaviour | baseline | — |
| `2R-MODEL-005` | Exactly one concrete occurrence exists at a time | After creating a series, exactly one `reminders` row for it has `status = 'scheduled'` | build | `OD-2R-3` |
| `2R-MODEL-006` | Completing an occurrence materialises the next | The row's status moves and exactly one new scheduled row appears, at the rule's next instant | build | `OD-2R-3` |
| `2R-MODEL-007` | Materialisation is idempotent | Running it twice for the same occurrence produces one row, enforced by the database rather than by the caller | build | `OD-2R-3` |
| `2R-MODEL-008` | The series is owner-scoped and proved so | A second owner cannot read, alter or materialise another owner's series; asserted through real roles with RLS enforced | build | — |
| `2R-MODEL-009` | The migration's destination is exclusive | The migration touches only what `OD-2R-7` names and nothing else, asserted against its own diff | build | `OD-2R-7` |

### `2R-TIME` — wall-clock correctness · slices 2R.1 and 2R.2

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-TIME-001` | A recurrence is a wall-clock intention | Across a DST transition the local time is preserved and the absolute instant moves | build | `OD-2R-5` |
| `2R-TIME-002` | A local time that does not exist resolves deterministically | A spring-forward case produces the decided instant, and the test fails if the behaviour changes | build | `OD-2R-5` |
| `2R-TIME-003` | A local time that occurs twice resolves deterministically | A fall-back case produces the decided occurrence, asserted the same way | build | `OD-2R-5` |
| `2R-TIME-004` | A day-of-month larger than the month resolves deterministically | *"The 31st"* in a 30-day month produces the decided day | build | `OD-2R-5` |
| `2R-TIME-005` | One timezone authority, not several | Every surface showing an occurrence resolves the zone through the single path `2R-FOUNDATION-004` named | baseline | `2R-FOUNDATION-004` |
| `2R-TIME-006` | The owner's zone, never the browser's | A client whose zone differs from the profile's shows the profile's | baseline | — |
| `2R-TIME-007` | Occurrence instants are computed in one place | Two surfaces showing the same occurrence cannot disagree, asserted by both reading the same function | build | — |

### `2R-SERIES` — this one, or all of them · slice 2R.2

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-SERIES-001` | Editing an occurrence asks which scope is meant | The control offers *this one* and *this and future*, and the default is the narrower | build | `OD-2R-4` |
| `2R-SERIES-002` | *This one* leaves the series untouched | The edited occurrence changes; the rule and every later occurrence do not | build | `OD-2R-4` |
| `2R-SERIES-003` | *This and future* changes the rule from that point | Earlier occurrences keep their recorded values | build | `OD-2R-4` |
| `2R-SERIES-004` | A detached occurrence stays detached | A later series edit does not silently reclaim it | build | `OD-2R-4` |
| `2R-SERIES-005` | A series can be ended without destroying its history | Ending stops future occurrences; past ones remain readable | build | — |
| `2R-SERIES-006` | Cancelling one occurrence is not cancelling the series | Cancelling one leaves the next materialised | build | `OD-2R-4` |
| `2R-SERIES-007` | Every series operation is reversible, and the undo is tested | Each operation has a real undo that restores the prior state, exercised in a test rather than asserted | build | — |
| `2R-SERIES-008` | An irreversible series operation requires explicit confirmation | Any operation without a real undo names itself and asks first | build | — |
| `2R-SERIES-009` | The scope actually applied is reported back | After the edit, the surface states which scope was applied | build | `OD-2R-4` |

### `2R-SURFACE` — creating and reading a routine · slice 2R.3

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-SURFACE-001` | Recurrence is offered where a reminder is created | The existing modal gains the control without becoming a form | build | `OD-2R-2` |
| `2R-SURFACE-002` | The next occurrences are visible before saving | At least the next three are shown, in the owner's zone and locale | build | — |
| `2R-SURFACE-003` | A recurring reminder is identifiable as recurring | Any surface listing it shows that it repeats, and says how | build | — |
| `2R-SURFACE-004` | The rule is stated in the owner's words, never as a rule string | No surface renders a raw rule, an `RRULE` or a JSON fragment | build | `OD-2R-2` |
| `2R-SURFACE-005` | Recurring occurrences appear on the calendar and the agenda | An occurrence appears on the day it falls, in both surfaces | build | `OD-2R-3` |
| `2R-SURFACE-006` | Copy goes through the typed feature module | New copy lives in a typed `copy.ts`, not in scattered locale ternaries | build | — |
| `2R-SURFACE-007` | Both locales are complete | `pt-BR` and `en` both render every new string, asserted per key | build | `2R-SURFACE-006` |
| `2R-SURFACE-008` | A failed save never discards what the owner typed | After a refused save the fields still hold their values | build | — |

### `2R-NOTIFY` — delivery, without multiplying it · slice 2R.4

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-NOTIFY-001` | Quiet hours still hold for recurring occurrences | An occurrence inside quiet hours is not delivered inside them | baseline | `2R-FOUNDATION-002` |
| `2R-NOTIFY-002` | The daily cap still holds | A series cannot exceed the existing per-day cap | baseline | `2R-FOUNDATION-002` |
| `2R-NOTIFY-003` | The 24-hour cooldown still holds | Recurrence does not create a path around it | baseline | `2R-FOUNDATION-002` |
| `2R-NOTIFY-004` | One user's series cannot block another user's batch | A failure in one series leaves other users' deliveries unaffected | baseline | — |
| `2R-NOTIFY-005` | A missed occurrence does not produce a burst | A series unprocessed for days delivers at most what the cap allows, never a backlog at once | build | `OD-2R-3` |
| `2R-NOTIFY-006` | Notification content stays content-free | Type, destination and locale only — nothing naming a task, a person or a day | baseline | — |
| `2R-NOTIFY-007` | Push is not resumed, repaired or claimed by this phase | No requirement, test or record asserts push delivery on a device | rule | — |

### `2R-TRUST` — authority, audit and honesty · across slices

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-TRUST-001` | Every automatic materialisation is auditable | Actor, source, reason, target, time and resulting state are recorded for each | build | `OD-2R-3` |
| `2R-TRUST-002` | Materialisation is not an automation category | It carries no `automation_category_policies` state and is not reported as autonomy | build | — |
| `2R-TRUST-003` | No automation category changes state | All six read exactly as at the phase's baseline, re-read at closeout | baseline | `2R-FOUNDATION-006` |
| `2R-TRUST-004` | No grant, RLS policy, retention rule or authority moves | Asserted against the migration's own diff | baseline | — |
| `2R-TRUST-005` | Recurrence writes are never plain client writes | Authorization lives in a validated RPC or Server Action, never in the browser | build | — |
| `2R-TRUST-006` | A surface never claims an occurrence it cannot prove | Where the next instant is unknown the surface says so instead of showing a guess | build | — |
| `2R-TRUST-007` | No AI call is made by this phase | The phase spends no credential; a half needing one is recorded **unspendable**, never as a pass | rule | — |

### `2R-ACCESS` — reachable by everyone · slice 2R.3

*Named `2R-ACCESS`, letters only, for the reason §3 gives.*

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-ACCESS-001` | The recurrence control is reachable and operable by keyboard | Every control is focusable and operable without a pointer | build | — |
| `2R-ACCESS-002` | The scope choice is announced, not only shown | The choice has an accessible name and its state is programmatically determinable | build | `OD-2R-4` |
| `2R-ACCESS-003` | The result of a series edit reaches a live region that already exists | The region is present and empty before its text arrives, never created with it | build | `2R-SERIES-009` |
| `2R-ACCESS-004` | Contrast holds on the new controls in both themes | axe reports no `color-contrast` violation at `serious` on the surfaces this phase touches | build | — |
| `2R-ACCESS-005` | No screen-reader claim is made anywhere | No record describes any part of this phase as screen-reader evidence; `2P-ACCESS-005` stays **NOT EXECUTED — OWNER WAIVED** | rule | — |

### `2R-MOBILE` — on the device it is used on · slice 2R.3

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-MOBILE-001` | The recurrence control is usable on a phone viewport | Every control is reachable and hittable at the mobile breakpoint, with no sideways scroll | build | — |
| `2R-MOBILE-002` | The occurrence preview does not push save off screen | The primary action stays reachable with the preview expanded | build | `2R-SURFACE-002` |
| `2R-MOBILE-003` | The owner confirms it on their own device | An owner checkpoint item, run on real hardware — **not** substitutable by a Playwright run or a document | build | — |

### `2R-CLOSE` — the phase can be audited after it ends · slice 2R.5

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2R-CLOSE-001` | A generated matrix classifies every requirement exactly once | `scripts/generate-phase-2r-traceability.mjs` emits **73** classified, 0 unclassified, and refuses a stale matrix byte for byte | build | — |
| `2R-CLOSE-002` | Every `partial` and `not-built-by-rule` names a remainder and a destination | The generator refuses a matrix where one does not | build | `2R-CLOSE-001` |
| `2R-CLOSE-003` | The matrix is generated from the slices' acceptance records, never typed | Regenerating at closeout reproduces the merged file byte for byte | build | `2R-CLOSE-001` |
| `2R-CLOSE-004` | A requirement with no slice fails the build | The declaration guard refuses it | build | — |
| `2R-CLOSE-005` | A requirement with no observable criterion fails the build | The declaration guard refuses it | build | — |
| `2R-CLOSE-006` | A family name containing a digit fails the build | The guard proves every declared family matches `^[A-Z]+$`, with a two-sided control showing a digit-bearing family would be invisible to the detector's `[A-Z]+` pattern | build | — |
| `2R-CLOSE-007` | A migration without a named exclusive destination fails the build | The guard refuses it | build | `OD-2R-7` |
| `2R-CLOSE-008` | A decision presented as a recommendation instead of a signature fails the build | The guard refuses a package where an `OD-2R-*` is marked signed without an accepted ADR naming it | build | — |
| `2R-CLOSE-009` | Hardware proof cannot be discharged by a document | The guard refuses a record that marks `2R-MOBILE-003` satisfied without an owner device checkpoint | build | `2R-MOBILE-003` |
| `2R-CLOSE-010` | The phase after this one cannot start | The retargeted phase-start detector finds no start signal for the successor | build | — |
| `2R-CLOSE-011` | Every inherited remainder is carried with its destination | The closing record reproduces audit §7 with no item dropped or silently absorbed | build | — |
| `2R-CLOSE-012` | The phase does not close on a green pipeline | Closure requires an owner decision recorded as an ADR after a device checkpoint | build | `2R-MOBILE-003` |

---

## 4. Traceability

The contract is
[`PHASE_2R_TRACEABILITY_CONTRACT.md`](../../reports/phase-2r/PHASE_2R_TRACEABILITY_CONTRACT.md).
It defines the classification vocabulary, the refusals, and the shape a slice's
acceptance record must have for the generator to read it.

**The package fails closed** for: a requirement with no slice; a requirement with
no observable criterion; a decision hidden as a recommendation; a migration with
no destination; a `partial` with no remainder; a hardware proof replaced by a
document; a successor phase started; and **a requirement made invisible by the
family regex.**

---

## 5. The migration, and why the schema cannot carry this

**Proved, not asserted.** `public.reminders` holds twelve columns, none of which
can express repetition:

```
id · user_id · task_id · entry_id · title · remind_at · important
status · snoozed_until · sent_at · created_at · updated_at
```

`remind_at` is a single `timestamptz`. There is no column that could hold a rule,
no table that relates occurrences to a series, and no `jsonb` column on the table
at all — so, unlike Phase 2Q's `summaries.citations`, **there is not even an
unused column to repurpose.** A recurrence cannot be represented without schema.

**Candidate migration — one.**

| | |
|---|---|
| **Problem it solves** | a reminder cannot repeat |
| **Why the schema cannot carry it** | proved above |
| **Exclusive destination** | the recurrence model — `OD-2R-2`'s shape and the series-to-occurrence relation. Nothing else. |
| **Order** | migration → writer → consumer. The column exists before anything writes it, and the surface reads only what the writer produced |
| **Risks** | a series-to-occurrence relation must prove ownership by composite FK `(user_id, id)`; a materialisation path must be idempotent **in the database**, not in the caller |
| **pgTAP** | ownership, forced RLS, least-privilege grants, the uniqueness that makes materialisation idempotent, and a negative control proving a second owner is refused |
| **Hosted proof** | parity advances by exactly one; the new relation is readable only by its owner; residue proved gone by a two-sided control |
| **Stop condition** | **a second migration of any kind halts the phase** and returns to the owner |

**One migration is ALLOCATED — `OD-2R-7` signed as option A, ADR-132 Decision 8.**
Budget: **1 allocated · 0 spent · 0 created.**

**Allocated is not created, and it is not permission to create.** No migration
file exists, none may be written, and the allocation is spent only when
implementation is separately authorized and slice 2R.1 runs. **A second migration
of any kind is a stop condition** that halts the phase and returns to the owner —
a budget whose ceiling is not also its stop condition is not a budget.

---

## 6. Slices

Detail, dependencies and estimates are in the implementation plan.

| slice | delivers | migration | closes on |
|---|---|---|---|
| **2R.0** | measurement; zero behaviour change | none | the baseline record |
| **2R.1** | the model, persisted and validated | **the one allocated** | hosted proof, parity +1 |
| **2R.2** | occurrence vs series, with undo | none | series journeys |
| **2R.3** | the surface, desktop and mobile | none | both locales, accessibility |
| **2R.4** | delivery, without multiplying it | none | the heartbeat's rules re-proved |
| **2R.5** | closeout and traceability | none | **the owner's device checkpoint** |

**Each slice is re-audited against the `main` the previous one produced** before
it begins. That has caught a false premise in three consecutive phases and is not
optional.

---

## 7. What this phase does not touch

Stated so that each exclusion is a recorded decision rather than an omission.

Signup stays **closed**. The rollout gate stays **25 pass · 3 fail · 2
owner-signature**, and `RG-DEP-3` **cannot be closed by writing a file**. Push
HTTP 403 is **not resumed**. No BYOK credit is spent and **no AI call is made**.
No audio is persisted. All six automation categories keep the state audit **§10.3**
records — which, since the owner undid their 2026-08-20 opt-in through the
product's own undo, is once again `suggest_only` for all six. ADR-131 Decision 6
recorded the earlier state truthfully and is **not edited**; §10.3 supersedes it
by name, the way ADR-129 superseded ADR-127's premise. No
grant, RLS policy, retention rule or authority moves. `2P-ACCESS-005` stays
**NOT EXECUTED — OWNER WAIVED**. The four automation review flows stay out under
`OD-2Q-8`. Audit §8's two defects stay out under `OD-2R-9`. **The phase after
this one is not started, not planned and not named as active.**

### 7.1 Out of the phase, each with a destination — signed by ADR-132 Decision 11

Named individually so that excluding each is a decision on the record rather
than an omission. **None is discharged by being listed here.**

| out of Phase 2R | destination | signed by |
|---|---|---|
| **`2R-TASK-RECURRENCE`** — recurring **tasks** | the owner. `OD-2R-8`'s lift is **limited to reminders** and does not reach tasks | `OD-2R-6` A |
| **Search that cannot be linked or returned to** — `/app/search` reads no `searchParams` | a separate small initiative | `OD-2R-9` A |
| **`2P-ATTENTION-008`** — the *Precisa de você* filter lost on back navigation | the same separate initiative. **Not discharged by being understood** | `OD-2R-9` A |
| **The dead-man switch blind to a gateway 401** — repair by alerting on staleness of `last_success_at`, not on a failure count | **operations**, deploy-and-operate track | ADR-132 D11 |
| **The dark accessibility scan on real routes** | a later initiative at the owner's discretion | ADR-129, inherited |
| **Push HTTP 403 · Android never executed** | `push-hardware-validation`; external provider + owner hardware | ADR-107, inherited |
| **`RG-DEP-3`** restore drill | rollout track. **Cannot be closed by writing a file** | inherited |
| **`2P-CHAT-007-JOURNEY`** | unspendable until the owner spends their own credential | inherited |
| **The four automation review flows** | separate initiative | `OD-2Q-8` |
| **Autonomy — the agent acting on its own** | **out until calibration evidence exists**, not because it is unwanted. Two observations against thresholds of 50 and 80, and four of six categories still have no producer | `OD-2R-1` A declines B and D |
| **VoiceOver `2P-ACCESS-005`** | **NOT EXECUTED — OWNER WAIVED.** Never a priority, never to be reported as passing | ADR-125, ADR-130 |
