# Phase 2Q — Slice 2Q.1 acceptance record

**A review generated from now on knows which records it was written from.**

- **Authorization:** implementation, **ADR-128** (2026-08-21), over the package
  ADR-126 authorized and the eight decisions ADR-127 signed.
- **Requirements:** `2Q-CITE-001` … `-009` (9 of 42; 14 of 42 cumulative).
- **Migrations:** **1 of 1 — the allocation is now SPENT.**
  `202608210100_phase_2q_slice_1_summary_citations.sql`. **A second migration of
  any kind is a stop condition** (`OD-2Q-7` signed A; `OD-2Q-4` signed A, so no
  pending decision could fund one).
- **Baseline:** `main` **`e3a3668`**, worktree clean, zero open PRs, CI green 3/3
  on that exact merge SHA (executed steps 9 / 11 / 23), 99 local = 99 hosted,
  parity `202608190099`.
- **Visible user value: still none on screen, and this record says so.** Nothing
  renders differently. Slice 2Q.2 is what draws the link.

---

## 1. Re-audit against the `main` slice 2Q.0 produced

| Question | Answer |
|---|---|
| Product surfaces changed since the planning baseline `beef7fa`? | **none.** The only non-docs, non-test file in the whole delta is `scripts/generate-phase-2p-traceability.mjs`, a closeout script |
| Do slice 2Q.0's five findings still hold? | **yes** — re-run on `e3a3668`, all 17 assertions pass |
| Hosted parity | `202608190099`, 99 = 99, unchanged |
| Chat control set, recorded **before** touching anything | **91 tests, 91 pass, 0 fail** across `features/chat/` and `features/conversation-sources/` |

That last row is the control `OD-2Q-1` requires, measured rather than assumed.

---

## 2. The migration

`alter table public.summaries add column citations jsonb not null default '[]'::jsonb;`

One statement. What it deliberately does **not** do is the substance, and each
refusal is asserted rather than described:

| Refusal | Why | Proved by |
|---|---|---|
| **no foreign key** | a review is a **historical statement**; deleting a cited task must not edit what it said. A nullable FK would also make `NULL` ambiguous between "no source" and "deleted source" | the catalog carries no FK on the column, **and** the pgTAP test deletes the cited task and asserts the stored envelope is **byte-identical** |
| **no check constraint, trigger or validator** | the envelope's shape is pinned by a `.strict()` Zod schema at both the write and the read. That is what makes the vocabulary `entry \| memory \| task` cost **zero** migrations | catalog assertion + the migration text |
| **no policy, no grant, no revoke** | a column inherits its table's RLS and privileges | pgTAP asserts the **whole posture unchanged** — see §3 |
| **no backfill** | `OD-2Q-3` signed A. Re-running retrieval over past windows would produce references the original review was **not written from** | the migration contains no `update` or `insert` on `summaries` |

**A correction worth recording, because it happened twice.** The test that
asserts these refusals first scanned the raw migration file and failed on
`on delete set null` — inside the `--` comment explaining *why the column is
deliberately not a foreign key*. Stripping `--` lines fixed that, and it failed
again on `foreign key` — this time inside the `comment on column … is '…'`
statement, which is **prose living inside a statement**. The rule underneath
both: **an authority guard must forbid the act, not the word**, or it fails on
the paragraph explaining why the act is forbidden. The stripper now removes both,
and has a **two-sided control** proving it removes prose and keeps statements —
without which a stripper that removed everything would make every refusal above
pass on an empty string.

---

## 3. `2Q-CITE-002` — the posture, asserted against a recorded pre-state

Slice 2Q.0 read the live posture at parity `202608190099`. `supabase/tests/phase_2q_summary_citations.sql`
asserts each value is unchanged:

| Property | Pinned value |
|---|---|
| Policies | **3**, by name: `summaries_insert_own`, `summaries_select_own`, `summaries_update_own` |
| Policy roles | every one granted to **`authenticated` alone** — none is PUBLIC |
| `authenticated` grants | INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE — **and still no DELETE**, asserted separately |
| `anon` | zero privileges |
| RLS | enabled |
| **Forced** RLS | enabled |
| Foreign keys on the table | **1** — the pre-existing `user_id`, and none on `citations` |
| Columns | **15** — the fourteen plus the allocated one. A sixteenth fails here |

