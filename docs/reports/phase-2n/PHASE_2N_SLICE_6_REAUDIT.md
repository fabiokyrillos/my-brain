# Phase 2N slice 2N.6 — re-audit against `main` after 2N.5, **NOT STARTED**

Written **before any code**, and this document starts nothing. It measures the
tree slice 2N.5 left behind against what `2N-RELATION-001…011` and
`2N-ACCESS-004` require, so whoever implements 2N.6 begins from facts rather
than from the plan's expectations.

**Zero requirements are claimed here. Zero files were created for the slice.**

## 0. Baseline

| Fact | Value |
| --- | --- |
| `main` | `51900b4`, clean |
| Migrations | **94 local = 94 hosted**, parity **`202608140094`** |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 reserved for 2N.7** · a fourth is a **STOP CONDITION** |
| Slice 2N.5 | **complete and merged**, zero migrations spent |
| Slice 2N.6 | **not started** |

## 1. What already ships, so the slice does not budget for it twice

This is the correction 2N.4's and 2N.5's re-audits both had to make, so it is
made first here.

| Requirement | Measured state on `main` |
| --- | --- |
| `2N-RELATION-001` create/update/end paths and validity windows | **ships.** `createOwnerRelationship`, `updateOwnerRelationship`, `endOwnerRelationship`, `associatePersonContext`, `endPersonContext`, `associatePersonProject`, `updatePersonProjectRole`, `endPersonProject` — eight Server Actions, all audited, delivered by EGC.2 |
| `2N-RELATION-002` every rendered relation states its origin | **largely ships.** `ProvenanceNote` and `SectionOriginNote` render on both contextual pages since 2N.1/2N.2; `ownerAuthored` takes a closed union of exactly the three relation tables |
| `2N-RELATION-004` correction and ending through an existing authority path, audited | **ships**, same eight actions |
| `2N-RELATION-005` confidence never rendered as certainty | **holds by omission.** All three relation tables carry a `confidence numeric(4,3) not null default 1`; **no contextual surface selects it**, deliberately (the project page says so in a comment). The one place a confidence number *is* rendered is `conversational-questions.tsx`, which is `pending_questions` and not a relation |
| `2N-RELATION-008` existing rows presented as owner-authored without retroactive provenance | **ships.** `provenance/contracts.ts` makes `ownerAuthored("memories")` a **type error**, so the claim can only be made where it is true by construction |

So the genuinely open work is **the graph**, `2N-RELATION-003`'s proposal
posture, and the parts of `-002`/`-009` that only exist once edges do.

## 2. The finding that decides the slice: **there is no graph, of any kind**

Measured against `main`:

- **No route.** `src/app/[locale]/app/` has 26 destinations and none is a graph.
- **No component, no feature directory, no contract.** No `src/features/graph/`.
- **`e2e/online-entity-graph.spec.ts` is not a graph.** It is EGC.1's *entity
  graph capability* — Companies and Contexts gaining routes and writers. The
  filename is the trap; the file's own header says what it covers.

So 2N.6 builds a graph surface from nothing, under an authorization
(`OD-2N-10` **B**) that is explicitly **a contract with a refusal clause**
(`2N-RELATION-011`): a graph that cannot satisfy `2N-RELATION-006…010` inside
the budget **stops and proposes a reduction**, and a decorative one is refused
outright rather than shipped smaller.

## 3. What is NOT yet measured, and must be before the slice starts

This document establishes the load-bearing facts. It has **not** measured:

- what the **complete non-degraded text/list equivalent** (`2N-RELATION-007`,
  `2N-ACCESS-004`) must contain to carry *the same information* as the graph,
  which is the requirement most likely to force the refusal clause;
- whether the edge set is large enough to be worth drawing for a real owner, and
  what bound the drawing takes — the graph is the first surface where a bound is
  a *layout* decision and not only a list one;
- whether `2N-RELATION-003`'s **proposal** (extraction may propose; a proposal is
  not a relation) has any producer today, or would be a producer with no
  consumer — the failure this repository has already paid for twice;
- whether the graph can be rendered without a client-side library, given the CSP
  and the artifact-free posture the rest of the product keeps.

Each is a read, not a build, and each belongs to the slice's own opening step.

## 4. Stop conditions, restated against what was measured

2N.6's declared schema impact is **none**: `OD-2N-8` **A** removed the
provenance migration by removing persisted inference, so every edge the graph
may draw is one the owner authored. **M2 remains reserved for 2N.7 and is not
available to this slice under any option**, and a fourth migration is a stop
condition (`R-21d`).

The slice's own refusal clause (`2N-RELATION-011`) is stronger than a stop
condition: it obliges the work to **stop and propose a reduction** rather than
ship a graph that fails `2N-RELATION-006…010`.

**Nothing in `2N-RELATION-001…011` or `2N-ACCESS-004` is claimed, built, or
partially built. Slice 2N.6 remains NOT STARTED.**
