# Phase 2N — People, projects, memory, files and relations · PRD

**Authorized for PLANNING ONLY by ADR-108 (2026-08-12). Implementation is not
authorized.** No requirement below has been executed. Nothing here may be read
as permission to write product code, create a page or component, create a
migration, change schema, RLS, a grant, a policy or an RPC, touch an Edge
Function, deploy, add a secret, integrate an external service, resume the push
investigation, open signup, or alter the rollout.

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

## 3. Baseline, obligation and proposal

This PRD declares **108 requirements across 16 families**, each family numbered
from 001 with no gap. Requirements are marked so that the phase cannot claim
credit for what already ships:

- **[BASELINE]** — the behaviour exists today; the requirement is that it is
  *not broken* and is *proved* by this phase's tests.
- **[OBLIGATION]** — the phase must deliver it.
- **[PROPOSAL]** — it depends on an owner decision in §14 and closes
  `not-built-by-rule` against that decision if it is not signed.

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
- **2N-PERSON-002:** [BASELINE] Identity, notes, organization and the
  employer-versus-relationship explainer render as they do today.
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
- **2N-PERSON-008:** [PROPOSAL] Related files render on the page, sourced from
  `entity_attachments`, under the file classification contract
  (`2N-FILES-004`). Depends on `OD-2N-9`.

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
- **2N-PROJECT-005:** [PROPOSAL] Decisions and risks are surfaced **only** if
  they are representable from existing records; if they are not, the family
  closes `not-built-by-rule` with the reason named. Depends on `OD-2N-2`.
- **2N-PROJECT-006:** [OBLIGATION] Bounds are stated exactly as
  `2N-PERSON-003`.
- **2N-PROJECT-007:** [OBLIGATION] Every mutation reuses an existing authority
  path; no direct client write.

## 7. Identity — `2N-IDENTITY`

- **2N-IDENTITY-001:** [OBLIGATION] The phase states, in the product's own
  words, what a person is and what a project is, and the statement matches the
  schema: today identity is a case-insensitively unique name per owner and
  nothing else.
- **2N-IDENTITY-002:** [PROPOSAL] Canonical identity for a person is decided
  and implemented as decided. Depends on `OD-2N-1`.
- **2N-IDENTITY-003:** [PROPOSAL] Canonical identity for a project, likewise.
  Depends on `OD-2N-2`.
- **2N-IDENTITY-004:** [PROPOSAL] Aliases become readable and writable —
  `entity_aliases` gains its first reader and first writer — so a known
  nickname resolves to the person it names. Depends on `OD-2N-1`.
- **2N-IDENTITY-005:** [PROPOSAL] Likely duplicates are **surfaced, never
  merged automatically**, with the evidence for the suggestion shown. Depends on
  `OD-2N-1`.
- **2N-IDENTITY-006:** [PROPOSAL] Merge is a single validated authority path
  with an explicit preview naming every object that will move, ownership of both
  subjects proved in the same statement, and a full audit record. Depends on
  `OD-2N-3`.
- **2N-IDENTITY-007:** [PROPOSAL] Merge reversibility is whatever `OD-2N-4`
  signs, and the product **says which** before the user confirms. If it is
  reversible, undo is registered in the existing handler registry and proved by
  a test that merges, undoes, and asserts the whole prior state including
  relations.
- **2N-IDENTITY-008:** [OBLIGATION] **No inference may create a persisted
  identity.** Extraction may propose; only a user act may create. This holds
  whether or not any other requirement in this family is signed.

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
- **2N-CORRECT-002:** [PROPOSAL] The vocabulary is decided and implemented as
  decided: what **suppress**, **archive** and **remove** each mean, and which
  exist. Depends on `OD-2N-6`.
- **2N-CORRECT-003:** [OBLIGATION] Whatever "no longer used" comes to mean, it
  is enforced **where the retrieval bound is applied**, so a retired memory
  neither reaches the process nor displaces a live one. Proved by a test that
  asserts eviction from retrieval, not absence from a citation list.
- **2N-CORRECT-004:** [PROPOSAL] Deletion, if authorized, propagates across an
  **enumerated** set of referencing tables, transactionally, and the enumeration
  is asserted by test rather than described in prose. Depends on `OD-2N-11`.
