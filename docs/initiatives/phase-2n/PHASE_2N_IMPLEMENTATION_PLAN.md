# Phase 2N — implementation plan

**Authorized for PLANNING ONLY by ADR-108 (2026-08-12).** This plan describes
work that **has not been authorized to execute**. Nothing here may be started.
No migration exists, none may be created, and the execution loop in §9 must not
be run.

Companion PRD: `PHASE_2N_PRD.md` — **108 requirements across 16 families**.
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
| 2N.3 "What the Brain knows" | **2N.3 inspection and correction** | Memories and a real 3-state lifecycle ship; authority is the new part |
| 2N.4 memory conflicts | **2N.4 conflicts** — unchanged | The only genuinely empty slice |
| 2N.5 file Library | **2N.5 file links and provenance** | Library and failure recovery ship; the link table has no surface |
| 2N.6 graph | **2N.6 relations first, graph conditional** | An unsourced edge drawn as a diagram is the weakest claim in the strongest presentation |
| 2N.7 closeout | **2N.7 closeout** — unchanged | — |
| — | **2N.IDENT, folded into 2N.0/2N.3** | Identity and merge are decision-gated and may not run at all |

The slice count stays at eight. Two are re-aimed, three are re-scoped from
construction to hardening, and identity work is distributed rather than given a
slice of its own, because **most of it may never be authorized**.

## 2. The ordering constraint that drives everything

**A contextual page may not gain a new section before it is governed.** Adding
"related files" or "recent memories" to a page that renders raw sensitive
content in the host's timezone multiplies an existing defect across new
surfaces. So:

```
2N.0 (privacy + time + bounds contracts)
   └─> 2N.1 person ──┐
   └─> 2N.2 project ─┼─> 2N.5 files ─┐
   └─> 2N.3 knows ───┴─> 2N.4 conflicts ─┴─> 2N.6 relations/graph ─> 2N.7 close
```

2N.0 is a **precondition**, not a warm-up.

## 3. Slices

Each slice: its own branch, its own PR, CI green on the PR head **and** on the
exact merge SHA (ADR-090, green ×1), and the next slice re-audited against the
updated product before it starts.

### 2N.0 — Foundations: privacy, time and bounds contracts

- **Objective.** Make the contextual surfaces governable before anything is
  added to them.
- **Experience delivered.** Sensitive content stops being printed in full on the
  person, project, memory and file pages. Dates stop being wrong for anyone not
  living in UTC. Truncated lists start saying they are truncated.
- **Requirements.** `2N-PRIVACY-001…006`, `2N-TIME-001…004`,
  `2N-PERSON-003`, `2N-PROJECT-006`, `2N-KNOWS-007…008`, `2N-SEC-002`,
  `2N-SEC-003`.
- **Dependencies.** `OD-2N-12`, `OD-2N-13`.
- **Files.** `src/features/sensitivity/contracts.ts` (surface list),
  a derivation for entry/memory/file subjects, the four contextual routes, a
  shared bounds vocabulary, `src/lib/closeout/phase-2m-fixed-offset-guard.test.ts`
  (corpus extension).
- **Authority paths.** None new. Read-only.
- **Schema impact.** **None.** No migration.
- **Tests.** Contract unit tests per surface; the convergence guard extended;
  the fixed-offset guard's corpus extended with its self-cleaning half intact;
  a negative control proving a masked surface is actually masked.
- **Journeys.** Desktop + mobile, both locales: a `highly_sensitive` entry
  masked on the person page and revealable locally.
- **Accessibility.** Mask and reveal announced, not merely styled.
- **Security.** T-8, T-12, T-14, T-15.
- **Telemetry.** None.
- **Acceptance.** No contextual surface renders classified content unmasked; no
  zone-less formatter can be added to the phase's directories; every bounded
  list says so.
- **Stop conditions.** Any need for a migration; any change to ADR-093's search
  behaviour; the four `daily-cycle` exemptions turning out to be load-bearing
  for a 2N surface.

### 2N.1 — Person page hardening

- **Objective.** Make every claim on the page traceable and every mutation
  authorized.
