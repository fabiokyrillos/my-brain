# Entity Graph Completion — final report

**The initiative is complete.** Three slices, governed by
[`ENTITY_GRAPH_COMPLETION_PRD.md`](../../ENTITY_GRAPH_COMPLETION_PRD.md) and
[`ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md`](../../ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md),
on the evidence in [`ENTITY_GRAPH_FINDINGS.md`](./ENTITY_GRAPH_FINDINGS.md).

| Slice | PR | Merge SHA | Merge-SHA CI |
| --- | --- | --- | --- |
| EGC.1 — Organizations and Contexts | #53 | `840da99` | run `30672108083`, green on all three jobs |
| EGC.2 — Person Relationships and Associations | #54 | `8305424` | recorded in §8 |
| EGC.3 — Convergence and closeout | #55 | recorded in §8 | recorded in §8 |

Per-slice records: [`EGC_SLICE_01_ACCEPTANCE.md`](./EGC_SLICE_01_ACCEPTANCE.md),
[`EGC_SLICE_02_ACCEPTANCE.md`](./EGC_SLICE_02_ACCEPTANCE.md).
Requirement-by-requirement disposition:
[`EGC_TRACEABILITY_MATRIX.md`](./EGC_TRACEABILITY_MATRIX.md).

---

## 1. What was wrong

`202607160003` and `202607160009` created five tables — `organizations`,
`contexts`, `person_relationships`, `person_contexts`, `person_projects` — each
with forced RLS, four own-row policies and full `authenticated` CRUD. The Person
page had read four of them since Slice F2 and rendered whatever it found.

It found nothing, because **the application layer contained zero writes to all
five**. That was measured before any code was written (gate G-0.1) and it was
stronger than the PRD had assumed: `person_relationships` had no writer in either
layer, ever. Organizations and contexts were written only by the
interpretation-persistence RPC, so a company existed in your data because a
capture had mentioned it — and the Company selector could report "no company
recorded yet" while owning no way to make one.

So the owner could not record that Camila is their wife. The only field on her
page that looked like it described her was the company she works at. Nine
findings, `EG-01`…`EG-09`, and the last is the general form: **the page
advertised capabilities and provided a path to none of them.**

---

## 2. What was delivered

**Four routes**: `/app/organizations`, `/app/organizations/[organizationId]`,
`/app/contexts`, `/app/contexts/[contextId]`.

**Thirteen Server Actions** across three modules — `entities/actions.ts` for
organizations and contexts, `entities/relationships.ts` for relationships,
`entities/associations.ts` for both junction tables.

**A typed, localized, version-locked relationship vocabulary** of fourteen
members, whose policy lock digests the *term mappings* rather than the database
literals — the exact defect Slice 2E.8 found — proven by executing the mutation
rather than describing it.

**Surfaces**: relationship add / correct-in-place / soft-end on the Person page;
person↔context and person↔project association from the Person page and
person↔project from the Project page, **all through one contract**; role editing;
create-and-select on the Company selector of both forms.

**Vocabulary and navigation**: two destinations in the `context` group; five
entity types and twelve action types added to the History vocabulary in both
locales, with the three junction types deliberately **not** linkable, because
their `entity_id` is a junction row's own id and there is no page for it.

---

## 3. The invariants, measured

| Invariant | Result |
| --- | --- |
| **Zero migrations** | Held across all three slices. Chain head is `202607310064` — the version Slice G5 set before this initiative was authorized. Pinned by `egc-invariants.test.ts` from the first commit |
| **Zero grant changes, zero policy changes** | Held. Asserted positively in two pgTAP suites: every privilege proved *present* for `authenticated` before `anon` is proved to hold none, and every policy named rather than counted |
| **Zero new privileged boundaries** | Held. No RPC, no `SECURITY DEFINER` function, no `service_role` path — asserted against all the table names, with a presence control so the empty result is a measurement rather than a query that finds nothing |
| **No provider call** | Held. Nothing in the diff imports `src/lib/ai` |
| **No `tasks`/`reminders` write-path change** | Held. The direct-write guard is untouched and its `tasks` allowlist is still empty |
| **No deletion of any of the five** | Held. Ending is `valid_until`; `egc-invariants.test.ts` scans every non-test file under `src/` for a `.delete()` on the three relationship tables, in both directions, with a non-vacuity control |
| **Locale ternaries ≤ 266** | **262.** The count *fell*: the read-only blocks EGC.2 replaced carried inline ternaries and their replacements carry none. Now permanently guarded |

