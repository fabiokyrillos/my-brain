# Phase 2Q — Slice 2Q.0 acceptance record

**Re-prove the five findings the phase rests on, against the `main` it will
actually build on.**

- **Authorization:** implementation of slices 2Q.0 … 2Q.5, **ADR-128**
  (2026-08-21), over the package ADR-126 authorized and the eight decisions
  ADR-127 signed.
- **Requirements:** `2Q-FOUNDATION-001` … `-005` (5 of 42).
- **Migrations:** **none created, none spent.** 99 local = 99 hosted, parity
  `202608190099`, unchanged by this slice. Budget stays **1 allocated · 0
  spent**.
- **Baseline:** `main` **`a0295a2`**, worktree clean, zero open PRs, CI green
  3/3 on that exact SHA, signup closed, rollout gate **25 pass · 3 fail · 2
  owner-signature**.
- **Product behaviour changed: none.** No Server Action, RPC, policy, schema,
  route, component, copy string or rendered control is altered by this slice.
- **Hosted writes: none.** Two read-only queries were run against the deployed
  database; both are recorded below with their exact SQL.

---

## 1. The baseline the package names, and the one this slice measured

The governing pair names baseline `main` **`beef7fa`**. `main` is **`a0295a2`**.

**This is not drift.** `beef7fa` is an ancestor of `a0295a2`, and the four
commits between them are the planning package (PR #276) and its integration
record (PR #277). The complete delta is `docs/`, `*.test.ts`, one `scripts/`
file and the handoff. **Zero product surfaces moved**, so every finding in the
audit still describes the tree it was written against.

The five findings were nonetheless re-derived from `a0295a2` rather than carried
over, because the phase's own stop condition is *"any finding that does not
reproduce"*, and a finding read from a document cannot fail.

---

## 2. The five findings, re-proved and located

Executed by `src/lib/closeout/phase-2q-foundation.test.ts` — **17 assertions,
all passing**. Two of the five blocks assert a **defect**, by executing it.

### `2Q-FOUNDATION-001` — the source set, and the discard

| Fact | Location on `a0295a2` |
|---|---|
| Entries read into the source set | `src/features/agent/actions.ts:932` |
| Tasks read into the source set | `src/features/agent/actions.ts:939` |
| Task labelled `memory:` | `src/features/agent/actions.ts:970` |
| The `summaries` write | `src/features/agent/actions.ts:1045` |
| `citedSourceIds` in the whole file | **absent — zero occurrences** |

**The discard is proved by absence, which is the strongest form available.** The
provider returns the field, `generateReview` holds the entire answer in `answer`,
and the identifier does not occur anywhere in the file. There is no partial read
to miss and no path that could be quietly carrying it.

**A correction to this record's own first assertion, kept rather than hidden.**
The first version asserted that `generateReview` reads exactly two tables. It
reads **five**: `profiles` and `agent_preferences` for the timezone and the model
routing, plus `entries`, `tasks` and the `summaries` write. The finding is about
the **source set**, not about every read the action makes, and the assertion now
extracts the `const sources: ChatSource[]` literal and asserts the two results
that feed it. A test that had been tuned until it agreed with the document would
have stopped being a test.

### `2Q-FOUNDATION-002` — nowhere to put a citation

Asserted three ways, so a generated artifact lagging the schema cannot hide it:

1. **The checked-in types.** `summaries.Row` carries exactly fourteen columns and
   `Relationships: []`.
2. **The migration chain.** No migration in the 99 creates a citation column on
   `summaries` or a `summary_citations` / `summary_sources` join table.
3. **The deployed database**, read live — §3 below.

And the consequence, located: `reviews/[reviewId]/page.tsx:125` passes
`new Set<string>()`, so nothing in a stored review can become an anchor.

### `2Q-FOUNDATION-003` — the type confusion, EXECUTED

The failure the phase exists to prevent, driven through the **real**
`resolveSources`:

- a task uuid persisted as `{ type: "memory" }` resolves to **`unavailable`**;
- the resolver **never asks the `tasks` table** — asserted on the recorded list
  of tables it read, not inferred;
- **the control:** an entry citation in the *same call* resolves to `previewed`.
  Without it the block would keep passing if the resolver started returning
  `unavailable` for everything, which is the shape of a fix that fixes nothing.

And the vocabulary that causes it is pinned in **TypeScript**, not in SQL:
`CitedSourceType`, `ANSWER_REACH` and two `z.enum(["entry","memory"])` sites. The
deployed column is `citations jsonb not null default '[]'::jsonb`
(`202607160006_chat_memory.sql`) with **no check constraint** — asserted against
the migration text, so widening the vocabulary provably costs zero migrations.

### `2Q-FOUNDATION-004` — the surface confusion, EXECUTED

`authorizeHref(href, allowedIds)` (`src/features/reviews/markdown.ts:135`) takes
**no type at all**. Executed: one vouched-for uuid authorizes
`/pt-BR/app/inbox/{id}`, `/work/{id}`, `/people/{id}`, `/projects/{id}` **and**
`/memories/{id}` — all five, today.

**The control:** an id nobody vouched for is refused on all five, so the block
cannot pass by admitting everything.

**Inert today** (the allow-set is empty) and **live the moment slice 2Q.1
populates it.** Slice 2Q.2 inverts this block.

### `2Q-FOUNDATION-005` — `2P-ATTENTION-008`'s browser half, re-audited

**The verdict is half of what Phase 2P recorded, and the half that is right is
not the half the remainder names.**

Phase 2P closed the requirement `partial` with the remainder *"refresh and back
navigation proved only at the data layer"*. Re-audited against the current suite:

| Claim | Verdict | Evidence |
|---|---|---|
| Refresh proved only at the data layer | **FALSE** | `e2e/editable-candidate-confirmation.spec.ts` reloads the `needs-you` queue inside an `expect.poll` and asserts the row count, against a hosted disposable fixture |
| Back navigation proved | **FALSE — still absent** | **no** spec touching `needs-you` calls `goBack()`: not that file, nor `intelligent-capture`, `online-mobile-navigation` or `online-phase-2n-conflicts` |

**The scan is two-sided:** the same reader does find `goBack` in
`online-phase-2p-reviews.spec.ts`, so an absence here is an absence rather than a
broken scan.

**The remainder is narrower than recorded, and it is still open.**
`2Q-FOUNDATION-005` asks for a verdict in either direction, not for a discharge.
**Nothing in this phase discharges `2P-ATTENTION-008`**, and its destination is
unchanged: the owner.

---

## 3. Hosted read-only verification

Two queries, run against project `ulvwzqlpsjyrnqzfxmck`. **Both are `select`
statements. No row was written, updated or deleted, and no fixture was created.**

### Parity

`npx supabase migration list --linked` — local and remote tails agree at
**`202608190099`**, **99 = 99**. Unchanged by this slice.

### The `summaries` shape and posture, recorded as the pre-state slice 2Q.1 must leave alone

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'summaries'
order by ordinal_position;
```

Fourteen columns — `id`, `user_id`, `period_type`, `period_start`, `period_end`,
`title`, `content`, `original_content`, `status`, `model`, `input_tokens`,
`output_tokens`, `generated_at`, `updated_at`. **No column can hold a citation.**
The hosted shape and the checked-in types agree exactly.

```sql
select policies, grants, rls, force_rls, fk_count, trigger_count …
```

| Property | Value on `202608190099` |
|---|---|
| Policies | **3** — `summaries_insert_own` (INSERT), `summaries_select_own` (SELECT), `summaries_update_own` (UPDATE), each granted to `authenticated` alone |
| Grants | `authenticated`: INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE — **no DELETE**. `postgres` and `service_role`: all seven |
| Row-level security | **enabled** |
| Forced RLS | **enabled** |
| Foreign keys | **1** |
| Non-internal triggers | **1** |

**This table is the control for `2Q-CITE-002`.** That requirement asserts the
policy set and the grants are *unchanged* by the migration, and a requirement
that asserts "unchanged" without a recorded pre-state is asserting nothing.

---

## 4. What this slice deliberately did not do

- **No product behaviour changed.** No column, route, component, action or copy
  string moved.
- **No migration was created**, and the budget is untouched at **1 allocated · 0
  spent**.
- **No hosted data was written.** Both hosted reads are `select`, and no fixture
  was planted, so there is no residue to clean and no two-sided residue control
  is owed by this slice.
- **`2P-ATTENTION-008` was not discharged**, only re-audited.
- **No AI credential was spent.** No review was generated, here or hosted.
- Signup stays closed, the rollout gate stays 25 · 3 · 2, push HTTP 403 is not
  resumed, `2P-ACCESS-005` stays **WAIVED, NOT PASSED**, and no successor phase
  is started or planned.

---

## 5. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2Q-FOUNDATION-001` | **built** | `phase-2q-foundation.test.ts` §001 — four assertions, locations recorded |
| `2Q-FOUNDATION-002` | **built** | §002 — types, migration chain and the deployed database agree |
| `2Q-FOUNDATION-003` | **built** | §003 — executed through the real `resolveSources`, with a passing control |
| `2Q-FOUNDATION-004` | **built** | §004 — executed through the real `authorizeHref`, with a refusal control |
| `2Q-FOUNDATION-005` | **built** | §005 — verdict recorded in the direction the evidence points, scan two-sided |

**Five of forty-two classified. Zero unclassified in this slice's scope.**

**No stop condition was reached.** All five findings reproduce, so the PRD's
premises stand and slice 2Q.1 may start.
