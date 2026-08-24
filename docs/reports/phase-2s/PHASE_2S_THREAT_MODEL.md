# Phase 2S — threat model

**Written before any code exists**, against the requirement set in
[`PHASE_2S_PRD.md`](../../initiatives/phase-2s/PHASE_2S_PRD.md).

**A threat closes only when its mitigation exists *and has been exercised*.**
Phase 2R's ADR-132 disposition closed none of its twelve for exactly that reason,
and slice 2R.5's re-disposition against what was built closed ten. That standard
holds here: **every threat below is OPEN.** No document produced during planning
may report otherwise.

---

## The threats

### `T-2S-1` — a suppression crossing an owner boundary

**What could go wrong.** One owner silences another owner's notices, or reads
that they did.

**Why it is real here.** `OD-2S-1` option A is a **polymorphic** table —
`subject_type` + `subject_id` — and this repository has already learned that
*a relationship row's own `user_id` is never sufficient proof of ownership*.
`entry_entities`, `entity_attachments` and `entity_tags` all validate by trigger
for precisely this reason.

**Mitigation.** `2S-SILENCE-005`, `2S-TRUST-004`. Composite FK where the relation
permits it; **ownership validated by trigger** where it is polymorphic; RLS
enabled **and forced**; an owner-scoped policy with an explicit role list, because
a policy with no role list is `PUBLIC`. The negative control **plants a second
owner's row first**, so the refusal is not vacuous.

**Disposition: OPEN — planned.**

### `T-2S-2` — a silence that silences too much

**What could go wrong.** The owner asks for quiet about one task and stops
hearing about a genuine obligation — a due reminder, an overdue task, a different
subject entirely.

**Why it is real here.** This is the phase's **product** risk rather than its
security risk, and it is worse than the defect it replaces: an unstoppable nag is
annoying; a silence that swallows a real due date is a broken promise.

**Mitigation.** `2S-SILENCE-001` scopes a suppression to a **subject and a notice
type**, never to a channel. `2S-CADENCE-008` requires that a silenced subject
remains present in the attention surface — **silence is a change of channel,
never a deletion.** `2S-ACCESS-002` requires the owner be told what stops, and
for how long, before it stops.

**Disposition: OPEN — planned. The most important item in this model.**

### `T-2S-3` — a cadence rule that does not terminate

**What could go wrong.** A backoff computed from the ledger loops, grows without
bound, or is evaluated per-notification inside an hourly function that already
holds a per-user lock.

**Why it is real here.** Phase 2R found the same class twice: an operator every
reviewer would have approved was wrong twice, and the next-instant search had to
be made to **raise** rather than loop.

**Mitigation.** `2S-CADENCE-002` — bounded, terminating, and the ceiling
**asserted** rather than assumed. The rule is proved by calling the function
across simulated days, not by reading it.

**Disposition: OPEN — planned.**

### `T-2S-4` — the heartbeat's existing rules silently weakening

**What could go wrong.** Changing `run_user_heartbeat` breaks quiet hours, the
daily cap, the 24-hour cooldown, the per-user lock, or the property that one
user's failure does not block the batch — and nothing notices, because the
function is large and its tests are about the thing being added.

**Why it is real here.** The function has been **deliberately untouched since
Phase 2M**, across five phases. `OD-2S-9` A is the decision to touch it.

**Mitigation.** `2S-CADENCE-004` … `-007`, each proved by **calling**
`run_user_heartbeat` and reading what it did. Slice 2R.1 matched two substrings
against `pg_proc.prosrc` and proved nothing about behaviour; slice 2R.4 called
the function twenty-six times and found a real defect in its own assertion.
**Reading the source is not a proof and may not be recorded as one.**

**Disposition: OPEN — planned.**

### `T-2S-5` — content leaking into a suppression store

**What could go wrong.** A suppression row acquires a title, a body, or a task
description "to make the surface easier", and notification content gains a second
home with a different retention class.

