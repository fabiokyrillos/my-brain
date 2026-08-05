# EGC G-0.2 — Reachability inventory

**Pre-code gate G-0.2** of `ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md`. Enumerates
every surface that renders a relationship or association collection, with the control or
route that writes it.

This inventory **is** `EGC-INVARIANT-004`'s assertion input. The PRD's adversarial review
(attack 8) established that *"no section renders without a reachable path"* cannot be
asserted in general — only over an enumerated set. This is that set.

- **Measured** — 2026-07-31, from `main` at `4071a2f`.

---

## 1. Person detail — `/{locale}/app/people/{personId}`

| # | Section | Data source | Writer reachable by the user today? |
| --- | --- | --- | --- |
| 1 | Relationships | `person_relationships` | **NO — nothing writes this table at all** (G-0.1 §4) |
| 2 | Contexts | `person_contexts` | **NO — trigger only** |
| 3 | Open work and tasks | `task_people` | **yes** — candidate editor, and the `assign_person` command verb |
| 4 | Shared projects | `person_projects` | **NO — trigger only** |
| 5 | Memories | `memories` | **yes** — `/app/memories`, and `createRecord` kind `memory` |
| 6 | Timeline | `entry_entities` | **yes** (derived) — produced by capture and interpretation |
| — | Company field | `people.organization_id` | **partially** — the field is writable via `updatePerson` (Slice F2), but the selector's option list can only be populated by the extraction pipeline, so it is a dead end when empty (`EG-04`) |

## 2. Project detail — `/{locale}/app/projects/{projectId}`

| # | Section | Data source | Writer reachable today? |
| --- | --- | --- | --- |
| 1 | Tasks | `task_projects` | **yes** — candidate editor, `assign_project` |
| 2 | People | `person_projects` | **NO — trigger only** |
| 3 | Timeline | `entry_entities` | **yes** (derived) |
| — | Company field | `projects.organization_id` | **partially** — same as above |

## 3. Entity types with no route at all

| Entity | List route | Detail route |
| --- | --- | --- |
| `organizations` | **none** | **none** |
| `contexts` | **none** | **none** |

Confirmed against the full route inventory (`find src/app -name page.tsx`): no
`organizations` and no `contexts` segment exists at any level.

## 4. The unreachable set

**Four of the nine collection sections above have no user-reachable write path**, and they
resolve to exactly three tables:

- `person_relationships` — Person §1
- `person_contexts` — Person §2
- `person_projects` — Person §4 **and** Project §2

Plus two entity types with no surface at all, and one field (`organization_id`) that is
writable but whose option list is not.

**This is `EG-09` as an enumeration.** The page advertises capabilities and provides no path
to any of them — and the enumeration is what makes that assertable instead of arguable.

## 5. What EGC.3 will assert against this

For every row in §1 and §2, after the initiative:

> the section either names the control or route that writes it, or it does not render.

Rows 3, 5 and 6 of Person and rows 1 and 3 of Project are **already** satisfied and must
stay satisfied — they are in the inventory precisely so the assertion runs over the whole
surface rather than only over what this initiative touches. `EGC-CTX-006` records that task
association is deliberately **not** re-implemented: the context detail page links to those
tasks and does not offer a second way to create the link.

## 6. Baseline honesty

This inventory is the **pre-EGC** state. It will be re-measured at EGC.3 from the
filesystem rather than from this document, in the shape ADR-066 established for the UX
closeout sweep — because an inventory that asserts itself proves nothing, which is the
lesson `PHASE_2F_SLICE_05_REPORT.md` paid four review cycles for.
