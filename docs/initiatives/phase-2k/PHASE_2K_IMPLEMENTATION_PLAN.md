# Phase 2K — Implementation plan

**Status.** Planning artifact. **This document authorizes nothing.** It describes how Phase 2K would be executed *if* implementation is authorized by a separate owner decision.

**Governing PRD.** `docs/initiatives/phase-2k/PHASE_2K_PRD.md`. **Audit:** `docs/reports/phase-2k/PHASE_2K_CURRENT_EXPERIENCE_AUDIT.md`. **Threats:** `..._THREAT_MODEL.md`. **Traceability:** `..._TRACEABILITY_CONTRACT.md`.

**Baseline.** `main` = `df9f40e`; chain head `202608080087`; hosted parity verified live.

**Migration budget.** Maximum **1** (OD-2K-C), destined for the Conversar telemetry vocabulary in slice 2K.8. The ceiling is not an obligation. No migration is created during planning.

---

## 0. Slice order and why

| Slice | Name | Depends on | Estimate |
|---|---|---|---|
| **2K.0** | Evidence, measurement and the ADR-055 decision | — | 4–6 days |
| **2K.1** | Card state vocabulary and read-only previews | 2K.0 | 8–11 days |
| **2K.2** | Confirm, edit, discard, result, undo | 2K.1 | 9–12 days |
| **2K.3** | Continuity by server re-derivation | 2K.1, 2K.2 | 8–11 days |
| **2K.4** | Sources per answer | 2K.0, 2K.1 | 7–9 days |
| **2K.5** | How the Brain reached this | 2K.4 | 6–8 days |
| **2K.6** | Contextual suggestions | 2K.1 | 4–6 days |
| **2K.7** | **REMOVED from implementation scope** — OD-2K-A | — | 0 |
| **2K.8** | Accessibility, mobile, telemetry, closeout | all | 8–11 days |

**Total: 54–74 working days ≈ 11–15 calendar weeks.** This is **longer** than the roadmap's 9–13 weeks despite removing 2K.7, because the audit added the ADR-055 decision, a sensitivity policy for a surface that has none and persists excerpts, and a memory undo that never existed.

**Ordering rationale.** 2K.0 first because three decisions and three measurements gate later slices, and because ADR-055's expiry is dated. 2K.1 before 2K.2 because a state vocabulary must exist before actions resolve into it. 2K.3 after 2K.2 because continuity restores *an action in progress*, which must first be well-defined. 2K.4 can run in parallel with 2K.2/2K.3 after 2K.1. 2K.8 last only for closeout — **its accessibility lane extensions land inside each slice**, which is Phase 2J's lesson: Phase 2I deferred accessibility to the end and then did not reach it.

**Per-slice universal rules.** Tests first, failing for the right reason. `npm run lint` and `npm run typecheck` zero-error. Line-by-line diff review. Atomic commits. One branch and one PR per slice. PR-head CI green. Acceptance record written **after** execution, from executed evidence. **No migration is created or applied without separate authorization.**

---

## Slice 2K.0 — Evidence, measurement and the ADR-055 decision

**Objective.** Replace the three unmeasured assumptions with measurements, and record the permanent ADR-055 decision before its dated expiry.

**Dependencies.** None. **Requirements:** `2K-AUDIT-001..006`.

**Expected files**
- Modify: `docs/DECISIONS.md` — the ADR-055 resolution ADR.
- Modify: `docs/TODO.md` — the dated ADR-055 entry moves to resolved or renewed with a new date.
- Create: `docs/reports/phase-2k/PHASE_2K_SLICE_00_ACCEPTANCE.md` (**after execution**).
- Create (optional, test-only): `supabase/tests/phase_2k_knowledge_retrieval_ownership.sql` — pgTAP owner-scoping for `match_internal_knowledge`, the gap named in audit §5.4.

**Interfaces.** Consumes: closed Phase 2J state, chain head `202608080087`. Produces: three measured facts and a permanent semantic-retrieval decision.

