# Phase 2N — current-experience audit

**This is a report, not a plan.** It declares no requirement in this
repository's declaration shape, creates no governing artifact, allocates no
migration, authorizes no implementation, and changes no product behaviour.
Everything below was read from source on **2026-08-12**, against `main` at
`eab6d08`, with **92 migrations at hosted parity `202608120092`** (live
read-only `supabase migration list --linked`, local equal to remote on every
row).

Its purpose is to replace the roadmap's description of the successor with what
the product actually is. Where the two disagree, the product wins.

---

## 0. Method, and the trap this census had to survive

The owner's brief required a census *"robust to multi-line calls and
comments"*. It had to survive one more thing, found here.

**A literal-text scan of the migration chain reports that seventeen core domain
tables have no RLS policy and no grant.** That is false. `people`, `projects`,
`memories`, `entries`, `attachments`, `entry_entities`,
`person_relationships`, `person_contexts`, `person_projects`, `contexts`,
`tags`, `entity_tags`, `entity_attachments`, `organizations`,
`entry_interpretations`, `pending_questions` and `summaries` all have forced
RLS and a full policy set — created inside four `do $$ … $$` blocks that build
them with `execute format('create policy %I on public.%I …')`. A regex looking
for `create policy … on public.people` finds nothing, because that string
never appears in the repository.

Four generators exist:

| Migration | Tables it arms |
| --- | --- |
| `202607160003_intelligent_capture.sql` | `contexts`, `organizations`, `projects`, `people`, `entries`, `entry_interpretations`, `entry_entities`, `tasks`, `audit_logs`, `undo_operations` |
| `202607160006_chat_memory.sql` | `memories`, `entry_embeddings`, `conversations`, `conversation_messages` |
| `202607160007_agent_operations.sql` | `pending_questions`, `reminders`, `notifications`, `heartbeat_runs`, `summaries`, `attachments`, `entity_attachments`, `jobs` |
| `202607160009_domain_relationships.sql` | `person_relationships`, `person_contexts`, `person_projects`, `task_people`, `task_projects`, `task_contexts`, `task_dependencies`, `tags`, `entity_tags` |

Each loop performs, per table: `enable row level security`, `force row level
security`, four owner-scoped policies (`select`, `insert`, `update`,
`delete`), `grant select, insert, update, delete … to authenticated`, and
`revoke all … from anon`.

**After resolving the loops, zero domain tables are unprotected.** The census
below is the resolved one. This is recorded because the naive result was
alarming and wrong, and because the next census to run against this schema will
hit the same wall.

---

## 1. The five domains, as schema

Read from `src/lib/supabase/database.types.ts` (regenerated with every
migration) and cross-checked against the migration chain. **53 tables, 89
functions, zero views.**

### 1.1 `people` — 7 columns

`id`, `user_id`, `name`, `notes`, `organization_id`, `created_at`,
`updated_at`.

There is **no canonical-identity column, no merge pointer, no tombstone, no
`deleted_at`, no `status`, no `sensitivity` and no provenance**. Identity is
`people_user_name_idx` — a unique index on `(user_id, lower(name))`. A person
*is* a case-insensitively unique name per owner, and that is the entire
identity model.

### 1.2 `projects` — 8 columns

As `people`, plus `description` and `status`
(`active | paused | completed | archived`). `projects` is the only one of the
five domains with a lifecycle column, and `archived` is a project *state*, not
a deletion.

### 1.3 `memories` — 16 columns

`content`, `kind`, `confidence`, `important`, `sensitivity`, `person_id`,
`project_id`, **`source_entry_id`**, `valid_from`, `valid_until`, `embedding`,
`embedding_model`, plus keys and timestamps.

This is the richest of the five. It already carries a **source**, a
**classification**, a **confidence** and a **validity window**. It carries
**no `status`**, no supersession pointer, no conflict link and no correction
history.

### 1.4 `attachments` — 13 columns

`original_name`, `mime_type`, `size_bytes`, `storage_path`, `status`,
`processing_error`, `extracted_text`, `description`, **`sensitivity`**, plus
keys and timestamps. Paired with `attachment_interpretations` (13 columns:
`description`, `extracted_text`, `extracted_dates`, `extracted_people`,
`extracted_projects`, `task_candidates`, `raw_output`, `model`, `version`).

### 1.5 Relations

