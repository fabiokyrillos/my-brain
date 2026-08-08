# Phase 2K — Conversar as the primary interface · PRD

**Status.** Planning artifact. **Implementation is not authorized by this document.** Authorization to plan was recorded by ADR-097 on 2026-08-08; implementation requires a separate owner decision after this package is reviewed.

**Parent scope.** `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`, Etapa 3. Candidate decomposition: `docs/initiatives/product-ux/PHASE_2K_2O_ROADMAP_DESIGN.md` §3.

**Derived from.** `docs/reports/phase-2k/PHASE_2K_CURRENT_EXPERIENCE_AUDIT.md` (what exists), `..._UX_GAPS_AND_OPPORTUNITIES.md` (what it costs), `..._THREAT_MODEL.md` (what could go wrong). Where this PRD and those documents disagree, the disagreement is a defect and blocks implementation authorization.

**Baseline.** `main` = `df9f40e`, migration chain head `202608080087`, **hosted parity verified live**: local = remote = `202608080087`.

---

## 1. Objective and user outcome

**Objective.** Make the conversation an honest, reviewable place to act — one where the user can see what the Brain used, what it ignored, what it cannot reach, and can act without losing the work in progress when they go and check.

**The user outcome, in one sentence.** *I can ask, see where the answer came from, act on it, change my mind, and go look at the evidence without losing my place or my pending action.*

**What this phase is not.** It is not "build conversational actions" — the audit proved those largely exist. It is not "build semantic retrieval" — that ships. It is **make the conversation truthful about itself, and stop destroying pending work.**

### 1.1 The five audit findings this PRD is written against

1. Semantic retrieval ships (`match_internal_knowledge`, pgvector, `entry` + `memory`).
2. Sources per answer ship (computed, fabricated-id-stripped, persisted to `conversation_messages.citations`, rendered).
3. A mature preview → confirm → apply → undo pipeline ships — **for tasks only**.
4. ADR-055 forbids widening retrieval and **expires 2026-10-27**, inside this phase's own estimate, with an empty funnel.
5. Continuity is the one wholly-absent capability, and it needs no schema.

---

## 2. Signed owner decisions

Signed 2026-08-08, recorded in ADR-097. These are inputs to this PRD, not proposals in it.

| Id | Decision | Effect |
|---|---|---|
| **OD-2K-A** *(1a)* | **2K.7 leaves implementation scope.** Current semantic retrieval over entries + memories is sufficient baseline. Slice 2K.0 must produce the permanent decision resolving ADR-055's expiry before 2026-10-27. **No** `source_type` widening, backfill, pipeline, job type, new index or semantic infrastructure. The ADR-055 offline spike remains permitted by ADR-055 itself but is **not** a 2K closing requirement, **not** an implementation of 2K.7, authorizes no infrastructure, and may run only under a later or specific authorization. | `2K-AUDIT-004..006` |
| **OD-2K-B** *(2a)* | **Mutating cards for tasks and memories only.** Tasks reuse the mature path whole. Memories gain preview, staleness witness, explicit confirmation, result and a **domain-appropriate** undo. People, projects, entries, organizations and files stay **read-only previews with links and sources**. No new write path for people or projects belongs to 2K. The PRD must state explicitly that *"actionable card"* does not mean every card type may mutate. | `2K-CARD-*`, `2K-ACT-*` |
| **OD-2K-C** *(3a)* | **Migration budget: maximum 1.** Initially destined for the content-free telemetry vocabulary of the Conversar surface. Budgeted only during planning; creation and application need later implementation authorization. **The ceiling is not an obligation** — if telemetry can be delivered honestly without one, close `1 allocated · 0 spent`. | `2K-METRICS-*` |
| **OD-2K-D** *(4a)* | **Continuity by reopening and server re-derivation.** Restore conversation position and the card's visual reference; request a **new** server derivation; re-check authority, fingerprint and current state; never treat client state as source of truth; mark a prior confirmation **expired** when the object changed; show the relevant difference where that can be done without exposing content improperly; require a fresh confirmation; **never** auto-reapply. **No pending confirmation is persisted in the database this phase.** Permitted persistence is limited to identity and navigation context needed to request a safe re-derivation — never authorization, a reusable confirmation, or a mutation payload. | `2K-CONT-*` |

---

## 3. Scope

### 3.1 In scope

