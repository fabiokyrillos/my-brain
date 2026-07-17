# Architecture Decision Record

Last updated: 2026-07-17

This file is append-only for accepted architectural decisions. Amend a decision by adding a new ADR that supersedes it; do not silently rewrite project history.

## ADR-001 — Supabase as the application backend

- **Date:** 2026-07-16
- **Status:** Accepted
- **Context:** The product needs authentication, relational persistence, file storage, row-level authorization, server-side functions, and scheduled database operations.
- **Problem:** Building and operating independent services for every backend concern would slow the pre-MVP and duplicate infrastructure.
- **Alternatives considered:** Custom Node.js API with managed PostgreSQL; Firebase; Supabase.
- **Decision:** Use Supabase Auth, PostgreSQL, Storage, RLS, RPCs, and Edge Functions as the backend substrate while keeping application/domain behavior in explicit server actions, SQL functions, and AI service modules.
- **Reason:** It provides the required primitives with a small operational footprint and preserves PostgreSQL portability.
- **Consequences:** Schema and policies are production code; migrations and pgTAP validation are mandatory. Supabase must not become a substitute for domain boundaries or ownership validation.

## ADR-002 — PostgreSQL and pgvector for semantic memory

- **Date:** 2026-07-16
- **Status:** Accepted
- **Context:** The personal knowledge system must store structured entities and retrieve semantically related content.
- **Problem:** A separate vector database would introduce synchronization, tenancy, and operational complexity during the pre-MVP.
- **Alternatives considered:** Dedicated vector database; external search service; PostgreSQL with `pgvector`.
- **Decision:** Store embeddings in PostgreSQL using `pgvector`, with HNSW indexes and user-scoped RLS.
- **Reason:** It keeps relational and semantic data transactionally close and uses the existing Supabase platform.
- **Consequences:** Embedding dimensions/model changes require migrations; vector queries must retain tenant filters and be measured before scale-up.

## ADR-003 — Event-oriented heartbeat with scheduled evaluation

- **Date:** 2026-07-16
- **Status:** Accepted
- **Context:** The agent should proactively surface meaningful items without becoming noisy.
- **Problem:** Pure polling or unconditional daily digests ignore user state, quiet hours, cooldowns, and relevance.
- **Alternatives considered:** Fixed cron notifications; application-only polling; database-evaluated heartbeat events.
- **Decision:** Evaluate candidate events in database functions, persist heartbeat runs/notifications, and invoke evaluation through a scheduled worker.
- **Reason:** Database-side evaluation can enforce idempotency and preference-aware limits near the data.
- **Consequences:** Timezone, locale, locking, per-user failure isolation, retry, and delayed-delivery semantics must be explicit. Sprint 1.5 hardens these guarantees before expanding heartbeat scope.

## ADR-004 — Row-level security as the tenant boundary

- **Date:** 2026-07-16
- **Status:** Accepted; hardening completed in Sprint 1.5 (see ADR-014)
- **Context:** Every user-owned record must remain isolated even if client/server queries are incorrect.
- **Problem:** Application-only filters are insufficient as a security boundary.
- **Alternatives considered:** Service-role-only backend access; shared tables with application filters; user-scoped RLS.
- **Decision:** Force RLS on owned tables and authorize rows using `auth.uid()`, with relationship ownership enforced through composite constraints or validated RPCs.
- **Reason:** Defense in depth and database-enforced tenant isolation.
- **Consequences:** Generic CRUD policies are not acceptable for append-only or domain-controlled tables. Policies, grants, RPC security, and cross-user denial require pgTAP coverage.

## ADR-005 — Typed AI provider, routing, and immutable usage ledger

- **Date:** 2026-07-16
- **Status:** Accepted; deployed and verified in Sprint 1.5 (see ADR-014)
- **Context:** Different AI operations need different quality/cost profiles and every provider call must be explainable.
- **Problem:** A single hard-coded model hides operational cost and makes future model changes risky.
- **Alternatives considered:** One global model environment variable; model choice in every call site; central typed routing and pricing catalog.
- **Decision:** Route typed AI operations through a central model profile, calculate costs in integer micro-dollars, and record immutable per-call usage events tied to user and operation.
- **Reason:** Central routing avoids drift and makes costs auditable without floating-point errors.
- **Consequences:** Provider usage must be recorded immediately after a successful provider response, even if downstream persistence fails. Pricing migrations and behavioral cost tests are release gates.