**Measurements (2K-AUDIT-002), each recorded with its method**
1. **Confirmation expiry.** Read `supabase/migrations/202607260059_*.sql` in full; record whether `task_command_confirmations` rows carry a TTL, and how `issue_task_command_confirmation` treats an aged row. Resolves `OD-2K-5`.
2. **Zero-source answer copy.** Execute one authenticated turn against the hosted project with a query guaranteed to match nothing above the 0.2 floor; capture the rendered output verbatim; delete the fixture conversation and prove zero residue.
3. **Freshness rendering.** Grep every consumer of `ChatSource.occurredAt`; confirm the audit's claim that it is retrieved, passed to the provider, and never rendered.

**Tests first.** The pgTAP file, if written, asserts a second owner's rows are unreachable through `match_internal_knowledge` — with a positive control proving the caller can retrieve **its own** row, so the denial is not vacuous.

**Focused gate.** `npx supabase test db` for the new pgTAP file, in CI's `database` job.
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, and the closeout suites: `phase-2f-documentation`, `docs-taxonomy-guard`, `reports-taxonomy-guard`, `product-ux-documentation`.
**UX/mobile gate.** Not applicable — no product surface changes. Declared, not skipped silently.
**Security/RLS/grants.** The optional pgTAP asserts owner-scoping with a positive control. No grant changes.
**Migration verification.** None. **Zero migrations. Budget remains 1 allocated · 0 spent.**
**Browser/Playwright.** One authenticated hosted turn for measurement 2, executed manually against the linked project, with fixture deletion asserted.
**Real device / AT.** Not applicable; declared.

**Acceptance criteria.** Three measurements recorded with method and result. An accepted ADR resolves ADR-055's expiry within OD-2K-A's boundary and authorizes no infrastructure. `OD-2K-5` and `OD-2K-6` are closed. Zero fixture residue proved.

**Acceptance record.** `PHASE_2K_SLICE_00_ACCEPTANCE.md`, after execution.
**Stopping condition.** Stop if the ADR-055 decision requires scope OD-2K-A forbids — that is an owner amendment, not a slice decision.
**Rollback.** Documentation and one optional test; revert by reverting the commit. No product behaviour changes.
**Order.** Branch `codex/phase-2k-slice-0` → commits → push → PR → CI green → merge review → merge. **No deploy** (no migration).

---

## Slice 2K.1 — Card state vocabulary and read-only previews

**Objective.** One server-decided card grammar covering every state Phase 2K can produce, with read-only previews for the five non-mutable object types and a governed sensitivity posture for the surface.

**Dependencies.** 2K.0. **Requirements:** `2K-CARD-001..009`, `2K-PRIVACY-001..006`.

**Expected files**
- Create: `src/features/conversation-cards/contracts.ts` — the closed state vocabulary, the card shape, the per-type mutability declaration.
- Create: `src/features/conversation-cards/contracts.test.ts`.
- Create: `src/features/conversation-cards/copy.ts` + `copy.test.ts` — both locales, ADR-036.
- Create: `src/features/conversation-cards/card.tsx` + `card.test.tsx` — renders state, never decides it.
- Create: `src/features/conversation-cards/read-only-preview.tsx` + test — entries, people, projects, organizations, files.
- Create: `src/lib/closeout/phase-2k-card-guard.test.ts` — structural: no mutating control reachable from a read-only card type; no component re-derives state from a preview field; no literal sensitivity level tested.
- Modify: `src/features/sensitivity/contracts.ts` — add `chat` to `GOVERNED_SURFACES` and its rule row.
- Modify: `src/features/sensitivity/contracts.test.ts`.
- Modify: `src/features/assistant/assistant-composer.tsx` — render the shared card; **`TaskCommandResult` keeps drawing task command states unchanged**.
- Modify: `e2e/accessibility.spec.ts` — add card states to `SURFACES`.

**Interfaces.** Consumes: `TASK_COMMAND_CONTROLS`, `TaskCommandConsoleState`, `presentationFor`, `toSensitivityLevel`. Produces: the card state vocabulary and card contract that 2K.2–2K.6 consume.

**Tests first**
1. The state vocabulary is closed and exhaustively rendered — every member produces a distinct localized outcome.
2. A read-only card type exposes no mutating control (structural guard, with a planted violation proving the guard fires).
3. `chat` resolves through `presentationFor`; `highly_sensitive` masks in place and is revealable locally and transiently.
4. `toSensitivityLevel` still fails closed on an unreadable value.
5. No inline locale ternary in the new feature.

