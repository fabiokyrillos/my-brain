# Phase 2N — People, projects, memory, files and relations · PRD

**Planning authorized by ADR-108 (2026-08-12). All seventeen owner decisions
SIGNED by ADR-109 (2026-08-12). IMPLEMENTATION THROUGH CLOSEOUT AUTHORIZED by
ADR-112 (2026-08-13).** A requirement is executed only when a merged slice says
so and CI is green on its exact merge SHA; **no requirement below is executed by
being written here**.

**What is still not authorized:** a **fourth migration** (a STOP CONDITION),
opening signup, altering the rollout gate, resuming the push investigation, any
entity merge, any persisted graph inference, any paid provider call, and any
planning, starting or retargeting toward the successor phase. **The three
allocated migrations remain non-transferable destinations**, spent only at the
slice each is allocated to, and each must pass the full chain — chain, pgTAP,
CI, dry run, byte parity, deploy and hosted proof — before it counts as
delivered.

**The timezone dependency is discharged.** ADR-111's Local Day Correction
concluded at `d581e43`; `2N-TIME-002`, `-004`, `-005` and `-006` are restated by
ADR-112 and close **`baseline`** — this phase inherits that repair and may not
claim it.

Companion plan: `PHASE_2N_IMPLEMENTATION_PLAN.md`. Evidence:
`docs/reports/phase-2n/` — the current-experience audit, the UX gaps, the
threat model and the traceability contract.

---

## 1. Why this phase exists, for the person using the product

A user has been telling My Brain things for months. It has taken them in,
interpreted them, extracted people and projects, remembered facts and processed
files. What it cannot do is **let them look at what it believes and take
responsibility for it**.

Today they can search for a name and get a list of matches. They cannot open a
person and see, in one place, what the Brain thinks it knows about them, where
each of those beliefs came from, which are still true, which contradict each
other, and which are simply wrong and need to go. When they classify something
as sensitive, that promise is kept on eight surfaces and broken on the person
page. When they mark a memory as no longer true, it stops being *quoted* but
does not stop being *retrieved* — so the more carefully they curate, the more
of the assistant's twenty retrieval slots are spent on things they have already
retired. And nothing in the product can be deleted at all.

The value of this phase is a single sentence: **the user can see what the Brain
knows, see why it knows it, and change it.** Everything below serves that.

## 2. Scope

**In scope.** The contextual person page; the contextual project page; an
inspectable and correctable view of what the Brain knows; explicit
representation of conflicting memories and their routing into work that a
person can actually do; the file library's provenance and links; source-linked
relations and a strictly secondary exploratory graph; and the phase's own
privacy, timezone, mobile, accessibility, telemetry, security and closeout
obligations.

**Out of scope, by rule.** Push and any dependency on it. Android validation.
Recurrence. Opening signup or advancing the rollout. Repairing the four
`daily-cycle` timezone exemptions. `2E-COMMAND-012`. Any external integration.
Any new AI operation kind. The roadmap's next phase, in any form.

## 3. Baseline, obligation and by-rule

This PRD declares **127 requirements across 16 families**, each family numbered
from 001 with no gap. Requirements are marked so that the phase cannot claim
credit for what already ships, and so that what the owner declined is visible
rather than absent:

- **[BASELINE]** — the behaviour exists today; the requirement is that it is
  *not broken* and is *proved* by this phase's tests.
- **[OBLIGATION]** — the phase must deliver it.
- **[BY-RULE]** — a signed decision says it will **not** be built. It closes
  `not-built-by-rule` against that signature, with a named destination, and
  **never as a `partial`** — a partial with an invented remainder is exactly the
  shape the traceability contract refuses.

**There is no `[PROPOSAL]` marker any more.** ADR-109 signed all seventeen
decisions, so every requirement now states what was decided. Requirements that
previously read *"depends on OD-2N-n"* are **restated to their signature**;
none was renumbered, reused or removed, and the fifteen obligations the
signatures created are **appended to the end of their existing families**.
The options the owner declined are preserved in
`PHASE_2N_IMPLEMENTATION_PLAN.md` §7 and in ADR-109, not deleted.

**ADR-110 then added four more** — `2N-PRIVACY-008…011`, appended to the end of
the privacy family — settling the one interpretation ADR-109 left flagged and
fixing the posture of `people.notes`. It **adds no migration**, and it restated
`2N-PERSON-002` because that requirement had described notes as rendering
unchanged.

## 3b. Owner-typed fields: the taxonomy this PRD uses

The distinction that governs `2N-PRIVACY-007…011`, stated once so no surface has
to re-derive it:

| | Examples | Treatment |
| --- | --- | --- |
| **Structural identifier** — what the user needs to recognise the entity | `people.name`, `projects.name` | **Shown** on that entity's own contextual page. Existence and counts stay true |
| **Free text** — owner-typed prose with no classification and no classifiable source | `people.notes` | **Masked by default**, revealed locally and explicitly; absent from indirect surfaces and from retrieval |
| **Source-derived content** — classification derives from a source record | entry text, task titles, memory bodies, file names, extracted text | Governed by the sensitivity contract; fail-closed on an unreadable or missing source |

