# Phase 2X Slice 2X.14 Report

Date: 2026-07-19
Commit intent: `fix(product): align visible promises with behavior`
Database change: none

## Scope delivered

Slice 2X.14 aligns visible product promises with behavior that already exists. It inventories authenticated Home, Settings, Reviews, capture/reprocessing copy, and AI transparency; classifies each capability as operational, informational, advanced, or future; hides future controls; and makes visible status text depend on existing product projections.

Slice 2X.15 was not started. No new product-event instrumentation, analytics emitter, lifecycle table, scheduler, background service, or navigation reorganization was added.

## Before and after

Before:

- Home omitted a truthful aggregate operating state and showed a static next-review promise based only on a stored preference.
- Settings exposed identity, locale, automatic review schedules, autonomy, privacy, provider, and unused reasoning/background routes even where no runtime consumer existed.
- Saving a reduced form risked losing hidden values because the existing RPC still requires a complete legacy payload.
- Reviews exposed persisted status/period/model details directly and described generation less clearly than the actual on-demand action.
- Capture and reprocessing copy blurred saved, enqueued, organizing, and completed states.

After:

- Home derives `needs attention`, `organizing`, or `all saved` from the existing owner-scoped Inbox and Needs Attention projections, in that precedence order.
- Common Settings contains only proven operational controls. AI model routing and cost transparency live in a collapsed advanced section. Fixed semantic search is explicitly informational.
- Future controls are absent from the form. The server reads the owner's current hidden values and reconstructs the complete legacy RPC payload, preventing accidental resets.
- Reviews load through an owner-scoped server-only projection and render localized DTOs with fail-closed enum mapping; generation is described and reported as manual/on demand.
- Capture receipt, enqueue, retry, organizing, and completion language are distinct and test-enforced in PT-BR and English.

## Product and architecture decisions

1. Visible status must be observable. Home reuses existing product projections instead of adding a second lifecycle model.
2. A persisted field is not automatically a product capability. Controls without a complete runtime consumer remain preserved but hidden.
3. Advanced capabilities remain reachable through progressive disclosure, with a native accessible `details/summary` control and a minimum 44 px target.
4. Settings mutation remains compatible with `save_profile_settings`. A server-side preservation snapshot supplies hidden legacy fields; the client submits only visible operational/advanced controls.
5. Next.js Server Action metadata is transport data. Keys prefixed `$ACTION_` are removed before strict product-schema validation; arbitrary extra product keys remain invalid.
6. Reviews expose product language, not storage language. Unknown period/status values fail closed rather than leaking raw enums.
7. No new database contract is justified by this convergence slice.

## Files and subsystems

- Capability contract and Home status: `src/features/shell/capabilities.ts`, `home-dashboard.tsx`, localized shell messages.
- Honest capture/reprocessing/review action copy: `src/features/daily-cycle/copy.ts`, `src/features/agent/actions.ts`.
- Settings boundary: `settings-contracts.ts`, `settings-form.tsx`, `schema.ts`, `settings-view.ts`, `settings-payload.ts`, `actions.ts`, Settings page and CSS.
- Reviews boundary: `src/features/reviews/review-presentation.ts`, `review-list.ts`, and the Reviews page.
- Browser coverage: intelligent capture, authenticated Settings persistence, and authenticated desktop/mobile navigation journeys.
- Durable product inventory: `docs/PHASE_2X_REPORT.md`.

## Data flows

### Home

`authenticated user -> existing Inbox/Needs Attention loaders -> product DTOs -> deriveHomeOperationalStatus -> localized status panel`

Attention wins over organizing; organizing reports the observable entry count; otherwise Home says all saved. The page no longer queries `agent_preferences.daily_review_time` to imply an automatic review.

### Settings read and save

`authenticated user -> owner-scoped profiles + agent_preferences reads -> SettingsFormValues DTO -> visible form`

`visible FormData -> strip Next transport metadata -> strict product schema -> owner-scoped preservation snapshot -> complete legacy RPC payload -> save_profile_settings`

