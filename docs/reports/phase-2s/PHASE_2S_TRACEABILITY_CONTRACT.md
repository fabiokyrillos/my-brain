# Phase 2S — traceability contract

**Planning artifact.** It defines how Phase 2S's requirements will be classified
at closeout. **It classifies nothing now**, and during planning **every
requirement is deliberately unclassified** — a requirement classified before it
is built is a claim nobody measured.

The generator this contract governs is
`scripts/generate-phase-2s-traceability.mjs`. **It does not exist yet** and is
built in slice 2S.4, by `2S-CLOSE-001`.

---

## 1. The vocabulary

Exactly five classes. A requirement gets **exactly one**, and every one of the
**74** must get one.

| class | means | requires |
|---|---|---|
| `built` | new behaviour shipped in this phase | a slice acceptance record naming the evidence |
| `baseline` | the property already held; this phase proved it still does | the proof, and an explicit statement that **no change was made** |
| `partial` | delivered in part | a **named remainder** and a **destination** |
| `not-built-by-rule` | deliberately not built | the **signed rule** that refused it, by name |
| `undelivered` | asked for, not delivered, no rule refused it | a reason. **A non-zero count is a phase failure**, not a category |

### 1.1 `baseline` may never be recorded as `built` — and this is now enforced

Phase 2Q's ADR-129 Decision 7 established the rule. **Phase 2R proved that
stating it in prose enforces nothing.**

Its closeout generator was the first code ever to reconcile delivered classes
against **declared kinds**, and it found **57 `built` against 55 declared
`build`**. Six rows were named; **five had been wrong since slice 2R.0, the
phase's first.** The misfiling survived five slices, three device checkpoints and
every green CI run. The evidence in each row was always correct; the column it
was filed under was not.

**`2S-CLOSE-003` makes the reconciliation a refusal in this phase from the
start**, rather than a discovery at the end of it.

### 1.2 The opposite direction stays sayable

A requirement declared `build` and delivered `baseline` is a phase **discovering
that the property already held**, which is a real and honest outcome —
`2R-SURFACE-005` and `2R-NOTIFY-005` were exactly that. **It must not be
refused.** `2S-CLOSE-004` is that protection, and it exists because a
reconciliation refusing both directions would push a phase toward manufacturing a
change to make a label look right.

---

## 2. The matrix is generated, never typed

The generator reads:

- `docs/initiatives/phase-2s/PHASE_2S_PRD.md` — the declarations;
- the slice acceptance records under `docs/reports/phase-2s/`.

It writes `docs/reports/phase-2s/PHASE_2S_TRACEABILITY_MATRIX.md`, offers
`--check`, and **refuses a stale matrix byte for byte**. Regenerating at closeout
must reproduce the merged file exactly; the generator is deterministic, and **no
count is ever edited by hand.**

**Classifications come from the slices' own acceptance records**, not from a
typed list. A phase that types its own matrix is grading its own homework.

**Two mechanical requirements, both learned the hard way:**

1. **The parser reads only tables that announce themselves.** A slice acceptance
   record may contain a transition table shaped
   `| Requirement | Was | Now | Why |`, whose second column is **not** the class.
   Phase 2R's generator classified three requirements twice from exactly that
   table. The parser therefore accepts only a table whose header begins
   `| Requirement | Class | …`.
2. **The generator carries no shebang.** The local Rolldown transform refuses
   one, and Phase 2R's generator test could not load until it was removed. Every
   sibling generator carries none.

---

## 3. Refusals — the package fails closed

The generator **refuses to emit a matrix** if any of these hold. Each maps to a
requirement in PRD §3.

| # | refusal | requirement |
|---|---|---|
| 1 | a declared requirement is classified **more than once** | `2S-CLOSE-001` |
| 2 | a declared requirement is **not classified** | `2S-CLOSE-001` |
| 3 | a classification names an identifier **not declared** in the PRD | `2S-CLOSE-001` |
| 4 | a requirement is declared with **no slice** | `2S-CLOSE-001` |
| 5 | a requirement is declared with **no observable criterion** | `2S-CLOSE-001` |
| 6 | a **family name contains a digit** | `2S-CLOSE-006` |
| 7 | a `partial` names **no remainder** or **no destination** | `2S-CLOSE-002` |
| 8 | a `not-built-by-rule` names **no signed rule** | `2S-CLOSE-002` |
| 9 | the count of `undelivered` is **non-zero** | `2S-CLOSE-001` |
| 10 | a requirement declared **`baseline`** is classified **`built`** | `2S-CLOSE-003` |
| 11 | a **migration** is recorded with no exclusive destination | `2S-CLOSE-005` |
| 12 | the **migration count** exceeds the authorized allocation | `2S-CLOSE-005` |
| 13 | local and hosted migration counts **disagree** at closeout | `2S-CLOSE-005` |
| 14 | an `OD-2S-*` is marked **signed** with no accepted ADR naming it | `2S-CLOSE-010` |
| 15 | `2S-MOBILE-003` or the closing checkpoint is marked satisfied with **no owner device session** | `2S-CLOSE-009` |
| 16 | a **successor** governing artifact or declared requirement exists | `2S-CLOSE-011` |
| 17 | an inherited remainder from PRD §7.1 is **absent** from the closing record | `2S-CLOSE-008` |
| 18 | a document produced by this phase **claims push works** | `2S-TRUST-008` |
| 19 | the closing record does not state what `2S-CLOSE-012`'s re-measurement found | `2S-CLOSE-012` |
| 20 | the matrix on disk **differs** from a fresh generation | `2S-CLOSE-001` |