**The line is structural-versus-free-text, not owner-authored-versus-derived.**
Confirming that a name is shown does not make every field the owner typed
`normal` — which is why the middle row exists and why ADR-110 stated it rather
than leaving it to be inferred from which fields happen to be masked.

## 4. Universal states

Every surface this phase ships or touches declares, in both locales: **loading**,
**empty**, **partial** (bounded, and saying so), **error**, **refused**
(authority or classification), and **masked** (sensitive, with a local reveal
where the contract allows one). A surface that cannot express "there is more"
is not complete.

## 5. Person — `2N-PERSON`

- **2N-PERSON-001:** [BASELINE] The person page loads by id through the
  authenticated client under forced RLS, and a foreign or nonexistent id is
  indistinguishable — both `notFound()`. Every read the phase adds preserves
  this, including counts and aggregates.
- **2N-PERSON-002:** [BASELINE] Identity, organization and the
  employer-versus-relationship explainer render as they do today. *(Restated by
  ADR-110: `notes` no longer renders as it does today — it is **masked by
  default** under `2N-PRIVACY-009`. Leaving the word "notes" in a `[BASELINE]`
  requirement would have made this PRD assert two incompatible things about the
  same field, which is exactly the drift a closeout discovers too late.)*
- **2N-PERSON-003:** [OBLIGATION] Every list on the page states its bound when
  it is hit, in the vocabulary search already uses; silent truncation at 100 is
  removed.
- **2N-PERSON-004:** [OBLIGATION] The page distinguishes **derived** sections
  (computed at render from other records) from **persisted** ones, visibly, so
  the user knows what they can edit and what follows from something else.
- **2N-PERSON-005:** [OBLIGATION] Open commitments render through the same Work
  authority and derived classification as the Work surface; a task title on
  this page and on Work are the same string under the same rule.
- **2N-PERSON-006:** [OBLIGATION] A source can be opened from the page and the
  user returns to their exact position, including scroll and any expanded
  disclosure.
- **2N-PERSON-007:** [OBLIGATION] Every mutation offered here reuses an
  existing authority path; the page introduces no direct client write to any
  domain table.
- **2N-PERSON-008:** [OBLIGATION] Related files render on the page, sourced from
  `entity_attachments`, under the file classification contract
  (`2N-FILES-004`). Signed by `OD-2N-9` **option B**.

## 6. Project — `2N-PROJECT`

- **2N-PROJECT-001:** [BASELINE] Identity, status and existing links render as
  today, under the same ownership property as `2N-PERSON-001`.
- **2N-PROJECT-002:** [OBLIGATION] People on the project render **with their
  roles**, read from the relation the person page already renders from the
  other side.
- **2N-PROJECT-003:** [OBLIGATION] Current state is expressed from records that
  exist — status, open commitments, recent entries — and no new status vocabulary
  is invented.
- **2N-PROJECT-004:** [OBLIGATION] "Recent changes" is derived from existing
  audit and interpretation history, never from a new change-log table.
- **2N-PROJECT-005:** [OBLIGATION] Decisions and risks are surfaced **only** if
  they are representable from existing records; if they are not, this
  requirement closes `not-built-by-rule` with the reason named. *(Restated: it
  previously cited `OD-2N-2`, which decides project identity and never governed
  this. The mis-wiring is corrected here rather than left for a closeout to
  discover, and the requirement is now decision-independent — representability
  is a question of evidence, not of signature.)*
- **2N-PROJECT-006:** [OBLIGATION] Bounds are stated exactly as
  `2N-PERSON-003`.
- **2N-PROJECT-007:** [OBLIGATION] Every mutation reuses an existing authority
  path; no direct client write.

## 7. Identity — `2N-IDENTITY`

- **2N-IDENTITY-001:** [OBLIGATION] The phase states, in the product's own
  words, what a person is and what a project is, and the statement matches the
  schema: today identity is a case-insensitively unique name per owner and
  nothing else.
- **2N-IDENTITY-002:** [OBLIGATION] Identity for a person **stays
  name-uniqueness** this phase (`OD-2N-1` **option A**). **No canonical-identity
  pointer is added**, and the product's own words say so rather than implying a
  stronger model.
- **2N-IDENTITY-003:** [OBLIGATION] Projects follow the same identity principle
  (`OD-2N-2` **option A**), so the product carries one identity model and not
  two.
- **2N-IDENTITY-004:** [OBLIGATION] **`entity_aliases` gains its first
  reader.** A known nickname resolves to the person it names, in entity
  resolution and in search. Signed by `OD-2N-1` **option A**; **no migration** —
  the table, its policies and its grants already exist.
- **2N-IDENTITY-005:** [BY-RULE] Automatic duplicate surfacing **is not built**.
  Under `OD-2N-3` **option A** there is no merge, so a surfaced duplicate would
  be an item with **no available action** — which `2N-CONFLICT-005` refuses by
  rule. Closes `not-built-by-rule`; destination: a future identity phase, with
  `OD-2N-1` option B and `OD-2N-3` option B as its gate.