## ADR-006 — Durable AI jobs through a database queue and Edge Function

- **Date:** 2026-07-16
- **Status:** Accepted; operational hardening pending
- **Context:** Attachment processing and other expensive AI work must not block request/response flows.
- **Problem:** In-request processing is fragile and cannot safely retry.
- **Alternatives considered:** Synchronous server actions; external queue; PostgreSQL queue plus Supabase Edge Function.
- **Decision:** Persist owned jobs in PostgreSQL and process them through the authenticated `process-jobs` Edge Function.
- **Reason:** It reuses the platform while making asynchronous state observable.
- **Consequences:** The function must authenticate every request manually when JWT verification is disabled at the platform layer. Job leases, stale-job recovery, retry/backoff, and scheduled invocation remain required operational safeguards.

## ADR-007 — Permanent project-state documentation

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** Agent conversations can be lost and must never be the source of truth.
- **Problem:** A future maintainer cannot safely resume work if status, decisions, changes, and backlog exist only in conversation history.
- **Alternatives considered:** Rely on Git history and implementation plans; maintain a single status document; maintain four purpose-specific living documents.
- **Decision:** Maintain `STATE.md`, `DECISIONS.md`, `CHANGELOG.md`, and `TODO.md` at every completed feature or phase.
- **Reason:** Together they separate current truth, architectural rationale, historical changes, and future work.
- **Consequences:** A feature/phase is not complete until all four files accurately reflect it. Documentation changes belong in the same commit as the completed work whenever practical.

## ADR-008 — Sprint 1.5 is a foundation gate, not a feature phase

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** The Phase 1 review found critical correctness, authorization, navigation, background-processing, and verification gaps.
- **Problem:** Continuing the roadmap would compound risk and make later behavior depend on unstable foundations.
- **Alternatives considered:** Continue directly to Phase 2; fix only security blockers; run a dedicated hardening sprint.
- **Decision:** Complete Sprint 1.5 in the fixed order: permanent documentation, critical fixes, AI routing/cost completion, full quality gate, final documentation and report.
- **Reason:** It reduces compounding risk without restarting architecture or expanding scope.
- **Consequences:** No new product capability is accepted in this sprint. Deferred improvements must be explicit in `TODO.md` and the closing report.

## ADR-009 — Explicit PKCE continuations and local credential policy

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** Signup and recovery relied on implicit Supabase defaults; recovery targeted a missing page and authenticated auth routes were redirected away from reset.
- **Problem:** The application could send a recovery email without providing a complete, safe password-update journey, while raw provider errors and a visible unconfigured Google action created unreliable authentication behavior.
- **Alternatives considered:** Keep Supabase defaults; implement client-fragment recovery; use explicit server-side PKCE callback continuations with validated forms.
- **Decision:** Use explicit same-locale callback URLs and allowlisted continuations, validate credentials with Zod, require a 12-character mixed password plus confirmation, update the password only in an authenticated recovery session, then sign out and require a fresh login. Hide Google OAuth until its provider is configured and verified.
- **Reason:** The server-side PKCE flow matches the SSR architecture, prevents open redirects, gives deterministic errors, and avoids presenting an integration that cannot succeed.
- **Consequences:** Supabase redirect allowlists must include the callback URLs in each environment. Changing the password policy later requires coordinated UI/schema/test updates. Google OAuth returns only through a future ADR and end-to-end proof.

## ADR-010 — Mobile primary navigation with accessible overflow

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** The desktop rail exposed the application areas, but the mobile bar rendered only the first four entries and quick capture.
- **Problem:** Most authenticated destinations were not visibly reachable on mobile without a direct URL.
- **Alternatives considered:** Put all links in the bottom bar; replace the bar with a drawer; keep four primary links and expose the remaining destinations in a native overflow menu.
- **Decision:** Preserve Home, Today, Inbox, Tasks, and quick capture as the persistent mobile controls, then expose every remaining destination in a localized native `details/summary` overflow menu.
- **Reason:** It keeps the frequent actions stable, uses keyboard-accessible browser semantics, and makes the complete information architecture reachable without crowding the viewport.
- **Consequences:** New authenticated destinations must be classified as primary or overflow and added to the mobile navigation regression test. The overflow must retain 44-pixel touch targets and remain within the viewport.

