# Phase 2C — Editable Candidate Tasks and Transactional Materialization — Closeout Report

Phase 2C is complete through Slice 2C.6. This report is the phase-level handoff. It is authoritative for the completed behavior; per-slice execution evidence remains in `docs/reports/PHASE_2C_SLICE_0*_REPORT.md`, and the full requirement mapping is in `docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md`.

## Completion decision

Phase 2C delivers editable AI task candidates with transactional, provenance-bearing, idempotent, undoable, owner-safe materialization, plus planning/priority semantics, owned relations, candidate dispositions, and a subtask/dependency graph — each as an additive, versioned confirmation contract that never rewrites the immutable suggestion or the earlier RPC versions. Slice 2C.6 reconciles the daily surfaces, produces the closeout evidence, and closes the phase. One sub-epic (split/merge, `2C-STRUCTURE-004`) is deliberately deferred as a non-blocking follow-up (GitHub issue #8) because it has no product-defined command/field/UX shape.

## Slice and merge inventory

| Slice | Scope | Confirmation RPC | Migrations | Merge |
| --- | --- | --- | --- | --- |
| 2C.1 | Editable core confirmation (title, description, due date) | `confirm_entry_task_candidates_v2` | `202607190032`–`202607190033` | PR #2 |
| Issue #3 | Editable-candidate analytics (events + counts) | — | `202607210034`–`202607210035` | PR #4 |
| 2C.2 | Planning, priority, no-due semantics | `confirm_entry_task_candidates_v3` | `202607210036`–`202607210037` | PR #5 |
| 2C.3 | Owned relations (project/context/person/waiting-on) | `confirm_entry_task_candidates_v4` | `202607220038`–`202607220039` | PR #6 |
| 2C.4 | Candidate dispositions (confirmed/rejected/retained/dismissed) | `confirm_entry_task_candidates_v5` | `202607220040`–`202607220043` | PR #7 |
| 2C.5 | Subtasks and dependencies (graph materialization) | `confirm_entry_task_candidates_v6` | `202607220044`–`202607220045` | PR #9 |
| 2C.6 | Product convergence and closeout | — (no RPC/migration) | — | branch `codex/phase-2c-slice-6` (local) |

Migration parity is exact and additive through `202607220045`. Every confirmation RPC version (v2–v6) and the legacy base RPC remain present and callable; no applied migration was ever edited.

## Delivered behavior (by epic)

- **2C-A — Editable core confirmation:** transient title/description/due-date edits over the immutable candidate; reset omits the field; explicit clear persists `null`; strict timezone-aware due-date conversion; atomic multi-candidate materialization with canonical-fingerprint idempotency and a correction-vs-confirmation race guard.
- **2C-B — Planning/priority/no-due:** `plannedAt`, `manualPriority`, `intentionalNoDue`, `noDueReason` with explicit null/omitted/reset semantics, database-enforced due/no-due consistency, and Work/Needs Attention convergence.
- **2C-C — Owned relations:** project/context/person/waiting-on attached by owned ID only, cross-owner input aborts the whole transaction, reusing the existing junction tables.
- **2C-D — Candidate dispositions:** every current candidate moves atomically from `pending` to exactly one owner-scoped terminal outcome (`confirmed`/`rejected`/`retained`/`dismissed`) with a narrow resolution ledger, no copied candidate content, no category analytics, truthful history, Work showing only confirmed tasks, and undo restoring the candidate to pending.
- **2C-E — Structure (subtasks + dependencies):** `parentRef`/`dependsOn` closed references resolved to task ids before any edge write, owner-scoped and cycle-validated, materialized atomically in a second pass so forward references resolve. Split/merge deferred (issue #8).
- **2C-F — Convergence and closeout:** the daily surfaces, copy, analytics, remote gates, cleanup, reports, traceability, and permanent documentation agree on the completed behavior.

## Verification matrix

### Local and build (Slice 2C.6 checkpoint)

| Gate | Result |
| --- | ---: |
| Full Vitest | 85 files, 714/714 |
| ESLint / TypeScript / production build | all green |
| Offline Playwright (desktop + Pixel 7) | 6 passed / 48 online-gated skips |
| Traceability generator | 83 rows; fails closed on inventory drift |

### Remote Supabase aggregate

`npm run test:remote:2c` (deterministic, fail-fast, fail-closed cleanup): editable-candidate confirmation **29/29**, candidate-analytics product events (9 privacy/ownership/idempotency controls), and residual-data cleanup (0 disposable users, 0 orphans across 13 tables, 0 remote-smoke storage objects). The daily-cycle convergence smoke passes standalone (`npm run test:remote:daily-cycle`) with a disposition-aware concurrency-race assertion; it is intentionally kept out of the fail-fast aggregate because its needs-attention section claims an `interpret_entry` job that races the unattended queue drain.

### Database and generated schema

Migration list parity through `202607220045`; `db lint --level error` clean (two unrelated pre-existing `run_user_heartbeat` warnings only); `database.types.ts` byte-stable.

## Requirement traceability

`docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md` maps all 72 functional/non-functional requirement IDs (14 families), 6 per-epic acceptance criteria, and 5 global gates — 83 rows — each to its owning slice(s) and durable evidence. The generator (`npm run docs:phase-2c:traceability`) fails closed if the PRD inventory drifts. Two requirements are explicitly not green: `2C-STRUCTURE-004` (deferred) and `2C-UNDO-004` (resolved for `correct_entry_interpretation`; `undo_operation`'s own `40001` risk documented).

## Cleanup verification

`scripts/verify-phase-2c-cleanup.mjs` (fail-closed) asserts no disposable Auth user, no owner-orphaned row across the Phase 2C table set, and no remote-smoke storage object remains after the aggregate. It passed with an entirely clean linked project.

## Residual risks and follow-ups

- **Split/merge sub-epic (`2C-STRUCTURE-004`, issue #8):** open, deferred, non-blocking; needs a product decision on command/UX before implementation.
- **`undo_operation` `40001`:** documented non-blocking platform risk (`SECURITY.md`).
- **Docker/CI pgTAP:** run the committed suites in Docker/CI and add the DB gate to CI when Docker is available.
- **Custom SMTP:** required before production signup delivery.
- **Deployment:** Phase 2C application code and migrations `032`–`045` are merged to `main` and applied to the linked development database; production deployment/rollout follows the per-slice rollback strategy and is out of scope for this closeout.

## Independent review

The Slice 2C.6 branch diff (closeout scripts and documentation only; no product/UI/migration source) passed independent review with no Critical or Important finding. Each earlier slice was independently reviewed at its own checkpoint with no unresolved Critical/Important issue.

## Final scope statement

Phase 2C is closed. No Phase 2D (conversational pending questions), Phase 2E (natural-language task updates), or Phase 2F (launch) capability is present in this phase. No historical Phase 2X report or evidence was rewritten. The next official scope after this closeout — Phase 2D — awaits separate authorization.