- **Requirements.** `2N-PERSON-001…007`, `2N-PROV-001…006`,
  `2N-RELATION-002`, `2N-RELATION-004…005`, `2N-MOBILE-001…003`,
  `2N-ACCESS-001…005`.
- **Dependencies.** 2N.0. `OD-2N-8` for how origin is rendered.
- **Schema impact.** **None** if `OD-2N-8` signs the refusal option; see §6
  candidate M3 if it signs persistence.
- **Tests.** Ownership indistinguishability including counts; origin rendered
  for every relation; position preserved across a source round-trip.
- **Acceptance.** Every rendered claim resolves to a record or is marked
  unsourced.
- **Stop conditions.** A relation proving unsourceable **and** `OD-2N-8`
  unsigned.

### 2N.2 — Project page hardening and its missing sections

- **Requirements.** `2N-PROJECT-001…007`, plus the mobile and accessibility
  families applied to this surface.
- **Dependencies.** 2N.0, 2N.1 (shared panels). `OD-2N-2`.
- **Schema impact.** **None.** "Recent changes" derives from audit and
  interpretation history; decisions and risks ship only if representable, and
  otherwise close `not-built-by-rule`.
- **Stop conditions.** Any temptation to add a change-log or decision table.

### 2N.3 — What the Brain knows: inspection and correction

- **Objective.** The user can see every belief with its source and freshness,
  and change it through a real authority path.
- **Requirements.** `2N-KNOWS-001…009`, `2N-CORRECT-001…003`,
  `2N-CORRECT-006…008`, `2N-IDENTITY-001`, `2N-IDENTITY-008`.
- **Dependencies.** 2N.0. `OD-2N-5`, `OD-2N-6`.
- **Authority paths.** Existing: `updateMemory`, `setMemoryLifecycle`,
  `correct_entry_interpretation`. New only if `OD-2N-6` creates a state the
  validity window cannot express.
- **Schema impact.** **Candidate M1** — see §6. `2N-CORRECT-003` cannot be
  satisfied without it.
- **Tests.** The eviction test is the important one: a retired memory must not
  be *retrieved*, proved at the bound, not at the citation list.
- **Stop conditions.** `OD-2N-6` signing a state that needs a column, without
  `OD-2N-14` funding one.

### 2N.4 — Conflicts and "Precisa de você"

- **Objective.** Two incompatible beliefs are shown as two, not silently
  reduced to one.
- **Requirements.** `2N-CONFLICT-001…006`.
- **Dependencies.** 2N.3. `OD-2N-7`.
- **Schema impact.** **Candidate M4** if conflict state must persist; none if a
  conflict is derived at read time from existing columns. **The plan
  recommends deriving**, and `2N-CONFLICT-001` requires the detectable set to be
  enumerated before anything is built.
- **Acceptance.** No implicit precedence anywhere; nothing enters the queue that
  cannot be acted on.
- **Stop conditions.** The deterministically detectable set turning out to be
  empty — in which case the family closes `not-built-by-rule` with the finding
  recorded, rather than inventing detection.

### 2N.5 — File links and provenance

- **Requirements.** `2N-FILES-001…008`, `2N-PERSON-008`.
- **Dependencies.** 2N.0, 2N.1, 2N.2. `OD-2N-9`.
- **Schema impact.** **None.** `entity_attachments` exists, is owner-scoped and
  trigger-validated; this slice gives it a surface.
- **Stop conditions.** Any need for a second orphan concept.

### 2N.6 — Relations, and a conditional graph

- **Requirements.** `2N-RELATION-001…008`, `2N-ACCESS-004`.
- **Dependencies.** 2N.1, 2N.5. `OD-2N-8`, `OD-2N-10`.
- **Schema impact.** **Candidate M3**, only under `OD-2N-8` option B.
- **Rule.** The graph is built **only** after relations can explain themselves.
  If `OD-2N-10` declines it, the family closes `not-built-by-rule` with a named
  destination and never as a partial.

### 2N.7 — Telemetry, security, accessibility and closeout

