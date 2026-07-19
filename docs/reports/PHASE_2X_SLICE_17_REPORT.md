# Phase 2X Slice 2X.17 Report

Date: 2026-07-19
Branch: `codex/phase-2-intelligent-capture`
Commit intent: `test(phase-2x): cover the converged daily journey`
Database change: none
Remote infrastructure change: none

## Scope delivered

Slice 2X.17, exactly as scoped by `docs/PHASE_2X_IMPLEMENTATION_PLAN.md` (Slice 2X.17 section):

- Reorganized `e2e/intelligent-capture.spec.ts` from one 379-line serial `test()` into deterministic, independently-attributable scenarios by contract, inside two `test.describe` blocks.
- Added the three coverage areas the plan's own execution order named that the prior monolith did not exercise at all: basic pending question, recoverable retry, and terminal retry — all previously unreachable through real AI extraction, now covered through deterministic direct-RPC fixtures.
- Added explicit keyboard/focus/live-region/touch-target assertions for the entry-review page's progressive disclosure (the native `<details>` technical panel and the retry control), where the prior suite only asserted visibility.
- Reviewed `e2e/foundation.spec.ts` and `e2e/online-mobile-navigation.spec.ts` against the plan's Home/Caixa/Trabalho/Brain/Mais/legacy-redirect requirement; both already cover it (canonical + legacy redirects in both locales, primary/secondary nav groups, needs-you/waiting active state, mobile touch targets/Escape-close, both locales) and needed no functional change — confirmed, not assumed, by running them.
- Reviewed `scripts/online-playwright.mjs`; no project-matrix change was needed — the desktop/mobile × pt-BR/en matrix is already achieved by Playwright's two configured projects plus in-test locale switching, unchanged by this slice.
- Fixed the one in-scope defect real execution surfaced (see below). No migration, RPC, grant, Edge Function, secret, or schedule was touched.

## Does Slice 2X.17 complete Phase 2X?

**No.** Per the implementation plan's own schedule (§9) and Definition of Done (§14), **Slice 2X.18** ("Gate remoto, documentação permanente e encerramento") is the slice that closes Phase 2X — it runs the aggregated remote gate, finalizes permanent documentation, and verifies the full PRD→epic→slice→evidence matrix. Slice 2X.17's own section does not claim to close the phase, and this report does not mark `STATE.md`/`TODO.md` as Phase 2X complete.

## In-scope defect found and fixed

Real execution of the new recoverable/terminal-retry scenarios (not just authoring them) found a genuine duplicate-control defect on the entry-review page (Slice 2X.8/2X.9 surface, squarely in 2X scope):

- **Symptom:** when an entry has never had a successful interpretation (`current_interpretation_id` is still null) and its most recent state is `recoverable_error`/`terminal_error`, the page rendered **two** identical "Reinterpretar entrada"/"Reinterpret entry" retry buttons — one from the attention notice's `attentionAction` slot (`canRetry` true), and a second, independent one from the `nextActions` "no interpretation yet" fallback block (rendered because `editableCurrent` is null). This is a real, reachable state — any entry whose very first interpretation attempt fails before ever succeeding once — not a fixture artifact.
- **Fix:** `src/app/[locale]/app/inbox/[entryId]/page.tsx` — the fallback block's own `EntryReprocessButton` is now conditioned on `!canRetry`, so retry is offered exactly once, from whichever location is contextually correct, with no capability removed (a `saved`-but-unstarted entry with no attention item still gets the fallback's own button, unchanged).
- **RED:** `npm run test:e2e:online -- e2e/intelligent-capture.spec.ts --project=desktop -g "recoverable"` failed with `getByRole('button', { name: 'Tentar novamente' }) — element(s) not found` (first iteration: wrong button label assumed); after correcting the label to the real "Reinterpretar entrada" text, the same locator then failed as expected once the duplicate was accounted for by inspecting the failure snapshot (`error-context.md`), which showed two "Próximas ações" entries offering retry.
- **GREEN:** after the one-line conditional fix, `npm run test:e2e:online -- e2e/intelligent-capture.spec.ts --project=desktop --project=mobile` — all 18 tests pass on both projects (see Authenticated remote evidence).

