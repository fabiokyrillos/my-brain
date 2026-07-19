# Phase 2X Slice 2X.15 Report

Date: 2026-07-19
Branch: `codex/phase-2-intelligent-capture`
Commit intent: `feat(analytics): instrument the daily product funnel`
Database change: none
Remote infrastructure change: none

## Scope delivered

Slice 2X.15 wires every one of the 17 approved product events to one meaningful owner and trigger. Browser-only intent, confirmed visibility and disclosure events use a closed Client Component boundary that calls the existing authenticated Server Action. Successful domain outcomes remain in their existing Server Actions. Processing outcomes are emitted by the entry worker only after its domain RPC persists the corresponding result.

The existing private `product_events` ledger and `record_product_event` / `record_product_event_for_user` RPCs are reused unchanged. No second analytics system, dashboard, aggregation job, lifecycle source, migration, grant, secret, schedule or deployment was added. Slice 2X.16 was not started.

## Complete event inventory

Every event uses contract version `1`. The actor is always the authenticated owner; the worker supplies the persisted entry owner to the existing service-role-only RPC. `entry`, `task` and `pending_question` subject IDs are server-validated by the existing RPC. A dash means that no subject exists or is necessary for that aggregate/intent event.

| Event | Trigger and meaning | Surface | Subject | Exact properties | Repeat/idempotency behavior |
| --- | --- | --- | --- | --- | --- |
| `capture_started` | User submits a capture attempt, before the domain Action; intent | `capture` | — | `captureSource` | One UUID per logical attempt; a later attempt gets a new key |
| `capture_save_succeeded` | `capture_entry_async` persisted entry + job; successful outcome | `capture` | `entry` | `captureSource`, bounded `durationMs` | Deterministic from capture operation key |
| `capture_save_failed` | Durable capture RPC failed; failed outcome | `capture` | — | `captureSource`, bounded `durationMs`, categorical `failureKind` | Deterministic from capture operation key |
| `capture_processing_enqueued` | Initial capture or reprocess enqueue RPC succeeded; successful outcome | `capture` or `interpretation_review` | `entry` | `processingMode` | Deterministic from capture/reprocess operation key |
| `capture_processing_completed` | Worker completion RPC succeeded and persisted entry state is re-read as ready/needs-attention; successful outcome | `server` | `entry` | `processingMode`, bounded `durationMs`, `outcome` | Deterministic from job + attempt |
| `capture_processing_failed` | Worker failure RPC persisted retryable/terminal failure; failed outcome | `server` | `entry` | `processingMode`, bounded `durationMs`, `failureKind` | Deterministic from job + attempt |
| `needs_attention_viewed` | Needs Attention list marker becomes visible; view | `home` or `needs_attention` | — | bounded `itemCount` | Once per session/surface/logical list state |
| `needs_attention_item_opened` | User follows a Needs Attention item; open | `home` or `needs_attention` | `entry` | categorical `attentionReason` | Once per session/surface/entry/reason |
| `interpretation_review_viewed` | Entry review marker becomes visible; view | `interpretation_review` | `entry` | empty object | Once per session/surface/entry |
| `interpretation_corrected` | Correction RPC succeeds; successful outcome | `server` | `entry` | bounded `fieldCount` | Deterministic from correction operation key |
| `technical_details_opened` | User opens the outer technical disclosure; open | `technical_details` | `entry` | empty object | Once per session/entry; nested disclosures do not emit |
| `task_candidates_presented` | Candidate form marker becomes visible; view | `interpretation_review` | `entry` | bounded `candidateCount` | Once per session/entry/candidate presentation |
| `task_candidates_confirmed` | Candidate confirmation RPC succeeds; successful outcome | `server` | `entry` | bounded `candidateCount` | Deterministic from confirmation operation key |
| `question_answered_basic` | Owner-scoped open question update returns the mutated row; successful outcome | `server` | `pending_question` | empty object | Deterministic from question ID |
| `processing_retry_requested` | User retry is accepted, or the worker persists a retryable failure; action/outcome | `server` | `entry` | `retrySource` | Deterministic from job + attempt + source |
| `work_view_viewed` | Canonical Work marker becomes visible; view | `work` | — | `workView` | Once per session/work filter |
| `task_status_changed` | Owner-scoped task mutation succeeds and status actually changed; successful outcome | `server` | `task` | `fromStatus`, `toStatus` | Deterministic from task operation key; no event for a no-op |

## Payload and privacy contract

The allowlist is exact, not additive. Common fields are event name, surface, locale, viewport class, bounded application version, UUID idempotency key, exact event-specific properties, and optional UUID session/subject plus the synthetic-test marker. Counts, durations and enums are bounded by `parseProductEventPayload`; extra top-level or property keys fail closed.

Forbidden data includes entry text, task titles, question answers, review text, prompts, extracted content, trust evidence, raw errors/stacks, database rows/statuses, email/display names, hidden settings, provider/model internals, secrets and service-role metadata. Normal UI code uses only the small targeted interaction exports; the Action still reparses the finite 17-name contract and the database repeats the allowlist/ownership checks. Actor IDs are never accepted from the browser.

## Client/server and ownership boundaries

- Confirmed browser visibility uses `IntersectionObserver`; render, hydration, prefetch and rerender do not count as a view.
- A per-tab session UUID and logical session key prevent Strict Mode/rerender duplicates. Meaningfully new capture/open attempts use fresh UUID keys.
- The client calls only `recordProductInteraction`; the Action reparses the closed payload, authenticates the current user and delegates to the existing server-only recorder.
- Server Actions emit only after their domain RPC/update succeeds. Analytics calls are separate best-effort effects and cannot turn a successful domain mutation into a failure.
- The worker calls only `record_product_event_for_user`, with the owner loaded for the job/entry and an entry subject. Completion is observed only after persisted completion; failure/retry only after persisted failure.
- The database remains the final boundary for actor, subject ownership, allowlist, forbidden keys, RLS and per-owner idempotency.

