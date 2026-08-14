# Phase 2N slice 2N.7 — the M2 verdict: **the allocation closes UNSPENT**

Written **before any migration**, because `2N-METRICS-002` makes M2 conditional:
it is spent *"only if real producers and consumers are specified and
delivered"*, and if they are not, **M2 closes unspent and the dependent
requirements close `not-built-by-rule`.** The plan states the standard in terms:

> An unspent allocation is not a defect; **a migration created to use one up
> fails the close.**

This document is the measurement that decides it, and the census that grounds
the measurement. It declares no event and creates no migration.

## 0. Baseline

| Fact | Value |
| --- | --- |
| `main` | `5dfd837`, clean, CI green on all three job families |
| Migrations | **94 local = 94 hosted**, parity **`202608140094`**, read live read-only |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 is the last allocation** · a fourth is a **STOP CONDITION** |

---

## 1. The producer census, measured tree-wide

**Every one of the 39 declared event names has a producer.** There is no inert
telemetry in this repository today.

| Where the producer lives | Count |
| --- | --- |
| A component helper mounted by a real surface (`interaction-events.tsx` → a page or feature) | 20 |
| A direct call in a Server Action | 18 |
| The push Edge Function (`send-push/deliver.ts`) | 1 |

**The census had to read `supabase/functions/` as well as `src/`**, and that is
worth recording: `capture_processing_completed`, `capture_processing_failed` and
`processing_retry_requested` exist **only** in the Deno worker. A census scanning
`src/` alone would have reported three orphans and been wrong about all three.

## 2. The consumer census, and the finding that reframes the slice

The consumer pattern this repository has used four times is a **funnel reader
script**: `phase-2f-command-funnel-reader.mjs`, `phase-2j-experience-funnel-reader.mjs`,
`phase-2k-conversation-funnel-reader.mjs`, `phase-2m-daily-cycle-funnel-reader.mjs`.

**No product surface reads `product_events` at all.** `/app/costs` reads
`ai_usage_events`; `/app/history` reads `audit_logs`. The entire consumer side of
this vocabulary is operator scripts.

And Phase 2M's own acceptance records what happened the first time anybody ran
them (`PHASE_2M_SLICE_02_ACCEPTANCE.md` §5):

> **All three funnel readers died at `createClient`.** … This is the **third**
> defect in that file and, like the two before it, it had never fired — because
> nothing had ever run it. **"Corrected" is not the same as "runnable".**

They were fixed and executed, and the same record is equally careful about what
that proved:

> each ran as a **freshly minted disposable owner** … so each reports zero events
> *for that owner*. That proves **executability and the exit-code contract**. It
> does **not** measure the real owner's funnel, and this record does not claim it
> does.

**So in this product's entire history, no funnel reader has ever read a single
real event belonging to a real owner.** That is not, by itself, an argument
against telemetry — events land before producers by design. It is the context in
which a fifth vocabulary has to justify itself.

The rest of that context, read from the repository rather than assumed:
`enable_signup = false` in `supabase/config.toml`, and the rollout gate stands at
**25 pass · 3 fail · 2 owner-signature**, refusing to open. **The population is
one owner, who is also the developer.**

---

## 3. The candidates, each tested against `2N-METRICS-003`'s nine parts

`OD-2N-15` **A** requires each event to carry a product question, a producer, a
consumer, a surface, closed properties, a justification, a forbidden-content
test, a planned hosted proof, and a cleanup and zero-residue proof. **An event
missing any one is not declared.**

Six candidates were derived from the phase's own stated purpose — the plan's
`§6.2` names it: *"whether anyone inspects, corrects or removes what the Brain
knows"*. Each is steelmanned before it is refused.

### C1 — `knowledge_surface_viewed` · *does anyone open a contextual page?*

Producer, surface, closed properties and a hosted proof are all straightforward:
five surfaces, a `subjectKind` enum, no id.

**Refused on the part it fails: the answer changes no decision.** There is no
pending question in this repository whose resolution depends on whether the
person page is opened. With one owner who is the developer, "did I open it" is
answered by remembering, and no roadmap item, remainder or owner decision waits
on the number.

### C2 — `knowledge_correction_applied` · *does the owner correct or remove?*