| Table | Carries | Does **not** carry |
| --- | --- | --- |
| `entry_entities` | `entry_id`, `interpretation_id`, `entity_type`, `entity_id`, `mention`, `confidence` | — |
| `person_relationships` | `person_id`, `related_person_id`, `relationship_type`, `description`, `confidence`, `valid_from`, `valid_until` | **any source, interpretation or origin** |
| `person_projects` | `person_id`, `project_id`, `role`, `confidence`, `valid_from`, `valid_until` | **any source** |
| `person_contexts` | `person_id`, `context_id`, `confidence`, `valid_from`, `valid_until` | **any source** |
| `entity_attachments` | `entity_type`, `entity_id`, `attachment_id` | validity, confidence, **source** |
| `entity_tags` | `entity_type`, `entity_id`, `tag_id` | validity, confidence, **source** |
| `entity_aliases` | `alias`, `normalized_alias`, `entity_type`, `entity_id`, `valid_from`, `valid_to` | **source** |

**Finding A — a relation cannot say where it came from.** Three relation
tables carry a `confidence` number, which only makes sense for something
inferred, and none carries the thing that would make an inference
inspectable. `entry_entities` — the mention table — *does* carry
`interpretation_id`, `mention` and `confidence`, and is the only relation in
the product that can answer *"where did this come from"*.

---

## 2. The fifteen domains, classified by evidence

### 2.1 Pessoas — **substantially built, ungoverned**

`/app/people` (list) and `/app/people/[personId]` (detail) both ship.
The detail page renders: an identity hero with organization and an explainer
distinguishing employer from relationship; an edit form; a relationship panel
with **create, update and end**; a context association panel; linked tasks; a
project association panel **with roles**; memories; and an entry timeline
linking back to `/app/inbox/[entryId]`.

The roadmap describes 2N.1 as building this page. **It exists.** What it lacks
is not sections but *contracts* — see 2.11, 2.8 and 2.12.

Bounds: every list is `.limit(100)` (`.limit(50)` for relationships and
contexts, `.limit(200)` for the project selector) with **no pagination and no
"bounded" disclosure**, so a person with 120 mentions silently shows 100.

### 2.2 Projetos — **built, thinner than people**

`/app/projects/[projectId]` ships and is 157 lines against the person page's
237. It renders identity, status, linked people, tasks and an entry timeline.
It has no decisions section, no risks, no "recent changes" and no next
actions — the four things the roadmap's 2N.2 names beyond what exists.

### 2.3 Memórias — **built, with a real lifecycle and no removal**

`/app/memories` and `/app/memories/[memoryId]` ship. `src/features/memories/`
contains `actions.ts`, `lifecycle.ts`, `read.ts`, `schema.ts`, `undo.ts`, an
edit form and a proposal card.

`memoryLifecycleState` derives **three states from the two validity columns** —
`scheduled` (not yet true), `active` (in force), `archived` (`valid_until` has
passed) — and the module states plainly that *"archive… never a physical
delete, which would destroy the provenance the surface exists to show"*.
`setMemoryLifecycle` is the authority path that moves a memory between them.

**There is no suppress, and no remove.** The vocabulary has one lever
(validity) doing one job (time), and the product has no way to express *"this
was never true"* as distinct from *"this stopped being true"*.

### 2.4 Entries — **built; the provenance spine of everything else**

`entries` → `entry_interpretations` (31 columns, versioned, with
`parent_interpretation_id`, `corrected_by`, `correction_reason`, `origin`,
`prompt_version`, `strategy_version`, `element_classifications`,
`resolution_evidence`) → `entry_entities`. `correct_entry_interpretation` is a
real RPC. This is the strongest provenance model in the product, and the
contextual pages consume almost none of it.

### 2.5 Arquivos — **more built than the roadmap assumes**

`/app/files` (369 lines) renders the file list with status badges, shows
`processing_error` inline, lists **failed and exhausted jobs**, and offers
`retryAttachmentJob` with a "retry available at" time. Recovery from processing
failure — the thing 2N.5 names — **ships today**.

`/app/library` is a *navigation hub* built by `2I-LIB-001…008`, explicitly
"no new data model, no dashboard metrics". It renders counts as door-labels.

What is missing is the *link* half: `entity_attachments` exists and is written
by nothing that the file page surfaces, so a file cannot be seen from a person
or a project, and a person cannot be seen from a file.

