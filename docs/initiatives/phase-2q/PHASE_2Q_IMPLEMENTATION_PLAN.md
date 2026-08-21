# Phase 2Q — Implementation plan

**Planning only.** This plan describes work that is **not authorized to start**.
ADR-126 authorizes the planning of this phase and nothing else. No slice below
may begin, and no migration may be created, until the owner signs §2 of the PRD
and records a separate implementation decision.

**Baseline:** `main` **`beef7fa`**, 99 local = 99 hosted, parity
`202608190099`, CI green 3/3 on that SHA, zero open PRs.

---

## 1. Migration budget, derived from need

**Proposed: exactly one.** A second is a **stop condition** unless `OD-2Q-4` is
signed for it.

### The one migration — `summaries.citations`

| Question the owner asked | Answer, proved |
|---|---|
| Why can the current schema not carry the delivery? | `summaries` has fourteen columns and `Relationships: []`. There is no column that can hold a citation and no join table. A citation cannot be persisted anywhere else without inventing a table |
| What is its exclusive destination? | Slice **2Q.1**, requirement `2Q-CITE-001`. It has no other consumer |
| What is its order relative to producers? | The column must exist **before** `generateReview` writes to it, and the writer must ship **in the same slice** — ADR-123 Decision 7's rule that a migration may not create schema nobody uses applies unchanged |
| Positive test | a generated review's row carries a parseable envelope naming real ids |
| Negative controls | (i) the column is **not** an FK — deleting a cited task leaves the envelope byte-identical; (ii) a fabricated id never reaches the column; (iii) an extra key is **rejected**, not stripped; (iv) the table's policies and grants are unchanged, asserted rather than assumed |
| Does it need hosted application? | **Yes** — the feature is unobservable without it, and `2Q-CLOSE-003` requires hosted proof |
| Stop condition | **any second migration halts the phase** and returns to the owner |

### What is deliberately *not* a migration

- **The type vocabulary.** `entry | memory | task` is pinned in TypeScript
  (`lib/ai/types.ts`, `conversation-sources/contracts.ts`), not in SQL. The
  deployed column is `citations jsonb not null default '[]'` with **no check
  constraint and no trigger**. Widening the vocabulary costs **zero migrations**.
- **Telemetry.** It *would* cost one, because `product_events` validates event
  names inside a deployed function. That is precisely why it is `OD-2Q-4` and
  why the recommendation is to decline it.

---

## 2. Slices

Six, ordered, each closeable on its own. **Every slice is re-audited against the
`main` the previous slice produced, before it starts** — §11 of the roadmap
design, and the practice that has caught a stale premise in every phase since 2M.

---

### Slice 2Q.0 — What is true right now

**Visible user value:** none, and the slice says so. It exists so the five
findings this package rests on are re-proved against the tree the phase will
actually build on, rather than trusted from a document.

- **Requirements:** `2Q-FOUNDATION-001 … -005`
- **Surfaces likely touched:** none. Test files and one report only
- **Dependencies:** none
- **Migrations:** none
- **Tests:** unit assertions that fail if `generateReview`'s source set or its
  discard changes; a test that executes the type-confusion finding; a test that
  asserts the *present, wrong* `authorizeHref` behaviour so 2Q.2 can invert it
- **Journey:** none
- **Hosted proof:** a read-only re-verification of parity and of the `summaries`
  column list
- **Hardware:** none
- **Closing criterion:** five findings recorded with line numbers, each with a
  test that would fail if the finding stopped being true
- **Stop conditions:** any finding that does not reproduce → **stop and return
  to the owner**, because the PRD rests on it
- **Explicitly does not:** change any product behaviour, create any column, or
  touch hosted data

---

### Slice 2Q.1 — The references survive the write

**Visible user value:** still none on screen — and this is stated rather than
disguised. What changes is that a review generated from this point on *knows*
which records it was written from.

- **Requirements:** `2Q-CITE-001 … -009`
- **Surfaces likely touched:** `supabase/migrations/` (one file),
  `features/agent/actions.ts`, `features/conversation-sources/contracts.ts`,
  `lib/ai/types.ts`, `lib/supabase/database.types.ts` (regenerated),
  `supabase/tests/`
- **Dependencies:** `OD-2Q-1` (vocabulary), `OD-2Q-3` (backfill), `OD-2Q-7`
  (budget). **All three must be signed before this slice starts**
- **Migrations:** **1 of 1** — `summaries.citations`
- **Tests:** unit over the persisted shape; pgTAP over RLS, grants and the
  absence of an FK; `deno` unaffected (the worker does not write `summaries`);
  **chat's existing citation tests are the control** that widening the vocabulary
  did not move chat
- **Journey:** none yet — nothing renders
- **Hosted proof:** the migration applied through the seven gates; parity
  advances to exactly one more than `202608190099`; a generated review's row read
  back with its envelope, then removed, with a two-sided residue control
