# Phases 2K–2O Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the remaining mobile-first product roadmap through five separately audited, authorized, implemented, verified, and closed phases without allowing roadmap visibility to become implicit implementation authority.

**Architecture:** This is a gated program plan, not a prediction of future code edits. Each phase begins by deriving a current-experience audit from the live repository and hosted state, then produces its own PRD and implementation plan with exact code, migration, and test files. A successor can be reviewed only after its predecessor closes, and can start only after explicit owner authorization.

**Tech Stack:** Current repository stack as proven at each phase audit; Next.js documentation bundled under `node_modules/next/dist/docs/`; TypeScript; React; Supabase/PostgreSQL/RLS; Vitest; Playwright; repository traceability and closeout tooling.

## Global Constraints

- Governing product scope: `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`.
- Governing phase design: `docs/initiatives/product-ux/PHASE_2K_2O_ROADMAP_DESIGN.md`.
- Current code, migrations, linked hosted state, and permanent decisions outrank this roadmap.
- This document does not authorize planning, implementation, migration, deployment, signup opening, or external integrations.
- Planning authorization and implementation authorization are separate owner decisions for every phase.
- Never create implementation code during the planning-only pass.
- Never begin a successor automatically after closing a phase.
- Before writing Next.js code, read the relevant current guide under `node_modules/next/dist/docs/`.
- Mobile usability, responsive behavior, touch targets, keyboard operation, focus, reduced motion, and understandable copy are acceptance criteria.
- User content, prompts, transcripts, titles, filenames, and search terms must never enter product telemetry.
- Consequential AI-proposed operations require typed previews, explicit confirmation, truthful results, and bounded undo where the domain supports it.
- Preserve existing authorization and domain write paths unless an explicit owner-approved decision changes them.
- No durable voice audio.
- External integrations remain backlog unless separately authorized.
- Demo mode remains rejected.
- Public signup remains governed by its rollout gates and owner signatures.
- Every phase ends with all declared requirements classified and no unclassified row.

---

## Program controls

### Required artifact set per phase

For phase `2X`, the planning pass must create or update only the following planning and audit artifacts:

- `docs/initiatives/phase-2x/PHASE_2X_PRD.md`
- `docs/initiatives/phase-2x/PHASE_2X_IMPLEMENTATION_PLAN.md`
- `docs/reports/phase-2x/PHASE_2X_CURRENT_EXPERIENCE_AUDIT.md`
- `docs/reports/phase-2x/PHASE_2X_UX_GAPS_AND_OPPORTUNITIES.md`
- `docs/reports/phase-2x/PHASE_2X_THREAT_MODEL.md`
- `docs/reports/phase-2x/PHASE_2X_TRACEABILITY_CONTRACT.md`
- the repository's permanent ADR/index/backlog files only where current governance requires them.

Per-slice acceptance records, the final traceability matrix, the final phase report, implementation files, migrations, and deployment records are forbidden during planning. They are created only from executed evidence at the appropriate later gate.

### Requirement classification vocabulary

Every declared requirement must end in exactly one of these states:

- `built`: new work demonstrably delivers it;
- `baseline`: current product already delivers it and evidence pins that fact;
- `partial`: a useful portion is delivered and the exact missing proof or behavior is named;
- `not-built-by-rule`: implementation would violate a signed constraint or deliberately rejected scope;
- `undelivered`: desirable, authorized scope remains absent and has an explicit destination.

`Complete`, `green`, `deployed`, and `verified` are evidence claims, not synonyms for documentation being present.

### Mandatory gates

- **G0 — preflight:** correct repository, branch, clean worktree, fetched remote, exact base/head, no unrelated changes.
- **G1 — current truth:** audit cites exact routes, components, actions, RPCs, tables, policies, migrations, tests, hosted probes, and permanent decisions.
- **G2 — reconciliation:** every parent-roadmap item is classified before the phase PRD is finalized.
- **G3 — owner decisions:** ambiguity affecting behavior, privacy, cost, destructive operations, schema, external systems, or scope stops for the owner.
- **G4 — planning convergence:** PRD, threat model, traceability contract, UX gaps, implementation slices, metrics, exclusions, and migration budget agree.
- **G5 — implementation authorization:** explicit owner approval exists after the planning package is reviewed.
- **G6 — slice acceptance:** focused tests, relevant full gates, diff review, and acceptance evidence pass before the next slice.
- **G7 — independent closeout:** all requirements are classified from executed evidence; limitations are not upgraded to passes.
- **G8 — hosted parity:** when database/runtime changes exist, exact merged bytes, chain order, negative controls, RLS/grants, producer-to-consumer behavior, and zero fixture residue are proved.
- **G9 — successor review:** the next phase is reaudited and amended, then work stops for owner authorization.

