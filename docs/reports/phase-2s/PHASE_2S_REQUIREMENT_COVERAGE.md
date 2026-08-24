# Phase 2S — requirement coverage

**What this is:** a derived view of what
[`PHASE_2S_PRD.md`](../../initiatives/phase-2s/PHASE_2S_PRD.md) declares — how
many requirements exist, which family and slice each belongs to, what kind each
asks for, and which open decision each rests on.

**What this deliberately is not:** a classification. **No requirement here
carries a delivery class**, because nothing has been built. Classification
happens at closeout, from the slices' own acceptance records, through the
generator governed by
[`PHASE_2S_TRACEABILITY_CONTRACT.md`](./PHASE_2S_TRACEABILITY_CONTRACT.md).

**Every number below is derived from the PRD's tables, never typed.** Phase 2R's
PRD once said *"fifty-two across nine families"* while its tables held 73 across
ten, and the sentence was caught by counting rows rather than by reading it.
`src/lib/closeout/phase-2s-declarations.test.ts` asserts these totals against the
tables in both directions.

---

## Totals

| | |
|---|---|
| declared requirements | **74** |
| distinct identifiers | **74** — no duplicate declaration |
| families | **10**, every name letters-only |
| slices | **5**, plus one family delivered across all of them |
| **classified** | **0 — deliberately** |

**By kind — what the requirement asks for, not what happened:**

| kind | n | meaning |
|---|---|---|
| `build` | **52** | new behaviour |
| `baseline` | **16** | an existing property this phase must prove still holds |
| `rule` | **6** | deliberately not built; the delivery is the recorded refusal |

**`baseline` may never be recorded as `built`.** Sixteen requirements are
declared `baseline` here, and refusal 10 in the contract turns that rule into an
exit code — because Phase 2R stated it in prose and five requirements were
misfiled from its first slice to its last.

---

## Coverage by slice

| slice | requirements | families |
|---|---|---|
| **2S.0** — measure, change nothing | **7** | `2S-FOUNDATION` |
| **2S.1** — model, cadence, destination | **21** | `2S-SILENCE` (8), `2S-CADENCE` (8), `2S-REACH` (5) |
| **2S.2** — the verbs | **8** | `2S-SILENCE` (2), `2S-ANSWER` (6) |
| **2S.3** — where it appears | **17** | `2S-ATTENTION` (7), `2S-ACCESS` (5), `2S-MOBILE` (5) |
| **2S.4** — closeout | **12** | `2S-CLOSE` |
| **across all slices** | **9** | `2S-TRUST` |
| **total** | **74** | |

`2S-SILENCE` is the only family split across two slices: `-001` … `-006`, `-009`
and `-010` are the model and its proof (2S.1); `-007` and `-008` are the controls
that reach it (2S.2). The split is deliberate and follows the plan's
non-negotiable order — **migration → writer → consumer**.

---

## Coverage by family

| family | n | asks | slice |
|---|---|---|---|
| `2S-FOUNDATION` | 7 | measure before changing anything | 2S.0 |
| `2S-SILENCE` | 10 | the owner can say *not now* and *not this* | 2S.1, 2S.2 |
| `2S-CADENCE` | 8 | the Brain does not repeat itself daily forever | 2S.1 |
| `2S-REACH` | 5 | a notice points at its subject, not at a list | 2S.1 |
| `2S-ANSWER` | 6 | the disposition the schema already has becomes reachable | 2S.2 |
| `2S-ATTENTION` | 7 | the unanswered appear where the owner looks | 2S.3 |
| `2S-TRUST` | 9 | authority, audit, undo and honesty | across |
| `2S-ACCESS` | 5 | reachable by everyone | 2S.3 |
| `2S-MOBILE` | 5 | on the device it is used on | 2S.3 |
| `2S-CLOSE` | 12 | the phase can be audited after it ends | 2S.4 |

**No family name contains a digit.** `2K-A11Y` did, which made seven
accessibility requirements invisible to every prose count, to the traceability
generator's attribution check **and** to the phase-start detector's `[A-Z]+`
family pattern. `2S-CLOSE-006` makes the property checkable rather than
remembered, with a two-sided control.

---

## Which requirements rest on which open decision

**Ten decisions are open and none is signed.** A requirement resting on an
unsigned decision is **not buildable**.

