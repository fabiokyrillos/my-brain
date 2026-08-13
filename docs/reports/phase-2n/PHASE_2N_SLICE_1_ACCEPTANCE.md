# Phase 2N — slice 2N.1 acceptance record

**Slice:** 2N.1 — Person page hardening: provenance, derived-vs-persisted, mobile, accessibility
**Authorization:** ADR-112 (implementation through closeout), ADR-110, ADR-109, ADR-108
**Branch:** `codex/phase-2n-slice-1-person`
**Base:** `main` at `12591495`
**Migrations:** **0 created.** 92 total, hosted parity `202608120092` — both unchanged.

This record classifies honestly. Where something was preserved rather than
built, it says `baseline`; where a proof was executed, it says what was executed.

---

## 1. Re-audit before implementation

Run against `main` at `12591495`, re-derived from source. Handoff §64's table
held in every row, and two facts were re-derived rather than inherited:

| # | premise | re-derived result |
|---|---|---|
| 1 | the three relation tables carry no provenance | **held** — 0 `source_entry_id` / `interpretation_id` in their `create table` statements |
| 2 | `memories` and `tasks` carry `source_entry_id` | **held** |
| 3 | `src/features/provenance` does not exist | **held** |
| 4 | no confidence is rendered in `src/features/entities` | **held** — but see §4, the column exists and is written |
| 5 | `2N-PERSON-003` already satisfied | **held** — six lists bounded, not re-claimed here |

---

## 2. The finding that shaped the whole slice

**`memories.source_entry_id` and `tasks.source_entry_id` are both declared
`on delete set null`** (`202607160006:6`, `202607160003:106`).

So a `NULL` source means **either** "nothing recorded one" **or** "the source
entry was deleted and the foreign key nulled the column", and nothing
afterwards distinguishes them. There is also a real writer that inserts a memory
with no source at all (`operations/actions.ts`), so both readings genuinely
occur.

The tempting arm is to call a null source *owner-authored* and print *"informado
por você"*. **For a memory whose entry the owner deleted, that is false** — and
false in the direction that matters, turning an absence into a positive claim
about where knowledge came from. So **`null` resolves to `unsourced`**, the same
arm as a source that will not resolve.

*"Informed by you"* is reserved for the three relation tables, where it is true
**by construction**. `ownerAuthored` takes a closed union of exactly those
tables, so `ownerAuthored("memories")` is a **type error** rather than a
judgement call — and a guard checks that union against the migrations, so a
later phase adding a source column to one of them fails immediately.

---

## 3. Requirements — 25 declared, 25 classified

### Built (17)

| id | delivered as |
|---|---|
| `2N-PERSON-004` | `SectionOriginNote` on all six sections — four on the page, two inside the panels; guard counts them |
| `2N-PERSON-006` | `?back=` anchor round trip, refused unless it matches this app's own locales under `/app` |
| `2N-PROV-001` | every claim resolves to an entry, to the owner, or to `unsourced`; memories joined the source resolution |
| `2N-PROV-002` | source and derived statement are visibly different; the original is reachable from the derived claim |
| `2N-PROV-003` | the return link lands on the row's anchor, not merely on the page |
| `2N-PROV-004` | `unsourced` rendered as a fact, never an error; fail-closed on classification |
| `2N-PROV-005` | read from stored rows only — the module holds no client and no signature that could accept content |
| `2N-PROV-006` | no count, cluster or arrangement presented as evidence |
| `2N-RELATION-002` | every rendered relation states its origin |
| `2N-RELATION-008` | existing rows presented as owner-authored **by construction**, with no retroactive provenance invented |
| `2N-MOBILE-001` | no horizontal overflow at the mobile viewport, asserted by measurement |
| `2N-MOBILE-002` | the source link is a visible labelled control with a ≥24px target; nothing depends on hover |
| `2N-MOBILE-003` | the journey runs on `desktop` and `mobile` projects |
| `2N-ACCESS-001` | keyboard-reachable with a measured focus outline |
| `2N-ACCESS-002` | derived-vs-persisted said in **words**, not by column position — which is also what makes it survive the mobile stack |
| `2N-ACCESS-003` | provenance announced as text; no `title` anywhere; masked content never reaches an attribute |
| `2N-ACCESS-005` | `provenance/copy.ts`, both locales, every state — including the accessible names |

### Baseline (7)

`2N-PERSON-001`, `2N-PERSON-002` — preserved and re-verified, not re-claimed:
the page still loads by id under forced RLS with `notFound()` for both foreign
and nonexistent, and identity/organization/explainer render as before with
`notes` masked per ADR-110.

`2N-PERSON-003` — **satisfied before this slice**, by PR #205. Re-asserted, not
re-claimed.