---

### Task 1: Authorize and plan Phase 2K

**Files:**
- Read: `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`
- Read: `docs/initiatives/product-ux/PHASE_2K_2O_ROADMAP_DESIGN.md`
- Read: `docs/reports/phase-2i/`
- Read: `docs/reports/phase-2j/`
- Create after planning authorization: the standard Phase 2K planning artifact set.

**Interfaces:**
- Consumes: closed Phase 2J product state and post-2J migration `202608080087`.
- Produces: an owner-reviewable Phase 2K package; it produces no implementation authority.

- [ ] **Step 1: Obtain planning-only authorization for Phase 2K**

Record the exact authorization boundary. Do not infer implementation, migration, deployment, commit, push, PR, or successor authorization.

- [ ] **Step 2: Run preflight and prove current truth**

Verify branch, HEAD, origin parity, cleanliness, current migrations, active ADR guard, CI posture, and Phase 2J residuals. Read current chat, command, confirmation, search, source, task-command, memory, person, project, AI-usage, sensitivity, and telemetry flows.

- [ ] **Step 3: Write the falsifiable Phase 2K audit**

For every candidate slice `2K.1–2K.8`, cite exact current evidence and identify baseline, absent, partial, contradicted, unsafe, or blocked behavior. Explicitly test whether current conversation features already support action previews, confirmation, continuity, sources, explanations, suggestions, and semantic retrieval.

- [ ] **Step 4: Stop for Phase 2K owner decisions**

At minimum resolve action-card mutation authority, stale/expired confirmation behavior, undo boundaries, source granularity, direct-fact versus inference presentation, sensitive-content policy, semantic-search cost/model policy, and migration budget.

- [ ] **Step 5: Produce and cross-check the Phase 2K planning package**

Declare closed requirement families, one canonical classification table, content-free metrics, threat mitigations, exact slice gates, exact expected files based on the audit, test commands, deployment rules, exclusions, and residual destinations. Run the traceability generator/guard in refusal mode before accepting it.

- [ ] **Step 6: Present planning differences and stop**

Report what the audit removed, narrowed, expanded, or reordered relative to the master roadmap. Request explicit Phase 2K implementation authorization.

---

### Task 2: Implement and close Phase 2K

**Files:**
- Modify/Create: only files named by the owner-approved `docs/initiatives/phase-2k/PHASE_2K_IMPLEMENTATION_PLAN.md`.
- Create during execution: per-slice acceptance records under `docs/reports/phase-2k/`.
- Create at closeout: Phase 2K traceability matrix and final report.

**Interfaces:**
- Consumes: owner-approved Phase 2K PRD, decisions, migration budget, and implementation plan.
- Produces: stable action-card, continuity, source, explanation, suggestion, and retrieval contracts for later phases.

- [ ] **Step 1: Execute 2K.0 evidence and guard foundations**
- [ ] **Step 2: Execute 2K.1 action-card previews**
- [ ] **Step 3: Execute 2K.2 confirmed actions, results, and bounded undo**
- [ ] **Step 4: Execute 2K.3 conversation/product continuity**
- [ ] **Step 5: Execute 2K.4 sources per answer**
- [ ] **Step 6: Execute 2K.5 understandable explanations and correction paths**
- [ ] **Step 7: Execute 2K.6 contextual suggestions**
- [ ] **Step 8: Execute 2K.7 semantic retrieval and source-bound composed answers**
- [ ] **Step 9: Execute 2K.8 accessibility, mobile, telemetry, security, and closeout**

For every step, follow the approved phase plan's test-first cycle, focused gate, full relevant gate, exact diff review, atomic commit, PR-head CI, merge review, exact-merge-SHA CI where required, authorized deployment, hosted negative controls, fixture cleanup, and acceptance record. Never claim a real-device, screen-reader, provider, latency, or hosted proof that was not executed.

- [ ] **Step 10: Reaudit Phase 2L and stop**

Compare Phase 2L candidate scope with the newly closed product. Present amendments, inherited residuals, revised estimate, proposed migration budget, and owner decisions. Do not create Phase 2L planning artifacts until planning is authorized.

---

### Task 3: Authorize and plan Phase 2L

**Files:**
- Read: Phase 2K final evidence and current Work/task implementation.
- Create after planning authorization: the standard Phase 2L planning artifact set.

**Interfaces:**
- Consumes: stable 2K action/continuity contracts and current task-domain authority.
- Produces: an owner-reviewable Phase 2L package; no implementation authority.

