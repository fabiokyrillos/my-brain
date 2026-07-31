# Entity Graph Findings

**A new, separately-named record. It does not reopen the product UX/UI remediation.**

The UX initiative is COMPLETE and its accounting is final: 35 findings, 30 RESOLVED,
4 RETAINED, 1 DEFERRED, 0 OPEN, 0 PARTIAL, 0 BLOCKED, closed at `864d39c`.
`docs/reports/PRODUCT_UX_FINDINGS.md` and `docs/reports/PRODUCT_UX_CLOSEOUT.md` are not
edited by this record, no disposition is changed, and no count moves. These are
**post-closeout findings from real owner use**, filed here so the closed ledger stays
closed and this evidence still has a durable home.

- **Origin** — owner review of the Person detail/edit surface (the "Camila" session), 2026-07-31.
- **Baseline** — `main` at `a745011`, parity `202607310064`.
- **Status** — findings and dispositions only. Nothing here is authorized.
- **Relationship to prior findings** — adjacent to the closed UX-04, UX-08 and UX-09.
  Those were resolved *as scoped*: UX-08/UX-09 scoped themselves to surfacing existing
  **columns**, explicitly deferring **new write surfaces** (`DEC-4`), and UX-04 scoped
  itself to not linking what it cannot open. This record is about the **relationship
  tables and entity lifecycle** those findings did not cover. No prior disposition was wrong.

---

## 1. The finding in one sentence

The Person detail page reads four relationship surfaces — relationship to owner, contexts,
pending tasks, shared projects — from tables that `authenticated` can already fully write,
under forced RLS with composite-foreign-key ownership proof, and **no write surface exists
for any of them**; one of those tables has never been written by anything at all.

---

## 2. Verified capability and write posture

Every row verified against the migration chain in this session.

