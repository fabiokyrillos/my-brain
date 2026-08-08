# Phase 2I — Slice 2I.7 acceptance — convergence, accessibility, closeout

**Date:** 2026-08-07 · **Migrations: 0** · **Requirements:** `2I-CLOSE-001` … `2I-CLOSE-005`

---

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-CLOSE-001` | **built** | `scripts/generate-phase-2i-traceability.mjs` refuses rather than print an unresolved claim; **it refused on its first real run**, naming exactly nineteen unevidenced requirements and writing nothing. Mutation-proved by eleven fixtures plus the real repository as positive control |
| `2I-CLOSE-002` | **partial** | Component-level accessibility asserted by test across every new surface; **no browser-level axe pass and no screen-reader session was executed.** See §2 — destination is a Playwright accessibility lane |
| `2I-CLOSE-003` | **built** | Both locales on every new surface, asserted per feature; locale-ternary ratchet held — see §3 |
| `2I-CLOSE-004` | **built** | Rollout gate re-read verbatim at close — see §4 |
| `2I-CLOSE-005` | **built** | `PHASE_2I_REPORT.md`, with the budget reconciled per slice |

## 1. The generator refused, and that is the deliverable

Its first run against the real repository:

```
REFUSED — Phase 2I traceability is not consistent (19 finding(s)):
  1. 2I-LIB-001 is declared in the PRD and evidenced by no slice acceptance record
  …
  19. 2I-CLOSE-005 is declared in the PRD and evidenced by no slice acceptance record

No matrix was written. A generator that printed this would be the defect.
```

**A generator whose first act is to refuse to describe its own slice will refuse
to describe anybody else's.** The nineteen were `2I-LIB`, `2I-METRIC` and
`2I-CLOSE` — precisely the three families whose acceptance records did not yet
exist. It named them individually rather than reporting a count.

**Eleven mutation fixtures**, one deliberate defect each: unevidenced
requirement · citation too thin · evidenced-but-undeclared · wrong-phase
requirement in the 2I PRD · claimed by two slices · wrong owning slice ·
unknown class · two migrations against a budget of one · 2I.5 not stating
ADR-055 remains open · missing PRD (throws) · PRD declaring nothing (throws).

**One fixture, one defect** — a fixture producing two findings proves less,
because it cannot say which rule fired. And the baseline fixture is asserted
**clean**, so each negative differs from a passing repository by exactly one
thing.

The two fail-closed cases *throw* rather than returning findings, deliberately:
the dangerous failure is not a refusal, it is a generator that finds nothing and
reports success.

## 2. Accessibility — what was verified, and what was not

**Stated honestly, because `2I-CLOSE-002` is the requirement most easily
over-claimed.**

**Verified by executed test:**

| Property | Where |
| --- | --- |
| Combobox semantics, `aria-expanded`, `aria-autocomplete` | palette |
| `aria-activedescendant` moves without taking DOM focus off the input | palette |
| `aria-selected` marks the active option (not tint alone) | palette |
| Arrow-key traversal with wrap | palette |
| `Escape` closes **and returns focus to the invoker** | palette |
| Labelled `role="group"` per result group | palette, shell `Mais` |
| Polite `role="status"` result-count announcement | palette, search |
| Assertive `role="alert"` only for terminal error | universal states |
| `empty` deliberately **not** announced | universal states |
| Every tone carries a non-colour affordance | state vocabulary |
| Labelled dialog with a labelled close | `DetailSurface` |
| `sections: []` route enumeration | reachability guard |

**NOT executed, and therefore not claimed:**

- no axe/browser audit of the rendered pages;
- no screen-reader session;
- no Playwright journey over the new surfaces at mobile and desktop viewports;
- touch-target sizing and `prefers-reduced-motion` are asserted in **CSS
  source**, not measured in a rendered viewport.

`2I-CLOSE-002` is therefore **partial**, with the destination named: a
Playwright accessibility lane over palette, search and Library at the four
viewports the product-UX evidence set already uses. Classifying it `built` on
the strength of component tests would be exactly the over-claim the phase's
`baseline`/`built` distinction exists to prevent.

## 3. Locale-ternary ratchet — `2I-CLOSE-003`

| | Count | Files |
| --- | ---: | ---: |
| Pinned at 2I.0 | **263** | 35 |
| At close | **263** | 35 |
| Standing ceiling (`EGC-SURFACE-002`) | 266 | — |

**The count did not rise.** Every Phase 2I surface — experience, palette,
search, library — uses a typed `copy.ts`, and each feature's guard asserts no
inline `pt ?` in its own directory.

It also did not **fall**, and that is worth saying rather than dressing up: this
phase created new surfaces rather than rewriting old ones, so it had no
occasion to retire existing debt. The ratchet held; the sweep is still owed, and
the parent PRD's later etapas — which do touch existing surfaces — are where it
gets paid down.

## 4. Rollout gate at close — `2I-CLOSE-004`

Read verbatim, unchanged by this phase:

```
25 pass, 3 fail, 2 owner-signature

SIGNUP MUST NOT OPEN. A failed or unsigned gate is a closed door, and
this script has no path that reports otherwise.
```

Phase 2I touched no rollout gate, opened no signup, configured no SMTP, signed
no owner attestation and executed no destructive operation.

## 5. ADR-055

**Open and unchanged.** Expires **2026-10-27**. Phase 2I used no embeddings, no
vector retrieval, no similarity and no generated answers, and
`phase-2i-search-guard.test.ts` asserts the absence of every one of those tokens
across the search feature. This phase neither satisfies nor supersedes it.

## 6. Phase 2J

**Unstarted.** A13 green: `phase2JStartSignals(REPO)` returns `[]`. No Phase 2J
PRD, implementation plan, requirement declaration, implementation file or
authorizing ADR exists.

## Verification

Generator: **refused once for real**, then clean · traceability tests **15/15** ·
lint, typecheck and build clean · **zero migrations**.
