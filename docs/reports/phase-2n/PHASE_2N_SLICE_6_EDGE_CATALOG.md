# Phase 2N slice 2N.6 — the closed edge catalogue, and the verdict on `2N-RELATION-011`

Written **before any product code**. It measures what the schema can actually
support as an edge, decides per candidate whether it may be **drawn**, may only
be **listed**, or may not exist at all — and then answers the refusal clause the
authorization carries.

`main` at `dbe6cdf`, clean. **94 local = 94 hosted, parity `202608140094`**, read
live. Budget `3 allocated · 2 spent (M1, M3)`; **M2 stays with 2N.7** and a
fourth migration is a **STOP CONDITION**.

---

## 0. Three measurements that decide the slice

### 0.1 There is no person-to-person edge in this product

`person_relationships.related_person_id` is nullable and **every writer sets it
to `null`**. The only application writer (`relationships.ts:135`) writes it
explicitly, and `relationship-vocabulary.ts:9-15` records why: *a null there is
not missing data, it means related **to the owner***. Across all 94 migrations
the only `insert into public.person_relationships` is M3's undo restore
(`202608140094:768`), which restores rows that already existed.

So the table is a **star centred on the owner**, not a person graph. A drawn
line between two people would be an invention, and this catalogue refuses one.

### 0.2 `OD-2N-8` **A**'s premise does not hold in the tree — T-3 is live

`OD-2N-8` **A** signs *"only owner-authored relations persist… nothing inferred
is persisted automatically"*, and the threat model states plainly that this
signature — not the graph's own design — is what makes `OD-2N-10` **B**
acceptable:

> **What makes it acceptable is T-3's signature, not the graph's own design.**
> Under `OD-2N-8` A no inferred relation exists to be drawn.

**Measured against `main`, that is false for two of the three relation tables.**
`202607160011:4-38` creates `link_interpreted_entities` and the
`entry_entities_link_timelines` **after insert** trigger. On every interpretation
that extracts a person together with a project or a context, it inserts a
`person_projects` / `person_contexts` row carrying
`confidence = least(personConfidence, otherConfidence)` — a **co-mention**,
persisted automatically, with no provenance. That is `OD-2N-8`'s **refused option
C**, and the trigger has never been dropped: it appears in no `drop trigger`, no
`drop function`, and is still named as the live writer in the EGC writer
inventory.

`entry_entities` is written by the live interpretation RPC
(`202607160005:69-103` and its successors), so the path is the product's primary
flow, not a legacy one.

**Removing the trigger is a migration, and a fourth migration is a stop
condition.** So 2N.6 cannot repair the *persistence*. What it can and must repair
is the *claim*, and what it must refuse is to draw what it cannot explain.

### 0.3 The claim is already wrong on a shipped surface

`association-panel.tsx:163-167` renders
`ownerAuthored("person_contexts" | "person_projects")` — **"Informado por você" /
"Informed by you"** — for **every** association row on the person page and the
project page, including rows the trigger created. The comment above it
(`:155-161`) justifies the claim as *"owner-authored by construction: neither
table carries a `source_entry_id` or an `interpretation_id`, so there is nothing
else the origin could be"*.

**That reasoning confuses the absence of a provenance column with the absence of
another writer.** `provenance/contracts.ts:33-35` carries the same sentence in
its header (*"the only writers are the owner's own actions"*). It is true of
`person_relationships` and false of the other two.

This is a live `2N-RELATION-002` / `-008` / `-009` defect on a surface 2N.1 and
2N.2 shipped, and it is squarely inside 2N.6's requirement family. It is the
same shape as the defect 2N.5's census found: the protected thing was correct,
and the leak was one step to the side.

### 0.4 The discriminator that exists, with no new authority

The owner's own creation actions write an audit row; the trigger writes none:

| Writer | `audit_logs` row |
| --- | --- |
| `associatePersonContext` | `action_type='associate_person_context'`, `entity_type='person_context'`, `entity_id=<row id>` |
| `associatePersonProject` | `action_type='associate_person_project'`, `entity_type='person_project'`, `entity_id=<row id>` |
| `link_interpreted_entities` (trigger) | **none** |

Three facts make this usable rather than merely available:

1. **`audit_logs` is exempt from every retention sweep, by decision** —
   `202608050077:45` names it under *"WHAT IS NOT SWEPT, AND WHY THAT IS A
   DECISION"* (SH-RETENTION-006). The proof does not decay.
2. **The index already exists** — `audit_logs_user_entity_idx on (user_id,
   entity_type, entity_id)` (`202607160003:142`). No index is created.
3. **`authenticated` already reads it** under forced RLS, own rows only; the
   project page reads it today.

**The discriminator is narrow on purpose.** Only the two `associate_*` action
types count. `update_person_project_role` and `end_person_*` also write rows with
the same `entity_type` and `entity_id`, and treating either as proof of
*authorship* would be inference: editing a role on a link the trigger created is
not the same as having created it.

**It proves in one direction only.**

- audit row present → **owner-authored**, by positive proof.
- audit row absent → **not attributable**. Either the trigger created it, or an
  owner action created it and its best-effort audit insert failed (`associations.ts`
  logs and continues). Nothing distinguishes them, so the product says so and
  claims nothing.

The false-negative direction is the safe one: it understates what is known and
never fabricates an origin.

---

## 1. The catalogue

Every candidate the schema offers, measured. `owner scope` is `user_id not null`
+ forced RLS + own-row policies + composite FK on every row below unless stated.

### E1 — person → the owner · **`person_relationships`**

| Field | Measurement |
| --- | --- |
| Source table | `public.person_relationships` (`202607160009:6-12`) |
| Owner scope | `user_id` + forced RLS + composite FK `(user_id, person_id)` → `people` (`202607170016:78`) |
| Source node | `person` |
| Target node | `owner` — the pseudo-node, because `related_person_id` is always `null` |
| Direction | **Real, and carried by the label, not by geometry.** `manager` = "this person is my manager"; `report` = "reports to you". The line itself is undirected; the term states the direction |
| Label | `describeRelationshipType(locale, relationship_type)`; a value outside the closed 14-member vocabulary renders raw and neutral, never guessed |
| State | live iff `valid_until is null`; the readers already filter it |
| Role | n/a — the type *is* the role |
| Description | `description` — owner free text. **Not carried onto this surface** (§2.3) |
| Provenance | **owner-authored, by construction.** No trigger, no RPC and no worker writes this table |
| Sensitivity | label is a localized vocabulary term, carries no user content |
| Validity | `valid_from`, `valid_until` |
| Open source | **none.** No `source_entry_id` exists to open |
| Entity removed | the person row is absent from the resolved map → the edge and its node are dropped entirely |
| Foreign / unreadable | **the same arm**, by construction: the projection resolves ids through one owner-scoped read, and removed, foreign and unread are all *absent from the result* |
| Action available | correct / end, on the person page |
| **May be drawn** | **YES** |
| Classification | **aresta explicável** |

### E2 — person ↔ project · **`person_projects`**