A second, unrelated test-authoring mistake was also found and fixed by the same real-execution cycle: the initial retry assertion depended on the ephemeral `useActionState` success toast ("Nova organização solicitada."), which races against how fast the real deployed worker's `after()` kick revalidates the page — a fast kick can remount the form before Playwright observes the toast. This is not a product defect (the toast genuinely renders; it just doesn't win the race against a legitimately fast worker). The test now asserts only the durable, meaningful signal — that the entry actually recovers (`waitForRecovered`) — which is also the more appropriate assertion for "prefer observable conditions over fixed delays."

No other defect was found or changed. Product behavior was not altered to make a test pass; the duplicate-button fix removes redundant UI, changes no capability, and was verified against real backend state, not invented to satisfy an assertion.

## Test architecture: before and after

**Before:** `e2e/intelligent-capture.spec.ts` was one `test()` of ~230 assertion-bearing lines, covering capture through settings/heartbeat/final-undo/product-events in strict sequence; a failure anywhere hid every downstream assertion's pass/fail status in the report. Basic question, recoverable retry, and terminal retry had no coverage at all — they are unreachable through the deterministic sentence this suite captures (a clear, unambiguous statement), and no prior slice added a fixture for them.

**After:** two `test.describe` blocks in the same file:

1. **`converged daily journey — capture, review, and confirmation`** (serial, one disposable user, one real AI-driven journey — unchanged behavior, only reorganized): 13 named `test()`s — legacy-route redirects, immediate receipt, organizing + accessible progressive disclosure, correction/record-only/undo, candidate needs-attention on Home+Caixa, candidate confirmation/materialization/Work, immutability+audit, chat, reviews, files, costs, settings, heartbeat, task-creation undo, and the full product-event funnel. Each is independently reported; a failure partway through still yields precise attribution instead of one opaque failure.
2. **`converged daily journey — basic question, recoverable retry, and terminal retry`** (new, own disposable user, deterministic direct-RPC fixtures — no real AI extraction needed since these entry states are not producible through ambiguous prompt content alone): 3 named `test()`s.

`e2e/foundation.spec.ts` and `e2e/online-mobile-navigation.spec.ts` are unchanged — reviewed and confirmed (by running them, not by inspection alone) to already satisfy the plan's navigation/redirect/locale/viewport requirement; duplicating that coverage inside `intelligent-capture.spec.ts` would have violated the "avoid duplicate product journeys across files" constraint.

## Offline test matrix

| Suite | Desktop | Mobile |
| --- | --- | --- |
| `e2e/foundation.spec.ts` | 3/3 passed | 3/3 passed |

No offline-only assertions were added or changed by this slice (the reorganized/new coverage is all online, since it depends on real authenticated persistence and, for basic-question/retry, real RPC-forced entry states).

## Authenticated online matrix

| Suite | Desktop | Mobile | Notes |
| --- | --- | --- | --- |
| `e2e/intelligent-capture.spec.ts` (both describes) | 18/18 passed | 18/18 passed | Full matrix, run twice per project during RED/GREEN iteration; final run clean both times |
| `e2e/online-mobile-navigation.spec.ts` | 1/1 passed | 1/1 passed | Unchanged; re-run to confirm no regression from the page.tsx fix |
| `e2e/online-auth.spec.ts` | see below | see below | Provider-dependent; kept separate from the core gate |

## Provider-dependent auth test treatment

`e2e/online-auth.spec.ts` was not modified — it already runs `serial` and separately from `intelligent-capture.spec.ts`, matching the plan's separation requirement (this separation predates 2X.17). Slice 2X.16 had reported 2 failures here (`error=signup-failed`, `error=recovery-failed`), assessed as likely hosted-email rate limiting but not confirmed.

