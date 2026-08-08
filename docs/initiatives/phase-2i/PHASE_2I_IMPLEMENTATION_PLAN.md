# Phase 2I — Foundation and Findability — Implementation plan

**Status:** PLANNING ONLY (ADR-092). **Implementation is not authorized.**
Governing pair: this document and
[`PHASE_2I_PRD.md`](./PHASE_2I_PRD.md).
CI policy: **ADR-090** — one green PR-head run, full diff review, merge, one
green exact-merge-SHA run, then deploy. **No green ×3.**

---

## 1. Migration budget — **MAXIMUM ONE**, and zero is the preferred outcome

| Rule | |
| --- | --- |
| Allocated | **1**, to **slice 2I.5 only** (global lexical search) |
| Allocated to any other slice | **0** — Etapa 0, visual language, components, shell, palette and Library own **no** migration by default |
| May remain unspent | **Yes, and that is the preferred close.** `1 allocated · 0 spent` is a success, not a shortfall |
| Created to justify the budget | **Forbidden** |
| A second migration | **Owner amendment.** The slice stops; the plan is amended; the invariant is not renegotiated inside a branch |

**The decision is taken in 2I.0, before any search code**, and it is taken by
**measurement**. Gate G-2I.2 is that measurement. If the acceptance criteria and
the §9.1 performance budgets are met with existing schema and query contracts,
the recommendation is **zero migrations** and the allocation lapses.

If one migration is needed, **every object, index and function in it must be
justified individually** in the slice's acceptance record — not "search needs
indexes" but this index, on this column, because this measurement.

**Not created during planning.** No migration file exists in this branch.

---

## 2. Slice order — approved, and the reason it changed

The parent PRD's Etapa 1 ordered navigation → Library → palette → search. The
owner approved a different order:

| # | Slice | Migrations |
| --- | --- | :-: |
| **2I.0** | Pre-code verification and contracts | 0 |
| **2I.1** | Visual language and universal states | 0 |
| **2I.2** | Trust / action components | 0 |
| **2I.3** | Mobile shell and navigation convergence | 0 |
| **2I.4** | **Command palette** | 0 |
| **2I.5** | **Global lexical search** | **0 or 1** |
| **2I.6** | Library surface | 0 |
| **2I.7** | Convergence, accessibility, traceability closeout | 0 |

**Rationale, recorded because it inverts the parent PRD.** The current problem is
primarily **discovery**. Building Library first would group twelve items into
five and then build the two tools that make grouping largely unnecessary. The
palette and search make destination count almost irrelevant; Library is better
built once the user can already reach everything, because then it is judged as an
*information architecture* rather than as a *workaround for not having search*.

**2I.4 before 2I.5** because the palette is local — it needs no query layer, no
ownership predicate and no performance budget — so it delivers discovery value
first and at lower risk, and it establishes the result-list interaction that
search reuses.

---

## 3. Gates

| Gate | Slice | Requirement |
| --- | --- | --- |
| **G-2I.1** | 2I.0 | Baseline CI green on the phase's starting SHA, under ADR-090 (**one** run). |
| **G-2I.2** | 2I.0 | **The search implementation decision is taken and recorded** — measured, not argued. Names the shape, the columns, and whether the migration is spent. **2I.5 may not begin before this is recorded.** |
| **G-2I.3** | 2I.0 | The audit's DELIVERED/RENAME/MISSING classification is re-verified against the code at phase start, so no slice rebuilds delivered work. |
| **G-2I.4** | 2I.0 | The locale-ternary baseline count is measured and pinned, so `2I-CLOSE-003`'s ratchet has a floor. |
| **G-2I.5** | 2I.5 | **OD-1 and OD-2 signed by the owner** (sensitivity in results; `extracted_text` searchable). **2I.5 may not ship without them** — both are product decisions that are cheap now and expensive after users form expectations. |
| **G-2I.6** | 2I.7 | Rollout gate re-read and recorded. |

**G-2I.2 and G-2I.5 are the two that can stop a slice.** Both are in the
critical path of 2I.5 and both are resolvable early.

---

## 4. Slices

### 2I.0 — Pre-code verification and contracts · 0 migrations

Phase 2H's 2H.0 pattern: gates before code.

1. Baseline CI green (G-2I.1).
2. **Re-verify the audit** (G-2I.3) — `capabilities.ts` keys, the `context`
   group membership, `home: "Início"`, `chat: "Conversar"` already done, and the
   absence of any FTS object in the chain.
3. **Measure the search decision** (G-2I.2): build a throwaway query per domain
   against the controlled accounts, measure against §9.1, and record whether
   `ILIKE` over existing columns meets the budget or a `tsvector`/GIN migration
   is required. **Record the numbers, not the conclusion alone.**
4. Pin the locale-ternary baseline (G-2I.4).
5. Confirm no domain in §8.1 has a pin/favourite column, so `2I-LIB-004` is
   planned as *not supported* rather than as *build a column*.
6. Raise **OD-1** and **OD-2** to the owner (G-2I.5) so they are not discovered
   inside 2I.5.

**Exit:** four gates recorded; two owner decisions requested; zero code.

### 2I.1 — Visual language and universal states · 0 migrations

`2I-LANG-001…007`. The root: nothing else can be consistent first. Ships the
token set, the four-way user-text/interpretation/suggestion/confirmed
distinction, and the six universal states including **interpreting**.