- **2N-IDENTITY-006:** [BY-RULE] **Merge is not built** (`OD-2N-3` **option
  A**). No automatic suggestion, no merge RPC, no silent relinking of relations.
  Closes `not-built-by-rule` — **never `partial`**, because nothing of it is
  built. Destination: a future identity phase.
- **2N-IDENTITY-007:** [BY-RULE] Merge reversibility is **decided in advance for
  a future phase** (`OD-2N-4` **option A, conditional**): if merge is ever
  authorized it must be reversible, with a complete preview, explicit
  confirmation, a registered undo and a proof against a **populated** fixture.
  Recorded so a later phase inherits the contract instead of re-deciding it
  under pressure. Nothing is implemented here; closes `not-built-by-rule`.
- **2N-IDENTITY-008:** [OBLIGATION] **No inference may create a persisted
  identity.** Extraction may propose; only a user act may create.
- **2N-IDENTITY-009:** [OBLIGATION] **An alias is owner-authored.** No
  inference, extraction or import creates one; each is owner-scoped, carries its
  validity window, and is correctable and removable through an existing
  authority path. Reading an alias never widens what a query may return beyond
  what the owner already owns.

## 8. What the Brain knows — `2N-KNOWS`

- **2N-KNOWS-001:** [BASELINE] Memories list and detail render as today, with
  kind, importance and classification.
- **2N-KNOWS-002:** [BASELINE] The three lifecycle states — `scheduled`,
  `active`, `archived` — remain derived from the validity window and are shown
  as a badge; the phase adds no fourth meaning to those two columns.
- **2N-KNOWS-003:** [OBLIGATION] Every memory shows its **source**, openable,
  and a memory with no resolvable source is rendered as unsourced rather than as
  a sourced claim.
- **2N-KNOWS-004:** [OBLIGATION] Freshness is shown: when it was recorded, from
  when it is in force, and until when.
- **2N-KNOWS-005:** [OBLIGATION] The product distinguishes **fact**,
  **interpretation** and **inference** in what it displays, using the origin
  and interpretation data it already stores, and never asserts a distinction it
  cannot substantiate.
- **2N-KNOWS-006:** [OBLIGATION] Where a memory is used — that it is eligible
  for retrieval, and that an archived one is not — is visible to the user.
- **2N-KNOWS-007:** [OBLIGATION] Classification is read from the current row at
  render time; nothing caches a level, a validity or a relation alongside
  content.
- **2N-KNOWS-008:** [OBLIGATION] Bounds are stated exactly as
  `2N-PERSON-003`.
- **2N-KNOWS-009:** [OBLIGATION] Nothing in this family requires a provider
  call; the explanation is a read of stored interpretation data.

## 9. Correction, suppression and removal — `2N-CORRECT`

- **2N-CORRECT-001:** [BASELINE] Correction of a memory and of an
  interpretation continues to run through the existing validated authority paths,
  audited.
- **2N-CORRECT-002:** [OBLIGATION] The memory vocabulary is exactly **`active`
  and `archived`** (`OD-2N-6` **option A**). **No `suppressed` column.** Archive
  is **not** a hard delete and is never described as one, and **correcting stays
  distinct from archiving** — a correction changes what a memory says, archiving
  changes whether it is in force.
- **2N-CORRECT-003:** [OBLIGATION] An archived memory **genuinely stops
  participating in retrieval**. Enforced **where the retrieval bound is
  applied**, so it neither reaches the process nor displaces a live memory.
  Hiding it at presentation is explicitly refused. Proved by a test that asserts
  **eviction from retrieval**, not absence from a citation list. Migration
  **M1**.
- **2N-CORRECT-004:** [OBLIGATION] Deletion of a person, a project and a memory
  propagates across an **enumerated** set of referencing tables,
  transactionally, and the enumeration is **asserted by test** rather than
  described in prose. Signed by `OD-2N-11` **option B**. Migration **M3**.
- **2N-CORRECT-005:** [OBLIGATION] Deletion carries an **explicit confirmation**
  and a **registered undo or compensation**. The product says which it is before
  the user confirms; it may not be both unstated and performed.
- **2N-CORRECT-006:** [OBLIGATION] Every correction, suppression, archival and
  removal is auditable: actor, source, reason, target, time and resulting
  state.
- **2N-CORRECT-007:** [OBLIGATION] Undo targets recorded ids, never re-resolved
  names.
- **2N-CORRECT-008:** [OBLIGATION] No correction path is a direct client write.
- **2N-CORRECT-009:** [OBLIGATION] Deletion runs through **one validated,
  owner-scoped authority path**. **No client-side multi-delete** — a sequence of
  client statements is not a transaction, and it is exactly how partial deletion
  happens.
- **2N-CORRECT-010:** [OBLIGATION] Deletion is preceded by a **preview that
  enumerates the consequences by type** — which relations, associations, linked
  files, tasks and memories are affected and how. The preview is **never an
  authorization**: the applying statement re-validates ownership and
  preconditions atomically.
- **2N-CORRECT-011:** [OBLIGATION] Deletion **removes the object from
  retrieval** in the same transactional unit that removes it from its table. A
  deleted object that is still retrievable is a failed deletion, not a delayed
  one.
