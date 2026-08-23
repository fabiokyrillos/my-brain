# Phase 2R — requirement coverage

**Generated, never typed.** `node scripts/generate-phase-2r-coverage.mjs`
reads the PRD and either writes this file or refuses and says why. It never
writes a partial report: one that is 72/73 correct reads as complete.

## What this is, and what it deliberately is not

A **coverage** classification: every requirement mapped to its family, its
slice, its kind and the decision it rests on. It answers *"is anything
unassigned?"*

**It is not a delivery matrix, and must never be read as one.** No
requirement here carries a *delivery* class. **Nothing is implemented**, so
none can honestly exist: `2R-CLOSE-003` requires the delivery matrix to be
generated from the slices' own acceptance records at closeout, and a
requirement classified before it is built is a claim nobody measured. The
delivery matrix (`PHASE_2R_TRACEABILITY_MATRIX.md`) does not exist, and the
declaration guard asserts its absence.

**Kind** is what the requirement *asks for*: **build** = new behaviour;
**baseline** = an existing property this phase must prove still holds;
**rule** = deliberately not built, whose delivery is the recorded refusal.

---

## Totals

| | |
|---|---|
| Declared | **73** |
| Families | **10** |
| Slices | **6** |
| Unassigned to a slice | **0** |
| Delivery-classified | **0 — by rule, until closeout** |

**By kind:** baseline **15** · build **55** · rule **3**

---

## Coverage by slice

| slice | requirements | families |
|---|---|---|
| **2R.0** | 6 | `2R-FOUNDATION` |
| **2R.1** | 13 | `2R-MODEL`, `2R-TIME` |
| **2R.2** | 12 | `2R-SERIES`, `2R-TIME` |
| **2R.3** | 16 | `2R-ACCESS`, `2R-MOBILE`, `2R-SURFACE` |
| **2R.4** | 7 | `2R-NOTIFY` |
| **2R.5** | 19 | `2R-CLOSE`, `2R-TRUST` |
| **total** | **73** | — |

Every slice has at least one requirement, and **every requirement has exactly
one slice** — by construction: both tables derive from the same rows, so a
requirement missing here would be missing below too.

---

## Coverage by family

| family | count | slice(s) | kinds |
|---|---|---|---|
| `2R-FOUNDATION` | 6 | 2R.0 | baseline 5, build 1 |
| `2R-MODEL` | 9 | 2R.1 | baseline 1, build 8 |
| `2R-TIME` | 7 | 2R.1, 2R.2 | baseline 2, build 5 |
| `2R-SERIES` | 9 | 2R.2 | build 9 |
| `2R-SURFACE` | 8 | 2R.3 | build 8 |
| `2R-NOTIFY` | 7 | 2R.4 | baseline 5, build 1, rule 1 |
| `2R-TRUST` | 7 | 2R.5 | baseline 2, build 4, rule 1 |
| `2R-ACCESS` | 5 | 2R.3 | build 4, rule 1 |
| `2R-MOBILE` | 3 | 2R.3 | build 3 |
| `2R-CLOSE` | 12 | 2R.5 | build 12 |
| **total** | **73** | — | — |

**Every family name is letters-only**, and the generator refuses otherwise.
`2K-A11Y` carried digits and was invisible to every prose count, to the
traceability generator's attribution check, and to the phase-start detector's
`[A-Z]+` family pattern — all three at once and all three silently.

---

## Every requirement