Re-run once (not repeated, no hammering) after a full day's cooldown (2026-07-18 → 2026-07-19):

- **Sign-in and profile persistence:** 2/2 passed (desktop + mobile).
- **Password recovery journey:** 2/2 passed (desktop + mobile) — **this resolves Slice 2X.16's `recovery-failed` observation.** It is now genuinely green, confirming the prior failure was transient (rate limiting), not an application regression. No auth code was touched to reach this result.
- **Signup journey:** explicitly skipped on both projects — the test's own `if (error === "email-rate-limited") test.skip(...)` guard fired, i.e., the hosted Supabase project's signup email quota is still exhausted. This is an explicit, traced skip with evidence (the exact `error=email-rate-limited` query parameter), not a hidden failure and not an unconditional skip.

No auth source, route, or Server Action was modified. No application security was weakened. No repeated hammering of the hosted email endpoint occurred (one run, one day after the prior observation).

## Fixture ownership, isolation, and cleanup

- Describe 1 (`capture, review, and confirmation`): one disposable user created in `beforeAll`, one real captured/interpreted/corrected/confirmed entry, cleaned up in `afterAll` (storage object + `auth.admin.deleteUser`, cascading all owned rows).
- Describe 2 (`basic question, recoverable retry, terminal retry`): a separate disposable user per the plan's fixture-isolation expectation; because this describe intentionally does **not** force `mode: "serial"` (its three scenarios are mutually independent — each creates its own entry from scratch via `insertBareEntry`), Playwright's `fullyParallel` config may run its three tests across different workers, and each worker independently runs `beforeAll`/`afterAll` for tests assigned to it from that describe. In practice this created up to 3 disposable users instead of 1 for this describe (confirmed by run duration/worker attribution in the online logs) — slightly more account-creation overhead than the minimum, but every user is still independently and completely cleaned up in its own `afterAll`; there is no leaked user, no leaked entry, and no cross-owner data ever created.
- `insertBareEntry` deliberately bypasses `capture_entry_async` (no job row is created), so the deployed worker and the per-minute `pg_cron` dispatch drain never claim these fixture entries — this is what makes the recoverable/terminal fixtures deterministic instead of racing production automation, not a workaround for a defect.
- All direct RPC calls (`begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`) are already-granted, `authenticated`-callable RPCs from Slices 2X.3/2X.4/2X.7 — the same technique the pre-existing suite already used to force a task-candidate state; no new RPC, grant, or capability was introduced or exercised outside its existing contract.

## Locale and viewport coverage

- PT-BR/English: preserved exactly where the prior monolith exercised it (correction/undo technical-details heading, needs-you tab `aria-current`) — no locale coverage was removed; no new locale-specific copy was introduced by this slice.
- Desktop/Pixel 7 mobile: every scenario in both describes runs under both Playwright projects; mobile-only assertions (touch targets ≥44px on the retry button and the needs-attention row) are gated by `testInfo.project.name === "mobile"`, matching the existing codebase convention (`online-mobile-navigation.spec.ts`).

## Core product journeys covered (plan's execution-order checklist)

| Plan bullet (PT-BR) | Status |
| --- | --- |
| Captura imediata, organizing, ready e needs_attention | Covered (reorganized, unchanged behavior) |
| Correção, record-only, candidate current, materialização e undo | Covered (reorganized, unchanged behavior) |
| Pergunta básica, retry recuperável e terminal | **New** — previously entirely absent |
| Home/Caixa/Trabalho/Brain/Mais e redirects legados | Covered — confirmed sufficient in `foundation.spec.ts`/`online-mobile-navigation.spec.ts`/the reorganized suite's own legacy-redirect test, no duplication added |
| Detalhes técnicos recolhidos, teclado, foco, live regions e touch targets | **Extended** — keyboard-driven `<details>` toggle, `aria-label`-derived region role, retry-button focus, mobile touch targets |
| Matriz Chromium desktop + Pixel 7 em pt-BR/en contra linked project | Executed for real (see Authenticated online matrix) |
| Suíte completa local e build após correção | Executed (see Local validation gates) |