- **2N-CORRECT-012:** [OBLIGATION] **No partial deletion and no soft delete
  presented as removal.** A deletion that cannot complete fails whole and
  changes nothing. If the product retains anything after a deletion, it says so
  in the preview and calls it retention, not removal.
- **2N-CORRECT-013:** [OBLIGATION] **A propagation that cannot be truthfully
  undone is a stop condition.** The phase does not ship a smaller undo that
  claims more than it restores; it stops and returns the case to the owner. The
  per-type consequences are confirmed by the slice's re-audit **before**
  implementation.

## 10. Conflicts — `2N-CONFLICT`

- **2N-CONFLICT-001:** [OBLIGATION] The phase enumerates which conflicts are
  **deterministically detectable from the schema as it stands**, and declares
  the rest out of scope by name rather than leaving them implied.
- **2N-CONFLICT-002:** [OBLIGATION] Conflicts are **derived at read time from
  existing data** (`OD-2N-7` **option A**) and represented without choosing a
  winner: both claims, both sources, both validity windows, and **no implicit
  precedence** by recency, confidence or similarity. **No conflict table and no
  persisted conflict lifecycle. No migration.**
- **2N-CONFLICT-003:** [OBLIGATION] Resolution is an explicit user act through
  an authority path that already exists, and it is audited. Where an action
  exists, the conflict routes into "Precisa de você".
- **2N-CONFLICT-004:** [OBLIGATION] An unresolved conflict remains **visibly
  unresolved**; nothing disappears because it could not be decided.
- **2N-CONFLICT-005:** [OBLIGATION] Nothing enters "Precisa de você" that the
  user cannot act on. A queue of "the model was unsure" with no available action
  is refused by rule.
- **2N-CONFLICT-006:** [OBLIGATION] No conflict is announced only by a
  notification; every conflict is fully discoverable in-app.

## 11. Files — `2N-FILES`

- **2N-FILES-001:** [BASELINE] The file list, its processing states, its inline
  errors and the existing failed/exhausted job recovery continue to work and are
  proved by this phase's tests.
- **2N-FILES-002:** [BASELINE] Library remains a navigation surface with no new
  data model and no dashboard metrics.
- **2N-FILES-003:** [OBLIGATION] A file's link to an entry, person or project
  is **explicit and sourced**, read from `entity_attachments`; no relation is
  inferred into existence by this family.
- **2N-FILES-004:** [OBLIGATION] Files enter the sensitivity contract **in the
  same change** that first renders them on a contextual page; `sensitivity` is
  selected and honoured wherever a file is displayed.
- **2N-FILES-005:** [OBLIGATION] A file whose subject is gone is not rendered as
  a live association, and orphan detection reuses the existing scanner rather
  than inventing a second notion of orphan.
- **2N-FILES-006:** [OBLIGATION] Extracted text never reaches a surface that
  the classification would mask.
- **2N-FILES-007:** [OBLIGATION] Recovery from a processing failure is reachable
  from wherever the failure is shown.
- **2N-FILES-008:** [OBLIGATION] The library is **genuinely more useful**
  (`OD-2N-9` **option B**): files linked to people and projects, provenance,
  processing states, failure recovery, classification, filters and richer
  discovery, with sensitivity handled throughout. **No new migration** —
  `entity_attachments` already exists, is owner-scoped and is trigger-validated.
- **2N-FILES-009:** [OBLIGATION] The link is navigable **in both directions**: a
  file reached from a person or project, and the people and projects reached
  from a file.
- **2N-FILES-010:** [OBLIGATION] Files can be **classified and filtered** over
  what the owner owns — by processing state, by kind, by linked entity, by
  period — with every filtered list obeying `2N-PRIVACY-004`, so a count is
  never an oracle for what a filter hid.
- **2N-FILES-011:** [OBLIGATION] Discovery does **not duplicate global search**
  and the library does **not become a second storage system**. Where the answer
  is a search, the library links to search rather than reimplementing it.
- **2N-FILES-012:** [OBLIGATION] The family ships with **no migration**. If the
  slice's re-audit proves a material need incompatible with the budget, that is
  a **stop condition and an owner decision**, never a quiet reallocation from
  M1, M2 or M3.

## 12. Relations and the graph — `2N-RELATION`

- **2N-RELATION-001:** [BASELINE] Owner-authored relationships, contexts and
  project associations keep their create/update/end paths and their validity
  windows.
- **2N-RELATION-002:** [OBLIGATION] Every relation the product **renders**
  states its origin: authored by the user, or derived — and if derived, from
  what.
- **2N-RELATION-003:** [OBLIGATION] **Only owner-authored relations persist**
  (`OD-2N-8` **option A**). Extraction may produce a **proposal**, and a
  proposal is not a relation: nothing inferred is persisted automatically.
  **No relation-provenance migration.**
- **2N-RELATION-004:** [OBLIGATION] A relation can be corrected and ended
  through an existing authority path, and the change is audited.
- **2N-RELATION-005:** [OBLIGATION] Confidence is never rendered as certainty,
  and a bare number is never shown as a fact.
