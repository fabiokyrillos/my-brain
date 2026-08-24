# Phase 2S — requirement coverage

**What this is:** a derived view of what
[`PHASE_2S_PRD.md`](../../initiatives/phase-2s/PHASE_2S_PRD.md) declares — how
many requirements exist, which family and slice each belongs to, what kind each
asks for, and which signed decision each rests on.

**What this deliberately is not:** a classification. **No requirement here
carries a delivery class**, because nothing has been built. Classification
happens at closeout, from the slices' own acceptance records, through the
generator governed by
[`PHASE_2S_TRACEABILITY_CONTRACT.md`](./PHASE_2S_TRACEABILITY_CONTRACT.md).

**Every number below is derived from the PRD's tables, never typed.** Phase 2R's
PRD once said *"fifty-two across nine families"* while its tables held 73 across
ten, and the sentence was caught by counting rows rather than by reading it.
**That defect happened again in this document's own first draft**: slice 2S.2 was
written as 31 requirements and re-deriving it from the tables gave 23. It was
caught the same way — by counting — and it is recorded here rather than quietly
fixed, because the point of the rule is that nobody is exempt from it.
`src/lib/closeout/phase-2s-declarations.test.ts` asserts these totals against the
tables in both directions.

---

## Totals

| | |
|---|---|
| declared requirements | **99** |
| distinct identifiers | **99** — no duplicate declaration |
| families | **11**, every name letters-only |
| slices | **5**, plus one family delivered across all of them |
| **classified** | **0 — deliberately** |

**By kind — what the requirement asks for, not what happened:**

| kind | n | meaning |
|---|---|---|
| `build` | **75** | new behaviour |
| `baseline` | **18** | an existing property this phase must prove still holds |
| `rule` | **6** | deliberately not built; the delivery is the recorded refusal |

**`baseline` may never be recorded as `built`.** Eighteen requirements are
declared `baseline` here, and refusal 10 in the contract turns that rule into an
exit code — because Phase 2R stated it in prose and five requirements were
misfiled from its first slice to its last.

---

## What the signatures changed

**ADR-137 signed all ten decisions on 2026-08-24.** Nine took the
recommendation; **`OD-2S-3` was signed B against it, deliberately.**

| | before the signatures | after | delta |
|---|---|---|---|
| requirements | 74 | **99** | **+25** |
| families | 10 | **11** | +1 — `2S-ACT` |
| `build` · `baseline` · `rule` | 52 · 16 · 6 | **75 · 18 · 6** | +23 · +2 · 0 |
| slice 2S.2 | 8 | **23** | **+15** |
| slice 2S.3 | 17 | **22** | +5 |
| threats | 14 | **19** | +5 |
| probable estimate | 11.5 days | **15 days** | **+3.5** |

**Every one of the 25 was appended.** `2S-ACT` is a new family of twelve;
thirteen were added to the ends of `2S-SILENCE`, `2S-ANSWER`, `2S-ATTENTION`,
`2S-TRUST`, `2S-ACCESS`, `2S-MOBILE` and `2S-CLOSE`. **No identifier was
renumbered, reused or removed**, so every reference written against the
pre-signature package still resolves to the same requirement — a property the
declarations guard asserts by name.

---

## Coverage by slice

| slice | requirements | families |
|---|---|---|
| **2S.0** — measure, change nothing | **7** | `2S-FOUNDATION` |
| **2S.1** — model, cadence, destination | **21** | `2S-SILENCE` (8), `2S-CADENCE` (8), `2S-REACH` (5) |
| **2S.2** — the verbs and the actions | **23** | `2S-SILENCE` (3), `2S-ANSWER` (8), `2S-ACT` (12) |
| **2S.3** — where it appears | **22** | `2S-ATTENTION` (8), `2S-ACCESS` (7), `2S-MOBILE` (7) |
| **2S.4** — closeout | **13** | `2S-CLOSE` |
| **across all slices** | **13** | `2S-TRUST` |
| **total** | **99** | |

`2S-SILENCE` is the only family split across two slices: `-001` … `-006`, `-009`
and `-010` are the model and its proof (2S.1); `-007`, `-008` and `-011` are the
controls that reach it and the scope separation that binds them (2S.2). The split
is deliberate and follows the plan's non-negotiable order — **migration → writer
→ consumer**.

