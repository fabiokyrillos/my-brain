# Architecture Review — July 2026

- **Date:** 2026-07-24
- **Scope:** Entire repository at commit `28252a9` (Phase 2D complete through Slice 2D.6; Phase 2E not started)
- **Posture:** Staff-engineer review, production-approaching lens. Read-only — no behavior changes, no migrations, no fixes applied.
- **Verdict:** **GOOD WITH RECOMMENDATIONS** — Overall score **6.8 / 10**

## Method and limitations

The review ran as a multi-agent fan-out over review dimensions (feature organization, database/RPC, AI layer, testing, observability, performance), followed by manual verification of every Critical/High claim against the actual code, plus a direct manual review of security/RLS, layering, worker authentication, and the auth flow. Claims below marked *(verified)* were independently re-confirmed by re-reading the cited files during synthesis; the accessibility dimension was reviewed at lower depth (structural signals only — 164 `aria-*`/`htmlFor`/`role=` usages across 27 files were sampled, but no assistive-technology audit was performed).

Facts re-verified during synthesis include: CI runs exactly five app-layer steps (`.github/workflows/ci.yml`); `next-intl` has zero imports under `src/`; the only rate-limit handling anywhere is the auth email-rate-limit mapping (`src/features/auth/flow.ts:52`); `undo_operation` is redefined in 11 migration files; superseded `confirm_entry_task*`/`resolve_pending_question*` versions retain `authenticated` grants across 19 grant statements; the worker persists extraction via a bare `as Extraction` cast (`supabase/functions/process-jobs/entry.ts:288`); no `max_output_tokens` appears anywhere; no `loading.tsx` exists; the 180-day `product_events` retention exists only as a table comment; `match_internal_knowledge` orders by a computed similarity alias over a `UNION ALL` (`supabase/migrations/202607160006_chat_memory.sql:104,114`); RLS enable+force is applied by table-array loops (12 loop bodies covering the table arrays); `process-jobs` authenticates dispatch mode by secret and direct mode by user token plus job-ownership check; the auth callback sanitizes `next` via `safeAuthNext`.

---

## Executive summary

My Brain is a genuinely well-architected pre-MVP product with an unusually disciplined engineering culture for a single-maintainer project: forced RLS with composite-FK ownership proofs, append-only ledgers writable only through validated RPCs, an async capture pipeline with lease-based jobs and a cron backstop, price-snapshotted AI cost accounting, and — rarest of all — architecture rules enforced by executable tests rather than convention.

The risks are equally clear and cluster in three places:

1. **Operational readiness is the weak axis.** There is no error tracking (the error boundary tells users "the problem was recorded" while recording nothing), no alerting on the pg_cron/pg_net backbone, no deployment/rollback/backup story for the Next.js app, and — the single Critical finding — no rate limiting or AI spend caps behind open self-service signup.
2. **The verification net exists but is not wired to the gate.** 9,300+ lines of pgTAP, five Playwright suites, and a dozen remote smokes are all manual; CI verifies only the mocked Node unit layer. The DB — the product's trust boundary and largest body of logic — can regress on a green build.
3. **A migration-authoring pattern that won't survive Phase 2E unchanged.** The append-only convention is honored, but at the cost of re-pasting a ~470-line `undo_operation` monolith (11 times so far, with two recurrence defects already shipped) and a triplicated product-event allowlist. This is the one item that should genuinely block Phase 2E's first undoable operation.

None of this is structural rot. The debt is concentrated, well-understood (much of it is already honestly listed in `docs/SECURITY.md` and `docs/TODO.md`), and clearable in roughly 6–9 focused engineer-weeks.

---

## Scores

