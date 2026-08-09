# Phase 2L — Slice 2L.3 · acceptance record

**Status:** executed. **Migration budget: `1 allocated · 0 spent`.** No migration
exists, therefore **no deployment and no G8**. Hosted parity remains
`202608090089`, 89 migrations.

**Baseline:** `main` at `5972ff81eac5d36f4d87e17fef81880c0693194a` — the 2L.2
merge commit, CI green on all three jobs at that exact SHA. Branch
`codex/phase-2l-slice-3`.
**Requirements covered:** `2L-VIEW-001…009`; `2L-RETURN-001…005`;
`2L-ACCESS-001…005` for the surfaces it builds.

---

## 1. The budget, stated first

The plan allocates the phase's single migration to this slice and says the
allocation **lapses unspent** under OD-2L-2 option A. It lapsed.

| | |
|---|---|
| Allocated | 1 |
| **Spent** | **0** |
| Migrations before / after | 89 / 89 |
| `workView` values before / after | `today, all, waiting` / `today, all, waiting` |
| Deployment record created | **none** — there is nothing to deploy |

Nothing in this slice needed one, and the one place that came close is recorded
in §4 rather than resolved by spending it.

---

## 2. The mandatory pre-slice review

| The plan said | What is actually there | Reconciliation |
|---|---|---|
| The taxonomy is "declared in one module and consumed everywhere" | `workViews` was in one module, but a view's *meaning* — its default ordering and the words a user reads — was split across `work-projection.ts` and `work-view.tsx`'s copy record | `work-views.ts` declares the ids and each view's **default ordering**; the names and descriptions stay in copy, because they are translated and a taxonomy that held Portuguese is one a language could disagree with. The predicates stay in SQL, where they are builder clauses and cannot be values. |
| `work-position.ts` holds "the return payload, `.strict()`, navigation identifiers only" | Phase 2K's `continuity.ts` had already established that exact shape | Reused rather than re-invented, including the forbidden-field list: a second way of expressing "carries no authority" would be a second thing to keep right. |
| Filters are over "attributes the projection already loads" | True of every `tasks` column; **not** true of project and context, which live in relation tables | Recorded in §4 and implemented as the one deliberate two-step, bounded per relation. |

---

## 3. `2L-VIEW-001…009`

**One parser, one serializer.** `work-query.ts` turns a URL into the complete
description of the page and back. `2L-VIEW-007` is then structural: there is no
cookie, preference or storage on the route, the view, the controls or the parser,
and a test asserts that across all four files.

**Every parameter fails closed, and it is asserted per parameter.** A single
"malformed input" test would pass while one of eight parsers fell open, so each
vocabulary is driven over its declared values, over five malformed values, and
over a repeated value — which resolves to the default rather than to its first
element, because two values is a malformed request and picking one would be
guessing.

**`state` cannot widen a view.** Its default, `open`, reproduces each view's own
status predicate exactly as it stood before this slice; `completed` and
`cancelled` **replace** it with a narrower one. There is no value of `state` that
adds rows — which is the property `2L-VIEW-008` is really about, and it is
asserted by driving the projection and reading the clauses it built.

**Filters and grouping are different mechanisms, deliberately.** Filtering runs
in SQL and decides which rows are in the set; grouping runs over the page that
came back and cannot issue a query at all. That is how `2L-VIEW-006`'s "no
unbounded per-user query" is satisfied structurally rather than by care.

**There is no "order by priority", and that is the honest answer.**
`manual_priority` is stored as text, so a database ordering over it would sort
`high, low, medium, urgent` — a control that looks like it sorts by importance
and does not. Sorting it correctly needs a CASE expression, which PostgREST
cannot express without a computed column, which is a migration OD-2L-2 A
refuses. **Grouping by priority answers the same question honestly and costs
nothing**, and it orders the groups by the taxonomy's own sequence.

**Every ordering ends with the id.** Without it a page boundary is unstable when
two rows share a due date, and the same row can appear on two pages or on none —
which would make "pagination composes" false in exactly the case nobody checks.

**A filtered-empty result is distinguishable from an empty view** (`isNarrowed`),
and the two say different things, one of which is actionable.

---

## 4. The one place that came close to the migration — recorded, not spent

OD-2L-2 A says per-project and per-context destinations are **filters within**
the canonical views. Project and context are relation tables, not `tasks`
columns, so filtering by them is not a clause on the page query.

The options were: a database view or RPC that joins them (**a migration**), or
the two-step this repository already uses for relation hydration. It is the
two-step: the relation's task ids are read first, owner-scoped **and** bounded to
the one project or context, and the page query is bounded by them.

**Stated exactly, so no closing report can round it up:** that read grows with
the size of *that project or context*, not with the size of the user's whole task
set. It is one extra round trip, only when a relation filter is asked for, and a
relation that matches nothing returns an empty page **without querying tasks at
all**. Two relation filters compose by intersection, which is the only reading of
"in this project and this context" that cannot silently widen.

---

## 5. `2L-RETURN-001…005`

**The position travels with the link.** `work-position.ts` is a `.strict()`
schema of navigation identifiers and closed vocabularies — no title, no name, no
free text of any kind, asserted by checking that no string value even contains a
space.

**It refuses by name, and the refusal is proved field by field.** Every member of
`POSITION_FORBIDDEN_FIELDS` is planted into a payload one at a time and the whole
position falls back to the default. Being *ignored* would not be enough: a later
reader could start honouring it.

**Every return is a fresh read.** The route is a Server Component that calls the
projection on each request against the caller's own session; there is no cached
page to replay, and a test asserts the absence of `unstable_cache`, `revalidate`
and `force-static` rather than trusting that today's code has none.

**An invalid position resolves to the nearest one and says so.** A non-first page
that comes back empty triggers one extra read at page 1 and a sentence the user
reads. The nearest valid position is the first page rather than "the last page
with rows": this projection is offset-based, and walking backwards to find one
would cost more reads than the fact is worth. **Recorded rather than claimed as
exact.**

**Changing a filter resets the page; changing the ordering does not.** Page 7 of
an unfiltered view is very rarely page 7 of a filtered one, and ordering does not
change which rows are in the set.

---

## 6. Accessibility

One fixture added — the filter groups, the relation escape hatch, the moved-position
notice and a group heading with its count. Both viewports green.

The load-bearing assertion is `aria-current`: which filter is active is
**information**, not decoration, and a mirror that dropped it would leave the
lane green about a colour. The mirror guard pins it.

---

## 7. Executed, and not executed

**Executed locally:** focused suites green; lint and typecheck zero-error;
`npm test` — **5197 passing tests** with the documented Windows baseline; build
green; accessibility lane green at both viewports.

**NOT executed, and not inferred:** any hosted probe; any real-device or
screen-reader session; any authenticated online journey; hydrated interactivity.
In particular **no filter has been run against a real database** — the SQL
clauses are asserted against an injected builder, which proves the clauses this
code sends and not the rows Postgres returns for them.
