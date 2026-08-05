# Entity Graph Completion — PRD

**Revision 1** · 2026-07-31 · Baseline `main` `a745011`, parity `202607310064`.

**Status — AWAITING OWNER APPROVAL. Not authorized for implementation.**

- **Governing evidence** — [`reports/ENTITY_GRAPH_FINDINGS.md`](./reports/entity-graph/ENTITY_GRAPH_FINDINGS.md) (EG-01…EG-09, verified).
- **Phase boundary** — [`reports/PHASE_2G_DEFINITION.md`](./reports/phase-2g/PHASE_2G_DEFINITION.md) §20, Decision 11 (revised).
- **Position in the roadmap** — first. Deterministic, independent of BYOK, independent of Phase 2G.
- **Requirement prefix** — `EGC-`.
- **Slices** — EGC.1 Organizations and Contexts · EGC.2 Person Relationships and Associations · EGC.3 Convergence and Closeout.

---

## 1. Problem

The Person detail page reads four relationship surfaces — relationship to you, contexts,
pending tasks, shared projects — from tables that `authenticated` can already fully write,
under forced RLS with composite-foreign-key ownership proof. **No write surface exists for
any of them.** One of those tables, `public.person_relationships`, has never been written
by anything: not a trigger, not an RPC, not a Server Action, not the extraction pipeline.

The Company selector reports that no organizations exist while owning no path to create
one. There is no Organizations route and no Contexts route at any level.

The result is a page that advertises four capabilities and provides zero paths to any of
them (EG-09) — the exact defect class the product UX/UI remediation existed to remove,
observed in real use one day after that initiative closed.

## 2. Objective

> **The entity graph the product already stores becomes reachable by its owner — with no
> new persisted fields, no migration, and no new privileged boundary.**

## 3. What this is not

- Not a schema expansion. **Zero migrations** is a hard invariant (EGC-INVARIANT-001), gated.
- Not `PHASE_2G_DEFINITION.md` Decision 9 (project purpose / start / target dates). Those
  stay deferred on unchanged grounds; this work is the argument *for* that deferral.
- Not a CHECK constraint on `relationship_type`.
- Not a person-to-person relationship graph beyond the nullable `related_person_id` that
  already exists.
- Not deletion of organizations or contexts — see EGC-DEC-1.
- Not AI. No path in this initiative calls a provider.

## 4. Verified starting posture

Every object below already has: RLS **enabled and forced**, four own-row policies,
`grant select, insert, update, delete to authenticated`, `revoke all from anon`.

| Object | Columns | Ownership proof | Write path today |
| --- | --- | --- | --- |
| `organizations` | `id, user_id, name, description, created_at, updated_at`; unique `(user_id, lower(name))` | `user_id` + RLS | AI extraction only |
| `contexts` | `+ kind ∈ {work, personal, custom}`; unique `(user_id, lower(name))` | `user_id` + RLS | AI extraction only |
| `person_relationships` | `person_id, related_person_id (nullable), relationship_type (text, no CHECK), description, valid_from, valid_until, confidence` | composite FKs on **both** person columns → `people (user_id, id)` | **none** |
| `person_contexts` | `person_id, context_id, valid_from, valid_until, confidence`; partial unique `(person_id, context_id) where valid_until is null` | composite FKs → `people` **and** `contexts` | trigger only (`link_interpreted_entities`) |
| `person_projects` | `+ role (text, nullable)`; same partial unique shape | composite FKs → `people` **and** `projects` | trigger only |

Sources: `202607160003:1-45,185-197`; `202607160009:6-27,60-73`; `202607160011:1-2`;
`202607170016:74-88`.

**Precedent for the write posture:** UX Slice F2 shipped `updateProject`
(`entities/actions.ts:92`) and `updatePerson` (`:152`) as Server Actions with Zod
validation and an `audit_logs` row. This initiative extends that shape rather than
inventing a second one.

---

## 5. Requirements

### EGC-INVARIANT — the properties the initiative establishes

| ID | Requirement |
| --- | --- |
| **EGC-INVARIANT-001** | The initiative adds **no migration**. A CI gate compares the migration-chain head against `202607310064` and fails the build if it moves. |
| **EGC-INVARIANT-002** | No `grant` is widened and no policy is created, altered or dropped, on any object, anywhere. Asserted by pgTAP over the catalog for the five tables in §4. |
| **EGC-INVARIANT-003** | Phase 2F's write-path invariant is untouched. `src/lib/supabase/direct-write-guard.test.ts` keeps an **empty** `tasks` allowlist and the unchanged single `reminders` entry. No module added by this initiative writes `public.tasks` or `public.reminders`. |
| **EGC-INVARIANT-004** | **No section renders without a reachable path.** Every relationship or association card on a detail page either offers a control that writes it, or is absent. Asserted in EGC.3 over the route inventory. |
| **EGC-INVARIANT-005** | No provider call is added. `getAIProvider` is not imported by any module this initiative creates or modifies. |