| Axis | Score | Rationale |
|---|---|---|
| Architecture | **8.0** | Clean three-layer split (routes → feature slices → lib) with correct import direction (`src/lib` imports nothing from features — verified); async capture with `after()` nudge + cron backstop is textbook; projection-mapper layer and self-enforcing architecture tests are above industry norm. Deductions: `daily-cycle` has become a hub slice with bidirectional imports to five slices; the task domain is split across three misleadingly named slices; `agent` is a Phase-1 grab-bag (937-line `actions.ts` spanning six domains); the Node/Deno AI seam is duplicated by hand. |
| Maintainability | **6.5** | Strong conventions, colocated behavioral tests, honest docs. Deductions: the `undo_operation` re-paste pattern has already produced two recurrence defects; the product-event allowlist is maintained in three places; five parallel i18n mechanisms; nine superseded RPC versions still callable; scattered dead code (`resolveAIRoutes`, `calculateAIUsageCost`, `retryProcessingJob`, dead `AIProvider.extractEntry` path). |
| Scalability | **7.0** | Universal pagination (all 13 list surfaces — verified by the performance reviewer), keyset-paginated SQL projection with purpose-built partial indexes, N+1-free batch loaders, AI latency fully decoupled from the capture round-trip. Deductions: chat is a fully blocking 9-step serial action with no streaming; no `loading.tsx`/Suspense anywhere; HNSW indexes exist but the retrieval RPC's shape defeats them; per-minute drain has an undocumented ~3–10 interpretations/min ceiling; no purge jobs for `product_events`/completed jobs. All acceptable at the plausible scale (1–100 users), so scored against that target. |
| Security | **7.5** | The database trust boundary is excellent: RLS enabled+forced across the schema via table loops, composite-FK `(user_id, id)` ownership retrofitted schema-wide (including a three-column current-interpretation pointer proof), trigger-validated polymorphic relations with a fail-closed pre-migration audit, ledgers revoked even from `service_role`, 134 explicit `search_path` sets against 106 `SECURITY DEFINER` occurrences, secret-authenticated worker dispatch, ownership-checked direct invocation, sanitized auth redirects, Zod-parsed env. Deductions: the Critical finding (no rate limiting/spend caps behind open signup); the AI extraction boundary is the loosest-validated write path in the system; CSP/HSTS review still pending (self-documented); superseded mutation RPCs remain granted. |
| Testing | **6.0** | What exists is high quality: behavioral unit tests with error-path and sanitization coverage, architecture-boundary tests, pgTAP that exercises real RPCs, deterministic e2e fixtures replacing flaky real-AI failure induction. Deductions: the 21-file pgTAP suite has never executed as a suite in any environment; the only production extraction path (592-line worker) has zero executed tests; the chat slice has zero tests including its citation-stripping security invariant; local `npm run test:e2e` silently reduces to 3 unauthenticated tests; six authenticated routes have no e2e at all; CI enforces none of the above. |
| Developer Experience | **6.0** | Rich scripts, clear commands, excellent CLAUDE.md-style guidance, fast unit loop. Deductions: nothing database-real can run without a linked remote project and credentials (Docker unavailable on the dev workstation is a recurring documented gate); no formatter (and it shows — `agent/forms.tsx` is written in a minified style); 2,368-line forward-fix migrations are brutal to review; five i18n mechanisms make every copy change a research task. |
| Documentation | **8.0** | Near-unique discipline: STATE/TODO/DECISIONS/CHANGELOG/ENGINEERING_STANDARDS maintained per-slice, ADRs append-only, and — remarkably — the docs honestly enumerate the very gaps this review found (`SECURITY.md` "Necessário antes de produção", `TODO.md:169,175`). Deductions: STATE.md contains internal contradictions (projection mappers described as consumer-less while consumed in production); DATABASE.md (69 lines) omits the versioned RPC surface and newest tables; phase reports/PRDs sprawl at `docs/` root; CLAUDE.md misdescribes `messages.ts` as a "next-intl catalog" and its feature list omits `reviews`. |
| Operational Readiness | **4.0** | The weak axis. No error tracking of any kind; the error boundary falsely claims recording; zero monitoring on the three pg_cron jobs that are the product's backbone (each fails silently); no cost/spend alerting (ledger is pull-only and fail-open); no deployment config, runbook, rollback plan, or backup/restore documentation for the app layer; mandated retention purges unimplemented. Credited: the product surfaces failures to users by design (needs-attention pipeline), worker logging is production-shaped and structured, and the Supabase side has a real rollback posture (versioned RPCs, preserved function bundles). |
| **Overall** | **6.8** | Weighted toward what production exposure will stress first: operational readiness and the verification gate. The architecture itself would score an 8; the surrounding machinery to run it safely in production is 1–2 phases behind the code. |

---

## Comparison with modern standards

**Vs. modern Next.js applications.** Ahead of typical: nearly-pure Server Components, Server Actions with Zod at every boundary, `after()` for post-response work, local-JWT auth verification in the proxy (no per-request auth network call at the edge), lean client payload. Behind typical: no streaming/Suspense/`loading.tsx` at all (every authenticated navigation blocks TTFB on the full query fan-out), chat is a blocking form action where the ecosystem norm is streamed responses.

**Vs. mature SaaS products.** The multitenancy story (forced RLS + composite-FK ownership + trigger-validated polymorphics) is stronger than most early-stage SaaS ever builds — many ship on "WHERE user_id = ?" discipline alone. The cost-accounting ledger with frozen price snapshots rivals mature usage-billing systems. What mature SaaS has that this doesn't: error tracking, alerting, deploy/rollback automation, backups-as-verified-process, rate limiting, and CI that exercises the real datastore. That whole band is missing rather than weak.

**Vs. event-driven systems.** The jobs table (idempotency keys enforced by the DB, lease claims via `FOR UPDATE SKIP LOCKED`, bounded backoff, reaper, per-attempt idempotent product events) is a correct, right-sized transactional-outbox-style design. It deliberately avoids the failure mode of adopting Kafka/queue infrastructure prematurely. The one event-driven norm it lacks is consumer lag/DLQ monitoring — metrics exist (`get_job_queue_metrics`) but nothing watches them.

