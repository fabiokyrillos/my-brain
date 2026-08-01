# EGC.2 — Person Relationships and Associations · Acceptance record

**Slice EGC.2 of Entity Graph Completion.** Governed by
[`ENTITY_GRAPH_COMPLETION_PRD.md`](../ENTITY_GRAPH_COMPLETION_PRD.md) and
[`ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md`](../ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md)
§"Slice EGC.2".

Branch `codex/egc-slice-2`, branched from `main` at `840da99` (EGC.1's merge SHA).

---

## 1. What this slice closes

`public.person_relationships` was created by `202607160009` with forced RLS, four
own-row policies and full `authenticated` CRUD. **Nothing had ever written it** —
not the interpretation RPC, not a trigger, not the application. `person_contexts`
and `person_projects` had a trigger writer and no user-reachable one.

So the owner could not record that Camila is their wife. The only field on a
Person page that looked like it described her was the company she works at, which
is why the finding set opens with `EG-01`…`EG-04`.

This slice gives all three tables their first application write path, a typed and
versioned relationship vocabulary, and association surfaces on both the Person and
the Project page. It adds **no migration, no column, no grant, no policy and no
privileged boundary**.

---

## 2. Acceptance gates

| Gate | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| **B1** | **The Camila scenario, end to end**, both locales | **PASS** | `online-relationships.spec.ts` "gate B1", desktop + Pixel 7. Create Camila → record *spouse* → create context *Pessoal* (kind `personal`) → associate → create a company that is a **visibly separate concern** → associate a project with a role → read the same association back from the project's own page. Every assertion follows a reload |
| **B2** | Ending sets `valid_until` and removes it from the page; **the row still exists**, asserted directly | **PASS (CI)** | `egc_relationship_lifecycle.sql` §2. Live → ended → absent from every live-row reader → **still in the table**. Asserted at the database because "it disappeared" and "it was deleted" are indistinguishable from a browser |
| **B3** | Re-adding an ended association produces exactly one live row | **PASS** | `egc_relationship_lifecycle.sql` §3 (one live row, two rows total) and the surface half in `online-relationships.spec.ts` |
| **B4** | An unknown relationship type renders its raw value without throwing | **PASS** | `relationship-panel.test.tsx` — renders `godparent` plus a neutral note; `relationship-vocabulary.test.ts` proves `describeRelationshipType` returns `null` rather than guessing |
| **B5** | Duplicate live association refused with a localized message, not a `23505` | **PASS** | `associations.test.ts` maps `23505` → "already recorded"; `egc_relationship_lifecycle.sql` §3 proves the index raises it |
| **B6** | Cross-owner refused by the application check **and** by the composite FK — both asserted | **PASS** | Application half in `relationships.test.ts` / `associations.test.ts`; structural half in `egc_relationship_lifecycle.sql` §5 — `23503` for a stranger's context, project and person, `42501` for a stranger's `user_id`, and a positive control last |
| **B7** | One writer per table, proven in both directions | **PASS** | `egc-invariants.test.ts` — exact-set comparison, plus a non-vacuity control that fails if the anchor regex ever stops matching |
| **B8** | The policy lock fails when a vocabulary member is re-pointed — proven by executing a mutation | **PASS** | `relationship-vocabulary.test.ts` re-points `spouse`'s Portuguese term and asserts the digest moves **while the literal list is unchanged** — which is what a lock over the literals would have missed |
| **B9** | Migration head unchanged; grants/policies on all three tables unchanged | **PASS (CI)** | `egc_relationship_lifecycle.sql` §1 |
| **B10** | `audit_logs` rows for every relationship and association write | **PASS** | Asserted per action in both writer test files, including that `description` and `role` never reach the ledger |
| **B11** | Locale-ternary count ≤ baseline | **PASS — 262** (baseline 266) | The four read-only blocks replaced carried inline ternaries; their replacements carry none |
| **B12** | Desktop + Pixel 7, both locales | **PASS** | 8/8 serialized |
| **B13** | Lint 0, typecheck 0, Vitest green, build exit 0 | **PASS with one stated exception** | Lint 0, typecheck 0, build exit 0, Vitest **3321 passed / 2 failed** — see §6 |

---

## 3. Two factual corrections to the PRD, recorded rather than folded in

**1. `person_relationships` has no unique index.** EGC-REL-007 describes "the
partial unique index" as freeing the pair for a later re-add. That is true of
`person_contexts` and `person_projects` — `202607160011:1-2` create
`person_contexts_current_idx` and `person_projects_current_idx`, both partial on
the live pair. `person_relationships` carries **no unique index beyond its
primary key**; `202607160009:12` creates only a plain
`(user_id, person_id, valid_until)` index.

Consequences, all load-bearing:

- Nothing at the database prevents two live relationships of the same type to the
  same person. `relationships.ts` performs an **application-only** duplicate
  check, and its header says so — it is a check that races, not a constraint.
  Losing the race produces a second live row, which the surface renders and the
  owner can end. That is a better outcome than adding a migration to an
  initiative whose zero-migration invariant is the point.
- Gate B5's "not a `23505`" framing applies to the two association tables. For
  relationships there is no `23505` to avoid.
- `egc_relationship_lifecycle.sql` §4 asserts all three index facts, so the
  correction is measured rather than asserted. The assertion **excludes the
  primary key by name** — a bare `indexdef like '%UNIQUE%'` would count
  `person_relationships_pkey` and report the opposite of the truth.

**2. Three bounds are product ceilings, not column mirrors.**
`relationship_type` has no CHECK (deliberately, per EGC-REL-002), and
`description` and `person_projects.role` are bare `text` with no length bound. So
`schema.ts`'s 500 and 120 are decisions about what a person should be asked to
type, and the form's enum is **narrower than the column** — which is exactly why
EGC-REL-006 exists. Section 3 of the pgTAP suite proves the role column accepts
400 characters, so the claim stays honest.

---

## 4. Product decisions worth naming

**Portuguese kinship terms name both forms.** `Esposa/Esposo`, `Pai/Mãe`,
`Filho/Filha`, `Irmão/Irmã`. The product does not know anyone's gender and is not
adding a field in order to render a label; picking `Esposa` would assign a gender
to every spouse in every account on the strength of nothing. This is the PRD's own
notation for `spouse` (EGC-REL-004 writes it as *Esposa/Esposo*), applied
consistently rather than to one member.

**Company and relationship are visibly distinct concerns** (EGC-REL-009). Each
carries its own explainer — "Onde a pessoa trabalha" and "Quem essa pessoa é para
você" — because the Camila scenario exposed precisely the confusion of a company
field reading as a way to describe a personal relationship.

**Ending is called ending.** The controls say "encerrar o vínculo", not "remove",
because that is what happens: `valid_until` is set and the row survives. Calling
it removal would promise a deletion the product deliberately does not perform.

---

## 5. The adversarial review, and what it found

A hostile review of the whole diff produced **thirteen findings**. All thirteen
were remediated; none was argued down. It confirmed all six hard invariants and
found **no security defect** — cross-tenant read and write, forged input reaching
a write, forged audit rows, `origin` influencing a payload, and user content
reaching the ledger were each attempted and could not be constructed.

**One BLOCKER, in the pgTAP file, unreachable locally** (no Docker), which would
have made the `database` job red on its first run.

`person_contexts` and `person_projects` each carry **two** unique constraints,
not one: the partial index over the live pair, *and* a base
`unique (person_id, context_id, valid_from)` declared inline in `202607160009`.
`valid_from` defaults to `now()` — which is `transaction_timestamp()`, constant
for the entire pgTAP file, since it is one `begin … rollback`. So:

- The re-add after the end (gate B3) collided with the **base** key and failed a
  `lives_ok` that describes real production behaviour correctly — there, the end
  and the re-add are separate transactions with different timestamps. Three
  assertions fell with it.
- Worse, the duplicate assertions **passed for the wrong constraint**. The base
  key's index is older, so it raised first; the assertion would have kept passing
  with `person_contexts_current_idx` dropped outright — leaving gate B5's actual
  claim unproven.

Every insert in that section now carries an explicit, distinct `valid_from`,
which isolates the constraint under test.

**Two HIGH findings, both real application defects.**

`updateOwnerRelationship` had no duplicate check while `createOwnerRelationship`
did. Correcting a `colleague` row to `friend` beside an existing live `friend`
therefore produced **two live rows of one type** — a state no index prevents on
this table — and it was deterministic, not a race. It then poisoned every later
create: the duplicate probe used `.maybeSingle()`, which raises `PGRST116` on
more than one row, so the owner got "could not save now" (an outage message for a
duplicate) **and lost the note they had typed**, because that failure passed no
submission back. Both halves are fixed: the probe reads a bounded list and
counts, the edit path shares it with the row under edit excluded, and the failure
carries the input back.

**Ten MEDIUM and LOW findings**, each a real defect:

- The Project page's People panel rendered *"Nenhum projeto vinculado"* under a
  heading reading "Pessoas" — a two-way ternary over three placements, with the
  correct copy key present but unreachable.
- An owner whose projects were **all archived** was told to create a project, the
  same `EG-04` shape as the defect found by the journey run, reached through the
  archived filter instead. Archived projects now appear in the selector — it is
  also true that somebody worked on a project that has since been archived.
- The in-row edit forms for relationships and roles **never closed and never
  confirmed**: a plain boolean that nothing cleared on success left the form open
  showing the values it had just saved, with no visible confirmation and no live
  region at all. Both now use the state-identity derivation the create forms use.
- The "no privileged boundary" pgTAP assertion matched only
  `'%person_relationship%'` with no presence control — it would have stayed at
  zero through a definer named `associate_person_context`.
- Row controls shared accessible names: a person with a spouse and a sibling gave
  a screen-reader user two identical "Editar relação" buttons. Every row control
  now names its subject. The role trigger was also labelled with a noun identical
  to the field it opened; it is now `editRole`.
- Both writer modules cited a test file that does not exist.
- `origin` was documented in four places as steering revalidation. It does not —
  both pages are refreshed regardless. And `endPersonProject` **required** it and
  never read it, so a form omitting it was refused for a field that affected
  nothing. It is now read into the audit reason, and the four claims are corrected.
- Three `expect(stub.delete).toBeUndefined()` assertions were true by
  construction; removed, since the real guard is the architecture test.
- The association select had no remount key, so a refusal silently reverted the
  selection.

**One departure from the PRD is recorded rather than fixed.** EGC-ASSOC-008 says
an empty selector should "degrade to a **disabled control** with an explanation".
The implementation removes the control entirely and renders the explanation. A
disabled disclosure that opens onto nothing is the `EG-04` dead end in miniature,
so the sentence alone is the honest surface — but it is a departure from the
requirement text, and it is named here rather than left for a gate check to
discover.

---

## 6. The two failing tests, stated rather than rounded off

`src/features/task-commands/sql-reachability.test.ts` fails 2 of its 46
assertions on this machine, as it did throughout EGC.1. **Not a regression and
not this slice's**: the identical two fail on `main`, whose CI is green. The
cause is the Windows CRLF checkout Slice H diagnosed. Left to repository
maintenance rather than mixed into a feature branch.

Local verification: lint 0, typecheck 0, build exit 0, Vitest **3321 passed / 2
failed**, locale ternaries 262.

---

## 7. What the journey run found, and what it cost

The first serialized run was 4/8. Three failures were spec defects — an
`aria-label="Contexto"` navigation group colliding with the association select, a
history assertion that resolved to four rows because the tests share an account,
and the Camila journey running 28.4s against a 30s budget.

**The fourth was a real product defect.** Linking a person to the owner's only
context left the panel printing *create a context first* — advice to make
something they already had — over the confirmation it had just replaced.
`options.length === 0` was standing for two different facts with two different
next steps. That is the same shape as `EG-04`, the finding this initiative exists
because of, in a new place. It is now `ownsNone` versus nothing left to select,
with a sentence per placement, and the outcome of the round that consumed the last
option stays readable.

Final: **8/8 serialized, desktop and Pixel 7, both locales.**

---

## 8. Deferred to EGC.3, by design

- The enumerated reachability assertion (EGC-INVARIANT-004) over the **whole**
  route inventory.
- The permanent locale-ternary non-increase guard.
- The generated traceability matrix and the zero-residue verifier.
- The `SECURITY.md` write-surface section EGC-OPERATIONS-004 assigns to closeout.