- **Requirements.** `2N-METRICS-001…006`, `2N-SEC-001…006`,
  `2N-ACCESS-006`, `2N-MOBILE-004`, `2N-TIME-005`, `2N-CLOSE-001…006`.
- **Dependencies.** every prior slice. `OD-2N-15`, `OD-2N-16`, `OD-2N-17`.
- **Schema impact.** **Candidate M2**, only if `OD-2N-15` declares events, and
  it must land **before any producer**.
- **Acceptance.** Generated matrix; every partial with a remainder and a
  destination; push and Android restated exactly as inherited; ADR-055
  restated; successor re-audited and not started.

## 4. Identity and merge, and why they have no slice

Identity work is **entirely decision-gated**. `OD-2N-1`, `OD-2N-3` and
`OD-2N-4` may all be declined, in which case `2N-IDENTITY-002…007` close
`not-built-by-rule` and the phase loses no coherence. Giving merge its own slice
would create a plan whose shape presupposes an answer.

If the decisions are signed, identity work attaches as follows: aliases and
duplicate surfacing to **2N.0/2N.3** (read paths, no destructive operation);
merge to a **conditional slice 2N.3b** with its own branch, its own migration
from the budget, and its own hardware-free acceptance. Merge is the most
dangerous operation this phase could contain (T-1), and it is the one most
easily deferred.

## 5. What is deliberately left out

The four `daily-cycle` timezone exemptions. Push, in every form. Android.
Recurrence. Signup and the rollout. `2E-COMMAND-012`. Any external service. Any
provider call to explain provenance. A primary-navigation graph. Persisted
inference without confirmation. A `sensitivity` column on `people` or
`projects`.

## 6. Migration budget — proposal

**Ceiling FOUR · obligation ZERO · 0 spent · none created.** ADR-108 fixes the
ceiling; the owner fixes the final number at `OD-2N-14`.

**The honest finding first: there are five plausible destinations and the
ceiling is four.** Signing every decision that implies schema would exceed the
budget, which is a stop condition. The owner must decline at least one, and this
plan says which it recommends declining.

### M1 — validity-aware retrieval · **recommended, rank 1**

- **Destination.** Slice 2N.3, exclusively. `match_internal_knowledge`.
- **Necessity.** Proved. The function unions entries and memories, orders by
  similarity and applies `limit least(coalesce(p_match_count, 8), 20)` **before**
  anything reads `valid_until`. `isMemoryInForce` runs afterwards in TypeScript.
- **Alternative without migration.** Filter in TypeScript — which is what
  happens today.
- **Why refused.** The bound is applied in SQL. A retired memory has already
  displaced a live one by the time TypeScript sees it, and no downstream code
  can recover the memory that was never returned. The alternative cannot
  satisfy `2N-CORRECT-003` in principle, not merely in practice.
- **Affects.** One function. No table, no column.
- **RLS/grants.** Unchanged — `security invoker`, `authenticated` only.
- **Rollback.** Re-declare the prior definition; no data is transformed.
- **Hosted proof.** Owner-scoped, with a non-vacuous negative control: an
  archived memory that *would* rank in the top 20 and must not appear.
- **If not authorized.** `2N-CORRECT-003` closes `not-built-by-rule`, and the
  audit's finding stands recorded as a known defect.

### M2 — telemetry vocabulary · **recommended, rank 2, conditional**

- **Destination.** Slice 2N.7, exclusively.
- **Necessity.** Conditional on `OD-2N-15`. If any event is declared, the
  event-name CHECK, `private.validate_product_event_properties` and the surface
  CHECK must move **in one change**, before any producer.
- **Alternative.** Declare no events. Real, and it costs the phase its ability
  to answer whether anyone inspects what the Brain knows.
- **Affects.** Three enforcement points, one constraint each.
- **Rollback.** Re-declare the prior CHECKs; no producer exists yet by
  construction.
- **If not authorized.** `2N-METRICS-001…002` close `not-built-by-rule`
  against the budget.

### M3 — relation provenance · **rank 3, conditional on `OD-2N-8` option B**

- **Destination.** Slice 2N.6, exclusively.
- **Necessity.** Only if inferred relations may be persisted. Adding a source
  and origin to `person_relationships` (and possibly `person_projects`,
  `person_contexts`) is schema.