**Vs. DDD-inspired applications.** Vertical slices approximate bounded contexts, and the projection-mapper layer is a clean read-model separation. But the ubiquitous language has drifted: the slice named `tasks` contains only candidate-confirmation machinery, actual task CRUD lives in `operations`, and the work view lives in `daily-cycle`. A DDD practitioner would also note the `agent` slice is six contexts in a trench coat. The domain model in the database, by contrast, is crisp (append-only interpretation revisions, explicit undo compensation records, provenance on every AI decision).

---

## Strengths (what is surprisingly well designed)

1. **Self-enforcing architecture.** `daily-cycle/architecture.test.ts` and page-scoped variants read source text and fail the build on forbidden imports/patterns; `shell/operational-copy.test.ts` greps UI surfaces for product promises the backend cannot keep; `capabilities.ts` makes product honesty a typed contract with per-capability `consumerEvidence`. This is governance most large teams never automate.
2. **The capture hot path.** One atomic RPC + two indexed reads; worker nudge and analytics pushed into `after()`; per-minute cron drain as correctness backstop; embedding failure isolated so it can never destroy an interpretation. AI latency is fully decoupled from the user round-trip.
3. **Database-boundary security.** Composite-FK ownership proofs retrofitted schema-wide in one hardening migration — including the three-column `(user_id, id, current_interpretation_id)` pointer FK; polymorphic ownership validated by trigger with a fail-closed pre-install data audit; both ledgers deny direct DML even to `service_role`.
4. **Cost accounting done right.** DB-resident, effective-dated pricing catalog; every usage event stores a frozen price snapshot; unpriced calls marked honestly instead of inventing totals; ledger-before-domain-write ordering enforced by a test against the worker's actual source text; request-id idempotency makes ledger writes replay-safe.
5. **Convergence by single predicate.** "Actionable pending question" is one 3-line function consumed by every surface, with its SQL mirror in `list_needs_attention` — and Phase 2D's closeout audit verified the convergence rather than assuming it.
6. **Deterministic e2e failure fixtures.** Failure journeys drive already-granted RPCs (`begin/fail/persist_entry_interpretation`) instead of trying to make a live model fail on cue — the correct answer to a problem most teams solve with flaky retries.
7. **Honest documentation.** `SECURITY.md` and `TODO.md` already name most of this review's operational findings. The gap is scheduling, not awareness.

---

## Findings

Severity: Critical / High / Medium / Low / Opportunity. Effort: XS (<1h), S (<1d), M (1–3d), L (1–2w), XL (>2w). "Blocks 2E" = should be resolved before Phase 2E begins.

### Critical

**C1. No rate limiting or per-user AI spend caps behind open self-service signup** *(verified)*
- **Description:** Registration is open (`src/features/auth/actions.ts:42-49`), and any authenticated user can invoke `sendChatMessage` — an embedding call plus a chat completion per submission, up to 12,000 chars, premium model by default — with no throttle, quota, daily cap, or spend ceiling (`src/features/chat/actions.ts:27-106`). Capture is cheaper but equally unmetered. No OpenAI call anywhere sets `max_output_tokens`; the `ai_usage_events` ledger records spend but enforces nothing, and its writes are fail-open (recording failure logs and proceeds). `docs/SECURITY.md` itself lists distributed rate limiting as required-before-production.
- **Impact:** A single hostile or runaway account — or a client-side retry-loop bug — generates unbounded OpenAI spend with no automatic stop. The operator finds out from the OpenAI billing console.
- **Recommendation:** Before any public deployment: per-user rolling-window limits on chat/capture actions (a Postgres counter RPC fits the existing architecture); a per-user daily budget checked against the existing `get_ai_cost_summary` aggregation before expensive calls; `max_output_tokens` per operation. Gating signup (invite/allowlist) reduces this to High immediately.
- **Effort:** M · **Blocks 2E:** No (blocks public production, not Phase 2E development)

### High

**H1. The database/worker/journey correctness layer has no automated gate — CI verifies only the mocked Node unit layer** *(verified; consolidates four convergent findings)*
- **Description:** CI is exactly `npm ci → lint → typecheck → vitest → build` (`.github/workflows/ci.yml:18-22`). Every Vitest suite mocks Supabase, so CI executes zero SQL, zero RLS policies, zero Playwright journeys, zero Deno tests, and no `supabase db lint`. The 21-file, 9,327-line pgTAP suite has **never executed as a suite in any environment** (Docker unavailable locally; documented repeatedly in CHANGELOG). The project's own history proves this layer is where defects hide: the migration-030 alias tautology, the SECURITY INVOKER RPC that "had never worked for a real user", the 40001 gateway hang, and a validator bug were all found only by executing SQL remotely.
- **Impact:** A regression in any of the 63 SQL functions, the RLS trust boundary, or the 592-line worker merges green. The safety net is one person remembering to run the right smoke at slice gates — which does not cover hotfixes, dependency bumps, or refactors between gates.
- **Recommendation:** Add a CI job: `supabase start` (Docker is free on ubuntu-latest) → `supabase db reset` (proves the 51-migration chain still applies from scratch — nothing currently checks this) → `supabase test db` → `supabase db lint --level warning`; a Deno test step; and `e2e/foundation.spec.ts` against the built app. Remote smokes can stay manual.
- **Effort:** M · **Blocks 2E:** No — but it should be Phase 2E's first slice, before feature work.