- **2N-RELATION-006:** [OBLIGATION] The graph is **secondary** (`OD-2N-10`
  **option B**): it never replaces search, lists or contextual pages, and it is
  never primary navigation. It draws **only** authorized persisted relations —
  so under `2N-RELATION-003` **no unconfirmed inferred relation can appear in
  it**. **No additional migration.**
- **2N-RELATION-007:** [OBLIGATION] Every graph affordance has a **complete
  text/list equivalent** that is **not a degraded version** — reachable by
  keyboard, usable by a screen reader, and carrying the same information.
- **2N-RELATION-008:** [OBLIGATION] Existing relation rows are presented as
  **owner-authored**, without inventing retroactive provenance. *(Restated: this
  identifier previously carried the clause describing how the family would close
  if a graph were not authorized. `OD-2N-10` **option B** authorized one, so the
  identifier now carries the obligation that authorization created. Narrowing an
  unsigned requirement to its signature is not a scope change; inventing a new
  id for the same obligation would have been.)*
- **2N-RELATION-009:** [OBLIGATION] **Every edge is explainable.** Opening one
  says what it asserts and where it came from; where *"you told me"* is the only
  truth available, that is what it says, and it is not dressed up as evidence.
- **2N-RELATION-010:** [OBLIGATION] **No meaning is attributed to position,
  distance, cluster or centrality**, and no numeric confidence is rendered as
  certainty. The graph presents relations, never conclusions drawn from its own
  layout.
- **2N-RELATION-011:** [OBLIGATION] If the graph cannot satisfy
  `2N-RELATION-006…010` within the budget, the work **stops and proposes a
  reduction**. A decorative or misleading graph is refused outright — under
  `OD-2N-10` the authorization is a contract, and a graph that fails it is not a
  smaller success.

## 13. Cross-cutting families

### 13.1 Provenance — `2N-PROV`

- **2N-PROV-001:** [OBLIGATION] Every claim the product displays about a person
  or project is traceable to a record: an entry, an interpretation, a file or a
  user action.
- **2N-PROV-002:** [OBLIGATION] Source and interpretation are visibly
  different things; the original text is reachable from the derived statement.
- **2N-PROV-003:** [OBLIGATION] Opening a source never loses the reader's
  position.
- **2N-PROV-004:** [OBLIGATION] A claim whose source cannot be resolved is
  rendered as unsourced and treated **fail-closed** on classification.
- **2N-PROV-005:** [OBLIGATION] Provenance is read from stored data; no
  provider call is made to explain anything.
- **2N-PROV-006:** [OBLIGATION] No surface presents a count, a cluster or a
  visual arrangement as evidence.

### 13.2 Privacy — `2N-PRIVACY`

- **2N-PRIVACY-001:** [OBLIGATION] The contextual surfaces — **person, project,
  memory, file, and relation/graph wherever it renders information derived from
  those sources** — join `GOVERNED_SURFACES` in the same change that ships their
  first governed consumer, and no surface tests a classification literal on its
  own (`OD-2N-12` **option A**). **This requirement blocks any contextual page
  that keeps rendering raw content outside `GOVERNED_SURFACES`.** No new
  persistence; **no migration**.
- **2N-PRIVACY-002:** [OBLIGATION] Entry content, task titles, memory content
  and file names rendered on a contextual page obey the contract, with the same
  masked-in-place posture and the same local, transient reveal.
- **2N-PRIVACY-003:** [OBLIGATION] Classification is **derived** from the
  source record; no classification column is added to `people` or `projects`.
- **2N-PRIVACY-004:** [OBLIGATION] Counts are computed over everything the user
  owns, masked or not; no affordance reveals how much was hidden.
- **2N-PRIVACY-005:** [OBLIGATION] Classification is **never inferred as
  `normal` by absence**: an unreadable, foreign or missing source resolves to
  the **most protective** outcome. Sensitive rows are **masked in position and
  not dropped** from a list to simplify it, and the reveal is local and
  explicit.
- **2N-PRIVACY-006:** [OBLIGATION] Any widening of search in this phase states
  its sensitivity posture explicitly and does not inherit `false` silently;
  ADR-093 is not reopened by accident.
- **2N-PRIVACY-007:** [OBLIGATION] The fail-closed rule of `2N-PRIVACY-005`
  governs **content whose classification derives from a source record** — entry
  text, task titles, memory bodies, file names and extracted text. It does
  **not** automatically mask a **structural field the owner typed directly onto
  the entity**. Confirmed by **ADR-110**; the interpretation this requirement
  previously flagged is settled.

  **The distinction is structural identifier versus free text, not
  owner-authored versus derived** (`2N-PRIVACY-008`). Confirming this rule for
  names **does not** make every owner-typed field `normal`, and
  `2N-PRIVACY-009` is the proof that it does not.

- **2N-PRIVACY-008:** [OBLIGATION] The phase distinguishes two kinds of
  owner-typed field, and names which is which. A **structural identifier** —
  `people.name`, `projects.name` — is what the user needs to recognise the
  entity at all; it is shown on that entity's own contextual page, and the
  entity's existence and structural counts stay true. **Free text** —
  `people.notes`, and any field of that shape — is not a structural identifier
  and does not inherit its treatment. The taxonomy is stated in the product's
  own terms, not left to be inferred from which fields happen to be masked.
