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

## The five `OD-2S-3` B added

**The owner signed B against this package's recommendation, and named these risks
in the same message.** They are modelled here because a decision taken over an
objection needs the objection turned into controls, not dropped.

### `T-2S-15` — a second authority over a task's status

**What could go wrong.** The notification surface acquires its own completion or
reschedule path — a Server Action, an RPC, or a direct write — and the product
has two places that decide what completing a task means. They then drift: one
learns about dependencies, undo compensation or project links and the other does
not.

**Why it is real here.** It is exactly what this package recommended against, and
the repository has met it before: `detail-controls.ts:66-71` declares
`RENDERED_ELSEWHERE` — `complete_task`, `reopen_task`, `set_status` — because
rendering them again *"would put two routes to one transition on one screen."*
The pull toward a second copy is strongest when the first one's props are
inconvenient, and here they are: `WorkItemActions` wants a `WorkItemView` a
notification row does not have.

**Mitigation.** `2S-ACT-003` and `2S-ACT-004` name the destinations.
`2S-TRUST-010` censuses every Server Action the surface dispatches to and
requires each to have existed before the phase — **and makes a new writer a stop
condition**, not a finding. `2S-CLOSE-013` re-proves it at closeout against slice
2S.0's recorded baseline, so the census cannot be satisfied by a writer added
halfway through and then described as pre-existing.

**Disposition: OPEN — planned. The item that carries `OD-2S-3` B's whole risk.**

### `T-2S-16` — one action applied twice

**What could go wrong.** A double tap on a phone, a retried dispatch, or a row
re-rendered under a pending action completes a task twice, reschedules twice, or
writes two suppressions.

**Why it is real here.** The inline row is denser than any surface that already
carries these verbs, and a compact menu invites repeat taps. The existing guard
is real but subtle: `work-item-actions.tsx:62-84` mints an operation key **per
(row, action) pair, in a ref, lazily** — never in the render body, because
`useActionState`'s pending→settled transition is itself a re-render and
StrictMode double-renders in development. A reimplementation that mints in render
would defeat it silently.

**Mitigation.** `2S-ACT-007` disables the control while pending **and** asserts a
forced double dispatch produces one write, by reading rows rather than by reading
the disabled attribute. `2S-TRUST-011` reuses and exercises the existing
idempotency refusal from this surface.

**Disposition: OPEN — planned.**

### `T-2S-17` — a stale control writing anyway

**What could go wrong.** The notice was rendered when the task was `inbox`; by
the time the owner taps *concluir* it is `cancelled`, or already completed, or
its due date moved. The control writes against a state that no longer exists.

**Why it is real here.** This surface's rows are **projections**, and the
projection is read at render time. `WorkItemActions` needs a `WorkItemView` the
notification row must build, so the gap between what the control believes and
what the row is can be arbitrarily long — a notification page left open is the
normal case, not the edge one.

**Mitigation.** The refusal already exists: `applyTaskDetailCommand` returns
`stale_pre_state` with `refreshable: true` (`detail-actions.ts:199`).
`2S-TRUST-012` requires it to be reached **from this surface**, with a row changed
underneath a rendered control — an existing guard that has never been fired from
a new caller is an assumption, not a control. `2S-ACT-005` narrows the window by
deriving eligibility from `isEligibleStatus`, and `2S-ACT-008` requires the
refusal to carry the reload it needs.

**Disposition: OPEN — planned.**

### `T-2S-18` — an undo that reports success and restores nothing

**What could go wrong.** The row offers *desfazer*, the affordance reports
success, and the task is not restored — or the ledger row is never marked
`undone`, so the operation stays replayable.

**Why it is real here.** This is not hypothetical in this repository.
**`2R-UNDO-LEDGER-NOT-CLOSED` is a live example**: `private.undo_apply_reminder_command_v1`
never sets `status = 'undone'`, so a Phase 2P reminder-command undo stays
replayable for 24 hours and the router's idempotent branch is unreachable for it.
It shipped because `undo_operation_routing.sql` asserted nothing about `status`.
Offering an undo from a new surface multiplies the number of places that defect
can hide.

