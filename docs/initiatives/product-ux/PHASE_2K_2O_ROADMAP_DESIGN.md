# Roadmap Design — Phases 2K–2O

**Status:** design approved for documentation; no phase is authorized for planning or implementation by this file.

**Governing product document:** `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`

**Current baseline:** Phase 2J is complete, the post-2J product-event writer correction is deployed through migration `202608080087`, and no successor phase is currently authorized.

## 1. Purpose

This document decomposes the remaining product roadmap into five independently reviewable phases. It gives future workers visibility into the intended destination without treating future scope as approved, stable, or ready to implement.

The operating rule is:

> Close the current phase, audit the live product again, review and amend the next phase, obtain explicit owner authorization, and only then begin that next phase.

The roadmap is directional. Current code, current hosted state, migrations, permanent decisions, and newly collected user evidence outrank assumptions recorded here.

## 2. Sequencing decision

The original Etapa 4 combines work management, calendar, daily planning, reviews, and notifications. That surface is too broad for one closeable phase. It is therefore split into two phases:

- Phase 2L owns task execution and work views.
- Phase 2M owns calendar, planning rituals, reviews, and useful mobile notifications.

The remaining mapping is one product stage per phase:

| Phase | Parent scope | Product outcome | Planning estimate |
|---|---|---|---:|
| 2K | Etapa 3 | Conversar becomes the primary, sourced and actionable interface | 9–13 weeks |
| 2L | Etapa 4, slices 4.1–4.3 | Work becomes fast to edit, organize, and operate on mobile | 5–7 weeks |
| 2M | Etapa 4, slices 4.4–4.7 | Calendar and daily/weekly rituals become one coherent flow | 7–10 weeks |
| 2N | Etapa 5 | People, projects, memories, files, and relations become understandable context | 13–18 weeks |
| 2O | Etapa 6 | A new user reaches value quickly and controls personalization, cost, and privacy | 7–10 weeks |

Sequential planning range: **41–58 weeks**. This is not a delivery promise. Every phase must be re-estimated from its current-experience audit before implementation authorization.

## 3. Phase 2K — Conversar as the primary interface

**Priority:** P0, strategic focus.

**Depends on:** completed Phases 2I and 2J.

**Goal:** let a user ask, understand, decide, and act without losing the conversational context or trusting an unsupported answer.

### Candidate slices

1. **2K.0 — Current-experience audit and signed decisions**
   - Reconstruct the current chat, command, confirmation, source, search, and task flows from code and hosted behavior.
   - Classify every parent requirement as built, baseline, partial, absent, contradicted, or not buildable under current constraints.
   - Resolve action-card authority, undo semantics, source visibility, sensitive-content handling, and model/cost policy before implementation.

2. **2K.1 — Action-card contract and read-only previews**
   - Previews for tasks, entries, memories, people, projects, and candidate choices.
   - No mutation until the user confirms an explicit, typed action.
   - One visual grammar for pending, accepted, refused, failed, undone, and expired actions.

3. **2K.2 — Confirm, edit, discard, result, and undo**
   - Edit action parameters inside the card.
   - Confirm or discard without leaving the conversation.
   - Show truthful partial results and bounded undo where the underlying domain supports it.

4. **2K.3 — Conversation/product continuity**
   - Open a referenced object without losing the conversation position.
   - Restore the originating card and pending confirmation on return.
   - Define expired/stale behavior rather than silently replaying an old action.

5. **2K.4 — Sources per answer**
   - Show the personal records, memories, tasks, people, projects, and files used.
   - Distinguish direct support, product-state facts, and inference.
   - Say when personal evidence is insufficient.

6. **2K.5 — “How the Brain reached this”**
   - Progressive disclosure for interpretation, uncertainty, conflicts, excluded material, and freshness.
   - Let the user correct the source or the Brain's interpretation without exposing hidden model reasoning.

7. **2K.6 — Contextual suggestions**
   - At most three suggestions derived from the current surface and current state.
   - No decorative fixed prompt wall and no use of private content in telemetry.

