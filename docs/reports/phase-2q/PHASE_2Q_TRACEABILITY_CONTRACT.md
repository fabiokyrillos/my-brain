# Phase 2Q — Traceability contract

Inherits Phase 2P's contract in full. What is written out below is either
identical (so the contract stands alone and a reader need not diff two files) or
**new because Phase 2Q's subject matter creates a way to lie that earlier phases
did not have** — refusals 13 to 19. Refusals 17 to 19 arrived with ADR-127,
which signed `OD-2Q-5` as option C and thereby made three new failure shapes
possible.

## Declaration shape

Every requirement is declared exactly once in the PRD as:

`- **2Q-FAMILY-000:** text`

Family names contain letters only and numbering begins at 001 without gaps.
Requirements declared in a table row use the same identifier in the same shape,
so one scan finds every declaration regardless of layout.

## Classification vocabulary

- `built` — implemented and proved at the required boundary.
- `baseline` — already true on the audited baseline and re-proved.
- `partial` — useful work exists and a concrete remainder is named.
- `not-built-by-rule` — explicitly refused by a signed rule.
- `undelivered` — required and not delivered.

**During planning, every requirement is unclassified.** A classification
appearing before the owner's implementation authorization is itself a refusal
(§Planning-only posture). **Signing the eight decisions did not change this** —
ADR-127 authorizes no implementation, so nothing is classified yet.

## Refusals

The generator and closeout guard must refuse:

1. an undeclared identifier;
2. a declared identifier with no classification;
3. duplicate or conflicting classifications without visible adjudication;
4. a gap or duplicate inside a family;
5. a family containing digits;
6. `partial` or `undelivered` with an empty remainder;
7. a document claiming hardware, VoiceOver, hosted or deployment evidence that
   its acceptance record does not execute;
8. a migration count not attributable to an authorized allocation;
9. a product event with no deployed vocabulary, producer or consumer;
10. a manual matrix edit that differs byte-for-byte from generator output;
11. a slice classified complete while its exact merge-SHA CI is not green;
12. a successor governing artifact or requirement before authorization;
13. **a requirement classified while the decision it depends on is unsigned** —
    a recommendation is not a signature, and a phase that builds on its own
    recommendation has signed for the owner. **Inverted, not retired, by
    ADR-127:** all eight are signed, so what is now also refused is a document
    that describes one of them as still open, or that reports a chosen option
    other than the one signed — in particular `OD-2Q-5` as anything but
    **option C**;
14. **a citation requirement marked `built` whose evidence exercises only one
    cited type** — the failure this phase exists to prevent is task links
    degrading while entry links pass, so single-type evidence proves the wrong
    half;
15. **an indistinguishability requirement proved by separate passing
    expectations rather than by an asserted equality** — `2Q-TRUST-003` and
    `-004` are properties about two outputs being the same, and three green
    tests are not that property;
16. **a "sources", "citations" or similarly named section offered as delivery of
    a linking requirement when it contains no canonical link** — ADR-125
    Decision 4 already ruled on this shape, the ruling is inherited, and ADR-127
    Decision 5's eighth requirement restates it as an owner instruction;
17. **any content of a cited record rendered in the sources area** — a preview,
    excerpt, snippet or title. `OD-2Q-5` is signed as option C: the row carries
    identification and a link, and the review's own prose is not duplicated
    beneath it;
18. **a reveal control anywhere on the citation path** — ADR-127 Decision 5
    forbids it by name, and Decision 5.1 records why the shared `MASK`
    presentation makes it unreachable rather than merely unwanted;
19. **a source row whose shape varies with the cited record's classification** —
    a list that identified ordinary records and withheld identification for
    sensitive ones would disclose the classification by its shape, which is a
    leak created by the protection rather than by the exposure.

## Evidence hierarchy

Code, migrations and hosted state govern prose. Unit tests prove deterministic
logic; browser journeys prove rendered flows; hosted probes prove deployed
boundaries; real hardware proves hardware. **No lower boundary substitutes for a
higher one**, and an absence assertion must be paired with a fixture marker that
proves the page rendered at all.

**Specific to this phase:** a citation is proved at the boundary where a link is
*clicked and lands*, not where an id is stored. A test that reads the column back
proves `2Q-CITE-*` and proves nothing about `2Q-LINK-*`.

## Migration accounting

The allocation is **one**, signed by ADR-127 Decision 7, whose exclusive
destination is `2Q-CITE-001` — **1 allocated · 0 spent**. The generator must
refuse:

- a migration in the tree with no requirement naming it;
- a requirement claiming a migration outside the signed allocation;
- **a second migration of any kind.** `OD-2Q-4` is signed as option A, so there
  is no pending decision that could fund one: a second is a **stop condition**,
  not an overrun.

## Planning-only posture

Before implementation authorization there may be no Phase 2Q acceptance record,
traceability matrix, closing report, deployment record, migration, component,
route, Server Action, Edge Function or product-code file claiming a 2Q
requirement. The declaration guard asserts both the package's presence and those
absences, and it is **fail-closed**: an unreadable input throws rather than
reporting "nothing found".

**Documentary tests and guards written to make this package fail closed are not
product implementation.** They read `docs/` and assert properties of documents.
They ship no route, no component, no Server Action and no SQL.
