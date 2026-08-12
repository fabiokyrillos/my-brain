# Phase 2N — threat model

**A report, not a plan.** It declares no requirement in this repository's
declaration shape, allocates no migration and authorizes nothing. It states the
threats a phase about *people, projects, memory, files and relations* must be
designed against, the mitigation each implies, and — where the threat is live
today — says so.

Trust boundary, restated because everything else depends on it: **ownership
comes from the authenticated request-scoped client under forced RLS, and from
nothing else.** No contract in this phase may be load-bearing for isolation. A
reviewer who finds a presentation rule keeping one account's rows away from
another's has found a bug.

Legend — **Live** means the threat is realisable against the product as it
stands on 2026-08-12; **Latent** means it becomes realisable only if this phase
builds the thing that enables it.

---

## T-1 — Incorrect identity merge destroys data irreversibly · *Out of scope, by signature*

Merging two people relinks tasks, memories, files, relations, mentions and
aliases. Done wrongly it silently rewrites history, and an unreversible merge is
data loss dressed as tidying.

**Mitigations required.** Merge is a single validated authority path, never a
client write. It is preceded by an explicit preview naming every object that
will move. It records `before_state` and `after_state` in `undo_operations`
through the existing handler registry, and its undo is **tested against a
populated fixture**, not merely registered. Ownership of *both* subjects is
proved in the same statement. If reversibility cannot be guaranteed, the
operation is confirmed explicitly as irreversible.

**Closed by signature, not by mitigation.** `OD-2N-3` **A** removed merge from
Phase 2N entirely, so this threat is **not realisable by anything this phase
builds**. The mitigations above are preserved deliberately: `OD-2N-4` **A**
fixed them as the contract a *future* merge must satisfy — reversible, complete
preview, explicit confirmation, registered undo, **populated-fixture proof** —
so the next phase inherits them instead of re-deriving them under pressure.

**Refused by construction, then and now.** No automatic merge. No merge proposed
and applied in one action. No merge on inference.

## T-2 — Enumerating another owner's person or project · *Mitigated today*

A contextual page keyed by an id in the URL is an enumeration oracle if the
row is fetched without an ownership predicate.

**Why it holds today.** `/app/people/[personId]` queries through the
authenticated client under forced RLS and calls `notFound()` on an empty
result, so a foreign id is indistinguishable from a nonexistent one. **This
must survive every new read the phase adds**, including counts, aggregates and
relation traversals — a count that differs between "not yours" and "does not
exist" reopens the oracle the page closed.

## T-3 — An inferred relation presented as a fact · *Live*

`person_relationships`, `person_projects` and `person_contexts` carry
`confidence` and **no source**. Anything rendering them states a claim it
cannot substantiate.

**Closed by `OD-2N-8` A.** Inferred relations are **not persisted at all**;
extraction may produce a proposal, and a proposal is not a relation. Every
stored relation is owner-authored by construction, and existing rows are
presented as owner-authored **without inventing retroactive provenance** — the
honest reading, since the product cannot now discover where they came from.
The declined alternative — provenance columns — would have cost a migration and
left every existing row unsourced forever. What stays refused is the third
option, in force today: persisting a confidence and rendering it as a fact.

**This signature is load-bearing for T-11**: because no inferred edge exists, a
graph cannot draw one.

## T-4 — A memory without a source · *Partly live*

`memories.source_entry_id` is nullable. A memory whose source is absent — or
whose source entry is later unreadable — becomes an unfalsifiable assertion the
assistant will cite.

**Mitigations required.** A memory with no resolvable source is rendered as
such, never as a sourced claim, and the state is distinguishable in the UI. Any
new memory this phase creates carries a source. **Fail closed on the read
path**: an unresolvable source is treated as the more protective case, the way
`task-derivation.ts` resolves an unreadable source to `highly_sensitive`.

## T-5 — A removed memory is still retrievable · *Live*

`match_internal_knowledge` filters neither validity nor sensitivity, and its
`limit least(…, 20)` is applied **before** any validity is read; `isMemoryInForce`
runs afterwards in TypeScript.

**Consequences today.** An archived memory is retrieved, occupies a retrieval
slot, and is dropped at presentation. Removal leaves *citation*, not
*retrieval*.

**Mitigation required.** Whatever "removed" comes to mean, it must be enforced
**where the bound is applied**, so a removed memory neither reaches the process
nor displaces a live one. A test must prove eviction from retrieval, not merely
absence from a rendered citation list.

## T-6 — Partial deletion · *Latent, and now in scope*