**Focused gate.** `npx vitest run src/features/conversation-cards src/features/sensitivity src/lib/closeout/phase-2k-card-guard.test.ts`
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
**UX/mobile gate.** Both locales; desktop and Pixel 7; masked, revealed, pending, expired and refused states rendered at both viewports.
**Security/RLS/grants.** No policy or grant change. The guard asserts presentation is never used as authorization and that no service-role client appears in the new feature.
**Migration verification.** None. **Budget unchanged.**
**Browser/Playwright.** `e2e/accessibility.spec.ts` extended with the new card states — runs in CI's `database` job on desktop and Pixel 7.
**Real device / AT.** **Optional**, not required for this slice; if not run, recorded as not proved.

**Acceptance criteria.** The vocabulary is closed and server-decided. No read-only card can mutate, proved by a guard that fails against a planted violation. `chat` is governed and masks in place. `OD-2K-2` is signed and its choice is implemented. `sensitivity-boundary.test.ts` and `locale-ternary-guard.test.ts` green.

**Stopping condition.** Stop before writing the excerpt handling if `OD-2K-2` is unsigned — `2K-PRIVACY-003/004` are **blocked**, not gated.
**Rollback.** Additive feature plus one additive vocabulary row; revert the commit. No data migration, nothing to undo in the database.
**Order.** Branch → tests first → implementation → focused → full → diff review → commit → push → PR → CI → merge. No deploy.

---

## Slice 2K.2 — Confirm, edit, discard, result, undo

**Objective.** Make every card's outcome truthful and reversible where the domain truly permits, and give a confirmed memory the undo it has never had.

**Dependencies.** 2K.1. **Requirements:** `2K-ACT-001..009`.

**Expected files**
- Create: `src/features/conversation-cards/editable-parameters.ts` + test — the closed per-action editable set; free-text patch editing refused.
- Create: `src/features/memories/undo.ts` + `undo.test.ts` — domain-appropriate reversal via the existing audited lifecycle transition.
- Modify: `src/features/memories/actions.ts` — the conversational undo action; **no new column, no new RPC, no migration**.
- Modify: `src/features/memories/memory-proposal-card.tsx` — honest asymmetric preview, staleness witness, accurate reversibility disclosure.
- Modify: `src/features/assistant/actions.ts` — route the edit/discard/undo intents; the intent list stays a closed, validated vocabulary.
- Modify: `src/features/assistant/composer-state.ts` — extend the declared intents.
- Modify: `src/features/conversation-cards/contracts.ts` — bind reversibility to the card's own value.
- Create: `supabase/tests/phase_2k_memory_undo.sql` — pgTAP: the reversal is owner-scoped, audited, and refuses a foreign row.
- Modify: `e2e/accessibility.spec.ts` — confirm/edit/discard/undo controls.

**Interfaces.** Consumes: the 2K.1 card contract, `setMemoryLifecycle`'s audited transition, `buildApplyPayload`, `requireApplicableSession`. Produces: the edit-and-re-fingerprint contract 2K.3 depends on.

**Tests first**
1. Editing a parameter **re-derives and re-fingerprints**; applying under the pre-edit fingerprint is refused.
2. A confirmation that no longer matches current state resolves `expired` and **no write occurs**.
3. Discard writes nothing and leaves no intent record.
4. Memory undo reverses the confirmed create, is audited, and is refused for a foreign row (pgTAP, with a positive control on an owned row).
5. A memory card does **not** display a 24-hour undo affordance, because it does not have one.
6. Results distinguish applied / no-change / refused / retryable-failure / terminal-failure, exhaustively.

**Focused gate.** `npx vitest run src/features/conversation-cards src/features/memories src/features/assistant` and `npx supabase test db` for the new pgTAP file.
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; plus `src/features/task-commands` in full, to prove the mature pipeline is untouched.
**UX/mobile gate.** Confirm, edit, discard and undo reachable by thumb at Pixel 7 width; no hover dependency; both locales.
**Security/RLS/grants.** pgTAP proves owner-scoping with a positive control so the denial is not vacuous. No grant change. Memory writes remain plain client writes under forced RLS with an explicit `user_id` predicate.
**Migration verification.** None. **Budget unchanged.** The plan explicitly refuses to register a handler in `undo_operation`, which would cost a migration.
**Browser/Playwright.** Accessibility lane extended. An authenticated journey confirming a memory and undoing it from the conversation is written here and **executed in 2K.8**, where the online lane runs.
**Real device / AT.** **Not proved** in this slice; declared.