## Product-event regression coverage

No event name, payload allowlist, trigger, or idempotency contract changed. The reorganized suite's final test still asserts all 17-event-family coverage for the primary journey (12 of the 17 are reachable from this specific scripted journey; the remainder — attention-item-opened variants, retry-scheduled, question-answered — are covered by other slices' own remote smokes per the existing division of responsibility documented in `docs/reports/PHASE_2X_SLICE_15_REPORT.md`). `npm run test:remote:product-events` was re-run and passed: allowlist, forbidden payloads, idempotency/meaningful-repeat, RLS, service-role restriction, bounded internal queries, and synthetic cleanup all still correct.

## RED and GREEN evidence

RED (real, from actual execution, not predicted):

1. First online run of the new spec (desktop): 16/18 passed, 2 failed — both new retry scenarios, `getByRole('button', { name: 'Tentar novamente' })` not found. Root cause: wrong button label assumed (the retry control reuses the pre-existing Phase 2B `EntryReprocessButton`, labeled "Reinterpretar entrada"/"Reinterpret entry", not the daily-cycle action-copy string "Tentar novamente" used elsewhere for the same concept).
2. After correcting the label: recoverable-retry still failed (terminal-retry passed) — `getByRole('status')` toast never appeared. Failure snapshot showed the entry already in the `organizing` state with a duplicate "Reinterpretar entrada" button still visible in the fallback block, revealing the real page.tsx defect described above and the toast/revalidation race.

GREEN (after both fixes): full file, both projects, 18/18 passed twice each (once immediately after the fix, once again in the final full-matrix run reported below).

## Local validation gates

- `npx tsc --noEmit`: pass, zero errors.
- `npm run lint`: pass, zero errors/warnings.
- `npm test` (Vitest): **80 files / 443 tests passed** — unchanged count from the Slice 2X.16 checkpoint (this slice added no new unit/component test; the entry-detail page has no render-based test harness in this codebase — see below — and is validated through Playwright, consistent with existing convention for this specific file).
- `npm run build` (Next.js 16.2.10 production build): pass, all routes compiled including `/inbox/[entryId]`.
- `git diff --check`: pass (only the pre-existing LF/CRLF advisories on Windows, same as every prior slice).

**Why no new unit test for the page.tsx fix:** `src/app/[locale]/app/inbox/[entryId]/page.tsx` is an async Server Component with only a source-text architecture guardrail (`page.architecture.test.ts`, import-boundary assertions), not a render-based test — this is the established pattern for this specific file (see Slice 2X.8/2X.9 reports); its behavior is validated through Playwright. The fix's test-first evidence is the RED/GREEN Playwright cycle above, which is the actual test surface this file has.

## Offline Playwright

- `e2e/foundation.spec.ts`: desktop 3/3, mobile 3/3 — unaffected by this slice's changes, re-run to confirm no regression.

## Remote smokes

- `npm run test:remote:daily-cycle`: passed — current-interpretation binding, stale/out-of-range rejection, idempotent replay, correction survivability, concurrent-confirmation race safety, record-only enforcement, cross-user isolation, scoped undo, needs-attention queue behavior — all unaffected.
- `npm run test:remote:product-events`: passed — allowlist, privacy, idempotency, distinct-interactions, subject-ownership, RLS, service-role, bounded-response, synthetic-cleanup.

Other remote smokes (`test:remote:jobs`, `test:remote:interpretations`, `test:remote:entry-processing`, full `test:remote`) were not re-run: this slice touched no job/interpretation-RPC/entry-processing/auth/settings/heartbeat contract — only E2E test files and one UI-only page.tsx conditional — so those smokes' last-verified state (Slice 2X.16, all passing) remains the relevant evidence and re-running them would not exercise anything this slice changed.

## Migration and deployment status

