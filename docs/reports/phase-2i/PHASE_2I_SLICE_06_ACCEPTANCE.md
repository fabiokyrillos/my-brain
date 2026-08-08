# Phase 2I — Slice 2I.6 acceptance — Library

**Date:** 2026-08-07 · **Migrations: 0** · **Requirements:** `2I-LIB-001` … `2I-LIB-008`

---

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-LIB-001` | **built** | `src/features/library/contracts.ts` derives `LIBRARY_MEMBERS` from `capability.group === "context"`; guard asserts it equals the shell's own list, so the two cannot disagree |
| `2I-LIB-002` | **built** | No table, column or RPC. Guard asserts no `.rpc(`/`.insert(`/`.update(`/`.delete(` and that every recency source is an existing table in `database.types.ts` |
| `2I-LIB-003` | **built** | `LIBRARY_RECENCY` draws from a plain `created_at` per domain; guard asserts every recency column ends `_at`, so no score can be substituted |
| `2I-LIB-004` | **not built, by rule** | **Evidenced negative.** A scan of `database.types.ts` finds zero `pinned`/`favorite`/`favourite`/`starred`/`bookmarked` columns on any table; the guard **re-derives** this each run so a future migration breaks it |
| `2I-LIB-005` | **built** | Only deterministic states. `contexts` is **absent** from `LIBRARY_RECENCY` rather than given a faked recency, and the guard asserts that absence |
| `2I-LIB-006` | **built** | `app/library/page.tsx` links to `app/search`; asserted by guard |
| `2I-LIB-007` | **built** | Counts are navigation aids only. Guard forbids `chart`, `trend`, `percent`, `sparkline`, `growth`, `average` in the page |
| `2I-LIB-008` | **built** | Each card links via `getNavigationHref(locale, key)`, so every domain keeps its existing route |

## `2I-LIB-004` — the requirement whose honest answer is "no"

The requirement says pinned/favourite is built **only if the repository already
supports it**. It does not: **zero** matching columns across the whole schema.
Adding one would be a data model, which `2I-LIB-002` forbids one line above.

So it closes as an **evidenced negative** — *delivered by not being built* —
which the traceability contract §4 rule 10 permits. The distinction that makes
this honest rather than convenient is that the guard **re-derives the negative
from `database.types.ts` on every run**. It is not a sentence asserting absence;
it is a check that fails the moment the absence stops being true.

## Library is a rendering, not an architecture

The six members have shared `group: "context"` in `capabilities.ts` since before
this phase — the audit's central finding. Library reads that grouping rather
than restating it, so a seventh context destination appears automatically and a
removed one cannot linger in a second list.

The counts are deliberately thin. `2I-LIB-007` forbids a dashboard, and the line
this slice draws is: **a count tells you whether a door leads anywhere; a chart
tells you a story about yourself.** The first is navigation, the second is the
vanity metric the requirement rejects.

One failure mode was designed around: a failed count renders as `null` rather
than collapsing the page. Library's job is to be a door, and a door that will
not open because a counter failed is worse than a door with no number.

## Verification

Library guard **16/16** · route enumerated in `egc-reachability.test.ts` with
`sections: []` (it renders no collection of its own and writes nothing) · lint,
typecheck and build clean · **zero migrations**.