### EGC-ORG — organizations

| ID | Requirement |
| --- | --- |
| **EGC-ORG-001** | A list route exists at `/{locale}/app/organizations`, owner-scoped, paginated with the repository's existing keyset/page pattern, with an honest empty state that offers creation. |
| **EGC-ORG-002** | A detail route exists at `/{locale}/app/organizations/{organizationId}` showing `name`, `description`, and the owner's people and projects linked to it. A foreign or non-existent id renders not-found, never another owner's row. |
| **EGC-ORG-003** | Creation accepts `name` (1–160, matching the column CHECK) and optional `description`. `name` collides on the existing unique `(user_id, lower(name))` index; the collision surfaces as a localized "already exists" result, never a raw database error. |
| **EGC-ORG-004** | Editing updates `name` and `description` through a Server Action with Zod validation, an ownership predicate, and an `audit_logs` row — the `updateProject` shape. |
| **EGC-ORG-005** | The Company selector on the Person and Project edit forms gains a **create-and-select** affordance. It creates the organization and assigns it in the same user action. |
| **EGC-ORG-006** | EGC-ORG-005 performs two writes. If the assignment fails after the organization is created, the organization survives and the result says so — an orphan organization is visible in the list and recoverable, and the product must not claim an assignment that did not happen. |
| **EGC-ORG-007** | Organization deletion is **out of scope** (EGC-DEC-1). No delete control is rendered, and no action exists. |

### EGC-CTX — contexts

| ID | Requirement |
| --- | --- |
| **EGC-CTX-001** | A list route exists at `/{locale}/app/contexts`, owner-scoped, paginated, with an honest empty state offering creation. |
| **EGC-CTX-002** | A detail route exists at `/{locale}/app/contexts/{contextId}` showing `name`, `description`, `kind`, the owner's people linked through `person_contexts`, and the owner's tasks linked through `task_contexts`. |
| **EGC-CTX-003** | Creation accepts `name` (1–120), optional `description`, and `kind` from the existing closed set `{work, personal, custom}` with localized labels. The stored value is the database literal; the label is presentation. |
| **EGC-CTX-004** | Editing updates `name`, `description` and `kind` through the same Server Action shape, with an `audit_logs` row. |
| **EGC-CTX-005** | Context deletion is **out of scope** (EGC-DEC-1). |
| **EGC-CTX-006** | Task association through `task_contexts` is **already reachable** through the candidate editor and the task command taxonomy (`assign_context`) and is **not re-implemented**. The context detail page links to those tasks; it does not offer a second way to create the link. |

### EGC-REL — person relationships

| ID | Requirement |
| --- | --- |
| **EGC-REL-001** | A relationship to the owner is recorded as a `person_relationships` row with `related_person_id = null`. The nullable column already means "related to the owner"; no new column and no sentinel value is introduced. |
| **EGC-REL-002** | `relationship_type` is written from a **typed, localized vocabulary module** in TypeScript, in the shape of `task-commands/taxonomy.ts` and `history/vocabulary.ts` (ADR-064). **No CHECK constraint is added** — the column stays permissive so a future extraction-written value is a rendering fallback, not an insert failure. |
| **EGC-REL-003** | The vocabulary carries a version constant, bumped whenever a member is added, removed or re-pointed, and pinned by a policy-lock test that digests the **term mappings** — not the database literals. This is the defect Phase 2E Slice 2E.8 found and it must not recur. |
| **EGC-REL-004** | The vocabulary covers at minimum: spouse, partner, parent, child, sibling, other-family, friend, colleague, manager, report, client, vendor, mentor, other. `spouse` renders as *Esposa/Esposo* / *Spouse* and satisfies the Camila scenario. |
| **EGC-REL-005** | An optional free-text `description` (bounded, ≤ 500) carries human nuance. It is **user content**, never localized, and never treated as an instruction. |
| **EGC-REL-006** | A relationship type outside the vocabulary renders its raw stored value with a neutral presentation rather than throwing or rendering blank — the `history/vocabulary.ts` fallback contract. Proven by a test that stores an unknown value directly and asserts the render. |
| **EGC-REL-007** | Ending a relationship sets `valid_until = now()`. No row is deleted. Every reader already filters `.is("valid_until", null)`, and the partial unique index already frees the pair for a later re-add. |
| **EGC-REL-008** | Editing a live relationship updates `relationship_type` and `description` in place. Changing the *type* is an edit, not an end-and-recreate. |
| **EGC-REL-009** | Company (`people.organization_id`) and relationship-to-owner are rendered as **visibly distinct concerns** on the Person surface, and the copy must not present Company as a way to describe a personal relationship. |
| **EGC-REL-010** | `confidence` is written as `1` for every user-authored row, matching the column default, and is **not** surfaced in the UI. A user-entered fact is not a scored inference. |

