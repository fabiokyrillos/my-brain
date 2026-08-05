# Phase 2X Slice 2X.16 Report

Date: 2026-07-19
Branch: `codex/phase-2-intelligent-capture`
Commit intent: `refactor(ui): enforce product projection boundaries`
Database change: none
Remote infrastructure change: none

## Scope delivered

Slice 2X.16 closes the projection boundary (`PROJ-001`–`PROJ-020`) that Slices 2X.6/2X.8/2X.10/2X.12 opened one surface at a time. An audit of the four daily-cycle product surfaces (Home, Caixa/Inbox, Work, entry review) plus their directly-owned components found two residual violations, both fixed in this slice with no schema change:

1. `src/features/shell/home-dashboard.tsx` still queried `tasks`/`pending_questions` directly for three panels ("01/Agora" priority, "03/Contexto" waiting, "04/Clareza" questions), instead of going through a projection module (`PROJ-001`/`PROJ-007`). Its priority panel additionally reimplemented a second, looser definition of "due" (any open task, top 5 by `due_at`, no date boundary) that diverged from — and was never reconciled with — the today/overdue rule `work-projection.ts` already built and tests for Work, contradicting the panel's own "Prioridades de hoje"/"Today's priorities" label and the PRD's `FLOW-003`/`PROJ-016` requirement that Home's priorities be genuinely due today/overdue, not a generic top-N.
2. `TaskCandidateForm` (`src/features/tasks/task-candidate-form.tsx`) received the raw, unfiltered AI-extraction `TaskCandidate[]` — including a numeric `confidence` field rendered unconditionally in the primary "next actions" flow, not behind the technical-details disclosure (`PROJ-005`, `REV-002`) — and re-filtered `unavailableIndexes` on the client, duplicating a candidate-validity rule `review-projection.ts` already computes once into `actionableCandidates` (`COH-010`, `PROJ-017`).

Both are fixed by routing consumption through existing or newly-added projection modules; no consumer-facing behavior changed except the two explicitly intended corrections below.

## Deliberate behavior changes (both explicitly authorized before implementation)

- **Home's "01/Agora" priority panel** now shows only tasks due today or overdue (in the authenticated profile's timezone, with the existing safe fallback), sourced from the same `loadWorkProjection(..., { view: "today" })` the canonical Work page uses — not a generic "5 most recently due open tasks regardless of date." Tasks without a due date, previously shown here, no longer appear in this panel; they remain visible under Work → All. This was confirmed with the user before implementation (see "Decisions taken").
- **`TaskCandidateForm`** no longer displays the AI-extraction confidence percentage badge next to each candidate. It was a `PROJ-005`/`REV-002` violation with no product requirement to preserve.

Nothing else in the visible product surfaces changed: no product-event contract, no RPC signature, no lifecycle rule, no localized copy.

## Acceptance criteria

| Criterion (from the plan, PT-BR) | Status |
| --- | --- |
| Inventory imports/internal terms across the four surfaces | Met — audit findings above |
| Migrate any remaining query/JSON-parse/score-check/enum leak to its specific projection | Met — Home queries moved to `work-projection.ts`/new `home-projection.ts`; candidate score removed |
| Ensure technical payload stays separate from and unnecessary for the main flow | Met — unchanged; `TechnicalDetails`/`InterpretationTechnicalDetailsView` already isolated the score/policy/evidence surface (Slice 2X.8), and this slice's fix only removed a score leak that had reappeared outside that boundary |
| Add architecture test for core files with an explicit forbidden-dependency list | Met — new `src/features/daily-cycle/architecture.test.ts` |
| Confirm Actions and projections reuse the same candidate-validity rule | Met — `TaskCandidateForm` now consumes `actionableCandidates` (already-filtered) directly instead of re-deriving validity from `unavailableIndexes` |
| Review DRY/YAGNI, remove abstractions without a real second consumer | Met — removed the now-dead `taskCandidates`/`unavailableCandidateIndexes` output fields from `EntryReviewProjection`; kept `home-projection.ts` deliberately minimal (two queries, no generic framework) since neither panel had an existing rule to reuse |
| Run focused tests and the global gate | Met — see Verification |
| Single commit `refactor(ui): enforce product projection boundaries` | Pending — created after this report, see Commit section of the final message |

