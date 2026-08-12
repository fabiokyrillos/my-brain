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

## T-1 — Incorrect identity merge destroys data irreversibly · *Latent*

Merging two people relinks tasks, memories, files, relations, mentions and
aliases. Done wrongly it silently rewrites history, and an unreversible merge is
data loss dressed as tidying.

**Mitigations required.** Merge is a single validated authority path, never a
client write. It is preceded by an explicit preview naming every object that
will move. It records `before_state` and `after_state` in `undo_operations`
through the existing handler registry, and its undo is **tested against a
populated fixture**, not merely registered. Ownership of *both* subjects is
proved in the same statement. If reversibility cannot be guaranteed, the
operation is confirmed explicitly as irreversible — and `OD-2N-4` is where that
is decided, not the implementation.

**Refused by construction.** No automatic merge. No merge proposed and applied
in one action. No merge on inference.

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

**Mitigations required.** Either every persisted relation carries provenance
and the surface renders origin and confidence, or inferred relations are not
persisted at all and every stored relation is owner-authored by construction.
`OD-2N-8`. What is refused is the third option in force today: persisting a
confidence and rendering it as a fact.

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

## T-6 — Partial deletion · *Latent*

If deletion is built, a person deleted from `people` while
`entry_entities`, `person_projects`, `entity_attachments`, `entity_tags`,
`entity_aliases`, `task_people` and `memories.person_id` still reference them
leaves the product internally inconsistent and the user misinformed.

**Mitigations required.** Propagation is enumerated **per table** before the
first deletion ships, and the enumeration is asserted by test rather than
described in prose. Deletion is transactional. Retrieval eviction is part of
the same unit. A deletion that cannot complete fails whole rather than
half-applying.

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

## T-9 — A conflict silently resolved · *Latent*

The failure mode of a conflict feature is choosing a winner. If the product
picks the newer, the more confident or the more similar claim without saying
so, it has decided something the user believes they decided.

**Mitigations required.** Both claims are shown with their sources. No implicit
precedence. Resolution is an explicit user act through an existing authority
path, and it is audited. An unresolvable conflict remains visibly unresolved
rather than disappearing.

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

## T-11 — The graph as an oracle · *Latent*

A visual graph invites the reading that its edges are true and its clusters
mean something. Edges without provenance (T-3) rendered as a diagram are the
strongest possible presentation of the weakest possible claim.

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

---

## Summary

| Threat | Status today | Needs schema? |
| --- | --- | --- |
| T-1 merge | Latent | Probably |
| T-2 enumeration | Mitigated | No |
| T-3 unsourced relation | **Live** | Depends on `OD-2N-8` |
| T-4 sourceless memory | Partly live | No |
| T-5 removed but retrieved | **Live** | **Yes** |
| T-6 partial deletion | Latent | Depends on `OD-2N-11` |
| T-7 orphaned file | Partly live | No |
| T-8 sensitive file exposed | **Live** | No |
| T-9 silent resolution | Latent | Probably |
| T-10 unauthorized correction | Latent | No |
| T-11 graph oracle | Latent | No |
| T-12 count oracle | Live in shape | No |
| T-13 search leak | Partly live | No |
| T-14 timezone | **Live** | No |
| T-15 stale read | Latent | No |
| T-16 TOCTOU | Latent | No |
| T-17 wrong undo | Latent | No |
| T-18 telemetry content | Latent | Yes, if events are declared |
| T-19 retention | Live, inherited | No |
| T-20 account deletion | Mitigated | Only for new tables |
| T-21 push dependency | Latent, forbidden | No |

**Five threats are live today** and four of the five need no schema to close.