- **2N-CORRECT-005:** [PROPOSAL] Deletion, if authorized, is irreversible and
  therefore explicitly confirmed; if it is reversible it has a real, tested
  undo. It cannot be both unstated and performed. Depends on `OD-2N-11`.
- **2N-CORRECT-006:** [OBLIGATION] Every correction, suppression, archival and
  removal is auditable: actor, source, reason, target, time and resulting
  state.
- **2N-CORRECT-007:** [OBLIGATION] Undo targets recorded ids, never re-resolved
  names.
- **2N-CORRECT-008:** [OBLIGATION] No correction path is a direct client write.

## 10. Conflicts — `2N-CONFLICT`

- **2N-CONFLICT-001:** [OBLIGATION] The phase enumerates which conflicts are
  **deterministically detectable from the schema as it stands**, and declares
  the rest out of scope by name rather than leaving them implied.
- **2N-CONFLICT-002:** [PROPOSAL] Detected conflicts are represented without
  choosing a winner: both claims, both sources, no implicit precedence by
  recency, confidence or similarity. Depends on `OD-2N-7`.
- **2N-CONFLICT-003:** [PROPOSAL] Resolution is an explicit user act through an
  authority path that already exists, and it is audited. Depends on `OD-2N-7`.
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
- **2N-FILES-008:** [PROPOSAL] The library's scope beyond the above is whatever
  `OD-2N-9` signs, and nothing more.

## 12. Relations and the graph — `2N-RELATION`

- **2N-RELATION-001:** [BASELINE] Owner-authored relationships, contexts and
  project associations keep their create/update/end paths and their validity
  windows.
- **2N-RELATION-002:** [OBLIGATION] Every relation the product **renders**
  states its origin: authored by the user, or derived — and if derived, from
  what.
- **2N-RELATION-003:** [PROPOSAL] Whether an inferred relation may be persisted
  at all, and with what provenance, is decided and implemented as decided.
  Depends on `OD-2N-8`.
- **2N-RELATION-004:** [OBLIGATION] A relation can be corrected and ended
  through an existing authority path, and the change is audited.
- **2N-RELATION-005:** [OBLIGATION] Confidence is never rendered as certainty,
  and a bare number is never shown as a fact.
- **2N-RELATION-006:** [PROPOSAL] The graph, if built, is **secondary**: it
  never replaces search, lists or contextual pages, every edge is traceable to a
  source, and no layout, cluster or centrality is presented as meaning. Depends
  on `OD-2N-10`.
- **2N-RELATION-007:** [PROPOSAL] Every graph affordance has a **non-graph
  equivalent** that is not a degraded fallback — reachable by keyboard, usable
  by a screen reader, and complete. Depends on `OD-2N-10`.
- **2N-RELATION-008:** [OBLIGATION] If `OD-2N-10` does not authorize a graph,
  the family closes `not-built-by-rule` against that signature, with the
  destination named, and never as a partial.

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

- **2N-PRIVACY-001:** [OBLIGATION] The contextual surfaces join
  `GOVERNED_SURFACES` in the same change that ships their first governed
  consumer, and no surface tests a classification literal on its own.
- **2N-PRIVACY-002:** [OBLIGATION] Entry content, task titles, memory content
  and file names rendered on a contextual page obey the contract, with the same
  masked-in-place posture and the same local, transient reveal.
- **2N-PRIVACY-003:** [OBLIGATION] Classification is **derived** from the
  source record; no classification column is added to `people` or `projects`.
- **2N-PRIVACY-004:** [OBLIGATION] Counts are computed over everything the user
  owns, masked or not; no affordance reveals how much was hidden.
- **2N-PRIVACY-005:** [OBLIGATION] An unreadable or absent source resolves to
  the most protective outcome.
- **2N-PRIVACY-006:** [OBLIGATION] Any widening of search in this phase states
  its sensitivity posture explicitly and does not inherit `false` silently;
  ADR-093 is not reopened by accident.
- **2N-PRIVACY-007:** [PROPOSAL] Whether `people.notes` and project
  descriptions gain a classification posture is decided rather than assumed.
  Depends on `OD-2N-12`.

### 13.3 Time — `2N-TIME`

- **2N-TIME-001:** [OBLIGATION] Every dated value this phase renders routes
  through `src/lib/time/local-day.ts` and carries the owner's zone.
