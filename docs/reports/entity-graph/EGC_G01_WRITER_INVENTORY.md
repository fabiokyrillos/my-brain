# EGC G-0.1 — Writer inventory

**Pre-code gate G-0.1** of `ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md`. Establishes,
by measurement, every writer of the five entity-graph tables **before** Entity Graph
Completion adds one — so `EGC-ASSOC-003`'s "one writer per contract" has a baseline the
architecture test can pin, rather than an assumption.

- **Measured** — 2026-07-31, from `main` at `4071a2f`.
- **Migration head** — `202607310064`.

---

## 1. Method

Two scans, because a writer can live in either layer:

```sh
# application layer — every call site, then the operation on the following lines
grep -rn 'from("<table>")' --include=*.ts --include=*.tsx src | grep -v '.test.'

# database layer — trigger and RPC bodies
grep -ln "insert into public.<table>" supabase/migrations/*.sql
```

## 2. Result

| Table | Application writes | Application reads | Database writers |
| --- | --- | --- | --- |
| `organizations` | **0** | 2 | `202607160005_persist_interpretation_rpc.sql` |
| `contexts` | **0** | 4 | `202607160005_persist_interpretation_rpc.sql` |
| `person_relationships` | **0** | 1 | **none** |
| `person_contexts` | **0** | 1 | `202607160011_entity_timelines.sql` (`link_interpreted_entities`) |
| `person_projects` | **0** | 2 | `202607160011_entity_timelines.sql` (`link_interpreted_entities`) |

**The application layer contains zero writes to all five tables.** All nine call sites are
`select`. Every row that exists in any of them today was written by the interpretation
pipeline or by nothing at all.

### 2.1 Read call sites, for completeness

| Table | Reader |
| --- | --- |
| `organizations` | `src/features/entities/organizations.ts:33`, `src/features/interpretations/data.ts:258` |
| `contexts` | `src/app/[locale]/app/people/[personId]/page.tsx:61`, `src/features/daily-cycle/work-projection.ts:239`, `src/features/interpretations/data.ts:257`, `src/features/tasks/relation-options.ts:39` |
| `person_relationships` | `src/app/[locale]/app/people/[personId]/page.tsx:40` |
| `person_contexts` | `src/app/[locale]/app/people/[personId]/page.tsx:41` |
| `person_projects` | `src/app/[locale]/app/people/[personId]/page.tsx:34`, `src/app/[locale]/app/projects/[projectId]/page.tsx:32` |

## 3. Two corrections to the PRD, recorded rather than folded in

1. **`ENTITY_GRAPH_FINDINGS.md` §2 says organizations and contexts arrive "from the AI
   extraction pipeline".** True, and now pinned to the exact writer:
   `202607160005_persist_interpretation_rpc.sql`, not the
   `202607160011_entity_timelines.sql` trigger. The trigger writes only the two
   *person-scoped* junction tables.
2. **The PRD's G-0.1 row expected "the `link_interpreted_entities` trigger and nothing
   else".** The measurement found a **second** database writer — the interpretation
   persistence RPC — for `organizations` and `contexts`. Neither is an application path,
   so the conclusion is unchanged, but the expectation was incomplete and is corrected here
   rather than quietly satisfied.

## 4. `person_relationships` has no writer at all

Confirmed independently by both scans: no Server Action, no RPC, no trigger, no script, no
test fixture. **The Person page reads a table that nothing has ever written**, which is
`EG-02` measured rather than asserted, and the reason its section can only ever be empty.

## 5. The baseline this pins

After Entity Graph Completion, each table must have **exactly one** application writer
module, and the pre-existing database writers must be **unchanged**:

| Table | Permitted application writer after EGC | Database writers must remain |
| --- | --- | --- |
| `organizations` | `src/features/entities/actions.ts` | `202607160005` only |
| `contexts` | `src/features/entities/actions.ts` | `202607160005` only |
| `person_relationships` | `src/features/entities/relationships.ts` | none |
| `person_contexts` | `src/features/entities/associations.ts` | `202607160011` only |
| `person_projects` | `src/features/entities/associations.ts` | `202607160011` only |

`EGC-ASSOC-003`'s architecture test asserts the left column by exact-set comparison in both
directions. **This initiative adds no database writer**, which `EGC-INVARIANT-001`'s
migration-head pin enforces mechanically.
