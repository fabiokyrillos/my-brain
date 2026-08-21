# Phase 2Q — Current-experience audit

**Read-only. Authored 2026-08-21 against `main` `beef7fa`**, local and
`origin/main` identical (`0 0`), worktree clean, **zero open pull requests**,
CI **green 3/3** on that exact SHA (run `32440530986`, three jobs with 11, 23
and 9 executed steps — not a cancelled or queued run), **99 local = 99 hosted,
parity `202608190099`** read live through the linked CLI, signup closed
(`[auth].enable_signup = false`).

**Nothing in this document was carried over from Phase 2P's records.** Every
claim below was re-derived from the code, the deployed SQL or the live migration
list in this session. Where a Phase 2P record turned out to be incomplete or
misleading, that is stated in §7 rather than quietly corrected.

---

## 1. Why this audit exists, and what it refuses to assume

Phase 2P closed with a named priority pendency — `2P-REVIEW-CITATIONS`, ADR-125
Decision 4 — and a specification, `PHASE_2P_REVIEW_CITATIONS_REQUIREMENT.md`.
A specification written during one phase is **not** current truth at the start
of the next; §11 of `PHASE_2K_2O_ROADMAP_DESIGN.md` is explicit about that.

So the specification was re-audited line by line rather than adopted. It held on
seven of its eleven claims, was **incomplete on one that changes the migration
decision**, and did not surface a second defect in the mechanism it depends on.
Both are in §3.

---

## 2. What the product already does about "where did this come from"

This is the audit's most important negative result: **the product is not missing
a provenance capability. It is missing it in exactly one place.**

Three independent, mature mechanisms ship today.

| Mechanism | Where it lives | What it links |
|---|---|---|
| `Provenance` contract | `src/features/provenance/contracts.ts` | a domain row → the **entry** that produced it, via `source_entry_id` |
| Citations envelope | `src/features/conversation-sources/contracts.ts` | a chat answer → the **entries and memories** it cited |
| Markdown link gate | `src/features/reviews/markdown.ts` | a link inside review prose → **only** an id the caller vouched for |

### 2.1 Where a reader can already open the source — measured, not assumed

Counted by an executable census over `src/`, excluding test files, matching the
**rendered component** rather than the string:

| Surface | Affordance | Renderer |
|---|---|---|
| `/app/work/[taskId]` | "open the entry this task came from", with a preview | `daily-cycle/task-detail-view.tsx:279` |
| `/app/memories` and `/app/memories/[memoryId]` | `ProvenanceNote` | `memories/page.tsx:188`, `[memoryId]/page.tsx:270` |
| `/app/people/[personId]` | `ProvenanceNote` ×2 | `people/[personId]/page.tsx:580`, `:719` |
| `/app/projects/[projectId]` | `ProvenanceNote` ×2 | `projects/[projectId]/page.tsx:476`, `:596` |
| entity association / relationship panels | `ProvenanceNote` | `entities/association-panel.tsx:166`, `relationship-panel.tsx:106` |
| `/app/inbox/[entryId]` | `ReturnToSource` | `inbox/[entryId]/page.tsx` |
| chat | resolved source cards with links | `conversation-sources/source-list.tsx` |

**A correction to this audit's own first pass.** The census initially reported
that `task-detail-projection.ts` reads `source_entry_id` "only to derive
sensitivity", which would have made the Work surface a gap. It is false: the
projection returns a `provenance: { entryId, preview, occurredAt }` object
(`task-detail-projection.ts:196`) and `task-detail-view.tsx:279` renders a link
from it. The first pass had grepped the *page* file, which is 38 lines and
delegates to a surface component. **A grep of the route file is not a census of
the route.** The error is recorded because the same shape would have put a
fabricated requirement into the PRD.

### 2.2 The one surface that composes prose and links to nothing

`/app/reviews/[reviewId]` renders a model-written document about the owner's own
week, and it passes **`new Set<string>()`** as the link allow-set
(`reviews/[reviewId]/page.tsx:125`). Every link the model writes therefore
degrades to plain text, by design, because the page cannot prove any id in that
prose is real.