| id | slice | kind | rests on | requirement |
|---|---|---|---|---|
| `2R-FOUNDATION-001` | 2R.0 | baseline | — | The absence of recurrence is re-proved at slice start, not inherited from this PRD |
| `2R-FOUNDATION-002` | 2R.0 | baseline | — | The heartbeat's current behaviour is measured before anything touches it |
| `2R-FOUNDATION-003` | 2R.0 | baseline | — | The reminder surface's current shape is recorded |
| `2R-FOUNDATION-004` | 2R.0 | baseline | — | The owner's timezone resolution path is identified and named |
| `2R-FOUNDATION-005` | 2R.0 | build | — | Zero product behaviour changes in this slice |
| `2R-FOUNDATION-006` | 2R.0 | baseline | — | The audit's automation finding is re-checked against the live database at slice start |
| `2R-MODEL-001` | 2R.1 | build | `OD-2R-2`, `OD-2R-7` | A reminder may carry a recurrence rule |
| `2R-MODEL-002` | 2R.1 | build | `OD-2R-2` | The rule is validated at the boundary, and an invalid rule is refused |
| `2R-MODEL-003` | 2R.1 | build | `OD-2R-2` | The rule is versioned |
| `2R-MODEL-004` | 2R.1 | baseline | — | A reminder without a rule behaves exactly as it does today |
| `2R-MODEL-005` | 2R.1 | build | `OD-2R-3` | Exactly one concrete occurrence exists at a time |
| `2R-MODEL-006` | 2R.1 | build | `OD-2R-3` | Completing an occurrence materialises the next |
| `2R-MODEL-007` | 2R.1 | build | `OD-2R-3` | Materialisation is idempotent |
| `2R-MODEL-008` | 2R.1 | build | — | The series is owner-scoped and proved so |
| `2R-MODEL-009` | 2R.1 | build | `OD-2R-7` | The migration's destination is exclusive |
| `2R-TIME-001` | 2R.1 | build | `OD-2R-5` | A recurrence is a wall-clock intention |
| `2R-TIME-002` | 2R.1 | build | `OD-2R-5` | A local time that does not exist resolves deterministically |
| `2R-TIME-003` | 2R.1 | build | `OD-2R-5` | A local time that occurs twice resolves deterministically |
| `2R-TIME-004` | 2R.1 | build | `OD-2R-5` | A day-of-month larger than the month resolves deterministically |
| `2R-TIME-005` | 2R.2 | baseline | `2R-FOUNDATION-004` | One timezone authority, not several |
| `2R-TIME-006` | 2R.2 | baseline | — | The owner's zone, never the browser's |
| `2R-TIME-007` | 2R.2 | build | — | Occurrence instants are computed in one place |
| `2R-SERIES-001` | 2R.2 | build | `OD-2R-4` | Editing an occurrence asks which scope is meant |
| `2R-SERIES-002` | 2R.2 | build | `OD-2R-4` | *This one* leaves the series untouched |
| `2R-SERIES-003` | 2R.2 | build | `OD-2R-4` | *This and future* changes the rule from that point |
| `2R-SERIES-004` | 2R.2 | build | `OD-2R-4` | A detached occurrence stays detached |
| `2R-SERIES-005` | 2R.2 | build | — | A series can be ended without destroying its history |
| `2R-SERIES-006` | 2R.2 | build | `OD-2R-4` | Cancelling one occurrence is not cancelling the series |
| `2R-SERIES-007` | 2R.2 | build | — | Every series operation is reversible, and the undo is tested |
| `2R-SERIES-008` | 2R.2 | build | — | An irreversible series operation requires explicit confirmation |
| `2R-SERIES-009` | 2R.2 | build | `OD-2R-4` | The scope actually applied is reported back |
| `2R-SURFACE-001` | 2R.3 | build | `OD-2R-2` | Recurrence is offered where a reminder is created |
| `2R-SURFACE-002` | 2R.3 | build | — | The next occurrences are visible before saving |
| `2R-SURFACE-003` | 2R.3 | build | — | A recurring reminder is identifiable as recurring |
| `2R-SURFACE-004` | 2R.3 | build | `OD-2R-2` | The rule is stated in the owner's words, never as a rule string |
| `2R-SURFACE-005` | 2R.3 | build | `OD-2R-3` | Recurring occurrences appear on the calendar and the agenda |
| `2R-SURFACE-006` | 2R.3 | build | — | Copy goes through the typed feature module |
| `2R-SURFACE-007` | 2R.3 | build | `2R-SURFACE-006` | Both locales are complete |
| `2R-SURFACE-008` | 2R.3 | build | — | A failed save never discards what the owner typed |
| `2R-NOTIFY-001` | 2R.4 | baseline | `2R-FOUNDATION-002` | Quiet hours still hold for recurring occurrences |
| `2R-NOTIFY-002` | 2R.4 | baseline | `2R-FOUNDATION-002` | The daily cap still holds |
| `2R-NOTIFY-003` | 2R.4 | baseline | `2R-FOUNDATION-002` | The 24-hour cooldown still holds |
| `2R-NOTIFY-004` | 2R.4 | baseline | — | One user's series cannot block another user's batch |
| `2R-NOTIFY-005` | 2R.4 | build | `OD-2R-3` | A missed occurrence does not produce a burst |
| `2R-NOTIFY-006` | 2R.4 | baseline | — | Notification content stays content-free |
| `2R-NOTIFY-007` | 2R.4 | rule | — | Push is not resumed, repaired or claimed by this phase |
| `2R-TRUST-001` | 2R.5 | build | `OD-2R-3` | Every automatic materialisation is auditable |
| `2R-TRUST-002` | 2R.5 | build | — | Materialisation is not an automation category |
| `2R-TRUST-003` | 2R.5 | baseline | `2R-FOUNDATION-006` | No automation category changes state |
| `2R-TRUST-004` | 2R.5 | baseline | — | No grant, RLS policy, retention rule or authority moves |
| `2R-TRUST-005` | 2R.5 | build | — | Recurrence writes are never plain client writes |
| `2R-TRUST-006` | 2R.5 | build | — | A surface never claims an occurrence it cannot prove |
| `2R-TRUST-007` | 2R.5 | rule | — | No AI call is made by this phase |
| `2R-ACCESS-001` | 2R.3 | build | — | The recurrence control is reachable and operable by keyboard |
| `2R-ACCESS-002` | 2R.3 | build | `OD-2R-4` | The scope choice is announced, not only shown |
| `2R-ACCESS-003` | 2R.3 | build | `2R-SERIES-009` | The result of a series edit reaches a live region that already exists |
| `2R-ACCESS-004` | 2R.3 | build | — | Contrast holds on the new controls in both themes |
| `2R-ACCESS-005` | 2R.3 | rule | — | No screen-reader claim is made anywhere |
| `2R-MOBILE-001` | 2R.3 | build | — | The recurrence control is usable on a phone viewport |
| `2R-MOBILE-002` | 2R.3 | build | `2R-SURFACE-002` | The occurrence preview does not push save off screen |
| `2R-MOBILE-003` | 2R.3 | build | — | The owner confirms it on their own device |
| `2R-CLOSE-001` | 2R.5 | build | — | A generated matrix classifies every requirement exactly once |
| `2R-CLOSE-002` | 2R.5 | build | `2R-CLOSE-001` | Every `partial` and `not-built-by-rule` names a remainder and a destination |
| `2R-CLOSE-003` | 2R.5 | build | `2R-CLOSE-001` | The matrix is generated from the slices' acceptance records, never typed |
| `2R-CLOSE-004` | 2R.5 | build | — | A requirement with no slice fails the build |
| `2R-CLOSE-005` | 2R.5 | build | — | A requirement with no observable criterion fails the build |
| `2R-CLOSE-006` | 2R.5 | build | — | A family name containing a digit fails the build |
| `2R-CLOSE-007` | 2R.5 | build | `OD-2R-7` | A migration without a named exclusive destination fails the build |
| `2R-CLOSE-008` | 2R.5 | build | — | A decision presented as a recommendation instead of a signature fails the build |
| `2R-CLOSE-009` | 2R.5 | build | `2R-MOBILE-003` | Hardware proof cannot be discharged by a document |
| `2R-CLOSE-010` | 2R.5 | build | — | The phase after this one cannot start |
| `2R-CLOSE-011` | 2R.5 | build | — | Every inherited remainder is carried with its destination |
| `2R-CLOSE-012` | 2R.5 | build | `2R-MOBILE-003` | The phase does not close on a green pipeline |