- **2N-PRIVACY-009:** [OBLIGATION] **`people.notes` is masked by default on
  every contextual surface** (ADR-110). It is free text about a human being with
  **no classification of its own and no classifiable source**. Reveal is
  **local, explicit and accessible**, announced rather than merely styled.
  **Absence of classification never resolves to `normal`.** No `sensitivity`
  column is added to `people`; **no sensitivity is inferred from the text of a
  note**; and **no existing note is deleted or altered by this phase**. Editing
  a note remains available — an owner opening the edit form is performing an
  explicit act, not receiving an incidental display.
- **2N-PRIVACY-010:** [OBLIGATION] **`people.notes` is not displayed in full on
  any indirect surface**: not in search results or snippets, suggestions,
  previews, related pages, the graph, or telemetry. **It is not content the
  Brain retrieves** while it carries no reliable classification. **The person's
  name and aliases stay searchable**, and masking a note never hides the person,
  their existence or their counts. *Verified before this requirement was
  written:* `match_internal_knowledge` unions `entry_embeddings` and
  `memories` only and **never reads `people`**, so the retrieval half is
  **already true today** and this requirement keeps it true rather than making
  it true.
- **2N-PRIVACY-011:** [OBLIGATION] An acceptance journey proves the posture
  end to end, in both locales, on desktop and mobile: the person's **name is
  visible** on their own page; **notes are masked**; the **reveal is local,
  explicit and reachable by keyboard and screen reader**; notes are **absent
  from search, retrieval, previews, the graph and telemetry**; **counts are not
  used as an oracle** for what was masked; and **no classification is inferred
  as `normal` by absence**. **Stop condition:** if removing `people.notes`
  from retrieval or search turns out to need a migration, a new column or an
  authority not already present, the work **stops and returns to the owner** —
  it may not consume or reallocate **M1**, **M2** or **M3**.

### 13.3 Time — `2N-TIME`

- **2N-TIME-001:** [OBLIGATION] Every dated value this phase renders routes
  through `src/lib/time/local-day.ts` and carries the owner's zone.
- **2N-TIME-002:** [BASELINE] The tree-wide guard's four families stay at
  **zero** after this phase's routes are added, **asserted rather than
  assumed**. `src/lib/closeout/local-day-correction-guard.test.ts` takes `src/`
  itself as its corpus with a per-file budget of zero, so this phase's
  directories are already inside it and **2N.0 builds no timezone guard of its
  own**. No allowlist may be created to accommodate a new occurrence: a route
  that would need one has a defect, not an exemption. *(Restated by ADR-112:
  this previously obliged the phase to extend `2M-TIME-007`'s **named** corpus.
  A narrower list beside a tree-wide rule is two censuses of one defect, and the
  narrower one reads as authoritative — the exact failure `2M-TIME-007` taught.)*
- **2N-TIME-003:** [OBLIGATION] No fixed offset, no fixed day length and no
  host-zone reader appears in this phase's code.
- **2N-TIME-004:** [BASELINE] The retirement of
  `HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` holds and **no exemption list is
  re-created**. The four `daily-cycle` call sites are **not repaired here** —
  they were repaired by ADR-111's initiative in its Unit 2 (`1734d34`), which is
  why this closes **`baseline` and never `built`**: Phase 2N may not claim
  another initiative's delivery. *(Restated by ADR-112: this previously obliged
  the phase to preserve the self-cleaning half of an exemption list that no
  longer exists, and the most direct way to satisfy it literally would have been
  to re-create one.)*
- **2N-TIME-005:** [BASELINE] The wider population is **enumerated and its
  evidence preserved** — **31 occurrences: 17 zone-less formatters across 16
  files, plus 7 host-zone field reads, 4 UTC day slices and 3 zone round-trips**.
  The enumeration is carried in the initiative's audit and in the guard, and may
  not be reduced to a sentence. *(Restated by ADR-112 under this requirement's
  own "whichever is current" clause: the signed estimate of 13 across 12 files —
  roughly 27 call sites — was re-derived mechanically as 31. An audit counting
  formatters could not see the other three families, and the worst of them
  changed what a review contained rather than how a date was printed.)*
- **2N-TIME-006:** [BASELINE] The repair belonged to a **separate timezone
  initiative** (`OD-2N-13` **option B**), a **mandatory dependency of slice
  2N.1** which was authorized by ADR-111 and **CONCLUDED at `d581e43`** —
  planned and executed under its own owner authorization, with **zero migrations
  created and zero spent**. Its 31 call sites were **not absorbed** into 2N.0
  and **Phase 2N may not claim them as its own delivery**. *(Restated by ADR-112
  for coherence with `2N-TIME-002`: the clause "2N.0 guards only its own
  surfaces" described a guard this phase no longer builds, and the future tense
  described a dependency now discharged.)*

### 13.4 Mobile — `2N-MOBILE`

- **2N-MOBILE-001:** [OBLIGATION] Every surface this phase ships is usable at a
  narrow viewport, with no horizontal scrolling and no truncated control.
- **2N-MOBILE-002:** [OBLIGATION] Every action is reachable through a visible,
  labelled control; no gesture is the only path to anything.