### 2.6 Relações e grafo — **modelled, partly written, never visualised**

The relational model is real (2.5 above). There is **no graph surface of any
kind** — no page, no component, no library. The roadmap's 2N.6 has nothing to
build on except the relation tables, and those cannot currently explain
themselves (Finding A).

### 2.7 Busca e retrieval — **built, with two gaps that matter here**

`searchEverything` covers **seven domains**: `tasks`, `entries`, `memories`,
`people`, `projects`, `organizations`, `files`. Bounded at 8 per domain and 40
total, and the response *says* which bound it hit. Default sensitivity is
`["normal", "private"]`; `highly_sensitive` requires an explicit sensitive
scope (ADR-093).

Two gaps:

- **`people` and `projects` are declared `hasSensitivity: false`**, which is
  true of the columns and false of the content: `people.notes` is free text
  the owner wrote about a human being, and it is searched and snippeted with
  no classification available at all.
- **Search does not filter memory validity.** An `archived` memory — one the
  Memories page badges as no longer true — is returned by search as a current
  result.

**Aliases are not consulted.** `entity_aliases` is not in `DOMAIN_SPECS`, so
searching a nickname finds nothing.

### 2.8 Fontes e proveniência — **asymmetric**

| Object | Can answer "where did this come from?" |
| --- | --- |
| Memory | **Yes** — `source_entry_id` |
| Entity mention | **Yes** — `entry_entities.interpretation_id` + `mention` |
| Interpretation | **Yes** — versioned, with parent and correction reason |
| Person ↔ person relation | **No** |
| Person ↔ project relation | **No** |
| Person ↔ context relation | **No** |
| Entity ↔ attachment link | **No** |
| Entity ↔ tag link | **No** |
| Alias | **No** |

The person page renders relationships from the "No" half of that table as
plain statements of fact.

### 2.9 Conflitos — **does not exist**

No table, column, RPC, projection or surface represents two memories that
contradict each other. `pending_questions` is the nearest thing and is a
different concept: it is the extractor's *ambiguity at capture time*
(`question`, `reason`, `confidence`, `status`, `snoozed_until`,
`answered_at`), resolved by `resolve_pending_question_v3`, and surfaced at
`/app/questions`. It answers *"the model was unsure"*, never *"these two
things you told me cannot both be true"*.

**`list_needs_attention` is real** and returns `entry_id`, `reason`,
`occurred_at`, `current_interpretation_id`, `job_id`, `open_question_id` —
entry-shaped, not claim-shaped. Routing a memory conflict into "Precisa de
você" therefore has no existing lane.

### 2.10 Correção e exclusão — **correction exists; deletion does not exist at all**

**A repository-wide search finds zero `.delete()` calls in `src/`.**

Nothing in the product deletes a person, a project, a memory, an
organization, a context, a tag or an attachment. Every domain table grants
`delete` to `authenticated` and no code path uses it. The only deletion that
exists is whole-account deletion, which works by `on delete cascade` from
`auth.users` — every domain table declares
`user_id … references auth.users(id) on delete cascade`, so account deletion
coverage for these five domains is **complete and automatic**.

Consequences worth stating precisely:

- "Deletion propagation" currently has **no source event to propagate from**.
- "Soft delete" and "hard delete" are both absent; there is no tombstone to
  confuse with one.
- A person created by mistake can be renamed and never removed.

Correction, by contrast, is well served: `updatePerson`, `updateMemory`,
`setMemoryLifecycle`, `correct_entry_interpretation`,
`createOwnerRelationship` / `updateOwnerRelationship` / `endOwnerRelationship`,
and the association add/end pairs. `audit_logs` and `undo_operations` both
exist, the latter with `before_state`, `after_state`, `entity_ids`,
`expires_at` and a handler registry.

### 2.11 Sensibilidade e privacidade — **the contract exists and does not reach here**

`GOVERNED_SURFACES` is exactly eight: `hoje`, `attention`, `capture_receipt`,
`review_summary`, `notification`, `chat`, `work`, `calendar`.

**None of them is a person, project, memory or file page.** The reader census
confirms it: 43 files reference sensitivity and **not one is under
`src/features/entities/`, `src/app/[locale]/app/people/`, `.../projects/`,
`.../memories/` or `.../files/`**.

