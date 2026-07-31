# Entity Graph Completion — Implementation Plan

**Revision 1** · 2026-07-31 · Governs [`ENTITY_GRAPH_COMPLETION_PRD.md`](./ENTITY_GRAPH_COMPLETION_PRD.md) Revision 1.

**Status — AWAITING OWNER APPROVAL. No implementation may begin.**

Three slices, executed in order. Each ends in a merged PR with a green merge-SHA CI run on
all three jobs, and no slice may open before its predecessor is merged.

---

## 0. Pre-code gates

**No slice may start until all four are in the repository as artifacts.** This is the
`PHASE_2F_PROPOSAL.md` §15 rule: no code before its gate's artifact exists.

| Gate | Produces | Why it must precede code |
| --- | --- | --- |
| **G-0.1 — writer inventory** | A committed list of every module that writes `organizations`, `contexts`, `person_relationships`, `person_contexts`, `person_projects` today | EGC-ASSOC-003 requires one writer per contract. The inventory establishes the baseline the architecture test will pin. Expected result: the `link_interpreted_entities` trigger and nothing else |
| **G-0.2 — reader inventory** | Every component that renders a relationship or association collection, with the control or route that writes it (blank today) | This *is* EGC-INVARIANT-004's assertion input. Attack 8 of the PRD's review established it cannot be asserted in general, only over an enumerated set |
| **G-0.3 — migration-head pin** | A test asserting the chain head is `202607310064` | EGC-INVARIANT-001. It must exist before the first commit, or it proves nothing |
| **G-0.4 — locale-ternary baseline** | The measured count from `git grep -oE '\bpt \?' -- src/` excluding tests, committed as the pinned ceiling | EGC-SURFACE-002. Expected 266 per the UX closeout; **measure, do not assume** |

---

## Slice EGC.1 — Organizations and Contexts

**Delivers:** EGC-ORG-001…007, EGC-CTX-001…006, EGC-AUDIT-001…004 (organizations and
contexts), EGC-SURFACE-001…005 for the new routes, EGC-INVARIANT-001/002/005.

**Migration: none.**

### Tasks

| # | Task | Notes |
| --- | --- | --- |
| 1.1 | Extend `src/features/entities/schema.ts` with `organizationCreateSchema`, `organizationUpdateSchema`, `contextCreateSchema`, `contextUpdateSchema` | Bounds mirror the column CHECKs exactly: org name 1–160, context name 1–120, `kind` ∈ the three literals. Bounds are **read from a shared constant**, not retyped |
| 1.2 | Add `createOrganization`, `updateOrganization`, `createContext`, `updateContext` to `src/features/entities/actions.ts` | The `updateProject` shape: `require-user` → Zod → ownership predicate → write → `audit_logs` row → `revalidatePath` both locales. Unique-violation → localized "already exists", never a raw error |
| 1.3 | `src/features/entities/organizations.ts` — add `loadOrganizations` (list, paginated) beside the existing `loadOrganizationOptions` | The existing read-only header comment (`organizations.ts:12-18`) says "nothing here creates an organization"; it is updated, not left lying |
| 1.4 | New `src/features/entities/contexts.ts` — `loadContexts`, `loadContextOptions` | `loadContextOptions` mirrors `relation-options.ts`'s bounded 200-row shape for EGC-ASSOC-008 |
| 1.5 | Routes: `app/organizations/page.tsx`, `app/organizations/[organizationId]/page.tsx`, `app/contexts/page.tsx`, `app/contexts/[contextId]/page.tsx` | Detail pages read owner-scoped; a foreign id renders not-found |
| 1.6 | `src/features/entities/copy.ts` — all new copy, typed, both locales | EGC-SURFACE-002. Zero new inline ternaries |
| 1.7 | `src/features/shell/capabilities.ts` — classify both routes and their detail children | EGC-SURFACE-001 |
| 1.8 | `src/features/history/vocabulary.ts` — add `organization` and `context` entity types | EGC-AUDIT-002. Localized phrase per type, plus the unknown-value fallback test |
| 1.9 | Create-and-select on the Company selector (Person and Project edit forms) | EGC-ORG-005/006. Two writes; a failed assignment after a successful create reports honestly |
| 1.10 | UX-04's outcome section stops degrading organizations and contexts to plain text | Both now have routes to link to |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| A1 | Migration-chain head still `202607310064` (G-0.3 green) |
| A2 | pgTAP: grants and policies on `organizations` and `contexts` byte-identical to the pre-slice catalog — **non-vacuously**, by asserting a known-present grant before asserting nothing changed |
| A3 | `direct-write-guard.test.ts` unchanged, `tasks` allowlist still empty |
| A4 | An organization created on the Person form is selectable **in the same action**, and the resulting `people.organization_id` is the created row |
| A5 | Two owners: each sees only their own organizations and contexts; the stranger's absence asserted **after** the owner's positive count |
| A6 | A duplicate name returns a localized message, not a `23505` |
| A7 | `audit_logs` rows exist for every create and update, with `actor = 'user'` and no user content beyond the changed fields |
| A8 | Locale-ternary count ≤ the G-0.4 baseline |
| A9 | Desktop + Pixel 7 journeys, both locales, on all four new routes |
| A10 | Lint 0, typecheck 0, full Vitest green, production build exit 0 |

