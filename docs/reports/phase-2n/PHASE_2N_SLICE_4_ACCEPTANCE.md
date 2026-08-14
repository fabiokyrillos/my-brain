# Phase 2N slice 2N.4 — acceptance: the Brain says two facts cannot both be right

**PR #219**, merged at `da9b787`, **CI green on that exact merge SHA**. Head at
review was `3cf69cf`, also green on all three job families. Base was `main` at
`674965d`.

**Migrations: 0 created. 94 total, hosted parity `202608140094`, local = remote,
read live.** Budget `3 allocated · 2 spent (M1, M3)`; **M2 stays with 2N.7**,
unspent and non-transferable, and a **fourth is a STOP CONDITION**.

**6 requirements: 6 built.**

## 1. What the product does now that it did not

A memory whose validity window is impossible — it comes into force **after** it
stopped being in force — used to read as **"arquivada"**. `memoryLifecycleState`
resolves it that way because *archived wins over scheduled*, and that was right
about the code and wrong about the world: the memory is not "no longer true", it
is a pair of dates that cannot both be right.

It now appears in **"Precisa de você"**, with both dates in the owner's zone and
locale, a plain sentence saying why the assistant did not choose, and one
labelled action that reaches the owner's own existing correction path.

## 2. The enumeration came first, and it closed at one

`2N-CONFLICT-001` obliges the phase to enumerate the deterministically detectable
set **and declare the rest out by name**.
`PHASE_2N_SLICE_4_CONFLICT_ENUMERATION.md` examines **eight candidates**:

| # | Candidate | Classification |
| --- | --- | --- |
| C1 | memory validity window inverted | **conflito implementável** |
| C2 | overlapping windows, same subject and kind | detectável, mas não conflitante |
| C3 | memory texts disagree | ambíguo demais |
| C4 | asymmetric relationship types | detectável, mas não conflitante |
| C5 | unresolvable `source_entry_id` | fora do escopo |
| C6 | disagreeing `confidence` | fora do escopo |
| C7 | alias with inverted window | **not-built-by-rule** |
| C8 | `person_projects` / `person_relationships` inverted window | sem ação disponível |

The stop condition — *"the detectable set turning out to be empty"* — does **not**
fire. A wider detector was available and is deliberately not here: **a family of
one that is true beats a family of six that is mostly guessing.**

**C7 is `not-built-by-rule` for a reason worth keeping.** The identical conflict
on `entity_aliases` is **already refused by the database**, by
`CHECK ((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))`,
read live from `pg_constraint`. The set is empty by construction and can only
ever be empty; a detector there would be a control that cannot fail.

**C8 is the one that could become implementable later** without new detection
work — if a future slice gives `person_projects.valid_from` an owner-facing
authority path, C1's shape applies to two more tables. It is excluded on
`2N-CONFLICT-005` grounds, not detection grounds.

## 3. Four measured facts, three of which correct or extend the re-audit

### 3.1 `memories` accepts an inverted window; its sibling refuses one

Read live from `pg_constraint`: `public.memories` carries four CHECKs —
`confidence`, `content`, `kind`, `sensitivity` — and **no validity check**.
`public.entity_aliases` carries one. Confirmed absent across **all 94
migrations**, not only the one that created the table.

### 3.2 `memories.valid_from` has **no writer anywhere in the product**

All 94 migrations, both Edge Function entrypoints, all of `src/`. Every
occurrence is a read. `createProposedMemory` and `updateMemory` write neither
timestamp; `setMemoryLifecycle` writes `valid_until` only, and only `now()` or
`null`.

**So an inverted window cannot be created through any product surface today, and
the expected population is zero.** This is recorded rather than smoothed: the
detector is a **read-time safety net over a column the product does not yet
write**, not a cleanup of data known to exist. A slice that implied otherwise
would be claiming something it cannot show.

### 3.3 The re-audit named a correction path that cannot perform the correction

`PHASE_2N_SLICE_4_REAUDIT.md` §1.3 says the owner *"corrects the dates through
`updateMemory`"*. `memoryUpdateSchema` carries **neither** timestamp
(`memories/schema.ts:61-70`, `.strict()`). The conclusion survives — an authority
path does exist — but the mechanism is `setMemoryLifecycle`.

### 3.4 The queue is welded to entries, and its reason vocabulary is enforced in Postgres

Neither fact is in the plan or the re-audit, and both shaped the design:

1. **Every row is entry-shaped.** `list_needs_attention` returns
   `{entry_id, reason, occurred_at, …}`; the title is hydrated from
   `entries.original_content`; `NeedsAttentionItemView.entryId` is **required**.
   A memory is not an entry, and `memories.source_entry_id` is
   `on delete set null`, so it may have none at all.
