# Phase 2E — Slice 2E.7 design and pre-implementation review

**Status: DESIGN REVIEWED AND CORRECTED. SLICE 2E.7 IS NOT STARTED AND NOT ACCEPTED.**

No source file, test, migration, route or component of Slice 2E.7 exists. This document is the
reviewed design and the continuation point. It exists because the design review found twelve critical
defects in the first draft, and losing that review would cost the next session the same budget again.

- Written against branch HEAD `291cc75` (the Slice 2E.6 acceptance commit), working tree clean.
- Session ended on an external blocker: the weekly model usage limit was reached. See §7.

## 1. Repository reconciliation at entry (git over documentation)

| Check | Verified truth | Method |
|---|---|---|
| HEAD | `291cc75` — `docs(phase-2e): accept slice 2e6` | `git rev-parse HEAD` |
| Working tree | clean | `git status --porcelain` |
| Tracking | `origin/codex/phase-2e-natural-language-task-updates`, 0 ahead / 0 behind | `git rev-list --left-right --count` |
| Draft PR | #18 OPEN, draft, `headRefOid` = `291cc75`, MERGEABLE | `gh pr view 18` |
| CI on the exact HEAD | run **30292789425** — all three jobs `success` | `gh run view 30292789425` |
| Remote migration parity | **`202607250054`**; `202607250055`–`202607270060` local-only (6 pending) | `npx supabase migration list --linked` |
| Deployed workers | `process-jobs` **v15** | `npx supabase functions list` |
| Tags / releases | only `phase-2d-complete` / "Phase 2D Complete" — nothing from Phase 2E | `git tag -l`, `gh release list` |

### Drift found — recorded, not silently repaired

1. **`PHASE_2E_PROGRESS.md` was stale by one commit.** It named branch HEAD `2540ca5` and CI run
   `30292038500`; the true HEAD was `291cc75` with a newer green run `30292789425`. This is the
   structural drift the file itself warns about (it is written before the commit that carries it), and
   this is the **fourth consecutive session** to find it. Verify HEAD from `git rev-parse`, never from
   that table.
2. **`STATE.md`, `CHANGELOG.md`, `TODO.md` and `DECISIONS.md` were never updated for Slice 2E.6.**
   Commit `291cc75` touched only `PHASE_2E_PROGRESS.md` and `PHASE_2E_SLICE_06_REPORT.md`.
   `STATE.md:3` still reads "Slice 2E.5" and `STATE.md:7` still says "Slices 2E.6–2E.8 have not
   started", which the accepted Slice 2E.6 report contradicts. That is a Definition-of-Done §13 gap on
   an already-accepted slice. **Owner: Slice 2E.7's closeout.** It is documentation catch-up and does
   not reopen 2E.6's implementation.

## 2. What Slice 2E.7 owns (verified against the PRD and the code, not against prior reports)

**Fully open:** `2E-UX-002`, `2E-A11Y-001/002/003/004`, `2E-ANALYTICS-001/003/004/005/006`, `2E-UNDO-005`.
**Partially open, remainder is 2E.7's:** `2E-UX-001` (presentation), `2E-UNDO-006` (rendering half),
`2E-DESTRUCTIVE-006` (rendered affordance).
**Non-regression proofs only:** `2E-I18N-001/002/003`, `2E-COMMAND-009`, `2E-OWNERSHIP-005`, `2E-ANALYTICS-002`.
**Physically discharged here under another epic's acceptance:** `2E-PROVENANCE-002`, `2E-COMMAND-011`.
**Reclassified by review as NOT dischargeable here:** `2E-COMMAND-012` — see §5, finding `2E7-PROV-007`.
**Contested, surface-only handling:** `2E-UNDO-007` — see §5, finding `SEC-2E7-08`.

Starting facts confirmed by grep/execution, all of which the design depends on:

- `AIProvider.parseTaskCommand` exists (`src/lib/ai/provider.ts:21`, impl `openai-provider.ts:117`) and
  has **no production caller**. 2E.7 builds the caller, not the parser.
- `src/features/task-commands/` is 16 source files: **zero** `"use server"`, zero `.tsx`, zero routes.
- All seven Phase 2E RPCs are already present in `src/lib/supabase/database.types.ts`.
- `productSurfaces` holds 9 values with **no** command surface; 22 event names, **none** from Phase 2E.
  No Phase 2E event name is chosen anywhere — not even in the PRD. 2E.7 must invent them.
- `cancelled` is still invisible: no `WorkItemHumanState` mapping (`projection-mappers.ts:85-93`), and
  filtered at query level in all three work views (`work-projection.ts:127,132,137`). Slice 2E.5
  changed the database only.
- CI runs exactly one Playwright spec: `e2e/foundation.spec.ts` (`ci.yml:183`).

## 3. Design decisions that SURVIVED review unchanged

- **Deterministic continuation by re-derivation, not re-parsing.** The client round-trips the raw model
  proposal plus a pinned clock; every step re-runs `validateTaskCommand` server-side. Re-parsing per
  step was rejected because the model could return a different command than the one previewed, so the
  user would apply something they never saw. Carrying the computed preview was rejected by PRD §11.1.