---

## 4. Refusal 10, and why it has its own section

Refusal 10 is the one this repository paid for.

The rule *"`baseline` may never be recorded as `built`"* was written down before
Phase 2R started, in the phase's own contract, and **nothing read it**. Five
requirements took credit for work nobody did, from the phase's first slice to its
last.

**A contract stated in prose is not a contract anybody enforces.** Refusal 10 is
that sentence turned into an exit code.

**It is deliberately one-directional.** Refusal 10 fires when a declared
`baseline` is delivered `built`. It does **not** fire in reverse — `2S-CLOSE-004`
protects that direction, because a phase that discovers a property already held
must be able to say so without either lying or manufacturing a change.

**Its mutation control:** flipping one declared `baseline` row's delivered class
to `built` must make the generator exit non-zero, and restoring it must make the
generator exit zero. A refusal nobody has seen fire is a refusal nobody has
tested.

---

## 5. Refusal 18, and why it forbids an assertion rather than a word

This is a phase about notifications. Almost every sentence it produces is a
candidate for the claim that push now works — and push has delivered **zero**
notifications and its HTTP 403 is untouched.

A guard that forbade the **word** *push* would forbid the honest sentence
*"push is still not working"*, which is the sentence the record most needs.

**So refusal 18 matches a claim and then looks for a refusal inside it**: a
sentence containing `push` together with `works`, `verified`, `delivered`,
`resumed`, `repaired` or `restored`, **unless** the same sentence also contains
one of `not`, `never`, `no`, `cannot`, `refus`, `unresolved`, `still`, `remains`,
`blocked`, `outstanding` or `carried`. Sentence bounds do **not** exclude
newlines, because prose wraps and cutting at the line break loses the refusal
that follows it.

**A guard that forbids the act rather than the word.** Phase 2R built exactly
this and its two-sided control is the shape to reuse.

---

## 6. What planning must **not** contain

Checked by `src/lib/closeout/phase-2s-declarations.test.ts`, which ships with
this package.

1. **No classification.** No requirement in this package carries a delivery
   class, and no document here states one.
2. **No acceptance record**, and no execution matrix. Both are slice artifacts.
3. **No created migration.** The budget is **1 proposed · 0 allocated**, and the
   migration file count attributable to this phase is asserted at **zero**.
4. **No signed decision that no ADR names.** Every `OD-2S-*` is OPEN until an
   accepted ADR names it, and a recommendation is not a signature.
5. **No successor.** No `2T-*` declaration, no `PHASE_2T_*` governing artifact,
   no `docs/initiatives/phase-2t` or `docs/reports/phase-2t` directory, and no
   accepted ADR whose heading names the successor.
6. **No count typed in prose that the tables do not support.** Phase 2R's PRD
   said *"fifty-two across nine families"* while the tables held 73 across ten.
   The sentence is asserted **against the derived count**, in both directions.
7. **No family name containing a digit.** Two-sided: the ten declared families
   pass, and a digit-bearing family is proved invisible to the same pattern.

---

## 7. Migration accounting

| moment | statement |
|---|---|
| **now** | **1 proposed · 0 allocated · 0 spent · 0 created.** 101 local = 101 hosted, parity `202608230101` |
| **at allocation** | an accepted ADR answers `OD-2S-7`. Allocation is **not** permission to create |
| **at slice 2S.1** | one file created, applied, parity **+1**, hosted proof recorded |
| **at closeout** | allocated, spent and applied reconciled against **live** local and hosted counts. A disagreement halts closeout (refusal 13) |

**Proposed is not allocated, allocated is not created, and a budget whose ceiling
is not also its stop condition is not a budget.** A second migration of any kind
halts the phase and returns to the owner.