What that means concretely, on a page that ships today:

- `/app/people/[personId]` selects entries with **no sensitivity predicate**
  and renders `entry.original_content` in full in the timeline.
- It renders `memory.content` in full.
- It renders task titles in full — the exact content `work` masks, one route
  over.
- `/app/files` selects attachments **without selecting `sensitivity` at all**,
  though the column exists and is populated.

This is the same divergence `2J-PRIVACY-001` was created to end — *"two
surfaces of one product meant two answers"* — surviving one domain over
because the contract's surface list was extended to each new phase's surfaces
and never backwards to the pages that already existed.

**It is a presentation gap, not an isolation gap.** Ownership comes from the
authenticated query under forced RLS, which is intact everywhere; no account
can see another's rows.

### 2.12 Mobile — **not separately verified for these pages**

`2L-MOBILE-008` remains open. No 2N surface has a mobile-specific journey.
The person page's two-column `entity-columns` layout has no evidence of a
narrow-viewport journey in the e2e estate.

### 2.13 Acessibilidade — **partial, and never proven by a screen reader**

`2L-ACCESS-008` remains open and **no real screen reader has ever been run**
against any surface in this product. `accessibility-mirror-guard.test.ts`
exists and is structural.

### 2.14 Telemetria — **three vocabulary copies, and no 2N surface**

`product_events` enforces its vocabulary at five points; the surface CHECK
currently admits `home`, `capture`, `inbox`, `needs_attention`,
`interpretation_review`, `technical_details`, `work`, `questions`, `server`,
`task_command`, `conversation`, `calendar`.

**There is no `person`, `project`, `memory`, `library` or `relation`
surface**, and no event about inspecting, correcting or removing knowledge.
Any 2N telemetry costs a migration, and it must move the event-name CHECK, the
property validator and the surface CHECK **in one change**, before any
producer exists.

### 2.15 Retenção e account deletion — **covered, by cascade**

Account deletion reaches all five domains by FK cascade (2.10). Retention
sweeps (`RG-QUO-3`) remain **unscheduled** and that is a rollout-gate residual,
not a 2N one.

---

## 3. The timezone gate

`2M-TIME-007`'s guard names **four** carried-past-close files:
`daily-cycle/entry-review.tsx`, `daily-cycle/inbox-item.tsx`,
`daily-cycle/needs-attention-item.tsx`, `daily-cycle/technical-details.tsx`.
Its exemption is honest — it asserts each file *still* has the defect, so a
repair forces the name out.

**But its corpus is eight directories, and none of them is a 2N surface.**

Re-running the guard's own two detectors (`formattersWithoutZone`, comments
stripped) across all of `src/` finds **13 zone-less formatter call sites in 12
files outside the corpus**:

| File | Sites | What it dates |
| --- | --- | --- |
| `app/people/[personId]/page.tsx` | 2 | relationship "since", entry timeline instants |
| `app/projects/[projectId]/page.tsx` | 1 | entry timeline instants |
| `app/memories/[memoryId]/page.tsx` | 1 | memory validity/provenance instants |
| `app/inbox/[entryId]/page.tsx` | 1 | `occurred_at` |
| `app/files/page.tsx` | 1 | job "retry available at" |
| `app/chat/page.tsx` | 1 | conversation dates |
| `features/search/search-surface.tsx` | 1 | result dates |
| `features/shell/home-dashboard.tsx` | 2 | due dates **and the "today" label itself** |
| `features/conversation-sources/source-list.tsx` | 1 | source dates |
| `features/agent/question-outcome-panel.tsx` | 1 | question dates |
| `features/agent/question-preview-panels.tsx` | 1 | question dates |
| `features/agent/actions.ts` | 1 | + a host-zone `Date` reader |

Per-item characterisation for the four **named** exemptions, as the brief
requires:

| | Surface | Field | Source instant | Zone used | Correct zone | Impact | Sites | Migration? | Tests | 2N re-use risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Inbox item | capture/occurrence date | `entries.occurred_at` | host (**UTC on the server**) | owner's `timezone` | an entry captured late evening shows the next day | 1 | **No** | structural guard only | **Low** — 2N does not render the inbox list |
| 2 | Entry review | interpretation instants | `entries.occurred_at` | host | owner's | same | 1 | **No** | structural | **Low** |
| 3 | Needs-attention item | queue item date | `entries.occurred_at` | host | owner's | a queue item appears to be from tomorrow | 1 | **No** | structural | **Low** |
| 4 | Technical details | diagnostic timestamps | job/interpretation instants | host | owner's | diagnostics only | 1 | **No** | structural | **Very low** |