- **The recovery surface is a nested route, not a fourth `WorkViewId`.** Adding `"cancelled"` to
  `workViews` would force it into `workItemHumanStates`, `projection-mappers.ts`, `availableActions`,
  the `dailyCycleActions` allowlist, `humanStateCopy` and the `work_view_viewed` property enum — turning
  a Phase 2E recovery surface into a change to the daily-cycle product contract, for a surface whose
  data source is a Phase 2E RPC rather than `work-projection`.
- **`chat_model` is the model route.** `AIRoutes` has no `commandModel`, no PRD requirement asks for
  one, and `resolveAIRoutes` was deleted in pre-2E hardening precisely because each call site resolves
  its own (`model-routing.ts` comment). No new preference column.
- **The SQL error vocabulary is not widened.** Out of the stated slice boundary.

## 4. Corrections the review forced — these replace the first draft

Twelve critical and twenty important findings. The ones that change the architecture:

| # | Correction | Why |
|---|---|---|
| C1 | **`observedBefore` must be PINNED to the session's `issuedAt` for the match family too**, not recomputed per step. | `candidates.ts:231` mints a fresh instant per call and the RPC echoes it into the preview, so the fingerprint differs on every step of one operation key. Replay (`2E-IDEMPOTENCY-004`) becomes unreachable, a double-submit returns `refused` instead of the replayed outcome, and a destructive retry after `2E_TRANSITION_INTEGRITY` can **never** succeed because the surviving confirmation row is bound to the first attempt's fingerprint. |
| C2 | **The first draft's justification for not pinning it was factually false.** | It claimed `observedBefore` "is what the 12-column staleness gate compares against". The gate at `202607260058:1121-1136` compares twelve `locked_task` columns against values derived from `p_pre_state`; `p_observed_before` is only format-validated. Staleness lives in `expected` + `p_pre_state`; the pinned instant carries determinism and request identity. |
| C3 | **The session must carry a staleness witness** — `{taskId, updatedAt}` from the preview that was actually rendered — and pass it as `buildTaskCommandPreview`'s `expected`. | Without it that argument is always absent, `2E-PREVIEW-006` is structurally unreachable, and the apply silently recompute-and-applies, which PRD §12.6 forbids by name. |
| C4 | **Issue the destructive confirmation in the action that RENDERS the preview**, not inside `confirmTaskCommandAction`. | Issuing and consuming in one action binds the token to whatever the session says at Confirm time — never to the preview the user saw. The draft's own stated defence ("editing the patch after issuance fails `2E_CONFIRMATION_REQUIRED`") is unreachable in its own flow. This is a security defect, not a style point. |
| C5 | **Use a hand-rolled `role="dialog" aria-modal="true"`, not native `<dialog>` + `showModal()`.** | Verified by execution: jsdom 29.1.1 has **no** `showModal`/`show`/`close` on `HTMLDialogElement.prototype`; `showModal()` throws `TypeError`. The draft asserted "full `HTMLDialogElement`" from the version number alone. `2E-A11Y-004` would have been unassertable in the only gate CI runs. |
| C6 | **`previewed` needs its own presentation row, keyed on `copy.dispositions`.** | It is a `TASK_COMMAND_PREVIEW_DISPOSITIONS` member deliberately excluded from `TASK_COMMAND_OUTCOMES` (`outcomes.ts:68-75`), and `previewOutcome` returns `null` for it. It is the state that carries the single Apply control — the primary flow of the entire phase — and the draft's outcome-keyed table had no row for it and no `copy.outcomes` key. |
| C7 | **Retry must key off `TASK_COMMAND_FAILURE_POLICY[failure].retryable`, not off the outcome.** | `refused` is not a homogeneous retryability class: `undeclared_failure` is `refused` **and** `retryable: true` (`errors.ts:335-340`), and its own copy says "Try again — resubmitting will not duplicate it." Keying off the outcome renders the lost-response case as a dead end, contradicting `2E-UX-002`. |
| C8 | **The analytics payload must carry `policyVersion` and `signalCategories`.** | `2E-ANALYTICS-001` (`PRD:424`) names seven categories by hand; the draft dropped two. `signalCategories` is a bounded sorted subset of `TASK_MATCH_EVIDENCE` — labels only, never values. Band literals in a CHECK constraint are permanent, so this must be right before the migration lands. |
| C9 | **The recovery route needs a rendered entry point.** | `capabilities.ts:74`'s `nested: true` only drives active-state highlighting (`capabilities.ts:159-178`); links render exclusively from `primaryNavigationKeys`/`moreNavigationGroups`. `/app/work/cancelled` would be reachable only by typing the URL, so `2E-DESTRUCTIVE-006` ("remains reachable through an explicit affordance") is unmet. |
| C10 | **The clarify→create path is unimplementable as drafted.** | `mergeTaskCommandNoMatchClarification` (`creation.ts:84-102`) is **not exported**, and `continueTaskCommandNoMatch` does not return the merged `ValidatedTaskCommand` the creation transports require. Either export the merge or have the decision carry the merged command — and list the `creation.ts` change explicitly. |
| C11 | **Every action needs a `try/catch` over the throwing accepted modules.** | `creation.ts:190-196`, `confirmation.ts:110-116`, `apply.ts:127-136,180-185` and `candidates.ts:221-230` signal precondition faults by **throwing**. An uncaught fault escapes the Server Action and drops the pending command, violating `2E-UX-002`'s "never silently dropped". |
| C12 | **`timeZone` must come from `profiles.timezone` server-side, never from the envelope.** | `2E-I18N-002` would otherwise rest on a client-supplied value. Every other surface reads the profile; the work page already receives `projection.timezone`. The chat mounts must load it. |