- Action-card contract and read-only previews (tasks, memories mutable; other types read-only).
- Confirm, edit-before-confirm, discard, truthful result, bounded undo.
- Continuity between conversation and product by server re-derivation.
- Sources per answer: typing, freshness, insufficiency, and reach disclosure.
- "How the Brain reached this": what was used, what was excluded and why — without exposing model reasoning.
- Contextual suggestions, deterministic, at most three.
- Sensitivity policy for the Conversar surface, including the persisted-excerpt question.
- Accessibility and mobile as acceptance criteria, extended slice by slice.
- Content-free telemetry for the Conversar surface, with a consumer.
- The permanent ADR-055 expiry decision.

### 3.2 Out of scope, with reasons

| Excluded | Reason |
|---|---|
| Semantic-retrieval widening; embedding backfill; new job type; new index | OD-2K-A; ADR-055 forbids each by name |
| Joining lexical search to chat | `phase-2i-search-guard.test.ts` fails the build on embeddings, vector operators, similarity, `.rpc(` or generated answers in the search feature |
| Re-opening ADR-093 / OD-1 (search sensitivity) | Signed in Phase 2I; chat's policy is a **new** decision, not an amendment |
| Mutating cards for people, projects, organizations, entries, files | OD-2K-B |
| Persisting pending confirmations | OD-2K-D |
| Streaming answers | Not a parent-PRD requirement; would restructure the write-then-redirect contract that keeps a question saved when a provider fails |
| Thread redesign | Only per-message anchors and stable identity, as a prerequisite for continuity |
| Registering a memory undo handler in `undo_operation` | Would cost a migration; the audited archive transition already exists |
| Teaching `match_internal_knowledge` to read `valid_from`/`valid_until` | Would cost a migration; the TypeScript filter shares `isMemoryInForce` with the badge the owner reads |
| Proactive/unprompted assistant behaviour | Parent PRD principle: *silence is also a result* |
| Opening public signup; rollout residuals | Independent owner-controlled gate |

### 3.3 Boundary with 2L–2O

Phase 2K **may** define reusable contracts later phases consume: the card state vocabulary, the continuity re-derivation contract, the source-provenance typing, and the Conversar telemetry surface.

Phase 2K **must not** redesign Work or task lists (**2L**), calendar, planner, reviews or notifications (**2M**), person/project/memory/file pages or the relationship graph (**2N**), or onboarding, personalization, privacy settings and activation (**2O**). It may **link** to those surfaces.

**A contract produced here does not authorize its consumer.** A later phase adopting it needs its own authorization.

---

## 4. Requirement families

Eleven closed families. Every requirement carries a stable id and ends the phase in exactly one classification: `built`, `baseline`, `partial`, `not-built-by-rule`, or `undelivered`. No unclassified row is permitted at close.

### 4.1 `2K-AUDIT` — evidence foundation and signed decisions (slice 2K.0)

- **2K-AUDIT-001:** The current-experience audit is committed, and every "exists"/"does not exist" claim cites a file, line, migration, constraint, guard or executed command.
- **2K-AUDIT-002:** The three unmeasured items named in audit §8 are **measured** before the slices that depend on them: task-command confirmation expiry semantics (read `202607260059` in full), the copy a zero-source answer currently produces, and whether any surface already renders `occurredAt`.
- **2K-AUDIT-003:** Hosted parity is re-proved at the start of implementation, not assumed from this document.
- **2K-AUDIT-004:** A permanent decision resolving **ADR-055's 2026-10-27 expiry** is recorded as an accepted ADR, within OD-2K-A's boundary: it authorizes no `source_type` widening, backfill, pipeline, job type, index or semantic infrastructure.
- **2K-AUDIT-005:** That decision states explicitly whether semantic retrieval leaves the active roadmap, and if it does not, what new demand signal would reopen it and by when.
- **2K-AUDIT-006:** The ADR-055 offline spike is recorded as **permitted but not required**, not an implementation of 2K.7, authorizing no infrastructure, and executable only under a later or specific authorization.

### 4.2 `2K-CARD` — the action-card contract and read-only previews (slice 2K.1)