## ADR-011 — Least-privilege RLS plus database-enforced relationship ownership

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** Owner-only CRUD policies protected table rows but still allowed direct mutation of domain-controlled history and relationships could reference another user's guessed entity ID.
- **Problem:** Checking only the relationship row's `user_id` does not prove ownership of every referenced entity, and mutable audit/worker records weaken invariants.
- **Alternatives considered:** Application-only validation; policy subqueries on every relationship; composite ownership FKs plus validated triggers/RPCs.
- **Decision:** Revoke unneeded direct mutations, route domain writes through validated security-definer RPCs/service workers, enforce concrete relationships with `(user_id, id)` FKs, and validate polymorphic targets with ownership triggers.
- **Reason:** The database remains authoritative even when a client or server action is bypassed, while legitimate direct user commands retain only the grants they need.
- **Consequences:** New owned entity tables need a composite ownership key before they can participate in relationships. New domain-controlled writes require an explicit RPC/worker and denial coverage.

## ADR-012 — Lossless, user-local heartbeat evaluation

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** The previous wrapper created notifications before applying caps, used database dates in dedupe keys, and could discard over-cap work or stop a batch on one user failure.
- **Problem:** Proactivity cannot lose reminders, repeat around local midnight, ignore locale, or allow concurrent evaluation for one user.
- **Alternatives considered:** Keep post-processing caps; move heartbeat to the application worker; replace the SQL evaluator with a single candidate-first function.
- **Decision:** Select/rank candidates before insertion, use local day boundaries and localized destinations, enforce a rolling task cooldown, lock per user, keep over-cap items pending, sanitize failure records, and isolate batch failures.
- **Reason:** Candidate-first SQL preserves deterministic, auditable behavior near the source data without adding another scheduler.
- **Consequences:** Heartbeat candidate types remain intentionally narrow. Any new signal must define priority, cooldown, dedupe, quiet-hour, locale, and cap semantics before release.

## ADR-013 — Append-only AI ledger with database-side complete aggregation

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** Client-side aggregation was capped at 5,000 rows and provider usage could be recorded only after later domain persistence succeeded.
- **Problem:** Successful paid calls could disappear from local cost history, and totals would become incomplete as the ledger grew.
- **Alternatives considered:** Paginate and aggregate every ledger row in Next.js; maintain mutable rollup tables; aggregate the immutable ledger in a caller-RLS database function.
- **Decision:** Record every successful provider call immediately, snapshot its applicable price in an append-only/idempotent ledger, and compute complete totals/breakdowns with `get_ai_cost_summary` under the caller's forced RLS.
- **Reason:** This preserves accounting evidence, removes API row ceilings, and avoids mutable rollup drift at pre-MVP scale.
- **Consequences:** The price catalog must be versioned via new migrations, unknown models remain explicitly unpriced, and OpenAI billing remains the reconciliation authority.

## ADR-014 — Reproducible linked-environment release gate

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** Sprint 1.5 needed to prove authentication, RLS, ownership, heartbeat, AI accounting, dashboard rendering, and the deployed worker against the linked Supabase project without persisting privileged credentials.
- **Problem:** Local-only tests miss hosted configuration and deployment drift, while manual credential copying is fragile and risks secret leakage. Hosted Auth email quotas also make repeated delivery tests nondeterministic.
- **Alternatives considered:** Keep online validation manual; store remote test secrets in `.env.local`; use linked CLI credentials at runtime with disposable data and explicit provider-limit handling.
- **Decision:** Retrieve linked project credentials only in process through the authenticated Supabase CLI, run disposable remote smoke and online Playwright suites, delete test users/files automatically, and classify hosted email throttling as a stable localized error. Exercise provider email delivery once per matrix and keep custom SMTP as a pre-production dependency.
- **Reason:** The gate remains reproducible and secret-safe while distinguishing product regressions from external delivery quotas.
- **Consequences:** `npm run test:remote` and `npm run test:e2e:online` require an authenticated, linked Supabase CLI session. Signup delivery may be explicitly skipped when the hosted quota is exhausted, but validation, error UX, recovery token exchange, protected password update, fresh login, RLS, ownership, heartbeat, cost aggregation, dashboard, and worker execution remain mandatory. CI must later receive equivalent short-lived credentials and custom SMTP coverage.

