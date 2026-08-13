# Phase 2N slice 2N.3 — initial re-audit against `main` at `9334705`

Written **before any code**, as `2N-CORRECT-013` and the slice's internal
sequencing require. It classifies all twenty-five requirements against source,
fixes what M1 owns, and states what the **intermediate** deletion re-audit must
answer before M3 may be written at all.

**This document does not authorize M3.** M3 is authorized only by the
intermediate re-audit in §6, which runs after M1 is merged, deployed and proved.

## 0. Baseline, confirmed live

| Fact | Read from | Value |
| --- | --- | --- |
| `main` | `git rev-parse HEAD` | `9334705`, clean, `0 0` against `origin/main` |
| Open PRs | `gh pr list --state open` | none |
| Local migrations | `supabase/migrations/*.sql` | **92**, first `202607160001`, last `202608120092`, no duplicate versions |
| Hosted migrations | Supabase read-only `list_migrations` | **92**, same first and last |
| Parity | local = remote | **`202608120092`** |
| Budget | ADR-109 · `OD-2N-14` B | **3 allocated · 0 spent · non-transferable · a fourth is a STOP CONDITION** |

Signup closed, rollout **25 · 3 · 2**, push not resumed, Phase 2O not started.
Nothing below changes any of these.

## 1. The defect M1 exists to repair, proved from source

`public.match_internal_knowledge`
(`supabase/migrations/202607160006_chat_memory.sql:82-121`) unions entries and
memories, orders by similarity, and applies

```
limit least(greatest(coalesce(p_match_count, 8), 1), 20)
```

**before anything reads `valid_from` or `valid_until`.** Neither column appears
in the function at all; the memory arm's only predicate is
`user_id = auth.uid() and embedding is not null` (`:117`).

Validity is applied afterwards, in TypeScript, in `chat/actions.ts:85-103` and
`conversation-sources/resolve-sources.ts:167`, both through
`memories/lifecycle.ts:isMemoryInForce`.

The consequence is not cosmetic. `chat/actions.ts:185` calls with
`p_match_count: 8`. An archived memory that ranks in the top eight **consumes
one of the eight slots**, and the live memory ranked ninth is never returned.
No downstream code can recover a row the database never sent. Filtering after
the bound removes the archived row from the *citation list* while leaving the
*retrieved set* one row poorer — which is why `2N-CORRECT-003` requires the
proof to be **eviction at the bound, not absence from a citation list**.

Three enforcement points currently state, in prose, that this cannot be fixed
without a migration. Each is true today and false the moment M1 lands, so each
is part of M1's diff:

- `supabase/tests/phase_2k_knowledge_retrieval_ownership.sql:37-42`
- `supabase/tests/phase_2k_memory_undo.sql:18-23`
- `src/features/chat/actions.ts:192-198`

### The predicate M1 must implement, and where it comes from

`isMemoryInForce` is `memoryLifecycleState(...) === "active"`, and that function
(`lifecycle.ts:59-66`) is:

- `archived` when `valid_until is not null and valid_until <= now` — **archived
  wins over scheduled**, and both boundaries are **inclusive of the instant they
  name**;
- `scheduled` when `valid_from is not null and valid_from > now`;
- `active` otherwise, including when both columns are null.

So *in force* is exactly

```sql
(valid_from  is null or valid_from  <= now())
and (valid_until is null or valid_until >  now())
```

Both halves are required. A predicate carrying only the `valid_until` half —
which is what `phase_2k_memory_undo.sql:72` and `:134` use for their own,
narrower purpose — would retrieve a **scheduled** memory, one the product tells
the owner is "só passa a ser usada na data de início". That is the same class of
lie in the opposite direction, and it is why the guard asserts the SQL against
the TypeScript rather than against itself.

**Entries are not filtered.** They carry no validity window; applying one to
them would drop every entry. `chat/actions.ts:82-83` already records this, and
M1 keeps it true.

## 2. Requirement-by-requirement — `2N-KNOWS` (9)

