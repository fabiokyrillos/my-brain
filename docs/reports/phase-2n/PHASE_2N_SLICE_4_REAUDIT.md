# Phase 2N slice 2N.4 — re-audit against `main` after 2N.3, **NOT STARTED**

Written **before any code**, and this document starts nothing. It records what
`2N-CONFLICT-001` requires the phase to produce — *"which conflicts are
deterministically detectable from the schema as it stands"* — measured against
the tree and database slice 2N.3 left behind, so whoever implements 2N.4 begins
from facts rather than from the plan's expectations.

**Zero requirements are claimed here. Zero files were created for the slice.**

## 0. Baseline

| Fact | Value |
| --- | --- |
| `main` | `0b7565c`, clean |
| Migrations | **94 local = 94 hosted**, parity **`202608140094`** |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 reserved for 2N.7** · a fourth is a **STOP CONDITION** |
| Slice 2N.3 | **complete and deployed** |
| Slice 2N.4 | **not started** |

`OD-2N-7` **A** signs read-time derivation with **no conflict table and no
persisted conflict lifecycle**, so 2N.4's declared schema impact is **none** —
and nothing below changes that.

## 1. Two findings that subtract work, and one that adds a decision

### 1.1 "Precisa de você" already ships — 2N.4 routes into it, it does not build it

`src/features/daily-cycle/attention-projection.ts`,
`needs-attention-list.tsx`, `needs-attention-item.tsx` and
`projection-mappers.ts` are live, paginated at `ATTENTION_PAGE_SIZE = 20`, with
copy in both locales.

`2N-CONFLICT-003`'s *"the conflict routes into 'Precisa de você'"* is therefore
a **consumer change on a surface that exists**, not a surface to design. The plan
does not say otherwise, but it does not say this either, and a slice that
budgeted for building the queue would be budgeting for work already done.

### 1.2 `resolve_consistency` exists — and it is already taken

`attentionReasons` (`daily-cycle/contracts.ts:14`) already contains
`resolve_consistency`, it is in both of the narrower subsets at `:59` and `:70`,
and it has **a live producer**: `lifecycle.ts:71` projects
`("could_not_organize", "resolve_consistency", true)`, with
`inbox-projection.ts:50` doing the same.

Its copy says, in both locales:

> *"Encontramos uma inconsistência e preservamos o registro para sua revisão."*
> *"We found an inconsistency and preserved the record for your review."*

**That sentence is about one entry that could not be organized. It is not about
two beliefs that disagree.** Routing memory conflicts into this reason would make
one queue item mean two unrelated things behind one sentence — the same defect
this repository has already paid for when one vocabulary served two authorities.

**So 2N.4 needs a reason of its own.** That is a **code change and not a
migration**: `attentionReasons` is a TypeScript constant and the copy is a typed
module. It does, however, touch `copy.ts`'s exhaustive records in both locales
and the three subsets in `contracts.ts`, so it is a change with a blast radius
worth knowing before it is started rather than during.

### 1.3 One conflict IS deterministically detectable, and it was measured

`memories` **accepts `valid_from > valid_until`**. There is no CHECK preventing
it — verified by inserting one inside a rolled-back probe against the hosted
database.

The asymmetry is the part worth recording: **`entity_aliases` refuses exactly
this**, by
`CHECK ((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))`.
Two tables in the same schema, one guarded and one not.

An inverted window is a strong member of `2N-CONFLICT-001`'s set:

- **deterministic** — no semantics, no model, no similarity;
- **unambiguously wrong** — a memory cannot be in force from a later date until
  an earlier one;
- **actionable**, which `2N-CONFLICT-005` requires: the owner corrects the dates
  through `updateMemory`, an authority path that already exists and is audited,
  satisfying `2N-CONFLICT-003` with no new path.

Note also that `memoryLifecycleState` resolves such a row to **`archived`**,
because *archived wins over scheduled* — so today an inverted window silently
reads as "no longer in force" rather than as "these dates cannot both be right".

## 2. Candidates that are detectable but are NOT conflicts, named rather than implied

`2N-CONFLICT-001` requires the rest to be *"declared out of scope by name rather
than left implied"*. These are the ones a later reader would otherwise assume
were missed.

| Candidate | Detectable? | Why it is not a conflict |
| --- | --- | --- |
| Two memories on the same subject and `kind` with overlapping windows | Yes, structurally | Two preferences about one person at one time are usually **complementary**. Calling every overlap a conflict fills the queue with items whose only honest action is "dismiss", which `2N-CONFLICT-005` refuses. |
| Two memories whose text disagrees | **No** | Requires semantics. `OD-2N-7` A signs derivation *from existing data*, and no column carries a claim's polarity. |
| A `person_relationships` pair asserting different types in each direction | Yes | "A is B's mentor" and "B is A's mentee" is coherent, not contradictory. Direction-specific types are the design. |
| A memory whose `source_entry_id` no longer resolves | Yes | Under RLS this is **indistinguishable from foreign**, so surfacing it would be an existence oracle. 2N.1 and M1 already settled the display: it reads `unsourced`. |
| `confidence` disagreeing between two memories | Yes | `OD-2N-7` A explicitly forbids **no implicit precedence by recency, confidence or similarity**. Using confidence to pick a winner is the thing the signature refuses. |

## 3. The stop condition, and where it now stands

2N.4's stop condition is *"the deterministically detectable set turning out to be
empty — in which case the family closes `not-built-by-rule` with the finding
recorded, rather than inventing detection."*

**The set is not empty**: §1.3 names one member, measured. So the stop condition
does **not** fire on what is known today. Whether one member is enough to justify
a slice is a judgement for whoever starts it — and the honest alternative, if it
is not, is to record that and close the family by rule rather than to widen the
definition of "conflict" until the set looks bigger.

## 4. What this re-audit does NOT answer

It has not enumerated the set exhaustively; it has established that the set is
non-empty and named the five candidates a reader would otherwise wonder about.
An implementer must still decide, against the PRD's six requirements, whether
overlapping-window pairs enter as a **second** member under a narrower predicate
than "any overlap".

**Nothing in `2N-CONFLICT-001…006` is claimed, built, or partially built.**
Slice 2N.4 remains **not started**.