`2N-PERSON-005`, `2N-PERSON-007` — true before and asserted now: task titles use
the same `ProtectedContent` and `deriveTaskSensitivity` as Work, and the page
adds no write of any kind (guard-asserted against `insert|update|upsert|delete`).

`2N-RELATION-004` — the authority paths existed (`updateOwnerRelationship`,
`endOwnerRelationship`) and audit rows were already written by them.

`2N-RELATION-005` — **nothing renders confidence.** Preserved rather than built;
see §4 for why this is less trivial than it reads.

### Not applicable (1)

`2N-ACCESS-004` — graph affordance. **2N.1 ships no graph**; it belongs to 2N.6.

---

## 4. The guard that was written wrong first, and is recorded rather than loosened

The confidence guard initially banned the string `confidence` anywhere under
`src/features/entities`. It failed — correctly, on correct code.

**All three relation tables carry a `confidence` column, and their writers set
it to the constant `1` for every owner-authored row** (`associations.ts`,
`relationships.ts`). Writing that constant is not rendering certainty. But
*rendering* it would print "100%" beside something the owner merely typed —
`2N-RELATION-005`'s failure exactly, and with the most confident-looking number
in the table.

So the assertion was **narrowed to what renders** — the page and the `.tsx`
components — and deliberately not to the Server Actions. A second assertion goes
further: `confidence` must not even enter a person-page projection, because a
value absent from the query cannot be rendered by a later edit and is not
sitting in the RSC payload either.

`copy.ts` carries a `confidenceExplainer` that nothing currently uses, so that
showing a number later is a deliberate act with words attached rather than the
easy default of printing the column.

---

## 5. Judgement calls, recorded rather than buried

- **Section-level origin for relations, row-level for memories and tasks.** Every
  row in a relation panel has the same answer, because the table has no column
  that could differ. Repeating it per row would be noise; repeating it per row
  *and* varying it would be a lie.
- **Sensitivity reveals are NOT restored across a source round trip.**
  `2N-PERSON-006` asks for "any expanded disclosure", and the provenance
  disclosure is restored by the anchor. A revealed mask is not, deliberately:
  ADR-110 makes the reveal local and explicit, and persisting one across a
  navigation would weaken the posture 2N.0 shipped to satisfy a convenience.
  **Flagged for the owner rather than decided silently.**
- **The timeline gets no per-row provenance.** Those rows *are* the records.
- **`?back=` is refused rather than sanitised.** A rejected handle costs nothing
  — the browser's Back still works — while a sanitised one is a guess about
  intent.

---

## 6. Proofs

### Executed

`npm run test:e2e:online -- e2e/online-phase-2n-person.spec.ts` — **14/14
passed**, both locales × desktop and mobile (Pixel 7), 41.0s.

The fixture builds the `on delete set null` case on purpose: a memory whose
source entry is **deleted after the memory is created**, leaving the ambiguous
NULL. The journey asserts it renders `unsourced` and that its line does **not**
borrow the owner-authored wording — which is what makes the pair evidence rather
than coincidence.

`e2e/online-phase-2n-foundations.spec.ts` re-run: **12/12**, no regression.

**Same lane as 2N.0**: hosted Supabase database, auth and RLS; the application
is the **local production build** (`npm run build` → `npm run start`). **Not the
Vercel deployment.** Mobile is a **viewport simulation on Pixel 7 metrics**, not
a physical device — `2N-ACCESS-006` and `OD-2N-16` A make that sufficient, and
no screen-reader run is claimed.

### Zero residue, owner-scoped

Never a global count. Accounts matching `codex-2n1-`: **0**. Five distinctive
synthetic markers across `people`/`memories`/`entries`: **0** each.

### Gates

| gate | result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npx vitest run` | **6759 passed** (6701 → 6759, **+58**); 3 failed *files* / **0 failed tests**, the documented Windows shebang baseline |
| `npm run build` | passes |
| `git diff --check` | clean |
| hosted journeys | **14/14** and **12/12** |

---

## 7. What this slice did not do

No migration. No schema, RLS, grant, policy or RPC change. No Edge Function. No
writer of any kind. No provenance backfill. No entity merge. No persisted
inference. No provider call — the usage ledger is untouched. No change to signup
(**closed**), to the rollout gate (**25 · 3 · 2**), or to push (**not
resumed**). **Phase 2O is not started, planned or retargeted.**

---

## 8. Open residuals with named destinations

- **Reveal state across a source round trip** (§5) — an owner decision, not a
  slice's to take.
- **`2N-ACCESS-006`**: no screen-reader run is claimed. Remains an open residual
  alongside `2L-ACCESS-008`, and does not block closeout.
- **`2N-MOBILE-004`**: `2L-MOBILE-008` stays open, naming Work surfaces this
  phase does not cover.