---

## Coverage by family

| family | n | asks | slice |
|---|---|---|---|
| `2S-FOUNDATION` | 7 | measure before changing anything | 2S.0 |
| `2S-SILENCE` | 11 | the owner can say *not now* and *not this* | 2S.1, 2S.2 |
| `2S-CADENCE` | 8 | the Brain does not repeat itself daily forever | 2S.1 |
| `2S-REACH` | 5 | a notice points at its subject, not at a list | 2S.1 |
| `2S-ANSWER` | 8 | the disposition the schema already has becomes reachable | 2S.2 |
| **`2S-ACT`** | **12** | **acting on the subject, from the notice itself** — `OD-2S-3` B | 2S.2 |
| `2S-ATTENTION` | 8 | the unanswered appear where the owner looks | 2S.3 |
| `2S-TRUST` | 13 | authority, audit, undo and honesty | across |
| `2S-ACCESS` | 7 | reachable by everyone | 2S.3 |
| `2S-MOBILE` | 7 | on the device it is used on | 2S.3 |
| `2S-CLOSE` | 13 | the phase can be audited after it ends | 2S.4 |

**No family name contains a digit.** `2K-A11Y` did, which made seven
accessibility requirements invisible to every prose count, to the traceability
generator's attribution check **and** to the phase-start detector's `[A-Z]+`
family pattern. `2S-CLOSE-006` makes the property checkable rather than
remembered, with a two-sided control — and `2S-ACT` was named for the same
reason, in three letters, rather than anything containing a number.

---

## Which requirements rest on which signed decision

**All ten are signed (ADR-137).** A requirement resting on a signed decision is
buildable once implementation is separately authorized — which it is not yet.

| decision | signed | requirements gated |
|---|---|---|
| `OD-2S-1` — where the silence is stored | A | **8** |
| `OD-2S-2` — what the owner can say | A | **11** |
| **`OD-2S-3` — a link, or inline controls** | **B** | **28** |
| `OD-2S-4` — how often the Brain may repeat itself | B | **4** |
| `OD-2S-5` — where the unanswered appear | B | **10** |
| `OD-2S-6` — push | A | **1** |
| `OD-2S-7` — the migration budget | A | **4** |
| `OD-2S-8` — `OD-2R-9`'s defects | A | **0** |
| `OD-2S-9` — does the heartbeat change | A | **10** |
| `OD-2S-10` — ADR-055 | A | **0** |

**32 requirements rest on no decision.** They are the measurement family, the
closeout family, and the parts of `2S-TRUST`, `2S-ACCESS` and `2S-MOBILE` that
hold whatever was signed.

### `OD-2S-3` gates 28 requirements — more than any other decision

That is the override's weight, measured rather than characterised. It is more
than `OD-2S-1` and `OD-2S-9` combined, and it is why the threat model grew by
five and slice 2S.2 nearly tripled.

**The objection the decision overrode is not gone; it is in the list.**
`2S-TRUST-010` forbids a new write authority and makes one a **stop condition**;
`2S-ACT-003` and `-004` name the Server Actions the task verbs must route to; and
`2S-CLOSE-013` re-proves the reuse at closeout against slice 2S.0's recorded
baseline.

### `OD-2S-8` and `OD-2S-10` gate zero requirements, and that is not an omission

Both were signed **A** — out. A decision signed out has nothing resting on it *by
construction*: its requirements do not exist.

**The owner restated `OD-2S-8` after `OD-2S-3` B widened the work on the very
file the excluded defect lives in.** Filter preservation on navigation, and a
linkable search that can be returned to, stay in a short separate initiative.
`2P-ATTENTION-008` and `OD-2R-9`'s two defects are **not** discharged by this
phase editing their file.

**A decision that gates nothing is still a decision**, and recording it as such
is what keeps *excluded* different from *forgotten*.

---

## Every requirement

