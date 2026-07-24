# Phase 2D — Conversational Pending Questions — Closeout Report

Phase 2D is complete through Slice 2D.6. This report is the phase-level handoff. It is authoritative for the completed behavior; per-slice execution evidence remains in `docs/reports/PHASE_2D_SLICE_0*_REPORT.md`, and the full requirement mapping is in `docs/reports/PHASE_2D_TRACEABILITY_MATRIX.md`.

## Completion decision

Phase 2D turns answering a pending question from a dead-end free-text `UPDATE` into a traceable, reversible domain transition. A pending question can now be answered in natural language or by accepting a deterministic AI-free suggestion, deferred, dismissed, or marked not relevant — each an owner-scoped, atomic, audited, undoable, idempotent resolution through one long-lived versioned `SECURITY DEFINER` RPC family (`resolve_pending_question_vN`). The user can preview a question's source and predicted effect read-only, optionally apply exactly one bounded consequence (reinterpretation, reusing the deployed reprocessing/worker path), and resolve questions from Chat and the "Precisa de você" queue under deterministic quiet-hours/cooldown discipline. The immutable interpretation stays evidence throughout; resolution never edits the AI's original question JSON. Slice 2D.6 reconciles the surfaces, produces the closeout evidence, and closes the phase.

## Slice and merge inventory

| Slice | Scope | Resolution RPC | Migrations | Merge |
| --- | --- | --- | --- | --- |
| 2D.1 | Traceable answer transition | `resolve_pending_question_v1` | `202607230046`–`202607230047` | PR #11 |
| 2D.2 | Question dispositions (defer / dismiss / not relevant) | `resolve_pending_question_v2` | `202607230048` | PR #12 |
| 2D.3 | Suggested answers and source/effect preview (read-only) | — (no RPC version) | `202607230049` (product-event allowlist) | PR #13 |
| 2D.4 | Permitted action, reinterpretation, and result | `resolve_pending_question_v3` | `202607230050`–`202607230051` | PR #14 |
| 2D.5 | Conversational surfacing (Chat + queue) and cooldown | — (no RPC/migration) | — | PR #15 |
| 2D.6 | Convergence and closeout | — (no RPC/migration) | — | branch `codex/phase-2d-slice-6` |

Migration parity is exact and additive through `202607230051`. Every resolution RPC version (`v1`–`v3`) and the legacy `answerPendingQuestion` answer path remain present and callable; no applied migration was ever edited.

## Delivered behavior (by epic)

- **2D-A — Traceable answer transition:** an open, current question is answered through a versioned `SECURITY DEFINER` RPC (not a plain `UPDATE`), with an owner lock, an anti-stale current-interpretation check, canonical replay fingerprint, and atomic `answered` + audit + undo; the immutable question JSON is never edited.
- **2D-B — Dispositions:** every open question can move atomically to exactly one of `deferred` (snoozed with a validated future instant), `dismissed`, or `not_relevant` (a distinct evidence kind over the `dismissed` status), with deterministic read-time snooze reactivation (`actionablePendingQuestionFilter` + `list_needs_attention` SQL mirror), truthful history, queue convergence, and undo to `open`.
- **2D-C — Suggested answers and preview:** bounded, closed, deduplicated suggested answers are generated deterministically from the question's leading interrogative plus the entry's owned domain context (no AI schema/worker change, safe empty fallback), populate an editable answer, and never auto-apply; a read-only source view and a closed `none`/`reinterpret` effect preview always state that nothing has been applied yet.
- **2D-D — Permitted action, reinterpretation, result:** `resolve_pending_question_v3` carries an optional closed-enum `consequence` (`none`, `reinterpret`) only on the `answer` kind; `reinterpret` reuses the deployed `enqueue_entry_reprocessing`/worker path idempotently per operation key, records three distinct replay-safe audit events, surfaces a truthful result, and is fully undoable — and the `2C-UNDO-004` hard gate is resolved (`undo_operation` `40001`→`55P03`).
- **2D-E — Conversational surfacing and cooldown:** the `conversational-questions` region panel renders open questions as untrusted-data interactive elements in Chat and the queue through the identical resolution contract; the deterministic `decideQuestionSurfacing` module honors quiet hours, `max_followups_per_day`, rolling cooldown, and `important_reminder_override`, per-user and failure-isolated, reusing the heartbeat discipline and the `notifications` ledger read-only.
- **2D-F — Convergence and closeout:** the questions page, Chat, Needs Attention, entry review, analytics, accessibility, localization, remote gates, cleanup, reports, traceability, and permanent documentation agree on the completed behavior.

## Convergence