### EGC-ASSOC — person ↔ context and person ↔ project

| ID | Requirement |
| --- | --- |
| **EGC-ASSOC-001** | The Person surface can associate the person with an owned context, writing `person_contexts`. |
| **EGC-ASSOC-002** | The Person surface can associate the person with an owned project, writing `person_projects`, with an optional `role`. |
| **EGC-ASSOC-003** | The Project surface can associate an owned person with the project, writing the same `person_projects` row shape. Both surfaces write one contract; the association is symmetric and neither surface owns a private path. |
| **EGC-ASSOC-004** | `person_projects.role` is **free text**, bounded (≤ 120), not a closed vocabulary and not localized — it is user-authored content describing a domain-specific role, unlike EGC-REL-002's product-owned relationship taxonomy. The distinction is deliberate and is recorded here so a later reviewer does not "harmonize" them. |
| **EGC-ASSOC-005** | Removing an association sets `valid_until = now()`. No association row is deleted. |
| **EGC-ASSOC-006** | Re-adding a previously ended association creates a new live row; the partial unique index permits it and the readers show only the live one. |
| **EGC-ASSOC-007** | Every association write validates the target id against the caller's own rows before writing. The composite FKs make cross-owner writes structurally impossible; the application check exists so the failure is a localized refusal rather than a `23503`. |
| **EGC-ASSOC-008** | Association selectors list only the owner's own entities, bounded (≤ 200, the `relation-options.ts` precedent), and degrade to a disabled control with an explanation when the owner has none of that kind — never to a silent empty select. |

### EGC-AUDIT — auditability

| ID | Requirement |
| --- | --- |
| **EGC-AUDIT-001** | Every write in this initiative records an `audit_logs` row with `actor = 'user'`, the entity type, the entity id, and `before_state`/`after_state` limited to the fields the action can change. |
| **EGC-AUDIT-002** | New `entity_type` values (`organization`, `context`, `person_relationship`, `person_context`, `person_project`) are added to `src/features/history/vocabulary.ts` so History renders them **localized**, per the Slice G4 / UX-28 contract that derives the phrase from `action_type`/`entity_type`. `audit_logs.entity_type` carries no CHECK, so this needs no migration. |
| **EGC-AUDIT-003** | The audit row is **self-reported** — it is inserted from the client role, and `authenticated` retains `INSERT` on `audit_logs` (2F-TESTMIG-007). This is the inherited F2 posture. It is recorded in `SECURITY.md` as extended, and **must not be described as database-enforced**. |
| **EGC-AUDIT-004** | No user content beyond what the audit row already needs enters `product_events`. This initiative emits **no new product event** and widens no allowlist — which is also why it needs no migration. |

### EGC-SURFACE — navigation, copy, accessibility

| ID | Requirement |
| --- | --- |
| **EGC-SURFACE-001** | `src/features/shell/capabilities.ts` classifies the two new routes and their detail children, so desktop tree, mobile "Mais/More" and active-destination resolution all agree. |
| **EGC-SURFACE-002** | All new copy lives in typed feature `copy.ts` modules in the `daily-cycle/copy.ts` shape. **No new inline `pt ? … : …` ternary is introduced** — the UX-22 count must not rise, and EGC.3 asserts it. |
| **EGC-SURFACE-003** | Every new control meets the standards the UX remediation established: accessible name, ≥ 44 px touch target, focus management on dialogs, a live region for action results, and no colour-only state. |
| **EGC-SURFACE-004** | Every new surface renders correctly on desktop and Pixel 7 in both locales. |
| **EGC-SURFACE-005** | Empty states are honest: they state what is absent and offer the control that fixes it, or they do not render (EGC-INVARIANT-004). |

### EGC-OPERATIONS — closeout