**H2. `undo_operation` is a ~470-line monolith re-pasted wholesale in 11 migrations; the same defect class has already shipped twice** *(verified: 11 files redefine it)*
- **Description:** Because migrations are append-only, every slice adding an undoable operation re-creates the entire dispatcher body. Migration `202607220045`'s own header records that migration 044 reintroduced the same defect 042 had already fixed once. Two forward-fix migrations exist solely to repair errors introduced while re-pasting this one function.
- **Impact:** Phase 2E (natural-language task updates) will add undoable operations; each addition means re-pasting and re-reviewing ~470 lines of critical compensation logic with a demonstrated defect-recurrence rate.
- **Recommendation:** Split the dispatcher before Phase 2E's first undoable operation: `undo_operation(uuid)` becomes a thin router over per-operation handler functions; new operations add one function plus one router line. Add a pgTAP assertion that every distinct `undo_operations.operation` value has a registered handler.
- **Effort:** M · **Blocks 2E:** **Yes**

**H3. Nine superseded mutation RPC versions remain granted to `authenticated` with no retirement policy** *(verified: 19 grant statements across the two families)*
- **Description:** Six callable generations of candidate-confirmation (`confirm_entry_tasks`, unversioned, `_v2`–`_v6`) plus `resolve_pending_question` `_v1`–`_v3` all remain executable. The app calls only v4, v6, and resolve v3. Retention is deliberate (rollback safety per PRD §21.7), but the cost is visible: fix migration `202607220040` is 2,368 lines because one bug had to be fixed in five function bodies.
- **Impact:** Each retained version is a live, independently reachable write path into `tasks`/`undo_operations` that must remain correct forever; every cross-cutting fix multiplies by the number of retained versions.
- **Recommendation:** Adopt an explicit retirement policy (revoke `authenticated` execute N days after supersession, keeping bodies for undo replay). Immediately revoke versions with no live caller and no rollback claim. Do this before Phase 2E starts its own `_vN` family.
- **Effort:** S · **Blocks 2E:** No (but the policy decision should predate 2E)

**H4. The AI extraction seam is dead on Node; the live Deno worker hand-mirrors prompt, versions, and schema with no parity enforcement**
- **Description:** The only production extraction path (`process-jobs/entry.ts`) cannot import `src/lib/ai` (the `server-only` guard throws in Deno), so it hand-duplicates the system prompt, both version constants, and a hand-written JSON Schema mirroring the Zod schema. `AIProvider.extractEntry` has zero production callers. Sync is maintained only by a code comment.
- **Impact:** Editing one copy without the other silently poisons the prompt/strategy provenance recorded on every interpretation, or produces extractions the rest of the system doesn't expect. Phase 2E will add more prompts and schemas under the same constraint.
- **Recommendation:** Move prompt text, version constants, and a generated JSON Schema into a runtime-neutral shared module both import — or at minimum add a Vitest parity test asserting the Deno source matches the Node source of truth (the repo already uses this source-text-test pattern in `usage-order.test.ts`).
- **Effort:** M · **Blocks 2E:** No

**H5. Production extraction output is persisted through a bare type cast — strict validation exists only on the dead path** *(verified: `entry.ts:288`)*
- **Description:** The worker does `JSON.parse(...) as Extraction`. Its hand-written JSON Schema omits the Zod refinements (max lengths, confidence 0–1 bounds, datetime format, `parentIndex ≥ 0`), and the persistence RPC validates only shallow `jsonb_typeof` shape — while the human-correction path in the same migration validates lengths strictly. The AI boundary — the one ENGINEERING_STANDARDS explicitly requires strict validation on — is the loosest-validated write path in the system.
- **Impact:** Over-length or out-of-range model output persists verbatim into `entry_interpretations`/`task_candidates`; malformed `dueAt` surfaces later as an unmapped failure at task materialization.
- **Recommendation:** Add Deno-side validation after parse (Zod works in Deno via `npm:` specifier) and/or extend `persist_entry_interpretation` to enforce what `correct_entry_interpretation` already enforces.
- **Effort:** S · **Blocks 2E:** No

