# Phase 2M — traceability contract

**Status:** governing artifact. Planning authorized by **ADR-104**;
implementation through closeout by **ADR-105**, which signed all seven
decisions. It defines what the closeout generator must **refuse**. No generator, no matrix and no acceptance record may be created
before its gate; this document only fixes the rules they will be held to.

---

## 1. The generator's operating rule

The classification is **regenerated from the slice acceptance records**, never
typed into a report. A count that appears in prose must be derivable from the
declarations, and a count that cannot be derived is a defect regardless of
whether it happens to be correct.

The declaration shape is the repository's:

```
- **2M-FAMILY-000:** …
```

Family names contain **no digits** — the reason `2K-A11Y` was invisible to every
prose count and to the phase-start detector, and the reason this phase's
accessibility family is named `2M-ACCESS`.

Every declared requirement resolves to exactly one of:

`built` · `baseline` · `partial` · `not-built-by-rule` · `undelivered`

**`undelivered` is a real outcome.** A generator that cannot produce it is not
fail-closed; it is a generator that always agrees with the phase.

---

## 2. The refusals

### R-01 — An unclassified requirement
A declared requirement with no classification fails the close. Silence is never
`built`.

### R-02 — A duplicated requirement
The same identifier classified twice, or declared twice, fails — including
across two slice records.

### R-03 — A requirement with no resolvable evidence
A classification pointing at nothing a reader can open — no file, no test, no
recorded reading — fails.

### R-04 — A `partial` with no remainder or no destination
A `partial` must state **what is still owed** and **where it goes**.

### R-05 — A vacuous `partial`
Refused explicitly, and the refusal **quotes the words that made it vacuous** so
the row cannot be edited away without noticing what is being edited. All of the
following are vacuous, and enumerating the phrasings is the mechanism — a single
pattern is reworded around:

- `remainder: none`
- a remainder that says nothing is pending / nothing is outstanding / nothing is
  owed / nothing remains
- a remainder that points only at an already-complete record
- a remainder that restates the requirement instead of naming what is missing

A row with nothing outstanding is `built`. **No remainder may be invented to
preserve a count.**

### R-06 — A destructive operation with no contract
A destructive or irreversible operation classified `built` without an explicit
pre-execution confirmation and a stated irreversibility fails.

### R-07 — A bulk action with no partial-result truth
Any multi-item operation classified `built` without a truthful partial result —
naming what did not change and why — fails.

### R-08 — Telemetry carrying content
Any declared event whose property whitelist admits a key that could hold a
title, a description, a name, free text, or a user-chosen value that identifies
an item, fails.

### R-09 — A declared event with no writer
An event named in a document, in the vocabulary, or in a closing claim, with no
producer that actually emits it, fails. A vocabulary entry is not a producer.

### R-10 — A declared event with no consumer
An event with a producer and no reader that asks a question of it fails. This
repository has recorded a producer with no consumer staying invisible for weeks.

### R-11 — A producer that predates its migration
Any producer whose first commit precedes the migration that admits its event or
its surface fails, whatever the final state.

### R-12 — A vocabulary with an unenumerated enforcement point
A telemetry claim that reports a **count** of enforcement points rather than
their **names** fails. The names at this baseline are the event-name CHECK,
`private.validate_product_event_properties`, `productEventNames`, the surface
CHECK, and `productSurfaces`.

### R-13 — A migration outside the budget, or in the wrong destination
The budget is **`3 allocated`, NON-TRANSFERABLE** after ADR-106: migration 1 is
the telemetry vocabulary and the `calendar` surface; migration 2 is notification
consent, subscription and delivery; migration 3 is **`clear_planned` and nothing
else**, authorized by ADR-106 on the stop condition slice 2M.1 raised **before**
slice 2M.2 was started. Three failures, each separately:

- a **fourth** migration, in any form;
- any of the three carrying another's contents — migration 1 carrying consent or
  subscription schema, migration 2 carrying vocabulary, or **migration 3
  carrying any verb, table, column, policy, grant, role or vocabulary other than
  `clear_planned`** — capacity is not fungible between them, and ADR-106
  explicitly does not reallocate migration 2;