Isolation is proved **two-sided**: under `set local role authenticated` with the
owner's JWT, another account's review returns zero rows **and** the owner's own
returns one with its envelope intact — so the isolation assertion cannot pass on
a blind read. `authenticated` attempting `delete` still raises `42501`.

**Two vocabulary traps caught before CI**, both by reading the deployed schema
rather than assuming it: the fixture UUIDs originally contained `q`, which is not
a hex digit; and the task status was written as `done`, which **does not exist** —
the deployed check admits `inbox | todo | in_progress | waiting | blocked |
deferred | completed | cancelled`.

---

## 4. `OD-2Q-1` — one vocabulary, and a separation the signature forced

`CITED_SOURCE_TYPES = ["entry", "memory", "task"]`, in one constant that
`referenceSchema` and `CitedSourceType` both read, so a fourth cannot be added in
one place and missed in another. `supportKindForSource` became an **exhaustive
record** rather than a ternary, because a ternary's `else` arm silently absorbs
every type added after it was written — which is the exact shape of the defect
this phase exists to remove.

### The one judgement call, and why it is not a reinterpretation

**`ANSWER_REACH` could not simply be widened and spread.** It served as two
different facts under one name: what the envelope schema *admits*, and what chat
*declares*. `buildCitationsEnvelope` spread it into every envelope, and
`conversation-sources/copy.ts` tells the owner *"I looked in your records and
your memories — those two places only."* Widening it and leaving the spread would
have made **chat claim it reads tasks** — a lie the product would have told on
every answer.

So: `ANSWER_REACH` is now the admissible vocabulary; `CHAT_REACH` (`entry`,
`memory`) and `REVIEW_REACH` (`entry`, `task`) are what each caller declares, and
`buildCitationsEnvelope` **requires** the caller to pass one. A default would
have silently given a new caller chat's reach.

**Chat's control assertion was not weakened — it was given the right name.** It
used to read `expect([...ANSWER_REACH]).toEqual(["entry","memory"])`. It now
reads `expect([...CHAT_REACH]).toEqual(["entry","memory"])`, **and additionally**
asserts that the copy the owner actually reads still says two places in both
locales — so the stamped fact and the sentence cannot drift apart. The property
is stronger than it was.

### `resolve-sources.ts` refuses a task rather than rendering one

ADR-127 Decision 1 says this module "gains a `task` branch". That sentence was
written for the option that was **recommended** — option A, where the sources
area showed a preview of each cited record. **Decision 5 of the same ADR signed
option C instead**, and Decision 5.1 states the consequence in the owner's own
terms: *"a source list carrying no governed content never calls `resolveContent`
at all."*

This is mechanical, not a preference. `readOnlyPreviewCard` — the only thing this
module builds a resolved source from — **requires** a `snippet` and a
`sensitivity`. For a task those are its **title** (content, forbidden on this
surface by `2Q-LINK-008`) and a classification derived from `source_entry_id` (a
second derivation, forbidden by `2Q-TRUST-007`). A rendering task branch would
have manufactured exactly the two things the signature removed.

So the branch **refuses**: it returns the same `unavailable` shape a deleted
record gets, with `snippet` asserted `null`, and it does **not** go looking in
`memories`. Chat cannot produce a task reference at all (`OD-2Q-2`, signed A), and
the review page gets its own content-free resolver in slice 2Q.2. **The
vocabulary is shared exactly as `OD-2Q-1` signed; only the renderer is not.**

**This is flagged rather than buried** because it is the one place where a signed
decision's illustrative sentence and the signed decision it shares an ADR with
point in different directions. Both signatures are honoured; the narrower reading
is the one that preserves them.

---

## 5. Requirements

