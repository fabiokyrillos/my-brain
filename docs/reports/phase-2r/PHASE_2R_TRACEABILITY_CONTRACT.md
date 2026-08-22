# Phase 2R — traceability contract

**Planning artifact.** It defines how Phase 2R's requirements will be classified
at closeout. **It classifies nothing now**, and during planning **every
requirement is deliberately unclassified** — a requirement classified before it
is built is a claim nobody measured.

The generator this contract governs is `scripts/generate-phase-2r-traceability.mjs`.
**It does not exist yet** and is built in slice 2R.5, by `2R-CLOSE-001`.

---

## 1. The vocabulary

Exactly five classes. A requirement gets **exactly one**, and every one of the
**73** must get one.

| class | means | requires |
|---|---|---|
| `built` | new behaviour shipped in this phase | a slice acceptance record naming the evidence |
| `baseline` | the property already held; this phase proved it still does | the proof, and an explicit statement that **no change was made** |
| `partial` | delivered in part | a **named remainder** and a **destination** |
| `not-built-by-rule` | deliberately not built | the **signed rule** that refused it, by name |
| `undelivered` | asked for, not delivered, no rule refused it | a reason. **A non-zero count is a phase failure**, not a category |

**`baseline` may never be recorded as `built`.** Phase 2Q's ADR-129 Decision 7
established this: `2Q-ACCESS-002` and `-003` were `baseline` because the surfaces
were already correct, and classifying them `built` would have claimed a change
that did not happen.

---

## 2. The matrix is generated, never typed

The generator reads:

- `docs/initiatives/phase-2r/PHASE_2R_PRD.md` — the declarations;
- the five slice acceptance records under `docs/reports/phase-2r/`.

It writes `docs/reports/phase-2r/PHASE_2R_TRACEABILITY_MATRIX.md`, offers
`--check`, and **refuses a stale matrix byte for byte**. Regenerating at closeout
must reproduce the merged file exactly; the generator is deterministic, and **no
count is ever edited by hand.**

**Classifications come from the slices' own acceptance records**, not from a
typed list. A phase that types its own matrix is grading its own homework.

---

## 3. Refusals — the package fails closed

The generator **refuses to emit a matrix** if any of these hold. Each maps to a
requirement in PRD §3.

| # | refusal | requirement |
|---|---|---|
| 1 | a declared requirement is classified **more than once** | `2R-CLOSE-001` |
| 2 | a declared requirement is **not classified** | `2R-CLOSE-001` |
| 3 | a classification names an identifier **not declared** in the PRD | `2R-CLOSE-001` |
| 4 | a requirement is declared with **no slice** | `2R-CLOSE-004` |
| 5 | a requirement is declared with **no observable criterion** | `2R-CLOSE-005` |
| 6 | a **family name contains a digit** | `2R-CLOSE-006` |
| 7 | a `partial` names **no remainder** or **no destination** | `2R-CLOSE-002` |
| 8 | a `not-built-by-rule` names **no signed rule** | `2R-CLOSE-002` |
| 9 | the count of `undelivered` is **non-zero** | `2R-CLOSE-001` |
| 10 | a **migration** is recorded with no exclusive destination | `2R-CLOSE-007` |
| 11 | the **migration count** exceeds the authorized allocation | `2R-CLOSE-007` |
| 12 | an `OD-2R-*` is marked **signed** with no accepted ADR naming it | `2R-CLOSE-008` |
| 13 | `2R-MOBILE-003` or the closing checkpoint is marked satisfied with **no owner device session** | `2R-CLOSE-009` |
| 14 | a **successor** governing artifact or declared requirement exists | `2R-CLOSE-010` |
| 15 | an inherited remainder from audit §7 is **absent** from the closing record | `2R-CLOSE-011` |
| 16 | the matrix on disk **differs** from a fresh generation | `2R-CLOSE-003` |

---

## 4. Refusal 6, and why it has its own section

**A requirement can be invisible to the tooling that is supposed to see it, and
this has already happened here.**

Phase 2K named a family `2K-A11Y`. The phase-start detector's declared-requirement
pattern is:

```
/^- \*\*2R-[A-Z]+-\d{3}/m
```

The family segment is `[A-Z]+` — **letters only**. `A11Y` contains digits, so
`2K-A11Y-001` matched **nothing**: it was invisible to every prose count *and*
would have been invisible to the detector. Phases 2L, 2M and 2N each renamed the
family `2X-ACCESS` for exactly this reason, and this phase names it
**`2R-ACCESS`**.

**The pattern is deliberately not loosened.** Admitting digits inside a family
name would make `2R-2026-001`-shaped noise a start signal. The property is
asserted where it belongs — here, and in the phase's declaration guard.

**The control is two-sided**, because a guard that cannot fail proves nothing:

1. **Positive** — every family declared in the PRD matches `^[A-Z]+$`, and the
   ten are enumerated so that a new family cannot be added without passing here.
2. **Negative** — a fixture declaring `2R-A11Y-001` is shown to match **zero**
   requirements under the detector's own pattern, proving the invisibility is
   real and that the guard would catch it.

Without the negative half, the positive half passes on an empty set.

---

## 5. What planning must **not** contain

Enforced by the phase's declaration guard while the phase is unimplemented, and
**inverted slice by slice** as each artifact legitimately appears — never
deleted, so the absence is provable until it should not be:

- a traceability **matrix**;
- any slice **acceptance record**;
- a **deployment record**;
- a **closing report**;
- any **migration** file for this phase;
- any classification of any `2R-*` requirement;
- a hosted **fixture**;
- any artifact asserting implementation.

**Documentary tests and guards are permitted** and are what this contract is
made of.

---

## 6. Migration accounting

| | |
|---|---|
| **Proposed** | 1 |
| **Allocated** | **0 — `OD-2R-7` is open and unsigned** |
| **Spent** | 0 |
| **Exclusive destination** | the recurrence model (PRD §5) |
| **Stop condition** | a second migration of any kind halts the phase |

**A budget whose ceiling is not also its stop condition is not a budget.**