- **Hardware:** none
- **Closing criterion:** a review generated against the hosted database carries a
  parseable envelope naming ids that resolve to that owner's own rows; deleting
  one of those rows leaves the envelope unchanged
- **Stop conditions:** a second migration proves necessary; the vocabulary change
  moves any chat assertion; the envelope can be made to hold text
- **Explicitly does not:** render anything, change what the model is asked, or
  change what the review says

---

### Slice 2Q.2 — A link, and only from a vouched-for identifier

**Visible user value:** **this is the slice the owner asked for.** A review that
mentions a task offers a link to that task.

- **Requirements:** `2Q-LINK-001 … -007`
- **Surfaces likely touched:** `app/[locale]/app/reviews/[reviewId]/page.tsx`,
  `features/reviews/markdown.ts`, `features/reviews/rendered-markdown.tsx`,
  `features/reviews/copy.ts`, one stylesheet
- **Dependencies:** slice 2Q.1; `OD-2Q-5` for the sources area
- **Migrations:** none
- **Tests:** unit over the (type, id) gate in both directions, with the
  *previously admitted* wrong href as the planted control; a test that a review
  naming a real task by **title only**, with no citation, renders no link
- **Journey:** an authenticated review page on desktop, Pixel 7 and the WebKit
  iPhone lane — link present, correct destination, keyboard reachable
- **Hosted proof:** the journey run against the deployed app
- **Hardware:** none
- **Closing criterion:** an owner-scoped review with a real task citation renders
  an anchor to `/{locale}/app/work/{taskId}` and that page opens the right task;
  an entry-vouched id on a `work/` href renders as text
- **Stop conditions:** the gate cannot bind (type, id) without a second
  mechanism; a link can be produced without a stored identifier
- **Explicitly does not:** change the review's text, the listing, the masking
  rules, or the access-control arm that keeps removed / foreign / never-existed
  indistinguishable

---

### Slice 2Q.3 — When the record is gone, hidden, or not theirs

**Visible user value:** the product stops being able to hand the owner a link
that fails, and stops implying a record still exists when it does not.

- **Requirements:** `2Q-TRUST-001 … -008`
- **Surfaces likely touched:** `features/conversation-sources/resolve-sources.ts`
  (a `task` branch), the review page's resolution path,
  `features/sensitivity/` call sites
- **Dependencies:** slices 2Q.1 and 2Q.2; `OD-2Q-5`
- **Migrations:** none
- **Tests:** deletion, forced read failure and foreign-owner cases asserted as
  **equal outputs**, not merely as three passing cases; a malformed-envelope test
  proving refusal is total; a guard failing on a second sensitivity derivation
- **Journey:** an authenticated run in which a cited task is deleted between
  generation and render
- **Hosted proof:** the same, against the deployed app, with residue removed
- **Hardware:** none
- **Closing criterion:** deleted, unreadable and foreign produce output that is
  **indistinguishable**, asserted by equality rather than by three separate
  expectations
- **Stop conditions:** any path distinguishes "gone" from "unreadable"; any path
  reveals that a foreign id is real
- **Explicitly does not:** widen what a review may cite

---

### Slice 2Q.4 — The defect the lane could not see

**Visible user value:** the product is legible in dark mode on a WebKit browser,
where today two surfaces are not.

- **Requirements:** `2Q-ACCESS-001 … -005`
- **Surfaces likely touched:** `src/app/globals.css` or the owning stylesheet,
  `.github/workflows/ci.yml`
- **Dependencies:** `OD-2Q-6`. Slices 2Q.2/2Q.3 must land first only for
  `2Q-ACCESS-005`
- **Migrations:** none
- **Tests:** an axe run on the WebKit lane recorded **before** the change
- **Journey:** `accessibility.spec.ts` on all three projects
- **Hosted proof:** not required — this is a build-time property
- **Hardware:** none
- **Closing criterion:** the run that failed in `2Q-ACCESS-001` passes with **no
  rule disabled**, and CI's step then covers that lane. **The order is the
  requirement:** extending CI first would land a red pipeline
- **Stop conditions:** the fix needs a token change that alters another surface's
  contrast — then it is a design decision, not a slice
- **Explicitly does not:** claim any screen-reader evidence. `2P-ACCESS-005`
  stays WAIVED, NOT PASSED

---

### Slice 2Q.5 — Truthful completion

**Visible user value:** the owner can see, in one table, what the phase did and
what it did not.

- **Requirements:** `2Q-CLOSE-001 … -005`
- **Surfaces likely touched:** `scripts/`, `src/lib/closeout/`, `docs/`
- **Dependencies:** every slice above
- **Migrations:** none
- **Tests:** the generator's own refusals, each with a planted control that makes
  it fail