---

## Slice EGC.2 — Person Relationships and Associations

**Delivers:** EGC-REL-001…010, EGC-ASSOC-001…008, EGC-AUDIT for the three relationship
tables, EGC-INVARIANT-003/004 (partial), EGC-DEC-2's soft-end semantics.

**Migration: none.**

### Tasks

| # | Task | Notes |
| --- | --- | --- |
| 2.1 | New `src/features/entities/relationship-vocabulary.ts` — the typed, localized relationship taxonomy, its version constant, and `describeRelationshipType()` with the unknown-value fallback | EGC-REL-002/004/006. Header records the `related_person_id = null` semantics (PRD review, attack 3) |
| 2.2 | Policy-lock test digesting the **term mappings**, not the database literals | EGC-REL-003. This is the exact defect Slice 2E.8 found; the test must fail if a member is re-pointed |
| 2.3 | `src/features/entities/relationships.ts` — the single writer for `person_relationships`: `createOwnerRelationship`, `updateOwnerRelationship`, `endOwnerRelationship` | Soft-end sets `valid_until`; no delete exists in the module |
| 2.4 | `src/features/entities/associations.ts` — the single writer for `person_contexts` and `person_projects`: `associatePersonContext`, `associatePersonProject`, `endPersonContext`, `endPersonProject`, `updatePersonProjectRole` | EGC-ASSOC-003: Person and Project surfaces both call this module. No second path |
| 2.5 | Architecture test: exactly one module writes each of the three relationship tables | EGC-ASSOC-003, R3. Exact-set comparison in both directions |
| 2.6 | Person detail/edit surface: relationship section (add / edit / end), context association, project association with `role` | EGC-REL-009 renders Company and relationship-to-owner as visibly distinct concerns |
| 2.7 | Project detail surface: person association with `role`, and removal | Same contract as 2.6 |
| 2.8 | `src/features/history/vocabulary.ts` — add `person_relationship`, `person_context`, `person_project` | EGC-AUDIT-002 |
| 2.9 | Copy module extension; zero new inline ternaries | EGC-SURFACE-002 |
| 2.10 | Confidence written as `1`, never surfaced | EGC-REL-010 |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| B1 | **The Camila scenario, executed end to end:** create Camila → record relationship *spouse* → create context *Pessoal* (kind `personal`) → associate → optionally create and attach a company → all four visible on the Person page, in both locales |
| B2 | Ending a relationship sets `valid_until` and removes it from the page; **the row still exists**, asserted directly |
| B3 | Re-adding an ended association succeeds and produces exactly one live row |
| B4 | A relationship type stored directly with an unknown value renders its raw value without throwing (EGC-REL-006) |
| B5 | Duplicate live association refused with a localized message, not a `23505` |
| B6 | Cross-owner: a foreign `person_id`, `context_id` or `project_id` is refused by the application check **and** would be refused by the composite FK — both asserted |
| B7 | One writer per table, proven by the architecture test in both directions |
| B8 | The policy-lock fails when a vocabulary member is re-pointed — proven by executing a mutation, not by reading the test |
| B9 | Migration head unchanged; grants/policies on all three tables byte-identical |
| B10 | `audit_logs` rows for every relationship and association write |
| B11 | Locale-ternary count ≤ baseline |
| B12 | Desktop + Pixel 7, both locales |
| B13 | Lint 0, typecheck 0, Vitest green, build exit 0 |