| Id | Classification | Derivation |
| --- | --- | --- |
| **001** | `baseline` | List renders kind (`memories/page.tsx:117`), importance (`:130`) and classification via `ProtectedContent`/`deriveSubjectSensitivity` (`:107-115`); detail renders all three (`[memoryId]/page.tsx:150`, `:210`, edit form). Shipped by UX-10 and 2N.0. **Not re-claimed.** |
| **002** | `baseline` | `memoryLifecycleState` derives three states from the two columns only; badge at `page.tsx:129` and `[memoryId]/page.tsx:171`. No `status` column exists. M1 adds no fourth meaning — asserted, see §4. |
| **003** | **BUILD** | Two live defects and one gap. See §3. |
| **004** | **BUILD** | Detail prints `formatInstant(memory.valid_from ?? memory.created_at, …)` under the label *"Vale desde"* (`[memoryId]/page.tsx:214`). **"When it was recorded" is never shown as itself**; `created_at` is silently substituted into the *in-force-from* slot, so a memory with no start date reads as though it began the day it was typed. The requirement asks for three facts and the page shows two labels. |
| **005** | **`not-built-by-rule`, with a guard** | See §5 — the epistemic three-way is not representable for a memory, and minting it from `kind` would repeat the `risk`/`blocker` error §66 refused. |
| **006** | `baseline` (words) / **made true by M1** | `copy.retrievalActive/Archived/Scheduled` already render (`[memoryId]/page.tsx:115-120`, `:172`). The sentence *"Arquivada: não é mais usada nas respostas"* is today true only of the citation list; M1 is what makes it true of retrieval. The **visibility** is baseline and is not re-claimed; the **truth** is M1's. |
| **007** | `baseline` | Delivered by 2N.0 — `[memoryId]/page.tsx:92-105` reads the level from the row just read, through the contract's own predicate, failing closed. List does the same (`page.tsx:111`). Nothing caches. |
| **008** | **BUILD** (small) | The memories **list** is paginated, not bounded — `paginateRows` + `PaginationLinks` make every row reachable, so it has no bound to state. The **detail page's pick-lists do**: `people` and `projects` are read at `.limit(PICKER_LIMIT)` (`[memoryId]/page.tsx:79-80`) and silently truncate. That is silent truncation on a control that decides a write — an owner past the bound cannot link the memory to a person that exists. |
| **009** | **BUILD (guard only)** | True by construction — no provider import reaches either memories surface. A property true only by accident is one a later edit breaks silently, so it is asserted, not narrated. |

## 3. `2N-KNOWS-003` — the fabricated origin, still live on the memory page

`[memoryId]/page.tsx:132-137` resolves provenance in three arms:

```ts
memory.source_entry_id === null
  ? { label: copy.provenanceManual, href: null }        // "Criada por você"
  : sourceEntry
    ? { label: copy.provenanceFromEntry, href: … }
    : { label: copy.provenanceUnknown, href: null }      // "O registro de origem não existe mais"
```

Both non-link arms are wrong, for the two reasons slice 2N.1 already wrote down
and fixed one surface over:

1. **`null` is not evidence of authorship.** `memories.source_entry_id` is
   declared `on delete set null` (`202607160006_chat_memory.sql:6`). A memory
   whose source entry the owner deleted holds `null` and renders **"Criada por
   você" / "Created by you"** — a positive claim about where knowledge came
   from, manufactured out of an absence. `src/features/provenance/contracts.ts`
   states this exact case in its header and makes `ownerAuthored("memories")` a
   **type error**; the memory page predates that module and never adopted it.
2. **The unresolvable arm asserts a fact the page cannot have.**
   *"O registro de origem não existe mais"* / *"The originating record no longer
   exists"* is printed whenever the row did not come back. Under RLS that also
   covers an entry belonging to **someone else** and an entry the read simply
   failed to return. `memories.source_entry_id` is a plain FK to `entries(id)`
   with **no composite `(user_id, id)`**, so a foreign id is storable, and the
   page then asserts the non-existence of a record that exists. Removed, foreign
   and unreadable must be **one arm with no branch that could tell them apart**.

Third, the **list shows no source at all**. It selects `source_entry_id`
(`page.tsx:57`) and never renders it, so "every memory shows its source" fails
on the surface most memories are seen from.

**Resolution.** Adopt `deriveClaimProvenance` / `isOpenable` /
`resolvableEntryIdsOf` unchanged. `null` and unresolvable collapse to
`unsourced`; only a resolved, owner-scoped entry is openable. This is reuse of a
contract that already ships, not a new one — and it retires two copy strings
rather than adding any.

## 4. Requirement-by-requirement — `2N-CORRECT` (13)

| Id | Classification | Derivation |
| --- | --- | --- |
| **001** | `baseline` | `updateMemory` (`memories/actions.ts:205`) and `setMemoryLifecycle` (`:271`) are Server Actions writing `audit_logs` (`:187`) with before/after state, owner-scoped over forced RLS. `correct_entry_interpretation` is the interpretation half. |
| **002** | `baseline` + guard owed by M3 | No `suppressed` and no `status` column exists on `memories`. `undo.ts` asserts, negatively and in both locales, that archive is never called a delete. The three *derived* states are `2N-KNOWS-002`'s own vocabulary and are not a fourth column. **When deletion ships, the distinction stops being free** — the guard must then also refuse deletion copy that reads as archival and archival copy that reads as removal. |
| **003** | **BUILD — M1** | §1. |
| **004** | M3 | Not written. §6 decides whether it may be. |
| **005** | M3 | Not written. |
| **006** | `baseline` for correction and archival; M3 for removal | The audit contract already carries actor, target, time and before/after for the two existing transitions. |
| **007** | `baseline` for memory undo; M3 for deletion undo | `undo.ts` reuses `setMemoryLifecycle`'s `archive` transition against a recorded id. |
| **008** | `baseline` + **guard** | Every memory mutation is a Server Action. `authenticated` nevertheless holds direct `insert/update/delete` on `memories` (`202607160006:76`), which is exactly why the rule is worth asserting rather than assuming. |
| **009–012** | M3 | Not written. |
| **013** | **governs §6** | The per-type consequences are confirmed by the slice's re-audit **before** implementation. That re-audit is §6, and it runs after M1 is deployed, not now. |