**`OD-2N-11` B signed deletion, so this is now the phase's most dangerous
threat.** A person deleted from `people` while `entry_entities`,
`person_projects`, `person_contexts`, `person_relationships`,
`entity_attachments`, `entity_tags`, `entity_aliases`, `task_people` and
`memories.person_id` still reference them leaves the product internally
inconsistent and the user misinformed — and unlike every other threat here, the
damage is not recoverable by reloading the page.

**Mitigations required.** Propagation is enumerated **per table** before the
first deletion ships, and the enumeration is asserted by test rather than
described in prose (`2N-CORRECT-004`). Deletion is transactional through **one**
validated owner-scoped path (`2N-CORRECT-009`) — never a client-side sequence,
which the existing direct `delete` grant on every domain table would otherwise
make trivially available. Retrieval eviction is part of the same unit
(`2N-CORRECT-011`). A deletion that cannot complete **fails whole** and changes
nothing (`2N-CORRECT-012`). The preview enumerates consequences by type and is
**never an authorization** (`2N-CORRECT-010`).

**And the stop condition, which is the part that matters most.** If a
propagation cannot be **truthfully undone**, the slice stops and returns the
case to the owner (`2N-CORRECT-013`). The failure this prevents is shipping a
smaller undo that restores the row and not its relations, while the interface
says the deletion was reversed.

## T-7 — Orphaned file · *Partly live*

`entity_attachments` links files to entities polymorphically. If the entity is
deleted, or the storage object disappears, the row can outlive its subject.

**Mitigations required.** Reuse the existing storage-orphan scanner rather than
inventing a second notion of orphan; ownership on polymorphic links is proved by
trigger, as it already is; a link whose target is gone is not rendered as a
live association.

## T-8 — A sensitive file exposed through a contextual page · *Live*

`attachments.sensitivity` exists and `/app/files` **does not even select it**.
A person or project page that lists related files would print names and
extracted text with no classification applied.

**Mitigation required.** Files enter the sensitivity contract in the same change
that first renders them on a contextual page — never after.

## T-9 — A conflict silently resolved · *Latent, and now in scope*

The failure mode of a conflict feature is choosing a winner. If the product
picks the newer, the more confident or the more similar claim without saying
so, it has decided something the user believes they decided.

**Mitigations required.** Both claims are shown with their sources **and their
validity windows**. No implicit precedence by recency, confidence or similarity.
Resolution is an explicit user act through an existing authority path, and it is
audited. An unresolvable conflict remains visibly unresolved rather than
disappearing.

**`OD-2N-7` A narrows the attack surface by refusing persistence.** Conflicts
are derived at read time from existing columns — no conflict table, no
lifecycle — so there is no stored "resolved" flag that could drift from the data
it summarises, and no queue that can fill faster than it drains.

## T-10 — A correction written without authority · *Latent*

Correcting what the Brain "knows" is a domain write. Performed as a client
mutation it would bypass validation, audit and undo — and every domain table
**already grants `delete`, `insert` and `update` to `authenticated`**, so the
capability is present and only convention keeps it unused.

**Mitigations required.** Every correction goes through a Server Action or a
validated RPC. The phase adds no direct client write to any of the five
domains. Consider extending the existing direct-write allowlist mechanism —
which already holds `tasks` empty and `reminders` at exactly one writer — to
these tables, so the convention becomes a guard.

## T-11 — The graph as an oracle · *Latent, and now in scope*

**`OD-2N-10` B authorized a graph, so this threat is now realisable by
something this phase builds.** A visual graph invites the reading that its edges
are true and its clusters mean something. Edges without provenance rendered as a
diagram would be the strongest possible presentation of the weakest possible
claim — which is precisely why the authorization is a **contract with a refusal
clause** (`2N-RELATION-011`) rather than a permission.

**What makes it acceptable is T-3's signature, not the graph's own design.**
Under `OD-2N-8` A no inferred relation exists to be drawn, so every edge is one
the owner authored. A graph authorized *without* that signature would have been
this threat with no mitigation available.

**Mitigations required.** The graph stays secondary and never replaces search,
lists or contextual pages. Every edge is explainable and traceable to a source.
A non-graph alternative — list or text — exists for every graph affordance and
is not a degraded fallback. No layout, cluster or centrality is presented as
meaning.

## T-12 — A count as an oracle · *Live in shape*

`visibleCount` exists precisely because a filtered count leaks what it filtered.
Library renders counts as navigation aids. Any 2N surface that counts related
records must count over **everything the user owns**, masked or not — a "3
hidden" affordance is an existence oracle wearing a helpful hat.

## T-13 — Search leaking content · *Partly live*