- **2K-CARD-001:** One card state vocabulary, declared as a closed list in a shared module, covering at minimum: `pending`, `previewed`, `requires_confirmation`, `accepted`, `refused`, `failed`, `undone`, `expired`, `no_change`, `unavailable`.
- **2K-CARD-002:** The state is decided **server-side** and rendered as itself; no component re-derives it from a preview field. `console-state.ts:20-28`'s rule extends to every new state.
- **2K-CARD-003:** A card renders a **read-only** preview. For task cards, immutability remains the literal type `willMutate: false`.
- **2K-CARD-004:** No card mutates anything before an explicit, typed confirmation from the user, except the pre-existing `capture_intent` route, which is the owner's own words and is documented as writing on the turn that recognises it.
- **2K-CARD-005:** Task cards reuse the existing pipeline unchanged — matching, preview, deltas, linked effects, fingerprint, confirmation, undo. No second implementation.
- **2K-CARD-006:** Memory cards gain a preview and a staleness witness, and render **honestly asymmetric** content: a memory create has no pre-state, so it shows no empty before/after table pretending to be a delta.
- **2K-CARD-007:** Read-only preview cards exist for entries, people, projects, organizations and files, carrying a label, an optional bounded snippet, a link and their source. They expose **no mutating control**.
- **2K-CARD-008:** The PRD statement is rendered in the product's own contracts: *actionable card* does not mean every card type may mutate. A guard proves no mutating control is reachable from a read-only card type.
- **2K-CARD-009:** Every card declares its own reversibility from its value, never by inheriting a sibling's. A card that cannot be truthfully reversed does not advertise reversal.

### 4.3 `2K-ACT` — confirm, edit, discard, result, undo (slice 2K.2)

- **2K-ACT-001:** Confirm and discard are reachable without leaving the conversation.
- **2K-ACT-002:** A discard leaves no trace of intent to act and writes nothing.
- **2K-ACT-003:** Editable parameters are a **closed, per-action set** declared server-side; free-text editing of an arbitrary patch is refused.
- **2K-ACT-004:** Editing a parameter **re-derives** the command and **re-fingerprints** the request; an edited preview is never applied under the pre-edit fingerprint.
- **2K-ACT-005:** A confirmation that no longer matches current state resolves to `expired` and requires a fresh confirmation. It is never silently recomputed and applied.
- **2K-ACT-006:** Results are truthful and distinguish at minimum: applied, no change, refused with reason, failed and retryable, failed and terminal.
- **2K-ACT-007:** Task undo keeps its existing 24-hour window and restore-afterwards disclosure.
- **2K-ACT-008:** A confirmed memory has a **real, tested undo** appropriate to its domain, reachable from the conversation that created it, reusing the existing audited lifecycle transition — no new column, no new RPC, no migration.
- **2K-ACT-009:** Memory undo is disclosed accurately: what it does, what it preserves, and that it is not a deletion.

### 4.4 `2K-CONT` — continuity between conversation and product (slice 2K.3)

- **2K-CONT-001:** Every message has a stable per-message identity and anchor, so a position exists to return to.
- **2K-CONT-002:** Opening a referenced object records enough context to return: conversation, message, and the object being acted on.
- **2K-CONT-003:** The continuity payload is a **closed schema of identifiers only**. It carries no confirmation id, no operation key, no patch, no fingerprint and no mutation payload. A guard asserts this.
- **2K-CONT-004:** Returning restores the conversation position and the card's visual reference.
- **2K-CONT-005:** Returning **re-derives** the preview server-side and re-checks authority, ownership, fingerprint and current state. No stored computed preview is ever restored.
- **2K-CONT-006:** If the object changed, the prior confirmation is marked `expired`, the relevant difference is shown where that can be done without improper content exposure, and a fresh confirmation is required.
- **2K-CONT-007:** No action is ever automatically reapplied on return.
- **2K-CONT-008:** A handle naming an object the current user cannot read — deleted, foreign, or under a suspended account — produces one `unavailable` state, byte-identical across those causes, so it is not an existence oracle.

### 4.5 `2K-SRC` — sources per answer (slice 2K.4)

- **2K-SRC-001:** Every composed answer displays the personal records and memories it used. *(Expected `baseline`; evidence must pin it.)*
- **2K-SRC-002:** Fabricated source ids continue to be stripped deterministically, degrading to a missing citation rather than an error. *(Expected `baseline`.)*
- **2K-SRC-003:** Each source carries a **support kind**, distinguishing at minimum: direct support from the user's own record; current product state; and inference composed by the Brain.
- **2K-SRC-004:** Each source shows its **freshness** from the `occurred_at` already retrieved and currently discarded.
- **2K-SRC-005:** An answer with no qualifying personal evidence **says so explicitly** and is visually distinct from an evidenced answer.
- **2K-SRC-006:** The answer discloses its **reach** — that it consulted records and memories — so the user learns the system's actual shape rather than inferring it searched everything.
- **2K-SRC-007:** Sources reaching the answer path remain untrusted data. The answer contract carries no action, command, patch or mutation field, and a guard asserts it.
- **2K-SRC-008:** An action card may appear beside an answer **only** when this turn's own user input produced it. No path exists from retrieved content to a proposed mutation.

