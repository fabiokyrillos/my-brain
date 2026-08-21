# Phase 2Q — Traceability contract

Inherits Phase 2P's contract in full. What is written out below is either
identical (so the contract stands alone and a reader need not diff two files) or
**new because Phase 2Q's subject matter creates a way to lie that earlier phases
did not have** — refusals 13 to 16.

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
(§Planning-only posture).

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
13. **a requirement that depends on an open owner decision and is classified as
    anything other than unclassified** — a recommendation is not a signature, and
    a phase that builds on its own recommendation has signed for the owner;
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
    Decision 4 already ruled on this shape and the ruling is inherited.

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

The proposed allocation is **one**, whose exclusive destination is
`2Q-CITE-001`. The generator must refuse:

- a migration in the tree with no requirement naming it;
- a requirement claiming a migration outside the signed allocation;
- a second migration of any kind while `OD-2Q-4` is unsigned — that is a **stop
  condition**, not an overrun.

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
