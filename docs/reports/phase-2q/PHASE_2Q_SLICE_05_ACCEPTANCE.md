# Phase 2Q — Slice 2Q.5 acceptance record

**Truthful completion: the matrix is generated from the phase's own records or
nothing is written at all.**

- **Authorization:** implementation, **ADR-128**; the accessibility premise
  correction and its classifications, **ADR-129**.
- **Requirements:** `2Q-CLOSE-001` … `-005` (5 of 42; **42 of 42 cumulative**).
- **Migrations:** **none.** Budget stays **1 allocated · 1 spent**, and a second
  of any kind remains a stop condition.
- **Baseline:** `main` **`198591c`**, worktree clean, zero open PRs, CI green 3/3
  on that exact merge SHA, **100 local = 100 hosted, parity `202608210100`**.
- **The phase does not close here.** This slice prepares the technical closeout;
  **the owner's device checkpoint is the gate**, and Phase 2Q is not declared
  complete until they have run it.

---

## 1. `2Q-CLOSE-001` — generated, or refused entirely

`scripts/generate-phase-2q-traceability.mjs` reads the PRD and the **six** slice
acceptance records, and either writes
`PHASE_2Q_TRACEABILITY_MATRIX.md` or **writes nothing**.

**It refused before it produced.** Run against the tree before this record
existed, it named the five `2Q-CLOSE` requirements as *"declared and never
classified"* and exited non-zero. That is the behaviour, observed rather than
described: a matrix that is 41/42 correct reads as complete, which is why a
refusal produces no file.

### Three traps it is built to survive

Each has cost this repository a wrong document before:

1. **The subject of a row is its first cell**, never the first identifier on the
   line. Evidence cells routinely cite *other* requirements.
2. **The class is the second cell**, never the first class word on the line. An
   evidence cell reading *"already correct, so not `built`"* must not classify.
3. **A re-audit table is not a classification table.** Only rows whose first two
   cells are a bare identifier and a bare class are read, so a §1 table
   describing the tree *before* a slice contributes nothing.

---

## 2. `2Q-CLOSE-002` — a remainder and a destination, with the trap defended

A `partial`, `undelivered` or `not-built-by-rule` row must name a **concrete
remainder** and a **destination or signed rule**.

**The recorded trap is a row that satisfies the check by containing its own
identifier.** The subject is stripped from the evidence *before* the remainder is
looked for — `| 2Q-DEMO-001 | partial | 2Q-DEMO-001 |` reduces to the empty
string and is refused.

**Phase 2Q produced no such row**, which would leave the refusal vacuous against
the real records. So it is driven over **planted fixtures**: the self-referential
row, a row that describes a remainder but names no destination, a row that names
both (admitted, so the refusal is not simply always on), and a
`not-built-by-rule` row with and without its signed rule.

**Every refusal in `phase-2q-traceability.test.ts` has both sides.** A check that
cannot fail is not a check; one that always fails is not one either.

---

## 3. The matrix

**42 declared · 42 classified · 0 unclassified.**

| Class | Count |
|---|---:|
| `built` | 36 |
| `baseline` | 6 |
| `partial` | 0 |
| `not-built-by-rule` | 0 |
| `undelivered` | 0 |

The **six** `baseline` rows are `2Q-CITE-005`, `2Q-LINK-003`, `2Q-LINK-005`,
`2Q-TRUST-005`, `2Q-ACCESS-002` and `2Q-ACCESS-003` — each a property that
**already held** and was re-proved, not a shortfall. `2Q-ACCESS-002` and `-003`
are `baseline` **because ADR-129 Decision 7 says so**: the surfaces were already
correct on real WebKit and **no product fix was made**. Classifying them `built`
would claim a change that did not happen.

**This paragraph was wrong when it was typed, and the generator is what caught
it.** It said `built` 37 · `baseline` 5, because I forgot `2Q-TRUST-005` — the
memory-lifecycle requirement slice 2Q.3 classified `baseline` after making its
check non-vacuous. The counts above are now the generator's, and the correction
is left visible rather than silently overwritten: *"generated, never typed"* is
only worth something if the generator is allowed to win.

**Zero `undelivered`, and none hidden.** The two things this phase could not do
are recorded as what they are rather than as classes: the real producer's hosted
proof is **UNSPENDABLE** (a paid AI call the owner has not authorized), and it is
**item 1 of the owner's checkpoint** rather than a requirement quietly marked
green.

---

## 4. `2Q-CLOSE-003` — hosted, with a two-sided residue control

**Parity, read live:** `202608210100`, **100 local = 100 hosted**.

**A zero count over an empty table satisfies every residue marker**, so the probe
was made to see first:

| Probe | Planted | Removed |
|---|---:|---:|
| Fixture auth users | **1** | **0** |
| Fixture summaries (`model = 'closeout-probe'`) | **1** | **0** |
| Summaries whose envelope carries the fixture's source id | **1** | **0** |
| Profiles created by the `on_auth_user_created` trigger | **1** | **0** |

And every marker any Phase 2Q fixture ever used, swept together after removal:
`codex-2q%` users **0** · `fixture` / `residue-probe` / `closeout-probe`
summaries **0** · marker tasks **0** · marker entries **0**.

**The probes are still capable of seeing**, which is what makes those zeroes
real: 2 users, 1 summary, 9 tasks readable, and `summaries` still carrying its
**15** columns.

**Zero residue.**

---

## 5. `2Q-CLOSE-004` — what an agent cannot discharge, and the human act that would

| Remainder | Why an agent cannot close it | The act that would |
|---|---|---|
| The real producer's end-to-end proof | Generating a review is a **paid AI call against the owner's BYOK credential**; ADR-128 Decision 5 forbids spending one | the owner generates a review on their own device — **checkpoint item 1** |
| `2P-REVIEW-CITATIONS` | ADR-125 Decision 4: it is delivered when a review **on the owner's own device** offers a working link to a real record. No agent run is that | the owner opens a review and clicks a source link |
| `2P-ACCESS-005` (VoiceOver) | Requires a screen reader on real hardware. **WAIVED, NOT PASSED**, and nothing in this phase earns it | the owner, or a later initiative with the hardware |
| `2P-ATTENTION-008`'s back-navigation half | Re-audited in slice 2Q.0 and found **narrower** than Phase 2P recorded — refresh **is** proved in a browser; back navigation is proved nowhere. **This phase does not discharge it** | the owner decides where it goes |
| `RG-DEP-3` | A rollout gate that **cannot be closed by writing a file** | the owner's rollout decision |
| The dark scan on **real routes** | ADR-129 rejected it for slice 2Q.4 on size; it is the more robust shape | a later initiative, at the owner's discretion |

---

## 6. `2Q-CLOSE-005` — the successor is not started

The phase-start guard sits where **ADR-126 Decision 5** put it, in the commit
that authorized this phase, and it has not been unenforced since. Nothing in
Phase 2Q retargets it, and **no ADR in this phase names a successor** —
`phase-2q-declarations.test.ts` asserts that ADR-126, ADR-127 and ADR-128 all
refuse the successor's letter, and ADR-129 carries the same refusal.

No successor PRD, plan, requirement namespace, branch or roadmap entry exists.

---

## 7. The online suite, three lanes

Run against the **production build** and the **hosted database**:

| Spec | `desktop` | `mobile` | `iphone-emulated` |
|---|---|---|---|
| `online-phase-2q-citations.spec.ts` | **9 passed** | **9 passed** | **9 passed** |
| `online-phase-2q-accessibility-fidelity.spec.ts` | **4 passed** | — | **4 passed** |
| `accessibility.spec.ts` (now in CI on all three) | **65 passed** | **70 passed** | **65 passed** |

The fidelity proof is not run on `mobile`: it compares a fixture against the real
app on **two engines**, and `mobile` is Chromium like `desktop` — a third
Chromium run would add minutes and no coverage. Stated rather than silently
skipped.

---

## 8. Requirements

| Requirement | Class | Evidence |
|---|---|---|
| `2Q-CLOSE-001` | **built** | the generator refuses or writes; observed refusing on the incomplete tree and then producing 42/42, with three misreading traps defended positionally |
| `2Q-CLOSE-002` | **built** | remainder **and** destination required, with the self-referential row stripped of its own identifier first; driven over planted fixtures because the real records contain no `partial`, each with both sides |
| `2Q-CLOSE-003` | **built** | parity `202608210100` read live, 100 = 100; two-sided residue control planted, seen, removed, unseen, with the probes proved still able to see |
| `2Q-CLOSE-004` | **built** | six remainders named, each with the human act that would discharge it |
| `2Q-CLOSE-005` | **built** | the guard stays where ADR-126 put it; no ADR in this phase names a successor; no successor artifact exists |

**42 of 42 classified. Zero unclassified.**

---

## 9. What this slice deliberately did not do

- **It did not close the phase.** The owner's device checkpoint is the gate.
- **It did not close any inherited remainder by writing about it.** `RG-DEP-3`
  still cannot be closed by writing a file, and this record does not.
- **It spent no AI credential**, created no migration, and wrote no hosted data
  beyond the residue fixture it removed.
- **It started and planned no successor phase.**
- Signup closed · rollout 25 · 3 · 2 · push HTTP 403 not resumed ·
  `2P-ACCESS-005` **WAIVED, NOT PASSED** · `2P-REVIEW-CITATIONS` **NOT
  DELIVERED**.