## ADR-015 — Mandatory permanent engineering standards

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** Phase 2 expands trusted interpretation, automation, and user-controlled actions across frontend, AI, jobs, and database boundaries.
- **Problem:** A feature checklist alone cannot prevent drift toward client-side authority, mutable evidence, unleased jobs, unvalidated model output, false controls, or unverified completion.
- **Alternatives considered:** Keep standards implicit in reviews; copy a checklist into each phase plan; adopt one permanent mandatory engineering contract.
- **Decision:** Adopt `ENGINEERING_STANDARDS.md` as the permanent minimum for all new code and every existing file changed after 2026-07-17. Temporary or architectural deviations must be documented with risk and a removal condition.
- **Reason:** A stable contract makes trust, ownership, test evidence, job safety, UI truthfulness, and repository hygiene enforceable across sessions and contributors.
- **Consequences:** A slice is not complete until applicable standards and permanent documentation gates pass. Existing out-of-scope debt is tracked in `TODO.md`; blocking correctness/security debt is fixed in the active slice.

## ADR-016 — Reconcile Phase 2 and harden the existing queue incrementally

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** The pre-MVP already implemented large parts of the original capture, task, chat, embedding, heartbeat, file, and AI-cost roadmap, while reliable job leasing and several correction/trust workflows remain incomplete.
- **Problem:** Replaying the original roadmap would duplicate working behavior, while expanding asynchronous processing on the current queue could strand jobs in `running` or allow stale workers to overwrite recovery.
- **Alternatives considered:** Rebuild Phase 2 from the original roadmap; replace `jobs` with a generic external orchestration platform; keep attachment-only claim logic; harden the shared `jobs` core and retain attachment processing as its first real consumer.
- **Decision:** Follow the reconciled slices in `PHASE_2_PLAN.md`. Start with additive leased queue semantics, atomic recovery, bounded retry/exhaustion, stale-worker protection, and minimal observability, without introducing a new queue service or a generic orchestration framework.
- **Reason:** This preserves proven architecture, fixes the highest compounding risk first, and provides exactly the reliability required by current and near-term Phase 2 processing.
- **Consequences:** Migration `019` must remain compatible with the deployed worker during rollout. Later slices extend existing domain models and must not recreate complete features or bypass the leased job contract.

## ADR-017 — Database-owned leased job transitions

- **Date:** 2026-07-17
- **Status:** Accepted
- **Context:** The attachment worker previously claimed with a row lock but then completed or failed jobs through direct service-role updates. A crashed or delayed worker could leave `running` forever or overwrite recovery.
- **Problem:** Worker identity, lease expiry, retry eligibility, terminal exhaustion, and stale-worker rejection must remain correct across concurrent Edge Function instances and partial failures.
- **Alternatives considered:** Keep transitions in Edge Function code; add only `locked_at`; introduce an external queue; make PostgreSQL RPCs own the complete leased state machine.
- **Decision:** PostgreSQL is authoritative for claim, completion, failure, backoff, exhaustion, reaping, and metrics. `process-jobs` receives a unique identity, uses a bounded lease/timeout, and can change terminal state only through RPCs that match its active unexpired lease.
- **Reason:** Atomic database transitions preserve concurrency and recovery invariants without adding a platform, and they are independently testable through pgTAP and disposable remote smoke.
- **Consequences:** Expired workers cannot commit job state. The per-minute reaper converts expired work to recoverable `failed` or terminal `exhausted`. Current failed attachment retry remains an authenticated owning-user action after `next_attempt_at`; an unattended consumer requires a separate concrete workflow and review.

## ADR-018 — Immutable interpretation snapshots with an owned current pointer