- migration 2 carrying **any** content-bearing column: a task title, a
  description, a name, record content, user-supplied notification text or a
  free-form payload column.

The budget is reconciled against the migrations actually in the tree — not
against the plan's intention. `2 allocated · 2 spent` is the expected close only
if both were genuinely necessary and applied; a migration created to use up an
allocation fails.

### R-14 — A hosted claim that was not executed
Any claim about the hosted project — parity, deployment, a live reading — that
was not executed fails. A parity claim carries the date of its reading.

### R-15 — A real-device claim that was not executed
A claim about permission flow, delivery, foreground/background/lock-screen
rendering, quiet-hours behaviour on a device, or a screen-reader session, that
was satisfied by an emulator, a viewport or a mirror, **fails**. The two
permitted records are *executed* (with device, OS, browser, date and
observation) and *not executed*.

### R-16 — A notification without consent
Any delivery claim classified `built` without an explicit consent record, a
recorded time and a working revocation fails.

### R-17 — A payload with unauthorized content
OD-2M-4 signed push **content-free**. Any payload leaving the application
carrying a title, a description, a person, a project, an entry, or any content,
fails — regardless of the classification claimed. So does a VAPID private key
reachable from a client, a delivery record carrying content, a permission prompt
raised without an explicit user action, and any `service_role` client on a
product path.

### R-18 — A timezone claim with no proof
A timezone, day-boundary or DST claim classified `built` without a test that
executes across the transition, in both directions, fails.

### R-19 — Recurrence, in any form
OD-2M-7 signed recurrence **out of Phase 2M**. The family closes
**not-built-by-rule** against that signature, with a named destination — never
`partial`, never `built`, never `undelivered`. Any recurrence-shaped artifact
fails the close: a `recurrence` field, a series table, an occurrence table, an
exception model, a repeating rule, preparatory UI or a preparatory event. The
existing deterministic refusal must still hold, asserted by test.

### R-20 — A gesture with no visible alternative
Any gesture-reachable action without an equivalent visible, labelled control and
a keyboard path fails, whatever OD-2M-6 signed.

### R-21 — An accessibility claim with no lane entry
An accessibility requirement classified `built` with no CI lane entry and no
source-derived mirror fails.

### R-22 — A limitation classified as a pass
A known limitation recorded as `built` fails. `not-built-by-rule` and `partial`
exist for this.

### R-23 — A classification contradicting a signed decision
A classification that contradicts OD-2L-1 … OD-2L-5 or OD-2M-1 … OD-2M-7 fails,
including a `built` that was only achievable by doing what a decision refused.

### R-24 — A control with no consumer
Any user-facing control — a setting, a toggle, a time field — classified `built`
while nothing reads it fails. The five inert scheduling preferences are the
reason this rule exists.

### R-25 — A residual closed by writing a file
A residual whose only evidence is a document that mentions it fails. A residual
is closed by executing something or by being handed to a named destination.

### R-26 — A successor phase started
Any successor governing artifact, declared successor requirement, accepted
successor ADR, or successor-marked implementation file fails the close. The
phase-start guard is retargeted **only** by the successor's own authorizing
commit.

### R-27 — A count that was typed
Any count in any closing document that the generator cannot reproduce from the
declarations fails, including one that happens to be right.

---

## 3. What the matrix must contain

One row per declared requirement, and for each: the identifier, the family, the
slice that owns it, the classification, the evidence a reader can open, and —
for `partial` and `not-built-by-rule` — the remainder and its destination.

The matrix is created **at closeout and not before**.

---

## 4. What may not be created before its gate

- No acceptance record before its slice is complete.
- No traceability matrix before closeout.
- No closing report before the matrix.
- No successor artifact, ever, in this phase.
- No migration before its decision is signed.
- No producer before its migration.

---

## 5. The three properties this contract is really protecting

1. **A count cannot be typed.** Every number is regenerated or it is a defect.
2. **A claim cannot be argued.** Every claim is executed, or it is recorded as
   not executed. Argued-rather-than-proved is the exact phrase Phase 2L's
   correction used, and it cost two wrong classifications.
3. **A phase cannot close by rewording.** Every refusal above enumerates the
   phrasings it rejects, because the failure mode is never a lie — it is a
   sentence that is technically true and answers a different question.
