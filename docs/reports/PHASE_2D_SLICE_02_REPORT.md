# Phase 2D Slice 2D.2 — Question Dispositions — Acceptance Report

## 1. Status

**READY WITH NON-BLOCKING NOTES**

The complete branch diff passed independent review with no unresolved Critical or Important finding. The linked development database is migrated through `202607230048` at local/remote parity; the application branch remains local and has not been pushed, merged, or deployed. The single non-blocking note is one pre-existing, unrelated e2e journey failure (§12), not caused by this slice.

## 2. Summary

Branch `codex/phase-2d-slice-2` (base `main`@`cb33bd6`, the merged Phase 2D Slice 2D.1 commit) implements exactly Slice 2D.2 of `PHASE_2D_PRD.md`/`PHASE_2D_IMPLEMENTATION_PLAN.md` under ADR-033: an authenticated owner resolves an open, current pending question **without answering it** — deferring it to a chosen future instant, dismissing it, or marking it not relevant — through `resolve_pending_question_v2`, the second version of the single long-lived resolution RPC family. Each disposition is owner-scoped, atomic, audited, undoable, idempotent, and privacy-safe. Deferred questions reactivate deterministically at read time; dismissed and not-relevant are terminal (until undo), with not-relevant recorded distinctly over the reused `dismissed` status per ADR-033. Nothing outside the approved scope exists in this diff: no suggested answers, no preview, no reinterpretation/consequence, no Chat rendering, no cooldown/quiet-hours, no proactive surfacing, and no AI schema, worker, cron, secret, provider, or Edge Function change.

## 3. Branch and commits

- Repository: `D:\Projetos\GitHub\my-brain`
- Branch: `codex/phase-2d-slice-2`, base `cb33bd6` (`Merge pull request #11 … codex/phase-2d-slice-1`)
- Local implementation commits, in order:
  1. `b848ba5` — `feat(db): add pending question dispositions` — migration `202607230048`, regenerated `database.types.ts`, pgTAP suite `resolve_pending_question_v2.sql`, extended remote smoke
  2. `00ea251` — `feat(agent): support deferred and terminal question resolutions` — contract module, Server Action cutover to `v2`, `resolvePendingQuestion`, disposition UI, shared reactivation filter, projection updates, analytics client contract, component/action/e2e tests
  3. `docs(phase-2d): report Slice 2D.2 acceptance` — this report plus `STATE.md`/`TODO.md`/`CHANGELOG.md` updates
- Final HEAD: the docs commit above.
- Remote Git actions: none (no push, PR, merge, or deploy). The linked database migration was explicitly authorized and applied.

## 4. Acceptance IDs covered

- `2D-DISPOSITION-001…006` — disposition controls absent in 2D.1 (now present); exactly `deferred|dismissed|not_relevant`, each owner-scoped/atomic/audited/undoable; deferred sets `snoozed` + validated future `snoozed_until` and reactivates to open; dismissed/not_relevant terminal with no domain object, labeled distinctly; only `open → answered|deferred|dismissed|not_relevant` and automatic `snoozed → open`, terminal-to-terminal rejected; resolution stores only narrow decision/provenance.
- `2D-ANSWER-001…007` (regression) — the answer kind flows through the same `v2` contract with all Slice 2D.1 guarantees intact.
- `2D-PROVENANCE-001/003`, `2D-IDEMPOTENCY-001…004`, `2D-OWNERSHIP-001…004`, `2D-UNDO-001/002/004` — extended to every new kind: audit carries question id, interpretation id, resolution kind, and fingerprint; canonical SHA-256 replay and mismatch; `auth.uid()` identity, same-owner chain, non-disclosing cross-owner/missing denial, closed JSON + `search_path=''` + least-privilege grants + no dynamic SQL; one undo per resolution restoring exact prior open state.
- `2D-ANALYTICS-001…003` — `question_resolved` carries only the bounded `kind` enum (`deferred|dismissed|not_relevant`); no question/answer text, reason, deferral instant, or entity name; fail-open; observes a persisted outcome only.
- Slice-applicable `2D-UX-001/002/003`, `2D-I18N-001/002`, `2D-A11Y-001/002/003`, `2D-OPERATIONS-001/002`.
- `2D-SUGGEST-001` / `2D-ACTION-001` hold by construction: no suggestion, preview, or consequence control exists in the diff.

