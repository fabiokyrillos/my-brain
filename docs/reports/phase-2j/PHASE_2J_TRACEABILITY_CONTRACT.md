# Phase 2J — Traceability Contract

**Status:** planning. This contract binds the phase's closeout before any code exists, so
the standard cannot be relaxed once the results are known.

Carried forward unchanged from Phase 2I, which is the point: a contract that is rewritten
per phase is not a contract.

---

## 1. Declared inventory

**74 requirements across nine families.** The count is fixed at authorization. A
requirement may be reclassified; it may not be deleted, and adding one is an owner
amendment.

| Family | Count | Slice |
| --- | --- | --- |
| `2J-ACCESS` | 8 | 2J.0 |
| `2J-HOJE` | 10 | 2J.1 |
| `2J-ATTN` | 12 | 2J.2 |
| `2J-CAPTURE` | 7 | 2J.3 |
| `2J-VOICE` | 15 | 2J.4 |
| `2J-DAY` | 6 | 2J.5 |
| `2J-PRIVACY` | 5 | 2J.6 |
| `2J-METRICS` | 7 | 2J.7 |
| `2J-CLOSE` | 4 | 2J.7 |
| **Total** | **74** | |

## 2. Outcome classes

| Class | Meaning | Evidence required |
| --- | --- | --- |
| **built** | The phase wrote it | An executed test, named by file, that fails if the behaviour is removed |
| **baseline** | It already shipped; the phase asserted it | The asserting test **plus** the commit or file predating this phase |
| **rename** | A label or route changed, nothing else | The exact constant, before and after |
| **evidenced negative** | Delivered by *not* being built | A **re-derived** proof of absence, not an assertion of it |
| **partial** | Incompletely delivered | The delivered part, the missing part, **and a named destination** |
| **undelivered** | Not delivered | Why, and where it goes |

**`baseline` exists because Phase 2I's audit was wrong three times** about what had already
shipped — `chat: "Conversar"`, the grouped `Mais` destinations, and Library's `group:
"context"` membership. A phase reporting an assertion of existing behaviour identically to
something it built overstates itself. Phase 2J's audit expects several `baseline` outcomes
in `2J-HOJE` and `2J-ATTN`, and that is a correct result, not a shortfall.

**An evidenced negative must be re-derived, never asserted.** The standard is
`2I-LIB-004`'s: the guard re-reads `database.types.ts` on every run, so a future migration
adding a pin column *breaks the guard* rather than leaving a stale claim in a document.
Phase 2J's `2J-VOICE-013` is held to exactly that standard.

## 3. The generator is fail-closed

`2J-CLOSE-001` reuses the Phase 2I generator's contract:

- It **refuses to write** when any requirement lacks evidence, and names every one it
  refused on. Phase 2I's generator refused on its first real run, naming nineteen
  requirements — that is the behaviour being preserved.
- A `partial` claim without a **destination** is a refusal, not a warning.
- Attribution matches the declaration shape `- **2J-XXXX-000:**`, the same shape A13 uses,
  so a requirement cannot be evidenced under a family it does not belong to.
- The generator is itself mutation-tested. Phase 2I used eleven negative fixtures; Phase 2J
  reuses the suite and adds fixtures for any new rule.

## 4. What counts as evidence

- **An executed test.** Not a described one, not a plan to write one.
- **For a DB-level claim, a DB-level proof.** pgTAP, run in CI against a real migration
  chain. A hosted readback cannot see a chain-only defect.
- **For an ownership claim, two accounts in both directions.** A policy written
  `user_id = auth.uid()` and one written for a literal are indistinguishable from one side.
  This is `T-2I-01`'s standard and it is not negotiable for `2J-ATTN`.
- **For a browser-level claim, a browser.** Component tests do not discharge
  `2J-ACCESS-001`, `004`, `005`, `006` or `007`. This is the whole reason `2I-CLOSE-002`
  closed partial.
- **For a manual verification, a manual record** — reader, platform, date, outcome. It is
  never reported as automated (`2J-ACCESS-008`).

## 5. Suspect the probe before the product

Phase 2H recorded six of twelve defects in probes; Phase 2I recorded thirteen of fifteen in
probes, fixtures, guards or tooling. The standing rule:

- A failing guard is investigated as a **possible guard defect first**.
- A harness that edits the artifact it measures tests a different artifact.
- A fixture must not share a key with a live writer, and `now()` is transaction time.
- A gateway 401 is not the function's answer.
- **A control must not be exempt from the mechanism it controls.**

## 6. Owner decisions and how each is discharged

| ID | Question | Blocks | Discharged by |
| --- | --- | --- | --- |
| **OD-2J-1** | How does `highly_sensitive` behave on Hoje, attention, capture receipts, notifications and review summaries? | 2J.6; gates 2J.1/2J.2 acceptance | A recorded owner answer, then one data module asserted by guard (`2J-PRIVACY-002`) |
| **OD-2J-2** | What does voice do when the account has no valid AI credential? | 2J.4 (G-2J.4a) | A recorded owner answer, then a state with copy and a way forward |
| **OD-2J-3** | May daily priorities be explicitly user-selected? | `2J-HOJE-004`'s shape only | Deterministic derivation ships unless the owner chooses otherwise; "explicit" makes it an owner-approved migration amendment |

An owner decision is discharged by a **recorded answer**, never by an implementer choosing
the reasonable-looking option. Phase 2I's OD-1 is the template: the answer became
`DEFAULT_SENSITIVITY` as data, with a guard asserting `highly_sensitive` is absent from it.

## 7. Migration reconciliation

**Per slice, not by count.** Phase 2H's lesson: five migrations with two belonging to one
slice and none to another spends the budget exactly and still breaks the rule.

- M1 → 2J.7. M2 → 2J.4.
- A migration created by a slice it was not allocated to is a **budget violation** even if
  the total is respected.
- `2 allocated · 1 spent` is a legitimate close (M2 is marked avoidable in the PRD).
- **A migration is never created to justify the allocation.** Phase 2I's `1 allocated ·
  0 spent` is the precedent and the preferred outcome.
- A third migration is an owner amendment.

## 8. Standing commitments restated at close

- **ADR-055** — open, unchanged, expiring **2026-10-27**. Phase 2J neither satisfies nor
  supersedes it. `2J-CLOSE-003` requires this restated explicitly, because a phase that
  adds no semantic retrieval can drift into implying the question is settled.
- **`T-2I-02`** — no second write path. Inherited, and stressed hardest by 2J.3.
- **The rollout gate** — Phase 2J does not touch it and must not be read as progress
  toward it. Signup remains closed.

## 9. Closing report

The phase closes with `docs/reports/phase-2j/PHASE_2J_REPORT.md` stating: declared count,
classified count, per-class counts, undelivered count, budget allocated and spent
reconciled per slice, hosted parity before and after, every PR with its PR-head and
merge-SHA CI result, every defect with where it was found, every deferral with its
destination, and the three standing commitments in §8.

**A phase does not close with an undelivered requirement and no destination.**