**H6. i18n is fragmented across five mechanisms; `next-intl` is a declared but never-imported dependency; two action files return Portuguese-only errors to English users** *(verified: zero `next-intl` imports)*
- **Description:** Five parallel copy systems coexist: `src/i18n/messages.ts` (consumed by only 3 shell files), two feature `copy.ts` modules, inline `{pt, en}` records, and 68 raw `locale === "pt-BR"` ternaries across 44 files. `chat/actions.ts` and `operations/actions.ts` return hardcoded Portuguese errors regardless of locale, while `capture/actions.ts` and `tasks/actions.ts` localize the identical messages correctly. CLAUDE.md's description of `messages.ts` as a "next-intl message catalog" is false, and the error boundary does its own `window.location` locale sniffing.
- **Impact:** A real user-facing defect (Portuguese errors in the English product), plus every new phase adds copy to a randomly chosen mechanism — in violation of the repo's own binding standard.
- **Recommendation:** Decide once before Phase 2E adds copy: adopt next-intl for real, or remove the dependency and standardize on the typed copy-module pattern (`daily-cycle/copy.ts` is the best of the five). Fix the two Portuguese-only action files immediately (XS on their own).
- **Effort:** M (decision + incremental migration) · **Blocks 2E:** No (decision should precede 2E copy)

**H7. No error tracking; the error boundary claims "the problem was recorded" while recording nothing** *(verified: `error.tsx` ignores the `error` prop entirely)*
- **Description:** No Sentry-equivalent, no `instrumentation.ts`/`onRequestError`, no log drain. Production page-loader failures surface only as digests in host stdout nobody reads. The authenticated error boundary receives the error prop, discards it, and tells users the problem was recorded.
- **Impact:** Recurring production failures are invisible until a user complains; the UI actively (and untruthfully) reassures them otherwise. This is the first place production breaks silently.
- **Recommendation:** Add an error sink (Sentry free tier, or an `onRequestError` hook writing structured JSON with digest/route/user), and make `error.tsx` report `error.digest` — or change the copy.
- **Effort:** S · **Blocks 2E:** No

**H8. The pg_cron/pg_net backbone has zero monitoring — every failure mode is silent**
- **Description:** Three cron jobs are the operational backbone (hourly heartbeats, per-minute reaper, per-minute entry drain). The drain is a fire-and-forget `net.http_post` whose response is never inspected and which silently no-ops if Vault secrets are absent; heartbeat per-user failures only `raise warning` into Postgres logs; `get_job_queue_metrics` exists but its sole consumer is a manual smoke script. If pg_cron stops, everything downstream stops silently.
- **Impact:** "Heartbeat reminders quietly stop arriving" is the concrete first-failure scenario; a stranded-jobs pileup is the second.
- **Recommendation:** A dead-man's switch: a scheduled GitHub Action (infra already exists) hitting a small service-role endpoint that returns queue metrics plus last-run times per cron job, alerting on staleness. One day of work covers the entire async surface.
- **Effort:** M · **Blocks 2E:** No

**H9. The chat grounding pipeline is entirely untested — including its citation-stripping security invariant**
- **Description:** `chat/actions.ts` (145 lines) and `openai-provider.ts` (115 lines) have no tests. The documented guarantee "nonexistent IDs are stripped deterministically" is one untested `filter` line, and the action then depends on it with a non-null assertion (`sources.find(...)!`) — weaken the filter and chat throws a TypeError mid-conversation. Ownership checks, ledger ordering, and the audit insert are also untested. The chat slice is the only feature slice with zero tests.
- **Impact:** The one surface where model output flows back to the user has no regression protection for its grounding guarantee or its error paths.
- **Recommendation:** Unit-test `answerFromKnowledge` (fabricated IDs stripped) and `sendChatMessage` (established mock-client pattern); replace the `!` with a defensive filter-map.
- **Effort:** S · **Blocks 2E:** No

**H10. The only production AI-extraction path (592-line worker) has zero executed tests**
- **Description:** `process-jobs/entry.ts` — payload validation, fail branches, begin/persist RPC sequencing, retry/lease handling, embedding isolation, product events — has never had a test run against it. The one committed Deno test admits in its own header it has never executed (no Deno runtime locally, no CI step).
- **Impact:** Regressions in the core capture→interpretation flow are invisible until someone manually runs the remote smoke. Phase 2E will extend this worker.
- **Recommendation:** Add the CI Deno step immediately (the existing test was written network-free for exactly this); then extract the orchestration behind an injectable client and unit-test the branchy paths.
- **Effort:** M · **Blocks 2E:** No (pairs with H1)

### Medium

**M1. `daily-cycle` has become a hub slice with bidirectional import cycles to five other slices.** Projections import from `agent` while `agent` imports daily-cycle contracts back; generic utilities are trapped inside projection modules. — Extract the pure shared layer (contracts, action-result, copy, mappers) into a no-imports-from-features location. *(M; no)*

**M2. The task domain is split across three misleadingly named slices.** `tasks` (largest slice) is exclusively candidate-confirmation machinery; task CRUD lives in `operations`; the work view in `daily-cycle`. — Consolidate or rename during Phase 2E design, which will touch this domain anyway. *(M; no — but do the naming decision in 2E planning)*