The page says so to the owner rather than hiding it. **That honesty is not the
deliverable.** ADR-125 Decision 4: *"The 'Fontes' section that ships today is
not delivery of it."*

---

## 3. `2P-REVIEW-CITATIONS`, re-audited against the code

The owner's eleven questions, each answered from the tree at `beef7fa`.

### 3.1 Which references exist during `generateReview`

`src/features/agent/actions.ts:961-975`. Exactly two, and both are real rows read
under RLS in the same request:

| Source | Id handed to the provider | Table actually read | Bound |
|---|---|---|---|
| entries in the window | `entry:<uuid>` | `entries` | `.limit(100)` |
| tasks touched in the window | `memory:<uuid>` | **`tasks`** | `.limit(100)` |

### 3.2 Where they are discarded

`src/features/agent/actions.ts:1043-1060`. The `summaries` upsert writes twelve
columns. **`answer.citedSourceIds` is never referenced after the provider
returns.** The value is alive in memory and dropped at the write.

### 3.3 The current shape of `summaries`

Fourteen columns — `content, generated_at, id, input_tokens, model,
original_content, output_tokens, period_end, period_start, period_type, status,
title, updated_at, user_id` — and `Relationships: []`. The only foreign key is
`user_id → auth.users`. **No column can hold a citation and no join table
exists.**

**One producer, three readers**, counted by an executable census of
`from("summaries")` across `src/` and `supabase/functions/`:

| Role | Call site |
|---|---|
| producer | `features/agent/actions.ts:1045` — `generateReview`, a Server Action |
| reader | `features/calendar/calendar-projection.ts:263` |
| reader | `features/day-review/day-review-projection.ts:297` |
| reader | `features/reviews/review-list.ts:59` |

There is **no automatic producer**: the worker never writes `summaries`. The one
piece of SQL that touches the table is
`public.mark_historical_summaries_outdated()`
(`202607160008_scheduled_heartbeat.sql:46`), a trigger that flips
`status = 'outdated'` when a retroactive entry is re-interpreted inside the
review's period. A row therefore has a **lifecycle** a citation feature must not
contradict.

### 3.4 The existing `conversation_messages.citations` contract

- **The column:** `citations jsonb not null default '[]'::jsonb`,
  `202607160006_chat_memory.sql:58`. **No check constraint, no trigger, no
  deployed validator.**
- **The validation is TypeScript**, in `features/conversation-sources/contracts.ts`:
  a strict Zod `envelopeSchema` (`v`, `evidence`, `reach`, `sources` capped at
  20, optional `explanation`) over a strict `referenceSchema`
  (`id`, `type`, `sourceId` as `uuid`, `support`).
- **`referenceSchema` carries no content-bearing field at all.** There is
  nowhere in the shape to put an excerpt, a title or a snippet — the property is
  enforced by the type, not by a caller's promise (`2K-PRIVACY-003`).

**This matters for the budget:** the vocabulary is pinned in *code*, not in
deployed SQL, so changing it costs **no migration**.

### 3.5 Is `summaries.citations jsonb` really the smallest correct model?

**As a column, yes. As a complete model, no — and the Phase 2P specification
stopped one step short.**

`referenceSchema` pins `type: z.enum(["entry", "memory"])`, and
`resolve-sources.ts:109` resolves `memory` against the **`memories`** table, with
`memoryHref` pointing at `/{locale}/app/memories/{id}`. But `generateReview`
labels **tasks** with the `memory:` prefix — a misnomer the Phase 2P record does
name, without following it through to the consequence:

> Reusing the chat envelope verbatim would persist a **task uuid** under
> `type: "memory"`. At render, the resolver would look that id up in `memories`,
> find nothing, and return `unavailableCard("memory")`. **Every task citation
> would degrade silently**, the feature would ship green, and any test written
> over entries alone would pass.

That is the precise failure the owner's requirement forbids: *"Se a revisão
disser que eu concluí a tarefa X, deve existir um link para a tarefa X real."*

So the smallest correct model is **one column plus one vocabulary correction**:
the shared `entry | memory` type set must admit `task`, and the review's source
set must stop calling a task a memory. The vocabulary lives in four places, all
TypeScript:

| Where | What it pins |
|---|---|
| `lib/ai/types.ts:26` | `ChatSource.type: "entry" \| "memory"` |
| `conversation-sources/contracts.ts:66` | `CitedSourceType` |
| `conversation-sources/contracts.ts:79` | `ANSWER_REACH` |
| `conversation-sources/contracts.ts:92-101` | `referenceSchema.type` |

and one behavioural place, `resolve-sources.ts`, which has no `tasks` branch.

**This is an owner decision** (`OD-2Q-1`), because the contract is shared with
chat and chat is a shipped, governed surface.

### 3.6 Which types can be linked in the first delivery

Only what the generator actually reads: **entries and tasks.** Canonical
owner-scoped routes exist for seven object types
(`inbox/[entryId]`, `work/[taskId]`, `memories/[memoryId]`, `people/[personId]`,
`projects/[projectId]`, `organizations/[organizationId]`,
`contexts/[contextId]`), so the *route* side is not the constraint. The
constraint is retrieval: `generateReview` puts no person, project, organization
or memory into the source set, so a link to one could only be born by matching a
name in the Markdown — which the requirement forbids by name.

Widening the source set is a real option with a real cost (more rows in the
prompt, more tokens, a different review). It is `OD-2Q-2`, not an assumption.

### 3.7 The seven degradation cases, and which already have a shipped answer

| Case | Shipped answer | Where |
|---|---|---|
| item removed | `unavailableCard` | `resolve-sources.ts:156`, `:171` |
| item unreadable (query error) | `unavailableCard` — **"a failed read is not an empty read"**, and the surface must not distinguish "gone" from "unreadable" | `resolve-sources.ts:125-132` |
| item foreign | `.eq("user_id", userId)` means it never comes back → `unavailableCard` | `resolve-sources.ts:105`, `:112` |
| item archived | `isMemoryInForce` → `unavailableCard` | `resolve-sources.ts:176` |
| highly sensitive content | `readOnlyPreviewCard({ sensitivity })` | `resolve-sources.ts:160`, `:181` |
| invalid reference | dropped by `parseCitations`' strict schema | `contracts.ts:179` |
| historical review with no citations | `EVIDENCE_STATES` already carries **`unknown`**, defined as *"a legacy row, written before this envelope existed… claiming the Brain found nothing when nobody recorded whether it did would be an invention"* | `contracts.ts:113` |

**Six of seven transfer unchanged.** The seventh — sensitivity — does not, and
§3.9 says why.

### 3.8 A second defect, in the mechanism the requirement depends on

`authorizeHref` (`reviews/markdown.ts:135`) keys its allow-set on the **uuid
alone**:

```ts
const INTERNAL_ROUTE =
  /^\/(?:pt-BR|en)\/app\/[a-z-]+\/([0-9a-fA-F]{8}-…)$/;
return allowedIds.has(match[1].toLowerCase()) ? trimmed : null;
```

The path segment is `[a-z-]+` — **any** surface. So an envelope that vouches for
entry `X` also authorizes `/pt-BR/app/work/X`, `/pt-BR/app/people/X` and
`/pt-BR/app/projects/X`. Today this is inert because the allow-set is empty; the
moment it is populated, the gate admits a **type-confused link**.

It does not leak: `work/[taskId]` scopes by `user_id` and calls `notFound()`, and
the entry id will not resolve there. It produces a **broken link the owner will
click**, which is exactly the class of failure the requirement exists to
eliminate. The gate needs to bind `(type, id)`, not `id` — and the fix is small,
because both halves are already in the envelope.

**This defect is not recorded anywhere in Phase 2P's artifacts.**

### 3.9 Sensitivity: a task has no level of its own

`tasks` carries **no `sensitivity` column**. It carries `source_entry_id`, and
the product derives a task's level from that entry through
`deriveTaskSensitivity(source_entry_id, sourceLevels)` — already used by **seven**
surfaces (`calendar-projection`, `task-detail-projection`, `work-projection`,
`day-review-projection`, `planner-projection`, `reminders/task-options`,
`sensitivity/task-derivation`). So a review's task citation needs **no new
mechanism**; it needs the existing one applied.