**Acceptance criteria.** Edit re-fingerprints. Expired never writes. Memory undo works, is audited, is owner-scoped, and is disclosed accurately as not a deletion. Task pipeline behaviour is unchanged, proved by its own suite. `OD-2K-1` and `OD-2K-3` are signed.

**Stopping condition.** Stop if `OD-2K-3` is unsigned — archive-versus-remove changes what the undo *means*, and shipping either silently would be the product deciding a semantic the owner reserved.
**Rollback.** Behavioural but reversible by revert; no schema change, so no data to migrate back.
**Order.** As 2K.1. No deploy.

---

## Slice 2K.3 — Continuity by server re-derivation

**Objective.** Let a user open a cited source and come back without losing the pending action — by re-deriving it, never by restoring it.

**Dependencies.** 2K.1, 2K.2. **Requirements:** `2K-CONT-001..008`.

**Expected files**
- Create: `src/features/conversation-cards/continuity.ts` + `continuity.test.ts` — the closed identifier-only payload schema, its parser, and the re-derivation request contract.
- Create: `src/lib/closeout/phase-2k-continuity-guard.test.ts` — structural: the payload carries no confirmation id, operation key, patch, fingerprint or mutation payload.
- Modify: `src/app/[locale]/app/chat/[conversationId]/page.tsx` — per-message anchors and stable identity; **this is the one place the single-expression render is decomposed**, minimally, because continuity needs a position to return to.
- Modify: `src/features/assistant/assistant-composer.tsx` — restore the card's visual reference and request re-derivation.
- Modify: `src/features/assistant/actions.ts` — the re-derivation entry point.
- Modify: `src/features/task-commands/session.ts` — only if re-derivation across a navigation needs an explicitly declared entry point; **`TASK_COMMAND_SESSION_VERSION` is bumped if the envelope shape changes at all**.
- Modify: `e2e/accessibility.spec.ts` — the restored and expired states.

**Interfaces.** Consumes: `parseTaskCommandSession`, `deriveTaskCommand`, `withStalenessWitness`, `requireApplicableSession`, `staleShell`, `assertActiveAccount`. Produces: the continuity contract later phases may consume.

**Tests first**
1. The continuity payload schema is a closed set of identifiers; a planted confirmation id fails the guard.
2. Returning re-derives: the same builder is called as on first render, and **no stored computed preview exists to restore**.
3. Mutating the target row between departure and return yields `expired` **and no write**.
4. No path auto-reapplies on return.
5. A handle for another owner's object, a deleted object, and a suspended account all produce **byte-identical** `unavailable` output.
6. If the envelope shape changed, an envelope minted at the previous version is refused rather than best-effort read.

**Focused gate.** `npx vitest run src/features/conversation-cards src/features/assistant src/features/task-commands/session.test.ts src/lib/closeout/phase-2k-continuity-guard.test.ts`
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
**UX/mobile gate.** The full round trip — answer → open source → return → expired → re-confirm — at Pixel 7 width, both locales, with focus landing deliberately once.
**Security/RLS/grants.** T-2K-02 and T-2K-08 are the slice's central threats. The guard proves the handle cannot authorize. The unavailable-state test proves it is not an existence oracle. No grant change.
**Migration verification.** None — **OD-2K-D forbids persisting pending confirmations.** Budget unchanged.
**Browser/Playwright.** A local Playwright journey covering the round trip on desktop and Pixel 7, in CI's `database` job.
**Real device / AT.** **Not proved**; declared.

**Acceptance criteria.** Return re-derives and never restores. Expired is reported and never applied. The payload is provably incapable of authorizing. The three unavailable causes are indistinguishable. No migration spent.