None of the four needs a migration; the owner's zone is already available and
already threaded through five neighbouring surfaces. The repair is mechanical
and its risk is breadth, not depth.

**The finding that changes the decision is not the four. It is that the
population is at least seventeen, that six of the outliers are the exact pages
Phase 2N would extend, and that no guard is pointed at them.** A person page
that gains a "last seen" line inherits the defect on day one.

Three options are put to the owner as **OD-2N-13** (§4). This report corrects
nothing.

---

## 4. What the roadmap proposed, against what exists

| Roadmap slice | Reality | Honest disposition |
| --- | --- | --- |
| 2N.0 audit + decisions | — | **Stands.** Its content changes: the audit is done; the decisions are the work |
| 2N.1 person page | **Ships.** Sections, edit, relationships, associations, timeline | **Re-scope to hardening**: sensitivity, provenance, local day, bounds |
| 2N.2 project page | **Ships**, thinner | **Re-scope**, plus the four missing sections |
| 2N.3 "What the Brain knows" | Memories page + a real 3-state lifecycle ship | **Re-scope to inspection + correction authority**; supersede/suppress is the new part |
| 2N.4 memory conflicts | **Nothing exists** | **Stands.** Largest genuinely new surface |
| 2N.5 file Library | Library ships (nav); files ship **with recovery** | **Re-scope to linking and provenance**, not construction |
| 2N.6 relationship graph | Relations modelled, **unsourced**; no graph | **Stands, conditional** on relations gaining a source first |
| 2N.7 a11y/privacy/telemetry/closeout | — | **Stands** |

**Duplicated authority found:** every domain table grants `insert/update/delete`
directly to `authenticated` *and* is written through Server Actions. The
direct-write guard already tracks this for `tasks` (empty allowlist) and
`reminders` (single writer); the five 2N domains have no such allowlist.

**Contradiction found:** `entity_aliases` has explicit RLS policies and grants
written for it, and **zero readers and zero writers** in the application. The
only occurrence of the identifier outside SQL is the generated types file. The
duplicate-recognition mechanism was built and never switched on.

---

## 5. What must not be confused, restated against evidence

- **A name in text is not a persisted entity.** `entry_entities.mention` is
  the text; `people.id` is the entity; `resolve_owned_entity_exact` is the
  bridge, and it is *exact*.
- **An inferred association is not a confirmed relation.** Three relation
  tables carry `confidence` and no source.
- **Content search is not a contextual page.** Both exist; neither is the
  other.
- **A memory is not a true fact.** It is a claim with a source, a confidence
  and a validity window.
- **A source is not an interpretation.** `entries.original_content` versus
  `entry_interpretations.summary`; the product keeps both, and the person page
  shows only the first.
- **Soft delete is not deletion propagation.** Neither exists.
- **An audit log is not an undo.** Both exist and are different tables.
- **An attached file is not a library.** `entity_attachments` has no surface.
- **A visual graph is not a relational model.** The model exists; the graph
  does not.
- **A structural test is not a real experience.** No screen reader has run;
  two surfaces shipped for a whole phase without ever rendering.

---

## 6. Negative results, recorded as executed

Each was run rather than assumed:

1. No `docs/initiatives/phase-2n/` or `docs/reports/phase-2n/` before this
   package.
2. No requirement identifier in this phase's namespace anywhere in the
   repository; the only match was the A13 guard's own fixture strings.
3. No merge, split, alias-resolution or canonical-identity function among the
   **89** database functions.
4. No `.delete()` in `src/`.
5. No graph page, component or dependency.
6. No conflict table, column or RPC.
7. No `person`, `project`, `memory` or `library` member of
   `GOVERNED_SURFACES`.
8. No `person`, `project`, `memory`, `library` or `relation` value in the
   `product_events` surface CHECK.
9. No reader and no writer for `entity_aliases`.
10. Signup closed (`[auth].enable_signup = false`); rollout gate
    **25 pass · 3 fail · 2 owner-signature**, unchanged and untouched.

---