- **Alternative without migration.** `OD-2N-8` **option A**: refuse to persist
  inferred relations at all; every stored relation is owner-authored by
  construction, and `2N-RELATION-002` renders origin as "you told me" without a
  new column.
- **Why the alternative is credible.** Nothing currently writes an inferred
  relation, so option A costs no existing behaviour. **This plan recommends
  option A**, which is also how the ceiling is kept.
- **Affects.** Up to three tables, plus backfill semantics for existing rows —
  which have no source and never will.
- **If not authorized.** `2N-RELATION-003` closes `not-built-by-rule`.

### M4 — deletion propagation · **rank 4, conditional on `OD-2N-11`**

- **Destination.** Slice 2N.3, exclusively.
- **Necessity.** Only if deletion is authorized. Safe deletion across
  `entry_entities`, `person_projects`, `person_contexts`,
  `person_relationships`, `entity_attachments`, `entity_tags`,
  `entity_aliases`, `task_people` and `memories.person_id` is a transactional
  `SECURITY DEFINER` RPC with an undo compensation.
- **Alternative without migration.** Client-side multi-statement deletion —
  **refused**: not transactional, not auditable as one act, and T-6 is exactly
  the failure it produces.
- **Second alternative.** Do not build deletion this phase. Real; the product
  has never had it, and `2N-CORRECT-004…005` close `not-built-by-rule`.
- **Affects.** One new function; no new table.
- **If authorized alongside M1, M2 and M3, the ceiling is exceeded** and work
  stops for a new owner decision.

### M5 — merge and canonical identity · **not proposed**

Merge would need a canonical pointer or tombstone plus a transactional relink
RPC. **This plan does not propose it within the ceiling.** It is named so its
absence is deliberate: if `OD-2N-3` is signed, the owner is funding a fifth
migration and that is a separate decision, not an implementation consequence.

### Recommended final budget

**TWO allocated, non-transferable: M1 (slice 2N.3) and M2 (slice 2N.7,
conditional on `OD-2N-15`).** M3 avoided by signing `OD-2N-8` option A; M4
deferred by declining deletion this phase or by funding it explicitly as a
third; M5 out.

No migration is allocated "for adjustments". None is transferable. A fifth is a
stop condition.

## 7. Open owner decisions, in full

Each has real options, a recommendation where the audit supports one, user and
scope impact, migrations implied, risk, and what it blocks.

### OD-2N-1 — canonical identity for a person · *blocks final planning of identity work*

- **A. Keep name-uniqueness as identity; add alias reading only.** A person
  stays a unique name; `entity_aliases` gains a reader so nicknames resolve.
  *User impact:* searching "Bia" finds Beatriz; no new concepts. *Scope:* small.
  *Migrations:* none. *Risk:* duplicates still accumulate. **Recommended** — it
  switches on a mechanism already built and paid for.
- **B. Add a canonical-identity pointer.** *User impact:* duplicates can
  eventually be reconciled. *Scope:* large; drags in merge. *Migrations:* at
  least one, probably two. *Risk:* the largest in the phase.
- **C. Neither.** *User impact:* unchanged. *Scope:* none. *Migrations:* none.
  *Risk:* `entity_aliases` stays a table nobody uses, which is its own kind of
  debt.

### OD-2N-2 — canonical identity for a project · *blocks 2N.2*

- **A. Mirror whatever `OD-2N-1` signs.** **Recommended** — two identity models
  in one product is the divergence this phase exists to remove.
- **B. Projects keep name-uniqueness regardless.** Defensible: projects are
  fewer and renamed more deliberately. *Migrations:* none.

### OD-2N-3 — merge authority · *blocks implementation of merge*

- **A. No merge this phase.** *Scope:* removes the phase's most dangerous
  operation. *Migrations:* none. **Recommended**, on sequencing rather than on
  principle: merge before an identity model exists would be built against name
  uniqueness.
- **B. Owner-confirmed merge through one validated RPC with a full preview.**
  *Migrations:* one (M5, outside the recommended budget). *Risk:* T-1.