**Stopping condition.** Stop if re-derivation cannot reproduce an identical fingerprint for an unchanged object — that would mean the pinned-clock property is broken, which is a defect in a shipped invariant and outranks this slice.
**Rollback.** Revert; no schema change.
**Order.** As 2K.1. No deploy.

---

## Slice 2K.4 — Sources per answer

**Objective.** Make the answer say what it used, how fresh it is, what kind of support it is, when it has none, and how far it can actually see.

**Dependencies.** 2K.0 (measurement 2), 2K.1. **Requirements:** `2K-SRC-001..008`, and `2K-PRIVACY-003/004` land here if `OD-2K-2` chose render-time re-reading.

**Expected files**
- Create: `src/features/conversation-sources/contracts.ts` + test — the support-kind vocabulary (`direct_record`, `product_state`, `inference`), the source view shape, the reach statement.
- Create: `src/features/conversation-sources/copy.ts` + test — both locales.
- Create: `src/features/conversation-sources/source-list.tsx` + test.
- Create: `src/lib/closeout/phase-2k-answer-contract-guard.test.ts` — structural: the answer schema carries **no** action, command, patch or mutation field; no card is producible from retrieved content.
- Modify: `src/features/chat/actions.ts` — carry `occurredAt` and the support kind into the persisted citation; apply the `OD-2K-2` excerpt choice; emit the insufficiency signal.
- Modify: `src/app/[locale]/app/chat/[conversationId]/page.tsx` — render sources, freshness, support kind, insufficiency and reach.
- Modify: `src/lib/ai/chat-schema.ts` — **only** if the support kind must be provider-declared; the default is to derive it server-side, which needs no schema change and keeps the model unable to widen its own authority.
- Modify: `e2e/accessibility.spec.ts` — the source block and the insufficiency state.

**Interfaces.** Consumes: `match_internal_knowledge` output, `memoriesInForce`, `presentationFor`. Produces: the source-provenance contract 2K.5 consumes.

**Tests first**
1. A zero-source answer renders the insufficiency state and is visually distinct from an evidenced one.
2. Support kind is assigned for every rendered source, from a closed vocabulary.
3. Freshness renders from `occurred_at` and is absent — not fabricated — when the value is missing.
4. Fabricated ids are still stripped, degrading to a missing citation rather than an error (regression over existing behaviour).
5. The answer contract carries no action field; an injection-shaped source produces **no** card.
6. A source reclassified `highly_sensitive` after the answer was stored is not rendered in the clear.

**Focused gate.** `npx vitest run src/features/conversation-sources src/features/chat src/lib/closeout/phase-2k-answer-contract-guard.test.ts`
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; plus `src/lib/ai` in full if `chat-schema.ts` is touched.
**UX/mobile gate.** Source list legible and tappable at Pixel 7 width; masked sources revealable locally; both locales.
**Security/RLS/grants.** T-2K-03 and T-2K-05 are central. No grant change.
**Migration verification.** None. Budget unchanged.
**Browser/Playwright.** Accessibility lane extended; an authenticated sources journey written here, **executed in 2K.8**.
**Real device / AT.** **Not proved**; declared.

**Acceptance criteria.** Every answer states what it used or that it had nothing. Freshness and support kind render. Reach is disclosed. The answer path provably cannot emit an action. The post-hoc reclassification test passes.

**Stopping condition.** Stop the excerpt work if `OD-2K-2` is unsigned; the rest of the slice may proceed.
**Rollback.** Revert. If the `OD-2K-2` choice was "store no excerpt", already-stored excerpts are untouched by the revert and remain a named residual.
**Order.** As 2K.1. No deploy.

---

## Slice 2K.5 — How the Brain reached this

**Objective.** Surface the two exclusions and the freshness the system already computes and discards — without leaking existence and without exposing model reasoning.

**Dependencies.** 2K.4. **Requirements:** `2K-EXPL-001..007`.