| Requirement | Class | Evidence |
|---|---|---|
| `2Q-CITE-001` | **built** | the migration; parity advances at deployment; types agree in both directions; pgTAP pins the same name |
| `2Q-CITE-002` | **built** | pgTAP, eight posture assertions against the recorded pre-state |
| `2Q-CITE-003` | **built** | no FK in the catalog **and** the byte-identical envelope after deleting the cited task |
| `2Q-CITE-004` | **built** | the envelope is in the same upsert; the guard asserts the write contains it |
| `2Q-CITE-005` | **baseline** | `openai-provider.ts` filters against `availableIds`; the action's `flatMap` is the second, independent gate, driven with a fabricated id alone **and** mixed with a real one |
| `2Q-CITE-006` | **built** | an extra key is **rejected**, not stripped — the whole envelope fails to parse; six content-shaped field names each refused |
| `2Q-CITE-007` | **built** | the id prefix and the type asserted **as a pair**, with a memory-labelled task as the planted control; and at the database, `citations -> sources -> 0 ->> 'type' = 'task'` |
| `2Q-CITE-008` | **built** | an empty column parses to `unknown`, asserted **not** to be `no_qualifying_evidence`; a row written without citations gets `[]`, never NULL |
| `2Q-CITE-009` | **built** | the constructor takes no prior state; pgTAP upserts twice over one period key and asserts **one** envelope, holding the **second** |

**Refusal 14 is obeyed by construction:** every persistence assertion drives an
entry **and** a task together. Single-type evidence would prove the wrong half.

**This slice claims nothing about a rendered link.** The traceability contract is
explicit that reading the column back proves `2Q-CITE-*` and proves nothing about
`2Q-LINK-*`.

---

## 6. Chain pins moved, visibly, in the same commit

The migration moved the chain head from 99 to 100, and **eleven guards from
earlier phases pin that head** — each asserting "my slice added none". The rule
is written into one of their own failure messages: *"The pin is updated by the
slice that adds a migration, deliberately and visibly, in the same commit —
never deleted."*

All eleven were moved with a comment naming ADR-128 and the migration, and the
budget guards keep counting Phase 2Q's contribution **explicitly** — pinned at
exactly one — rather than absorbing it into a bumped total. **A second Phase 2Q
migration now fails in six independent places.**

`docs/SECURITY.md` gains the migration's entry, which the documentation guard
requires by parity number.

**One edit of mine was wrong and the guard caught it.** In
`phase-2n-library-guard.test.ts` the new head landed as `toBe(old, new)` — a
second argument, which vitest reads as the failure **message**, not the expected
value. Had the head not actually changed, that would have passed while carrying a
silently misleading assertion.

---

## 7. What this slice deliberately did not do

- **Nothing renders.** The review page still passes `new Set<string>()`, and the
  foundation guard asserts it, because a migration whose consumer shipped early
  would have made that line a lie one slice sooner.
- **No hosted write, and no hosted apply yet.** The migration reaches the
  deployed database only after the merge SHA is green — §8.
- **No AI credential was spent.** No review was generated, locally or hosted.
- **No second migration.** Budget **1 allocated · 1 spent**.
- Signup closed, rollout 25 · 3 · 2, push HTTP 403 not resumed, `2P-ACCESS-005`
  **WAIVED, NOT PASSED**, no successor phase started or planned.

---

## 8. The deployment gates still owed

This record covers the repository half. The migration reaches the hosted project
only through, in order: a green pull request; a green **merge SHA**; a clean tree
whose local bytes equal the merged bytes; the hosted list read; a dry run showing
**exactly one** pending migration; application; hosted proof; parity advancing to
`202608210100` — **exactly one more**; and zero residue with a two-sided control.

**A fourth parity proof is owed at that point and is named rather than implied:**
once applied, `supabase gen types typescript --linked` is diffed against the
committed `database.types.ts`. It cannot run before then — the generator reads
the deployed database, which does not carry the column yet — so the type entry is
added **by hand** under ADR-041's mechanism, and **no claim of regeneration is
made anywhere in this record.**

---

## 9. Local gates

`lint` clean on every touched file · `typecheck` clean · `npm test` **483 of 486
files pass, 0 failed tests** (the 3 are the known Windows shebang-parse baseline,
green in CI) · `npm run build` succeeds.

**pgTAP was not run locally** — there is no Docker on this workstation. CI's
`database` job applies the whole chain to an empty database and runs the suite;
that is the gate, and it is named rather than assumed.