2. **A sixth tracked reason is a runtime `22023`.**
   `needs_attention_item_opened` validates `attentionReason` against a
   **five-member enum inside the database** (`202607170024:206-212`).

## 4. The correction action, and two rejected alternatives

**Chosen: `setMemoryLifecycle(transition: "restore")`.** It clears `valid_until`
to `null`, and a null half can never satisfy the predicate, so it resolves
**every** instance with no case analysis. Already exists, already audited
(`restore_memory`, with before- and after-state), already owner-scoped twice
over, already reachable from the memory detail page. No schema, no migration, no
RPC, no new authority.

**Rejected — `archive`.** It stamps `valid_until = now()`; if `valid_from` is in
the **future**, `valid_from > now()` still holds and **the window is still
inverted**. An action that resolves the conflict only for some rows is not an
action.

**Rejected — widening `memoryUpdateSchema` with the two timestamps.** It needs no
migration, no RPC and no new authority. It is refused on a **signed
requirement**: `2N-CORRECT-002` binds the phase to *"correcting stays distinct
from archiving — a correction changes what a memory says, archiving changes
whether it is in force"*, and `memories/schema.ts:72-79` already refuses raw
timestamps in writing. **2N.4 does not reverse a signed decision to make its own
item prettier.**

**On "not choosing a winner".** `2N-CONFLICT-002` forbids **implicit** precedence
in how a conflict is *represented*. The row shows **both** dates and states what
the action will change; the choice is the owner's, made by clicking a labelled
control — which is exactly what `2N-CONFLICT-003` calls an explicit user act. The
detector itself chooses nothing.

**On "refuse a new inverted window".** There is no validator to add, because
there is no input to validate. The refusal is **structural**, and a guard fails
the moment any code introduces a raw timestamp write. A validator on a field that
does not exist would be the vacuous control this phase refuses.

## 5. Requirement-by-requirement

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| `2N-CONFLICT-001` | **built** | `PHASE_2N_SLICE_4_CONFLICT_ENUMERATION.md`; 8 candidates, 1 implementable, 7 out **by name**; guard asserts the code's kind set matches the document and that all eight appear with a classification. |
| `2N-CONFLICT-002` | **built** | `conflict-detection.ts` — pure, no clock, no I/O, no provider, no embedding, no persistence. Both dates carried and rendered. No table, no lifecycle, no migration. Guards: zero `.rpc(`, zero write verbs, zero `confidence`, zero similarity, one table read. |
| `2N-CONFLICT-003` | **built** | `setMemoryLifecycle(restore)` — pre-existing, audited, owner-scoped. The item routes into the existing "Precisa de você"; the hosted journey follows the row's own action and completes the correction through the product's form. |
| `2N-CONFLICT-004` | **built** | Derived on every read; nothing marks it resolved because there is nothing to mark. Hoje's `pendingCount` covers heading, link, empty state and end-of-day summary; `deriveHomeOperationalStatus` takes `conflictCount` as a **required** parameter. |
| `2N-CONFLICT-005` | **built** | C2, C6 and C8 excluded **because** their only honest action would be "dismiss" or none. Guard asserts every derived conflict carries an action id and a non-empty href. |
| `2N-CONFLICT-006` | **built** | No notification is produced and push is not resumed. Discoverable at `/app` and `/app/inbox?view=needs-you`, proved on both in the hosted journey. |

**6 built · 0 baseline · 0 not-built-by-rule.** C7's `not-built-by-rule` is a
classification inside `2N-CONFLICT-001`'s enumeration, not a requirement verdict.

## 6. Proofs

### Local

| Suite | Result |
| --- | --- |
| `conflict-detection.test.ts` | **23** |
| `conflict-projection.test.ts` | **15** |
| `conflict-attention-item.test.tsx` | **18** |
| `conflict-queue.test.tsx` | **21** |
| `phase-2n-conflict-guard.test.ts` | **42**, with a mutation control per guard |
| `capabilities.test.ts` | +3 |
| `home-resilience.test.tsx` | 8 — now fails **five** projections in turn, not four |
| `contracts.test.ts` | extended, tracked subset still exactly five |
| Full suite | **7000 passed**, 3 failed files = the Windows-only shebang-parse baseline |
| `lint`, `typecheck`, `build`, `git diff --check` | clean |

Every required case is a named test: `from == until`, `from < until`,
`from > until`, only-`from`, only-`until`, both null, correctly archived,
correctly scheduled, unreadable instants, foreign, absent, duplicate, two
distinct memories, action available, bound reported, bound not reported, masked,
unmasked, keyboard focus, `<dl>` term/definition semantics, both locales, two
timezones.

### Hosted

**`online-phase-2n-conflicts.spec.ts` — 18/18**, 9 × desktop and 9 × Pixel 7,
both locales, **`--workers=1`**, **no `429` across the whole session**.