## 5. `2N-KNOWS-005` and `2N-IDENTITY-005…007` close by rule, and the rules are executable

### `2N-KNOWS-005` — fact / interpretation / inference is not representable for a memory

The requirement's own clause decides it: *"never asserts a distinction it cannot
substantiate."*

- `memories` carries **no classification column and no `interpretation_id`**.
- `entry_interpretations.element_classifications` is a **jsonb on the
  interpretation** (`202607170020:35`), defaulting to
  `{"summary":"interpretation","concepts":"interpretation","occurredAt":"fact","entities":"interpretation"}`.
  It classifies the *elements of a reading of an entry*. A memory is not one of
  those elements and holds no pointer to one.
- `memories.kind` contains a value literally spelled `fact`, beside
  `preference`, `habit`, `goal`, `restriction` and five more. It is a **category
  of subject matter**, not an epistemic level. Rendering `kind = 'fact'` as
  *"this is a fact"* and `kind = 'preference'` as *"this is an interpretation"*
  would mint an epistemic vocabulary out of a taxonomy that never meant one —
  the same move §66 refused when it declined to map `blocker` onto `risk`.

What the data **does** substantiate is origin, and `2N-KNOWS-003` already ships
it: a memory either points at a record the owner can open, or it does not. That
is stated, and the three-way epistemic label is **refused**.

Closes `not-built-by-rule`. The rule is asserted against the schema, the
generated types and the copy modules, with a **non-vacuity control** proving the
same scan finds the classification vocabulary that *does* exist on
`entry_interpretations` — so a later phase that gives `memories` a
classification fails this guard in the same change that makes it representable.

### `2N-IDENTITY-005…007` — merge and duplicate surfacing

All three close `not-built-by-rule` under `OD-2N-3` **A**, signed by ADR-109 and
unchanged by ADR-112. **`005` and `006` are refusals this slice must keep;
`007` is a contract recorded for a future phase and implements nothing.** Per
§66's rule, each is asserted rather than narrated: no merge RPC, no
canonical-identity pointer, no automatic duplicate surfacing, and no relinking
of relations — scanned across migrations, types and the app, with a control.

## 6. What the intermediate deletion re-audit must answer — **not answered here**

M3 may not be written until this is done **against the `main` and the database
that M1 produces**. For each of person, project and memory it must enumerate,
from the migrations, the foreign keys, the functions and the current consumers:

cascade dependencies · set-null dependencies · blocked dependencies ·
associations that must be removed · rows that must be preserved · effects on
retrieval · on tasks · on files · on aliases and tags · on relations, contexts
and projects · on the audit trail · on undo · on citations and historical
sources · and what the owner sees immediately.

**The stop condition is central and it is not a formality.** If any propagation
cannot be undone *with truth*, the slice stops and returns the case to the
owner. Recreating an entity without recovering its identity and real relations
is not an undo; restoring text without dependencies is not an undo; leaving
derived copies live is not an undo; inserting a new row that merely resembles
the removed one is not an undo.

Two facts already known will shape that audit and are recorded now so they are
not rediscovered late:

- **`memories` has no delete path today, by standing product decision**
  (`memories/undo.ts:23-25`), even though `authenticated` holds `delete`. M3
  changes that standing decision under `OD-2N-11` **B**. The direct grant is
  also what makes `2N-CORRECT-009`'s refusal of a client-side multi-delete a
  live rule rather than an academic one.
- **`undo_operation` is a handler registry** (`202607250052`), and `memories`
  has **no registered handler** — `undo.ts:25` records that registering one
  costs a migration. Whether M3 can register one *within its own file* without
  becoming a second migration's worth of responsibility is a question for §6.

## 7. Order, and what this slice will not do

1. **M1** — validity-aware retrieval, plus the `2N-KNOWS` surface work above
   (003, 004, 008) and the three by-rule guards, which need no schema.
2. PR → CI → merge → CI on the merge SHA → deploy → hosted proof → parity.
3. **Intermediate deletion re-audit** (§6), against the resulting tree and database.
4. Explicit decision on true-undo viability. **Stop here if it fails.**
5. Only then M3.

Not done, in either unit: no fourth migration, no widening of `source_type`, no
backfill, no new job or pipeline, no merge or split, no bulk deletion, no
persisted inference, no provider call, no change to signup, rollout or push, and
no work on Phase 2O.