**Mitigation.** `2S-ACT-009` requires the affordance to be the one the Work
surfaces already mount, exercised against the database. `2S-TRUST-013` requires
every undo to be followed by a read of **the ledger row and the restored
subject** — a control reporting success with no ledger row is a defect, not a
finding.

**Disposition: OPEN — planned.**

### `T-2S-19` — the two surfaces diverging

**What could go wrong.** `/app/notifications` and *Precisa de você* offer
different verbs, or the same verb with different meanings, or one reflects an
action the other does not. The owner learns two products.

**Why it is real here.** `OD-2S-3` B and `OD-2S-5` B were signed together, so the
same six verbs must exist in two places — and the cheapest way to build the
second is to copy the first. The owner named this risk directly: *"mesma
semântica na página de Notificações e dentro de 'Precisa de você'"* and *"não
duplicar o mesmo assunto nas duas fontes da projeção de atenção."*

**Mitigation.** `2S-ACT-011` reads the verb set and its copy from **one** source
and asserts equality across both surfaces — a verb present in one and absent from
the other fails. `2S-ATTENTION-008` requires an action taken in one to be
readable from the other. `2S-ATTENTION-002` keeps a subject arriving from two
sources from being shown twice, with a control that **plants both**.

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

**Nineteen threats, all OPEN — planned. Zero closed, and none may be reported as
closed before slice 2S.4 re-dispositions each against what was actually built.**

**Five of the nineteen exist because the owner overrode a recommendation.**
`OD-2S-3` B was signed deliberately, and the objection it overrode is not
discarded — it is `T-2S-15` … `T-2S-19`, each with a requirement and, in one
case, a stop condition.

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
| `T-2S-15` | **a second authority over a task's status — the item that carries `OD-2S-3` B's whole risk** |
| `T-2S-16` | one action applied twice |
| `T-2S-17` | a stale control writing anyway |
| `T-2S-18` | an undo that reports success and restores nothing |
| `T-2S-19` | the two surfaces diverging |

**What would have to happen for any of these to close:** its mitigation must
exist in merged code, and a test or a person must have **exercised** it. Slice
2S.4 re-dispositions each against what was built. Until then this table is the
disposition, and it says OPEN.

---

## Re-disposition at closeout — slice 2S.4, 2026-08-27

`2S-CLOSE-007`: **a threat closes only when its mitigation exists AND has been
exercised.** Existing is not enough, and a green pipeline is not an exercise.

**Eighteen CLOSED · one CARRIED · one RAISED.** Nothing here closes on a document.