| ID | slice | kind | rests on |
|---|---|---|---|
| `2S-FOUNDATION-001` | 2S.0 | baseline | — |
| `2S-FOUNDATION-002` | 2S.0 | baseline | — |
| `2S-FOUNDATION-003` | 2S.0 | baseline | — |
| `2S-FOUNDATION-004` | 2S.0 | baseline | — |
| `2S-FOUNDATION-005` | 2S.0 | baseline | — |
| `2S-FOUNDATION-006` | 2S.0 | baseline | — |
| `2S-FOUNDATION-007` | 2S.0 | build | — |
| `2S-SILENCE-001` | 2S.1 | build | `OD-2S-1`, `OD-2S-7` |
| `2S-SILENCE-002` | 2S.1 | build | `OD-2S-1` |
| `2S-SILENCE-003` | 2S.1 | build | `OD-2S-1` |
| `2S-SILENCE-004` | 2S.1 | build | `OD-2S-1` |
| `2S-SILENCE-005` | 2S.1 | build | `OD-2S-1` |
| `2S-SILENCE-006` | 2S.1 | build | `OD-2S-1` |
| `2S-SILENCE-007` | 2S.2 | build | `OD-2S-2` |
| `2S-SILENCE-008` | 2S.2 | build | `OD-2S-2`, `OD-2S-5` |
| `2S-SILENCE-009` | 2S.1 | build | `OD-2S-9` |
| `2S-SILENCE-010` | 2S.1 | build | `OD-2S-9` |
| `2S-SILENCE-011` | 2S.2 | build | `OD-2S-2`, `OD-2S-3` |
| `2S-CADENCE-001` | 2S.1 | build | `OD-2S-4`, `OD-2S-9` |
| `2S-CADENCE-002` | 2S.1 | build | `OD-2S-4` |
| `2S-CADENCE-003` | 2S.1 | build | `OD-2S-4` |
| `2S-CADENCE-004` | 2S.1 | baseline | `OD-2S-9` |
| `2S-CADENCE-005` | 2S.1 | baseline | `OD-2S-9` |
| `2S-CADENCE-006` | 2S.1 | baseline | `OD-2S-9` |
| `2S-CADENCE-007` | 2S.1 | baseline | `OD-2S-9` |
| `2S-CADENCE-008` | 2S.1 | build | `OD-2S-4`, `OD-2S-5` |
| `2S-REACH-001` | 2S.1 | build | `OD-2S-3` |
| `2S-REACH-002` | 2S.1 | build | `OD-2S-3` |
| `2S-REACH-003` | 2S.1 | build | `OD-2S-3` |
| `2S-REACH-004` | 2S.1 | build | `OD-2S-3` |
| `2S-REACH-005` | 2S.1 | baseline | `OD-2S-3` |
| `2S-ANSWER-001` | 2S.2 | build | `OD-2S-2` |
| `2S-ANSWER-002` | 2S.2 | build | `OD-2S-2` |
| `2S-ANSWER-003` | 2S.2 | build | `OD-2S-2` |
| `2S-ANSWER-004` | 2S.2 | build | `OD-2S-9` |
| `2S-ANSWER-005` | 2S.2 | baseline | — |
| `2S-ANSWER-006` | 2S.2 | **rule** | — |
| `2S-ANSWER-007` | 2S.2 | build | `OD-2S-2` |
| `2S-ANSWER-008` | 2S.2 | build | `OD-2S-2`, `OD-2S-9` |
| `2S-ACT-001` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-002` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-003` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-004` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-005` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-006` | 2S.2 | build | `OD-2S-2`, `OD-2S-3` |
| `2S-ACT-007` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-008` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-009` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-010` | 2S.2 | build | `OD-2S-3` |
| `2S-ACT-011` | 2S.2 | build | `OD-2S-3`, `OD-2S-5` |
| `2S-ACT-012` | 2S.2 | build | `OD-2S-3` |
| `2S-ATTENTION-001` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-002` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-003` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-004` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-005` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-006` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-007` | 2S.3 | baseline | — |
| `2S-ATTENTION-008` | 2S.3 | build | `OD-2S-3`, `OD-2S-5` |
| `2S-TRUST-001` | across | build | `OD-2S-1` |
| `2S-TRUST-002` | across | build | — |
| `2S-TRUST-003` | across | build | `OD-2S-7` |
| `2S-TRUST-004` | across | build | `OD-2S-7` |
| `2S-TRUST-005` | across | baseline | `OD-2S-9` |
| `2S-TRUST-006` | across | build | `OD-2S-1` |
| `2S-TRUST-007` | across | **rule** | — |
| `2S-TRUST-008` | across | **rule** | `OD-2S-6` |
| `2S-TRUST-009` | across | baseline | — |
| `2S-TRUST-010` | across | build | `OD-2S-3` |
| `2S-TRUST-011` | across | baseline | `OD-2S-3` |
| `2S-TRUST-012` | across | baseline | `OD-2S-3` |
| `2S-TRUST-013` | across | build | `OD-2S-3` |
| `2S-ACCESS-001` | 2S.3 | build | `OD-2S-2` |
| `2S-ACCESS-002` | 2S.3 | build | `OD-2S-2` |
| `2S-ACCESS-003` | 2S.3 | build | — |
| `2S-ACCESS-004` | 2S.3 | build | — |
| `2S-ACCESS-005` | 2S.3 | **rule** | — |
| `2S-ACCESS-006` | 2S.3 | build | `OD-2S-3` |
| `2S-ACCESS-007` | 2S.3 | build | `OD-2S-3` |
| `2S-MOBILE-001` | 2S.3 | build | — |
| `2S-MOBILE-002` | 2S.3 | build | — |
| `2S-MOBILE-003` | 2S.3 | build | — |
| `2S-MOBILE-004` | 2S.3 | baseline | — |
| `2S-MOBILE-005` | 2S.3 | **rule** | — |
| `2S-MOBILE-006` | 2S.3 | build | `OD-2S-3` |
| `2S-MOBILE-007` | 2S.3 | build | `OD-2S-3` |
| `2S-CLOSE-001` | 2S.4 | build | — |
| `2S-CLOSE-002` | 2S.4 | build | — |
| `2S-CLOSE-003` | 2S.4 | build | — |
| `2S-CLOSE-004` | 2S.4 | build | — |
| `2S-CLOSE-005` | 2S.4 | build | `OD-2S-7` |
| `2S-CLOSE-006` | 2S.4 | build | — |
| `2S-CLOSE-007` | 2S.4 | build | — |
| `2S-CLOSE-008` | 2S.4 | build | — |
| `2S-CLOSE-009` | 2S.4 | **rule** | — |
| `2S-CLOSE-010` | 2S.4 | build | — |
| `2S-CLOSE-011` | 2S.4 | build | — |
| `2S-CLOSE-012` | 2S.4 | build | — |
| `2S-CLOSE-013` | 2S.4 | build | `OD-2S-3` |

