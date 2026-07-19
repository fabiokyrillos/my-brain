# Phase 2X Product Promise Inventory

Last updated: 2026-07-19
Current checkpoint: Slice 2X.15 complete

This inventory records which visible promises have a real consumer or observable evidence. It is the product-facing complement to the implementation plan: operational controls stay visible, advanced controls use progressive disclosure, informational capabilities do not imply configuration, and future capabilities stay hidden until they have a consumer.

## Capability inventory

| Promise or control | Classification | Visible surface | Consumer or evidence | Verification |
| --- | --- | --- | --- | --- |
| Home operational status | Informational | Home status panel | Existing Inbox lifecycle projection and Needs Attention projection; precedence is attention, organizing, then all saved | `capabilities.test.ts`, `home-dashboard.test.tsx`, online navigation journey |
| Time zone | Operational | Settings, common section | Profile timezone drives date interpretation, Work boundaries, reviews, and other localized dates | Settings unit/integration tests and authenticated persistence journey |
| Response personality, tone, and detail | Operational | Settings, common section | Agent response and presentation preferences | Settings schema/payload tests and authenticated persistence journey |
| Quiet hours, important override, and maximum daily follow-ups | Operational | Settings, common section | Existing reminder/heartbeat claim rules consume the persisted preferences | Settings schema/payload tests and authenticated persistence journey |
| Manual review generation | Operational | Reviews | `generateReview` performs the review synchronously on demand | Review page/projection tests and online Reviews journey |
| Chat, extraction, review, and file model routes | Advanced | Collapsed `IA avançada` / `Advanced AI` section | Existing chat, entry worker, review action, and file worker consumers | Settings form/payload tests and existing intelligent-capture Playwright journey |
| Semantic-search model | Informational | Advanced AI section | Existing embedding route uses the fixed `text-embedding-3-small` model | Settings form test; no input is submitted |
| AI cost transparency | Advanced | Advanced AI link and Costs page | Existing costs projection and history | Settings form test and online navigation journey |
| Display and agent names | Future/unsupported as settings | Hidden | No current runtime settings consumer found; persisted values are preserved server-side | Capability registry, payload preservation, and online persistence tests |
| Persisted locale preference | Future/unsupported as settings | Hidden | Locale is selected by the real localized route switch, not by the hidden profile control; stored value is preserved | Capability registry and payload preservation tests |
| Daily, weekly, and planning schedules | Future | Hidden | No automatic review scheduler exists | Capability registry, Settings visibility tests, online hidden-control assertions |
| Autonomy level and follow-up intensity | Future | Hidden | No complete user-observable execution contract exists | Capability registry and Settings visibility tests |
| Default privacy control | Future | Hidden | No complete settings-to-runtime consumer exists | Capability registry and payload preservation tests |
| Reasoning and background model routes | Future | Hidden | No runtime consumer exists for these preference fields | Capability registry and payload preservation tests |
| Review status and period labels | Informational | Reviews | Owner-scoped summaries projection maps supported persisted values to localized product DTOs | Review mapper/loader/page tests |

## Lifecycle language inventory

| Moment | Visible language contract | Evidence |
| --- | --- | --- |
| Saved | Confirms only durable receipt of the entry | Capture receipt and quick-capture tests |
| Enqueued | Says organization or reorganization was requested, not completed | Daily-cycle copy and interpretation action tests |
| Organizing | Derived from the existing Inbox lifecycle projection | Home status tests |
| Retry/attention | Derived from existing retry and Needs Attention projections | Daily-cycle and Home tests |
| Completed | Used only after a synchronous operation or a product projection proves completion | Review action and review projection tests |

## Daily product funnel inventory

The 17 version-1 events are now wired over the existing private ledger: capture intent/save/enqueue/processing outcomes; Needs Attention view/open; interpretation view/correction/technical disclosure; candidate presentation/confirmation; basic question answer; retry; Work view; and task status change. Outcome events live beside the successful domain mutation, worker outcomes require a persisted result, and browser views require confirmed visibility with session deduplication.

Payloads contain only approved categorical values, bounded counts/durations/statuses and opaque owned IDs. No entry/task/question/review content, prompts, evidence, raw errors, user identity fields, hidden settings or model/service metadata is collected. Events support bounded internal conversion/latency checks but are not a lifecycle source and have no dashboard or scheduled consumer. The complete trigger/subject/payload matrix is in `docs/reports/PHASE_2X_SLICE_15_REPORT.md`.

## Enforcement

- `src/features/shell/capabilities.ts` is the static capability registry. Every visible definition names a surface and consumer evidence; future definitions are not visible.
- Settings Server Actions parse only visible product fields. Next.js `$ACTION_` transport metadata is ignored, while any other unknown product field is rejected by the strict schema.
- Hidden legacy preferences are loaded through explicit owner-scoped server queries and merged into the existing full RPC payload. Saving visible settings therefore does not reset future fields.
- Reviews and Settings pages receive localized product DTOs, never raw Supabase rows, storage enums, or model identifiers that are not intentionally exposed.
- The registry is static server/product metadata and is not serialized wholesale to a Client Component.

## Rollback boundary

Slices 2X.14 and 2X.15 add no migration, RPC, generated database type or infrastructure mutation. Slice 2X.15 changes the local Edge Function source but does not deploy it. Its rollback boundary is the application/worker emitters, tests and documentation; the existing migration-024 ledger/RPC remain inert and domain behavior is unchanged.
