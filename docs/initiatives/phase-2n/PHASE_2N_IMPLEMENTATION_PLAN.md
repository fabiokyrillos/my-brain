# Phase 2N — implementation plan

**Planning authorized by ADR-108 (2026-08-12). All seventeen owner decisions
SIGNED by ADR-109 (2026-08-12). IMPLEMENTATION THROUGH CLOSEOUT AUTHORIZED by
ADR-112 (2026-08-13).** The execution loop in §9 is live, slice by slice, in the
order below. **No migration exists yet**: the three allocated below are
**non-transferable**, each is spent only at its own slice, **M2 only once real
producers and consumers exist**, an allocation may close **unspent**, and a
**fourth is a STOP CONDITION** returning the work to the owner.

**The timezone dependency between 2N.0 and 2N.1 is discharged** — ADR-111's
Local Day Correction concluded at `d581e43` with zero migrations spent — so 2N.1
is unblocked and this phase **inherits** that repair rather than delivering it.

Companion PRD: `PHASE_2N_PRD.md` — **127 requirements across 16 families**.
ADR-110 settled the one interpretation ADR-109 left flagged and fixed the
posture of `people.notes`, adding four requirements and **no migration**.
Evidence: `docs/reports/phase-2n/`.

---

## 1. How this plan differs from the roadmap

`PHASE_2K_2O_ROADMAP_DESIGN.md` §6 proposes eight slices. The audit found that
**three of them describe surfaces that already ship**, so building them as
described would let the phase claim credit for work Phase 2I and the
entity-graph initiative already did — the failure the Phase 2I closeout recorded
three times.

| Roadmap | This plan | Why |
| --- | --- | --- |
| 2N.0 audit + decisions | **2N.0 foundations** — kept, re-aimed at contracts | The audit is done; the contracts it exposed are the work |
| 2N.1 build person page | **2N.1 person page hardening** | It ships; it is ungoverned, unsourced, unbounded and host-zoned |
| 2N.2 build project page | **2N.2 project page hardening + the four missing sections** | Thinner than the person page, same defects |
| 2N.3 "What the Brain knows" | **2N.3 inspection, correction and deletion** | Memories and a real lifecycle ship; authority is the new part — and `OD-2N-11` **B** added deletion, which the product has never had |
| 2N.4 memory conflicts | **2N.4 conflicts** — unchanged | The only genuinely empty slice |
| 2N.5 file Library | **2N.5 the library: links, classification, filters, discovery** | Library and failure recovery ship; `OD-2N-9` **B** signed the larger scope, and the link table still has no surface |
| 2N.6 graph | **2N.6 confirmed relations, then a secondary graph** | `OD-2N-10` **B** authorized one under a contract that can refuse it; `OD-2N-8` **A** guarantees every edge is owner-authored |
| 2N.7 closeout | **2N.7 closeout** — unchanged | — |
| — | **A separate timezone initiative, between 2N.0 and 2N.1** | `OD-2N-13` **B**: a mandatory dependency of 2N.1, separately authorized, and deliberately *not* absorbed into 2N.0 |
| — | **No identity slice** | `OD-2N-3` **A** removed merge entirely; what remains of identity is alias reading, which lives in 2N.0 |

The slice count stays at eight, plus one **separately authorized initiative**
that must complete before 2N.1. Two slices are re-aimed, three are re-scoped
from construction to hardening, and identity gets no slice because the owner
declined merge.

## 2. The ordering constraint that drives everything

**A contextual page may not gain a new section before it is governed.** Adding
"related files" or "recent memories" to a page that renders raw sensitive
content in the host's timezone multiplies an existing defect across new
surfaces. So:

```
2N.0 (sensitivity + bounds contracts + alias reading + guards)
   ├─> [TIMEZONE INITIATIVE — separate authorization] ─> 2N.1 person ─> 2N.2 project ─┐
   └─> 2N.3 knows / correct / delete (M1, M3) ─> 2N.4 conflicts ────────────────────┤
                                                                                     ├─> 2N.5 files ─> 2N.6 relations + graph ─> 2N.7 close (M2)
```

2N.0 is a **precondition**, not a warm-up.

**The timezone initiative sits on the path to 2N.1 and only to 2N.1.**
`OD-2N-13` **B** makes it a mandatory dependency of the first contextual slice —
a person page must not gain sections while its dates are wrong — but it does
**not** block 2N.3, which touches no contextual page. That is why the graph
above forks: **2N.3 can run while the timezone initiative is being authorized
and executed**, and the phase does not idle waiting for an authorization it does
not control.

## 3. Slices

Each slice: its own branch, its own PR, CI green on the PR head **and** on the
exact merge SHA (ADR-090, green ×1), and the next slice re-audited against the
updated product before it starts.

### 2N.0 — Foundations: privacy, time and bounds contracts

- **Objective.** Make the contextual surfaces governable before anything is
  added to them.
- **Experience delivered.** Sensitive content stops being printed in full on the
  person, project, memory and file pages. Truncated lists start saying they are
  truncated. The route loading state stops announcing Portuguese to an English
  screen reader. *(Amended by ADR-112: "dates stop being wrong for anyone not
  living in UTC" was **already delivered** by ADR-111's initiative, which
  concluded at `d581e43` and proved it rendering on the deployed application.
  This slice inherits correct dates rather than producing them, and may not
  claim them — see `2N-TIME-002`, `-004`, `-005` and `-006`, all `baseline`.)*
- **Requirements.** `2N-PRIVACY-001…011`, `2N-TIME-001…006`,
  `2N-PERSON-003`, `2N-PROJECT-006`, `2N-KNOWS-007…008`, `2N-SEC-002`,
  `2N-SEC-003`, `2N-IDENTITY-001…004`, `2N-IDENTITY-008…009`.