- **C. Merge suggested by the system and applied in one action.** **Refused** —
  it makes an irreversible operation a single click on an inference.

### OD-2N-4 — merge reversibility · *blocks implementation of merge*

- **A. Reversible, with a registered undo proved by a populated-fixture test.**
  **Recommended if `OD-2N-3` B is signed.**
- **B. Irreversible, with explicit confirmation naming exactly what will move.**
  Acceptable only if the preview is complete. *Risk:* a mistake is permanent.
- **C. Unstated.** **Refused** — the product must say which before the user
  confirms.

### OD-2N-5 — memory-correction authority · *blocks 2N.3*

- **A. Reuse `updateMemory` and `setMemoryLifecycle`.** *Migrations:* none.
  **Recommended.**
- **B. A new correction RPC recording supersession.** *Migrations:* one.
  Stronger provenance; more schema.

### OD-2N-6 — suppress vs archive vs remove · *blocks 2N.3*

- **A. Two states only — `active` and `archived`, as today — plus removal from
  retrieval.** *User impact:* the user can retire a belief and it genuinely
  stops being used. *Migrations:* M1 only. **Recommended.**
- **B. Three distinct states, adding "suppressed" (never true) as separate from
  "archived" (stopped being true).** *User impact:* the more honest vocabulary;
  a correction is recorded as a correction. *Migrations:* M1 plus a column.
- **C. Add hard removal.** Pulls in `OD-2N-11`.

### OD-2N-7 — conflict representation · *blocks 2N.4*

- **A. Derived at read time from existing columns; both claims shown; no
  persisted conflict state.** *Migrations:* none. **Recommended.**
- **B. Persisted conflict records with their own lifecycle.** *Migrations:*
  one (M4 slot). *Risk:* a queue that fills faster than it drains.
- **C. No conflict surface.** Honest; the family closes `not-built-by-rule`.

### OD-2N-8 — may an inferred relation be persisted? · *blocks 2N.1 and 2N.6*

- **A. No. Only owner-authored relations persist; extraction may propose and a
  proposal is not a relation.** *Migrations:* none. **Recommended** — nothing
  writes inferred relations today, so this costs no behaviour and closes T-3.
- **B. Yes, with provenance columns.** *Migrations:* M3. *User impact:* richer
  automatic context. *Risk:* every existing row is unsourced forever.
- **C. Yes, as today, without provenance.** **Refused** — that is T-3.

### OD-2N-9 — file-library scope · *blocks 2N.5*

- **A. Links and provenance only — files visible from entities and entities
  from files.** *Migrations:* none. **Recommended.**
- **B. Add classification, filtering and richer discovery.** *Migrations:*
  none, but a larger slice.
- **C. Nothing beyond today.** The family closes `not-built-by-rule`.

### OD-2N-10 — the graph's role · *blocks 2N.6*

- **A. No graph this phase; a text and list explorer instead.** *Migrations:*
  none. **Recommended** until relations can explain themselves.
- **B. Secondary graph with a complete non-graph equivalent.** *Risk:* T-11.
- **C. Graph as a primary navigation model.** **Refused** — the roadmap's own
  boundary.

### OD-2N-11 — deletion propagation · *blocks 2N.3*

- **A. No deletion this phase.** *Migrations:* none. *User impact:* the
  mistaken person stays forever — a real cost, stated plainly. **Recommended
  only if the budget is held at two**; otherwise B.
- **B. Deletion of a person, project and memory through one transactional RPC
  with enumerated propagation, retrieval eviction, audit and undo.**
  *Migrations:* M4. *User impact:* the largest single improvement in user
  control in this phase.
- **C. Soft delete only.** **Refused as a half-measure**: it adds a state to
  every read path in the product while still not removing anything.

### OD-2N-12 — sensitivity on contextual pages · *blocks 2N.0*

- **A. Contextual surfaces join `GOVERNED_SURFACES`; classification derives
  from the source record; masked in place with a local reveal.** *Migrations:*
  none. **Strongly recommended** — it closes the phase's only live privacy
  defect with a mechanism that already exists.