**Refused because a better instrument already exists and is the authority.**
`audit_logs` **already records every one of these** — actor, `action_type`,
`entity_type`, `entity_id`, reason and timestamp — append-only, **retained
forever by decision** (`202608050077:45`, SH-RETENTION-006), and already rendered
by `/app/history`. Deletion, undo, conflict resolution and entity edits all write
it; slice 2N.6's own origin proof reads it.

A telemetry event here would be a **second, weaker copy of a ledger that is
already authoritative** — and drift between copies is precisely the anxiety
`2N-METRICS-006` exists to name.

### C3 — `protected_content_revealed` · *is masking costing the owner access?*

This is the strongest candidate and the only one with **no better instrument**: a
reveal is local and transient and leaves no row anywhere.

**Refused on privacy, not on value.** OD-2J-1 made the reveal *local and
transient* deliberately: `RevealState` has **no persisted form and no
serializer**, and `sensitivity/contracts.ts` says a future phase wanting a
durable one *"must add a preference contract and amend OD-2J-1 — it cannot
arrive by someone storing this in `localStorage`."* Recording that a reveal
happened would create a **persisted trace of an act a signed decision defined as
leaving none**, by a different door.

And the payload itself is the problem. A reveal event is, by existing, the
statement *"this owner keeps `highly_sensitive` content on surface X and looked
at it."* `2N-METRICS-004` forbids **"any identifier that functions as
content"**, and a per-surface reveal count is a fingerprint of where an owner's
protected content lives. This phase does not add that.

### C4 — `relation_origin_unattributable` · *how large is the `2N-RELATION-TRIGGER` defect?*

A real, pending, owner-facing decision — the strongest kind of justification
telemetry can have.

**Refused because a query answers it exactly and telemetry answers it worse.**
The count of live `person_projects`/`person_contexts` rows without an
`associate_*` audit row is one owner-scoped read, available **today**, with no
migration and no vocabulary. Telemetry would sample only the rows that happened
to be **rendered**, which is a strictly worse estimate of the same number.

### C5 — `entity_link_absent` · *how much demand is there for `2N-FILES-WRITER`?*

**Refused for the same reason.** `select count(*) from entity_attachments`
answers it exactly and immediately. An event counting empty states measures how
often a page was opened, not how much the writer is wanted.

### C6 — `deletion_undo_used` · *is the 24-hour undo window right?*

**Refused because `undo_operations` already records it** — every registered undo,
with its window — and the compensation writes `audit_logs` as well. Two existing
authorities already hold the answer.

---

## 4. The verdict

**No candidate survives `2N-METRICS-003`.** The refusals fall into three classes,
and none of them is *"we could not be bothered"*:

| Class | Candidates |
| --- | --- |
| A **better instrument already exists and is the authority** — `audit_logs`, `undo_operations`, or a direct owner-scoped query | C2, C4, C5, C6 |
| The answer **changes no pending decision** | C1 |
| Recording it would **contradict a signed privacy decision** | C3 |

> ## M2 CLOSES UNSPENT.

`2N-METRICS-001`, `-002`, `-003`, `-004`, `-005` and `-007` close
**`not-built-by-rule`** against `OD-2N-15` A's own conditional.

**`2N-METRICS-006` closes `baseline`, not `not-built-by-rule`.** Its invariant —
the three vocabulary copies move together or the change is rejected — **is
already asserted tree-wide** by `src/lib/closeout/phase-2m-telemetry-guard.test.ts`,
which checks that the migration chain admits every event name and every surface
the application declares and gives every name a property branch. The property
holds and is enforced; it was delivered by Phase 2M, and Phase 2N may not claim
it.

### Two corrections this measurement makes to the inherited record

1. **There are three vocabulary copies to move, not four.**
   `private.record_product_event` no longer carries its own frozen allowlist —
   `202608090089:143` re-declares the writer with the list *"deliberately gone"*,
   so the table's constraint is the single authority. A slice budgeting for a
   writer change would be budgeting for work that no longer exists.
2. **The producer side of this repository is healthy.** The phrase *"inert
   telemetry"* attaches to a moment in Phase 2K's history, not to the tree: all
   39 declared names have producers today, measured across `src/` **and** the
   Deno worker.

**Nothing in this document is implemented. No migration is created, no event is
declared, no vocabulary copy is touched, and M2 remains unspent and
non-transferable.**