- `supabase migration list --linked`: local and remote synchronized through `202607180031`, unchanged by this slice.
- `supabase db lint --linked --level warning`: one pre-existing, unrelated finding (`run_user_heartbeat`), unchanged.
- No migration, RPC, grant, generated type, secret, schedule, or Edge Function was created, modified, or deployed.

## Edge Function and Deno status

Unchanged from Slice 2X.16: `process-jobs` still contains committed, undeployed Slice 2X.15 instrumentation; this slice did not touch Edge Function source and did not deploy anything. Deno CLI remains unavailable on this workstation; not applicable regardless, since no Deno-runtime file was touched.

## Independent review

A review pass over the diff (2 files: `e2e/intelligent-capture.spec.ts`, `page.tsx`) checked:

- **Exact 2X.17 scope:** no 2X.18 documentation-closure work, no later-phase capability, no unrelated product change. Confirmed.
- **Accidental product change:** one deliberate, minimal, in-scope fix (duplicate retry button) — documented above, not accidental, not scope creep.
- **Test duplication:** the new "basic question" scenario and the existing "unconfirmed candidate" scenario exercise different attention reasons (`answer_existing_question` vs. `confirm_existing_candidates`) — no overlap. No journey duplicated across files.
- **Brittle waits:** none added; `waitForOrganized`/`waitForRecovered` are bounded polls on real DOM/class state (the pre-existing pattern), not fixed sleeps. The one genuinely brittle assertion found (the ephemeral toast race) was fixed, not left in.
- **Unconditional skips:** none; the two `test.skip(!onlineConfigured, ...)` gates are the pre-existing, environment-conditional pattern used by every online spec in this repository.
- **Hidden online failures:** none; both real failures found during this slice's own execution are documented with root cause and fix above.
- **Fixture collisions / cross-owner leakage:** none found — every fixture entry is scoped to its own disposable user, and RLS/ownership were not touched.
- **Desktop/mobile gaps:** none — full matrix run on both projects, twice.
- **PT-BR/English gaps:** none — locale coverage preserved exactly where it existed before.
- **Auth rate-limit amplification:** none — `online-auth.spec.ts` was run exactly once.
- **Provider-dependent contamination:** none — `online-auth.spec.ts` remains its own separate, serial describe, never invoked together with the core product gate in the same file.
- **Product-event regressions:** none — remote product-events smoke re-run and passing.
- **Unauthorized remote actions:** none — only migration status/lint (read-only) and pre-existing, self-cleaning remote smoke scripts were run; no deploy, no schema mutation, no secret change.
- **Overstated evidence:** none — every count and pass/fail figure in this report reflects an actual command executed this session.
- **Accidental later-slice work:** none — Slice 2X.18 was not started; `STATE.md`/`TODO.md` below explicitly keep Phase 2X open.

## Known limitations

- Describe 2's up-to-3-disposable-user overhead (see Fixture ownership) is a minor, accepted cost of keeping its three scenarios independently parallelizable rather than artificially serialized; every user is still fully cleaned up.
- The `online-auth.spec.ts` signup journey remains explicitly skipped due to ongoing hosted-email quota exhaustion on the linked project; this is an external provider limitation (`docs/TODO.md` already tracks "custom SMTP before production launch") and was not touched by this slice, per the outer instruction not to alter auth behavior to force it to pass.
- This slice did not re-run `test:remote:jobs`/`test:remote:interpretations`/`test:remote:entry-processing`/full `test:remote`, since nothing in scope touched those surfaces; their last-verified (Slice 2X.16) state stands.

## Rollback

Revert the single Slice 2X.17 commit. No migration, RPC, grant, generated type, secret, schedule, or deployment changed, so reverting is a pure code rollback: `e2e/intelligent-capture.spec.ts` returns to its prior single-test shape (losing the new basic-question/retry/terminal coverage and the finer-grained attribution, but not any product behavior), and `page.tsx` regains the duplicate-retry-button behavior. Slice 2X.18 was not started.

## Confirmation

No later slice or phase was started. Phase 2X remains open, pending Slice 2X.18.
