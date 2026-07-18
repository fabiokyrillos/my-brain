# Architecture Review — Slices 2X.5 through 2X.8

Review type: retroactive, read-only architecture review. No production code, migration, infrastructure, or Slice 2X.9 work was changed to produce this document.

Scope: `src/features/capture/actions.ts`, `src/lib/jobs/entry-worker.ts`, `src/features/interpretations/actions.ts`, `src/features/interpretations/data.ts`, `src/features/daily-cycle/{lifecycle,contracts,projection-mappers,inbox-projection,review-projection,technical-details-projection,capture-receipt}.ts(x)`, `src/features/tasks/{actions,task-candidate-form}.ts(x)`, `src/app/[locale]/app/inbox/[entryId]/page.tsx` and its architecture guardrail test, `supabase/migrations/202607170028_phase_2x_candidate_action_consistency.sql`, `supabase/migrations/202607180029_fix_correction_conflict_gateway_timeout.sql`, and the corresponding permanent documentation (`STATE.md`, `TODO.md`, `DECISIONS.md` ADR-023 through ADR-026, `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`) and slice/hotfix reports for Slices 2X.5–2X.8. HEAD reviewed: `cdcb878b81dcdc2c000459d49513ac7a7a85c5f3`.

## 1. Scope

This review covers the implementation delivered by:

- **Slice 2X.5** — asynchronous capture cutover (`captureEntry`/`reprocessEntry` return immediately after durable enqueue; `after()`-scheduled worker nudge and product events).
- **Slice 2X.6** — shared human-lifecycle projection for Inbox and Home (`inbox-projection.ts`, `InboxItemRow`).
- **Slice 2X.7** — candidate provenance and interpretation-bound task confirmation (migration `028`, `confirm_entry_task_candidates`).
- **Slice 2X.8** — separated product (`review-projection.ts`) and technical (`technical-details-projection.ts`) projections for the entry-detail page, with an import-boundary guardrail test.
- The out-of-sequence hotfix (migration `202607180029`, ADR-026) that changed `correct_entry_interpretation`'s version-conflict SQLSTATE from `40001` to `55P03`.

Findings from the prior `PHASE_2X_SLICES_2X3_2X4_ARCHITECTURE_REVIEW.md` (F1/F2 Node↔Deno drift, F12 secrets runbook) are referenced only where this review's scope changed their status; they are not re-implemented here per the task's instructions.

## 2. Executive summary