- [ ] **Step 1: Obtain planning-only authorization and run G0–G2**
- [ ] **Step 2: Audit task states, quick edit, detail surfaces, bulk feasibility, Work views, permissions, projections, mobile interaction, and destructive operations**
- [ ] **Step 3: Resolve inline-edit authority, partial bulk results, undo limits, canonical Work taxonomy, gesture policy, and migration budget**
- [ ] **Step 4: Produce the Phase 2L PRD, implementation plan, audit, UX gaps, threat model, and traceability contract**
- [ ] **Step 5: Present differences from the roadmap and stop for implementation authorization**

---

### Task 4: Implement and close Phase 2L

**Files:**
- Modify/Create: only files named by the approved Phase 2L implementation plan.
- Create during execution/closeout: Phase 2L acceptance and final evidence under `docs/reports/phase-2l/`.

**Interfaces:**
- Consumes: approved Phase 2L package.
- Produces: stable quick-edit, task-detail, bulk-action, Work-view, and mobile-operation contracts.

- [ ] **Step 1: Execute 2L.0 audit-derived foundations**
- [ ] **Step 2: Execute 2L.1 quick edit and responsive task detail**
- [ ] **Step 3: Execute 2L.2 selection and bulk actions with preview and partial-result truth**
- [ ] **Step 4: Execute 2L.3 Work views and return-state continuity**
- [ ] **Step 5: Execute 2L.4 mobile Work interaction**
- [ ] **Step 6: Execute 2L.5 accessibility, telemetry, security, and closeout**
- [ ] **Step 7: Reaudit Phase 2M, present amendments, and stop for planning authorization**

Apply G6–G9 exactly as defined above.

---

### Task 5: Authorize and plan Phase 2M

**Files:**
- Read: Phase 2K/2L final evidence and current calendar/review/notification/timezone behavior.
- Create after planning authorization: the standard Phase 2M planning artifact set.

**Interfaces:**
- Consumes: stable task-operation and conversation-context contracts.
- Produces: an owner-reviewable Phase 2M package; no implementation authority.

- [ ] **Step 1: Obtain planning-only authorization and run G0–G2**
- [ ] **Step 2: Audit commitments, tasks, reviews, recurrence, timezones, notifications, consent, and external-calendar boundaries**
- [ ] **Step 3: Resolve calendar authority, task/event distinction, timezone and recurrence semantics, notification consent/content/frequency, review-to-action rules, integrations boundary, and migration budget**
- [ ] **Step 4: Produce the Phase 2M planning package with real-device gates where notifications or mobile platform behavior require them**
- [ ] **Step 5: Present differences and stop for implementation authorization**

---

### Task 6: Implement and close Phase 2M

**Files:**
- Modify/Create: only files named by the approved Phase 2M implementation plan.
- Create during execution/closeout: Phase 2M acceptance and final evidence under `docs/reports/phase-2m/`.

**Interfaces:**
- Consumes: approved Phase 2M package.
- Produces: stable calendar, daily-planning, review, and notification contracts.

- [ ] **Step 1: Execute 2M.0 audit-derived foundations**
- [ ] **Step 2: Execute 2M.1 responsive calendar**
- [ ] **Step 3: Execute 2M.2 daily planner without hidden rescheduling**
- [ ] **Step 4: Execute 2M.3 daily/weekly review and confirmed closure actions**
- [ ] **Step 5: Execute 2M.4 opt-in useful mobile notifications**
- [ ] **Step 6: Execute 2M.5 timezone, accessibility, real-device, telemetry, security, and closeout gates**
- [ ] **Step 7: Reaudit Phase 2N, present amendments, and stop for planning authorization**

Apply G6–G9 exactly as defined above. External integration implementation requires a separate explicit owner authorization even if the planning audit recommends it.

---

### Task 7: Authorize and plan Phase 2N

**Files:**
- Read: Phase 2K–2M final evidence and current person/project/memory/file/relation implementation.
- Create after planning authorization: the standard Phase 2N planning artifact set.

**Interfaces:**
- Consumes: source, explanation, continuity, Work, and calendar contracts.
- Produces: an owner-reviewable Phase 2N package; no implementation authority.

- [ ] **Step 1: Obtain planning-only authorization and run G0–G2**
- [ ] **Step 2: Audit identity, mentions, entity merging, provenance, memory lifecycle, sensitivity, file processing, deletion, and graph feasibility**
- [ ] **Step 3: Resolve canonical identity, merge/split authority, correction and deletion propagation, conflict representation, inferred-relation provenance, graph limits, and migration budget**
- [ ] **Step 4: Produce the Phase 2N planning package with explicit privacy and destructive-operation gates**
- [ ] **Step 5: Present differences and stop for implementation authorization**

---

### Task 8: Implement and close Phase 2N