## Failure behavior

Analytics is fail-open for product availability. RPC/network telemetry failures become `telemetry_unavailable` or a safe worker log and never roll back, block, or falsely fail capture, correction, candidate confirmation, question answering, retry, task mutation or job completion. Contract, authentication and ownership violations remain distinguishable as `invalid_payload`, `unauthenticated` or `forbidden`; they are not treated as successful records. Event delivery itself is not retried by a new client queue.

## Files and subsystems changed

- Product analytics contract/boundaries: `src/features/product-analytics/contracts.ts`, `server.ts`, new `interaction-events.tsx`, and focused tests.
- Domain outcomes: capture, interpretation, task-candidate, agent/question/retry and task-operation Server Actions plus their tests/forms.
- Browser surfaces: quick capture, Home, Needs Attention list/items, entry review/technical details/candidates, canonical Work and supporting CSS/tests.
- Worker outcomes: `supabase/functions/process-jobs/entry.ts` and new `product-events.ts`, with focused worker tests.
- Remote/E2E evidence: `scripts/remote-product-events-smoke.mjs`, `e2e/intelligent-capture.spec.ts`, and `e2e/online-mobile-navigation.spec.ts`.
- Permanent documentation: Architecture, Security, Decisions, State, TODO, Changelog, product inventory and this report.

## RED and GREEN evidence

Strict RED was recorded before production changes: 18 focused files ran with 25 failing and 60 passing tests. The failures covered the missing event-version contract, deterministic idempotency, closed browser interaction boundary, each backend outcome, persisted worker outcomes, visibility/session deduplication, privacy and UI integration.

Focused GREEN after implementation and review: 18 files/134 tests. Additional regressions were added for nested technical disclosures, empty/actually-visible Needs Attention surfaces, rejected browser transport containment, owner-confirmed question mutation, no-op/zero-row task state, primary-action independence and the candidate-confirmation acknowledgement/undo path.

## Verification

- Focused Vitest: 18 files/134 tests passed.
- Full Vitest: 78 files/425 tests passed.
- ESLint: pass with no warning/error.
- TypeScript: pass.
- Next.js 16.2.10 production build: pass.
- Offline Playwright desktop/mobile: 6 passed, 10 credential-gated online tests skipped as expected.
- Authenticated Playwright: intelligent capture desktop 1 passed and mobile 1 passed; online navigation desktop/mobile 2 passed.
- Remote product-event smoke: passed all 17 events, allowlist/privacy rejection, per-owner idempotency, meaningful repeat, ownership/RLS/service-role controls, bounded response and synthetic cleanup.
- Linked migration history: local and remote synchronized through `202607180031`.
- `git diff --check`: pass.
- Deno CLI: unavailable on this workstation; no `deno check` is claimed. The isolated worker emitter passed Vitest/lint and was not deployed.

## Authenticated remote evidence

`npm run test:remote:product-events` exercised the existing linked project with two disposable authenticated owners and real owned entry/task/question subjects. It recorded all 17 canonical names; produced 19 owner-visible rows because distinct capture/processing interactions were intentional; proved duplicate-key deduplication and distinct-key counting; rejected non-allowlisted events, forbidden/free-form payloads, direct table insert, cross-owner subjects and unauthorized service behavior; verified owner RLS and safe count/duration/conversion queries; and cleaned every synthetic fixture/user in `finally`.

Authenticated Playwright queries only safe event names/counts through the disposable owner's access token. It does not expose event payloads or use the service role for observation. The online journeys also proved that capture, processing, Needs Attention, review, candidate confirmation/undo and Work remain usable on desktop and mobile while instrumentation is active.

The local worker source was changed but no Edge Function was deployed, as required by the prompt. Online worker behavior therefore validates the already-deployed foundation; the new deterministic worker emitter is covered locally and awaits the normal later deployment authorization.

## Independent review

A separate final diff pass checked exact 17-event coverage, absence of extras, trigger timing, duplicate risk, client trust, actor/subject ownership, payload minimization, fail-open coupling, desktop/mobile parity, truthful remote evidence and absence of Slice 2X.16 work. It found three in-scope issues: Home's visibility marker was outside the actual Needs Attention panel; a rejected browser transport lacked an explicit Promise catch; and task-status analytics could emit after an owner-scoped update returned zero rows. Each received a focused failing regression before the fix. The final pass found no remaining Slice 2X.15 concern and no unrelated issue was changed opportunistically.

## Known limitations

- Browser interaction delivery is best effort with session deduplication, not an offline/retry queue. Closing the tab during a request can lose an observation without affecting product state.
- `capture_save_failed` covers a failure returned by the durable storage RPC. Pre-RPC client validation/session failures cannot be safely attributed to an authenticated owned subject and are not fabricated.
- Internal verification queries derive only bounded counts, conversion ratios and durations; there is deliberately no dashboard, alert, scheduled aggregation or analytics-driven lifecycle.
- The changed worker emitter is not deployed by this slice because remote deployment was expressly unauthorized.

## Rollback

Revert the single Slice 2X.15 commit. Removing the emitters leaves the existing migration-024 ledger and RPCs inert and does not change product/domain state. No database or infrastructure rollback is necessary. Slice 2X.16 was not started.