## 5. RPC changes (`202607230048`, additive)

```sql
public.resolve_pending_question_v2(
  p_question_id uuid,
  p_resolution jsonb,   -- closed discriminated:
                        --   { "kind": "answer",       "answer": <trimmed 1–4000> }
                        --   { "kind": "deferred",     "snoozedUntil": <explicit-offset future instant> }
                        --   { "kind": "dismissed" }
                        --   { "kind": "not_relevant" }
  p_operation_key text  -- 8–240 chars, namespaced 'resolve-v2:'
) returns jsonb
-- { "question_id", "resolution", "undo_id", "idempotent" [, "snoozed_until"] }
```

- `language plpgsql`, `SECURITY DEFINER`, `set search_path = ''`, qualified references, no dynamic SQL; execute granted to `authenticated` only, revoked from `public`/`anon`.
- The discriminant selects the exact permitted key set; unknown kind/key, missing key, wrong type, or >32 KiB payload raises `22023` before any write.
- Deferral instant: explicit-offset ISO-8601 only (naive local rejected), strictly future, within 366 days; canonicalized to millisecond UTC (`YYYY-MM-DD"T"HH24:MI:SS.MS"Z"`) matching ECMAScript `toISOString()`, so equal deferrals hash identically regardless of submitted offset.
- `not_relevant` reuses the `dismissed` status and is recorded as a distinct resolution kind on the audit/undo evidence (ADR-033) — no status `CHECK` migration.
- Deterministic snooze reactivation: the authoritative open check accepts `status='open'` **or** `status='snoozed' and snoozed_until <= now()`, so a reactivated question is resolvable and the automatic `snoozed → open` transition is materialized as the resolution's before-state evidence.
- Owner entry lock → stale check (`55P03`); re-read under lock → non-open/still-snoozed rejection (`55000`, the losing side of a concurrent race); operation-key reservation with canonical fingerprint (replay returns the original result; mismatch raises `P0001`/`2D_IDEMPOTENCY_MISMATCH`); atomic state + audit + undo.
- `undo_operation` gained a guarded `resolve_pending_question_v2` branch that restores exact prior open state **only from the status the evidence says it left behind**, so undoing a superseded resolution (e.g. a deferral whose reactivated question was later answered) fails the integrity check (`2D_UNDO_RESTORE_INTEGRITY`) instead of clobbering newer work. The `resolve_pending_question_v1` branch and every earlier branch are byte-identical to migration `202607230046`.
- `list_needs_attention` widened its three open-question predicates to the same read-time reactivation rule; signature, `SECURITY DEFINER`, `search_path`, grants, and supporting index unchanged.
- `resolve_pending_question_v1` is untouched by this migration and remains callable (rollback path); the `resolve-v1:` and `resolve-v2:` namespaces never collide.

## 6. Server changes

- `src/features/agent/question-resolution-contract.ts` — `QuestionResolutionCommand` extended to a four-variant discriminated union (`answer` | `deferred` | `dismissed` | `not_relevant`); the deferral instant is validated (explicit offset, strictly future, ≤ `QUESTION_DEFER_MAX_DAYS` = 366) and canonicalized to UTC; `serializeQuestionResolution` emits exactly the discriminant plus its content, never the question id.
- `src/features/agent/actions.ts` — new `resolvePendingQuestion` calls `resolve_pending_question_v2`, maps every outcome to stable localized codes (`validation_error`/`session_expired`/`stale_interpretation`/`not_open`/`idempotency_mismatch`/`retryable_failure`/`resolution_succeeded`) with per-kind PT-BR/English copy, and emits the content-free event (`question_answered_basic` for answers, `question_resolved` with only `{kind}` for dispositions), both suppressed on replay and every failure. `answerPendingQuestion` is retained as the answer-kind wrapper. `undoQuestionResolution` localizes its confirmation per resolution kind. Raw SQL/PostgREST text never reaches the UI; retry preserves the operation key.

