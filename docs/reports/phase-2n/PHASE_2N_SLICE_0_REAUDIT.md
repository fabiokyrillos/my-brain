# Phase 2N slice 2N.0 — re-audit against `main` at `05d4c8f`

**This re-audits. It implements nothing.** Run as step 1 of ADR-112's execution
loop — *"reaudite a próxima slice contra a main real"* — before any 2N.0 code is
written.

**Verdict: 2N.0's plan is accurate and unchanged. Every premise ADR-108's audit
recorded still holds on this `main`, re-derived from source rather than
inherited.** The slice is correctly scoped, its 29 requirements are the right
ones, and nothing has drifted underneath it. One item was **added** to it by
ADR-112 Decision 7a, and one was **removed** by ADR-112 Decision 3.

---

## 1. The five premises, each re-checked against source

| # | premise from ADR-108's audit | still true on `05d4c8f`? | evidence |
|---|---|---|---|
| 1 | The contextual surfaces are **outside** the sensitivity contract | **YES** | **None** of `people/[personId]`, `projects/[projectId]`, `memories/[memoryId]`, `files`, `people` imports `src/features/sensitivity` at all |
| 2 | `entity_aliases` has **no reader** | **YES** | Zero occurrences in `src/` outside `database.types.ts` |
| 3 | Search's `people` domain matches and snippets `notes` | **YES** | `DOMAIN_SPECS.people.columns = ["name", "notes"]`, `snippetColumn: "notes"` |
| 4 | Lists truncate **silently** | **YES** | `.limit(100)` ×6 and `.limit(200)`/`.limit(50)` on the person page; `.limit(100)` ×4 and `.limit(200)` on the project page — none states its bound |
| 5 | No `sensitivity` column exists on `people`/`projects` | **YES** | Neither table carries one, and none may be added |

**Nothing in this list needs re-planning.** The slice as written addresses each.

## 2. What ADR-112 changed about this slice

**Removed.** `2N-TIME-002`'s corpus extension. `phase-2m-fixed-offset-guard.test.ts`
is no longer in the slice's file list and **2N.0 builds no timezone guard**. Its
obligation is now to leave the tree-wide guard's four families at zero once its
routes exist — asserted, not assumed — with `OPEN_OCCURRENCES` still empty and
**no allowlist created to accommodate a new route**.

**Removed.** The stop condition about the four `daily-cycle` exemptions being
load-bearing. They were repaired; it cannot trigger.

**Added.** `src/app/[locale]/app/loading.tsx`. It announces `"Carregando página"`
in **both** locales on a `role="status" aria-live="polite"` region, so a screen
reader in `en` announces Portuguese. Carried by `2N-ACCESS-005` and
`2N-ACCESS-003` under PRD §4, which obliges every surface this phase ships **or
touches** to declare its **loading** state in both locales.

**A constraint worth knowing before the work starts:** an App Router
`loading.tsx` receives **no props** — no `params`, so no locale. Localising it
means deriving the locale another way. **Read `node_modules/next/dist/docs/`
before choosing how**; this is Next.js 16 and the answer in training data is
likely wrong.

## 3. Requirement-by-requirement readiness

All 29 are **ready to implement**; none is blocked, and none needs a decision.

- **`2N-PRIVACY-001…011`** — the substance. Needs `GOVERNED_SURFACES` extended
  with the contextual surfaces, a **derivation for entry/memory/file subjects**
  in the shape `task-derivation.ts` already establishes (`derived` vs
  `undetermined`, absence → most protective), and the `people.notes` posture:
  masked by default, revealed locally, out of search's `people` domain.
- **`2N-TIME-001`, `-003`** — obligations on the new code this slice writes.
  **`-002`, `-004`, `-005`, `-006` close `baseline`** and are proved by the
  tree-wide guard staying at zero, not by new work.
- **`2N-PERSON-003`, `2N-PROJECT-006`, `2N-KNOWS-008`** — one shared bounds
  vocabulary, reusing the words search already uses (`bounded`, `PER_DOMAIN_LIMIT`
  in `search/contracts.ts` is the precedent).
- **`2N-KNOWS-007`** — classification read from the current row at render time;
  nothing caches a level. A property to assert, not a feature to build.
- **`2N-SEC-002`, `2N-SEC-003`** — ownership stays RLS-and-query only; no new
  direct client write. Both are properties the slice must not break.
- **`2N-IDENTITY-001…004`, `-008`, `-009`** — the alias reader, `entity_aliases`'
  first consumer, owner-scoped and validity-windowed. **No migration**: the
  table, its policies and its grants exist.

## 4. Migration budget

**Untouched and untouchable by this slice.** 2N.0's schema impact is **none** —
confirmed, not assumed: every capability above reads existing tables. `M1`, `M2`
and `M3` stay allocated to 2N.3 and 2N.7. **If alias reading or the notes posture
turns out to need schema, that is a STOP CONDITION** and returns to the owner; it
may not consume or reallocate any allocation.

## 5. Order

**No reordering is justified.** 2N.0 has no dependency on any other slice, and
every later slice depends on it. The planned order stands.
