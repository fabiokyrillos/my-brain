# Phase 2N — slice 2N.0 acceptance record

**Slice:** 2N.0 — Foundations: privacy, time and bounds contracts
**Authorization:** ADR-112 (implementation through closeout), ADR-110 (notes posture), ADR-109 (seventeen signatures), ADR-108 (phase)
**Branch:** `codex/phase-2n-slice-0-foundations` · **PR:** #202
**Base:** `main` at `4b66119`
**Migrations:** **0 created.** 92 total, hosted parity `202608120092` — both unchanged.

This record classifies honestly. Where a proof was written but not executed, it
says so and does not count it as executed.

---

## 1. Re-audit before implementation

Run against `main` at `4b66119`, re-derived from source rather than inherited
from `PHASE_2N_SLICE_0_REAUDIT.md`. **All five premises still held.**

| # | premise | re-derived result |
|---|---|---|
| 1 | The contextual surfaces are outside the sensitivity contract | **held** — 0 imports of `src/features/sensitivity` across the five routes and `src/features/entities` |
| 2 | `entity_aliases` has no reader | **held** — 0 occurrences in `src/` outside `database.types.ts` |
| 3 | Search's `people` domain matches and snippets `notes` | **held** — `columns: ["name","notes"]`, `snippetColumn: "notes"` |
| 4 | Lists truncate silently | **held** — 13 bare `.limit(...)` calls across the person and project pages |
| 5 | No `sensitivity` column on `people`/`projects` | **held** — 0 in the migrations, 0 in the generated types |

No drift, no re-planning, no reordering. **2N.0's plan was accurate as written.**

---

## 2. Requirements — 29 declared, 29 classified

### Built (23)

| id | delivered as |
|---|---|
| `2N-PRIVACY-001` | `person`/`project`/`memory`/`file` in `GOVERNED_SURFACES`, each admitted with its first consumer; `graph` deliberately excluded |
| `2N-PRIVACY-002` | entry text, task titles, memory bodies and file names all routed through `ProtectedContent` |
| `2N-PRIVACY-003` | classification derived, never persisted; no column on `people`/`projects` (guard-asserted against the generated types) |
| `2N-PRIVACY-004` | masking never removes an item; `boundedList` counts what it shows and reports the bound separately |
| `2N-PRIVACY-005` | absence → most protective; removed/foreign/unreadable share one input and therefore one output |
| `2N-PRIVACY-006` | the `people` narrowing is stated as a signed narrowing of ADR-093; no other domain touched |
| `2N-PRIVACY-007` | field taxonomy applied: source-derived content masked, structural identifiers not |
| `2N-PRIVACY-008` | the person's name stays visible; `notes` does not inherit its treatment |
| `2N-PRIVACY-009` | `deriveFreeTextSensitivity` — no parameters, most protective, never `undetermined` |
| `2N-PRIVACY-010` | `notes` out of the searchable domain, out of the people listing's projection entirely |
| `2N-TIME-001` | every dated value this slice renders already routes through `local-day.ts`/`instant-format.ts` with the owner's zone |
| `2N-TIME-003` | no fixed offset, fixed day length or host-zone reader added; tree-wide guard still at zero |
| `2N-PERSON-003` | bounds vocabulary applied to every list on the person page |
| `2N-PROJECT-006` | same vocabulary, same words, on the project page |
| `2N-KNOWS-007` | `sensitivity` selected beside the content it classifies; nothing caches a level |
| `2N-KNOWS-008` | bounds applied to the memory surfaces |
| `2N-SEC-002` | ownership stays RLS-and-query only; the alias reader takes no `user_id` and holds no service-role client |
| `2N-SEC-003` | no new direct write path on any of the five routes (guard-asserted) |
| `2N-IDENTITY-001` | identity stated as name-uniqueness, matching the schema |
| `2N-IDENTITY-002` | no canonical-identity pointer added |
| `2N-IDENTITY-003` | projects resolve through the same alias mechanism, so the product carries one identity model |
| `2N-IDENTITY-004` | `entity_aliases`' first reader, consumed by the person page and by search |
| `2N-IDENTITY-009` | owner-scoped, validity-windowed, **no writer shipped** (guard-asserted) |

### Baseline (5)

`2N-TIME-002`, `-004`, `-005`, `-006` close **`baseline`, never `built`** — the
31 call sites were repaired by ADR-111's Local Day Correction initiative under
its own budget and closeout, and Phase 2N may not claim them. This slice's
obligation was to leave the tree-wide guard's four families at zero with
`OPEN_OCCURRENCES` empty, **asserted rather than assumed**, and to build no
second timezone census. Both asserted in
`src/lib/closeout/phase-2n-foundations-guard.test.ts`.