The client never receives the hidden preference snapshot. Display name, agent name, stored locale, schedule, autonomy, privacy, and unused model routes are preserved on the server.

### Reviews

`authenticated user -> owner-scoped summaries query -> fail-closed localized mapper -> ReviewListItem DTO -> Reviews page`

The projection does not select or expose `model_used`. Manual generation continues through the existing action and reports completion only after the synchronous operation succeeds.

## Security and trust boundaries

- Settings and Reviews reads include `.eq("user_id", user.id)` even though RLS remains active.
- Settings mutation calls the existing RPC only after authenticated ownership and preservation reads succeed.
- Raw rows, hidden settings, and unapproved storage enums do not cross into page Client Components.
- Unknown review enum/model inputs fail closed or fall back to approved product defaults.
- No secret, service-role behavior, policy, grant, migration, or remote infrastructure state changed.

## Localization, mobile, and accessibility

- New visible copy is available in PT-BR and English.
- Authenticated Playwright exercises both locales and both desktop/mobile projects.
- Advanced AI uses accessible native disclosure, visible focus styling, and a 56 px summary target.
- Home uses a status region; Settings success uses `role=status`, errors use `role=alert`, and pending submission disables the action.
- Reviews use localized period/status labels and deterministic date-only formatting.

## TDD evidence

RED was recorded before production changes: 10 focused files failed, with 13 failing and 25 passing tests. Failures covered the missing capability registry/status derivation, false visible controls, incomplete Settings boundary, raw Reviews presentation, and lexical false promises.

Focused GREEN after implementation: 10 files/43 tests, plus the owner-scoped Settings action test. An authenticated run then exposed Next.js `$ACTION_` metadata reaching the strict schema; a regression test was added first, failed as expected, and passed after filtering only the reserved framework namespace.

The first full-suite run also found four stale expectations for the deliberately changed lifecycle copy. Those expectations were aligned with the approved wording before the final gate.

## Verification

- Focused Vitest: 43/43, plus Settings Server Action regression 1/1.
- Full Vitest: 75 files/404 tests.
- ESLint: pass.
- TypeScript: pass.
- Next.js 16.2.10 production build: pass.
- Offline Playwright desktop/mobile: 6 passed, 10 online-gated skips.
- Targeted authenticated online Playwright: 4 passed across Settings persistence and Home/Settings/Reviews navigation in desktop/mobile, PT-BR/English.
- Linked migration history: local and remote synchronized through `202607180031`.
- `git diff --check`: pass.

## Online validation notes

The first authenticated attempt found that the test requested unsupported `America/Belem`; it was corrected to the visible `America/Cayenne` option. The second attempt surfaced the Next.js `$ACTION_` metadata issue described above. After the TDD fix, all four targeted journeys passed and verified real owner data through the linked Supabase project. Disposable test users were cleaned up by the existing harness.

No paid AI or new database behavior was introduced, so the slice did not run mutation-oriented remote worker smokes or change remote infrastructure.

## Independent review

A separate final diff pass checked scope, duplicated lifecycle logic, owner scoping, raw-row/server-only boundaries, localization, mobile reachability, accessibility, and accidental Slice 2X.15 work. The implementation reuses current projections, keeps both new data loaders server-only and owner-scoped, passes product DTOs to pages, includes PT-BR/English copy, and introduces no instrumentation or schema work.

## Known limits

- Home's organizing count reflects the bounded existing Inbox projection contract; the Needs Attention badge retains its existing honest `+` behavior when more rows exist.
- Hidden legacy fields remain in the database and RPC contract for backward compatibility. This slice hides and preserves them; it does not remove schema.
- Fixed semantic search is informative, not configurable.
- Automatic scheduled reviews remain unavailable and are no longer promised by Settings or Home.

## Rollback

Revert the single Slice 2X.14 commit. Because there is no migration or remote infrastructure action, rollback is limited to application code, copy, tests, and documentation. The existing full settings RPC payload remains compatible on either side of the revert.
