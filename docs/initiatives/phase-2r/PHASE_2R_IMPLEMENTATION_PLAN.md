# Phase 2R — implementation plan

**Status: PLANNING ONLY.** Nothing here is implemented. This plan is the second
half of the governing pair with
[`PHASE_2R_PRD.md`](./PHASE_2R_PRD.md), and it authorizes nothing on its own.

**The only remaining blocker on the whole phase is an owner decision.** Nine are
open (`OD-2R-1` … `OD-2R-9`), and three of them — `OD-2R-1`, `OD-2R-7` and
`OD-2R-8` — block slice 2R.1 absolutely. Without `OD-2R-8` the phase has no
subject at all.

---

## 1. The rule every slice obeys

1. **Re-audit against the `main` the previous slice produced**, before starting.
   Not against this plan. This has caught a false premise in three consecutive
   phases — most recently a *signed* premise, in Phase 2Q slice 2Q.4, before a
   product colour was changed to satisfy a broken fixture.
2. **Reproduce before fixing.** The single most valuable habit Phase 2Q left
   behind.
3. **One pull request per slice**, CI green **on the exact merge SHA**, not on
   the branch head.
4. **Everything goes through a pull request, including documentation.** Phase
   2P's deviation — docs pushed straight to `main` — is not repeated.
5. **A second migration of any kind is a stop condition** that halts the phase
   and returns to the owner.
6. **No AI call, no BYOK credit.** A half that can only be proved by spending the
   owner's credential is recorded **unspendable**, never as a pass.
7. **Fixtures are synthetic, owner-scoped and removed**, with a **two-sided**
   residue control: plant a row, prove the probe sees it, remove it, prove the
   probe no longer does. A zero count over an empty table is not a control.
8. **Hardware proof is never discharged by a document.**

---

## 2. Slices

### Slice 2R.0 — measure, change nothing

**Delivers** `2R-FOUNDATION-001` … `-006`.

Re-prove the absence of recurrence against the live schema at the slice's own
baseline; record the heartbeat's quiet hours, daily cap, 24-hour cooldown and
per-user lock as **observed** rather than as read; record the reminder modal's
current field groups from the component; identify the single timezone-resolution
path and report any second one as a defect; and re-read the four
`automation_category_policies` rows so audit §5 is either confirmed or corrected
at the moment the phase starts.

**Zero product behaviour changes.** The slice's own diff is the evidence.

- **Migration:** none. **Dependencies:** none. **Parallel with:** nothing.
- **Closes on:** the baseline record, reviewed against the diff.
- **Stop conditions:** a second timezone authority exists → report before
  building on either; audit §5's rows differ from what the audit recorded →
  stop and tell the owner rather than adjusting the record.
- **Excludes:** any change to `reminders`, the heartbeat or the modal.

### Slice 2R.1 — the model

**Delivers** `2R-MODEL-001` … `-009`, `2R-TIME-001` … `-004`.

The one allocated migration, its writer, and the wall-clock semantics. **No
surface.** A reminder can carry a validated, versioned rule; exactly one concrete
occurrence exists at a time; completing one materialises the next, idempotently
**in the database**; a reminder without a rule behaves exactly as it does today,
asserted as an equality rather than as a passing test.

The three unrepresentable cases — a local time that does not exist, one that
occurs twice, a day-of-month larger than the month — are decided by `OD-2R-5` and
pinned by tests that fail if the behaviour changes.

- **Migration:** **the one allocated.** Destination exclusive; a second halts the
  phase.
- **Depends on:** 2R.0; `OD-2R-1`, `OD-2R-2`, `OD-2R-3`, `OD-2R-5`, `OD-2R-7`,
  `OD-2R-8`.
- **Tests:** unit over the rule validator and the instant generator; pgTAP for
  ownership, forced RLS, least-privilege grants, the uniqueness that makes
  materialisation idempotent, and a **negative control** proving a second owner
  is refused; the whole chain applied to an empty database by CI.
- **Journey:** none — there is no surface yet, and a journey against one would be
  a journey against a fixture.
- **Hosted proof:** dry run shows **exactly one** pending migration; parity
  advances by **exactly one**; the new relation is readable only by its owner;
  residue zero, two-sided.
- **Hardware:** none.
- **Closes on:** hosted proof and parity, after every gate.
- **Stop conditions:** a second migration needed; the model cannot be validated
  at the boundary without a parser (which would mean `OD-2R-2` was answered B and
  the estimate is wrong).
