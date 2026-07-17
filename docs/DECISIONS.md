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
- **Status:** Accepted; hardening in progress
- **Context:** Every user-owned record must remain isolated even if client/server queries are incorrect.
- **Problem:** Application-only filters are insufficient as a security boundary.
- **Alternatives considered:** Service-role-only backend access; shared tables with application filters; user-scoped RLS.
- **Decision:** Force RLS on owned tables and authorize rows using `auth.uid()`, with relationship ownership enforced through composite constraints or validated RPCs.
- **Reason:** Defense in depth and database-enforced tenant isolation.
- **Consequences:** Generic CRUD policies are not acceptable for append-only or domain-controlled tables. Policies, grants, RPC security, and cross-user denial require pgTAP coverage.

## ADR-005 — Typed AI provider, routing, and immutable usage ledger

- **Date:** 2026-07-16
- **Status:** Accepted; deployment pending
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