---

## Slice EGC.3 — Convergence and Closeout

**Delivers:** EGC-INVARIANT-004 (complete), EGC-OPERATIONS-001…005.

**Migration: none. No product source change expected** — if the convergence audit finds a
defect, the fix is filed and made, and the slice says so rather than staying "clean".

### Tasks

| # | Task | Notes |
| --- | --- | --- |
| 3.1 | **The reachability assertion.** Every card component rendering a relationship or association collection is enumerated (from G-0.2, refreshed) and each must name the control or route that writes it. Run over the whole route inventory, ADR-066's shape | This is EGC-INVARIANT-004. The PRD's review (attack 8) established it is assertable only as an enumerated inventory |
| 3.2 | Locale-ternary **non-increase guard**, committed as a permanent test | The guard the UX audit proposed and nobody built. Ships here even though the sweep stays deferred |
| 3.3 | `scripts/generate-egc-traceability.mjs` → `docs/reports/EGC_TRACEABILITY_MATRIX.md`, fail-closed on PRD drift | EGC-OPERATIONS-001 |
| 3.4 | `scripts/verify-egc-cleanup.mjs` — zero fixture residue across the five tables plus `audit_logs` | EGC-OPERATIONS-002 |
| 3.5 | **Serialized** full authenticated journey run (the P1 method), reported independently | EGC-OPERATIONS-003. Serialization is what stopped shared-project auth rate-limiting during Slice H |
| 3.6 | `SECURITY.md` section: the extended write surface, the self-reported audit posture, and the explicit "no grant or policy changed" statement with its pgTAP citation | EGC-OPERATIONS-004, EGC-AUDIT-003 |
| 3.7 | Convergence audit: one contract per relationship table, one copy module, one vocabulary, no duplicated selector logic between Person and Project | The Phase 2C/2D/2E/2F closeout precedent. **File what it finds; smooth nothing** |
| 3.8 | `docs/reports/EGC_REPORT.md` — final accounting, every requirement delivered or traceably deferred |

### Acceptance gates

| Gate | Must show |
| --- | --- |
| C1 | The reachability assertion passes over the **whole** route inventory, not the new pages only |
| C2 | The non-increase guard fails when a ternary is deliberately added — proven by executing the mutation |
| C3 | Traceability matrix regenerates content-identically twice |
| C4 | Cleanup verifier exits 0 with zero residue |
| C5 | Serialized authenticated set green, desktop + Pixel 7, both locales |
| C6 | Migration head still `202607310064`, before and after |
| C7 | Merge-SHA CI green on all three jobs |

---

## 1. What this plan explicitly does not do

- No migration, in any slice. If one becomes necessary, **the slice stops** and the PRD is
  amended by owner decision — the invariant is not negotiated inside a branch.
- No deletion of organizations or contexts (EGC-DEC-1).
- No hard delete of any relationship or association row (EGC-DEC-2).
- No new product event, no allowlist widening.
- No provider call.
- No change to `public.tasks` or `public.reminders`, their grants, or the direct-write guard.
- No BYOK work, no credential surface, no signup change. **Separate branches, separate
  commits, separate PRs**, per the owner's instruction.
- No Phase 2G requirement, artifact, or code.

## 2. Branch and PR discipline

- One branch per slice: `codex/egc-slice-1`, `-2`, `-3`.
- Small, thematic commits; no mixing of cleanup, formatting or dependency changes with
  feature work.
- Each PR body carries its acceptance-gate table with executed evidence, not intentions.
- Merge-SHA CI must be green on the merge commit, not only on the branch head — the
  correction Phase 2F's closeout had to make twice.