- **Excludes:** every surface, notification and series-edit semantic.

### Slice 2R.2 — this one, or all of them

**Delivers** `2R-SERIES-001` … `-009`, `2R-TIME-005` … `-007`.

Scope semantics and their undo. Editing an occurrence asks which scope is meant,
defaulting to the **narrower**; *this one* leaves the series untouched; *this and
future* changes the rule from that point and leaves earlier occurrences as
recorded; a detached occurrence stays detached; a series ends without destroying
its history; every operation has a **real, tested** undo, and anything
irreversible asks first.

`2R-TIME-005` … `-007` land here because a second surface showing an occurrence
is what makes a second timezone authority observable.

- **Migration:** none. **Depends on:** 2R.1; `OD-2R-4`.
- **Tests:** unit over scope resolution; integration over undo restoring prior
  state; a test asserting two surfaces cannot disagree by both reading the same
  function.
- **Journey:** series edit and undo, desktop and mobile.
- **Closes on:** the journeys, plus undo exercised rather than asserted.
- **Stop conditions:** an operation is found to have no real undo → it becomes an
  explicit confirmation under `2R-SERIES-008`, and that is reported, not
  absorbed.
- **Excludes:** notification behaviour; recurring tasks.

### Slice 2R.3 — the surface

**Delivers** `2R-SURFACE-001` … `-008`, `2R-ACCESS-001` … `-005`,
`2R-MOBILE-001` … `-003`.

Recurrence offered where a reminder is already created, without turning the modal
into a form; the next occurrences visible **before** saving, in the owner's zone
and locale; a recurring reminder identifiable as recurring on every surface that
lists it; the rule stated in the owner's words and **never** as a rule string;
occurrences on the calendar and the agenda.

Copy through a typed `copy.ts`, both locales complete per key, and a failed save
that never discards what the owner typed.

- **Migration:** none. **Depends on:** 2R.2.
- **Tests:** component tests for the control and the preview; a per-key locale
  completeness assertion; axe at `serious` on the touched surfaces, **on rendered
  pages** — a fixture lane that inlines CSS by hand measures something the
  product does not do, which is exactly how Phase 2Q's signed premise turned out
  to be false.
- **Journey:** create a recurring reminder end to end, desktop **and** mobile,
  **both locales**.
- **Hardware:** `2R-MOBILE-003` — an **owner device checkpoint item**. Not
  substitutable by Playwright and not by this plan.
- **Closes on:** both locales, both viewports, axe clean.
- **Stop conditions:** the control cannot fit the existing modal without becoming
  a form → return to the owner rather than shipping a form.
- **Excludes:** any screen-reader claim (`2R-ACCESS-005`).

### Slice 2R.4 — delivery, without multiplying it

**Delivers** `2R-NOTIFY-001` … `-007`.

Six of the seven are **baseline**: quiet hours, the daily cap, the 24-hour
cooldown, per-user isolation and content-freedom already hold, and this slice
proves recurrence did not create a path around any of them. The one **build** is
`2R-NOTIFY-005` — a series unprocessed for days must deliver at most what the cap
allows, never a backlog at once.

`2R-NOTIFY-007` is a **rule**: push is not resumed, repaired or claimed here.

- **Migration:** none. **Depends on:** 2R.1 (needs the model, **not** the
  surface).
- **Parallel with 2R.3 — conditionally.** They share no contract, no migration
  and no data. They *would* share a component if 2R.4 touched the calendar or
  agenda, which `2R-SURFACE-005` also touches. **Default to serial.** Run them
  in parallel only if slice 2R.4's re-audit confirms it touches neither surface.
- **Tests:** the heartbeat's existing rules re-asserted against a series; a
  missed-occurrence case proving no burst.
- **Closes on:** the heartbeat's rules re-proved, not re-read.
- **Excludes:** push delivery on a device; any change to quiet hours, the cap or
  the cooldown.

### Slice 2R.5 — closeout

**Delivers** `2R-CLOSE-001` … `-012`, and closes `2R-TRUST-001` … `-007`.

`scripts/generate-phase-2r-traceability.mjs` reads the PRD and the five slice
acceptance records and emits the matrix — **73 classified, 0 unclassified** —
generated from those records rather than from typed classifications, and
byte-identical on regeneration. The threat model is re-dispositioned against what
was actually built. Audit §7's inherited list is reproduced with **no item
dropped**.