Further important corrections to carry: mount the console on `chat/[conversationId]` too (`sendChatMessage`
ends in `redirect()` to that route, so the list-page mount alone breaks Epic 2E-G's "behaves identically");
branch disambiguation on `TaskDisambiguationView.kind` (`confirm_one` must never render as a radiogroup —
`2E-MATCH-012`) and source its copy from `view.copy`; give the radiogroup an explicit submit control so
arrow-key browsing does not fire a round trip per keypress; add a pending state with a polite
announcement, since the submit makes a live model call; re-read the undo row through the 2E-UNDO-005
projection before trusting a client `undoId`; recompute `clarificationUsed` server-side rather than
trusting the envelope; validate `clarification` through the hints schema; reconcile the duplicated
`operationKey` in the envelope; and give the console its own CSS namespace (the repo's only 44px
touch-target rule is scoped to `.work-page`, and `.spin` has no `prefers-reduced-motion` guard).

The complete finding set — 42 findings, with evidence and remedies — is reproduced in §6.

## 5. Corrected work plan, in dependency order

1. `session.ts` — the envelope, its Zod schema, the pinned-clock re-derivation, the staleness witness. Pure, test-first.
2. `analytics.ts` — score/margin band mapper over `TASK_MATCH_SCORE_BANDS`, content-free payload builders. Pure.
3. Migration `202607280061` — `task_command` surface + four event names in the `product_events` surface CHECK, the event-name CHECK, both `private.record_product_event` guards and `private.validate_product_event_properties`; every `create or replace` written from the **current** body (`202607230049:58-71` for the surface CHECK, `202607230050:1033-1059`, `:1061`, `:1226-1243` for the rest — the draft cited the wrong migrations for three of these).
4. `contracts.ts` + `contracts.test.ts` + `scripts/remote-product-events-smoke.mjs` (2E-ANALYTICS-006).
5. `actions.ts` — the seven Server Actions, with C4's issuance placement and C11's fault mapping.
6. `undo-listing.ts`, `recovery.ts` — server-only projections.
7. `copy.ts` additions (register new sections in `copy.test.ts`'s `VOCABULARIES`/`FREE_FORM_SECTIONS`).
8. `command-console.tsx` and its children, including C5's hand-rolled dialog.
9. Routes: `work/cancelled`, plus mounts in `WorkView`, `chat/page.tsx` and `chat/[conversationId]/page.tsx`.
10. Tests, `daily-cycle/architecture.test.ts` table entries, `e2e/task-command.spec.ts`.
11. Docs, including the §1.2 catch-up for Slice 2E.6.

**Gates that must not red:** `copy.test.ts:125-131` (new copy sections), `contracts.test.ts:76-90`
(exact-equality on surfaces and event names), `preview.test.ts:1532-1543` (do not add preview DTO
fields), `errors.test.ts` ↔ `phase_2e_task_command_apply.sql` (do not touch the error vocabulary),
`policy-lock.test.ts` (no policy value changes, no version bump due), `ci.yml:183` (a new spec gates
nothing unless named there and credential-free).

## 6. Full finding set

42 findings across five lenses: 12 critical, 20 important, 10 minor. Two were adversarially verified and
survived; the remaining forty could not be verified before the usage limit was reached, so they are
recorded as **unverified claims with citations**, not as established defects. The two verified survivors
are `2E7-COV-003` (retryability) and `2E7-COV-004` (recovery entry point). One further finding,
`A11Y-2E7-001` (jsdom `showModal`), was verified directly by executing jsdom in this session and is
**confirmed**.

Two review lenses — executable gates and design alternatives — never ran. **A future session must run
them before treating this design as fully reviewed.**

## 7. Why this session stopped

The adversarial design review consumed the account's weekly model budget: 43 of 50 review agents failed
with `You've hit your weekly limit`. Implementation of a slice this size cannot proceed without the
ability to run the verification and review passes the phase's own standard requires, so the session
stopped at the last coherent boundary — the clean, CI-green Slice 2E.6 acceptance commit — rather than
leaving a partially-implemented surface behind.

Note on a reporting hazard: the review workflow's own summary counted the 40 errored verifications as
"refuted". They were **not refuted; they were never run**. Any future automation that computes a
survivor count must distinguish a refuting verdict from a missing one.

## 8. Continuation point

Resume at §5 step 1 with §4's twelve corrections applied. Nothing is merged, deployed, tagged or
released. Remote parity remains `202607250054`. Draft PR #18 remains open and unmerged.