| Field | Measurement |
| --- | --- |
| Source table | `public.person_projects` (`202607160009:20-26`) |
| Owner scope | as above, composite FKs to `people` **and** `projects` |
| Nodes | `person` ↔ `project` |
| Direction | **None.** No column asserts one, and the same row renders on both pages |
| Label | `role` when present (the owner's own word), otherwise the association term |
| State | live iff `valid_until is null`; partial unique index on the live pair |
| Provenance | **two writers, undecidable from the row.** `associatePersonProject` (owner, audited) and `link_interpreted_entities` (trigger, co-mention, unaudited). Resolved by §0.4 |
| Sensitivity | `role` is free text; renders exactly as the person and project pages render it (§2.3) |
| Validity | `valid_from`, `valid_until` |
| Open source | **none** |
| Entity removed / foreign / unreadable | one arm, as E1 |
| Action available | edit role / end, on the person or project page |
| **May be drawn** | **only where §0.4 proves owner authorship** |
| Classification | proved → **aresta explicável**; unproved → **relação persistida sem informação suficiente para o grafo** |

### E3 — person ↔ context · **`person_contexts`**

| Field | Measurement |
| --- | --- |
| Source table | `public.person_contexts` (`202607160009:14-19`) |
| Difference from E2 | **no `role` column**; the label is the association term alone |
| Everything else | identical — same owner scope, same absence of direction, same two writers, same discriminator, same validity window, same one-arm treatment of removed / foreign / unreadable |
| **May be drawn** | **only where §0.4 proves owner authorship** |
| Classification | proved → **aresta explicável**; unproved → **relação persistida sem informação suficiente para o grafo** |

### E4 — person → organization, project → organization · **`people.organization_id`, `projects.organization_id`**

| Field | Measurement |
| --- | --- |
| Source | a **column**, not a link table (`202607160003:38`, `:25`), `on delete set null` |
| Owner scope | the owning row's own `user_id` + forced RLS; composite FK to `organizations` |
| Direction | **Real and asymmetric** — the person/project belongs to the organization |
| Label | the fixed "belongs to" term, localized |
| State | current or absent; **no validity window** |
| Provenance | **owner-authored, by construction.** The interpretation RPC inserts `people (user_id, name)` and `projects (user_id, name)` and **never sets `organization_id`**; the column has exactly three writers in the tree, all in `entities/actions.ts`, all owner actions, all audited |
| Sensitivity | `organizations.name` is a structural identifier (ADR-110 Decision 2/3) |
| Open source | none |
| Entity removed / foreign / unreadable | one arm — an unresolved organization id yields no node and no edge |
| Action available | change on the person / project edit form |
| **May be drawn** | **YES** |
| Classification | **aresta explicável** |

### E5 — file ↔ entity · **`entity_attachments`**

| Field | Measurement |
| --- | --- |
| Source table | `public.entity_attachments` (`202607160007:118-126`) |
| Writers | **none.** `202607170016:239` revoked `insert, update, delete` from `authenticated`; the live grants are `REFERENCES, SELECT, TRIGGER, TRUNCATE`. The only insert anywhere is M3's undo restore |
| Reader | shipped by 2N.5 — `library/attachment-links.ts`, rendered on the person page with an honest empty state |
| Provenance | **none recorded, and none derivable.** The table carries no origin column and its rows, where any exist, came from a path nobody can now name |
| Sensitivity | the node's label would be `attachments.original_name`, which the `file` surface **masks** at `highly_sensitive` |
| **May be drawn** | **NO** |
| Classification | **associação textual** — already shipped by 2N.5 on the person page; **not-built-by-rule** for the drawing |

Refused for three independent reasons, any one of which would be enough: the set
is **empty by construction** for every owner without legacy or restored links, so
a node type would be drawn that can never appear; the origin is **unknown**, so
the edge could not be explained; and the label is **governed content**, so a
masked node would put a differentiable shape on a diagram for a row whose
content is withheld. `2N-FILES-008` stays **partial** with destination
`2N-FILES-WRITER` and **2N.6 creates no writer**.

### E6 — record ↔ entity · **`entry_entities`**

| Field | Measurement |
| --- | --- |
| Source table | `public.entry_entities` (`202607160003:88-96`) |
| Writers | the interpretation RPC only — **model-derived by construction** |
| Direction | real: the entry mentions the entity |
| Provenance | the **best** available anywhere: a real, resolvable, owner-scoped entry at `/app/inbox/{id}` |
| Sensitivity | the node's label would be `entries.original_content` — governed, long, masked at `highly_sensitive` |
| Density | one row per extracted entity per interpretation; unbounded relative to the relation tables |
| **May be drawn** | **NO** |
| Classification | **associação textual** — already shipped as the person page's timeline and the project page's entries section |

A mention is **not** a relation, and it is the one candidate whose node label is
free-text user content. Drawing it would put a truncated or masked entry body on
a diagram and would blow every bound the surface can state.

**And it may not be used as provenance for E2/E3.** The trigger records *no* link
between the association row and the interpretation that produced it. Correlating
them by timestamp, by person, or by proximity is inference, and this catalogue
refuses it by name.

### E7 — aliases · **`entity_aliases`**

Not an edge. An alias is an **alternative name for one node**, already read on the
person page since 2N.0. Adding it to a node label would widen the label without
adding a relation. **Fora do escopo.**

### E8 — person ↔ person

**Does not exist** (§0.1). Any line drawn between two people would have to be
synthesized — from a shared project, a shared context, or a co-mention — and each
of those is a conclusion the data does not carry.

Classification: **inferência proibida**, refused by name.

The user question *"which projects connect these people"* is answered honestly by
the drawing without such an edge: two people each linked to the same project are
**two real edges sharing one node**. The surface states that this is what it
means, and that it is not a claim that the two people know each other.

### E9 — task ↔ person / project / context · `task_people`, `task_projects`, `task_contexts`

The Work domain. `2N-RELATION-001…011` do not name tasks, the person and project
pages already list them, and a task node would import Work's derived
classification (`task-derivation.ts`) into a relations surface for no relation.
**Fora do escopo.**

### E10 — a "proposal" · **no producer exists**

`2N-RELATION-003` permits extraction to produce a **proposal**, and a proposal is
not a relation. Measured: `src/lib/ai/extraction-schema.ts` has **no relation
field at all** — `entryExtractionSchema` carries `contexts`, `organizations`,
`projects`, `people`, `taskCandidates` and `pendingQuestions`, and every entity
candidate is `{name, confidence, evidence, inferred}`. **No relation is ever
proposed by the model.**

Building a proposal producer would need a new AI contract **and** a store to hold
an unconfirmed proposal — a migration, therefore a stop condition.

Classification: **not-built-by-rule**, recorded rather than skipped.

---

## 2. What the surface may render, stated before it is built

### 2.1 Node vocabulary — closed

`owner`, `person`, `project`, `context`, `organization`. Nothing else. Each node
carries exactly: an opaque id used only as a React key and a lookup key, a type,
a governed label, an authorized in-app URL, and its derived presentation state.

**Not carried to the client**, by signature rather than by promise: `notes`,
`description`, `extracted_text`, memory bodies, entry content, excerpts,
embeddings, `confidence`, any foreign id, any Supabase endpoint.

### 2.2 `confidence` is never selected

All three relation tables carry `confidence numeric(4,3) not null default 1`. No
contextual surface selects it today and this one does not either —
`2N-RELATION-005` and `-010`. A guard asserts the projection's select lists do
not contain the column, because a number that reaches the client is a number
somebody will render.

### 2.3 Free text: what crosses onto this surface and what does not

ADR-110 Decision 3 draws the line at **structural identifier versus free text**,
and Decision 5 forbids `people.notes` on *"search, suggestions, previews, related
pages, **the graph**, telemetry, or any indirect contextual surface"* — the graph
by name.

- `people.name`, `projects.name`, `contexts.name`, `organizations.name` —
  **structural identifiers** (Decision 2). Rendered.
- `people.notes` — **never**, on this surface, in any form.
- `person_projects.role` — **rendered**, because it is an attribute of the
  association rather than a note about a person, it already renders in the clear
  on both the person and the project page, and `2N-RELATION-009` requires roles
  preserved. Masking it here and not there would create exactly the divergence
  `2N-PRIVACY-001` exists to prevent.
- `person_relationships.description` — **not carried onto this surface.** It is
  free text about a human being, on a table with no classification and no
  classifiable source: the same shape as `people.notes`, which Decision 5 keeps
  off the graph by name. ADR-110 did not extend Decision 4 to it, so **the person
  page is not changed** — this surface simply does not propagate an unclassified
  free-text field onto a new indirect surface, and links to the person page where
  the owner's own sentence already lives.

  **Recorded as an open question for the owner, not smoothed:** should ADR-110
  Decision 4's posture extend to `person_relationships.description` and
  `person_projects.role` on the *contextual* pages? 2N.6 does not decide it and
  does not act on it. Destination: `2N-PRIVACY-FREETEXT`.

### 2.4 Where the `graph` surface key applies

`graph` joins `GOVERNED_SURFACES` **in the same change as its first real
consumer**, which is what `contracts.ts:125-129` reserved it for. Its rules are
identical to the four contextual surfaces — `normal`/`private` shown,
`highly_sensitive` **masked in place**, revealable locally — for the reason that
paragraph gives: a dropped node makes a count a lie and an absence an oracle.

In practice the drawable node labels are all structural identifiers, so the mask
is reached only through the derived state of a linked subject. The rule exists
anyway, and is asserted, because a surface whose protection depends on nobody
adding a governed field later is not protected.

---

## 3. Bounds, measured before the ceiling is chosen

The projection issues a **fixed** number of queries. It never queries per node
and never queries per edge.

| Round | Queries | Bound |
| --- | --- | --- |
| 1 | `person_relationships` (live), `person_projects` (live), `person_contexts` (live) — 3 in parallel | `withProbe(RELATION_LIMIT)` = 51 each |
| 2 | `audit_logs` (proof, `.in` over the association ids), `people`, `projects`, `contexts` — 4 in parallel | ids from round 1 only |
| 3 | `organizations` — `.in` over the ids rounds 1–2 produced | ids only |

**8 queries, 3 round trips, no N+1 by construction** — the same shape the person
page already uses (18 queries, 3 rounds). Every list is fetched with
`withProbe()` and reported through `Bounded<T>`, so *"there are more"* is measured
rather than guessed.

`RELATION_LIMIT` is **50** and is reused rather than re-tuned, for the reason
`bounds/contracts.ts` gives: changing what is shown while changing how it is
reported makes it impossible to tell which caused a difference.

The drawn set takes the **same** bound as the list, from the **same** projection,
so the two can never report different numbers. That is a type-level property, not
a convention: both presentations receive one `RelationProjection` value.

---

## 4. Rendering technology, compared before choosing

| | inline SVG (server-rendered) | HTML nodes + `aria-hidden` SVG line layer | canvas | external library |
| --- | --- | --- | --- | --- |
| Accessibility | SVG `<a>` focus is inconsistent; text nodes read as a coordinate soup | **real `<a>` elements**: native focus, native semantics, `:focus-visible` from `globals.css` | inaccessible without a parallel DOM | varies, usually poor |
| Touch targets | hard to guarantee 44px on a `<text>` | **CSS `min-height`/`min-width`** | manual hit-testing | varies |
| Bundle | 0 | 0 | 0 | 30–150 kB |
| SSR / hydration | fully server-rendered | **fully server-rendered, zero client JS** | client-only | client-only |
| CSP | fine | **fine** | fine | risk |
| Next 16 | fine | **fine** | needs `"use client"` + effects | needs `"use client"` |
| Maintenance | layout maths in JSX | **layout maths in one pure module, unit-testable** | high | dependency |

**Chosen: HTML nodes positioned by CSS custom properties, over an `aria-hidden`
SVG layer that draws only the connecting lines.** It is the smallest thing that
satisfies the contract: the information lives in real anchors that a keyboard and
a screen reader already handle, and the SVG carries no text, no label, no `title`
and no `aria-*` — only geometry, hidden from the accessibility tree.

**No dependency is added.** The layout is a pure function with unit tests; it
runs on the server and its output is CSS custom properties.

---

## 5. Layout, and `2N-RELATION-010`

Nodes are placed in **columns by type** — contexts, people, projects,
organizations — with the owner in its own lane. Position encodes exactly one
thing: **the node's type**, which is a stated fact carried by the legend and by
each node's own visible type label.

`2N-RELATION-010` forbids attributing meaning to *emergent* geometry, and the
surface says so in both locales, visibly and not only in a tooltip:

> A posição, a distância e o número de linhas não significam nada. Um nó com mais
> ligações não é mais importante.

There is no clustering, no centrality, no force simulation, no edge weight and no
sizing by degree. Order within a column is **name-ascending and stable**, so two
renders of the same data produce the same picture, and the order carries no
ranking.

---

## 6. The verdict on `2N-RELATION-011`

Each clause of the refusal contract, answered against what §1–§5 measured.

| Clause | Verdict | Basis |
| --- | --- | --- |
| Every edge is explainable | **met** | Only E1, E4 and *proved* E2/E3 are drawn. Each carries a stated origin |
| No relation is invented | **met** | E8 refused by name; E6 refused as provenance; no synthesized edge exists |
| Sensitivity is applied | **met** | `graph` joins `GOVERNED_SURFACES` with its consumer; `notes` never crosses; `description` does not either |
| The text alternative carries the same information | **met** | One projection, two presentations. The list is a **superset** — it also carries the unattributable links — and is never poorer |
| Keyboard works | **met** | Every node and every edge target is a real `<a>`; the SVG is `aria-hidden` and holds no interactive element |
| Focus is visible | **met** | `globals.css` `:focus-visible` outline applies unchanged |
| Screen reader gets a comprehensible structure | **met, and not over-claimed** | Headings, named regions, a described figure, and a list-first DOM order. **No screen-reader session is claimed** — `2N-ACCESS-006` |
| Mobile reflows | **met** | One media query drops absolute positioning; the list is unchanged and complete at every width |
| Nodes and edges do not overlap unusably | **met** | Deterministic column layout with computed row pitch; overlap is impossible by construction, and asserted |
| A limited set is communicated | **met** | `Bounded<T>` from the shared contract, one bound reported identically by both presentations |
| No cross-tenant leak | **met** | Owner-scoped queries under forced RLS; removed / foreign / unreadable share one arm by construction |
| Performance is bounded | **met** | 8 queries, 3 rounds, no per-node read, existing indexes only |
| No inaccessible canvas as the only representation | **met** | The list is canonical and first; the drawing is secondary |
| No hover dependency | **met** | No tooltip carries information; every label is rendered |
| No persisted inference | **met** | The surface writes nothing |

### **2N.6 AUTORIZÁVEL DENTRO DO CONTRATO EXISTENTE**

with two consequences recorded rather than smoothed:

1. **`2N-RELATION-003` cannot close `built`.** The trigger still persists
   co-mention associations automatically, which is the option `OD-2N-8` refused.
   2N.6 stops the product from *claiming* those are owner-authored and refuses to
   *draw* them; it cannot stop them being written, because that is a migration
   and a fourth migration is a stop condition. The requirement closes **partial**,
   with the remainder named — **`2N-RELATION-TRIGGER`**, drop
   `entry_entities_link_timelines`, an owner decision and a migration — and **not
   transferable into M2**.

2. **`2N-RELATION-002` and `-008` are not baseline.** The 2N.6 re-audit recorded
   them as *"largely ships"* and *"ships"*. Both readings rest on
   `provenance/contracts.ts`'s claim that the three relation tables have no
   non-owner writer, which is false for two of them. They are **defects this
   slice fixes**, on a shipped surface, and are claimed as **built** here rather
   than as inherited.

**Nothing in this document is implemented. It authorizes the slice's own
implementation and nothing else. No migration, no RPC, no grant, no index, no
writer, and no new authority is required by anything above.**