- **2N-TIME-002:** [OBLIGATION] The `2M-TIME-007` guard corpus extends to this
  phase's directories, so a new zone-less formatter cannot be added to them.
- **2N-TIME-003:** [OBLIGATION] No fixed offset, no fixed day length and no
  host-zone reader appears in this phase's code.
- **2N-TIME-004:** [OBLIGATION] The four `daily-cycle` exemptions are **not
  repaired here**; they are re-stated as residuals with their destination
  unchanged, and the self-cleaning half of that exemption is preserved.
- **2N-TIME-005:** [PROPOSAL] The disposition of the wider population of
  zone-less call sites outside both corpora is whatever `OD-2N-13` signs.

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
  made without a real screen-reader run.** Absent one, the requirement closes
  **partial** with a named destination; `2L-ACCESS-008` is re-stated as open.

### 13.6 Telemetry — `2N-METRICS`

- **2N-METRICS-001:** [PROPOSAL] Whether this phase declares any product event
  at all is decided; if it does not, the family closes `not-built-by-rule`
  against the budget. Depends on `OD-2N-15`.
- **2N-METRICS-002:** [PROPOSAL] If events are declared, one migration moves the
  event-name CHECK, the property validator and the surface CHECK **in a single
  change**, before any producer exists.
- **2N-METRICS-003:** [OBLIGATION] Every declared event has a stated question,
  a real producer, a real consumer, a test, and a non-vacuous negative control
  proved through the real write path.
- **2N-METRICS-004:** [OBLIGATION] Every event is **content-free**: no names,
  titles, content, snippets, file names, aliases or free-form properties.
- **2N-METRICS-005:** [OBLIGATION] No event is declared without a consumer; a
  producer with no reader is refused by the traceability contract.
- **2N-METRICS-006:** [OBLIGATION] The three vocabulary copies move together or
  the change is rejected.

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

## 14. Open owner decisions

**None is signed. Each blocks what it says it blocks and nothing else.** Full
options, impacts, migrations, risks and recommendations are in
`PHASE_2N_IMPLEMENTATION_PLAN.md` §7; this is the signable index.

| | Decision | Blocks |
| --- | --- | --- |
| OD-2N-1 | Canonical identity for a person | final planning of the identity slice |
| OD-2N-2 | Canonical identity for a project | the project slice |
| OD-2N-3 | Merge authority | implementation of merge |
| OD-2N-4 | Merge reversibility | implementation of merge |
| OD-2N-5 | Memory-correction authority | the knows/correct slices |
| OD-2N-6 | Suppress vs archive vs remove | the correct slice |
| OD-2N-7 | Conflict representation | the conflict slice |
| OD-2N-8 | Whether inferred relations may be persisted | the relation slice |
| OD-2N-9 | File-library scope | the files slice |
| OD-2N-10 | The graph's role, or none | the graph slice |
| OD-2N-11 | Deletion propagation, or no deletion | the correct slice |
| OD-2N-12 | Sensitivity posture for contextual pages and notes | the first contextual slice |
| OD-2N-13 | Destination of the timezone defects | the foundation slice |
| OD-2N-14 | Final migration budget | implementation, all slices |
| OD-2N-15 | Telemetry: any events at all | the telemetry slice |
| OD-2N-16 | Whether any requirement needs hardware proof | closeout only |
| OD-2N-17 | Relationship to ADR-055 | closeout only |

## 15. Dependencies and residuals

**Consumes:** the source and continuity contracts (2K), the derived-sensitivity
contract (2L), the local-day and calendar contracts (2M), the search contract
(2I, ADR-093), the undo handler registry, the audit log, and the product-events
vocabulary.

**Residuals re-stated as open, not absorbed:** `2L-MOBILE-008`,
`2L-ACCESS-008`, `2E-COMMAND-012`, the four `daily-cycle` timezone exemptions,
`2M-DEVICE-004`, `2M-DEVICE-005`, `2M-ACCESS-007`, `RG-QUO-3`, `RG-DEP-1`,
`RG-DEP-3`, `RG-DEP-4`, and ADR-055's expiry of 2026-10-27.

**Never a dependency:** push delivery, Android, any external service, any
provider call for explanation.