Search excludes `highly_sensitive` by default (ADR-093) — but `people` and
`projects` are declared `hasSensitivity: false`, so `people.notes` is searched
and snippeted with no classification, and **archived memories are returned as
current results**.

**Half of this is closed by ADR-110**: `notes` leaves the `people` domain's
matched columns and its snippet entirely (T-23), while the person's name and
aliases stay searchable. That is a **deliberate, owner-signed narrowing** of
behaviour ADR-093 fixed — recorded as such, because `2N-PRIVACY-006` exists to
stop exactly this kind of change happening by accident. ADR-093's default
exclusion of `highly_sensitive` is untouched and no other domain moves. The
other half — archived memories returned as current — is closed by **M1**.

**Mitigations required.** Any widening of search in this phase — aliases,
relations, files-by-entity — states its sensitivity posture explicitly and does
not silently inherit `false`. ADR-093 is not reopened by accident; a change to
search's behaviour is a signed decision or it does not happen.

## T-14 — Timezone changing the meaning of an event · *Live*

Rendering an instant in the host's zone is UTC on the server. Thirteen call
sites outside the `2M-TIME-007` corpus do it, six of them on the pages this
phase would extend, including the "today" label on the home dashboard.

**Mitigation required.** Dated rendering on 2N surfaces routes through
`src/lib/time/local-day.ts`, and the guard corpus extends to those directories
so a new zone-less call site cannot be added. **The four `daily-cycle`
exemptions are not repaired here** — different surfaces, existing destination.

## T-15 — Stale read · *Latent*

A contextual page composes many independent queries. A user who corrects a
memory in one tab and reads the person page in another can be shown the
pre-correction state as though it were current.

**Mitigation required.** Classification and lifecycle are read **at render
time** from the current row — the property `OD-2K-2` already established by
removing the stored excerpt so no second copy could carry a stale level.
Nothing this phase adds may cache a classification, a validity or a
relationship alongside its content.

## T-16 — TOCTOU on a destructive or identity operation · *Latent*

Between previewing a merge, a deletion or a conflict resolution and applying
it, the underlying rows can change. Applying a decision computed against a
stale set silently affects objects the user never saw.

**Mitigation required.** The applying statement re-validates ownership and
preconditions atomically. Where the product already solves this — the confirmed
task-command path with fingerprints, policy versions and expiring confirmations
— the same shape is reused rather than reinvented. A preview is never an
authorization.

## T-17 — Undo applied to the wrong object · *Latent*

`undo_operations` carries `entity_ids`, `entity_type`, `before_state` and
`expires_at`. An undo for a merge or a deletion that reconstructs objects by
name rather than by recorded id can restore onto a different row.

**Mitigation required.** Undo targets recorded ids, never re-resolved names.
Compensation is registered in the existing handler registry. Every reversible
operation this phase adds has a test that performs it, undoes it, and asserts
the *whole* prior state — including relations — not just the primary row.

## T-18 — Telemetry carrying names or content · *Latent*

A phase about people is the phase most likely to put a person's name in an
event property.

**Mitigations required.** Every event is content-free: no names, titles,
content, snippets, file names, aliases or free-form properties. The property
validator is the enforcement point, and the negative controls must be
non-vacuous — a test that proves a rejected property is actually rejected
through the real write path, not a hardcoded list in the writer. Note the three
vocabulary copies: the CHECK, the validator and the writer's own list must move
together or the ledger silently refuses new events.

## T-19 — Retention not executed · *Live, inherited*

`RG-QUO-3` fails: sweeps are built and dry-run recorded and **not scheduled**.
This phase must not mint a new retention value; where a window is needed it
reuses the signed 90 days. Scheduling belongs to an operator script, never to a
migration — *scheduling is authorization*.

## T-20 — Incomplete account deletion · *Mitigated today*

Every one of the five domains' tables declares
`user_id … references auth.users(id) on delete cascade`, so account deletion
reaches them automatically. **Any new table this phase creates must carry the
same cascade**, or it silently becomes the first thing account deletion misses.
Storage is not covered by cascade and is handled by the existing deletion path.

## T-21 — Accidental dependency on unvalidated push · *Latent, and specifically forbidden*

Push is implemented, hosted, and **fails on a real iPhone with HTTP 403**;
Android is **NOT EXECUTED**. A conflict notification, a merge confirmation or a
"needs you" alert delivered only by push would be a feature that does not work
and cannot be proven to work.

**Mitigation required.** No requirement in this phase may be discharged by a
push delivery, and every surface that could notify must be fully usable
in-app. The traceability contract refuses a close that treats push or Android
as approved.