## 6b. What the owner decided about each finding

**Added 2026-08-12, after ADR-109 signed all seventeen decisions.** The findings
above are **unchanged** — this section records their disposition, so a reader
can see which were acted on, which were declined, and which were sent elsewhere.

| Finding | Signed disposition |
| --- | --- |
| The contextual pages already ship (§2.1, §2.2) | Accepted. The roadmap's construction slices become **hardening** slices |
| Those pages are outside the sensitivity contract (§2.11) | **Fixed in 2N.0.** `OD-2N-12` **A** — person, project, memory, file and graph join `GOVERNED_SURFACES`; derived, fail-closed, masked in place; **no migration** |
| Removal leaves citation, not retrieval (§2.3, §2.7) | **Fixed in 2N.3.** `OD-2N-6` **A** requires archiving to genuinely leave retrieval; migration **M1** |
| No delete path exists at all (§2.10) | **Built in 2N.3.** `OD-2N-11` **B** — transactional deletion of person, project and memory; migration **M3**; enumerated propagation, preview, audit, undo, and a stop condition if a propagation cannot be truthfully undone |
| `entity_aliases` has no reader (§2.7, §4) | **Switched on in 2N.0.** `OD-2N-1`/`OD-2N-2` **A** — first reader; **no migration** |
| No merge, split or canonical identity (§2.1, §4) | **Declined.** `OD-2N-3` **A** — no merge this phase; `2N-IDENTITY-005…007` close `not-built-by-rule`. `OD-2N-4` **A** fixes the reversibility contract for a future phase |
| Relations carry confidence and no source (§2.8, Finding A) | **Closed by refusal.** `OD-2N-8` **A** — inferred relations are never persisted; existing rows are presented as owner-authored **without inventing retroactive provenance**; **no migration** |
| The timezone defect is larger than four (§3) | **Separate initiative.** `OD-2N-13` **B** — a **mandatory dependency of 2N.1**, separately authorized. **Not repaired by Phase 2N**, and its ~27 call sites are **not absorbed** into 2N.0 |
| Files unreachable from their subject (§2.5) | **Built in 2N.5**, and larger: `OD-2N-9` **B** adds classification, filters and discovery, **with no migration** |
| No conflict representation (§2.9) | **Built in 2N.4**, derived at read time: `OD-2N-7` **A** — no conflict table, no lifecycle, **no migration** |
| No 2N telemetry surface (§2.14) | **Built in 2N.7** if real producers and consumers are delivered: `OD-2N-15` **A**, migration **M2**, else **unspent** |
| Bounds are silent (§2.1) | **Fixed in 2N.0** |
| No graph (§2.6) | **Built in 2N.6**, secondary, under a contract that can refuse it: `OD-2N-10` **B**; **no migration**, because `OD-2N-8` A leaves no inferred edge to draw |

**Two findings were closed by declining to build something rather than by
building a mitigation** — merge and persisted inference. That is the cheapest
and most complete form of closure available, and this phase used it twice.

**One point in the audit needed an interpretation and did not get a silent
one.** `OD-2N-12`'s fail-closed rule, read literally over every field, would
mask a person's own **name** on their own page, because a name has no source
entry. `2N-PRIVACY-007` records the reading actually intended — the rule governs
*source-derived content*, not an entity's own owner-typed fields — and **asks
the owner to confirm it**.

## 7. Inherited truths, preserved without reclassification

Push is implemented and hosted. Push **fails on the owner's real iPhone with
HTTP 403 from Apple Web Push**. The hosted self-check answers `subject:
operational`, `publicKey: p256_point`, `privateKey: p256_scalar`,
`pair: consistent`. **The cause of the 403 is not proven.** Android is **NOT
EXECUTED**. No real screen reader has been run. No offline test or emulation
satisfies hardware. The four `daily-cycle` timezone defects are enumerated in a
self-cleaning guard exemption. `2L-MOBILE-008`, `2L-ACCESS-008` and
`2E-COMMAND-012` remain residual. `RG-QUO-3`, `RG-DEP-1` and `RG-DEP-3` still
fail; `RG-DEP-4` is unsigned. **ADR-055 expires 2026-10-27**, neither satisfied
nor superseded. The push investigation's destination is
`docs/initiatives/push-hardware-validation/`.

None of these was reopened, altered or "fixed while nearby" by this audit.