**M3. `agent` is a Phase-1 grab-bag.** Its 937-line `actions.ts` spans jobs, reminders, questions, notifications, files, and reviews; the reviews domain is split across two slices. — Split along actual seams opportunistically. *(M; no)*

**M4. Two generations of data access.** Home/Inbox/Work/entry-review load through architecture-tested projection modules; 14 other pages (including the brand-new Phase 2D questions page) query Supabase raw inline. — Don't big-bang migrate; adopt the rule that any new/touched page gets a projection module, and extend the architecture test. *(L, incremental; no)*

**M5. Product-event allowlist maintained in three duplicated places** (check constraint, 7 copies of the validator function, RPC), fully re-pasted per event addition. — Move the allowlist to a catalog table consulted by one stable validator. *(M; no)*

**M6. Declared retention is unimplemented.** The 180-day `product_events` purge exists only as a table comment *(verified)*; completed jobs and delivered notifications are never pruned either. — One daily batched pg_cron purge job before the first pilot. *(S; no)*

**M7. Heartbeat DB tests assert source text, not behavior; the chat retrieval RPC has zero pgTAP.** `run_all_heartbeats` — the scheduled multi-user engine — is "tested" by `pg_get_functiondef LIKE` assertions. — Replace with behavioral fixtures (two timezones, quiet hours, cap, cooldown); add an ownership test for `match_internal_knowledge`. *(M; no)*

**M8. Daily-cycle lifecycle precedence exists in both TypeScript and SQL with no cross-language equivalence test** — and the risk is proven (migration 030 shipped an inverted check). — Shared JSON fixture driven through both the Vitest and pgTAP suites. *(S; no)*

**M9. Model routing is half-dead.** `resolveAIRoutes` has no production caller; five call sites re-implement `preferences?.X ?? "<hardcoded>"` independently; Settings exposes routing knobs nothing consumes. — One `resolveModelForOperation` helper (plus Deno mirror), or delete the dead surface. *(S; no)*

**M10. Model catalog hardcoded across four layers; pricing lookup matches the provider-returned model string exactly.** An OpenAI model rename/snapshot silently flips all cost events to "unpriced". — Prefix/alias-tolerant pricing match; move the allowed-model list to data. *(M; no)*

**M11. Review generation abuses the chat grounding contract** (tasks injected as fake `memory` sources with fabricated similarity) **and computes period boundaries in server-local time** instead of the user's timezone; prompts are Portuguese-only. *(S; no)*

**M12. Local `npm run test:e2e` silently reduces to 3 unauthenticated tests.** All authenticated journeys are online-gated against real OpenAI with no retries configured. — Grow the deterministic direct-RPC fixture tier that already exists. *(M; no)*

**M13. Six authenticated routes have zero e2e coverage** (memories, notifications, history, people, projects, reminders). — One cheap both-locales smoke spec asserting heading + no error boundary. *(S; no)*

**M14. Four `agent` actions have no unit tests** (`createReminder`, `markNotification`, `uploadAttachment`, `generateReview`) — prioritize `uploadAttachment` failure/cleanup branches. *(M; no)*

**M15. Hand-synchronized Deno copies of tested Node modules have no parity guard** (`_shared/entity-resolution.ts` et al., declared "byte-for-byte identical" by comment only). — One Vitest asserting normalized source equality; pairs with H4. *(XS; no)*

**M16. The auth boundary (`proxy.ts`, `auth/actions.ts`) has no unit tests** and its only automated check (foundation e2e) doesn't run in CI. *(S; no)*

**M17. Next.js-side logging is unstructured message-only `console.error` with no correlation IDs** — the Deno worker already demonstrates the right shape; mirror it with a tiny shared helper. *(S; no)*

**M18. `product_events` has 17 instrumented events and zero readers.** The funnel ledger is write-only in practice. — Even one weekly-counts script converts it from liability to asset. *(S; no)*

**M19. No deployment story for the Next.js app itself.** No hosting config, no env-var matrix, no deploy order, no rollback plan — the Supabase side, by contrast, has a real rollback posture. — One-page RUNBOOK.md. *(S; no)*

**M20. No backup/restore posture.** Zero documentation; no restore ever tested; implicitly relies on the linked project's default tier. — Verify tier, add a scheduled dump, run one restore drill. *(S; no)*

**M21. Cost recording is fail-open with no spend alert** — recording failures silently under-count the very ledger a future cap would depend on. — Fold a daily threshold check into the H8 dead-man's switch; reconcile monthly against the provider dashboard. *(S; no — prerequisite awareness for C1)*

**M22. Chat is a fully blocking, non-streaming 9-step serial Server Action** ending in a full-page redirect. — Streaming response with optimistic user-message rendering; short-term, parallelize the independent steps. *(M; no)*