| Object | Schema source | RLS | `authenticated` grants | `anon` | Ownership proof | **Write path today** | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public.organizations` | `202607160003:12-20` — `id, user_id, name, description, created_at, updated_at`; unique `(user_id, lower(name))` | enabled **+ forced**, 4 own-row policies (`:185-197`) | `select, insert, update, delete` | revoked | `user_id` + RLS | **AI extraction only.** `loadOrganizationOptions` (`entities/organizations.ts:33`) reads; nothing in the product creates one | none |
| `public.contexts` | `202607160003:1-10` — `id, user_id, name, description, kind ('work'\|'personal'\|'custom'), created_at, updated_at`; unique `(user_id, lower(name))` | enabled **+ forced**, 4 own-row policies | `select, insert, update, delete` | revoked | `user_id` + RLS | **AI extraction only.** Read by `work-projection.ts:239`, `interpretations/data.ts:257`, the Person page | none |
| `public.person_relationships` | `202607160009:6-13` — `id, user_id, person_id, related_person_id (nullable), relationship_type (text, no CHECK), description, valid_from, valid_until, confidence, created_at` | enabled **+ forced**, 4 own-row policies (`:60-73`) | `select, insert, update, delete` | revoked | **composite FKs** `(user_id, person_id)` and `(user_id, related_person_id)` → `people (user_id, id)` (`202607170016:74-78`) | **none — nothing has ever written this table.** No trigger, no RPC, no Server Action, no extraction path. Read at `people/[personId]/page.tsx:40` | none |
| `public.person_contexts` | `202607160009:14-19`; unique `(person_id, context_id)` where `valid_until is null` (`202607160011:2`) | enabled **+ forced**, 4 own-row policies | `select, insert, update, delete` | revoked | composite FKs to `people` **and** `contexts` (`202607170016:79-83`) | **trigger only** — `link_interpreted_entities` (`202607160011`) co-inserts from `entry_entities`. No user path | none |
| `public.person_projects` | `202607160009:20-27`; unique `(person_id, project_id)` where `valid_until is null` (`202607160011:1`) | enabled **+ forced**, 4 own-row policies | `select, insert, update, delete` | revoked | composite FKs to `people` **and** `projects` (`202607170016:84-88`) | **trigger only** — same. No user path | none |
| `people.organization_id` | `202607160003:38`, FK → `organizations`, `on delete set null` | via `people` | writable | — | FK | **`updatePerson`** (`entities/actions.ts:152`) — Server Action + Zod + `audit_logs` row (Slice F2) | **yes** |
| `projects.organization_id` | `202607160003:25`, same shape | via `projects` | writable | — | FK | **`updateProject`** (`entities/actions.ts:92`) — same shape | **yes** |
| `person_projects.role` | `202607160009:22` — `role text`, nullable, no CHECK | via table | writable | revoked | — | **none.** `link_interpreted_entities` never sets it, so it is structurally always `null`; both detail pages select it (`people/[personId]/page.tsx:34`, `projects/[projectId]/page.tsx:32`) | none |

### 2.1 The three facts that decide the disposition

1. **No migration is required for any of the requested lifecycle.** All eight objects
   already carry the grants, the forced RLS, the own-row policies and the ownership
   constraints. There is no missing column, no missing table, no missing privilege.
2. **`person_relationships` is read but never written by anything.** The Person page
   renders a section fed by a table with zero writers. That is not an empty state — it is
   a section that can only ever be empty.
3. **`person_projects.role` is displayed on two pages and can only ever be `null`,**
   because the sole writer never sets it.

### 2.2 Archive / end-of-relationship semantics already exist

All three relationship tables carry `valid_from` / `valid_until`, and every consumer
already filters `.is("valid_until", null)`. **Ending a relationship is a soft-end, already
modelled and already read correctly** — it needs a control, not a schema. The partial
unique indexes (`… where valid_until is null`) already enforce "at most one live link per
pair", which is exactly the constraint an end-and-recreate flow needs.

---

## 3. Owner observations, each with a verified disposition

| ID | Owner observation | Verified? | Disposition |
| --- | --- | --- | --- |
| **EG-01** | No UI to record that Camila is the owner's wife | **Confirmed** | Missing UI. `person_relationships` with `related_person_id = null` already means "related to the owner"; `relationship_type` and `description` both exist |
| **EG-02** | No UI to add or edit `person_relationships` | **Confirmed** | Missing UI over full CRUD grants. No writer of any kind exists |
| **EG-03** | No UI to create an organization | **Confirmed** | Missing UI. `createRecord` (`operations/actions.ts:122`) handles `task`, `project`, `person`, `memory` — `organization` and `context` are absent from the union |
| **EG-04** | The Company selector says no organizations exist and offers no path to create one | **Confirmed** | Missing UI, and the worst of the nine: a selector that reports emptiness as a fact while owning no remedy is a dead end presented as a choice. `organizations.ts:12-18` documents the read-only decision explicitly |
| **EG-05** | No Organizations list or detail route | **Confirmed** | Missing UI. The route inventory has no `organizations` segment at any level |
| **EG-06** | No Contexts list or detail route | **Confirmed** | Missing UI. Same |
| **EG-07** | No UI to assign contexts to a person | **Confirmed** | Missing UI. `person_contexts` is writable and trigger-populated only |
| **EG-08** | `projects.organization_id` exists but there is no coherent way to create an organization and associate a project with it | **Confirmed, and half-resolved** | The *association* shipped in Slice F2 (`updateProject` writes `organization_id`, audited). The *creation* did not, so the association is reachable only for organizations the AI happened to extract |
| **EG-09** | Empty relationship/context cards imply supported lifecycle the user cannot reach | **Confirmed — and this is the governing finding** | The page advertises four capabilities and provides zero paths to any of them. It is the same defect class the UX remediation existed to remove |

---

## 4. Is this missing UI, or missing domain capability?

**Missing UI, in eight of nine cases.** The domain model is complete, owned, constrained
and already read by the product. Nothing about the requested lifecycle is unrepresentable.

**One genuine gap, and it is not a column — it is a vocabulary.**
`person_relationships.relationship_type` is bare `text` with **no CHECK anywhere in the
chain** and no TypeScript vocabulary, and the Person page renders it raw
(`people/[personId]/page.tsx:111` — `<strong>{relationship.relationship_type}</strong>`).
The owner's "Wife / Esposa" requires a **typed, localized relationship vocabulary**.

This repository's answer to that shape is a typed vocabulary module, not a constraint —
`TASK_STATUSES`/`TASK_PRIORITIES` (`task-commands/taxonomy.ts`), `history/vocabulary.ts`
(whose header records that `audit_logs.entity_type` deliberately carries no CHECK because
the table is append-only and older rows must stay readable), and **ADR-064**, which decided
that cross-feature object state gets one shared typed vocabulary while per-feature modules
stay. Following that precedent keeps the work at **zero migrations**. Adding a CHECK
instead would be a migration, would be permanent, and would make any future extraction-written
relationship type a hard insert failure rather than a rendering fallback.

---

## 5. The Camila scenario, checked against the schema

| Requirement | Representable today? | Mechanism | What is missing |
| --- | --- | --- | --- |
| Person: Camila | **Yes** | `people` row via `createRecord` kind `person` | nothing |
| Relationship to owner: Wife / Esposa | **Yes, with zero schema change** | `person_relationships { person_id: Camila, related_person_id: null, relationship_type: 'spouse', description: optional, valid_from: now() }` — the nullable `related_person_id` *is* "related to the owner" | a write surface + a localized vocabulary |
| Context: Personal / Family | **Yes** | `contexts { name: 'Pessoal', kind: 'personal' }` — `personal` is already a `contexts_kind` literal — plus a `person_contexts` link | a context create surface + an association control |
| Company: optional, independent | **Yes, already writable** | `people.organization_id` via `updatePerson`, audited (Slice F2) | an organization **create** path (EG-03/EG-04) |

**The model already separates a personal relationship from an employer.** `people.organization_id`
and `person_relationships` are different columns on different tables with different
semantics. The product implies otherwise only because the edit form surfaces Company and
nothing else. **This is a UI-composition defect, not a domain defect** — and it means the
fix cannot be "add a relationship field to the person form", because the right home for it
already exists and is a table.

---

## 6. Why read-only routes are insufficient

The prior recommendation (`PHASE_2G_DEFINITION.md` §11, Decision 11) proposed
organizations and contexts as a later **read-only** list/detail slice. That recommendation
was made before this evidence and is now wrong, for three reasons that are each checkable:

1. **Read-only does not clear the dead end.** EG-04's Company selector is empty because
   nothing can create an organization. A read-only organizations page would render the same
   emptiness on a second screen and still offer no remedy.
2. **The tables the owner needs are relationship tables, not entity tables.**
   `person_relationships`, `person_contexts` and `person_projects` are *associations*; a
   detail page for organizations and contexts does not touch any of them. Read-only routes
   address EG-05 and EG-06 and none of EG-01, EG-02, EG-07, EG-08, EG-09.
3. **It would leave the page still lying.** EG-09 is the governing finding: four sections
   advertise lifecycle behaviour with no reachable path. Adding routes that also cannot
   write leaves that untouched.

**The honest scope is create + read + update + soft-end**, over surfaces that do not exist
at all — not "detail routes".

---

## 7. Write posture the completion must follow

The house precedent for these entities was set two days ago by UX Slice F2 and should be
followed rather than re-litigated: **Server Action + Zod validation + an `audit_logs` row**
(`entities/actions.ts:92-150` and `:152-200`). Not the task-command RPC contract — that
contract exists because `public.tasks` needed *one* write path after having two, which is a
problem these tables do not have.

Two properties must be stated rather than assumed, because both are inherited:

- **The audit row is self-reported.** `updateProject`/`updatePerson` insert into
  `audit_logs` from the client role, and `authenticated` retains `INSERT` on that table
  (`202607170028:33` says otherwise and is corrected in `DATABASE.md`/`SECURITY.md` by
  2F-TESTMIG-007). Extending this posture is consistent; claiming it is
  database-enforced would not be.
- **Phase 2F's invariant is not threatened.** That invariant is scoped to `public.tasks`
  (plus the bounded `public.reminders` Option C exception) and is guarded by
  `src/lib/supabase/direct-write-guard.test.ts`, whose `tasks` allowlist is empty. None of
  the eight objects here is `tasks` or `reminders`, and none of this work adds a writer to
  either. The guard must stay green and unchanged.

---

## 8. What this record does **not** authorize

- **No new persisted fields.** Verified: the entire requested lifecycle needs zero new
  columns. This record is evidence *for* the existing "surface before you add" rule, not
  against it, and it does **not** resolve `PHASE_2G_DEFINITION.md` Decision 9 (project
  purpose / start / target). Those remain out, on unchanged grounds.
- **No CHECK constraint on `relationship_type`** (§4).
- **No `related_person_id` person-to-person relationship graph** beyond what the existing
  nullable column already permits — "Camila is my wife" needs no second person row.
- **No changes to the closed UX ledger.** §0.