**The phase stops at an owner device checkpoint** and does not close on a green
pipeline (`2R-CLOSE-012`).

- **Migration:** none. **Depends on:** every prior slice.
- **Closes on:** **the owner's decision, recorded as an ADR**, after the
  checkpoint.
- **Stop conditions:** any requirement unclassified; any `partial` without a
  remainder and a destination.

---

## 3. Estimate

**Derived for this phase from its own 73 requirements and 6 slices.** No prior
phase's numbers are recycled — Phase 2Q's 5 / 9.5 / 15 covered 42 requirements
with a much smaller surface area, and reusing it would be a guess wearing a
number's clothes.

Working days.

| slice | requirements | optimistic | probable | pessimistic |
|---|---|---|---|---|
| 2R.0 — measure | 6 | 0.5 | 1 | 1.5 |
| 2R.1 — the model | 13 | 1.5 | 3 | 5 |
| 2R.2 — series | 12 | 1.5 | 3 | 4.5 |
| 2R.3 — the surface | 16 | 1.5 | 3 | 4.5 |
| 2R.4 — delivery | 7 | 0.5 | 1.5 | 2.5 |
| 2R.5 — closeout | 12 + 7 | 1 | 2 | 3.5 |
| **total** | **73** | **6.5** | **13.5** | **21.5** |

**Critical path: ~12 working days.** Every slice depends on its predecessor;
only 2R.3 and 2R.4 are candidates for overlap, and §2 makes that conditional on a
re-audit rather than assumed. If they do overlap, the path shortens by about 1.5
days; the table above does **not** assume it.

**What moves the estimate, and by how much:**

| driver | effect |
|---|---|
| `OD-2R-2` answered **B** (`RRULE`) | **+2 to +4 days** — a parser and a generator become the phase's highest-risk code |
| `OD-2R-3` answered **B** (horizon) | **+3 days** and probably a **second migration** — a stop condition |
| `OD-2R-3` answered **C** (pure compute) | **+5 days** — heartbeat, agenda, calendar and notifications all change |
| `OD-2R-6` answered **B** (recurring tasks) | **+6 to +9 days** and a further migration — a second phase in disguise |
| `OD-2R-9` answered **B** | **+2 days**, and the phase becomes two things |
| **the migration** | ~1 day of slice 2R.1 is gates, not code: pgTAP, db lint, the full chain on an empty database, dry run, application, hosted proof, parity, residue |
| **hardware** | `2R-MOBILE-003` and the closing checkpoint are **owner wall-clock**, not agent time. Historically the largest source of elapsed-time variance in this repository |
| **owner decisions** | the phase cannot start slice 2R.1 until `OD-2R-1`, `OD-2R-7` and `OD-2R-8` are signed |

**Owner actions required, in order:** sign `OD-2R-1` … `OD-2R-9`; authorize
implementation in a separate ADR; run the `2R-MOBILE-003` device item; run the
closing checkpoint; decide closure.

**Parallelisable:** only 2R.3 ‖ 2R.4, conditionally. Nothing else — each slice
shares contracts, data or documents with its predecessor, which is exactly the
condition under which parallelism is not claimed.

**Principal risks:**

| risk | why it is real here | mitigation |
|---|---|---|
| **DST and wall-clock semantics** | three local-day implementations once coexisted in this repository, two wrong in opposite directions | `OD-2R-5` decides the three unrepresentable cases **before** code; tests pin them |
| **a second migration** | recurrence tends to grow a second table once occurrences acquire state | exclusive destination named in advance; a second is a **stop condition** |
| **materialisation firing twice** | the heartbeat is hourly and retries | idempotency enforced **by the database**, not by the caller (`2R-MODEL-007`) |
| **notification bursts** | a series unprocessed for days | `2R-NOTIFY-005`, tested against the existing cap |
| **a fixture measuring what the product does not do** | ADR-129's whole finding | axe on **rendered pages**; no hand-inlined CSS |
| **the phase closing on green CI** | every gate green is when a wrong claim is easiest | `2R-CLOSE-012` — closure needs the owner |

---

## 4. The only blocker

**Record the owner's answers to `OD-2R-1` … `OD-2R-9`, then record an
implementation authorization ADR.** Until both exist, this package is a draft and
no slice may start.

`OD-2R-8` deserves separate mention: `2P-REMINDER-RECURRENCE` was refused **by
name** by the owner. If it is not lifted, **Phase 2R as written has no subject**,
and `OD-2R-1` must be answered with B, C or D instead.