- **2N-MOBILE-003:** [OBLIGATION] Playwright journeys cover desktop and mobile
  projects for each shipped surface.
- **2N-MOBILE-004:** [OBLIGATION] `2L-MOBILE-008` is **re-stated as open**, not
  absorbed: it names Work surfaces this phase does not cover.

### 13.5 Accessibility — `2N-ACCESS`

- **2N-ACCESS-001:** [OBLIGATION] Every surface is fully operable by keyboard,
  in a sensible order, with visible focus.
- **2N-ACCESS-002:** [OBLIGATION] Structure is conveyed semantically, not by
  visual arrangement alone.
- **2N-ACCESS-003:** [OBLIGATION] Masked content, reveal controls and
  destructive confirmations are announced, not merely styled.
- **2N-ACCESS-004:** [OBLIGATION] Any graph affordance has a complete non-visual
  equivalent (`2N-RELATION-007`).
- **2N-ACCESS-005:** [OBLIGATION] Copy exists in both locales for every state in
  §4, through a typed copy module rather than scattered locale ternaries.
- **2N-ACCESS-006:** [OBLIGATION] **No claim of screen-reader conformance is
  made without a real screen-reader run**, and **no VoiceOver or TalkBack run
  may be declared as executed** when it was not. Under `OD-2N-16` **option A**
  no Phase 2N requirement depends on real hardware — mobile is proved in
  viewports and browsers — so **the absence of a screen-reader run does not
  block this phase's closeout**. The real run stays an **open residual with a
  named destination**, alongside `2L-ACCESS-008`, and the phase **does not
  inherit the push hardware checkpoint**.

### 13.6 Telemetry — `2N-METRICS`

- **2N-METRICS-001:** [OBLIGATION] The phase declares a **small content-free
  event set** (`OD-2N-15` **option A**) — small because every event must earn
  its place, and content-free because this is the phase most likely to put a
  person's name in a property.
- **2N-METRICS-002:** [OBLIGATION] Migration **M2** moves the event-name CHECK,
  `private.validate_product_event_properties` and the surface CHECK **in a
  single change**, **before any producer exists**, and **only if real producers
  and consumers are specified and delivered**. If they are not, M2 closes
  **unspent** and the dependent requirements close `not-built-by-rule` — an
  unspent allocation is not a defect.
- **2N-METRICS-003:** [OBLIGATION] **Before M2 exists**, every declared event
  carries a **product question, a producer, a consumer, a surface, closed
  properties, a justification, a forbidden-content test, a planned hosted proof,
  and a cleanup and zero-residue proof**. An event missing any of these is not
  declared.
- **2N-METRICS-004:** [OBLIGATION] Every event is **content-free**. Explicitly
  never recorded: a name, a title, memory content, a filename, a relation, a
  person, a project, conflict text, a raw error, or **any identifier that
  functions as content**. Enforced by the property validator, not by convention.
- **2N-METRICS-005:** [OBLIGATION] No event is declared without a consumer; a
  producer with no reader is refused by the traceability contract.
- **2N-METRICS-006:** [OBLIGATION] The three vocabulary copies move together or
  the change is rejected.
- **2N-METRICS-007:** [OBLIGATION] The hosted proof leaves **zero residue**,
  proved **owner-scoped** rather than by a global count — `product_events` is
  unreadable to `service_role`, so a global count cannot prove it — and the
  cleanup is part of the proof rather than a follow-up.

### 13.7 Security — `2N-SEC`

- **2N-SEC-001:** [OBLIGATION] Every threat in the threat model is either
  mitigated with named evidence or accepted in writing with a reason.
- **2N-SEC-002:** [OBLIGATION] Ownership remains RLS-and-query only; no
  contract added by this phase is load-bearing for isolation.
- **2N-SEC-003:** [OBLIGATION] No new direct client write to any of the five
  domains; consider extending the existing direct-write allowlist to them.
- **2N-SEC-004:** [OBLIGATION] Any destructive or identity operation
  re-validates ownership and preconditions atomically at apply time; a preview
  is never an authorization.
- **2N-SEC-005:** [OBLIGATION] Any new table carries
  `on delete cascade` from `auth.users`, so account deletion coverage does not
  regress.
- **2N-SEC-006:** [OBLIGATION] No retention value is minted; where a window is
  needed the signed 90 days is reused, and **no migration schedules a sweep**.

### 13.8 Closeout — `2N-CLOSE`

- **2N-CLOSE-001:** [OBLIGATION] Every declared requirement is classified
  exactly once as built, baseline, partial, not-built-by-rule or undelivered,
  and the matrix is generated rather than typed.
- **2N-CLOSE-002:** [OBLIGATION] Every partial carries a concrete remainder and
  a named destination.
- **2N-CLOSE-003:** [OBLIGATION] The migration budget is restated at close as
  allocated versus spent, with each spend named to its exclusive destination;
  an unspent allocation is not a defect and an unnecessary spend is.
- **2N-CLOSE-004:** [OBLIGATION] Push and Android are restated **exactly as
  inherited**: implemented and hosted, failing on a real iPhone with HTTP 403,
  never validated on Android, cause unproven, destination unchanged. No close
  may treat either as approved.