**M23. HNSW indexes are never used by the retrieval RPC** — the `UNION ALL` + computed-alias-DESC shape forces exact per-user scans while docs claim ANN *(verified: `202607160006:104,114`)*. — Decide explicitly: keep exact scan (defensible at this scale; drop the indexes and fix the docs) or restructure to per-table `ORDER BY embedding <=> $q LIMIT k`. *(S; no)*

**M24. The entry review page loads the full interpretation dataset twice, serially,** with `select("*")` over up to 50 revisions each time. — Fetch once, feed both mappers. *(S; no)*

**M25. No `loading.tsx`, no streaming anywhere** *(verified: zero files)* — every authenticated navigation blocks TTFB on the full fan-out plus a `getUser()` network round-trip per page on top of the proxy's already-done local check. — Skeletons for the app segment; Suspense for non-critical Home panels. *(S; no)*

### Low

**L1.** Contract-module naming drift: `schema.ts` vs `contracts.ts` vs `*-contract.ts` vs `settings-contracts.ts` for the same role. Pick one rule; rename opportunistically. *(S)*
**L2.** Timezone validation implemented twice with divergent acceptance rules (`review-projection.ts` vs `work-projection.ts`); hoist one helper into `src/lib`. *(S)*
**L3.** `retryProcessingJob` remains consumer-less two phases after its promised consumer; wire it to the jobs page or delete it. *(XS)*
**L4.** STATE.md contains internal contradictions (mappers described as consumer-less that ship in production; stale "Next priorities"); restructure into a short current-truth section plus links to reports. *(XS–S)*
**L5.** DATABASE.md (69 lines) omits the versioned RPC surface, the retirement policy, and the newest tables. *(S)*
**L6.** Dead TS mirrors of DB-side cost logic (`calculateAIUsageCost`, `summarizeAIUsage`) with subtly different rounding; delete or re-scope as tested reference implementations. *(XS)*
**L7.** Node OpenAI client runs with SDK defaults (~10-min timeout); pass explicit `timeout`/`maxRetries`. *(XS)*
**L8.** Worker embedding usage events record `provider_request_id: null`, so job retries double-record embedding cost; read the `x-request-id` header. *(XS)*
**L9.** Chat citation hydration relies on a non-null assertion coupled to provider stripping behavior (also covered under H9). *(XS)*
**L10.** Coverage is collected but never enforced — no thresholds, and CI runs `npm test`, not `test:coverage`; add per-directory thresholds where coverage is already high. *(XS)*
**L11.** Raw exception text is persisted to `jobs.error` and rendered verbatim on the user-facing Jobs page; map to localized keys at render. *(XS)*
**L12.** Home dashboard fetches a full 51-row inbox page plus five batch queries to render four items; thread a `limit` through `loadInboxProjection`. *(XS)*
**L13.** Two small index gaps: `entries (user_id, created_at desc)` for inbox ordering; `undo_operations` JSONB containment lookups. Fold into the next migration. *(XS)*

### Opportunities

**O1.** The per-minute drain has an undocumented throughput ceiling (~3–10 interpretations/min given serial OpenAI calls under `DISPATCH_BUDGET_MS`). Fine as designed — document it next to the constants and expose oldest-pending-age as the operator signal. *(S)*
**O2.** No formatter is configured, and it shows (`agent/forms.tsx` is minified-style). One Prettier commit, kept separate from feature work per the repo's own rule. *(S)*
**O3.** The `AIProvider` seam, once relocated per H4, is genuinely close to supporting a second provider — the discipline (authorization outside the provider, structured outputs, deterministic stripping) is already right.

---

## Refactoring roadmap

### Quick wins (do this week, mostly XS/S)
1. Fix the two Portuguese-only error paths in `chat/actions.ts` and `operations/actions.ts` (user-facing defect — H6 subset).
2. Make `error.tsx` report `error.digest` or correct its copy (H7 subset).
3. Add the CI Deno test step (H10 subset — the test already exists and is network-free).
4. Set `timeout`/`maxRetries` on the Node OpenAI client (L7); read `x-request-id` in the Deno embedding call (L8).
5. Replace the chat citation non-null assertion with a defensive filter (L9).
6. Delete dead code: `calculateAIUsageCost`/`summarizeAIUsage` (L6); decide `retryProcessingJob` (L3).
7. Remove `next-intl` from package.json or file the ADR to adopt it (H6 decision trigger).

### Before Phase 2E (the gate list)
1. **H2 — split the `undo_operation` dispatcher.** The only true blocker: do it before the first 2E undoable operation.
2. **H1 — the CI database/worker gate** (`supabase start` + db reset + pgTAP + db lint + Deno + foundation e2e). First infrastructure slice.
3. **H3 — RPC retirement policy** decided and the no-caller/no-rollback-claim versions revoked, so 2E's `_vN` families are born with an expiry.
4. **H6 — the i18n decision** (one canonical mechanism), so 2E copy lands in the right place.
5. **H5 — validate extraction output in the worker** (2E extends this exact path).