- **B. Exclude classified content from these pages instead of masking.**
  **Refused** for the reason the contract already records: a dropped row makes
  the count a lie.
- **C. Leave the pages ungoverned.** **Refused.**

### OD-2N-13 — the four timezone defects · *blocks 2N.0*

- **A. Fix as a foundation of 2N.0.** *Scope:* +27 call sites in a foundation
  slice, on surfaces this phase otherwise does not touch. *Risk:* a foundation
  slice that grows.
- **B. A separate initiative before 2N.1, and 2N.0 only guards its own
  surfaces.** **Recommended** — the defect is real and the repair is
  mechanical, but it belongs to `daily-cycle`, which has its own destination,
  and `2N-TIME-001…003` already prevent this phase from inheriting it.
- **C. Keep residual.** Acceptable only with B's guard extension; without it the
  contextual pages keep the defect and 2N adds more.

### OD-2N-14 — final migration budget · *blocks implementation*

- **A. TWO — M1 and M2.** **Recommended** (§6).
- **B. THREE — add M4 (deletion).** Buys the largest user-facing gain and
  requires signing `OD-2N-11` B.
- **C. ZERO.** The phase becomes hardening-only; `2N-CORRECT-003` and the
  telemetry family close `not-built-by-rule`. Coherent, and it leaves the
  retrieval defect standing.

### OD-2N-15 — telemetry · *blocks 2N.7*

- **A. Declare a small content-free set with real consumers.** *Migrations:*
  M2. **Recommended.**
- **B. No events.** *Migrations:* none; the family closes
  `not-built-by-rule`.

### OD-2N-16 — hardware proof · *blocks closeout only*

- **A. No requirement in this phase needs hardware.** **Recommended** — nothing
  here is device-dependent; mobile is viewport work provable in Playwright.
- **B. Screen-reader validation is required for close.** Honest and stronger,
  and it makes closeout depend on an owner-run session that has never happened
  in this product.

### OD-2N-17 — ADR-055 · *blocks closeout only*

- **A. Restate as neither satisfied nor superseded.** **Recommended** — this
  phase builds no retrieval widening and feeds no funnel.
- **B. Treat any 2N work as progress toward it.** **Refused** — it is not.

## 8. Estimates

Re-estimated against the audited product, not the roadmap.

| Slice | Range | Driver |
| --- | --- | --- |
| 2N.0 | 1.5–2.5 wk | breadth: four routes, one contract, one guard corpus |
| 2N.1 | 1.5–2.5 wk | provenance rendering, bounds, journeys ×2 ×2 |
| 2N.2 | 1–2 wk | reuses 2N.1's panels |
| 2N.3 | 2–3.5 wk | +1 wk if M1 is authorized (deploy, parity, hosted proof) |
| 2N.3b merge | 2–3 wk | **only if `OD-2N-3` B**; otherwise zero |
| 2N.4 | 2–3 wk | the only greenfield slice |
| 2N.5 | 1–1.5 wk | a surface for an existing table |
| 2N.6 | 1–3 wk | 1 wk for a list explorer, 3 wk for a graph with a full equivalent |
| 2N.7 | 1.5–2.5 wk | matrix, proofs, closeout |

- **Total, recommended decisions (no merge, no graph, no deletion):**
  **12–17 weeks**.
- **Total, maximal signing:** 17–24 weeks — and it exceeds the migration
  ceiling, so it is not currently reachable.
- **Roadmap said 13–18 weeks.** The recommended path is slightly *below* the
  low end, because three slices are hardening rather than construction — offset
  by 2N.0, which the roadmap did not contain.
- **Critical path.** `OD-2N-12` → 2N.0 → 2N.1 → 2N.5/2N.6 → 2N.7. Everything
  else can move.
- **Parallelisable.** 2N.2 alongside 2N.3; the telemetry migration's
  specification alongside any slice, since it must precede its producers.
- **Owner dependencies.** Seventeen decisions; four block the first slice.
- **Hardware dependencies.** None, under `OD-2N-16` A.
- **External dependencies.** None.

**An estimate is not a promise.** It is what this plan is willing to be judged
against, not a date.

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