- **2N-CLOSE-005:** [OBLIGATION] ADR-055 is restated as neither satisfied nor
  superseded, with its expiry of 2026-10-27.
- **2N-CLOSE-006:** [OBLIGATION] The successor is re-audited and **not
  started**; the re-audit declares no requirement, creates no governing
  artifact and does not retarget the phase-start guard.

## 14. Owner decisions — all seventeen SIGNED

**All seventeen were signed by ADR-109 on 2026-08-12. None is open.** The
options the owner **declined** are preserved in
`PHASE_2N_IMPLEMENTATION_PLAN.md` §7 and in ADR-109 — a decision whose
alternatives have been deleted is a decision nobody can review.

| | Decision | Signed | What it means here |
| --- | --- | --- | --- |
| OD-2N-1 | Person identity | **A** | name-uniqueness stays; `entity_aliases` gains its first reader; no canonical pointer; no migration |
| OD-2N-2 | Project identity | **A** | projects mirror people; one identity model, not two |
| OD-2N-3 | Merge | **A** | **not built**; `2N-IDENTITY-005…007` close `not-built-by-rule` |
| OD-2N-4 | Merge reversibility | **A, conditional** | contract fixed for a future phase; nothing implemented now |
| OD-2N-5 | Memory correction | **A** | reuse `updateMemory`, `setMemoryLifecycle`; no second path, no supersession RPC |
| OD-2N-6 | Memory states | **A** | `active`/`archived` only; archiving must truly leave retrieval; no `suppressed` column |
| OD-2N-7 | Conflicts | **A** | derived at read time; both claims; no table, no lifecycle, no migration |
| OD-2N-8 | Inferred relations | **A** | only owner-authored relations persist; a proposal is not a relation |
| OD-2N-9 | File library | **B** | the larger library — links both ways, classification, filters, discovery — **with no migration** |
| OD-2N-10 | Graph | **B** | secondary graph under a contract that can refuse it; complete non-graph equivalent |
| OD-2N-11 | Deletion | **B** | transactional deletion of person, project and memory; migration **M3** |
| OD-2N-12 | Sensitivity | **A** | contextual surfaces join the contract; derived, fail-closed, masked in place; no migration |
| OD-2N-13 | Timezone | **B** | separate initiative, **mandatory dependency before 2N.1**; not repaired here |
| OD-2N-14 | Migration budget | **B** | **3 allocated · obligation ZERO · non-transferable**; a fourth is a stop condition |
| OD-2N-15 | Telemetry | **A** | a small content-free set, fully specified before M2 |
| OD-2N-16 | Hardware | **A** | nothing here depends on real hardware; absence does not block closeout |
| OD-2N-17 | ADR-055 | **A** | untouched; expiry 2026-10-27 stands |

**One interpretation was required and is flagged rather than absorbed**:
`2N-PRIVACY-007` explains how `OD-2N-12`'s fail-closed rule applies to an
entity's own owner-typed fields, and asks the owner to confirm it.

## 15. Dependencies and residuals

**Consumes:** the source and continuity contracts (2K), the derived-sensitivity
contract (2L), the local-day and calendar contracts (2M), the search contract
(2I, ADR-093), the undo handler registry, the audit log, and the product-events
vocabulary.

**Residuals re-stated as open, not absorbed:** `2L-MOBILE-008`,
`2L-ACCESS-008`, `2E-COMMAND-012`, `2M-DEVICE-004`, `2M-DEVICE-005`,
`2M-ACCESS-007`, `RG-QUO-3`, `RG-DEP-1`, `RG-DEP-3`, `RG-DEP-4`, and ADR-055's
expiry of 2026-10-27.

**Discharged since this package was signed:** the four `daily-cycle` timezone
exemptions were repaired by ADR-111's initiative (Unit 2, `1734d34`) and
`HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` is retired. They leave this list
because they were **fixed**, not because they were absorbed — see `2N-TIME-004`,
which closes `baseline` for exactly that reason.

**Inherited from the Local Day Correction's Unit 5, dispositioned by ADR-112
Decision 7:**

- **In scope, no new requirement needed.**
  `src/app/[locale]/app/loading.tsx` announces `"Carregando página"` in **both**
  locales on a `role="status"` `aria-live="polite"` region, so a screen reader in
  `en` announces Portuguese. §4 obliges every surface this phase ships **or
  touches** to declare its **loading** state in both locales, and this is the
  streaming fallback for all four contextual routes. Carried by
  **`2N-ACCESS-005`** and **`2N-ACCESS-003`**, delivered in **2N.0**.
- **Out of scope, remainder with a destination.** `loadQuestionPreviews`
  (`src/features/agent/question-preview-projection.ts`) turns a rejected row
  shape into an empty `Map` via `.catch(() => new Map())`, so the surface renders
  nothing while appearing to have rendered. **No instance of that pattern exists
  on any Phase 2N surface** — asserted over the four contextual routes and
  `src/features/entities`, not assumed. **Destination:** the questions surface,
  under whichever phase next opens `src/features/agent`. Not implemented here.

**Never a dependency:** push delivery, Android, any external service, any
provider call for explanation.