8. **2K.7 — Semantic retrieval and composed answers**
   - Combine lexical, semantic, type, date, and relationship filters.
   - Bind answer claims to retrieved sources.
   - Offer reformulation or correction when retrieval confidence is weak.

9. **2K.8 — Accessibility, mobile, telemetry, and closeout**
   - Real authenticated browser journeys for cards, sources, return continuity, keyboard, focus, and narrow viewports.
   - Content-free funnel metrics.
   - Traceability matrix, threat-model closure, migration parity, and explicit residuals.

### Phase boundary

Phase 2K does not redesign Work, calendar, people/project pages, onboarding, or privacy settings. It may link to those existing surfaces and may define reusable contracts that later phases consume.

## 4. Phase 2L — Work and execution

**Priority:** P1.

**Depends on:** Phase 2K action and continuity contracts reviewed as stable.

**Goal:** make day-to-day task operation quick, comprehensible, reversible, and strong on mobile.

### Candidate slices

1. **2L.0 — Current-experience audit and signed decisions**
   - Audit all task states, commands, permissions, list projections, filters, destructive actions, bulk feasibility, and mobile behavior.
   - Decide inline-edit authority, partial bulk-result semantics, undo limits, and the canonical work-view taxonomy.

2. **2L.1 — Quick edit and task detail surface**
   - Edit title and supported properties without abandoning the list.
   - Side panel on wide screens and full-screen detail on mobile.
   - Immediate truthful feedback and bounded undo.

3. **2L.2 — Selection and bulk actions**
   - Multi-select, preview, confirmation, partial success, and per-item refusal.
   - State, deadline, priority, project, and context changes only where existing domain authority permits.

4. **2L.3 — Work views and saved intent**
   - Clear views for today, upcoming, waiting, projects, contexts, and completed/cancelled work.
   - Preserve filters and return position without inventing hidden task state.

5. **2L.4 — Mobile work interaction**
   - Thumb-reachable actions, compact controls, safe gestures, stable selection, and no hover dependency.

6. **2L.5 — Accessibility, telemetry, and closeout**
   - Authenticated desktop/mobile journeys, keyboard and focus coverage, bulk-operation safety proof, traceability, and explicit residuals.

### Phase boundary

Phase 2L does not introduce calendar synchronization, recurring notification machinery, or a new project/person context model.

## 5. Phase 2M — Calendar and rituals

**Priority:** P1 and explicitly mobile-first.

**Depends on:** Phases 2K and 2L; the audit may allow planning work to begin from stable 2L contracts, but implementation still requires 2L closeout.

**Goal:** connect commitments, tasks, daily planning, reviews, and useful notifications into one calm rhythm.

### Candidate slices

1. **2M.0 — Current-experience audit and signed decisions**
   - Audit existing event, task, review, notification, timezone, recurrence, and external-calendar capabilities.
   - Decide the authoritative calendar scope, timezone semantics, notification consent, recurrence limits, and whether any external integration remains backlog.

2. **2M.1 — Calendar surface**
   - Day/week orientation appropriate to mobile and desktop.
   - Tasks and commitments remain distinguishable.
   - Open related context without losing place.

3. **2M.2 — Daily planner**
   - Select a realistic daily focus from tasks and commitments.
   - Make overload and conflicts visible without automatic rescheduling.

4. **2M.3 — Reviews and closure**
   - Daily and weekly review flows that produce explicit, reviewable actions.
   - Carry-forward, reschedule, archive, or follow-up only through confirmed operations.

5. **2M.4 — Useful mobile notifications**
   - Opt-in, bounded frequency, quiet behavior, deep links, and actionable context.
   - No notification content that violates sensitivity policy.

6. **2M.5 — Accessibility, real-device behavior, telemetry, and closeout**
   - Timezone and boundary tests, authenticated browser journeys, real-device notification checks where applicable, content-free metrics, and explicit residuals.

### Phase boundary

External calendar providers remain backlog unless the 2M audit presents a separate owner decision and authorization. The phase must still deliver coherent value with the product's own data.