---

## The six `rule` requirements, named because a refusal must be visible

A `rule` requirement is **delivered by the refusal being recorded**, not by code.
Listing them together is what stops one being mistaken for something nobody got
to. **`OD-2S-3` B added none** — every one of its twelve is a `build`, which is
itself the honest signal that the override bought work rather than a position.

| ID | what is refused, and by what |
|---|---|
| `2S-ANSWER-006` | any `notifications` status member left unreachable must be a **named refusal**, never an omission |
| `2S-TRUST-007` | **no AI call, no credential spend** — and the credential is active, so this is a live refusal, not a vacuous one |
| `2S-TRUST-008` | **push is not resumed, not repaired, and not claimed** — `OD-2S-6` A |
| `2S-ACCESS-005` | **VoiceOver: NOT EXECUTED — OWNER WAIVED.** Never described as approved, tested or passing |
| `2S-MOBILE-005` | **the side drawer's lock question is not answered here** — `2R-DRAWER-NOT-LOCKED` stays an owner design decision |
| `2S-CLOSE-009` | **a hardware proof is never discharged by a document** |

---

## Migration accounting

**1 allocated · 0 spent · 0 created — `OD-2S-7` A, signed by ADR-137.**

101 local = 101 hosted, parity `202608230101`, re-read live on 2026-08-24 with
the version **sets** compared by diff, not merely the counts.

**`OD-2S-3` B did not raise the ceiling.** Every inline verb routes to an
authority that already exists, so the only schema the surface needs is the
suppression state `OD-2S-1` A already buys. **If an inline action turns out to
need schema of its own, that is a second migration and therefore a stop
condition** — not a budget revision.

**Four requirements rest on `OD-2S-7`**, and none may be built before
implementation is separately authorized. **Allocated is not created, and signed
is not authorized.**