## 7. UI changes

The questions page renders **Answer**, **Defer**, **Dismiss**, and **Not Relevant** on each open card. Defer opens an inline `datetime-local` panel whose wall time is converted to an explicit-offset instant in the persisted profile timezone (reusing the Phase 2C `localDateTimeToOffsetInstant`, including DST-gap/overlap rejection); an unconvertible value shows a field-associated local error and focuses the field without dispatching. Distinct visible states exist for editing, each submitting kind, each success outcome (deferral success renders the localized deferred-until time), validation, stale, non-open, mismatch, and retryable failure, plus per-kind undo controls. Errors associate with their field via `aria-invalid`/`aria-describedby`; pending and result use live regions; focus returns predictably; targets are ≥44 CSS px; PT-BR and English copy is complete. No raw confidence or internal state name was added to the primary flow.

## 8. Analytics

`question_resolved` (contract version 1) is added to the private ledger allowlist (table CHECK, per-event property validation, and `record_product_event`'s defense-in-depth guard) and to the client-side product-analytics contract, with its only property the bounded `kind ∈ {deferred, dismissed, not_relevant}`. It is emitted fail-open inside `after()` for non-replayed dispositions only, `surface: "server"`, subject `pending_question`, idempotency keyed by the resolution operation key. Unit tests assert the payload carries no deferral instant, question, or free text and is suppressed on replay and on every failure path. Answers continue to reuse `question_answered_basic`. No other event or property changed.

## 9. Security

- `auth.uid()` is the only identity; no client owner id is accepted.
- Cross-owner and missing questions are the same non-disclosing `P0002`, asserted byte-equal in pgTAP and the remote smoke; anonymous execution is revoked for `v2`.
- The command JSON is closed and bounded at every level; the RPC re-validates server-side regardless of the client contract.
- Stale, still-snoozed, non-open, replay, mismatch, and race paths are database-tested and remotely exercised as authenticated users; failures write nothing and reserve no evidence.
- Question/answer/deferral content is never treated as an instruction and never enters analytics.
- RLS stays enabled/forced on `pending_questions`; no policy or grant changed; the legacy `v1` path keeps its grants for rollback.

## 10. Undo behavior

One undo operation per successful disposition, registered in the same transaction with the request fingerprint. Undo restores the exact prior open state (`open`, cleared `answer`/`answered_at`/`snoozed_until`), guarded by the status the resolution left behind so it can never overwrite a newer, different resolution of the same question; it records immutable audit evidence, is idempotent on repetition, never touches the interpretation JSON or unrelated rows, and leaves the question resolvable again under a new key. No parallel undo mechanism was introduced.

## 11. Verification

| Gate | Result |
| --- | --- |
| ESLint | 0 errors |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Full Vitest | 88 files, 776/776 passing (includes new contract, action, component, visibility, and analytics-contract tests for this slice) |
| Production build | passes |
| pgTAP | `supabase/tests/resolve_pending_question_v2.sql` (76 assertions: signature/`SECURITY DEFINER`/`search_path`/grants, v1 still-callable, `question_resolved` allowlist, closed shape for all four kinds, deferral-instant validation, anonymous/cross-owner/missing non-disclosure, defer success + replay + mismatch, still-snoozed rejection, deterministic reactivation + resolvability, guarded superseded-undo, dismissal terminal + undo + redismissal, distinct not_relevant history, stale rejection, v1/v2 namespace isolation, immutable interpretation). **Executed online** against the linked project (Docker unavailable) — 76/76. Regression: `resolve_pending_question.sql` 55/55, `phase_2c_slice_5_task_graph.sql` 34/34, `phase_2c_slice_4_candidate_dispositions.sql` 85/85, `needs_attention_projection.sql` 35/35, `product_events.sql` all green (exercising the recreated `undo_operation` and product-event functions) |
| Linked migration | `202607230048` applied; `supabase migration list --linked` shows exact local/remote parity through `202607230048` |
| Linked DB lint | `--level warning`: only the pre-existing `run_user_heartbeat` cast note; nothing on the new/recreated functions |
| Generated types | regenerated from the linked schema; diff is exactly the 8-line `resolve_pending_question_v2` signature addition |
| Remote smoke | `npm run test:remote:2d:resolution` — passed, **28 cases** (14 Slice 2D.1 answer cases plus 14 new disposition cases: closed-shape rejections without residue, cross-owner/missing indistinguishability, anonymous denial, queue baseline, defer success/replay/mismatch, still-snoozed rejection + queue departure, deterministic reactivation + queue return + resolvability, guarded superseded-undo, dismissal terminal/replay/undo/redismiss, distinct not_relevant history + undo, stale deferral, v1/v2 namespace isolation, content-free `question_resolved` allowlist, immutable interpretation); disposable users, fail-closed cleanup, pre-existing Auth users and table counts byte-identical before/after |
| Playwright | New disposition scenarios passed on desktop + Pixel 7 in PT-BR and English: defer (with profile-timezone date picker) → deferred-until status → undo; dismiss → undo; not relevant → undo; content-free `question_resolved` events observed; ≥44px targets on mobile. Slice 2D.1 answer/stale/undo and English-copy regressions re-passed on both projects. Needs-Attention queue-convergence journey re-passed |
| Cleanup | temporary `pgtap` extension dropped from the linked project after the online run; smoke/e2e fixtures disposable and fail-closed; no residue |

## 12. Non-blocking e2e note (pre-existing / unrelated)

`converged daily journey › confirms candidates, materializes a task…` (desktop+mobile) fails on an assertion expecting the pre-Phase-2C.4 button label `Criar N tarefas`; the merged Phase 2C.4/2C.5 disposition UI renders `Resolver N sugestões`. The assertion is byte-identical on `main` (verified via `git show main:e2e/intelligent-capture.spec.ts`) and matches the pre-existing failure already documented in the Slice 2D.1 report §12.1. It is unrelated-surface work outside this slice's authorized scope.

## 13. Independent review

The full `git diff main` was reviewed against: RPC compatibility (v1 preserved and re-proven callable; v1/v2 namespace isolation); ownership and cross-owner disclosure; stale handling; disposition correctness (defer/dismiss/not-relevant semantics, terminal transitions); replay and mismatch; concurrency (single-winner, guarded undo against superseded resolutions); undo compensation; analytics privacy (bounded `kind` only); localization; accessibility; backward compatibility; and absence of later-slice work. No Critical or Important finding survived verification.

- **Minor (accepted):** `answerPendingQuestion` mutates its passed `FormData` (`.set("kind","answer")`) before delegating to `resolvePendingQuestion`. Safe because each Server Action invocation receives a fresh `FormData`; retained for a stable exported answer entry point.
- **Minor (deferred, explicit):** the pre-existing confidence badge on the question card predates Phase 2D and remains legal per the PRD (confidence for ordering); any change is 2D.6 convergence work.

## 14. Assumptions

- Deferral instants are submitted by the UI as explicit-offset ISO-8601 strings (the client converts wall time via the persisted profile timezone before dispatch); the database rejects naive offset-less instants, so a raw API caller must supply an offset.
- The bounded deferral window is 366 days (covers leap years) both client- and database-side; an unbounded far-future defer is treated as an untruthful dismissal and rejected.
- Read-time snooze reactivation (projection filter + `list_needs_attention` predicate + RPC acceptance) is the approved Slice 2D.2 default; no heartbeat sweep or new cron was added.

## 15. Deferred follow-ups

- Slices 2D.3–2D.6 (deterministic suggestions/preview, permitted reinterpretation consequence with the `40001` hard gate, chat/queue surfacing + cooldown, convergence/closeout) — each requires separate authorization.
- Legacy answer-path (`v1`/plain `UPDATE`) retirement — separately authorized later step after consumer/rollback review.
- The pre-existing `Criar N tarefas` journey assertion fix (unrelated surface).

## 16. Verdict

**READY WITH NON-BLOCKING NOTES** — Slice 2D.2 is implemented, independently reviewed, and verified locally, in database contracts, in disposable authenticated remote evidence, and in desktop/mobile PT-BR/English journeys. The branch stops here; Slice 2D.3 was not started.