**Expected files**
- Create: `src/features/conversation-sources/explanation.ts` + test — the bounded disclosure payload.
- Create: `src/features/conversation-sources/explanation-panel.tsx` + test — progressive disclosure, collapsed by default.
- Create: `src/lib/closeout/phase-2k-disclosure-guard.test.ts` — structural, modelled on `phase-2i-search-guard.test.ts:119`: the payload contains no `hiddenCount`/`excludedCount`/`sensitiveCount`/`hasHidden`/`omitted`-shaped field, and no prompt, reasoning or score field.
- Modify: `src/features/chat/actions.ts` — carry the two exclusion facts instead of discarding them.
- Modify: `src/features/conversation-sources/copy.ts` — disclosure copy, both locales.
- Modify: `e2e/accessibility.spec.ts` — the expanded and collapsed panel.

**Interfaces.** Consumes: the similarity floor result and `memoriesInForce`'s exclusion set. Produces: nothing later slices depend on.

**Tests first**
1. Sub-threshold exclusion is disclosed as a bounded statement, **never** a count and never a score.
2. Owner-archived exclusion is disclosed.
3. A sensitivity exclusion produces output **byte-identical** to the source's simple absence.
4. The payload contains no prompt, no reasoning trace, no score.
5. The panel is collapsed by default and never blocks the answer.

**Focused gate.** `npx vitest run src/features/conversation-sources src/features/chat src/lib/closeout/phase-2k-disclosure-guard.test.ts`
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
**UX/mobile gate.** Panel expandable and readable at Pixel 7 width; keyboard-operable disclosure; both locales.
**Security/RLS/grants.** T-2K-04 is the slice's central threat. No grant change.
**Migration verification.** None. Budget unchanged.
**Browser/Playwright.** Accessibility lane extended.
**Real device / AT.** **Not proved**; declared.

**Acceptance criteria.** Both exclusions disclosed within their limits. Sensitivity exclusions provably invisible. No reasoning exposed. If interpretation-correction has no domain effect this phase, that is **declared**, not implied.

**Stopping condition.** Stop if disclosure cannot be made byte-identical for sensitivity exclusions — an oracle is worse than no explanation.
**Rollback.** Revert; additive surface.
**Order.** As 2K.1. No deploy.

---

## Slice 2K.6 — Contextual suggestions

**Objective.** Replace one hard-coded example with at most three deterministic, state-derived suggestions that cost nothing.

**Dependencies.** 2K.1. **Requirements:** `2K-SUGG-001..005`.

**Expected files**
- Create: `src/features/conversation-cards/suggestions.ts` + test — deterministic derivation, hard cap of three.
- Create: `src/lib/closeout/phase-2k-suggestion-guard.test.ts` — structural: the module constructs no AI provider, calls no `recordAIUsage`, and requests no rate-limit slot.
- Modify: `src/app/[locale]/app/chat/page.tsx` — remove the hard-coded example **and its inline locale ternary**; render suggestions.
- Modify: `src/features/assistant/copy.ts` — suggestion copy, both locales.
- Modify: `e2e/accessibility.spec.ts` — the suggestion row.

**Interfaces.** Consumes: state the surface already loads. Produces: nothing later slices depend on.

**Tests first**
1. At most three suggestions, always, including when more candidates qualify.
2. The module constructs no provider and records no AI usage (structural guard, planted violation proves it fires).
3. The empty state no longer contains the hard-coded string or an inline locale ternary.
4. Suggestion telemetry carries a bounded category and no suggestion text.

**Focused gate.** `npx vitest run src/features/conversation-cards/suggestions.test.ts src/lib/closeout/phase-2k-suggestion-guard.test.ts`
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; `locale-ternary-guard.test.ts` must be green.
**UX/mobile gate.** Suggestions tappable at Pixel 7 width, not pushing the composer below the fold; both locales.
**Security/RLS/grants.** No provider call means no BYOK spend and no rate-limit interaction. No grant change.
**Migration verification.** None. Budget unchanged.
**Browser/Playwright.** Accessibility lane extended.
**Real device / AT.** **Not proved**; declared.

**Acceptance criteria.** Three maximum, deterministic, zero-cost, no content in telemetry, ternary removed. `OD-2K-4` signed.

**Stopping condition.** Stop if a useful suggestion set cannot be derived deterministically — a model call is out of boundary, and shipping a decorative wall is explicitly rejected scope.
**Rollback.** Revert; the previous empty state returns.
**Order.** As 2K.1. No deploy.

---

## Slice 2K.7 — REMOVED

