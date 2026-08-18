# Phase 2P — Traceability contract

## Declaration shape

Every requirement is declared exactly once in the PRD as:

`- **2P-FAMILY-000:** text`

Family names contain letters only and numbering begins at 001 without gaps.

## Classification vocabulary

- `built` — implemented and proved at the required boundary.
- `baseline` — already true on the audited baseline and re-proved.
- `partial` — useful work exists and a concrete remainder is named.
- `not-built-by-rule` — explicitly refused by a signed rule.
- `undelivered` — required and not delivered.

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
12. a successor governing artifact or requirement before authorization.

## Evidence hierarchy

Code, migrations and hosted state govern prose. Unit tests prove deterministic
logic; browser journeys prove rendered flows; hosted probes prove deployed
boundaries; real hardware proves hardware. No lower boundary substitutes for a
higher one.

## Planning-only posture

Before implementation authorization there may be no Phase 2P acceptance record,
traceability matrix, closing report, migration or product-code file claiming a
2P requirement. The declaration guard asserts both the package's presence and
those absences.