**Mitigation.** `2S-TRUST-006` — the row has **no column capable of holding
content**, re-derived from `database.types.ts` on every run so a future migration
**breaks the guard** rather than silently invalidating the claim. The shape
`no-durable-audio-guard.test.ts` already uses.

**Disposition: OPEN — planned.**

### `T-2S-6` — a disposition whose copy and behaviour disagree

**What could go wrong.** `dismissed` gains a button labelled *"não me avise
mais"* while the behaviour is *"hide this one row"*, or the reverse. The product's
own copy already assigns `dismissed` a meaning elsewhere.

**Why it is real here.** This repository has the finding written down: *read the
product's own copy before assigning meaning* — `dismissed` explicitly means
"without answering" in the question flow.

**Mitigation.** `2S-ANSWER-002` and `-003` — the sentence is checked against the
behaviour, in both locales, and read and dismiss must be two controls with two
outcomes and two sentences.

**Disposition: OPEN — planned.**

### `T-2S-7` — an undo that does not restore

**What could go wrong.** Lifting a suppression leaves the cadence state where the
suppression put it, so undoing the silence does not restore the schedule.

**Why it is real here.** Phase 2R found an undo whose **ordering** was wrong, by
writing the test. And `2R-UNDO-LEDGER-NOT-CLOSED` is a live example of a handler
that never marks itself `undone`, so its replay guard is unreachable.

**Mitigation.** `2S-TRUST-002` and `2S-SILENCE-006` — a registered handler,
**exercised** against the database, with a replay proved refused and the ledger
row proved to move.

**Disposition: OPEN — planned.**

### `T-2S-8` — the attention surface double-counting

**What could go wrong.** A task appears once from the attention list's own source
and once from a notice about it, and the owner sees the same obligation twice —
in the very surface the phase exists to make trustworthy.

**Mitigation.** `2S-ATTENTION-002`, with a control that **plants both** rather
than asserting a de-duplication over a set where only one source ever fired.
`2S-ATTENTION-003` derives the count; `2S-ATTENTION-004` reaches the empty state
only after planting rows, so a zero that could never be false would fail.

**Disposition: OPEN — planned.**

### `T-2S-9` — the migration widening authority

**What could go wrong.** A new table arrives with a permissive grant, an RLS
policy with **no role list** (which is `PUBLIC`), or a definer function that
passes FORCE RLS without validating its caller.

**Mitigation.** `2S-TRUST-003` — a grant census that **refuses an unenumerated
object by name**; Phase 2R's census found a real naming defect that way.
`2S-TRUST-004` for RLS and policy shape. Any `SECURITY DEFINER` sets an explicit
safe `search_path` and validates caller and owner.

**Disposition: OPEN — planned.**

### `T-2S-10` — silence mistaken for autonomy

**What could go wrong.** A suppression is read as the product *deciding* not to
tell the owner something, and the automation vocabulary is widened to cover it —
or worse, a stored automation consent is read as permission for it.

**Why it is real here.** Phase 2R shipped the product's first unattended writer
and stayed safe by a **structural** choice, not by vigilance: materialisation was
a trigger fired by a completion, so it was never an automation. The same
discipline applies. And the owner has **already consented** to
`automatic_when_eligible` for `task` and `person` once — that consent is a stored
fact, currently absent from the table but demonstrably reachable.

**Mitigation.** `2S-TRUST-009` — nothing in this phase reads `eligible`, and the
record re-reads `automation_category_policies` **whatever its row count**. A
suppression is the **owner's** decision, recorded with the owner as actor
(`2S-TRUST-001`), never the product's.

**Disposition: OPEN — planned.**

### `T-2S-11` — silent spend

**What could go wrong.** A surface that summarises or ranks notices reaches for a
model, and the owner's credential is spent without a decision.

**Why it is real here.** The credential is **active** and validated — audit §5.1.
Phase 2R could rely on there being nothing to spend; this phase cannot.