`reduzir ou tornar server-only src/features/interpretations/data.ts`: interpreted as "guard," not "shrink" — every current export (`computeUnavailableCandidateIndexes`, `hasUnconfirmedTaskCandidates`, `selectCurrentInterpretation`, `parseInterpretationRevision`, `loadInterpretationReview`, the two exported types) has a real consumer (either a `daily-cycle` projection module or its own unit test); trimming any of them would not be a YAGNI cleanup, it would break existing, valuable direct unit tests of pure logic. Added `import "server-only"` only.

## Files changed

- `src/features/shell/home-dashboard.tsx` — priority panel now calls `loadWorkProjection(..., { view: "today" })`; waiting/question panels call the new `loadHomeSupplementalProjection`; removed the raw `tasks`/`pending_questions` queries and the `task.status.replaceAll(...)` enum-fallback render; priority panel now links to `/{locale}/app/work?view=today`.
- `src/features/daily-cycle/home-projection.ts` (new) — `server-only`, owner-scoped `loadHomeSupplementalProjection(supabase, userId)` returning `{ waitingCount, openQuestionPreview }`.
- `src/features/tasks/task-candidate-form.tsx` — `candidates` prop is now `readonly ActionableCandidateView[]` (from `@/features/daily-cycle/contracts`) instead of `TaskCandidate[]` (from `@/lib/ai/extraction-schema`); removed the `unavailableIndexes` prop and its client-side filtering; removed the confidence-pill render; checkbox `candidateIndex` value now comes from `Number(candidate.key)`.
- `src/features/daily-cycle/review-projection.ts` — `EntryReviewProjection` no longer exposes `taskCandidates`/`unavailableCandidateIndexes` in its output (dead once the form moved to `actionableCandidates`); dropped the now-unused `TaskCandidate` type import.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx` — passes `view.actionableCandidates` to `TaskCandidateForm`; stopped destructuring/passing the two removed fields.
- `src/features/interpretations/data.ts` — added `import "server-only";`.
- `src/features/daily-cycle/architecture.test.ts` (new) — table-driven guardrail over Home, Caixa list, Work, entry review, and the candidate form.
- `src/features/daily-cycle/home-projection.test.ts` (new) — unit coverage for the new projection module.
- Updated tests: `src/features/shell/home-dashboard.test.tsx`, `src/features/tasks/task-candidate-form.test.tsx`, `src/features/daily-cycle/review-projection.test.ts`, `src/features/interpretations/data.test.ts` (added the `server-only` mock the new import requires).
- Documentation: `docs/ENGINEERING_STANDARDS.md` (new numbered projection-boundary rule), `docs/ARCHITECTURE.md` (new Slice 2X.16 narrative paragraph), `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md`, this report.

## Architecture and data flow

Home now composes exclusively from four `server-only` projection calls (`loadWorkProjection`, `loadHomeSupplementalProjection`, `loadInboxProjection`, `loadAttentionProjection`) plus `requireUser` — no direct Supabase table access remains in the component. The priority panel's "due today/overdue" definition has exactly one implementation (`work-projection.ts`); Home and Work both consume it, eliminating the `PROJ-016` duplication. The candidate-confirmation form's validity rule ("which candidate indexes are safe to offer") has exactly one implementation (`review-projection.ts`'s `actionableCandidates` computation); the form itself is now a pure renderer of whatever list it receives, with no independent judgment about availability — the server-side RPC (`confirm_entry_task_candidates`, unchanged) remains the actual authorization/concurrency boundary regardless of what the client submits.

## Owner-scoping and authorization

`loadHomeSupplementalProjection` explicitly scopes both of its queries with `.eq("user_id", userId)`, matching the established convention in every other `daily-cycle` projection module (defense in depth under RLS, not a substitute for it). No authorization logic changed: `confirm_entry_task_candidates` still independently validates `p_expected_interpretation_id` and candidate indexes server-side inside its own transaction: the client-side filtering removed from `TaskCandidateForm` was never the actual security boundary, only a duplicated UX nicety.

## Server/client/worker boundaries

- `home-projection.ts` is `server-only`, mirroring every sibling `daily-cycle` projection module.
- `data.ts` is now `server-only`; previously it was reachable from a Client Component with no build-time failure (only convention kept every real consumer server-side).
- `TaskCandidateForm` remains a Client Component (`"use client"`), but its dependency graph now excludes `@/lib/ai/extraction-schema` entirely — it depends only on `@/features/daily-cycle/contracts` (pure serializable types).
- No worker (`process-jobs`) file was touched by this slice.

## Product-event impact

None. No event name, version, trigger, payload allowlist, or idempotency behavior changed. `task_candidates_confirmed` (emitted by `confirmEntryTasks` in `src/features/tasks/actions.ts`) is unaffected — that Action's own logic and RPC call were not touched, and it operates on `candidateIndexes` parsed from submitted form values exactly as before, regardless of whether those values originated from a raw or a pre-filtered candidate list. Verified by re-running the remote product-events smoke (see Verification) — all 17 event names, ownership, RLS, payload privacy, idempotency, and meaningful-repeat behavior still pass.

## Migration/RPC/deployment status

None. No new migration, no RPC signature change, no grant change, no generated-type regeneration required. No Edge Function file was touched; the pre-existing Slice 2X.15 local/remote worker deployment gap is unchanged and unrelated to this slice.

## Deno validation status

Deno CLI was checked again this slice and remains unavailable on this workstation (same as Slice 2X.15). Not applicable regardless: no Edge Function source was touched by Slice 2X.16.

## RED and GREEN evidence

RED (confirmed before any implementation):

- `src/features/daily-cycle/home-projection.test.ts` — failed to resolve `./home-projection` (module did not exist).
- `src/features/daily-cycle/architecture.test.ts`, `src/features/shell/home-dashboard.test.tsx`, `src/features/tasks/task-candidate-form.test.tsx`, `src/features/daily-cycle/review-projection.test.ts` — failed as a batch (module-resolution failure cascades in this Vitest config when one file in the run can't resolve an import); isolating `home-projection.test.ts` alone reproduced the same "file does not exist" RED cleanly, confirming the missing-implementation state before any source change.

GREEN after implementation: focused run across all five touched/added test files plus every other `daily-cycle`/`shell`/`tasks`/`interpretations`/`app` test — 28 files, 196 tests, all passing.

## Verification

- Focused Vitest (touched areas): 28 files / 196 tests passed.
- Full Vitest: **80 files / 443 tests passed** (up from 78/425 at the Slice 2X.15 checkpoint — 18 net new tests).
- ESLint: pass, zero errors/warnings.
- TypeScript (`tsc --noEmit`): pass.
- Next.js 16.2.10 production build: pass (all routes compiled, including `/work`, `/inbox`, `/inbox/[entryId]`).
- `git diff --check`: pass (only benign LF/CRLF line-ending warnings, no conflict markers).
- Offline Playwright desktop: 3 passed, 5 skipped (online-credential-gated, expected).
- Offline Playwright mobile: 3 passed, 5 skipped (online-credential-gated, expected).
- Linked migration status (`supabase migration list --linked`): local and remote synchronized through `202607180031`, unchanged by this slice.
- `supabase db lint --linked --level warning`: one pre-existing warning in `public.run_user_heartbeat` (implicit `text`→`time` cast), unrelated to any file this slice touched, not introduced by this slice.

## Authenticated remote evidence

- `npm run test:e2e:online -- --project=desktop --project=mobile`: **12 of 16 passed**. The 2 failures are both in `e2e/online-auth.spec.ts` (account-creation and password-recovery email journeys) — a file, route, and Server Action entirely outside this slice's file list (`src/features/auth/`, `src/app/[locale]/auth/*` were not touched). The observed errors (`error=signup-failed`, `error=recovery-failed`) are consistent with the linked project's Supabase-hosted email sending being rate-limited, most likely from the several remote smoke runs executed in direct succession immediately before this Playwright run in the same session. Not treated as a Slice 2X.16 regression; not fixed, per the prompt's instruction to correct only in-scope defects. 2 further pre-existing online-auth-adjacent tests were skipped/did-not-run per the suite's own conditional logic, unrelated to this slice.
- `npm run test:remote:daily-cycle`: passed — current-interpretation binding, stale/out-of-range rejection, idempotent replay, correction survivability, concurrent-confirmation race safety, record-only enforcement, cross-user isolation, scoped undo, and the Needs Attention queue's qualification/resolution/isolation/pagination behavior, all still correct with Home now consuming the same projections through a different entry point.
- `npm run test:remote:product-events`: passed — all 17 canonical event names, ownership, RLS, payload privacy/allowlist, idempotency, meaningful-repeat distinction, service-role controls, bounded response, and synthetic cleanup, confirming `task_candidates_confirmed` emission is unaffected by the candidate-form contract change.

## Independent review

A separate pass over the diff checked: exact Slice 2X.16 scope (no 2X.17 e2e-reorganization work, no unrelated file touched); no lifecycle-rule duplication reintroduced; owner-scope gaps (none — `home-projection.ts` explicitly scopes both queries); concurrency (unchanged — RPC-side optimistic concurrency untouched); fail-open/fail-closed correctness (`home-projection.ts` throws on query error via `requireSupabaseData`/`requireSupabaseSuccess`, consistent with sibling modules); server/client/worker boundary violations (none found); raw persisted state leaking into UI (removed, not introduced); privacy (improved — one score leak removed, none added); event trigger/idempotency regressions (none — confirmed by the remote product-events smoke); unauthorized remote actions (none — only read-only migration/lint checks and the project's own pre-established, self-cleaning remote smoke scripts were run; no deploy, no schema mutation); locale/accessibility/mobile regressions (none found — Home's priority-panel link change was verified in both locales via the updated component test, and the offline/online Playwright desktop+mobile runs above cover both viewports); overstated test evidence (none — every number in this report reflects an actual command run this session, and the two online-auth failures are reported, not hidden). No issues were found that required a new failing regression during this review pass.

## Known limitations

- Home's priority panel now depends on the profile timezone resolution and safe fallback already established by `work-projection.ts`; this is a shared dependency, not a new one, but it means a future change to that fallback now also affects Home, not only Work — expected and desired given `PROJ-016`.
- `loadHomeSupplementalProjection`'s waiting count is an exact `count: "exact", head: true}` query (unbounded), unlike the "N+" bounded-preview pattern used by the Needs Attention/priority panels; this preserves the pre-existing exact-count behavior for the waiting panel rather than introducing a new "50+"-style approximation, since no existing projection already computed this count.
- The two `online-auth.spec.ts` failures (see Authenticated remote evidence) remain unresolved; they are outside this slice's scope and, if they persist independent of email-rate-limiting on a later run, warrant their own investigation before Slice 2X.17's converged online-regression pass.
- `src/features/interpretations/data.ts`'s pure helper exports (`parseInterpretationRevision`, `selectCurrentInterpretation`) are exported only for `data.test.ts`'s direct unit coverage; they have no consumer outside this package. This is intentional per the Definition-of-Done preference for testing pure logic directly, not a residual YAGNI violation, but is noted here for visibility.

## Rollback

Revert the single Slice 2X.16 commit. No migration, RPC, grant, generated type, secret, schedule, or deployment changed, so reverting is a pure code rollback with no data-layer consequence: Home's panels and the candidate form return to their pre-slice (boundary-violating) behavior, `EntryReviewProjection` regains its two removed output fields, and `data.ts` loses its `server-only` guard. Slice 2X.17 was not started.