| ID | Requirement |
| --- | --- |
| **EGC-OPERATIONS-001** | A fail-closed traceability generator produces a row per requirement in this PRD and fails on drift, in the `generate-phase-2f-traceability.mjs` shape. |
| **EGC-OPERATIONS-002** | A cleanup verifier proves zero fixture residue across every table this initiative writes. |
| **EGC-OPERATIONS-003** | The full authenticated journey set runs **serialized** (the P1 method) on desktop and Pixel 7 in both locales, and its result is reported independently of the per-slice journeys. |
| **EGC-OPERATIONS-004** | `SECURITY.md` gains a section recording the extended write surface, the self-reported audit posture (EGC-AUDIT-003), and the explicit statement that no grant or policy changed. |
| **EGC-OPERATIONS-005** | Every merge SHA has a green `application`, `worker` and `database` CI job. |

---

## 6. Owner decisions inside this PRD

### EGC-DEC-1 — deletion of organizations and contexts

**Recommendation: (a) — no deletion in this initiative.**

`contexts.id` is referenced by `person_contexts.context_id` and `task_contexts.context_id`
with **`on delete cascade`**. Deleting a context would silently destroy every person and
task association that referenced it. This codebase's standard for an irreversible action is
explicit confirmation plus audit plus a tested undo — which is RPC-scale work with a
migration, and would break EGC-INVARIANT-001.

- **(a) No delete.** Rename and edit cover the realistic mistake. An unwanted organization
  sits in a list. **Recommended.**
- **(b) Hard delete with a destructive confirmation disclosing the cascade.** Needs the
  confirmation contract, an undo, and a migration. Out of scope by cost, not by principle.
- **(c) Add an `archived` / `status` column.** A migration, and a new persisted field —
  forbidden by the initiative's own terms.

**Impact:** two create-only-and-edit entity types. **Reversibility:** adding deletion later
is additive. **Blocks:** nothing.

### EGC-DEC-2 — does ending an association preserve history, or remove the row?

**Recommendation: soft-end via `valid_until` for every association and relationship.**

It is what the schema models, what every existing reader assumes, and what the partial
unique indexes were built for. The cost is that a mistaken association leaves an invisible
historical row with no surface that shows it — acceptable, and recorded rather than
discovered.

### EGC-DEC-3 — the relationship vocabulary's exact membership

EGC-REL-004 proposes fourteen members. The owner may add or remove any, subject to
EGC-REL-002 (no CHECK) and EGC-REL-003 (version bump + policy lock). `other` plus
`description` is the escape hatch, so the list does not need to be exhaustive.

---

## 7. Acceptance philosophy

Unchanged from Phases 2E and 2F:

1. A gate that has never run is a claim, not a check.
2. A check that reads its own input proves nothing.
3. Isolation assertions are non-vacuous — the owner's positive row is asserted **before**
   the stranger's absence (`2F-OWNERSHIP-001`).
4. Every partial stays labelled partial; every deferral keeps a destination.
5. The initiative's invariants are guarded mechanically — the migration-head gate, the
   grant/policy pgTAP assertions, the empty `tasks` allowlist, the ternary-count assertion.

**The initiative's single acceptance question:** *Can the owner record that Camila is their
wife, place her in a Personal context, optionally attach a company they created themselves,
and end any of those relationships later — through surfaces that exist, with an audit trail,
without a single migration?*

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| **R1** | A "small" schema addition creeps in — an `archived` flag, a display order, a colour | **Medium** | High — it would void the initiative's central claim | EGC-INVARIANT-001 is a CI gate on the migration-chain head, not a review convention |
| **R2** | The relationship vocabulary is treated as a database contract and a CHECK is added "for safety" | Medium | Medium | EGC-REL-002 and EGC-REL-006 state the reason; the unknown-value render test makes the permissiveness load-bearing |
| **R3** | Two association write paths appear — one on Person, one on Project | Medium | Medium | EGC-ASSOC-003 requires one contract; an architecture test asserts a single writer module for `person_projects` |
| **R4** | Inline locale ternaries return, raising the UX-22 count the closeout asked to be guarded | **Medium — four slices did this before anyone noticed** | Low-Medium | EGC-SURFACE-002 plus the non-increase assertion in EGC.3. Build the guard the UX audit proposed and nobody built |
| **R5** | The create-and-select affordance leaves orphan organizations on partial failure | Medium | Low | EGC-ORG-006 makes the outcome honest rather than preventing it |
| **R6** | `person_projects.role` and `relationship_type` are "harmonized" into one mechanism by a later reviewer | Low | Medium | EGC-ASSOC-004 records the deliberate asymmetry and its reason |
| **R7** | Adding entity types to `history/vocabulary.ts` breaks the History surface's closed-set assumptions | Low | Medium | EGC-AUDIT-002 plus the existing fallback contract; covered by a test per new type |
| **R8** | The Person page gains controls but the **task** section stays unreachable, leaving EGC-INVARIANT-004 half-satisfied | Medium | Medium | Pending tasks are already reachable via the task surfaces; EGC-CTX-006 makes the link explicit rather than adding a second writer. EGC.3 asserts the whole inventory, not the new pages only |