`2N-IDENTITY-008` closes **`baseline`**: no inference creates a persisted
identity. This slice adds no writer of any kind, so the property is preserved
rather than built — asserted as the absence of every write verb in the alias
reader.

### Partial (1)

`2N-PRIVACY-011` — **partial, and the remainder is named.** The journey is
written (`e2e/online-phase-2n-foundations.spec.ts`), covers both locales on
desktop and mobile, and asserts every clause: name visible, notes masked, reveal
local and reachable, notes absent from search, counts not usable as an oracle,
nothing inferred as `normal`. **It has not been executed.** It requires hosted
credentials (`ONLINE_SUPABASE_*`) and skips without them; the automated gates
that ran are unit, integration, lint, typecheck and build. A written test is not
an executed test.

**Remainder:** execute it against the deployment and record the result. No other
clause of the requirement is outstanding.

---

## 3. Gates

| gate | result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npx vitest run` | **6691 passed**; 3 failed *files* / **0 failed tests** — the documented Windows shebang-parse baseline (`storage-orphan-scanner`, `hosted-auth-parity`, `signup-hardening-admin-boundary`, 0 tests each), green in CI |
| `npm run build` | passes |
| `git diff --check` | clean |
| CI on the PR head | see §6 |

Test count moved from **6657 → 6691** (+34).

---

## 4. Defects found and fixed inside the slice

Both were found by the slice's own machinery rather than by inspection, which is
the argument for building the machinery.

1. **`.limit(20)` silently bounding the files page's failed-jobs list.** Caught
   by the new bounds guard. That section exists to say "these need your
   attention", so under-reporting it is the worst place on the page for a silent
   truncation. **Fixed, not exempted.**
2. **`boundedList` could only see the second of two read hops.** The contextual
   pages resolve ids through a relationship table first, so 101 links resolving
   to 95 rows reported the list complete. Caught reviewing the diff before
   marking the PR ready. Fixed with `upstreamBounded`, with the failing case
   added as a test.

**Two guards were written wrong first, and are recorded rather than quietly
loosened:** one flagged pagination's `hasMore` as a competing bounds vocabulary
(it is not — "there is a next page" comes with a way to reach it, a bound does
not), and one matched `await` inside the comment in `loading.tsx` that forbids
`await`. A guard that fails on correct code gets weakened by the next person to
touch it, so both were narrowed to the property actually being asserted.

---

## 5. Judgement calls, recorded rather than buried

- **`graph` is not admitted to `GOVERNED_SURFACES`.** `2N-PRIVACY-001` admits a
  surface "in the same change that ships their first governed consumer", and
  2N.0 ships no graph. It joins in 2N.6, with its consumer, or not at all.
- **`projects.description` stays visible.** ADR-110 D4 masks free text *about a
  human being*; search deliberately keeps matching that column. Masking it here
  would leave the product saying two different things about one column. If that
  judgement is wrong it is an owner decision, not a widening this slice performs.
- **`asMemorySensitivity` fails open to `normal`** where the contract's
  predicate fails closed. The memory detail page now uses the contract, because
  it both states the classification and acts on it. The write-path helper is
  left alone — re-pointing a schema's narrowing is not this slice's business.
- **The alias reader does not normalize.** `normalize_entity_alias` is revoked
  from `authenticated` and a TypeScript port is already proven to diverge on
  combining marks. Matching the `alias` column as typed is a narrower promise,
  honestly kept, with no second vocabulary.
- **`loadQuestionPreviews` is untouched.** ADR-112 D7b recorded it as a
  remainder with a destination; the absence of that pattern from all five 2N
  surfaces is asserted rather than assumed, and the register is preserved.

---

## 6. What this slice did not do

No migration. No schema, RLS, grant, policy or RPC change. No Edge Function. No
alias writer. No entity merge. No persisted inference. No provider call — the
usage ledger is untouched. No change to signup (**closed**), to the rollout gate
(**25 pass · 3 fail · 2 owner-signature**), or to push (**not resumed**). **Phase
2O is not started, planned or retargeted.**

---

## 7. Status

**Code complete; hosted acceptance outstanding** (`2N-PRIVACY-011`, §2). CI and
merge SHA are recorded in the handoff entry for this slice.