### 4.6 `2K-EXPL` — how the Brain reached this (slice 2K.5)

- **2K-EXPL-001:** Explanation is **progressive disclosure**: collapsed by default, never blocking the answer.
- **2K-EXPL-002:** The explanation states what was **used**.
- **2K-EXPL-003:** It states that matches below the similarity floor were **excluded as too weak**, as a bounded statement — never a count, never a score.
- **2K-EXPL-004:** It states when **owner-archived memories** were excluded. This is disclosable because the audience is the person who archived them.
- **2K-EXPL-005:** It **never** discloses, in count, rate or existence, anything excluded for sensitivity. A guard asserts the payload carries no `hiddenCount`/`excludedCount`/`sensitiveCount`/`hasHidden`/`omitted`-shaped field.
- **2K-EXPL-006:** It exposes **no model reasoning**: no chain of thought, no prompt, no internal scoring narrative. The line is behavioural — what the system *did* is disclosable, how the model *composed* is not.
- **2K-EXPL-007:** The user can act on a wrong answer along two distinct paths: **correct the source** (reachable — memory edit and archive already ship) and **flag the interpretation as wrong**. Where the second has no domain effect this phase, it is declared as such rather than implied.

### 4.7 `2K-SUGG` — contextual suggestions (slice 2K.6)

- **2K-SUGG-001:** At most **three** suggestions, derived from the current surface and current state.
- **2K-SUGG-002:** Suggestions are **deterministic**. No provider call, no BYOK spend, no rate-limit slot, no confidence contract. A guard asserts the module constructs no AI provider and calls no `recordAIUsage`.
- **2K-SUGG-003:** No fixed decorative prompt wall; the hard-coded example string and its inline locale ternary are removed.
- **2K-SUGG-004:** Suggestion copy goes through a typed feature `copy.ts` per ADR-036; `locale-ternary-guard.test.ts` stays green.
- **2K-SUGG-005:** Suggestion telemetry carries a bounded category only — never suggestion text, never the data that produced it.

### 4.8 `2K-PRIVACY` — sensitive content on Conversar (cross-cutting; 2K.1/2K.4/2K.5)

- **2K-PRIVACY-001:** `chat` becomes a governed surface in the central sensitivity contract. No new code tests a literal sensitivity level; `sensitivity-boundary.test.ts` stays green.
- **2K-PRIVACY-002:** Presentation follows the contract's doctrine — **masked in place, not excluded** — so a visible count is never a lie and no "n hidden" affordance exists.
- **2K-PRIVACY-003:** **OD-2K-2** is resolved and recorded before implementation: what happens to the **persisted 220-character citation excerpt**, whose stored copy today outlives reclassification of its source. Options: store no excerpt and re-read at render; carry the classification with the excerpt and mask on render; or refuse `highly_sensitive` sources into the answer.
- **2K-PRIVACY-004:** A source reclassified `highly_sensitive` **after** an answer was stored is not rendered in the clear afterwards.
- **2K-PRIVACY-005:** An unreadable classification continues to fail **closed** to `highly_sensitive`.
- **2K-PRIVACY-006:** ADR-093 / OD-1 (search sensitivity) is not amended, re-opened or contradicted.

### 4.9 `2K-A11Y` — accessibility and mobile (slice 2K.8, executed per slice)