Slices 2X.5–2X.8 are a coherent, well-documented vertical cut that does what it says: capture no longer waits on AI, Inbox/Home/Review now share one lifecycle mapper instead of three ad hoc readings of `entries.status`, and task confirmation is now provably bound to the interpretation the user actually saw. The engineering discipline is unusually high for a project at this stage — every slice report cites real remote-smoke evidence (not just local mocks), two real production defects were found and fixed via live-role testing rather than superuser-equivalent pgTAP, and the ADR trail is honest about scope boundaries (ADR-025 explicitly declines to fix `correct_entry_interpretation`'s `40001` because the file wasn't in the slice's authorized list, then ADR-026 closes it as its own tracked hotfix).

The one material defect this review found is new and was not caught by any of the four slices' own test suites: **the lifecycle input `hasMaterializedTaskForCandidates`, computed in both `inbox-projection.ts` (Slice 2X.6) and `review-projection.ts` (Slice 2X.8), is scoped to "does this entry have any materialized task at all," not "are this interpretation's actionable candidates already covered."** This makes an entry's `productState` badge report `ready` while its own actionable-candidates list (correctly interpretation-scoped) still shows an unconfirmed suggestion — the exact class of interpretation/candidate/action incoherence Épico 3 and Épico 5 of the PRD were written to eliminate. It reproduces on the ordinary path of confirming *some but not all* candidates for a single, uncorrected interpretation — no correction or reprocessing required. See F1.

Everything else is either already-tracked debt this review can confirm is still accurate (the `undo_operation` `40001` gateway-hang risk, now demonstrably reachable from two Action entry points instead of one — F2), unchanged carryover from the 2X.3/2X.4 review (Node/Deno drift — F3), or genuine, well-executed architecture (the migration `028` RPC design, the import-boundary guardrail test, the two-independent-loaders failure-isolation design in Slice 2X.8).

No security regression, RLS gap, or data-loss risk was found in this scope. F1 and F2 are correctness/trust defects, not security defects.

## 3. Findings summary table

| # | Finding | Area | Severity | Timing |
|---|---|---|---|---|
| F1 | `hasMaterializedTaskForCandidates` is entry-scoped, not candidate-scoped — `productState` can say `ready` while a real unconfirmed candidate remains | Lifecycle consistency | High | **Resolved 2026-07-18** |
| F2 | `undo_operation`'s residual SQLSTATE `40001` gateway hang is unhandled in both of its client call sites, and Slice 2X.7 added a second live path into it | Correctness / reliability | High | Before main |
| F3 | Node↔Deno duplication (entity-resolution/trust modules, extraction prompt/schema) still undetected by tooling — unchanged since the 2X.3/2X.4 review | Duplication / drift | Medium (carryover) | Before main (restated, not worsened) |
| F4 | pgTAP assertion volume keeps growing (79 assertions across two Phase 2X files) with zero local/CI execution | Operational gap | Medium | Before main |
| F5 | `confirm_entry_tasks` compatibility RPC has zero consumers after 2X.7 and no removal plan | Maintainability | Low | After Phase 2X |
| F6 | ADR-023's "bounded by the atomic RPC alone" wording undercounts one parallelized lookup pair actually performed by `captureEntry` | Documentation accuracy | Low | No action |
| F7 | Entry-detail page (`page.tsx`) is ~300 lines mixing five content blocks inline | Maintainability | Low (informational) | Naturally handled by Slice 2X.9 |
| F8 | No online Playwright coverage for the candidate-consistency journeys (correct invalidates candidate, record-only, undo doesn't resurrect) | Test coverage | Low (carryover, restated) | During Slice 2X.9 |
| F9 | Candidate confirmation RPC design (migration 028) | Positive | — | — |
| F10 | Import-boundary guardrail test (`page.architecture.test.ts`) | Positive | — | — |
| F11 | Independent-loader failure isolation (Slice 2X.8) | Positive | — | — |

## 4. Detailed findings

### F1 — `hasMaterializedTaskForCandidates` masks unconfirmed candidates behind a coarse entry-level check

**Status: Resolved 2026-07-18**, by a standalone hotfix outside the slice sequence (before Slice 2X.9, as recommended below). Both loaders now derive `hasMaterializedTaskForCandidates` from the same interpretation-scoped source `actionableCandidates` already used correctly (`computeUnavailableCandidateIndexes`), via a new shared pure helper `hasUnconfirmedTaskCandidates` (`src/features/interpretations/data.ts`). `inbox-projection.ts`'s `tasks` query now additionally selects `source_interpretation_id`/`candidate_index` and computes per-entry unavailable indexes before deciding coverage; `review-projection.ts` feeds the helper the `unavailableCandidateIndexes` `loadInterpretationReview` already computed. No change to `lifecycle.ts`, candidate confirmation semantics, `TaskCandidateForm`, or any RPC/migration. Regression tests reproduced the exact defect (partial confirmation, older-interpretation task, mismatched candidate index) against the pre-fix code before the fix was applied, plus a cross-loader consistency test. See `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md`.

**Area:** Lifecycle consistency (Épico 3/Épico 5 of the PRD)
**Severity:** High
**Where:** `src/features/daily-cycle/inbox-projection.ts:78,120` and `src/features/daily-cycle/review-projection.ts:288`.

`lifecycle.ts`'s own contract (confirmed by its unit tests, `lifecycle.test.ts:90-94`) is: when `hasValidTaskCandidates && hasMaterializedTaskForCandidates`, the entry is `ready` — no attention needed. This is a reasonable contract *if* `hasMaterializedTaskForCandidates` means "the current interpretation's actionable candidates already have matching materialized tasks." Neither loader computes it that way:

- `inbox-projection.ts:78,120`: `materializedTasks` is fetched as `.from("tasks").select("source_entry_id").neq("status","cancelled").in("source_entry_id", entryIds)`, and `hasMaterializedTaskForCandidates: materializedEntryIds.has(entry.id)` — true the moment *any* non-cancelled task exists for the entry, regardless of which interpretation or which candidate produced it.
- `review-projection.ts:288`: `hasMaterializedTaskForCandidates: data.tasks.length > 0`, where `data.tasks` (from `loadInterpretationReview`, `interpretations/data.ts:176`) is every non-cancelled task for the entry, not filtered by `source_interpretation_id`.

Reproduction (no correction or reprocessing needed): an interpretation has two task candidates. The user confirms one via `TaskCandidateForm` (`confirm_entry_task_candidates` correctly creates one task with `source_interpretation_id` set). On the next page load, `data.tasks.length > 0` is now `true`, so `hasMaterializedTaskForCandidates` is `true`, so `candidateNeedsConfirmation` in `lifecycle.ts:93-96` evaluates `false`, so the entry's `productState` becomes `ready`.

Meanwhile, in the same render, `review-projection.ts:125-137` builds `actionableCandidates` from `unavailableCandidateIndexes` (`computeUnavailableCandidateIndexes`, `interpretations/data.ts:68-81`), which *is* correctly interpretation-scoped — it still lists the second, unconfirmed candidate. `TaskCandidateForm` (`task-candidate-form.tsx:90-93`) filters by that same correct `unavailableIndexes` and still renders a submit button for the remaining candidate. The result on `/inbox/{entryId}` (and on the Inbox/Home list rows, which share `inbox-projection.ts`) is a page that displays a `ready`/"Pronto" status badge with no attention item in Bloc B, directly above a "Próximas ações" section still asking the user to confirm a suggestion. `attentionItems` is empty (line 168-178 of `review-projection.ts` only populates it when `attentionReason` is non-null, and it's null here), so nothing in Bloc B explains why the form is still there.

This is exactly the "interpretation ↔ candidate ↔ action" incoherence Épico 5 (COH invariants) and O4 of the PRD were written to eliminate, and it is live in shipped behavior today — the entry-detail page has consumed `productState` for its badge since Slice 2X.8, and Inbox/Home have consumed it since Slice 2X.6. It was not caught by any of the four slices' own tests because each layer's tests are correct in isolation: `lifecycle.test.ts` correctly specifies what `hasMaterializedTaskForCandidates` *should* mean, and `review-projection.test.ts`/`inbox-projection.test.ts` pass fixtures where that flag is set directly rather than derived from a realistic partial-confirmation task list — so the mismatch between the flag's contract and its actual computation was never exercised end to end.

**Recommended action:** Compute `hasMaterializedTaskForCandidates` (or better, rename it to something like `hasUnconfirmedCandidates` and invert the check inside `lifecycle.ts`) from the same interpretation-scoped source `computeUnavailableCandidateIndexes` already uses: an entry needs confirmation only when at least one of the current interpretation's `task_candidates` indexes is *not* in the already-covered set (own-interpretation task exists, or index is otherwise proven unavailable). `review-projection.ts` already has `unavailableCandidateIndexes` computed correctly at the point it builds `actionableCandidates` — the fix is to derive the lifecycle-input boolean from the same computation instead of recomputing a separate, coarser one. `inbox-projection.ts` needs the equivalent interpretation-scoped join (it currently only fetches `source_entry_id`; add `source_interpretation_id` and `candidate_index` to the existing `tasks` select and compare against each entry's current interpretation's `task_candidates` length, mirroring `computeUnavailableCandidateIndexes`'s logic).

**Recommended timing:** Before Slice 2X.9. Slice 2X.9's entire purpose is to let users trust `productState`/`availableActions` without opening technical details (P2/P6 of the PRD) — building that UI on top of this exact miscomputation would make the badge's untrustworthiness more visible and more consequential, not less. Fixing it first (or as 2X.9's first task) is materially cheaper than fixing it after the progressive-disclosure UI is built around the current, incorrect signal.

### F2 — `undo_operation`'s SQLSTATE `40001` gateway-hang risk is unmitigated at both of its call sites, and now has two live entry points

**Area:** Correctness / reliability (residual risk from ADR-025/ADR-026, restated with current evidence)
**Severity:** High
**Where:** `supabase/migrations/202607170028_phase_2x_candidate_action_consistency.sql:809-811` (`undo_operation`'s `raise exception ... using errcode = '40001'`, unchanged since it was first written in migration `020` and copied forward verbatim by `028`); `src/features/interpretations/actions.ts:76-93` (`undoInterpretationCorrection`); `src/features/tasks/actions.ts:83-100` (`undoAgentAction`).

ADR-025/ADR-026 and `SECURITY.md`/`TODO.md` already document that any RPC raising SQLSTATE `40001` hangs the request until the platform gateway times out on this project (confirmed via a raw `fetch()` against the REST endpoint, independent of any application code), and that `undo_operation`'s own `40001` raise (line 810: `'Cannot undo after a newer interpretation revision'`) was deliberately left unfixed by the migration `029` hotfix because that hotfix's authorized scope was the single named RPC `correct_entry_interpretation`. This review confirms the gap is real and current: a `grep` for `40001`/`55P03` across `src/` (see below) shows zero special-casing for `40001` anywhere in the codebase — both `undoInterpretationCorrection` and `undoAgentAction` call `supabase.rpc("undo_operation", ...)` and fall through to a single generic `if (error) return { status: "error", message: "..." }` branch with no SQLSTATE inspection at all, unlike `correctInterpretation` (`interpretations/actions.ts:64`) and `confirmEntryTasks` (`tasks/actions.ts:60`), which both explicitly check for `55P03`.

```
src/features/interpretations/actions.ts:89-90   // undoInterpretationCorrection: no error.code check
src/features/tasks/actions.ts:94-95             // undoAgentAction: no error.code check
```

What changed since ADR-025 was written: Slice 2X.7 added `confirm_entry_task_candidates`'s undo path through the *same* `undo_operation` function (migration `028:777-798`, the `action_type in ('confirm_entry_tasks', 'confirm_entry_task_candidates')` branch) — but that branch returns before reaching the `40001`-raising code (it's a simple task-cancellation, not a version-conflict check), so it is not itself at risk. The actual `40001` raise (line 810) is reached only by the `correct_entry_interpretation`-undo branch, exercised by `undoInterpretationCorrection`. So the *set of code paths reaching the risky raise* hasn't grown, but the *set of client call sites with zero handling for it* is now two (`undoInterpretationCorrection` and `undoAgentAction`) instead of implicitly one, because `undoAgentAction` (new consumer of `undo_operation`, added by Slice 2X.7's task-confirmation work) shares the same unguarded generic error path even though its own action types don't currently reach the `40001` branch. If a future change ever adds a version-conflict check to the task-cancellation branch (a plausible future need — e.g., "don't let an undo race a newer correction"), it would inherit the same hang with no client protection already in place, because neither undo Action treats `40001`/`55P03` specially today.

**Recommended action:** Add a `55P03`-preferring version-conflict SQLSTATE to `undo_operation`'s line-810 raise (the same substitution ADR-026 already made for `correct_entry_interpretation`, in a dedicated migration), and add the same `error.code === "55P03"` special-casing to `undoInterpretationCorrection` and `undoAgentAction` that `correctInterpretation`/`confirmEntryTasks` already have, so the message reads "reload and try again" instead of a generic failure once the gateway-hang class of bug is closed.

**Recommended timing:** Before main. This is user-reachable today (any user who corrects an interpretation in one tab while an undo for an older version is still pending in another) and the fix is a small, well-precedented, single-RPC substitution — the same shape of change ADR-026 already executed successfully. It does not block Slice 2X.9 (progressive disclosure doesn't change the undo RPC surface), but it should not wait until "after Phase 2X" given it is a live, already-shipped hazard, not new-feature debt.

### F3 — Node↔Deno duplication risk is unchanged, not worsened, by 2X.5–2X.8

**Area:** Duplication / Node-Deno drift (carryover from the 2X.3/2X.4 review's F1/F2)
**Severity:** Medium (unchanged)
**Where:** `src/features/interpretations/{entity-resolution,trust-builders,trust-policy}.ts` vs `supabase/functions/_shared/*.ts`; `src/lib/ai/openai-provider.ts` vs `supabase/functions/process-jobs/entry.ts`.

None of Slices 2X.5–2X.8 touched `supabase/functions/process-jobs/entry.ts` or the `_shared/` Deno copies — 2X.5 only changed *callers* of the worker (`captureEntry`/`reprocessEntry`), and 2X.6–2X.8 are pure UI/projection work with no interaction with the extraction pipeline. The drift-detection gap the prior review recommended (a Vitest test that diffs the Node and Deno copies) still does not exist. ADR-023's removal of `interpret-entry.ts` (the synchronous Node orchestrator) is worth noting here: it does **not** change this finding, because ADR-023 explicitly preserved `entity-resolution.ts`/`trust-builders.ts`/`trust-policy.ts` as the canonical Node source the Deno copies must still track (see ADR-023's "Consequences" and the Slice 2X.5 report's decision log) — only the orchestrator around them was deleted, not the shared logic itself.

**Recommended action:** Same as the prior review — add the drift-detection Vitest test comparing the two copies. No new action beyond what's already tracked.

**Recommended timing:** Before main, as already recommended. Restated here only because this review's scope required an explicit check on whether it had gotten more urgent; it has not.

### F4 — pgTAP assertion volume keeps growing with zero local/CI execution

**Area:** Operational gap / test coverage
**Severity:** Medium
**Where:** `supabase/tests/candidate_action_consistency.sql` (33 assertions, Slice 2X.7), `supabase/tests/interpretation_revisions.sql` (raised from 44 to 46 assertions by the migration `029` hotfix).

This is the same pre-existing Docker/pgTAP environment gap every slice report in this project documents (not new to 2X.5–2X.8), but the volume of committed-but-never-locally-executed pgTAP assertions specifically added or extended by this review's scope is now 79 (33 + the 2 new from the hotfix, on top of the pre-existing 44). The mitigating factor, documented honestly in the Slice 2X.7 report itself, is that the two real defects this window of work found (the `SECURITY INVOKER`/missing-grants bug and the `40001` gateway hang) were caught by the *authenticated-role remote smoke*, not by pgTAP — and the report explicitly notes a Docker-backed pgTAP run (typically a superuser-equivalent role) likely would not have caught the grants bug at all. So the remote-smoke-first verification strategy this project has settled into is not a weaker substitute for pgTAP here; for this specific defect class it is a stronger one. What it does not replace is pgTAP's value as a *fast, CI-runnable regression gate* for the business-logic invariants (interpretation-scoped uniqueness, idempotent replay, record-only rejection) that are already correctly specified in the committed `.sql` files but only ever get exercised by a manually-run remote script against a live disposable-user session.

**Recommended action:** No new tooling recommended beyond what `TODO.md`/`STATE.md` already prioritize ("Execute pgTAP locally/CI when Docker is available and add the database gate to CI," `STATE.md` next-priorities #5). This finding exists to confirm that priority is still correctly ranked and, if anything, slightly more urgent given the growing assertion count with zero automated execution.

**Recommended timing:** Before main.

### F5 — `confirm_entry_tasks` compatibility RPC has zero consumers and no removal plan

**Area:** Maintainability
**Severity:** Low
**Where:** `supabase/migrations/202607170028_phase_2x_candidate_action_consistency.sql:953-1012` (function body, `grant`/`revoke`); no `.rpc("confirm_entry_tasks"` call exists anywhere in `src/` after Slice 2X.7 (`confirmEntryTasks` in `tasks/actions.ts` calls `confirm_entry_task_candidates` exclusively).

ADR-024 already flags this as "preserved for compatibility, no new consumer" and both the Slice 2X.7 report and this migration's own header comment are explicit that removing it is a deliberate non-goal of that slice. This finding is not a criticism of that decision — keeping a working, security-fixed compatibility shim during an active migration window is the right call — it is a reminder that the function now has a fixed cost (schema surface, security review burden, a legacy partial unique index it alone still owns) with no scheduled removal condition anywhere in `TODO.md`.

**Recommended action:** Add a `TODO.md` entry naming `confirm_entry_tasks` and its dedicated `tasks_legacy_source_entry_candidate_key` partial index as removal candidates once it is confirmed (e.g., by a schema/log audit) that nothing outside this repository calls it directly.

**Recommended timing:** After Phase 2X. Not urgent — it is dead code, not a liability, but the standing ENGINEERING_STANDARDS.md rule ("remove dead code... as part of the change that makes it obsolete" / "a skipped test is acceptable only when... tracked") argues for at least a tracked line item rather than silence.

### F6 — ADR-023's "bounded by the atomic RPC alone" wording is slightly narrower than what `captureEntry` actually does

**Area:** Documentation accuracy
**Severity:** Low
**Where:** `docs/DECISIONS.md` ADR-023 Consequences ("A capture or reprocess request's latency no longer includes any AI call"); `src/features/capture/actions.ts:76-88`.

`captureEntry` calls `capture_entry_async`, then — synchronously, before returning the receipt — runs `Promise.all([entries.select("status"), jobs.select("id,status,next_attempt_at")])` to compute the lifecycle state for the receipt (needed because `resolveDailyCycleLifecycle` needs to know the just-created job's status). This is genuinely parallelized and genuinely does not call the AI provider, so ADR-023's core claim ("no AI call in the response path") is correct and the two extra indexed lookups are unlikely to threaten the documented XG-026 server-side p95 target of 1.5s. This is purely a precision note: a future reader citing ADR-023 to mean "capture's response time is exactly one RPC round trip" would be citing it slightly too strongly.

**Recommended action:** None required; optionally tighten the ADR-023 wording the next time that file is touched for an unrelated reason.

**Recommended timing:** No action.

### F7 — Entry-detail page mixes five content blocks inline at ~300 lines

**Area:** Maintainability
**Severity:** Low (informational — this is explicitly Slice 2X.9's stated scope)
**Where:** `src/app/[locale]/app/inbox/[entryId]/page.tsx` (299 lines).

The page still renders header/status badge, error/organizing notices, the collapsible original, the full Phase 2B-style editor grid (current version + trust panel), the task-confirmation section, and the immutable-history/comparison section, all inline in one component — Slice 2X.8's stated non-goal was exactly to leave this layout untouched while swapping its data source. This is correctly scoped debt, not an oversight: the Slice 2X.8 report explicitly defers the "decision-first, five-block, progressive-disclosure" reorganization to Slice 2X.9, and the current file is functionally equivalent to the pre-2X.8 page by design (to preserve the un-rerunnable online Playwright spec's selectors). Flagged here only because the review's task list asked for files that have "grown beyond a reasonable responsibility boundary," and this is the clearest example in scope.

**Recommended action:** None beyond what Slice 2X.9 already plans.

**Recommended timing:** Naturally handled by Slice 2X.9.

### F8 — No online Playwright coverage for candidate-consistency journeys

**Area:** Test coverage (carryover, restated with current status)
**Severity:** Low
**Where:** `e2e/intelligent-capture.spec.ts`; absence of a spec covering "correct an interpretation and see the old candidate become unconfirmable," "record-only removes all actionable candidates," or "undo a confirmation and reconfirm the same index."

The Slice 2X.7 report already documents this gap and its rationale (real AI-generated candidate content makes a deterministic Playwright script for this specific journey harder to author than the slice's time allowed, and the dedicated progressive-disclosure UI these journeys would exercise doesn't exist until Slice 2X.9) and argues the RPC-level invariants were instead verified more precisely by the remote smoke script. That trade-off is reasonable for 2X.7. It is worth re-flagging now because Slice 2X.9 is about to make this exact page's visual structure change materially, which is exactly the moment a regression in candidate-consistency UI behavior (as opposed to RPC behavior, which the smoke already covers well) would be easiest to introduce and hardest to notice without end-to-end coverage.

**Recommended action:** Add the Playwright journey(s) as part of Slice 2X.9's own e2e work (the plan for 2X.9 already lists "Playwright correction, record-only, candidate confirm/undo... em PT-BR/en, desktop/mobile" as a required step) rather than as separate work.

**Recommended timing:** During Slice 2X.9 (already on that slice's own plan; this finding confirms it should not be dropped).

## 5. Positive architectural findings

### F9 — Candidate confirmation RPC design (migration 028) is a clean, well-reasoned piece of concurrency control

`confirm_entry_task_candidates` (migration `028:1015-1181`) does the right things in the right order: it checks idempotency by `operation_key` before touching anything else (cheap early return on replay), locks the `entries` row and re-reads `current_interpretation_id` inside that lock rather than trusting the caller's claim, rejects `is_record_only` before any candidate work, and uses an interpretation-scoped partial unique index (`tasks_source_interpretation_candidate_key`) plus `ON CONFLICT ... DO NOTHING` for safe concurrent-confirmation races — proven by the remote smoke's concurrent-confirmation test actually producing exactly one task. The migration's own documented discovery that the `FOR UPDATE` lock on `entry_interpretations` was unnecessary (the `entries` lock already serializes correctly) and its removal from both RPCs is a good instance of finding and eliminating an unnecessary lock rather than defensively keeping it "just in case."

### F10 — The import-boundary guardrail test is a low-fragility way to enforce a real architectural rule

`page.architecture.test.ts` checks for literal banned import strings (`database.types`, `Database["public"]`, `@/lib/supabase/server`, `entry.status`) rather than asserting anything about internal logic or variable names. This is meaningfully more robust than the pre-existing Deno-source-text-matching convention the prior review's F7 flagged (which is fragile to unrelated renames) — an import path is a stable, intentional public contract, not incidental source text, so this test can only fail when the actual architectural boundary it enforces is actually crossed. This is a good pattern to reuse for any future central page/component that needs the same guarantee.

### F11 — Independent-loader failure isolation in Slice 2X.8 is a deliberate, correctly-tested trade-off

`loadEntryReviewProjection` and `loadEntryTechnicalDetailsProjection` each call `loadInterpretationReview` separately specifically so a technical-detail failure (malformed trust JSON, an unexpected query error) can never block or misreport the primary review — verified in `page.tsx:97-105` by wrapping only the technical call in `try/catch`. The Slice 2X.8 report is explicit that the cost (two database round trips instead of one) was accepted deliberately rather than optimized away prematurely, with a clearly stated future option (`Promise.allSettled` over a single shared load) if the cost is ever measured and found to matter. This is exactly the kind of documented, reversible trade-off the engineering standards ask for.

## 6. Comparison with the previous 2X.3/2X.4 review

- **F1/F2 (Node/Deno drift, previous review):** unchanged, not worsened (this review's F3). No slice in this window touched the affected files.
- **F3 (`entry.ts` mixing four concerns):** out of this review's scope; unchanged, `entry.ts` was not touched by 2X.5–2X.8.
- **F4 (repeated auth-resolution blocks in migration 026):** unchanged; migration `028` adds no new `p_service_user_id`-branching function, so no new instance of this pattern was introduced.
- **F5 (RPC bodies spread across migrations):** the pattern continues as expected under the append-only migration model — `correct_entry_interpretation` now has an authoritative body in migration `029`, its fourth location (`020`→`021`→`028`→`029`). This is inherent to the model, not a new problem, and the prior review's recommendation (a "current definition" pointer table in `DATABASE.md`) remains not yet implemented but still low-cost and optional.
- **F10 (no premature abstraction, previous review, positive):** still holds. 2X.5–2X.8 introduced no generic framework — the two new projection modules in 2X.8 are the minimal shape the requirement needed (a pure mapper plus a thin loader, mirroring 2X.6's existing `inbox-projection.ts` pattern), and `kickEntryInterpretationWorker` continues to be reused as-is by three call sites rather than being generalized further than needed.
- **F12 (no secrets-provisioning runbook):** out of this review's scope; unchanged, no new secret was introduced by 2X.5–2X.8 (the worker nudge reuses the existing authenticated Bearer-token contract with no new secret, per ADR-023).
- **New risk pattern this review adds:** where the prior review's dominant theme was *duplicated logic across runtimes* (Node vs Deno), this review's dominant new finding (F1) is a *duplicated derivation of the same fact* within a single runtime — `hasMaterializedTaskForCandidates`/`unavailableCandidateIndexes` are two different computations of "is this candidate already handled," maintained separately, and they silently disagree. This is the same "silent divergence, no error, just wrong data" risk shape the prior review named as this codebase's dominant pattern, now found within TypeScript rather than across the Node/Deno boundary.

## 7. Recommended actions before Slice 2X.9

1. ~~Fix F1 (`hasMaterializedTaskForCandidates` entry-scoping).~~ **Resolved 2026-07-18** — see the F1 finding above and `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md`.

Nothing else in this review rises to a blocker for starting 2X.9.

## 8. Recommended actions before main

1. F2 — extend the `55P03` substitution to `undo_operation`'s `40001` raise and add client-side handling to both undo Actions.
2. F3 — add the Node/Deno drift-detection test (carried over, unchanged priority).
3. F4 — prioritize enabling pgTAP execution in CI given the growing, currently-unexecuted assertion count.

## 9. Items safe to defer until after Phase 2X

1. F5 — schedule `confirm_entry_tasks` and its legacy partial index for removal once confirmed unused externally.
2. F6 — tighten ADR-023's wording opportunistically.
3. The prior review's F3–F9, F11, F12 (unchanged, out of this window's scope).

## 10. Conclusion: may Slice 2X.9 start?

**Yes, with one condition — now satisfied.** No finding in this review is a security defect, an RLS/ownership gap, a data-loss risk, or an architectural blocker. F1 was a genuine correctness defect that already affected shipped behavior (Inbox, Home, and the entry-detail page since Slices 2X.6/2X.8); it was narrowly scoped (one boolean, computed in two known files, with a clear fix using logic that already existed correctly elsewhere in the same files) and did not require re-architecting anything Slice 2X.9 depends on. **F1 was fixed 2026-07-18** by a standalone hotfix outside the slice sequence (see the F1 finding above and `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md`), before Slice 2X.9 started. F2 should still be fixed soon but does not block 2X.9's start, since it concerns the undo RPC surface, which 2X.9 does not plan to touch.

Slice 2X.9 may begin — F1 is addressed and Slice 2X.9 has not yet started.