- **Journey:** the full online suite on three lanes
- **Hosted proof:** parity re-read live; zero residue with a **two-sided**
  control — plant a row, prove the probe sees it, remove it
- **Hardware:** the owner's device checkpoint, if the owner wants one
- **Closing criterion:** declared = classified, zero unclassified, every partial
  naming a remainder and a destination
- **Stop conditions:** any requirement without a slice, criterion, or destination
- **Explicitly does not:** close any inherited remainder by writing about it

---

## 3. What can run in parallel

Two slices may run concurrently only if they share **no** migration, component,
contract, closing document or hosted state.

| Pair | Parallel? | Why |
|---|---|---|
| 2Q.0 ↔ anything | **no** | every other slice rests on its findings |
| 2Q.1 ↔ 2Q.2 | **no** | 2Q.2 reads the column 2Q.1 creates |
| 2Q.2 ↔ 2Q.3 | **no** | both edit the review page's resolution path |
| **2Q.4 ↔ 2Q.1** | **yes** | disjoint: different files, no shared contract, no migration, no hosted state. `2Q-ACCESS-005` alone waits for 2Q.2/2Q.3 |
| **2Q.4 ↔ 2Q.2 / 2Q.3** | partially | the CSS and CI halves are disjoint; `2Q-ACCESS-005` is not |
| 2Q.5 ↔ anything | **no** | it classifies the others |

**The only genuinely parallel work is slice 2Q.4 against slices 2Q.1–2Q.3.** If
`OD-2Q-6` routes the accessibility defect elsewhere, the phase is fully serial.

---

## 4. Estimate

Recalculated against `main` `beef7fa`, not inherited. Units are working days of
agent execution including tests, review and merge; owner tasks are listed
separately because they are not on the agent's clock.

| Slice | Optimistic | Likely | Pessimistic | Driver of the spread |
|---|---:|---:|---:|---|
| 2Q.0 | 0.5 | **1** | 1.5 | a finding that does not reproduce sends this back to the owner |
| 2Q.1 | 1.5 | **2.5** | 4 | the migration's seven gates; the vocabulary change touching chat |
| 2Q.2 | 1 | **2** | 3 | the (type, id) gate and its controls |
| 2Q.3 | 1 | **2** | 3 | proving three cases *indistinguishable* is harder than proving each |
| 2Q.4 | 0.5 | **1.5** | 2.5 | a contrast fix can tip an inherited colour below threshold elsewhere |
| 2Q.5 | 1 | **1.5** | 2.5 | the generator's refusals each need a planted control |
| **Total** | **5.5** | **10.5** | **16.5** | |

**Critical path:** 2Q.0 → 2Q.1 → 2Q.2 → 2Q.3 → 2Q.5 = **9 days likely**. Slice
2Q.4 rides alongside and adds to the total only if it must be serial.

**Risk factors, each with the reason it is real here:**

1. **The migration is the only one.** If a second proves necessary the phase
   stops. Probability is low — the audit proved the vocabulary is TypeScript —
   but the consequence is a full halt.
2. **The vocabulary change touches chat.** Chat is a shipped, governed surface
   with its own tests. Those tests are the control; if they move, the change is
   wrong.
3. **Hosted proof needs a real generated review**, which spends AI credit and
   needs a credential. If none is available the hosted half of 2Q.1 and 2Q.3
   becomes **unspendable rather than declined**, exactly as `2P-CHAT-007-JOURNEY`
   already is — and that must be recorded as such, not as a pass.
4. **A contrast fix can break a neighbour.** This repository has already recorded
   that a new tint tipped an inherited colour below threshold, and that only axe
   on a real page catches it.
5. **This workstation runs 54 fewer tests than CI.** Chain guards speak only in
   CI; budget one extra CI iteration per slice.

**Impact of migrations on the estimate:** the single migration adds roughly one
day to slice 2Q.1 for the gates and the hosted application. A second — if
`OD-2Q-4` is funded — adds **another 0.5–1 day** and a second deployed-function
change.

**Impact of hosted proofs:** roughly 0.5 day per slice that has one (2Q.1, 2Q.2,
2Q.3, 2Q.5), already inside the numbers above.

**Owner tasks, not on the agent's clock:**

| Task | When | Blocking? |
|---|---|---|
| Sign or amend the eight decisions in PRD §2 | before 2Q.1 | **yes** — `OD-2Q-1`, `-3`, `-7` block slice 2Q.1 outright |
| Record an implementation authorization ADR | before 2Q.1 | **yes** |
| Provide an AI credential, if hosted generation is wanted | before 2Q.1's hosted proof | partially |
| Device checkpoint on the review page | at 2Q.5 | owner's choice |

**What the estimate does not include:** the four automation review flows
(`OD-2Q-8`, recommended out — measured at roughly two further slices for the two
medium ones alone), any rollout work, and anything requiring a real iPhone.
