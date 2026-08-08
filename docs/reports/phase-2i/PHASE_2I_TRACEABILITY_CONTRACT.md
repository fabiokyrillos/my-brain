# Phase 2I — Traceability contract

**Status:** PLANNING ONLY. **Date:** 2026-08-07.

The contract the closing generator must satisfy. Written **before** the
generator, so the generator is built against a stated rule rather than the rule
being inferred from whatever the generator happens to do.

---

## 1. The property

> **The matrix may not contain a claim the repository does not support, and the
> generator must refuse rather than print one.**

Phase 2H's generator proved this works by **refusing on its first run against
the real repository**, naming exactly the five `2H-CLOSE-*` it had not yet
evidenced, and writing nothing. A generator whose first act is to refuse to
describe its own slice will refuse to describe anybody else's.

---

## 2. Inputs

| Input | Role |
| --- | --- |
| `docs/initiatives/phase-2i/PHASE_2I_PRD.md` | **The only** declaration of requirements |
| `docs/initiatives/phase-2i/PHASE_2I_IMPLEMENTATION_PLAN.md` | Slice ↔ requirement ↔ migration allocation |
| `docs/reports/phase-2i/PHASE_2I_SLICE_*_ACCEPTANCE.md` | Evidence, one per slice |
| `supabase/migrations/` | Budget reconciliation |
| The repository itself | Cited files, tests and guards must exist |

**Declaration shape**, matching the repository's existing convention and the A13
detector: `- **2I-FAMILY-000:** …` at the start of a line.

---

## 3. Rules the generator enforces

1. **Every declared requirement is classified** — delivered, partial or
   undelivered. No requirement may be absent from the matrix.
2. **Every "delivered" carries a citation that resolves.** A cited path that does
   not exist is a refusal, not a warning.
3. **No requirement outside the `2I-` namespace is declared** in the Phase 2I
   PRD. Referencing another phase's id is permitted; declaring one is not.
4. **Every requirement belongs to exactly one slice**, and every slice's
   requirements are named in the plan.
5. **The migration budget reconciles per slice, not by count.** Phase 2H learned
   this: five migrations with two in one slice and none in another spends a
   budget of five exactly and still breaks the rule. Phase 2I's allocation is
   **1, to 2I.5 only**, so:
   - 0 spent → **valid**, and the preferred close;
   - 1 spent by **2I.5** → valid;
   - 1 spent by **any other slice** → **refusal**;
   - ≥2 spent → **refusal** absent a recorded owner amendment.
6. **A partial requirement names its destination.** "Partial" with no successor
   is an undelivered requirement with better wording.
7. **The generator is idempotent against disk** — regenerating produces a
   byte-identical matrix, so CI can assert the committed file is current.
8. **Unreadable input throws.** Fail-closed: a missing PRD is a refusal, never
   an empty matrix.

---

## 4. Rules specific to this phase

These exist because Phase 2I's particular failure modes are not generic.

9. **A requirement classified "delivered" against DELIVERED baseline must say
   so.** `2I-SHELL-001` asserts an existing property and builds nothing; its
   citation is the existing code plus the guard that forbids regression. **A
   matrix that reports it identically to a requirement that built something
   would overstate the phase**, and the audit's whole purpose was to stop that.
   The matrix carries a **`baseline`** marker distinguishing:
   - *built* — new code delivers it;
   - *baseline* — already true; this phase asserts and protects it;
   - *rename* — a label or grouping changed, nothing structural.
10. **`2I-LIB-004` may close as "not supported, not built"** with evidence that
    no pin/favourite column exists in any of the six domains. That is a
    **delivered** classification for a requirement whose honest answer is that
    the capability is absent — not a partial. The generator must accept an
    evidenced negative.
11. **`2I-SEARCH-010` requires an explicit statement** that ADR-055 is neither
    satisfied nor superseded, and that no embedding column or vector RPC is
    referenced. The generator asserts the statement exists.
12. **`2I-METRIC-004` requires a structural citation** — the event definition
    showing there is no free-text column — not a claim that call sites are
    careful.
13. **The rollout gate reading at close is recorded verbatim** (G-2I.6),
    including its verdict line.

---

## 5. Non-vacuity

A generator that finds nothing and reports success is the failure this contract
exists to prevent.

- **Mutation fixtures**, one deliberate defect each, in the shape of Phase 2H's
  thirteen: an unresolvable citation; a requirement declared and never cited; a
  migration attributed to the wrong slice; two migrations; a `2H-` id declared in
  the 2I PRD; a *built* claim over a *baseline* requirement; a partial with no
  destination. **One fixture, one defect** — a fixture producing two findings
  proves less, because it cannot say which rule fired.
- **The real repository is the positive control.**
- **The generator must refuse at least once during the phase**, and that refusal
  is recorded. If it never refuses, the phase has not demonstrated that it can.

---

## 6. What the matrix is not

It is not evidence that the phase is good, that the UX works, or that anyone
found the product easier to use. It asserts that **every claim made about the
phase is supported by something in the repository.** The acceptance question in
the PRD §1 is answered by journeys and accessibility acceptance, not by this
document.