**Not implemented.** Removed from implementation scope by **OD-2K-A**.

**Why.** ADR-055 forbids `source_type` widening, backfill, pipelines, job types and indexes until an evidence threshold is met; the funnel is empty; and `phase-2i-search-guard.test.ts` fails the build if the search feature gains embeddings, vector operators, similarity or generated answers. Semantic retrieval over entries and memories already ships and is the phase's baseline.

**What survives, and where.** The ADR-055 expiry decision is `2K-AUDIT-004..006` in slice 2K.0. Claim-binding to sources is already `baseline` and is re-proved by `2K-SRC-002`. Reach disclosure — telling the user the retrieval actually covers records and memories — is `2K-SRC-006`.

**The spike.** ADR-055's own offline replay spike remains permitted by ADR-055. It is **not** a closing requirement of Phase 2K, **not** an implementation of 2K.7, authorizes no infrastructure, and may run only under a later or specific authorization.

**Classification at close.** Every 2K.7 candidate requirement closes `not-built-by-rule`, naming ADR-055 and OD-2K-A.

---

## Slice 2K.8 — Accessibility, mobile, telemetry, security and closeout

**Objective.** Prove the phase, measure it without content, and close every requirement from executed evidence.

**Dependencies.** All. **Requirements:** `2K-A11Y-001..007`, `2K-METRICS-001..008`, `2K-CLOSE-001..006`.

**Expected files**
- Modify: `src/features/product-analytics/contracts.ts` — the Conversar surface value and event names, in the canonical vocabulary source.
- Modify: `src/features/product-analytics/contracts.test.ts`.
- Create: `scripts/phase-2k-conversation-funnel-reader.mjs` — the **consumer**, RLS-scoped.
- Create: `src/lib/closeout/phase-2k-telemetry-guard.test.ts` — payload shape: every property a closed enum or boolean; no key can hold free text.
- Create: `src/lib/closeout/phase-2k-traceability.test.ts` — the refusal-mode traceability guard.
- Create: `scripts/generate-phase-2k-traceability.mjs`.
- Modify: `supabase/tests/post_2j_product_event_write_path.sql` — **extended, not duplicated**, to derive Phase 2K's names from the CHECK and write each through the real public writer.
- Modify: `e2e/accessibility.spec.ts` — final surface sweep.
- Create (**only under separate authorization**): one migration extending the `product_events` event-name CHECK and re-declaring `private.validate_product_event_properties`.
- Create after execution: `PHASE_2K_SLICE_0X_ACCEPTANCE.md` files, `PHASE_2K_TRACEABILITY_MATRIX.md`, `PHASE_2K_REPORT.md`.

**Interfaces.** Consumes: every prior slice. Produces: the traceability matrix, the closing report, and named residuals.

**Tests first**
1. The vocabulary is **derived** from the canonical source; a planted divergence fails.
2. Every declared name is written through the **real** public writer; set-difference assertions in both directions.
3. **Negative controls:** an undeclared event name and an undeclared property are each refused.
4. **Non-vacuity:** accepted events return a non-null id — the fixture must not be able to pass by writing nothing.
5. The payload guard: no key can hold a query, title, filename, excerpt or transcript.
6. The traceability guard refuses: unclassified requirement, duplicate id, PRD requirement missing from the plan, nonexistent evidence, classification incompatible with evidence, baseline without proof, partial without remainder, not-built without a rule, undelivered without destination, migration or event pinned to a superseded file, acceptance record created before execution.

**Focused gate.** `npx vitest run src/features/product-analytics src/lib/closeout/phase-2k-telemetry-guard.test.ts src/lib/closeout/phase-2k-traceability.test.ts`; `npx supabase test db`.
**Full relevant gate.** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; the whole `src/lib/closeout` suite; CI's three jobs green on the PR head.
**UX/mobile gate.** Full accessibility sweep over every Phase 2K surface at desktop and Pixel 7, both locales.
**Security/RLS/grants.** The consumer is RLS-scoped with no service-role path. Producer → writer → RLS consumer proved end to end. Privilege negatives: unauthorized callers refused.
**Migration verification (if the migration is authorized and applied).** Exact merged bytes; chain order; local = remote parity re-proved by `npx supabase migration list --linked`; both live gates verified — table CHECK **and** `validate_product_event_properties`; negative controls on the deployed database; **zero fixture residue proved**; the `202608080087` failure explicitly re-checked, since that defect was a third vocabulary copy nobody knew existed.
**Browser/Playwright.** The authenticated journeys written in 2K.2 and 2K.4 are **executed here**: card confirm/undo, sources, and the continuity round trip, desktop and Pixel 7.
**Real device / AT.** The screen-reader session is **manual**. It is recorded as executed with its result, or closed as an **evidenced negative**. It is never inferred from an axe pass.