The open question is which *rule* governs the cited record's preview.
`GOVERNED_SURFACES` includes `review_summary`, whose rule is
`{ normal: SHOW, private: SHOW, highly_sensitive: MASK }`. ADR-124 Decision 1
made **the review's own words** visible without a second click — but a cited
entry's content is **not** the review's content, and ADR-124 Decision 2 is
explicit that the rules table was untouched. Applying "visible by default" to
the cited record would extend an amendment past what it says. `OD-2Q-5`.

### 3.10 Backfill

**Recommended: none, and the schema already makes that the honest answer.**
`EVIDENCE_STATES` distinguishes `no_qualifying_evidence` ("retrieval ran and
found nothing") from `unknown` ("nobody recorded whether it did"). A historical
review predates the producer, so `unknown` is true of it and
`no_qualifying_evidence` would be a claim nobody can support. Inventing
references for past reviews would also require re-running retrieval over a
window whose rows have since changed — a fabrication with a cost. `OD-2Q-3`.

### 3.11 Telemetry — and the second migration it would cost

`product_events` validates its event **names** against a closed list inside a
deployed function (`202608110090_phase_2m_daily_cycle_telemetry.sql:100-131`),
and validates properties per event with `require_product_event_enum`. A new event
such as "the owner opened a cited record" is **not** in that list, so the
deployed writer would refuse it — and, per this repository's own recorded
history, refuse it **silently**.

Widening the list is a `create or replace` of a deployed function: **a second
migration.** ADR-123 already refused funding for exactly this shape of change
(`2P-CALENDAR-MONTH-TELEMETRY`, month scope, still refused — the deployed
enum is `array['day', 'next_day']`). `OD-2Q-4`, and the recommendation is
consistent with the precedent: **do not fund it.**

---

## 4. The other open remainders, re-audited

Each was checked against `main`, not against the record that named it.

| Remainder | Measured state at `beef7fa` | Classification |
|---|---|---|
| `2P-REVIEW-CITATIONS` | not delivered; §3 above | **Phase 2Q, the spine** |
| `A11Y-WEBKIT-DARK-CONTRAST` | real. `playwright.config.ts:96` defines `iphone-emulated` (WebKit); `ci.yml:276` runs `accessibility.spec.ts` on `--project=desktop --project=mobile` **only**, so nothing in CI can see it | **Phase 2Q, candidate** (`OD-2Q-6`) |
| `2P-ATTENTION-008` | the refresh/back half was proved at the data layer only. `e2e/online-phase-2n-conflicts.spec.ts` exists and touches attention; whether it covers the confirmation panel must be **re-verified at slice start**, not assumed either way | **Phase 2Q, small; verify first** |
| `2P-CHAT-007-JOURNEY` | **unspendable, not declined.** Re-verified by listing variable *names* only: no `BYOK_*` variable in the environment and no `OPENAI*` name in `.env.local`. The owner's authorization cannot be spent without a credential | **external dependency** |
| `2P-AUTONOMY-003` | the reference set does not exist; the mechanism and the producer do | **blocked on real owner review volume** |
| `2P-AUTONOMY-005 / -006 / -007 / -008` | fail-closed by ADR-123 Decision 3. No automatic writer exists and none may be authorized | **not-built-by-rule; unchanged** |
| four missing review flows | **measured, and they are not one block** — see §5 | **separate initiative** (`OD-2Q-8`) |
| `2P-MOBILE-002` remainder | a software keyboard and an IME are not scriptable | **owner hardware** |
| `2P-ACCESS-005` (VoiceOver) | **WAIVED, NOT PASSED.** ADR-125 Decision 2. No screen-reader evidence exists and none is claimed here | **owner, if their use changes** |
| `RG-DEP-3` | no restore has ever succeeded; `POST_2H_BACKUP_READINESS.md` §8. **It cannot be closed by writing a file** | **rollout initiative, not a phase** |
| push HTTP 403 on iPhone | not resumed; needs Apple-side and real-device work | **external + hardware** |
| `2P-REMINDER-RECURRENCE` | a recurrence column on `reminders` was **refused by name** in ADR-123's amendment | **backlog; needs a new owner decision to reopen** |
| `2P-CALENDAR-MONTH-TELEMETRY` | signed as **explicitly unfunded**; the deployed enum is `array['day','next_day']` | **rejected by rule; re-opening costs a migration** |
| `2P-APPEARANCE-HYDRATION` | pre-existing, reproduced on `main` during 2P.5 | **backlog** |
| remaining `revalidatePath` call sites | 79 call sites. The settings case is **already correct** — `SETTINGS_REVALIDATION_PATHS` uses the route *pattern* `/[locale]/app/settings/[section]`. The remaining literal-path calls name URLs that **are** the rendered route, which this repository has since proved works | **largely resolved; narrower than the record implies** |

---

## 5. The four missing automation review flows, sized rather than grouped

ADR-123's amendment routed `project`, `organization`, `memory` and `relation` to
the successor's re-audit as one group. **They are not one group.** Proved from
the deployed migration and the extraction schema:

**Producers today.** `private.record_automation_calibration_observation` is
called from exactly three places in `202608190099`, and the categories they can
pass are literals: `'task'` (line 832), `'person'` (line 878), and a third site
that resolves to `'task'` or `'person'` by `action_type`. **No path can ever
write an observation for the other four**, so waiting accumulates nothing —
exactly as the amendment says, and still true.

| Category | What is actually missing | Size |
|---|---|---|
| `project` | the extraction schema **already emits** `projects: z.array(entityCandidateSchema)`; what is missing is a confirmable review flow mirroring `person-candidate-*` (≈465 lines of non-test source + tests) and a producer call | **medium** |
| `organization` | same — `organizations` is already in the schema | **medium** |
| `memory` | **not in `entryExtractionSchema` at all.** Adding it changes the AI contract, and `extraction-parity.test.ts` fails the build unless the Deno worker's own copy changes with it | **large; touches the worker** |
| `relation` | `2N-RELATION-TRIGGER` stands as a boundary: a relation is not declared from co-occurrence | **blocked by a prior decision** |

Putting these into Phase 2Q would make the phase two phases. `OD-2Q-8`
recommends a separate initiative.

---

## 6. What the roadmap says, and what it does not

`docs/initiatives/product-ux/PHASE_2K_2O_ROADMAP_DESIGN.md` covers **2K through
2O and stops there**. Phase 2P was authorized outside it, by ADR-121.
`MY_BRAIN_UX_ROADMAP.md` is item-based (`C-01…C-06`, `I-01…I-12`, `N-01…N-05`)
and names no lettered phase at all.

**There is therefore no roadmap definition of what the next phase should be.**
The objective in the PRD is derived from the product measured above and from the
owner's stated priority — not inherited.

---

## 7. Divergences found between the record and the tree

Recorded rather than silently corrected, per the owner's instruction.

1. **`docs/TODO.md:53`, the `Active milestone:` line, is stale.** It reads
   *"Phase 2P … PLANNING AUTHORIZED, IMPLEMENTATION NOT AUTHORIZED (2026-08-18),
   by ADR-121 … 87 requirements … none implemented."* Phase 2P was implemented
   (ADR-122) and **closed** (ADR-125). The guard that reads that line
   (`phase-2f-documentation.test.ts:197-234`) pins it to the ADR-121 state and
   never moved with the two later ADRs, so **the guard passes while the document
   understates two owner authorizations** — the exact drift its own comment warns
   about (*"Move it with the ADR, every time"*). Resolved in this package by
   moving the line to the active milestone and updating the guard in the same
   commit.

2. **`PHASE_2P_REVIEW_CITATIONS_REQUIREMENT.md` §3 is incomplete.** It names the
   `memory:` prefix as "a misnomer" and then proposes reusing the chat envelope
   verbatim, which would persist a task under `type: "memory"` and break every
   task link at render (§3.5). The document is not edited — it is a Phase 2P
   record — and the correction lives here.

3. **The `authorizeHref` type-confusion gap (§3.8) is recorded nowhere.**

4. **Two stale git worktrees exist** — `.worktrees/suggest-new-people` and
   `my-brain-navigation-performance` — both clean.
   `codex/navigation-performance` is an ancestor of `main`;
   `codex/suggest-new-people` is not, but its content landed by squash merge at
   `080a867` (PR #244), which **is**. No work is unmerged. Housekeeping, not a
   finding.

5. **`docs/README.md`'s retarget paragraph says the precedent has been "applied
   eight times" and lists 2G…2M.** It has been applied through 2P. The count and
   the list are stale; corrected in this package because this package adds
   another entry to that same series.

---

## 8. Posture, read live, unchanged by this document

| Fact | Value |
|---|---|
| Signup | **closed** — `[auth].enable_signup = false` |
| Rollout gate | 25 pass · 3 fail · 2 owner-signature |
| Migrations | 99 local = 99 hosted, parity `202608190099` |
| Automation | all six categories `suggest_only`; **zero** enabled |
| Push HTTP 403 | not resumed |
| BYOK credit | none spent; no credential present |
| Hosted data | **not touched by this audit.** The only hosted read was the migration list |

---

## 9. The signature, and what it changed in this audit — 2026-08-21

**ADR-127 signed all eight decisions.** Seven followed this audit's
recommendation. **`OD-2Q-5` did not**, and the divergence changes two findings
above rather than merely selecting a branch.

### 9.1 §3.9 is superseded in its conclusion, not in its evidence

§3.9 measured that `tasks` has no `sensitivity` column and that the level is
derived from `source_entry_id`, and concluded that the open question was *which
rule governs the cited record's preview*. **The measurement stands. The question
is gone**, because option C renders no preview: there is no cited-record content
on the review page for a rule to govern.

### 9.2 A finding this audit should have made before recommending option A

`sensitivity-convergence.test.ts:50` asserts — today, on `main` — that **no
reviews surface may contain `resolveContent(` or the literal `highly_sensitive`**,
over three named files including `reviews/[reviewId]/page.tsx`. It was
established by ADR-124 Decision 2 and left standing.

**Option A would have required weakening it.** Rendering a cited record's preview
means resolving that record's classification on a reviews surface, which is
exactly what those three files are forbidden to do. This audit recommended option
A **without noticing that its own recommendation collided with a shipped guard**
— the guard was read in §3.7 for its degradation behaviour and not checked
against the recommendation being made.

Recorded rather than corrected in place, because the correction is the owner's
decision and the miss is the audit's.

### 9.3 A conflict option C also dissolves

The owner forbade a reveal control on the citation path. The shared presentation
constant is `MASK = { outcome: "mask", revealable: true }`
(`sensitivity/contracts.ts:196`), so under option A a `highly_sensitive` cited
record would have been masked **with** a reveal affordance — and suppressing it
would have meant a new presentation variant or an edit to the `RULES` table, both
forbidden by ADR-124 Decision 2. **Under option C nothing maskable is rendered,
so the conflict never arises.**

### 9.4 A threat option C creates, which option A did not have

A source list that showed a title for an ordinary record and withheld it for a
sensitive one would **disclose the classification by the row's shape**. That is a
leak produced by the protection rather than by the exposure, and it does not
exist under option A, where every row carries a preview and the mask is uniform
machinery.

It is why ADR-127 Decision 5.2 makes the identification **content-free and
uniform** — kind and date, identical for every citation — and why
`2Q-TRUST-006` is asserted as an **equality between two rows** rather than as
two separately passing cases. Recorded as `T-7b` in the threat model.

### 9.5 What the signature did not change

Every measurement in §§1–8 stands unaltered: the seven-surface provenance census,
the two-source retrieval set, the discard at the upsert, the fourteen columns and
`Relationships: []`, the type-confusion finding, the `authorizeHref` gap, the
`product_events` closed vocabulary, the calibration producer reachable only with
`'task'` and `'person'`, and the three documentary divergences in §7.

**`2P-REVIEW-CITATIONS` remains NOT DELIVERED.** Signing the decisions that would
deliver it is not delivering it, and ADR-127 Decision 9 says so.