---

## The signed decisions each family rests on

All nine signed by **ADR-132**, 2026-08-23, every one taking its recommendation.

| decision | signed | families it governs |
|---|---|---|
| `OD-2R-8` | **A** — refusal LIFTED, limited to reminders | the whole phase; without it there is no subject |
| `OD-2R-1` | **A** — Rotina | all ten |
| `OD-2R-2` | **A** — closed set; `RRULE` refused | `2R-MODEL`, `2R-SURFACE` |
| `OD-2R-3` | **A** — one occurrence at a time | `2R-MODEL`, `2R-SURFACE`, `2R-NOTIFY`, `2R-TRUST` |
| `OD-2R-4` | **A** — ask, default narrower | `2R-SERIES`, `2R-ACCESS` |
| `OD-2R-5` | **A** — wall-clock, three cases signed | `2R-TIME` |
| `OD-2R-6` | **A** — recurring tasks OUT | none — an exclusion; remainder `2R-TASK-RECURRENCE` |
| `OD-2R-7` | **A** — 1 migration ALLOCATED | `2R-MODEL-009`, `2R-CLOSE-007` |
| `OD-2R-9` | **A** — two defects routed out | none — an exclusion |

**No requirement was added, renumbered, reused or removed by the signatures**,
because every decision took the option this package was written for. The
count is the same **73** it was before ADR-132 — checkable
rather than asserted, since this generator refuses any other number.