### During Phase 2E (fold into touched code)
1. H4/M15 — shared prompt/schema/version artifact (or parity tests) for Node/Deno, as 2E adds prompts.
2. M2/M3 — task-domain consolidation and `agent` split, as 2E reworks tasks; adopt the M4 projection-module rule for every touched page.
3. H9/M14/M16 — close the unit-test gaps on chat, the four `agent` actions, and the auth boundary as those files are touched.
4. M5 — product-event catalog table when 2E adds its first new events; M8 — lifecycle parity fixture when 2E touches lifecycle.
5. M22/M25 — `loading.tsx` skeletons and chat streaming if 2E touches chat UX.

### After MVP (pre-pilot operational hardening)
1. C1 — rate limiting + spend caps (or invite-gated signup as the interim mitigation).
2. H7 — error tracking; H8/M21 — the cron dead-man's switch with a cost threshold.
3. M6 — retention purges; M19 — deploy runbook; M20 — backup verification + one restore drill.
4. M12/M13 — deterministic authenticated e2e tier and the six-route smoke.
5. M18 — one product-events reader.

### Long-term
1. M1 — extract the shared pure layer out of `daily-cycle`; finish M4 across all pages.
2. M10 — model catalog as data; M23 — the pgvector decision at real scale; M24, L12, L13 as load appears.
3. O2 — formatter adoption; L1 — naming convergence; L4/L5 — docs restructure.

### Do NOT do (current solution is already appropriate)
- **No queue/broker infrastructure** (Redis, BullMQ, Kafka). The Postgres jobs table with `SKIP LOCKED` leases, idempotency keys, and a reaper is correct at this scale and even at 100× this scale.
- **No repository/ORM abstraction** over the typed Supabase client. The projection-module pattern is the right amount of indirection; a generic data layer would be over-engineering.
- **No microservices / service extraction.** The Edge Function split (worker vs. app) already isolates the only workload that needs isolation.
- **No big-bang migration of the 14 raw-query pages** — the incremental touched-page rule preserves velocity and gets there.
- **No second AI provider implementation now** to "prove" portability — fix the seam placement (H4) first; a speculative Anthropic/Gemini backend today would be dead code.
- **No global coverage thresholds** — per-directory only, where coverage is already high.
- **No HNSW/ANN tuning** at current scale — make the M23 decision, but exact per-user scan is defensible for years of expected data volume.
- **No rewriting of append-only migration history** — the convention is a strength; H2/M5 fix the authoring pattern, not the append-only rule.

---

## Estimated technical debt

Concentrated, not diffuse. Approximate clearing costs at focused single-engineer pace:

| Cluster | Effort |
|---|---|
| CI verification gate (H1, H10 CI step, M12 foundation) | 2–3 days |
| `undo_operation` split + RPC retirement (H2, H3) | 3–4 days |
| AI-layer hygiene (H4, H5, M9, M10, M11, L6–L9) | 4–5 days |
| i18n consolidation (H6, decision + core migration) | 3–5 days |
| Observability/ops (C1, H7, H8, M6, M17–M21) | 1.5–2 weeks |
| Testing gaps (H9, M7, M8, M13–M16) | 1–1.5 weeks |
| Structural (M1–M4, incremental share) | 1–2 weeks spread across 2E |
| **Total** | **≈ 6–9 engineer-weeks** |

For a codebase of this scope (228 TS files, 51 migrations, 63 SQL functions, 21 pgTAP suites), that is a **moderate and healthy** debt load — and roughly half of it is absence-of-ops-tooling rather than wrong code.

---

## Production readiness assessment

**Not ready for open public production today; close to ready for an invite-gated pilot.**

Go-live gate (public): C1 (rate limiting/spend caps), H7 (error tracking), H8 (cron monitoring), M6 (purges), M19 (deploy/rollback runbook), M20 (backup verification), plus H1 so the gate stays closed.

Pilot gate (invited users, operator = maintainer): C1 drops to High via invite-gating; H7 and H8 remain the two must-haves, because both describe silent-failure modes the maintainer cannot currently see. Everything else is schedulable.

The database layer is production-grade now. The application layer is production-shaped. The operations layer is 1–2 phases behind both — which is exactly what `docs/SECURITY.md` already says about itself, and that honesty is why this gap is low-risk to close.

---

## Final verdict

**GOOD WITH RECOMMENDATIONS** — overall **6.8 / 10**.

The architecture would be recognizable and defensible in a mature SaaS organization: RLS-first multitenancy done properly, an async pipeline with real reliability mechanics, cost accounting with provenance, and executable architecture governance. The recommendations are not a redesign — they are (1) wire the existing verification net into CI, (2) fix the migration-authoring pattern before Phase 2E compounds it, (3) consolidate i18n before new copy lands, and (4) build the thin operational layer (limits, error sink, cron watchdog, runbook) that stands between a good codebase and a safely-run product.