The fixture plants the inverted window directly, and that is the point rather
than a shortcut: per §3.2 no product path writes `valid_from`. The insert also
re-asserts the measured asymmetry live — **if a later migration adds the CHECK,
that insert fails**, which is the correct outcome and the correct place to learn
it.

Two pairings carry the file:

- **The correction runs end to end and the memory survives it.** Follow the row's
  action → perform the transition through the form → return → the item is gone →
  reload → still gone. Then a separate test opens the memory and asserts **its
  words are still there**. Without the pair, "gone from the queue" would be
  satisfied by a delete.
- **The cross-tenant control asserts the stranger sees THEIR OWN conflict first.**
  Without it, "does not see the owner's" would pass on a page that rendered
  nothing.

**Regressions:** M1 knowledge **12/12** (desktop + Pixel 7) · memories **6/6
desktop** · M3 deletion **7/7 desktop** · 2N.0 foundations **6/6 desktop**.

**Zero residue**, two probes, both with non-vacuous controls, run after every
hosted execution.

`test:remote:2n4:cleanup`'s control plants **two** rows — one with an inverted
window and one with none — and asserts the windowed probe finds the first and
**ignores** the second. Without the second row, a probe that silently dropped its
filter would still read 1 and look correct.

## 7. Defects found by this slice's own review, and where

**Two product defects, neither of which any test would have caught.**

1. **The row obeyed the wrong surface.** It hardcoded
   `presentationFor("attention", …)` while Hoje's governing surface is `"hoje"`.
   No visible defect today — the two carry identical rules — and that is what
   made it worth fixing rather than noting: the day they diverge, the row would
   obey the wrong one and **nothing would fail**. It now takes `surface` as a
   prop, as `NeedsAttentionItemRow` beside it already does, with three tests
   asserting the mechanism rather than a difference.
2. **The row shipped with six class names and no CSS.** It would have rendered as
   unstyled prose in a list of styled cards — something no unit test sees. Fixed
   by reusing `.question-block`'s shape, which is already this product's language
   for "something here needs you". The first draft reached for `--amber`,
   `--surface-muted`, `--muted` and `--border`; **`:root` defines none of them**.
   `experience.css` already references two of those without definitions, which is
   pre-existing and not this slice's to repair — but adding four more would have
   been copying a fault forward.

**Three guard defects, all the same class.** A scan for a generic token finds the
history of every phase that used the same word: `conflict` matched
`202607170021_fix_interpretation_timestamp_conflict`; bare `slice_4` matched
`202607220041_phase_2c_slice_4_…`; and a bare `valid_from` scan flagged four
correct files whose only sin is a type annotation. Each was **narrowed to what
discriminates** — a phase-qualified token, and the identifier inside a mutation
payload — **never weakened**, and each narrowing carries a control proving it
still refuses what it exists to refuse.

**One inherited guard caught this work correctly.**
`local-day-correction-convergence`'s zone-consumer count went 2 → 3 because a
third row type now renders an instant. Raised deliberately, with the three
consumers named so the number is a claim about the surface rather than a literal
bumped to go green.

## 8. Recorded, not smoothed

- **`online-memories.spec.ts:85` still fails on mobile** — a **21 px** touch
  target against a 44 px minimum, reproduced unchanged in this session. Cause:
  `.list-row-main a` carries no sizing rule on **any** list surface. **Not
  weakened, not skipped, not deleted, not absorbed.** Destination **`2N-MOBILE`**.
  Checked against the owner's criterion: the conflict surface **does not reuse
  the affected control** — the target is an `<a>` *inside* `.list-row-main` on the
  memories **list**, while the conflict row *is* an `<a class="list-row">` that
  *contains* a `.list-row-main` and has no nested anchor.
- **`needs_attention_viewed.itemCount` still counts entry rows only.** Redefining
  what an existing 2J metric measures is telemetry work; destination **2N.7**.
  The conflict row emits **no** product event at all.
- **The detector's expected population today is zero** (§3.2). It is a safety net,
  not a report.
- Mobile is a **viewport simulation**, not a device; **no screen-reader run is
  claimed**; the lane is a **local production build against hosted Supabase**.
  Because 2N.4 spends **no migration**, that lane is identical before and after
  the merge — which is why the hosted proof ran **before** it.
- **2N.2's 28-test project journey was NOT re-run.** It shares no contract this
  slice touches, and it is named here rather than implied by an unqualified
  "regressions pass".

## 9. Unchanged

Signup **closed**. Rollout **25 pass · 3 fail · 2 owner-signature**. Push **not**
resumed. **Phase 2O not started, not planned and not retargeted.** A13 still
guards the roadmap successor. Slices **2N.5, 2N.6 and 2N.7** remain.