| decision | requirements gated | which |
|---|---|---|
| `OD-2S-1` — where the silence is stored | **8** | `2S-SILENCE-001` … `-006`, `2S-TRUST-001`, `2S-TRUST-006` |
| `OD-2S-2` — what the owner can say | **7** | `2S-SILENCE-007`, `-008`, `2S-ANSWER-001` … `-003`, `2S-ACCESS-001`, `-002` |
| `OD-2S-3` — a link, or inline controls | **5** | `2S-REACH-001` … `-005` |
| `OD-2S-4` — how often the Brain may repeat itself | **4** | `2S-CADENCE-001`, `-002`, `-003`, `-008` |
| `OD-2S-5` — where the unanswered appear | **8** | `2S-SILENCE-008`, `2S-CADENCE-008`, `2S-ATTENTION-001` … `-006` |
| `OD-2S-6` — push | **1** | `2S-TRUST-008` |
| `OD-2S-7` — the migration budget | **4** | `2S-SILENCE-001`, `2S-TRUST-003`, `-004`, `2S-CLOSE-005` |
| `OD-2S-8` — `OD-2R-9`'s defects | **0** | see below |
| `OD-2S-9` — does the heartbeat change | **9** | `2S-SILENCE-009`, `-010`, `2S-CADENCE-001`, `-004` … `-007`, `2S-ANSWER-004`, `2S-TRUST-005` |
| `OD-2S-10` — ADR-055 | **0** | see below |

**32 requirements rest on no open decision.** They are the measurement family,
the closeout family, and the parts of `2S-TRUST`, `2S-ACCESS` and `2S-MOBILE`
that hold whatever is signed.

### `OD-2S-8` and `OD-2S-10` gate zero requirements, and that is not an omission

Both are recommended **out**. A decision recommended out has nothing resting on
it *by construction* — its requirements do not exist yet.

**Answering either one differently adds requirements rather than unblocking
them.** `OD-2S-8` B would add one to `2S-ATTENTION`; `OD-2S-8` C would add a
second family; `OD-2S-10` B would add a `2S-CLOSE` requirement carrying an
unrelated ADR. The implementation plan's estimate table prices each.

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
| `2S-ATTENTION-001` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-002` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-003` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-004` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-005` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-006` | 2S.3 | build | `OD-2S-5` |
| `2S-ATTENTION-007` | 2S.3 | baseline | — |
| `2S-TRUST-001` | across | build | `OD-2S-1` |
| `2S-TRUST-002` | across | build | — |
| `2S-TRUST-003` | across | build | `OD-2S-7` |
| `2S-TRUST-004` | across | build | `OD-2S-7` |
| `2S-TRUST-005` | across | baseline | `OD-2S-9` |
| `2S-TRUST-006` | across | build | `OD-2S-1` |
| `2S-TRUST-007` | across | **rule** | — |
| `2S-TRUST-008` | across | **rule** | `OD-2S-6` |
| `2S-TRUST-009` | across | baseline | — |
| `2S-ACCESS-001` | 2S.3 | build | `OD-2S-2` |
| `2S-ACCESS-002` | 2S.3 | build | `OD-2S-2` |
| `2S-ACCESS-003` | 2S.3 | build | — |
| `2S-ACCESS-004` | 2S.3 | build | — |
| `2S-ACCESS-005` | 2S.3 | **rule** | — |
| `2S-MOBILE-001` | 2S.3 | build | — |
| `2S-MOBILE-002` | 2S.3 | build | — |
| `2S-MOBILE-003` | 2S.3 | build | — |
| `2S-MOBILE-004` | 2S.3 | baseline | — |
| `2S-MOBILE-005` | 2S.3 | **rule** | — |
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

---

## The six `rule` requirements, named because a refusal must be visible

A `rule` requirement is **delivered by the refusal being recorded**, not by code.
Listing them together is what stops one being mistaken for something nobody got
to.

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

**1 proposed · 0 allocated · 0 spent · 0 created.**

101 local = 101 hosted, parity `202608230101`, re-read live on 2026-08-24 with
the **version sets compared by diff**, not merely the counts.

**Four requirements rest on `OD-2S-7`**, and none of them may be built before an
accepted ADR allocates the migration. **Proposed is not allocated, allocated is
not created, and a second migration of any kind is a stop condition.**