**Risk:** a token set that no surface adopts is a design document. Mitigation —
the guard in `2I-LANG-001` fails on a hard-coded state colour, so adoption is
enforced by the same change that defines the tokens.

### 2I.2 — Trust / action components · 0 migrations

`2I-TRUST-001…008`. The shared vocabulary every later slice and every later
phase consumes. **`2I-TRUST-008` is the load-bearing one**: no component
performs a write. A component library that quietly acquires a Supabase client is
how a second write path is born.

### 2I.3 — Mobile shell and navigation convergence · 0 migrations

`2I-SHELL-001…006`. **Mostly assertion, one rename, one grouping.** The plan
budgets this as the *smallest* product slice in the phase, against a parent PRD
that budgets it as one of the largest — that difference is the audit's central
finding and it is deliberate.

### 2I.4 — Command palette · 0 migrations

`2I-PALETTE-001…010`.

**Risks:**
- *Becoming a second shell.* `2I-PALETTE-010` forbids it; review the diff for
  nested navigation and persistent state.
- *Becoming a second write path.* `2I-PALETTE-004/005` bound it to existing
  contracts and a closed action set. **A "generic command" abstraction is the
  failure mode**, and it is attractive because it looks like good engineering.
- *Recents requiring content telemetry.* `2I-PALETTE-009` says: if it cannot be
  built without personal content, it is not built.

### 2I.5 — Global lexical search · **0 or 1 migration**

`2I-SEARCH-001…011`. **Blocked on G-2I.2 and G-2I.5.**

**Risks:**
- *Enumeration oracle* — T-2I-01. Ownership in the query, and a zero-result
  indistinguishable from not-owned.
- *Silent partial results* — `2I-SEARCH-007`. A dropped domain is a wrong answer
  that looks complete.
- *Accidentally satisfying ADR-055* — `2I-SEARCH-010`. No embeddings, no
  generated answers. The slice must state at close that ADR-055 is untouched.
- *Query text in telemetry* — `2I-SEARCH-011`/`2I-METRIC-004`. Prevented by
  event shape, not by redaction.

### 2I.6 — Library · 0 migrations

`2I-LIB-001…008`. Renders the existing `context` group. **`2I-LIB-002` forbids a
new data model**; `2I-LIB-004` is expected to close as *not supported, not
built*, with evidence, because adding a pin column would be exactly the data
model the requirement above it forbids.

### 2I.7 — Convergence and closeout · 0 migrations

`2I-CLOSE-001…005`. Fail-closed generator, accessibility acceptance, both-locale
acceptance with the ternary ratchet, rollout gate re-read, closing report with
the budget reconciled **per slice**.

---

## 5. Acceptance strategy

Reuses existing machinery; invents nothing.

1. **Fail-closed traceability** in the shape of
   `scripts/generate-phase-2h-traceability.mjs` — refuses rather than print an
   unresolved claim, mutation-proved against fixtures with the real repository
   as the positive control.
2. **Playwright desktop + mobile, both locales.** `2I-CLOSE-003` makes the
   locale dimension mandatory, not optional.
3. **Accessibility as a gate.** Keyboard reachability, focus return after every
   action, visible focus, touch targets, reduced motion, and **meaning never by
   colour alone** — the last is statically assertable from `2I-LANG-001`.
4. **T-2I-01 proved in pgTAP with a second account.** An ownership test with one
   user in the database proves nothing.
5. **Performance measured, not asserted** — §9.1 budgets, recorded as numbers.
6. **A locale-ternary ratchet** pinned at G-2I.4 and required to decrease.
7. **A no-new-write-path guard** covering both the component library
   (`2I-TRUST-008`) and the palette (`2I-PALETTE-004/005`).
8. **Evidence screenshots** at four viewports, as `ux-evidence/` already does.
9. **`npm run rollout:verify` re-read at close** (G-2I.6).

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| A slice rebuilds delivered navigation | **medium** | wasted budget | G-2I.3 re-verifies at phase start; §2 of the PRD lists DELIVERED explicitly |
| The palette becomes a second write path | medium | **high** — breaks one-write-path | `2I-PALETTE-004/005`, guard, diff review |
| Search leaks existence of others' records | low | **high** | T-2I-01, pgTAP with a second account |
| Search telemetry captures query text | medium | **high** — privacy | `2I-METRIC-004`: no place to put a string |
| The migration is spent unnecessarily | medium | budget | G-2I.2 measures before deciding; zero is the preferred close |
| One migration proves insufficient | low | schedule | Owner amendment; the slice stops rather than improvising |
| Library grows a data model | low | scope | `2I-LIB-002`, and `2I-LIB-004` planned as *not supported* |
| Dark mode creeps in partially | low | quality | D5; `2I-LANG-007` forbids a half-set of tokens |
| ADR-055 accidentally satisfied | medium | governance | `2I-SEARCH-010` and an explicit statement at close |
| Locale debt blocks a slice | medium | schedule | Ratchet, not a sweep: each slice converts only what it touches |
| Metrics misread as public activation | medium | decision quality | `2I-METRIC-001/002/005` cohort labelling |

---

## 7. What this plan does not authorize

Implementation. No product code, no migration, no component, no route.

**The next step after this planning package merges is an owner authorization of
implementation** — a separate decision, in the shape of the owner's Phase 2H
execution authorization. Until it exists, Phase 2I is planned and unstarted, and
A13 guards the phase after it.