| threat | disposition | what exercised it |
|---|---|---|
| `T-2S-1` a suppression crossing an owner boundary | **CLOSED** | RLS enabled **and forced**, four owner-scoped policies, `service_role` revoked on all seven privileges — read from the deployed project — and slice 2S.1's hosted proof reached the cross-tenant path and got `REFUSED(42501)` rather than an empty result |
| `T-2S-2` a silence that silences too much | **CLOSED** | The four scopes exercised **one at a time**, with the other three subjects of change read after each; a null `notice_type` suppresses the subject and a value narrows to one kind, so silencing the daily nag does not silence a genuinely overdue warning |
| `T-2S-3` a cadence rule that does not terminate | **CLOSED, and exercised in production** | The ladder read from `pg_get_functiondef(run_user_heartbeat)` — `0 → send`, `1 → +1d`, `2 → +3d`, `3 → +7d`, `else → false` — and observed on real rows: **3 per day for eighteen unbroken days, then zero for three**, with the producer still running and the subjects unchanged |
| `T-2S-4` the heartbeat's existing rules silently weakening | **CLOSED** | Quiet hours, the daily cap, the 24-hour floor and the per-user lock re-proved by **calling** the function in pgTAP rather than matching substrings against `prosrc`; the floor re-read as unmoved in the deployed definition at closeout |
| `T-2S-5` content leaking into a suppression store | **CLOSED** | The one new store's columns enumerated from the deployed database: a subject reference, a scope, an expiry, an actor and the owner's own `reason`. **No column a title or body could occupy** |
| `T-2S-6` a disposition whose copy and behaviour disagree | **CLOSED** | The verb set, its copy and its eligibility read from one vocabulary that both surfaces import; `phase-2s-verb-authority.test.ts` reads the import graph and its surface list is **derived** from the tree with at least two members asserted |
| `T-2S-7` an undo that does not restore | **CLOSED** | Every undo followed by a read of the ledger row **and** of the restored subject |
| `T-2S-8` the attention surface double-counting | **CLOSED** | `queueSize` read by both the count and the list; the collapse is by subject; and the hosted lane rendered **three notices about two subjects as two rows** with the heading's number equal to the rows under it |
| `T-2S-9` the migration widening authority | **CLOSED** | A seven-way `has_table_privilege` probe on the deployed project returns false for `service_role` on every privilege; the migration **revokes** explicitly, because `alter default privileges` grants four nobody asked for |
| `T-2S-10` silence mistaken for autonomy | **CLOSED** | Nothing this phase built reads `eligible` or any automation category state, and `automation_category_policies` was re-read at closeout **whatever its row count** — it holds zero |
| `T-2S-11` silent spend — the credential is active | **CLOSED** | Zero AI calls by this phase, and it is a **live** refusal: the BYOK credential is `active`, so a call was possible. The two `ai_usage_events` rows inside the checkpoint window are the product's extraction and embedding of a capture **the owner made**, itemised in slice 2S.3 §11 rather than absorbed |
| `T-2S-12` push reported as working | **CLOSED** | Refusal 18 forbids the **claim** and not the word, so *"push is still not working"* stays sayable; the detector is two-sided, and `notification_deliveries` still holds zero |
| `T-2S-13` a hardware proof discharged by a document | **CLOSED** | Refusal 15 refuses `2S-MOBILE-003` classified without an owner device session, **and** a person held it on their own iPhone on 2026-08-27 against the deployed build |
| `T-2S-14` the successor phase starting by accident | **CLOSED** | Refusal 16 checks all three shapes — a `2T-*` declaration in the PRD and both `phase-2t` directories — and the A13 detector still refuses a start signal |
| `T-2S-15` a second authority over a task's status | **CLOSED** | Refusal 20 reads the handler bundle from the tree and compares it against slice 2S.0's merge commit `39bb4b8`: four writers present, one absent and authorized. **This is `OD-2S-3` B's whole risk, and it is an exit code rather than a review note** |
| `T-2S-16` one action applied twice | **CLOSED — and it was NOT closed until this slice** | The closeout found that nothing in the feature named `operationKey` at all. Two exercises were written: a retry after a thrown round carries the **same** key, and a terminal outcome **rotates** it. Two mutation controls, two failures. See the slice record §6 |
| `T-2S-17` a stale control writing anyway | **CLOSED** | The pre-existing `stale_pre_state` refusal is reached **from this surface** and rendered as the reload affordance rather than a generic failure |
| `T-2S-18` an undo that reports success and restores nothing | **CLOSED** | The undo offer comes straight from the database's own answer and is never constructed in the row; a disposition with no compensation row offers none |
| `T-2S-19` the two surfaces diverging | **CARRIED, narrowed** | Both mechanisms are in place — one projection read by all three surfaces, and every writer invalidating all three routes — and slice 2S.3 found `/app/inbox` missing from **both** writers and added it. What is **not** exercised is divergence under real use: `read`, `dismissed` and `notification_suppressions` are all **zero** in production, so no owner has yet acted on one surface and looked at another. Destination: the open item *a notice answered in real use* |
| **RAISED at closeout — not one of the nineteen** | **carried, and it is an owner question** | The ladder's terminal branch means a subject nobody answers eventually goes **silent forever until it changes**. That is `OD-2S-4` A working as signed, and it is also the state three real tasks are in right now: stale since 2026-07-30, and the product no longer mentions them. Not a defect and not a closure — **an owner decision about whether silence is the right end state**, recorded here rather than left for someone to rediscover |

**One carried and one raised, and neither quietly.** `T-2S-19` needs use, not a
test. The raised item needs the owner, not a fix.

**A threat closed by reading its mitigation is a threat nobody tested — and
`T-2S-16` spent this whole phase in that condition.**