**Files:**
- Modify/Create: only files named by the approved Phase 2N implementation plan.
- Create during execution/closeout: Phase 2N acceptance and final evidence under `docs/reports/phase-2n/`.

**Interfaces:**
- Consumes: approved Phase 2N package.
- Produces: stable person, project, inspectable-memory, conflict, file-provenance, and relationship contracts.

- [ ] **Step 1: Execute 2N.0 audit-derived foundations**
- [ ] **Step 2: Execute 2N.1 contextual person page**
- [ ] **Step 3: Execute 2N.2 contextual project page**
- [ ] **Step 4: Execute 2N.3 inspectable and correctable “What the Brain knows”**
- [ ] **Step 5: Execute 2N.4 explicit memory conflicts and “Precisa de você” routing**
- [ ] **Step 6: Execute 2N.5 intelligent file Library**
- [ ] **Step 7: Execute 2N.6 source-linked secondary relationship graph with non-graph alternatives**
- [ ] **Step 8: Execute 2N.7 accessibility, privacy, deletion/correction, telemetry, security, and closeout**
- [ ] **Step 9: Reaudit Phase 2O, reconcile signup readiness, present amendments, and stop for planning authorization**

Apply G6–G9 exactly as defined above. No inferred fact or relationship may become untraceable or uncorrectable.

---

### Task 9: Authorize and plan Phase 2O

**Files:**
- Read: Phase 2K–2N final evidence, current onboarding/settings/BYOK/cost/privacy/account lifecycle, and the current signup rollout packet.
- Create after planning authorization: the standard Phase 2O planning artifact set.

**Interfaces:**
- Consumes: stable core product and current rollout posture.
- Produces: an owner-reviewable Phase 2O package; no implementation or signup-opening authority.

- [ ] **Step 1: Obtain planning-only authorization and run G0–G2**
- [ ] **Step 2: Audit first session, empty account, BYOK, locale/timezone, permissions, costs, unpriced operations, memory/privacy controls, deletion, installability, and public-signup gates**
- [ ] **Step 3: Resolve first-conquest definition, required versus deferrable setup, safe defaults, personalization reversibility, cost presentation, privacy language, real-device matrix, and migration budget**
- [ ] **Step 4: Produce the Phase 2O planning package without claiming public-opening readiness**
- [ ] **Step 5: Present differences and stop for implementation authorization**

---

### Task 10: Implement and close Phase 2O

**Files:**
- Modify/Create: only files named by the approved Phase 2O implementation plan.
- Create during execution/closeout: Phase 2O acceptance and final evidence under `docs/reports/phase-2o/`.

**Interfaces:**
- Consumes: approved Phase 2O package and current owner-controlled rollout gates.
- Produces: onboarding, progressive personalization, privacy/cost control, and mobile activation evidence; it does not itself open signup.

- [ ] **Step 1: Execute 2O.0 audit-derived foundations**
- [ ] **Step 2: Execute 2O.1 onboarding by first conquest**
- [ ] **Step 3: Execute 2O.2 progressive and reversible personalization**
- [ ] **Step 4: Execute 2O.3 understandable privacy, AI access, usage, and cost control**
- [ ] **Step 5: Execute 2O.4 mobile activation polish and interruption recovery**
- [ ] **Step 6: Execute 2O.5 accessibility, real-device, activation-metric, security, and closeout gates**
- [ ] **Step 7: Reconcile the completed roadmap with the independent public-signup rollout gates and stop for an owner decision**

Apply G6–G8 exactly as defined above. Do not open public signup, schedule retention, configure SMTP, sign owner attestations, or perform external rollout actions unless each action is separately and explicitly authorized.

---

## Final verification checklist

- [ ] Every parent slice from Etapas 3–6 has a final destination in 2K–2O.
- [ ] Every phase was audited after its predecessor closed.
- [ ] Every phase has separate planning and implementation authorization evidence.
- [ ] Every declared requirement is classified exactly once.
- [ ] Every partial and undelivered item names the missing evidence or behavior, owner, and destination.
- [ ] Every database phase proves local/remote parity and exact deployed bytes.
- [ ] Every consequential action proves preview, authority, confirmation, truthful result, and supported undo semantics.
- [ ] Every AI-composed answer feature proves sources, uncertainty behavior, and content-free telemetry.
- [ ] Every phase includes authenticated mobile and desktop UX evidence proportional to its surfaces.
- [ ] Real-device, assistive-technology, provider, latency, notification, and hosted checks are reported as executed, skipped, or failed—never inferred.
- [ ] No phase silently authorized its successor.
- [ ] Roadmap completion was not used as authority to open signup or activate rollout residuals.