## T-22 — An undo that claims more than it restores · *Latent, created by `OD-2N-11` B*

The threat deletion adds that is **not** partial deletion. A deletion completes
correctly and transactionally; its undo then restores the person row but not
every association, link and relation the deletion removed — and the interface
says the deletion was reversed. The user believes their data is back. It is not,
and they have no reason to check.

This is worse than a missing undo, because a missing undo is visible.

**Mitigations required.** Undo targets **recorded ids**, never re-resolved names
(`2N-CORRECT-007`). Its proof is a test that deletes an object **with linked
tasks, memories, files, relations and associations**, undoes, and asserts the
**whole** prior state — a fixture with one bare row proves nothing. And where a
propagation cannot be truthfully undone, the phase **stops** rather than shipping
the smaller undo (`2N-CORRECT-013`). Where undo is genuinely impossible, the
operation is confirmed as irreversible in the preview and named as such — the
product may not be silent about which of the two it is.

---

## T-23 — Unclassifiable free text defaulting to visible · *Live, closed by ADR-110*

The field with the highest chance of holding something genuinely private about a
named human being is the one with **no classification of its own and no source
to derive one from**: `people.notes`. Every mechanism this phase builds derives
protection from a source record, so a field with no source falls through all of
them — and a fail-open default would leave it printed on the person page, in the
people list's row subtitle, and in search snippets.

**Why the obvious reading was the dangerous one.** `OD-2N-12`'s fail-closed rule
is stated for *derived* content. Applied literally to every field it would mask a
person's own name and make the page useless; applied to *no* owner-typed field it
would leave free text fully exposed. Both readings are defensible from the text,
which is precisely why the package refused to pick one silently.

**Mitigations, signed by ADR-110.** `people.notes` is **masked by default**,
revealed **locally, explicitly and accessibly**; **absence of classification
never resolves to `normal`**; it is **absent from search snippets, suggestions,
previews, related pages, the graph, telemetry and retrieval**; the person's
**name and aliases stay searchable** and their existence and counts stay true.
**No `sensitivity` column, no migration, no classification inferred from the
text, and no existing note deleted or altered.**

**And the boundary that keeps this from becoming a licence.** The rule is
**structural identifier versus free text**, not owner-authored versus derived
(`2N-PRIVACY-008`). Confirming that a name is shown does not make every field
the owner typed `normal`.

---

## Summary

Statuses reflect the seventeen signatures in ADR-109 and the ADR-110 amendment.

| Threat | Status | Needs schema? |
| --- | --- | --- |
| T-1 merge | **Out of scope** — `OD-2N-3` A | No; contract kept for a future phase |
| T-2 enumeration | Mitigated | No |
| T-3 unsourced relation | **Live**, closed by `OD-2N-8` A | **No** — persistence refused instead |
| T-4 sourceless memory | Partly live | No |
| T-5 removed but retrieved | **Live** | **Yes — M1** |
| T-6 partial deletion | Latent, **in scope** — `OD-2N-11` B | **Yes — M3** |
| T-7 orphaned file | Partly live | No |
| T-8 sensitive file exposed | **Live** | No |
| T-9 silent resolution | Latent, **in scope** — `OD-2N-7` A | **No** — derived, not persisted |
| T-10 unauthorized correction | Latent | No |
| T-11 graph oracle | Latent, **in scope** — `OD-2N-10` B | **No** — `OD-2N-8` A is the mitigation |
| T-12 count oracle | Live in shape | No |
| T-13 search leak | Partly live | No |
| T-14 timezone | **Live** | No — separate initiative, `OD-2N-13` B |
| T-15 stale read | Latent | No |
| T-16 TOCTOU | Latent | No |
| T-17 wrong undo | Latent | No |
| T-18 telemetry content | Latent | Yes — M2, if events are delivered |
| T-19 retention | Live, inherited | No |
| T-20 account deletion | Mitigated | Only for new tables; M3 creates none |
| T-21 push dependency | Latent, forbidden | No |
| T-22 undo claiming too much | Latent, **created by `OD-2N-11` B** | No, beyond M3 |
| T-23 unclassifiable free text | **Live**, closed by ADR-110 | **No** |

**Six threats are live today**, and five of the six need no schema to close.
**The signatures moved three threats into scope** — T-6, T-9 and T-11 — and
**closed two by refusal rather than by mitigation**: T-1 by declining merge, T-3
by declining persisted inference. Declining to build something remains the
cheapest and most complete mitigation available, and this phase used it twice.

**T-6 and T-22 are the phase's sharpest risks**, both created by the same
signature, and both carry a stop condition rather than a promise.