- **Dependencies.** None. Its decisions — `OD-2N-12` A, `OD-2N-13` B, `OD-2N-1`
  A, `OD-2N-2` A — are **signed**, and ADR-110 settled the field taxonomy and
  the `people.notes` posture that this slice implements.
- **Files.** `src/features/sensitivity/contracts.ts` (surface list),
  a derivation for entry/memory/file subjects, the four contextual routes, a
  shared bounds vocabulary, an `entity_aliases` reader for entity resolution and
  search, `src/features/search/contracts.ts` (**narrowing the `people` domain so
  `notes` is neither matched nor snippeted**), `src/app/[locale]/app/people/page.tsx`
  (the list currently prints `notes` as each row's subtitle), and
  `src/app/[locale]/app/loading.tsx` (its `role="status"` fallback announces
  `"Carregando página"` in both locales — ADR-112 Decision 7a, carried by
  `2N-ACCESS-005` and `2N-ACCESS-003`).
  *(Amended by ADR-112: `phase-2m-fixed-offset-guard.test.ts` **leaves this
  list**. Its corpus extension is what `2N-TIME-002` used to require, and a
  tree-wide guard at zero already covers these directories — building a second,
  narrower census is the failure that requirement now exists to prevent.)*
- **Authority paths.** None new. Read-only, plus alias reading.
- **Schema impact.** **None.** No migration. `entity_aliases` already exists
  with its own policies and grants; this slice gives it its first reader.
- **What it must not do.** It must **not** claim the timezone repair as its own
  delivery: the 31 call sites were fixed by ADR-111's initiative, and
  `2N-TIME-002`, `-004`, `-005` and `-006` all close **`baseline`**. It must
  **not** build a second timezone guard, and it must **not** add a row to
  `OPEN_OCCURRENCES` to accommodate a new route. *(Amended by ADR-112, which
  replaced "its guard extension covers its own surfaces only" — this slice now
  extends no timezone guard at all.)*
- **Tests.** Contract unit tests per surface; the convergence guard extended; a
  negative control proving a masked surface is actually masked; and an assertion
  that the tree-wide local-day guard's four families are **still at zero** with
  `OPEN_OCCURRENCES` **still empty** once this slice's routes are in place.
- **Journeys.** Desktop + mobile, both locales: a `highly_sensitive` entry
  masked on the person page and revealable locally.
- **Accessibility.** Mask and reveal announced, not merely styled.
- **Security.** T-8, T-12, T-14, T-15.
- **Telemetry.** None.
- **Acceptance.** No contextual surface renders classified content unmasked; the
  tree-wide guard's four families are still at zero with `OPEN_OCCURRENCES`
  still empty; the route loading state announces in the reader's own locale;
  every bounded list says so; a known nickname resolves to the person it names.
  Plus
  `2N-PRIVACY-011`'s journey: **name visible, notes masked**, reveal local and
  keyboard/screen-reader reachable, notes **absent from search, retrieval,
  previews, the graph and telemetry**, counts not usable as an oracle, and no
  classification inferred as `normal` by absence.
- **Stop conditions.** Any need for a migration; alias reading
  turning out to need schema; and — `2N-PRIVACY-011` — **removing `people.notes`
  from retrieval or search turning out to need a migration, a column or a new
  authority**, which may not consume or reallocate M1, M2 or M3.
  *(Amended by ADR-112: the `daily-cycle` exemptions can no longer be
  load-bearing for anything — they were repaired and the list retired — so that
  stop condition is removed as unreachable rather than left as decoration.)*
- **One narrowing of ADR-093, recorded rather than discovered.** Removing
  `notes` from search's `people` domain changes behaviour ADR-093 signed. It is
  a **deliberate, owner-signed narrowing** (ADR-110), not an accidental
  reopening — the distinction `2N-PRIVACY-006` exists to force. ADR-093's
  default exclusion of `highly_sensitive` is untouched and no other domain
  changes. Verified: `phase-2i-search-guard.test.ts` does not pin `notes` into
  the people domain, so the narrowing breaks no existing guard.

### Between 2N.0 and 2N.1 — the timezone initiative — **DONE, and not this phase's**

**Not a Phase 2N slice.** Authorized by **ADR-111**, executed as the **Local Day
Correction** initiative, and **CONCLUDED on 2026-08-13 at `d581e43`** with
**zero migrations created and zero spent**. Recorded here because `OD-2N-13`
**B** made it a **mandatory dependency of 2N.1** — and a discharged dependency
that nobody wrote down is one a later reader re-opens.

- **Objective.** Repair the zone-less rendering that Phase 2N would otherwise
  inherit and extend. **Achieved.**
- **Population, as re-derived rather than as estimated.** The plan said **13
  zone-less formatters across 12 files** plus the four `daily-cycle` files —
  roughly 27 call sites. The mechanical census found **17 formatters across 16
  files**, plus **7** host-zone field reads, **4** UTC day slices and **3** zone
  round-trips: **31**, all repaired. *(Amended by ADR-112 under `2N-TIME-005`'s
  own "whichever is current" clause.)*
- **Why it was not folded into 2N.0.** It touched `daily-cycle`, `shell`,
  `search`, `chat` and `agent` — surfaces Phase 2N otherwise does not open. A
  foundation slice that acquires five unrelated surfaces stops being a
  foundation. That reasoning held: the census found nearly twice the estimate.
- **Schema impact.** **None, confirmed rather than expected.** Migrations stayed
  at 92 and parity at `202608120092`.
- **What it leaves behind for this phase.** A tree-wide guard —
  `local-day-correction-guard.test.ts`, corpus `src/`, four families, per-file
  budget **zero**, `OPEN_OCCURRENCES` **empty** — which already covers Phase 2N's
  directories. **2N.0 therefore builds no timezone guard**, and every 2N-TIME
  requirement except `-001` and `-003` closes **`baseline`**: this phase must not
  claim another initiative's delivery.
- **Gate.** **Satisfied.** 2N.1 is unblocked. 2N.3 was explicitly never gated on
  it.

### 2N.1 — Person page hardening

- **Objective.** Make every claim on the page traceable and every mutation
  authorized.
- **Requirements.** `2N-PERSON-001…007`, `2N-PROV-001…006`,
  `2N-RELATION-002`, `2N-RELATION-004…005`, `2N-RELATION-008`,
  `2N-MOBILE-001…003`, `2N-ACCESS-001…005`.
- **Dependencies.** 2N.0 **and the timezone initiative, completed and merged**.
- **Schema impact.** **None.** `OD-2N-8` **A** removed the provenance
  migration: relations are owner-authored by construction, and existing rows are
  presented as owner-authored **without inventing retroactive provenance**.
- **Tests.** Ownership indistinguishability including counts; origin rendered
  for every relation; position preserved across a source round-trip.
- **Acceptance.** Every rendered claim resolves to a record or is marked
  unsourced. No relation is shown as more than the owner asserted.
- **Stop conditions.** The timezone initiative not yet merged; any temptation to
  backfill provenance the product cannot know.

### 2N.2 — Project page hardening and its missing sections

- **Requirements.** `2N-PROJECT-001…007`, plus the mobile and accessibility
  families applied to this surface.
- **Dependencies.** 2N.0, the timezone initiative, and 2N.1 (shared panels).
- **Schema impact.** **None.** "Recent changes" derives from audit and
  interpretation history; decisions and risks ship only if representable, and
  otherwise close `not-built-by-rule`.
- **Stop conditions.** Any temptation to add a change-log or decision table.

### 2N.3 — What the Brain knows: inspection, correction and deletion

- **Objective.** The user can see every belief with its source and freshness,
  change it through a real authority path, **and remove what should not exist**.
- **Requirements.** `2N-KNOWS-001…009`, `2N-CORRECT-001…013`,
  `2N-IDENTITY-005…007` (closing `not-built-by-rule`).
- **Dependencies.** 2N.0 only. **Not gated on the timezone initiative** — this
  slice opens no contextual page.
- **Authority paths.** Existing for correction: `updateMemory`,
  `setMemoryLifecycle`, `correct_entry_interpretation` — `OD-2N-5` **A** forbids
  a second correction path or a supersession RPC. **One new** validated,
  owner-scoped deletion path, and exactly one.
- **Schema impact.** **M1 and M3**, both exclusive to this slice and to each
  other. **M1** makes retrieval respect validity before the bound
  (`2N-CORRECT-003`). **M3** carries transactional deletion and its propagation
  (`2N-CORRECT-004`). Neither may carry the other's responsibility, and neither
  may carry telemetry.
- **The slice is sequenced internally**, because the two migrations are
  independent and the second is the dangerous one: **M1 first** (retrieval,
  small, provable), then the **deletion re-audit** confirming consequences *per
  type*, then **M3**. A deletion built before retrieval eviction works would
  produce an object that is deleted and still retrievable.
- **Tests.** Two matter most. **Eviction**: a retired memory must not be
  *retrieved*, proved at the bound, not at the citation list. **Propagation**:
  the enumerated set is asserted by test, and a deletion that cannot complete
  changes nothing.
- **Journeys.** Delete a person with linked tasks, memories, files, relations
  and associations; confirm the preview enumerated exactly what happened; undo;
  confirm the whole prior state returns, relations included.
- **Security.** T-5, T-6, T-16, T-17, T-22.
- **Acceptance.** Archiving genuinely leaves retrieval. Deleting genuinely
  removes, transactionally, with an accurate preview and a real undo.
- **Stop conditions.** **A propagation that cannot be truthfully undone**
  (`2N-CORRECT-013`) — the slice stops and returns the case to the owner rather
  than shipping an undo that claims more than it restores. Also: any need for a
  fourth migration; any temptation to make deletion a client-side sequence.

### 2N.4 — Conflicts and "Precisa de você"

- **Objective.** Two incompatible beliefs are shown as two, not silently
  reduced to one.
- **Requirements.** `2N-CONFLICT-001…006`.
- **Dependencies.** 2N.3.
- **Schema impact.** **None.** `OD-2N-7` **A** signs read-time derivation from
  existing data — no conflict table, no persisted conflict lifecycle — and
  `2N-CONFLICT-001` requires the deterministically detectable set to be
  enumerated before anything is built.
- **Acceptance.** No implicit precedence anywhere; nothing enters the queue that
  cannot be acted on.
- **Stop conditions.** The deterministically detectable set turning out to be
  empty — in which case the family closes `not-built-by-rule` with the finding
  recorded, rather than inventing detection.

### 2N.5 — The file library: links, provenance, classification and discovery

- **Objective.** `OD-2N-9` **option B** — a library that is genuinely more
  useful, not a second storage system and not a copy of global search.
- **Requirements.** `2N-FILES-001…012`, `2N-PERSON-008`.
- **Dependencies.** 2N.0, 2N.1, 2N.2.
- **Schema impact.** **None**, and §6.5 proves it capability by capability.
  `entity_attachments` exists, is owner-scoped and is trigger-validated; every
  column the enlarged library needs — `status`, `processing_error`,
  `sensitivity`, `mime_type`, `created_at`, `extracted_text` — is already on
  `attachments`.
- **Stop conditions.** Any need for a second orphan concept; **any proven
  material need for schema**, which is an owner decision and never a
  reallocation from M1, M2 or M3 (`2N-FILES-012`).

### 2N.6 — Confirmed relations, then a secondary graph

- **Requirements.** `2N-RELATION-001…011`, `2N-ACCESS-004`.
- **Dependencies.** 2N.1, 2N.5.
- **Schema impact.** **None.** `OD-2N-8` **A** removed the provenance migration
  by removing persisted inference: every edge the graph can draw is one the
  owner authored.
- **Order within the slice.** Relations first, graph second, and the graph only
  after `2N-RELATION-002`, `008` and `009` make every edge explainable. The
  non-graph equivalent (`2N-RELATION-007`) is built **alongside** the graph, not
  after it — an alternative added last is an alternative that ends up degraded.
- **The refusal clause is part of the slice, not a caveat.** If the graph cannot
  satisfy `2N-RELATION-006…010` within the budget, the work **stops and proposes
  a reduction** (`2N-RELATION-011`). Shipping a decorative graph would fail the
  authorization that permitted it.

### 2N.7 — Telemetry, security, accessibility and closeout

- **Requirements.** `2N-METRICS-001…007`, `2N-SEC-001…006`,
  `2N-ACCESS-006`, `2N-MOBILE-004`, `2N-TIME-005…006`, `2N-CLOSE-001…006`.
- **Dependencies.** every prior slice.
- **Schema impact.** **M2**, exclusive to telemetry, landing **before any
  producer** — and **only if real producers and consumers are specified and
  delivered** (`OD-2N-15` A). If they are not, **M2 closes unspent** and the
  dependent requirements close `not-built-by-rule`. An unspent allocation is not
  a defect; a migration created to use one up fails the close.
- **Hardware.** None (`OD-2N-16` A). The phase does **not** inherit the push
  checkpoint, and the absence of a real screen-reader run does not block
  closeout — it is a residual with a destination.
- **Acceptance.** Generated matrix; every partial with a remainder and a
  destination; push and Android restated exactly as inherited; ADR-055
  restated; successor re-audited and not started.

## 4. Identity and merge, and why they have no slice

**The owner declined merge** (`OD-2N-3` **A**), so the conditional slice this
plan previously reserved — 2N.3b, with its own branch and its own migration —
**does not exist**. `2N-IDENTITY-005`, `006` and `007` close
`not-built-by-rule` against that signature, **never as `partial`**, because
nothing of merge is built.

What remains of identity is small and lives in **2N.0**: identity stays
name-uniqueness (`OD-2N-1`/`OD-2N-2` **A**), and `entity_aliases` gains its
**first reader** so a nickname resolves. That table has existed with policies
and grants and **zero readers and zero writers** since `202607160009`; switching
it on costs no schema.

**Duplicate surfacing went with merge, and that is deliberate.** Under
`OD-2N-3` A there is no way to resolve a duplicate, so surfacing one would put
an item in front of the user with **no available action** — which
`2N-CONFLICT-005` refuses by rule. The two decisions are consistent only if both
are declined together, and they were.

`2N-IDENTITY-007` still records the **reversibility contract** a future merge
must satisfy — reversible, complete preview, explicit confirmation, registered
undo, populated-fixture proof — so a later phase inherits it rather than
re-deciding it under pressure.

## 5. What is deliberately left out

The four `daily-cycle` timezone exemptions. Push, in every form. Android.
Recurrence. Signup and the rollout. `2E-COMMAND-012`. Any external service. Any
provider call to explain provenance. A primary-navigation graph. Persisted
inference without confirmation. A `sensitivity` column on `people` or
`projects`.

## 6. Migration budget — SIGNED

**`3 allocated · obligation ZERO · 2 spent · M1 AND M3 CREATED`, all three
non-transferable** (`OD-2N-14` **option B**). A fourth is a **stop condition**,
not a decision the implementer makes.

**M1 was spent by slice 2N.3 on 2026-08-13** as
`202608130093_phase_2n_slice_3_validity_aware_retrieval.sql`: it re-declares
`match_internal_knowledge` so the memory validity window is applied inside the
union, ahead of the bound (`2N-CORRECT-003`). It creates no table, no column, no
policy, no grant change and no schedule.

**M3 was spent by slice 2N.3 on 2026-08-14** as
`202608140094_phase_2n_slice_3_entity_deletion.sql`, after the intermediate
deletion re-audit proved a true undo by executing it: transactional deletion of
a person, a project and a memory, with a preview that counts rather than
estimates, a server-issued single-use confirmation, explicit removal of the four
polymorphic link tables **no cascade reaches**, snapshots that restore the same
ids, three registered undo handlers, and an audit row that carries counts and
no content. Per **ADR-113** it creates **one table** — see the amendment in
§6.3. **M2 remains allocated to slice 2N.7, unspent.**

| | Destination | Slice | Carries |
| --- | --- | --- | --- |
| **M1** | validity-aware retrieval | 2N.3 | `match_internal_knowledge` respects validity **before** the bound |
| **M2** | telemetry vocabulary | 2N.7 | the three enforcement points, in one change, before any producer |
| **M3** | transactional deletion | 2N.3 | one deletion path with enumerated propagation |

**No migration for adjustments. None is transferable. None may carry another's
responsibility. Obligation zero means an allocation may close *unspent*** if the
slice's re-audit proves it unnecessary — an unspent allocation is not a defect,
and a migration created to use one up fails the close. **None is created during
planning.**

The plan recommended two and the owner signed three, funding deletion. That
change is recorded rather than smoothed: deletion was ranked in the gaps report
as the largest single improvement in user control available in this phase, and
the recommendation against it was a budget judgement, not a product one.

### 6.1 M1 — validity-aware retrieval · slice 2N.3

- **Necessity — proved, not argued.** `match_internal_knowledge` unions entries
  and memories, orders by similarity and applies
  `limit least(coalesce(p_match_count, 8), 20)` **before** anything reads
  `valid_until`. `isMemoryInForce` runs afterwards, in TypeScript, in
  `chat/actions.ts` and `resolve-sources.ts`.
- **Alternative without migration.** Filter in TypeScript — which is exactly
  what happens today.
- **Why refused.** The bound is applied in SQL. By the time TypeScript sees the
  rows, the archived memory has already displaced a live one, and **no
  downstream code can recover a row that was never returned**. The alternative
  cannot satisfy `2N-CORRECT-003` in principle, not merely in practice.
- **Affects.** One function. No table, no column, no policy, no grant.
- **RLS/grants.** Unchanged — `security invoker`, `authenticated` only.
- **Rollback.** Re-declare the prior definition. No data is transformed.
- **Hosted proof.** Owner-scoped, with a **non-vacuous negative control**: an
  archived memory that *would* rank inside the top 20 and must not appear.
- **If it closes unspent.** `2N-CORRECT-003` closes `not-built-by-rule` and the
  audit's finding stands as a recorded, unrepaired defect.

### 6.2 M2 — telemetry vocabulary · slice 2N.7

- **Necessity.** `OD-2N-15` **A** signs a small content-free event set. The
  event-name CHECK, `private.validate_product_event_properties` and the surface
  CHECK must move **in one change**, **before any producer** — the product-events
  vocabulary has **three copies** and a phase that moves one of them silently
  ships a producer the ledger refuses.
- **Conditional.** It is spent **only if real producers and consumers are
  specified and delivered** (`2N-METRICS-002…003`). A producer with no reader is
  invisible, and this repository has already paid for that.
- **Alternative.** Declare no events. Real, and it costs the phase its ability
  to answer whether anyone inspects, corrects or removes what the Brain knows.
- **Affects.** Three enforcement points, one constraint each. No new table.
- **Rollback.** Re-declare the prior CHECKs; by construction no producer exists
  yet.
- **Hosted proof.** Owner-scoped with **zero residue** (`2N-METRICS-007`) —
  proved owner-scoped rather than by a global count, because `product_events` is
  unreadable to `service_role`.
- **If it closes unspent.** `2N-METRICS-001…003` close `not-built-by-rule`
  against the budget.

### 6.3 M3 — transactional deletion · slice 2N.3

- **Necessity.** `OD-2N-11` **B** signs deletion of a person, a project and a
  memory. Safe deletion spans `entry_entities`, `person_projects`,
  `person_contexts`, `person_relationships`, `entity_attachments`,
  `entity_tags`, `entity_aliases`, `task_people` and `memories.person_id`, and
  must be one transaction with an audit row and a registered compensation. That
  is a `SECURITY DEFINER` RPC with a safe `search_path`, a validated caller and
  least-privilege grants.
- **Alternative without migration.** A client-side sequence of deletes —
  **refused by `2N-CORRECT-009`**: it is not a transaction, not auditable as one
  act, and produces exactly the partial deletion T-6 describes. The direct
  `delete` grant that would make it possible already exists on every domain
  table, which is what makes writing the rule down necessary rather than
  academic.
- **Second alternative.** Do not build deletion. Declined by the owner.
- **Affects.** One new function. **No new table**, so `2N-SEC-005`'s cascade
  requirement is not engaged.
  *(Amended by ADR-113 on 2026-08-13: **this prediction is wrong and the
  sentence above is preserved as written**. A confirmation that is
  server-issued, single-use and fingerprint-bound **is a row**, and the only
  existing store — `task_command_confirmations` — is FK-bound to `tasks` and
  carries a **closed** `CHECK (action in ('cancel_task','create_task'))` that
  `taxonomy.ts` and `copy.ts` assert against, so reusing it would widen a Phase
  2E vocabulary its own tests defend. The owner authorized M3 to create **one**
  table, `public.entity_deletion_confirmations`, **inside M3's own file**. It is
  **not** an additional migration, the budget is unchanged at `3 allocated · 1
  spent`, and **a fourth remains a STOP CONDITION**. `2N-SEC-005` **is** engaged
  and is satisfied by `user_id … references auth.users(id) on delete cascade`.
  §6.5's proof that no fourth migration is hidden still holds. Established by
  `docs/reports/phase-2n/PHASE_2N_SLICE_3_DELETION_REAUDIT.md` §9.)*
- **Rollback.** Drop the function; nothing else changes. **Rows already deleted
  by it are not restored by a rollback** — which is precisely why
  `2N-CORRECT-005` requires a registered undo and `2N-CORRECT-013` makes an
  un-undoable propagation a stop condition.
- **Hosted proof.** Owner-scoped, on owner-created fixtures, with a
  non-vacuous negative control: a second account's object that the path must
  refuse. Zero residue.
- **If it closes unspent.** `2N-CORRECT-004…005` and `009…013` close
  `not-built-by-rule` and deletion stays absent, as it is today.

### 6.4 The fourth migration that was proposed and is now out

The earlier draft carried **M5 — merge and canonical identity**, unproposed and
outside the ceiling. `OD-2N-3` **A** removed it entirely. It is named here so
its absence is a decision on the record rather than an omission.

### 6.5 Proof that the signed decisions need no further migration

`OD-2N-14` requires that no fourth need be hidden. Each capability the
signatures created is traced to schema that already exists.

**Aliases (`OD-2N-1`/`OD-2N-2` A) — no migration.** `entity_aliases` exists
since `202607160009` with `alias`, `normalized_alias`, `entity_type`,
`entity_id`, `valid_from`, `valid_to`, its **own explicit** `select/insert/
update/delete` policies and an explicit
`grant … to authenticated`. It has **zero readers and zero writers**; the work
is to consume it. Reading it in entity resolution and adding it to search's
`DOMAIN_SPECS` are code changes.

**Sensitivity on contextual surfaces (`OD-2N-12` A) — no migration.**
`GOVERNED_SURFACES` is a TypeScript constant; the rules are data in
`src/features/sensitivity/contracts.ts`. Classification is **derived** from
source rows that already carry `sensitivity` — `entries`, `memories`,
`attachments` — via the derivation `task-derivation.ts` already performs for
`work` and `calendar`. `OD-2N-12` forbids new persistence, and
`2N-PRIVACY-003` forbids a classification column on `people` or `projects`, so
nothing is added.

**Derived conflicts (`OD-2N-7` A) — no migration.** Detection reads columns that
exist: `memories.content`, `kind`, `person_id`, `project_id`, `valid_from`,
`valid_until`, `source_entry_id`, `confidence`. No conflict table and no
persisted lifecycle are authorized, so there is nothing to create.
`2N-CONFLICT-001` requires the detectable set to be enumerated first, which is
also the check that would expose a hidden schema need **before** any code.

**Library option B (`OD-2N-9` B) — no migration**, capability by capability:

| Capability | Existing schema that serves it |
| --- | --- |
| files linked to people and projects | `entity_attachments` (`entity_type`, `entity_id`, `attachment_id`, owner-scoped, trigger-validated) |
| people and projects reached from a file | the same table, read in the other direction |
| provenance | `attachment_interpretations` (`model`, `version`, `raw_output`, `extracted_*`) |
| processing state | `attachments.status`, `attachments.processing_error` |
| failure recovery | the `jobs` table and the retry path `/app/files` already ships |
| classification | `attachments.sensitivity`, already populated and today not even selected by the files page |
| filters | `mime_type`, `status`, `created_at`, `size_bytes`, plus the link table |
| richer discovery | the above, plus links to existing search |

**Graph option B (`OD-2N-10` B) — no migration**, and `OD-2N-8` **A** is what
makes that true: because no inferred relation may be persisted, the graph draws
only `person_relationships`, `person_projects`, `person_contexts` and
`entity_*` links that the owner authored. Provenance columns would have been
needed **only** to distinguish inferred edges from authored ones, and under
`OD-2N-8` A there are no inferred edges to distinguish. Rendering is client
code; `2N-RELATION-011` stops the slice rather than funding it if the contract
cannot be met.

**Deletion (`OD-2N-11` B) — M3, and M3 only.** It creates one function and no
table, so it engages no cascade, no new policy and no new grant.

**Telemetry (`OD-2N-15` A) — M2, and M2 only.**

**Retrieval (`OD-2N-6` A) — M1, and M1 only.**

**No fourth need is hidden.** The two capabilities that could plausibly have
demanded one — relation provenance and a persisted conflict lifecycle — were
**declined by `OD-2N-8` A and `OD-2N-7` A**, and the two that could have grown
into one — the enlarged library and the graph — are traced above to schema that
already exists. Where that tracing could still be wrong, the plan does not
absorb the risk: `2N-FILES-012` and `2N-RELATION-011` both make a proven need a
**stop condition and an owner decision**, never a reallocation.

## 7. The seventeen decisions, as signed

**All signed by ADR-109 on 2026-08-12.** The **declined options are preserved
below**, with the reasoning that was put to the owner, because a decision whose
alternatives have been deleted is a decision nobody can review — and because the
next phase to reopen one of these should be able to see what was already
weighed.

Notation: **signed** is what the owner chose; *declined* options are kept
verbatim in substance; **refused** means the package argued it should not be
available at all.

### OD-2N-1 — canonical identity for a person → **A**

**Signed A.** Name-uniqueness stays the identity model; `entity_aliases` gains
its first reader so a nickname resolves. No canonical pointer, no merge, **no
migration**.
*Declined B:* add a canonical-identity pointer — larger, drags in merge, at
least one migration, the largest risk in the phase.
*Declined C:* neither — leaves `entity_aliases` a table nobody uses, which is
its own debt.
**Impact:** duplicates still accumulate, and the owner accepted that for this
phase.

### OD-2N-2 — canonical identity for a project → **A**

**Signed A.** Projects mirror people; one identity model, not two. Aliases may
be consumed for projects where it makes sense. No migration.
*Declined B:* projects keep name-uniqueness regardless of what people do —
defensible, but it is the divergence this phase exists to remove.

### OD-2N-3 — merge authority → **A**

**Signed A.** No merge in Phase 2N: no automatic suggestion, no merge RPC, no
silent relinking. The requirements close **`not-built-by-rule`**, never
`partial`.
*Declined B:* owner-confirmed merge through one validated RPC with a full
preview — one migration outside the recommended budget, and T-1.
*Refused C:* system-suggested merge applied in one action — it makes an
irreversible operation a single click on an inference.
**Impact:** the mistaken duplicate person stays. `OD-2N-11` B is what makes that
survivable: it cannot be merged, but it can now be deleted.

### OD-2N-4 — merge reversibility → **A, conditional**

**Signed A for a future phase.** If merge is ever authorized it must be
reversible, with a complete preview, explicit confirmation, a registered undo
and a proof against a **populated** fixture.
*Declined B:* irreversible with explicit confirmation — acceptable only with a
complete preview, and a mistake would be permanent.
*Refused C:* leaving it unstated — the product must say which before the user
confirms.
**Nothing of merge is implemented in Phase 2N.**

### OD-2N-5 — memory-correction authority → **A**

**Signed A.** Reuse `updateMemory`, `setMemoryLifecycle` and the existing
paths. **No second correction path, no supersession RPC.** No migration.
*Declined B:* a new correction RPC recording supersession — stronger provenance,
more schema.

### OD-2N-6 — suppress vs archive vs remove → **A**

**Signed A.** `active` and `archived` only, **no `suppressed` column** — and
archiving must *genuinely* leave retrieval rather than hide the row at
presentation, which is what makes this signature cost **M1**. Archive is not a
hard delete and is never described as one; **correcting stays distinct from
archiving**.
*Declined B:* a third state separating "never true" from "stopped being true" —
the more honest vocabulary, at the cost of M1 **plus** a column.
*Declined C:* hard removal folded in here — it belongs to `OD-2N-11`, which
signed it separately and properly.

### OD-2N-7 — conflict representation → **A**

**Signed A.** Derived at read time from existing columns; both claims, both
sources, both validity windows; no persisted conflict state. **No migration.**
*Declined B:* persisted conflict records with their own lifecycle — a queue that
fills faster than it drains.
*Declined C:* no conflict surface at all.

### OD-2N-8 — may an inferred relation be persisted? → **A**

**Signed A.** Only owner-authored relations persist. Extraction may produce a
**proposal**; a proposal is not a relation. Existing rows are presented as
owner-authored **without inventing retroactive provenance**. **No
relation-provenance migration.**
*Declined B:* persist inferred relations with provenance columns — richer
automatic context, one migration, and every existing row unsourced forever.
*Refused C:* keep persisting them without provenance — that is T-3, the live
defect.
**This signature is load-bearing for the graph**: it is why `OD-2N-10` B costs
no migration.

### OD-2N-9 — file-library scope → **B**

**Signed B.** Links both ways, provenance, processing states, failure recovery,
classification, filters, richer discovery, sensitivity throughout — **with no
migration** (§6.5). Not a second storage system, not a duplicate of global
search. A proven material need is a **stop condition**, not a reallocation.
*Declined A:* links and provenance only — the package's recommendation.
*Declined C:* nothing beyond today.

### OD-2N-10 — the graph's role → **B**

**Signed B, under a contract that can refuse it.** Secondary, never primary
navigation; only authorized persisted relations; every edge explainable, with
origin *"informed by you"* where that is the only truth; no numeric confidence
as certainty; **no meaning from position, distance, cluster or centrality**; a
complete, keyboard- and screen-reader-accessible text/list alternative that is
**not** degraded; no additional migration. If the contract cannot be met within
the budget, **stop and propose a reduction** — a decorative or misleading graph
is refused.
*Declined A:* no graph this phase, a list explorer instead — the package's
recommendation, on the grounds that relations could not explain themselves.
`OD-2N-8` A answers that objection directly: every edge is now owner-authored.
*Refused C:* graph as primary navigation — the roadmap's own boundary.

### OD-2N-11 — deletion → **B**

**Signed B.** Transactional deletion of a person, a project and a memory: one
validated owner-scoped authority path; a preview enumerating consequences;
explicit confirmation; enumerated propagation; removal from retrieval; defined
treatment of relations, associations, linked files, tasks and memories; audit;
registered undo or compensation. **No client-side multi-delete, no partial
deletion, no soft delete presented as removal.** Migration **M3**. The audit
confirms consequences **per type** before implementation, and **a propagation
that cannot be truthfully undone is a stop condition**.
*Declined A:* no deletion this phase — the package's conditional
recommendation, purely to hold the budget at two.
*Refused C:* soft delete only — it adds a state to every read path in the
product while still not removing anything.

### OD-2N-12 — sensitivity on contextual pages → **A**

**Signed A.** Person, project, memory, file, and relation/graph wherever it
renders derived information, all join `GOVERNED_SURFACES`. Classification
derived from the source; **never inferred as `normal` by absence**; an
unreadable, foreign or missing source resolves to the most protective case;
masked **in position** with an explicit local reveal; **counts stay true**;
sensitive rows are not dropped to simplify a list. No new persistence, **no
migration**. **Blocks any contextual page still rendering raw content outside
`GOVERNED_SURFACES`.**
*Refused B:* exclude rather than mask — a dropped row makes the count a lie.
*Refused C:* leave the pages ungoverned.
**One interpretation was required** and is flagged at `2N-PRIVACY-007` rather
than absorbed: the fail-closed rule governs *source-derived content*, not an
entity's own owner-typed name and notes, since a literal reading would mask a
person's name on their own page.

### OD-2N-13 — the timezone defects → **B**

**Signed B.** A separate initiative, before slice 2N.1, under its own
authorization. Phase 2N enumerates the defects, preserves the evidence of **13
call sites across 12 files**, prevents its own code from adding a zone-less
formatter, and has **2N.0 guard only its own surfaces**. The initiative is a
**mandatory dependency of 2N.1**; its ~27 call sites are **not absorbed** into
2N.0; **no timezone repair happens in the planning PR**.
*Declined A:* fix it as a foundation of 2N.0 — a foundation slice that acquires
five unrelated surfaces stops being a foundation.
*Declined C:* keep it residual — acceptable only with the guard extension, and
weaker than B.

### OD-2N-14 — final migration budget → **B**

**Signed B: `3 allocated · obligation ZERO · non-transferable`** — M1
retrieval (2N.3), M2 telemetry (2N.7), M3 deletion (2N.3). No migration for
adjustments; none transferable; none carrying another's responsibility; **a
fourth is a stop condition**; an allocation may close **unspent**; none created
during planning.
*Declined A:* two — the package's recommendation.
*Declined C:* zero, making the phase hardening-only and leaving the retrieval
defect standing.

### OD-2N-15 — telemetry → **A**

**Signed A.** A small content-free set. Before M2 exists, each event carries a
product question, a producer, a consumer, a surface, closed properties, a
justification, a forbidden-content test, a planned hosted proof, and a cleanup
and zero-residue proof. **Never recorded:** a name, a title, memory content, a
filename, a relation, a person, a project, conflict text, a raw error, or any
identifier that functions as content.
*Declined B:* no events — the family would close `not-built-by-rule`.

### OD-2N-16 — hardware → **A**

**Signed A.** No Phase 2N requirement depends on real hardware. Mobile is proved
in viewports and browsers. The phase does **not** inherit the push checkpoint;
Android stays **NOT EXECUTED** in its own initiative; push stays a **parallel
residual**. **No real VoiceOver or TalkBack run may be declared as executed**,
and the absence of hardware **does not block closeout**.
*Declined B:* require screen-reader validation for close — honest and stronger,
and it would make closeout depend on an owner-run session that has never
happened in this product.

### OD-2N-17 — ADR-055 → **A**

**Signed A.** Phase 2N does not satisfy it, does not supersede it, does not
widen semantic retrieval, and does not feed its funnel as though that were
progress. **The expiry of 2026-10-27 stands** and must be re-evaluated at the
correct gate if reached.
*Refused B:* treating any 2N work as progress toward it.

## 8. Estimates, revised for the signatures

Re-estimated against the audited product **and** the seventeen signatures. The
previous estimate assumed no deletion, no graph and the smaller library; two of
those changed.

| Slice | Range | Driver |
| --- | --- | --- |
| 2N.0 | 1.5–2.5 wk | four routes, one contract, one guard corpus, plus alias reading |
| *timezone initiative* | *1–2 wk* | **not Phase 2N work**; separately authorized; gates 2N.1 |
| 2N.1 | 1.5–2.5 wk | provenance rendering, bounds, journeys ×2 ×2 |
| 2N.2 | 1–2 wk | reuses 2N.1's panels |
| 2N.3 | **4–6 wk** | **two migrations** (M1, M3), a deletion re-audit between them, propagation enumeration, undo with populated-fixture proofs, two deployments with parity readings and hosted proofs |
| 2N.4 | 2–3 wk | the only greenfield slice; derivation, not persistence |
| 2N.5 | **2–3 wk** | option B: links both ways, classification, filters, discovery — up from 1–1.5 wk |
| 2N.6 | **2.5–4 wk** | option B: graph **plus** a complete non-degraded alternative, built alongside |
| 2N.7 | 2–3 wk | M2, hosted proof with zero-residue, matrix, closeout |

- **Phase 2N total: 17–26 weeks**, excluding the timezone initiative.
- **Including the timezone initiative: 18–28 weeks.**
- **Previous estimate was 12–17 weeks** on the recommended decisions. The
  increase is **entirely attributable to three signatures**: deletion (+2.5–3 wk
  and a second migration in one slice), the enlarged library (+1–1.5 wk) and the
  graph with its full alternative (+1.5–1 wk).
- **The roadmap said 13–18 weeks.** The signed phase is **larger than the
  roadmap's estimate**, and that is stated rather than smoothed: the roadmap did
  not contain 2N.0, did not contain deletion, and described the graph without
  the alternative that makes it acceptable.

### Critical path

```
ADR-109 (done) → 2N.0 → 2N.3 (M1 → deletion re-audit → M3) → 2N.4 → 2N.6 → 2N.7 (M2)
```

**2N.3 is now the critical path**, not the contextual pages. It carries two of
the three migrations, the phase's only irreversible operation, and a stop
condition that can halt the phase outright (`2N-CORRECT-013`).

**The timezone initiative is on a parallel path** that rejoins at 2N.1. Because
2N.3 does not depend on it, an authorization delay there costs 2N.1 and 2N.2 but
does not idle the phase.

### Parallelisable

2N.1 and 2N.2 alongside 2N.3, once the timezone initiative merges. The M2 event
specification alongside any slice, since it must precede its producers. The
non-graph alternative alongside the graph, never after it.

### Dependencies

- **Owner:** one — authorization to implement. The seventeen decisions are
  signed. A second owner decision is required if any stop condition fires,
  notably `2N-CORRECT-013`, `2N-FILES-012` or `2N-RELATION-011`.
- **Separate authorization:** the timezone initiative, before 2N.1.
- **Hardware:** none (`OD-2N-16` A).
- **External:** none.

**An estimate is not a promise.** It is what this plan is willing to be judged
against, not a date — and the honest version of this one is that a phase with
two migrations in a single slice and one irreversible operation has a wider
range than a hardening phase, which is why the range widened rather than the
midpoint moving.

## 9. The execution loop — for a future authorization, not for now

**Do not run this.** It is recorded so that the authorization to execute does
not also have to invent a process.

1. Re-audit the next slice against the *current* product.
2. Its own branch.
3. Implement, test-first.
4. Full local gates.
5. Draft PR.
6. CI green on the PR head.
7. Review the whole diff.
8. Merge.
9. CI green on the exact merge SHA.
10. Re-audit the next slice.
11. **Stop** at any owner decision, at any migration beyond the signed budget,
    at any need for real hardware, or at any stop condition named in a slice.

Deployment happens **only** for a slice whose merged content includes a
migration, and each is followed by a live read-only parity reading and a hosted
proof with non-vacuous negative controls and zero residue, proved owner-scoped
rather than by a global count.

## 10. Stop conditions for the phase as a whole

A fifth migration. Schema outside a named destination. Changing a signed
decision. RLS, a grant or a policy beyond the approved model. Any external
service. Any spend. Opening signup. Any risk of data loss. A concurrent branch
or PR. Any dependency on push or on a device. The successor needing to start.

**Not stop conditions:** difficulty, an in-scope defect, a red PR of one's own
making, slow CI, a failed first approach, a wrong count, a bad fixture or a
broken probe. Those are investigated, fixed and continued.