## 6. Phase 2N — People, projects, memory, and files

**Priority:** P1.

**Depends on:** sourced-answer and continuity contracts from 2K; may consume stable Work and calendar links from 2L/2M.

**Goal:** let users understand what the Brain knows about a person or project, where that knowledge came from, what conflicts, and what needs attention.

### Candidate slices

1. **2N.0 — Current-experience audit and signed decisions**
   - Audit person/project identity, mention resolution, memory lifecycle, file provenance, sensitivity, merge behavior, deletion, and graph feasibility.
   - Decide canonical identity, correction authority, conflict representation, relation provenance, and deletion propagation before schema work.

2. **2N.1 — Contextual person page**
   - Summary, recent interactions, open commitments, related records/files, provenance, and correction paths.

3. **2N.2 — Contextual project page**
   - Current state, decisions, people, tasks, files, risks, recent changes, and next actions.

4. **2N.3 — “What the Brain knows”**
   - Inspect memories with source, freshness, confidence/interpretation state, and usage visibility.
   - Correct, suppress, or remove through explicit domain operations.

5. **2N.4 — Memory conflicts**
   - Represent incompatible claims without silently choosing one.
   - Route resolvable conflicts into “Precisa de você”.

6. **2N.5 — Intelligent file Library**
   - Stronger file discovery, provenance, processing state, related context, and recovery from processing failures.

7. **2N.6 — Relationship graph**
   - Secondary exploratory tool backed by explainable, source-linked relations.
   - Never replace search, lists, or contextual pages.

8. **2N.7 — Accessibility, privacy, telemetry, and closeout**
   - Sensitive-content journeys, deletion/correction proofs, graph alternatives, mobile context pages, content-free metrics, and explicit residuals.

### Phase boundary

The graph is not the primary navigation model. Phase 2N must not create inferred relationships that users cannot inspect, trace, correct, or remove.

## 7. Phase 2O — Activation, preferences, and control

**Priority:** P1 before broad public opening.

**Depends on:** stable core experience from Phases 2K–2N. The phase must be re-scoped against the actual public-signup readiness posture at that time.

**Goal:** help a new user reach a first meaningful result quickly and understand how to control personalization, AI access, cost, and privacy.

### Candidate slices

1. **2O.0 — Current-experience audit and signed decisions**
   - Audit signup readiness, first session, BYOK, language/timezone, empty states, privacy controls, account lifecycle, cost visibility, and mobile installation/adoption.
   - Decide the first-conquest definition, required versus deferrable setup, defaults, and public-opening boundary.

2. **2O.1 — Onboarding by first conquest**
   - Lead to one useful capture, retrieval, plan, or conversation rather than a settings questionnaire.
   - Progressive setup with truthful blocked states for missing provider credentials.

3. **2O.2 — Progressive personalization**
   - Ask preferences only when their value is visible.
   - Explain and allow reversal of personalization choices.

4. **2O.3 — Privacy, AI access, and cost control**
   - Understandable controls for sensitive content, memory use, retention posture, account deletion, BYOK, usage, and unpriced operations.
   - No claim that an unscheduled retention mechanism is actively enforcing deletion.

5. **2O.4 — Mobile activation polish**
   - Installability guidance where supported, keyboard/viewport resilience, permission timing, interruption recovery, and first-week return paths.

6. **2O.5 — Accessibility, activation metrics, readiness, and closeout**
   - Real-device and assistive-technology checks, content-free activation funnel, rollout-gate reconciliation, and explicit owner signatures.

### Phase boundary

Phase 2O does not itself authorize public signup. Signup opening remains a separate owner-controlled rollout decision whose existing gates must all be satisfied.

## 8. Mandatory lifecycle for every phase

Each phase must use the following order. Later steps cannot retroactively authorize earlier ones.