- **Date:** 2026-07-17
- **Status:** Accepted; deployed and remotely verified in Phase 2B
- **Context:** Users must correct AI interpretations, inspect why each element was trusted, undo mistakes, and retry interpretation without losing the original or rewriting evidence.
- **Problem:** Updating a latest interpretation row or maintaining an `is_current` flag would mutate historical evidence. Model confidence alone cannot authorize entity links or derived actions, and concurrent correction/reprocessing needs explicit ownership and idempotency.
- **Alternatives considered:** Mutable latest interpretation; an `is_current` flag on every revision; separate editable and snapshot tables; a new generic reprocessing worker; append-only snapshots selected by an owned entry pointer.
- **Decision:** Keep `entry_interpretations` immutable and append-only. Select the active version through `entries.current_interpretation_id`; make PostgreSQL RPCs own locking, expected-version checks, operation-key idempotency, complete-link ownership, lifecycle updates, audit, and compensating undo. Calculate trust and entity ranking deterministically in typed domain modules, persist bounded per-element evidence, and use a synchronous expiring reprocessing lease around the single shared extraction pipeline.
- **Reason:** This preserves an auditable history, makes concurrency and tenant boundaries database-enforced, reports missing evidence instead of inventing confidence, and avoids duplicating the provider/prompt or introducing infrastructure without a detached consumer.
- **Consequences:** Corrections and undo add rows rather than replacing them. The current pointer is mutable but can reference only an owned interpretation of the same entry. Reprocessing is bounded and synchronous until a concrete detached workflow justifies moving it behind the existing leased queue. Phase 2C must consume this trust/revision boundary rather than create a parallel task workflow.

## ADR-019 — Private, allowlisted product-behavior ledger

- **Date:** 2026-07-17
- **Status:** Accepted; deployed and remotely verified in Phase 2X Slice 2X.2
- **Context:** Product convergence needs measurable evidence about the daily cycle, but existing audit, job, and AI-cost records have different purposes, payloads, and retention needs.
- **Problem:** Reusing domain audit, technical jobs, or AI accounting for funnel analysis would leak internal lifecycle details into UX decisions and encourage collection of personal content or raw errors.
- **Alternatives considered:** Query existing ledgers; send open-ended analytics payloads from the browser; add a third-party analytics platform; use one private, bounded PostgreSQL ledger with dedicated RPCs.
- **Decision:** Add `product_events` as a private, RLS-forced ledger with exactly 17 allowlisted event names and event-specific bounded properties. The table accepts only validated security-definer RPC writes: one derives the authenticated owner and one is restricted to service-role workers. Events are idempotent per owner/key, synthetic traffic is marked, subject IDs must be owned, and the TypeScript server boundary is server-only and best effort.
- **Reason:** The product can measure behavioral friction without making telemetry a domain source of truth, exposing cross-user data, or collecting content that is unnecessary for UX funnel analysis.
- **Consequences:** `product_events` must remain distinct from `audit_logs`, `jobs`, and `ai_usage_events`; new names/properties require coordinated TypeScript, SQL, tests, and documentation. No UI emitter or dashboard belongs to this slice. Retention is capped at 180 days and requires an explicit purge operation before the pilot.

## ADR-020 — Durable entry capture before asynchronous cutover

- **Date:** 2026-07-17
- **Status:** Accepted; deployed in Phase 2X Slice 2X.3
- **Context:** Phase 2B capture and reprocessing remain synchronous, while the existing leased `jobs` queue already provides proven ownership, retry, stale-worker, and recovery semantics for attachments. The product needs a safe asynchronous cutover without changing current user behavior before the entry worker is ready.
- **Problem:** Creating an entry and a future interpretation request in separate operations risks a saved entry with no work, a job without an owned entry, duplicate retries, payloads that retain personal content, or an Edge Function/UI cutover before execution is proven.
- **Alternatives considered:** Move the current UI immediately to a detached worker; add a generic queue platform; let clients insert arbitrary entry jobs; add only worker code and defer persistence contracts; use additive, atomic database RPCs on the existing queue.
- **Decision:** Migration `025` keeps the current UI path intact and adds atomic `capture_entry_async` plus idempotent `enqueue_entry_reprocessing`. Initial jobs contain only `entry_id` and `mode`; reprocessing adds an operation key. Service-role-only claims validate type, payload, ownership, eligibility, attempts, lease and `SKIP LOCKED`, while existing attachment wrappers and generic completion/failure/reaper transitions remain unchanged.
- **Reason:** The database becomes the durable handoff boundary before any UI or worker cutover, preserving RLS, auditability, idempotency, and fail-closed behavior without duplicating the queue or starting an unverified asynchronous flow.
- **Consequences:** No entry job is dispatched in Slice 2X.3, and no current Server Action, route, UI, Edge Function, or projection consumer changes. Slice 2X.4 must add the worker/dispatch against these contracts; Slice 2X.5 may then switch capture only after end-to-end proof. The historical Product Projections implementation remains reusable prework, not the official database Slice 2X.3.