- **2K-A11Y-001:** Conversar's card and source states join the accessibility lane's `SURFACES`, extended **as each slice lands**, not at closeout.
- **2K-A11Y-002:** No serious or critical axe violations on the new states, at desktop and Pixel 7 viewports.
- **2K-A11Y-003:** Every new interactive control meets the minimum rendered target size, measured from paint. *(The lane's first execution caught a real 16px defect this way.)*
- **2K-A11Y-004:** Every new focusable control paints a visible focus indicator.
- **2K-A11Y-005:** One polite live region for the surface is preserved; no outcome is announced twice.
- **2K-A11Y-006:** Focus behaviour on card transitions is deliberate and single: exactly one focus move per resolved turn.
- **2K-A11Y-007:** Mobile is an **acceptance criterion**: thumb reach, no hover dependency, keyboard/viewport resilience, and `isComposing` preserved on Enter for IME input.

### 4.10 `2K-METRICS` — content-free telemetry (slice 2K.8)

- **2K-METRICS-001:** A Conversar surface value and its event names are declared in the canonical vocabulary source and **derived** from it everywhere else.
- **2K-METRICS-002:** Every property is a closed enum or a boolean. No key can hold a query, prompt, answer, transcript, title, person or project name, filename, excerpt or free-text parameter.
- **2K-METRICS-003:** Durations are bucketed, never measured.
- **2K-METRICS-004:** All live enforcement points are audited and updated together — table CHECK and `validate_product_event_properties`. The failure corrected by `202608080087` is not repeated.
- **2K-METRICS-005:** The vocabulary is proved through the **real** public writer, extending `post_2j_product_event_write_path.sql` with set-difference assertions in both directions — never a parallel test.
- **2K-METRICS-006:** **Negative controls** pass: an undeclared event name and an undeclared property are both refused. **Non-vacuity** is proved: accepted events return a non-null id.
- **2K-METRICS-007:** A **consumer** exists before close — producer → writer → RLS-scoped consumer proved end to end. A producer with no consumer is not a delivered metric.
- **2K-METRICS-008:** Zero fixture residue is proved after any hosted probe.

### 4.11 `2K-CLOSE` — closeout (slice 2K.8)

- **2K-CLOSE-001:** Every declared requirement is classified exactly once from executed evidence. No unclassified row.
- **2K-CLOSE-002:** Every `partial` names its exact missing behaviour or proof; every `undelivered` names an owner and a destination.
- **2K-CLOSE-003:** The migration budget is reconciled **per slice**. `1 allocated · 0 spent` is a legitimate close.
- **2K-CLOSE-004:** **ADR-055's status is restated at close** against the decision `2K-AUDIT-004` recorded, including whether the expiry date passed and what happened.
- **2K-CLOSE-005:** Real-device, assistive-technology, provider, latency and hosted checks are reported as **executed, skipped or failed** — never inferred. The screen-reader session is manual or an evidenced negative.
- **2K-CLOSE-006:** The signup rollout gate is restated as untouched, and Phase 2K is explicitly not progress toward it.

---

## 5. UX contracts

### 5.1 Universal states

Every Phase 2K surface declares all applicable states. A state that cannot occur is declared as an **evidenced negative**, not omitted.

| State | Contract |
|---|---|
| **empty** | Says what would fill it and offers at most three deterministic next steps |
| **loading** | Non-blocking; the composer stays operable; `aria-busy` set |
| **error** | Distinguishes retryable from terminal; never discards the user's text |
| **partial** | Names what succeeded and what did not; never renders partial as complete |
| **stale** | The object moved; carries no content from the pre-state it knows is wrong |
| **expired** | A prior confirmation no longer applies; shows the relevant difference where safe; requires fresh confirmation |
| **masked** | Existence shown, content withheld, local and transient reveal offered |
| **insufficient** | No qualifying personal evidence; visually distinct from an evidenced answer |
| **unavailable** | Object unreadable; byte-identical across deleted, foreign and suspended causes |

### 5.2 Confirmation and undo criteria

| Action class | Preview | Confirmation | Undo |
|---|---|---|---|
| Task mutation, non-destructive | Full deltas + linked effects | One-step Apply where the match permits | 24h, then restore |
| Task mutation, destructive | Full deltas + gravity + effects | Server-issued single-use, fingerprint-bound | 24h, then restore |
| Memory create from proposal | Honest asymmetric preview, no fake deltas | Explicit confirm control | Domain-appropriate reversal via the audited lifecycle transition, disclosed as not a deletion |
| Capture from own words | Not applicable — the text is the owner's | Not applicable, and documented as such | Existing entry lifecycle |
| Read-only card | Content preview only | **No mutating control exists** | Not applicable |

### 5.3 Copy

All new copy goes through a typed feature `copy.ts` (ADR-036), both locales, no inline locale ternary. Failure copy names what happened and what to do next, without engineering vocabulary.

---

## 6. Cost, limits and security

- **No new AI operation kind.** Every operation is already in `ai_usage_events`' eight-value vocabulary. No usage-ledger migration.
- **BYOK gate unchanged.** A gated user costs nothing and reaches no network. No project key exists.
- **Rate limits unchanged.** One turn remains one admitted `ai` operation. Suggestions add none, because they are deterministic.
- **No new RLS policy, grant, secret, external service or write path** is introduced by this phase.
- **Ownership is RLS.** Presentation rules are never an authorization boundary.
- **Untrusted data.** Retrieved content is data, never instruction; the answer contract cannot emit an action.

---

## 7. Migration budget

**Maximum 1** (OD-2K-C). Destination: the Conversar telemetry vocabulary.

- Budgeted at planning only. Creation and application require later implementation authorization.
- The ceiling is **not** an obligation. `1 allocated · 0 spent` is a legitimate close.
- Reconciliation is **per slice, not by count**.
- A second migration is an owner amendment, not a planning decision.
- Three known pressures are pre-excluded: memory-undo handler registration, teaching `match_internal_knowledge` the lifecycle window, and persisting continuity state.

---

## 8. Definition of Ready

A slice may start only when: its requirements are listed by id; its expected files are named from the audit; its tests are written first and failing for the right reason; its gates are declared; its acceptance criteria are falsifiable; any decision it depends on is signed; and its migration need is either zero or reconciled against the allocation.

## 9. Definition of Done

A slice is done only when: tests were written first; `npm run lint` and `npm run typecheck` are zero-error; the focused and full relevant gates pass; the diff was reviewed line by line; UX/mobile evidence exists at both viewports; security/RLS/grant claims are proved where applicable; browser journeys were **executed** and reported as executed; real-device and assistive-technology checks are labelled executed, skipped or failed and never inferred; the acceptance record is written **from executed evidence, after execution**; and `STATE.md`, `CHANGELOG.md` and `TODO.md` are updated.

---

## 10. Open decisions

Signed decisions are §2. These remain open and **block or gate** the slices named.

| Id | Question | Blocks |
|---|---|---|
| **OD-2K-1** | Which parameters are editable before confirmation, per action? A closed per-action set is required; the alternative is free-text patch editing, which is refused. | Gates `2K-ACT-003/004` |
| **OD-2K-2** | What happens to the **persisted citation excerpt** for `highly_sensitive` sources — no excerpt and re-read at render, excerpt plus travelling classification, or refuse such sources into the answer? | **Blocks** `2K-PRIVACY-003/004` |
| **OD-2K-3** | Memory undo semantics: does the conversational undo of a confirmed memory **archive** it (preserving provenance, consistent with the product's signed refusal to delete memories) or **remove** it (matching the user's likely mental model of "undo")? | **Blocks** `2K-ACT-008/009` |
| **OD-2K-4** | Suggestion sources: which state may produce a suggestion, and may a suggestion name a person or project on screen? *(Telemetry stays bounded either way.)* | Gates `2K-SUGG-001` |
| **OD-2K-5** | Do task-command confirmations expire independently of object change? Audit §8.1 found no TTL; `2K-AUDIT-002` measures it in 2K.0. | Gates `2K-ACT-005`, `2K-CONT-006` |
| **OD-2K-6** | Does the ADR-055 decision **retire** semantic retrieval from the active roadmap at expiry, or renew it with a named new demand signal and a new date? | **Blocks** `2K-AUDIT-004/005` |

---

## 11. Residual destinations

| Residual | Destination |
|---|---|
| Retrieval limited to entries and memories | ADR-055 decision (`2K-AUDIT-004`); any widening is a future phase with its own authorization |
| Citation excerpts stored **before** `OD-2K-2` is applied | Named at close; backfill is a migration and the budget is one, destined elsewhere. Carried to the roadmap successor |
| No screen-reader session on Conversar | Reported manual or as an evidenced negative (`2K-CLOSE-005`) |
| No pgTAP owner-scoping test for `match_internal_knowledge` | May be added in 2K.0 — it is a test, not a migration |
| Mutating cards for people/projects | Out by OD-2K-B; destination is the roadmap successor's own audit |
| Interpretation-correction domain effect, if declared absent | Named at close with an owner and a destination |

---

## 12. What this document does not authorize

It does not authorize implementation, product code, a migration, a deployment, opening signup, executing rollout residuals, running the ADR-055 spike, or planning or starting any successor phase. Implementation requires a separate, explicit owner decision recorded as an accepted ADR.