---

## 9. Adversarial review of this PRD

Ten attacks. Four changed the document; the changes are applied above.

**1. "Zero migrations is a slogan — `contexts` has no archive column, so you either delete
destructively or you ship create-only."** **Conceded, and it produced EGC-DEC-1.** The first
draft assumed CRUD symmetry. The cascade on `task_contexts`/`person_contexts` makes delete
genuinely destructive, and archiving needs a column. The honest resolution is to ship
create-and-edit, name deletion as deferred with its blast radius written down, and let the
owner decide — not to quietly ship a delete button over a cascade.

**2. "You are adding a write surface to five tables that hold direct `authenticated`
grants — this is exactly what Phase 2F spent six slices removing."** **Answered, and the
answer is narrower than the attack assumes.** Phase 2F's invariant is scoped to
`public.tasks` plus the bounded `reminders` exception, and its problem was *two* write paths
to one table. These five tables have *zero* user paths and will have one. The house
precedent for these specific entities was set by UX Slice F2 two days ago — Server Action +
Zod + audit — and EGC-INVARIANT-003 keeps the guard green and unchanged. What the attack
does earn: **EGC-AUDIT-003**, which states plainly that the audit row is self-reported and
must never be described as database-enforced.

**3. "`related_person_id = null` meaning 'the owner' is an undocumented sentinel that will
be misread."** **Partly conceded.** It is a real semantic overload and nothing in the schema
records it. It is not new — the column has meant this since `202607160009` — and inventing
an owner `people` row instead would create a fake person in every people list. Mitigation
added to EGC-REL-001: the meaning is stated in the PRD, in the vocabulary module's header,
and in `DATABASE.md` at closeout.

**4. "Soft-end means a mistaken association can never be truly removed, and there is no
surface showing the history you are preserving."** **Conceded as a real cost, recorded as
EGC-DEC-2** rather than argued away. Soft-end is still right — it is what the readers and
the partial unique indexes already assume — but the tradeoff is now explicit.

**5. "A person can be associated with a project twice — once by the trigger, once by hand."**
**Refuted by the schema.** `person_projects_current_idx` is `unique (person_id, project_id)
where valid_until is null` (`202607160011:1`), and `link_interpreted_entities` uses
`on conflict … do nothing`. A manual add after a trigger add collides; EGC-ASSOC-007's
application check turns that into a localized "already linked" rather than a `23505`.

**6. "The trigger writes `confidence` from the AI's score; your manual rows write 1, so the
two populations are indistinguishable."** **Partly conceded.** They are distinguishable by
value in practice (AI rows are rarely exactly 1) but not reliably. EGC-REL-010 fixes the
*display* question — confidence is never surfaced for user-authored rows, because a fact the
user typed is not a scored inference — and the provenance question is left explicitly
unsolved rather than papered over. Solving it properly needs a column.

**7. "This is UI work dressed as an initiative; fold it into Phase 2G."** **Rejected on the
prior study's own rule.** Phase 2G would then carry two acceptance questions sharing no
architecture, no contract and no evidence — the grab-bag shape `PHASE_2G_DEFINITION.md` §6
already rejected for the unbounded Alternative C.

**8. "EGC-INVARIANT-004 is unfalsifiable — 'no section without a reachable path' cannot be
asserted by a test."** **Partly conceded, and it sharpened EGC.3.** It cannot be asserted in
general. It *can* be asserted as an enumerated inventory: every card component that renders
a relationship or association collection is listed, and each is required to name the control
or route that writes it, in the ADR-066 shape — an assertion run over the whole route
inventory rather than a reviewer's reading. That is what EGC.3 delivers, and the plan says
so explicitly.

**9. "Contexts are reachable from tasks already — you are building a second surface for
something that works."** **Answered, and it produced EGC-CTX-006.** Task↔context linking
does exist through the candidate editor and `assign_context`. What does not exist is
*creating a context at all* and *linking a context to a person*. The context detail page
therefore **links** to tasks and does not offer a second way to create task links.

**10. "You will raise the localization-ternary count exactly like the last four slices did."**
**Conceded as the most likely process failure**, given it has already happened four times
without detection. EGC-SURFACE-002 plus an EGC.3 non-increase assertion — the guard the UX
audit proposed and nobody built. It ships here even though the sweep itself stays deferred.