## ADR-021 — Service-role interpretation access and a Deno-native entry worker

- **Date:** 2026-07-17
- **Status:** Accepted; deployed in Phase 2X Slice 2X.4
- **Context:** Slice 2X.3 durably persists `interpret_entry` jobs, but the RPCs an unattended worker would need to actually run interpretation (`begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, `fail_entry_reprocessing`) all derive the acting user from `auth.uid()`, which is null for a service-role caller with no end-user session. Separately, the synchronous extraction pipeline (`src/lib/ai/openai-provider.ts`, `src/features/interpretations/interpret-entry.ts`) is Node/Next.js-only: `openai-provider.ts` starts with `import "server-only"`, whose Node-resolved default export unconditionally throws (verified directly against `node_modules/server-only/index.js`) outside a bundler that recognizes the `react-server` export condition, so it cannot be imported from the Deno Edge Function runtime. The project also has no deployed, publicly reachable Next.js server (Vercel is deliberately deferred), so a worker cannot be a Next.js route; the only currently deployed, network-reachable, unattended-triggerable compute is a Supabase Edge Function, and the only proven scheduled-automation mechanism in this project (`pg_cron`) has so far only ever called plain SQL functions, never made an outbound HTTP call.
- **Problem:** How to run AI extraction and persistence for `interpret_entry` jobs without a user session, without duplicating the entity-resolution/trust-scoring domain logic (a direct violation of the "no duplicated logic" standard), and without an existing mechanism for turning `pg_cron` ticks into unattended Edge Function invocations.
- **Alternatives considered:** Mint a per-user JWT in the worker to impersonate the owner through the existing `auth.uid()`-based RPCs (adds a new signing secret and a materially larger security surface for a routine internal call); reimplement the full entity-resolution/trust pipeline in Deno (violates the no-duplication standard and risks silent behavioral drift from the synchronous path); run the worker inside the Next.js app and have `pg_cron` call it (no deployed public Next.js server exists); extend the six RPCs with a `service_role`-gated optional parameter, and reuse the pure algorithmic modules by direct file copy into `supabase/functions/_shared/`, keeping only the unavoidable Node-only piece (the OpenAI HTTP call itself, already precedented by `attachment.ts`) duplicated in Deno.
- **Decision:** Migration `026` extends `begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, and `fail_entry_reprocessing` with an optional trailing `p_service_user_id` parameter, honored only when `auth.role() = 'service_role'`; each function is dropped and recreated under its original name (the same pattern migration `019` used for `claim_attachment_job`) so there is exactly one overload and no call-signature ambiguity for the unchanged `auth.uid()` path. `src/features/interpretations/entity-resolution.ts`, `trust-builders.ts`, and `trust-policy.ts` have zero Node/Next.js-specific imports in their Node form, so their logic is reused verbatim (only relative-import extensions were adapted for Deno's resolver) as `supabase/functions/_shared/*.ts`. The OpenAI Responses/embeddings calls, system prompt, JSON schema, and `EXTRACTION_STRATEGY_VERSION`/`EXTRACTION_PROMPT_VERSION` constants are duplicated into `supabase/functions/process-jobs/entry.ts`, matching `openai-provider.ts` byte-for-byte where it matters and calling the exact same persistence RPCs as the synchronous path, so persistence, audit, and the AI usage ledger stay identical regardless of which runtime produced them. `process-jobs/index.ts` is reduced to auth/routing; `attachment.ts` is the unmodified attachment behavior extracted verbatim; `dispatch.ts` is a fail-closed type router plus the unattended drain loop (`interpret_entry` only — attachments keep their existing explicit per-upload invocation, since no "claim next" RPC exists for them and adding one is out of scope). Unattended scheduling uses `pg_net` (newly enabled) and a per-minute `pg_cron` job that calls `process-jobs` in `dispatch` mode, authenticated by a dedicated `x-dispatch-secret` Edge Function secret; the target URL and that same secret also live in Supabase Vault by name so the cron body never embeds a literal value, and the query is guarded by `where exists (...)` so a tick before secrets are provisioned is a safe no-op.
- **Reason:** This keeps exactly one implementation of the trust/entity-resolution domain logic (genuinely shared source, not a parallel reimplementation), keeps the database as the single persistence authority regardless of caller runtime, avoids inventing a JWT-impersonation mechanism for a routine internal call, and works within the project's actual deployed topology (Edge Functions plus `pg_cron`/`pg_net`, no public Next.js server) instead of assuming infrastructure that does not exist yet.
- **Consequences:** `entity-resolution.ts`, `trust-builders.ts`, and `trust-policy.ts` now have a Node copy and a Deno copy that must be kept in sync by hand until/unless a shared package is introduced; each Deno copy says so at the top of the file. `openai-provider.ts`'s prompt/schema/version constants are similarly mirrored in `entry.ts` and must be updated together. The six extended RPCs are a superset of their Slice 2B contract — additive and non-breaking — but any future change to their `auth.uid()` behavior must also update the `p_service_user_id` branch. Attachments remain without an unattended consumer, consistent with `TODO.md`'s existing stance that one should only be added when a concrete workflow needs it.

## ADR-022 — Trigger-based enforcement instead of a CHECK-constraint privilege that broke authenticated inserts

- **Date:** 2026-07-17
- **Status:** Accepted; deployed in Phase 2X Slice 2X.4 (fixing a Slice 2X.3 regression)
- **Context:** While verifying Slice 2X.4's required attachment regression smoke, `scripts/remote-job-reliability-smoke.mjs` failed with `permission denied for function is_valid_entry_interpretation_job_payload` on a plain authenticated insert of a `process_attachment` job — the same operation `src/features/agent/actions.ts` performs on every real file upload. Migration `025` (Slice 2X.3) added the `jobs` CHECK constraint `type <> 'interpret_entry' OR private.is_valid_entry_interpretation_job_payload(payload)` and then revoked `EXECUTE` on that private helper from every role, including `authenticated` and `service_role` (confirmed against the live grants: only the migration-owning role retained it).
- **Problem:** PostgreSQL checks a referenced function's ACL when the executor initializes the expression tree for a CHECK constraint, not only when the branch that calls it is actually evaluated at runtime. So even though the `OR`'s left operand (`type <> 'interpret_entry'`) is true for a `process_attachment` row and the value of the right operand is never needed, the executor still had to initialize a `FuncExpr` node for it, which requires the inserting role to have `EXECUTE` on that function. Because only `postgres` had that grant, every authenticated insert into `jobs` — regardless of `type` — failed. This broke real file uploads from the moment migration `025` shipped, undetected because the one smoke test that performs a direct authenticated insert (`remote-job-reliability-smoke.mjs`) was not re-run after `025`.
- **Alternatives considered:** Grant `EXECUTE` on the private validator to `authenticated` and `service_role` (works, but broadens a function whose name and `private` schema explicitly signal it should never be callable directly, weakening the original intent for no real benefit); rewrite the validator as an inlinable plain SQL function (does not reliably avoid the ACL check and is a larger, riskier rewrite of validation logic that must stay byte-identical); move enforcement to a `BEFORE INSERT OR UPDATE` trigger, gated by a `WHEN` clause so it only fires for `interpret_entry` rows, backed by a `SECURITY DEFINER` trigger function.
- **Decision:** Migration `027` drops `jobs_interpret_entry_payload_check` and replaces it with trigger `jobs_interpret_entry_payload_trigger` (`before insert or update ... when (new.type = 'interpret_entry')`) calling `SECURITY DEFINER` function `private.enforce_entry_interpretation_job_payload()`, which raises `errcode = '23514'` (matching the committed pgTAP contract) when `private.is_valid_entry_interpretation_job_payload` returns false. The private validator's own grants are untouched — still revoked from every role.
- **Reason:** Trigger firing is authorized by ordinary table `INSERT`/`UPDATE` privilege, which `authenticated` and `service_role` already have on `jobs`; it does not require the writing role to hold `EXECUTE` on the trigger function or on any function that function calls internally, because the `SECURITY DEFINER` trigger function itself supplies the elevated privilege needed to call the private validator. This restores the constraint's original enforcement with zero privilege broadened anywhere, and the `WHEN` clause means the validator is invoked only for the row type it was written for, exactly matching the original constraint's intent.
- **Consequences:** `jobs` no longer has a named CHECK constraint for `interpret_entry` payload shape; the same guarantee is now expressed as a trigger, which existing and future documentation/tests should reference by trigger name rather than constraint name. Any future job-payload validation added the same way should default to this trigger pattern rather than a CHECK constraint that calls a privately-scoped function.