**Acceptance criteria.** Every requirement classified exactly once from executed evidence, zero unclassified. Every partial names its remainder; every undelivered names an owner and destination. Budget reconciled per slice. ADR-055's status restated. Rollout gate restated as untouched. Real-device and AT checks labelled executed, skipped or failed.

**Stopping condition.** Stop before deploying if hosted parity cannot be proved, or if any negative control or non-vacuity proof fails. A telemetry vocabulary that cannot prove it reaches the real writer is not delivered — that is the exact lesson of `202608080087`.
**Rollback.** The migration is additive (widening a CHECK and re-declaring a validator). Rollback is a forward corrective migration, not an edit; migrations are append-only.
**Order.** Branch → tests first → implementation → focused → full → diff review → commits → push → PR → **CI green on the PR head** → merge review → merge → **CI green on the exact merge SHA** → **only then**, and only under separate deployment authorization, `npx supabase db push` → hosted verification → acceptance record.

---

## 2. Cross-slice gates

| Gate | When | Content |
|---|---|---|
| **G0 preflight** | Every slice | Correct repo, branch, clean worktree, fetched remote, exact base/head, no unrelated changes |
| **G1 current truth** | 2K.0 | Audit cites exact routes, components, actions, RPCs, tables, policies, migrations, tests, hosted probes |
| **G2 reconciliation** | Done | Every candidate requirement classified in the audit's §6 table |
| **G3 owner decisions** | Per slice | A blocked slice does not start; a gated slice does not close |
| **G4 planning convergence** | Before authorization | PRD, threat model, traceability contract, gaps, plan, metrics, exclusions and budget agree |
| **G5 implementation authorization** | Before 2K.1 | Explicit owner approval after review of this package |
| **G6 slice acceptance** | Per slice | Focused + full gates, diff review, acceptance evidence, before the next slice starts |
| **G7 independent closeout** | 2K.8 | Classification from executed evidence; a limitation is never upgraded to a pass |
| **G8 hosted parity** | 2K.8, only if a migration is authorized | Exact bytes, chain order, both live gates, negative controls, producer→consumer, zero residue |
| **G9 successor review** | After close | Re-audit the roadmap successor, present amendments, **stop** for owner authorization |

## 3. Risks

| Risk | Mitigation |
|---|---|
| ADR-055 expires mid-phase unresolved | 2K.0 is first and its ADR is a closing requirement of that slice, not of the phase |
| `OD-2K-2` unsigned blocks two slices partially | 2K.1 and 2K.4 both proceed on their non-excerpt requirements; only `2K-PRIVACY-003/004` block |
| Sharing a grammar flattens distinct outcomes | `2K-CARD-002` keeps state server-decided; exhaustive rendering tests |
| Continuity handle drifts toward a bearer token | `2K-CONT-003` structural guard with a planted violation |
| Telemetry lands with a producer and no consumer | `2K-METRICS-007`; SH.6 shipped exactly that failure |
| A third vocabulary copy appears again | `2K-METRICS-004/005` audit **all** live enforcement points and write through the real writer |
| Budget pressure past one migration | Three known pressures pre-excluded in the PRD; reconciliation per slice |
| Accessibility deferred to closeout again | Lane extended **inside** each slice; Phase 2I's failure is the precedent |
| Estimate exceeds the roadmap's 9–13 weeks | Stated openly: 11–15 weeks. Slices are independently closeable, so the phase can be stopped between them |

## 4. What this plan does not authorize

Implementation, product code, creating or applying a migration, deployment, opening signup, executing rollout residuals, running the ADR-055 spike, or planning or starting any successor phase.