1. **Owner authorizes planning only.**
2. **Current-experience audit** proves what exists in code, migrations, hosted state, and permanent docs.
3. **Parent-roadmap reconciliation** records requirements removed, narrowed, expanded, contradicted, or already baseline.
4. **PRD** declares requirement families, UX contracts, exclusions, metrics, and owner decisions.
5. **Threat model and traceability contract** are written independently enough to catch unsupported claims.
6. **Implementation plan** divides the phase into closeable slices with gates and an explicit migration budget.
7. **Owner resolves decisions and authorizes implementation.**
8. **One slice at a time:** implement, test, review, merge, and record acceptance before advancing.
9. **Closeout:** all requirements classified as built, baseline, partial, not built by rule, or undelivered; no unclassified row is allowed.
10. **Deploy and prove hosted parity** only when authorized and applicable.
11. **Residuals remain named** with an owner, destination, and reason.
12. **Next-phase review:** audit the next phase against the newly closed product, propose amendments and estimate changes, and stop for owner approval.

## 9. Standard planning package

The planning worker should follow the 2I/2J artifact pattern without copying stale conclusions:

- `docs/initiatives/phase-2x/PHASE_2X_PRD.md`
- `docs/initiatives/phase-2x/PHASE_2X_IMPLEMENTATION_PLAN.md`
- `docs/reports/phase-2x/PHASE_2X_CURRENT_EXPERIENCE_AUDIT.md`
- `docs/reports/phase-2x/PHASE_2X_UX_GAPS_AND_OPPORTUNITIES.md`
- `docs/reports/phase-2x/PHASE_2X_THREAT_MODEL.md`
- `docs/reports/phase-2x/PHASE_2X_TRACEABILITY_CONTRACT.md`
- per-slice acceptance records created only as slices are actually accepted;
- final traceability matrix and phase report created from executed evidence, not predicted during planning.

Planning may update permanent roadmap/backlog/decision indexes only where the repository's current governance requires it. It must not create implementation files, migrations, acceptance reports, deployment claims, or a successor-phase authorization.

## 10. Cross-phase product constraints

- Mobile usability is an acceptance criterion, not a final polish pass.
- UX copy and failure states must be understandable without engineering vocabulary.
- Sources and explainability are product requirements wherever the Brain composes or infers an answer.
- User text is never telemetry.
- Sensitive content must have an explicit, consistent policy across every new surface.
- No hidden mutation, silent conflict resolution, automatic destructive action, or fake success.
- Preview and explicit confirmation precede consequential AI-proposed actions.
- Existing domain write paths and authorization boundaries are reused unless an owner-approved decision changes them.
- Every schema addition needs a proved product need, a migration budget, RLS/grant verification, and hosted parity evidence.
- No durable voice audio.
- Original voice flow remains recording → transcription → editable continuation → explicit confirmation.
- External integrations remain backlog unless separately authorized.
- Demo mode remains rejected.
- The graph remains secondary.
- Public signup remains controlled by the rollout gates, not by roadmap completion language.

## 11. Re-review contract between phases

Closing a phase does not make the next phase's candidate slices current truth. Before each successor begins, the worker must present:

1. what the previous phase changed that the roadmap did not anticipate;
2. which successor requirements are already built or baseline;
3. which requirements are no longer desirable or conflict with current decisions;
4. newly discovered product, privacy, cost, or migration decisions;
5. a revised slice order, estimates, and migration budget;
6. an explicit list of residuals inherited from earlier phases and whether they belong in the successor;
7. a stop requesting owner approval for the revised planning scope.

The review may shrink, split, reorder, or reject future scope. It may not silently expand implementation authority.

## 12. Success definition for this roadmap

This roadmap succeeds when:

- Conversar supports sourced, explainable, reviewable actions.
- Work is fast and reliable on mobile.
- Calendar and rituals help the user plan without creating automation surprises.
- People, projects, memories, and files expose useful, correctable context.
- New users reach value quickly and understand control, cost, and privacy.
- Each phase remains independently traceable, testable, deployable, and stoppable.

Completion of this design document does not satisfy any of those outcomes. It only defines how the remaining work will be reviewed and decomposed.