All Phase 2D surfaces converge on the same domain behavior with no product source change required at closeout. One canonical actionable predicate (`actionablePendingQuestionFilter`, mirrored in SQL by `list_needs_attention`) defines which questions are actionable across `/questions`, the Chat/queue panel, the surfacing budget, and the Home/Inbox/review projections; one canonical `resolvePendingQuestion`/`undoQuestionResolution` contract performs every resolution and undo. A resolution on one surface converges across all others after the expected request/navigation boundary because domain state on `pending_questions` (plus append-only evidence) is the single source of truth — no client-side shadow state simulates convergence.

## Verification matrix

### Local and build (Slice 2D.6 checkpoint)

| Gate | Result |
| --- | ---: |
| Full Vitest | 902/902 (unchanged — closeout adds no product source) |
| ESLint / TypeScript / production build | all green |
| Offline Playwright (desktop + Pixel 7) | passed / online-gated skips (unchanged — no UI change) |
| Traceability generator | 69 rows; fails closed on inventory drift |

### Remote Supabase aggregate

`npm run test:remote:2d` (deterministic, fail-fast, fail-closed cleanup): question-resolution (v1/v2 answer + dispositions), suggested-answer/preview, reinterpretation (v3), content-free resolution product events, and residual-data cleanup (0 disposable users, 0 orphans across 14 tables, 0 remote-smoke storage objects). The daily-cycle convergence smoke passes standalone (`npm run test:remote:daily-cycle`); it is intentionally kept out of the fail-fast aggregate because its needs-attention section claims an `interpret_entry` job that races the unattended queue drain.

### Database and generated schema

Migration list parity through `202607230051`; `db lint --level error` clean (two unrelated pre-existing `run_user_heartbeat` warnings only); `database.types.ts` byte-stable.

## Requirement traceability

`docs/reports/PHASE_2D_TRACEABILITY_MATRIX.md` maps all 58 functional/non-functional requirement IDs (15 families), 6 per-epic acceptance criteria, and 5 global gates — 69 rows — each to its owning slice(s) and durable evidence. The generator (`npm run docs:phase-2d:traceability`) fails closed if the PRD inventory drifts. No requirement is left non-green: the phasing "unavailable-before-slice-N" constraints held and shipped, the deterministic suggested-answer path satisfies its requirement (the AI-schema fallback is deferred and was not needed), and the `2C-UNDO-004` hard gate is resolved.

## Cleanup verification

`scripts/verify-phase-2d-cleanup.mjs` (fail-closed) asserts no disposable Auth user, no owner-orphaned row across the Phase 2D table set (including `entry_interpretations`/`pending_questions`), and no remote-smoke storage object remains after the aggregate.

## Security and analytics

- Every resolution flows through the `SECURITY DEFINER` `resolve_pending_question_v1`–`v3` family (`search_path = ''`, `auth.uid()`-only, closed discriminated JSON, owner lock, anti-stale check, canonical fingerprint, atomic state + audit + undo, execute to `authenticated` only). Question/answer/interpretation content is untrusted data in Chat and prompts and never enters analytics; deterministic suggestions are bounded/closed. `SECURITY.md` is reconciled to document these controls and to record the `undo_operation` `40001`→`55P03` fix.
- Analytics stays content-free, allowlisted, idempotent, and fail-open across `question_answered_basic` (bounded `origin`), `question_resolved` (bounded `kind`), `question_effect_previewed`, `question_reinterpret_applied`, and the `needs_attention_viewed` reuse on the `questions` surface.

## Residual risks and follow-ups

- **Legacy answer-path retirement:** deferred by PRD §21.7 to a separately authorized step; the `answerPendingQuestion` wrapper and `resolve_pending_question_v1`/`v2` RPCs are preserved for rollback.
- **AI extraction-schema `suggestedAnswers` fallback:** an explicitly deferred, separately-authorized option that deterministic suggestions made unnecessary.
- **Split/merge sub-epic (`2C-STRUCTURE-004`, issue #8):** open, deferred, non-blocking; unrelated to Phase 2D.
- **Docker/CI pgTAP:** run the committed suites in Docker/CI and add the DB gate to CI when Docker is available.
- **Custom SMTP:** required before production signup delivery.
- **Deployment:** Phase 2D application code and migrations `046`–`051` are merged to `main` and applied to the linked development database; production deployment/rollout follows the per-slice rollback strategy and is out of scope for this closeout.

## Independent review

The Slice 2D.6 branch diff (closeout scripts and documentation only; no product/UI/migration source) passed independent review with no Critical or Important finding. Each earlier slice was independently reviewed at its own checkpoint with no unresolved Critical/Important issue.

## Final scope statement

Phase 2D is closed. No Phase 2E (natural-language task updates) or Phase 2F (launch) capability is present in this phase. No historical Phase 2X/2C report or evidence was rewritten. The next official scope after this closeout — Phase 2E — awaits separate authorization.
