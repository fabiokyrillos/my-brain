# Phase 2O — the M1 measurement, and why not building is the correct outcome

**`2O-METRICS-001` … `2O-METRICS-005`.** This document is the measurement that
closes **M1 unspent**. It is not an explanation for an omission; it is the
result of the condition `OD-2O-8` **A** was signed with, executed rather than
assumed.

---

## 1. The condition, quoted before it is applied

`OD-2O-8` **A**, signed by ADR-116:

> declare an activation funnel **only if** a real producer and a real consumer
> both ship, which costs one vocabulary migration.
>
> *This product has shipped telemetry with no consumer before, and it was
> invisible for weeks. A is conditional on purpose.*

ADR-118 Decision 3 restates the arithmetic: **M1 is live and conditional on
slice 2O.8 delivering a real producer and a real consumer; absent either,
`2O-METRICS-001` … `-005` close `not-built-by-rule` and M1 closes unspent.**

**The condition has two conjuncts, and this slice failed both.**

---

## 2. `2O-METRICS-001` — the questions, written before any event name

The requirement's order is deliberate: *questions before names*, because a
vocabulary chosen from the code that happens to exist produces names nobody ever
asks anything of. Phase 2J and Phase 2K both wrote their questions first and both
ended with vocabularies exactly as wide as their readers.

The questions Phase 2O would have wanted answered about activation:

1. **Does the guided path get opened at all**, or is it rendered and ignored?
2. **Which step is where people stop** — is there one that consistently ends the
   session?
3. **Does a dismissed path get restored**, and how often — is the reversal a real
   affordance or a control nobody uses?
4. **Does an activation fact move from unsatisfied to satisfied within a
   session**, or only across days?
5. **Is the blocked step** — AI configuration absent — **the one that stalls the
   path**, or is it stepped past?

Every one is answerable in principle with content-free events. **None of them is
answered, because no event exists to answer it, and this section records what
was wanted so a later phase does not have to re-derive it.**

---

## 3. `2O-METRICS-002` — the producer, searched for and absent

**A producer would have to be a shipped surface that writes a product event.**
Phase 2O's activation surfaces are `src/features/activation/` and
`src/features/onboarding/`.

Measured against `main` at `8859e40`:

- `src/features/activation/` contains **four files** — `contracts.ts`,
  `contracts.test.ts`, `activation-view.ts`, `activation-view.test.ts`. Its
  entire exported surface is a fact vocabulary, a progress derivation and **one
  read**, `loadActivationProgress`. It writes nothing.
- `src/features/onboarding/` renders the path, sets and deletes a dismissal
  cookie, and writes no domain row.
- `grep` for `recordProductEvent` and `record_product_event` across **both**
  directories returns **zero matches**.

**There is no producer.** Not a weak one, not one behind a flag — none.

### Where every product event is actually written

For completeness, because "no producer" is a claim about the whole tree rather
than about two directories. Every writer of `record_product_event` on the
application side goes through `src/features/product-analytics/server.ts`, and its
nine importers are: `agent`, `capture`, `interpretations`, `notifications`,
`operations`, `rate-limits`, `task-commands` (twice) and `tasks`. **Activation
and onboarding are not among them**, and no other module reaches the RPC
directly.

---

## 4. `2O-METRICS-002` — the consumer, searched for and absent

**A consumer reads through its own code path and answers a named question.** The
repository's precedent is explicit about the shape: Phase 2F, 2J, 2K and 2M each
shipped a funnel reader alongside their vocabulary.

`scripts/` contains:

- `phase-2f-command-funnel-reader.mjs`
- `phase-2j-experience-funnel-reader.mjs`
- `phase-2k-conversation-funnel-reader.mjs`
- `phase-2m-daily-cycle-funnel-reader.mjs`

**There is no Phase 2O reader**, and nothing else in the tree queries
`product_events` to answer an activation question.

**Neither a test, nor a report, nor an occasional hand-written query counts.** A
test asserts that a writer wrote; it asks the data no question. A report is
prose. A query typed once and thrown away is not a code path. This is the SH.6
failure the decision text names — quota refusals recorded nothing for weeks
while the code read as though they did — and the distinction it turns on is
exactly this one.

---

## 5. The verdict

**Both conjuncts fail. No event is declared, no vocabulary is widened, no
migration is created, and M1 closes unspent.**

`2O-METRICS-001` … `-005` close **`not-built-by-rule`**, citing `OD-2O-8` **A**
and ADR-118 Decision 3.

### What was deliberately not done, stated positively

- **No event was invented to spend the allocation.** An allocation is a
  destination, not a permission, and `2O-CLOSE-003` makes an unnecessary spend a
  defect while making an unspent allocation a correct outcome.
- **No migration was created.** Phase 2O ends with **zero**.
- **The vocabulary was not widened.** It stands at **39 names**, and §6 records
  that its three copies agree.
- **No artificial producer was built** — a `recordProductEvent` call added to the
  onboarding view purely so that a producer could be said to exist would satisfy
  the letter of the condition and invert its purpose.
- **No documentary code was called a consumer.** The comment in
  `product-analytics/contracts.ts` describing what a reader would ask is not a
  reader; slice 2O.6's re-audit found slice 2O.5 had once counted a comment as a
  consumer, and that lesson is applied here rather than re-learned.

---

## 6. `2O-METRICS-003` and `-004`, evaluated against a phase that declared nothing

These two are about the shape of events this phase would have written. It wrote
none, so both close `not-built-by-rule` on the same rule — but the underlying
invariants were **verified anyway**, because they describe a live mechanism this
phase inherited and must not have damaged.

**`2O-METRICS-004` — the vocabulary has three copies, and they agree.** The
failure mode is recorded: the writer's own list froze at `202607280061` once
before and **silently refused newer events**. Read live from the deployed project
on 2026-08-18:

- the `product_events` check constraint carries **39** event-name literals;
- `src/features/product-analytics/contracts.ts` declares **39**;
- the two sorted lists are **identical**, name for name.

`private.validate_product_event_properties` is the third copy and is the property
validator rather than a second name list. **No copy was touched by this phase**,
and there was no widening for them to disagree about.

**`2O-METRICS-003` — content-free.** No event was added, so no key was added that
could hold an entry, a title, a name, a note, a file name or a user-chosen date.

**`2O-METRICS-005` — the consumer executed against the deployed project.** There
is no consumer to execute. The requirement's second half — *residue is proved
owner-scoped because `service_role` can neither read nor delete
`product_events`* — is the rule that would have governed the proof, and it is
recorded here so the next phase to ship telemetry does not have to rediscover
that a global count is not a proof of residue.

---

## 7. If a later phase revisits this

The conditions are unchanged and the work is small: **write the producer on a
shipped surface, write the reader that asks one of §2's five questions, widen
every copy of the vocabulary in one migration, and prove the producer against
both validators.** The order matters — the questions in §2 are already written,
and choosing names from them rather than from the code is what kept Phase 2J's
and Phase 2K's vocabularies honest.

**None of that is authorized here.** M1 belonged to Phase 2O and closes with it;
a later phase spends its own allocation under its own signature.