---

## 4. EGC-INVARIANT-004, and the verdict a first draft did not have

The PRD's own adversarial review established that "no section renders without a
reachable path" is not assertable in general — only over an enumeration. Gate
G-0.2 produced that enumeration before any code; `egc-reachability.test.ts` turns
it into a mechanical check over the **whole** authenticated route tree, so a new
route cannot slip in unenumerated.

It needed **three** verdicts, not two, and the third was forced by the code
rather than anticipated. A first draft had "a writer module" and "no writer", and
failed immediately on the Context detail page — which renders the people in a
context and offers no control, because `EGC-ASSOC-003` puts the single writer for
`person_contexts` on the Person side. That is not what `EG-09` described.
`EG-09` was *no path anywhere*; this is a path from a named other page, which is
a different fact, recorded as its own and then checked: the named route must
exist and must genuinely import the named export.

It also checks the **export name**, not just the module. A module-level check
would have been satisfied for two collections the Organizations page cannot write
at all, because it imports `entities/actions.ts` for something else. That
strengthening caught a real inventory error on its first run — the Memories
section names `createRecord`, not `createMemory`.

Three sections remain writer-less, **named** rather than counted:
`inbox/[entryId]` and both Timelines, all three derived from capture and
interpretation.

---

## 5. Six factual corrections to the governing documents

Recorded rather than folded in, per the loop rule that a plan is reconciled only
when code proves an assumption wrong.

1. **The application layer had zero writers to all five tables** — stronger than
   the PRD assumed, which expected the `202607160011` trigger to be the sole
   writer of organizations and contexts.
2. **Organizations and contexts were written by `202607160005`** (interpretation
   persistence), *not* by the `202607160011` trigger.
3. **`person_relationships` had no writer in either layer.**
4. **`person_relationships` has no unique index beyond its primary key.**
   EGC-REL-007's "the partial unique index … frees the pair for a later re-add"
   describes `person_contexts` and `person_projects`; it does not describe this
   table. Its duplicate refusal is therefore application-only and **races** — the
   module header says so rather than implying a guarantee the database does not
   give.
5. **Three bounds in `schema.ts` are product ceilings, not column mirrors.**
   `relationship_type`, `description` and `role` are unconstrained `text`; the
   form's enum is deliberately narrower than the column, which is why EGC-REL-006
   exists.
6. **EGC-ASSOC-008's "disabled control" is a departure.** The panel removes the
   control and renders the explanation instead, because a disabled disclosure
   that opens onto nothing is the `EG-04` dead end in miniature. Named as a
   departure rather than left for a gate check to discover.

---

## 6. What review cost, and what it was worth

**Twenty-seven findings across two adversarial reviews and one journey run. All
twenty-seven were fixed; none was argued down.**

**Four would have made CI red on its first attempt**, all in pgTAP files, all
unreachable locally because Docker is unavailable on this machine — so review was
the only thing standing between them and the `database` job:

- EGC.1: a data-modifying `WITH` attached to a scalar sub-SELECT, which Postgres
  refuses at *parse* time — an aborted transaction, not a failed assertion.
- EGC.1: two scalar subqueries over `pg_constraint` that would have raised
  `21000`, because `person_contexts`, `task_contexts`, `people` and `projects`
  each carry **two** foreign keys to their parent.
- EGC.2: `now()` is `transaction_timestamp()`, constant across a pgTAP file's
  single transaction, so the gate-B3 re-add collided with the base
  `(person_id, context_id, valid_from)` key — while the duplicate assertions
  raised from the *older* base index and would have kept passing with the partial
  index dropped outright.

**Three were real product defects**, two of which shipped in this initiative and
one of which predates it:

- The relationship **edit** path had no duplicate check where the create path
  did, so a correction could deterministically produce two live rows of one type
  on the one table with no unique index — and that state then made every later
  create report an outage for a duplicate *and discard the owner's typed note*.