**Mitigation.** `2S-TRUST-007` — zero AI calls, zero credential spend, asserted
against `ai_usage_events` gaining no row attributable to this phase. Every rule
in this phase is deterministic; no path needs a model.

**Disposition: OPEN — planned.**

### `T-2S-12` — push reported as working

**What could go wrong.** A document says the owner "will now be notified", and a
reader concludes push was repaired. `notification_deliveries` is **zero** and the
403 is untouched.

**Why it is real here.** The phase is *about notifications*. Every sentence it
produces is a candidate for this error, and Phase 2R had to build a guard that
refuses the **claim** rather than the word — because forbidding "push" outright
also forbids saying it does not work.

**Mitigation.** `2S-TRUST-008` — a guard that refuses a sentence asserting push
works, while permitting a sentence refusing it. **A guard that forbids the word
instead of the assertion is not a guard, it is a gag.**

**Disposition: OPEN — planned.**

### `T-2S-13` — a hardware proof discharged by a document

**What could go wrong.** `2S-MOBILE-003` or the closing checkpoint is recorded as
satisfied by CI, by an emulated project, or by a written record.

**Why it is real here.** Phase 2R's device checkpoint took **three runs**: the
first found two defects, the second found three more **under a fully green
pipeline**, one of which would have written one weekday where the modal displayed
three. The green pipeline is precisely when the wrong claim is easiest.

**Mitigation.** `2S-MOBILE-003`, `2S-CLOSE-009`, `2S-CLOSE-010`. A person with
the device. No automated lane is offered as a substitute at any point — not
jsdom, not the CI journeys, and explicitly not an emulated WebKit project, which
is not an iPhone.

**Disposition: OPEN — planned.**

### `T-2S-14` — the successor phase starting by accident

**What could go wrong.** A file, a requirement declaration or an accepted ADR
starts the next lettered phase before the owner authorizes one.

**Why it is real here.** This package **retargets A13**, and audit §8 found that
one of its four signals had never matched a real declaration.

**Mitigation.** `2S-CLOSE-011`; the retargeted A13 detector with its **repaired**
signal 2 and a two-sided control; the traceability generator's successor refusal;
and the declaration guard's forbidden successor directories.

**Disposition: OPEN — planned.**

---

## Inherited properties this phase must not weaken

Named so that a regression is a **failure**, not a discovery.

- Forced RLS and least-privilege grants on every user-owned table.
- The heartbeat's quiet hours, daily cap, 24-hour cooldown, per-user lock, and
  batch failure isolation.
- Append-only audit, ledger and `product_events`, written only through their
  documented RPCs.
- Every automatic action auditable; every reversible one undoable; every
  irreversible one confirmed.
- User content is untrusted data, never instructions.
- No durable audio.
- Signup closed; the rollout gate unchanged.
- Migration parity: local = hosted, always.

---

## Summary

**Fourteen threats, all OPEN — planned. Zero closed, and none may be reported as
closed before slice 2S.4 re-dispositions each against what was actually built.**

| threat | one line |
|---|---|
| `T-2S-1` | a suppression crossing an owner boundary |
| `T-2S-2` | **a silence that silences too much — the most important item here** |
| `T-2S-3` | a cadence rule that does not terminate |
| `T-2S-4` | the heartbeat's existing rules silently weakening |
| `T-2S-5` | content leaking into a suppression store |
| `T-2S-6` | a disposition whose copy and behaviour disagree |
| `T-2S-7` | an undo that does not restore |
| `T-2S-8` | the attention surface double-counting |
| `T-2S-9` | the migration widening authority |
| `T-2S-10` | silence mistaken for autonomy |
| `T-2S-11` | silent spend — and the credential is **active** |
| `T-2S-12` | push reported as working |
| `T-2S-13` | a hardware proof discharged by a document |
| `T-2S-14` | the successor phase starting by accident |

**What would have to happen for any of these to close:** its mitigation must
exist in merged code, and a test or a person must have **exercised** it. Slice
2S.4 re-dispositions each against what was built. Until then this table is the
disposition, and it says OPEN.