- Linking a person to the owner's only context printed *create a context first*
  over the confirmation it had just replaced. `options.length === 0` stood for
  two facts with different next steps.
- **Older than this initiative**: Cancel-after-a-refusal permanently killed the
  reopen control on the Project and Person edit forms shipped in Phase 2F. The
  Edit button was dead until a page reload, and two tests stopped exactly one
  click short of catching it.

**No security finding, in either review.** Cross-tenant read and write, forged
input reaching a write, forged audit rows, `origin` influencing a payload and
user content reaching the ledger were each attempted and could not be
constructed.

---

## 7. The closeout instruments

| Instrument | What it does |
| --- | --- |
| `egc-reachability.test.ts` | EGC-INVARIANT-004 over the whole route tree, three verdicts, export-level resolution |
| `locale-ternary-guard.test.ts` | The permanent non-increase guard the UX closeout proposed and nobody built. Proven by executing the mutation on a real temporary tree — not on `src/`, because two sibling closeout tests walk `src/` concurrently and a probe file there would make their results depend on this test's timing |
| `generate-egc-traceability.mjs` | Parses the inventory, resolves every artifact on disk, fails closed on drift, regenerates content-identically |
| `verify-egc-cleanup.mjs` | Residue detection by **combined evidence**, not by prefix |

**The cleanup verifier is the one that changed shape.** The Phase 2C…2F
verifiers define a fixture as an email with a known prefix, and that rule failed
in production: an account generated on 2026-07-16, confirmed, used for three
minutes and abandoned, was classified as a real user by two acceptance artifacts
while the hourly heartbeat ran on its behalf for three weeks. The proxy was
narrower than the property — the same class ADR-067 corrected in the A13 guard.

This verifier scores six independent signals and prints the evidence: fixture
prefix, reserved domain, generated-looking local part, embedded timestamp,
**ownership of entity-graph rows with no product activity**, and **scheduled
activity without product activity**. The last is the one that would have caught
the account the prefix rule missed.

**It reports and never deletes, and it holds no delete path** — asserted by a
test that greps its own source. `likely-fixture` requires a *behavioural* signal
plus at least one more, so a naming heuristic alone can never reach it; that
ceiling is what keeps a real person with an unusual address out of the deletion
conversation at all. Automated deletion needs an explicit manifest or strong
ownership proof and a human decision.

Live run: **2 accounts scanned, 0 reaching `likely-fixture`, 0 residue rows.**
Both accounts are the real ones; every journey account this initiative created
was deleted by its own `afterAll`.

---

## 8. Acceptance

Every gate in the plan — A1–A10, B1–B13, C1–C7 — is recorded with its evidence in
the three acceptance documents. The traceability matrix disposes of all **53**
requirements across nine families: **53 delivered, 0 deferred**, and the zero is
measured rather than assumed, because the generator fails closed on any
requirement carrying neither evidence nor a recorded destination.

**One thing is reported as failing rather than rounded off.** Two of the 46
assertions in `src/features/task-commands/sql-reachability.test.ts` fail on the
author's Windows checkout, and fail identically on `main` — whose CI is green.
The cause is the CRLF fragility Slice H diagnosed (`core.autocrlf = true`, no
`.gitattributes`, against test patterns anchored on a bare `\n`). It is **not**
fixed here: it is a test-robustness defect in another feature, and mixing it into
a feature branch is what the commit discipline forbids. It remains recorded as
repository maintenance in `PRODUCT_UX_CLOSEOUT.md` §8.

The same fragility bit this initiative's own traceability generator, which
originally found **zero** of the three owner decisions on a Windows checkout:
their declaration is a heading ending `(.+)$`, and `.` does not match `\r`, while
the table rows kept working because their pattern ends `\s*$`. That one **is**
fixed, with a test that parses the same fixture under both line endings, because
it is this initiative's own instrument.

**Nothing here authorizes a successor.** BYOK is designed and approved and has
not started; Phase 2G is unauthorized. Migration parity is `202607310064` on both
sides, unchanged by any of the three slices.
