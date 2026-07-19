# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

**This is NOT the Next.js you know.** This repo runs Next.js 16 with breaking API/convention changes from training data (e.g. `src/proxy.ts` replaces `middleware.ts`). Read `node_modules/next/dist/docs/` before changing any framework-level code or convention, and heed deprecation notices.

## What this is

My Brain — a personal contextual agent (pré-MVP, Portuguese product copy) built on Next.js App Router, TypeScript, Supabase (Postgres/Auth/Storage), and OpenAI. It captures free-text entries, extracts structured interpretation via AI, confirms tasks/entities selectively, and offers grounded chat, memory, heartbeat reminders, file analysis, and cost tracking. Postgres is the source of truth; RLS is the multitenant trust boundary.

## Commands

```powershell
npm run dev                # start dev server
npm run lint                # ESLint (must be zero errors)
npm run typecheck           # tsc --noEmit (must be zero errors)
npm test                    # vitest run (all unit/component tests)
npm run test:watch          # vitest watch mode
npm run test:coverage       # vitest with v8 coverage
npm run build               # production build
npm run test:e2e            # Playwright, desktop + mobile projects
npm run test:e2e:online      # Playwright against a live env (scripts/online-playwright.mjs)
npx supabase db lint --linked --level warning
```

Run a single Vitest test file: `npx vitest run src/features/capture/actions.test.ts`
Run a single Playwright spec: `npx playwright test e2e/intelligent-capture.spec.ts --project=desktop` (or `--project=mobile`)

Remote/hosted smoke scripts (require a linked Supabase project and real credentials — not part of local dev loop):
```powershell
npm run test:remote                       # full remote Supabase smoke
npm run test:remote:jobs                  # job reliability smoke
npm run test:remote:interpretations       # interpretation revisions smoke
npm run test:remote:entry-processing      # entry-processing smoke
npm run test:remote:product-events        # product-events smoke
```

CI (`.github/workflows/ci.yml`) runs, in order: `npm ci`, `lint`, `typecheck`, `test`, `build`. There is no lint/format-on-save autofixer configured — fix reported errors directly.

Local setup requires Node 22+, a linked Supabase project, and `.env.local` (copy from `.env.example`). Docker is only needed for the local Supabase suite. Never put the service-role key, heartbeat secret, or OpenAI key in a `NEXT_PUBLIC_*` variable.

## Architecture

### Layout

- `src/app/[locale]/...` — Next.js App Router routes, split into `app/*` (authenticated product: capture, inbox, today, tasks, waiting, projects, people, reminders, reviews, chat, memories, files, notifications, history, jobs, questions, costs, settings) and `auth/*` (login, register, recover, reset, callback). Locale is `pt-BR` or `en`.
- `src/features/<domain>/` — vertical slices (agent, auth, capture, chat, daily-cycle, interpretations, operations, product-analytics, profile, pwa, shell, tasks). Each feature colocates its Server Actions (`actions.ts`), Zod schemas (`schema.ts`), components, and same-directory `*.test.ts(x)` files.
- `src/lib/` — cross-cutting infrastructure: `ai/` (provider abstraction, extraction/chat schemas, model routing, cost calculation), `agent/` (heartbeat), `auth/` (`require-user`), `supabase/` (client/server factories, generated `database.types.ts`, `result.ts` error-wrapping helpers), plus `env.ts`, `pagination.ts`, `preferences.ts`.
- `src/proxy.ts` — the Next.js 16 replacement for `middleware.ts`. Handles Supabase session refresh and locale/auth route redirects.
- `src/i18n/messages.ts` — next-intl message catalog (pt-BR/en).
- `supabase/migrations/` — append-only SQL migrations (source of DB truth); `supabase/functions/` — Edge Functions (`heartbeat`, `process-jobs`); `supabase/tests/` — pgTAP tests.
- `docs/` — living documentation; treat as authoritative context, not background reading. Key files: `STATE.md` (current phase/status, source-of-truth order), `TODO.md` (backlog), `DECISIONS.md` (append-only ADRs), `CHANGELOG.md`, `ENGINEERING_STANDARDS.md` (mandatory engineering contract), `ARCHITECTURE.md`, `DATABASE.md`, `AI_AGENT.md`, `SECURITY.md`.

### Core flows

**Capture → interpretation (asynchronous since Phase 2X Slice 2X.5)**: the `captureEntry` Server Action authenticates and atomically persists `entries.original_content` plus a minimal `interpret_entry` job via `capture_entry_async`, then returns immediately — no redirect, no synchronous AI call. It builds a `CaptureReceipt` and, inside a `next/server` `after()` callback (so it never adds latency to the response), nudges the deployed worker and records best-effort product events; an unattended `pg_cron`/`pg_net` drain is the correctness backstop if that nudge fails. The worker (`supabase/functions/process-jobs/entry.ts`) reloads the entry and calls `AIProvider.extractEntry` (OpenAI Responses API + Structured Outputs, Zod-validated) for a schema covering concepts, entities, candidate tasks, pending questions, and confidence, then persists via a transactional RPC (interpretation, entities, event date, audit row). Embedding generation is separate and non-blocking — an embedding failure never destroys the interpretation. The UI shows interpretation + original + candidate tasks once the worker finishes; only user-confirmed tasks are materialized via an idempotent RPC that links people/projects/contexts and records an undo-compensation entry. `reprocessEntry` follows the same enqueue-and-return shape via `enqueue_entry_reprocessing`. Claims (`claim_entry_interpretation_job`, `claim_next_entry_interpretation_job`) are `service_role`-only, lease-based, and use `FOR UPDATE SKIP LOCKED`.

**AI portability**: `AIProvider` (in `src/lib/ai/`) exposes `extractEntry`, `embedText`, `answerFromKnowledge`; the OpenAI implementation is the only current backend. Authorization, confirmation, RLS, and undo logic live outside the provider, never inside it. Model routing is per-operation (`agent_preferences`: chat, extraction, review, file, background, embedding); every successful call logs request id, tokens, and a price snapshot to the append-only `ai_usage_events` ledger before any dependent domain write.

**Chat**: query → embedding → pgvector RPC retrieves the user's own records/memories → sources enter the prompt as untrusted data (never instructions) → structured response can only cite provided IDs → nonexistent IDs are stripped deterministically.

**Heartbeat**: deterministic, no LLM. Runs hourly via `pg_cron` → `run_all_heartbeats()`; computes per-user local day/timezone/locale, quiet hours, daily cap, 24h cooldown; per-user lock; one user's failure doesn't block the batch.

**Jobs**: `jobs` table with status/attempts/next-attempt/priority/idempotency, shared by `process_attachment` and `interpret_entry` job types, both routed through the same `process-jobs` Edge Function (lease-based claim, bounded retry/backoff, reaper for expired leases). Uploads enqueue and invoke `process-jobs` directly (signed URL, separate interpretation); entry jobs are additionally drained unattended by a per-minute `pg_cron`/`pg_net` tick, since attachments have no such generic consumer yet.

### Database conventions (see `docs/DATABASE.md` and `ENGINEERING_STANDARDS.md`)

- Every user-owned table has non-null `user_id`, forced RLS, and least-privilege grants; `created_at` is ingestion time, `occurred_at` is fact time.
- Relationship rows prove ownership via composite FKs `(user_id, id)`; polymorphic relations (`entry_entities`, `entity_attachments`, `entity_tags`) validate ownership by trigger — a relationship's own `user_id` is never sufficient proof alone.
- Append-only tables (audit, ledger, interpretation versions, `product_events`, `ai_usage_events`) are never mutated directly by `authenticated` or even `service_role` where a dedicated RPC exists — write only through the documented RPC (e.g. `record_product_event`, `record_product_event_for_user`).
- Migrations are append-only — never edit a migration already applied to a shared environment. Schema changes require regenerating `src/lib/supabase/database.types.ts` and updating affected data-access code in the same change.
- `SECURITY DEFINER` functions must set an explicit safe `search_path`, validate caller/owner, and use least-privilege grants.

## Engineering standards (`docs/ENGINEERING_STANDARDS.md` — mandatory, read before nontrivial work)

This is the binding contract for all new/touched code; highlights that most affect day-to-day work:

- Strict TypeScript; no unjustified `any` (prefer `unknown`/schemas/generics/domain types).
- Keep domain rules out of React components — components coordinate rendering/interaction only.
- Use the typed Supabase data-access layer for non-trivial queries; don't duplicate query assembly across pages.
- Sensitive mutations are never plain client writes — authorization lives in the backend/database (Server Actions, validated RPCs, leased workers).
- Validate every untrusted boundary (forms, model output, webhook payloads, route input, worker payloads, env config) with Zod or an equivalent explicit parser.
- User content and file content are untrusted data — never treat them as instructions.
- Every automatic action is auditable (actor, source, reason, target, time, resulting state); every reversible automatic action needs a real, tested undo; every irreversible action needs explicit confirmation.
- AI-produced domain writes go through a strict validated schema; every AI decision records model, operation, confidence, prompt/strategy version, origin; ambiguity becomes a pending question, never an invention.
- Jobs: idempotency key enforced by the DB, leased claims with expiry, bounded backoff, one failure never blocks a batch, stale workers can't overwrite newer work.
- i18n: user-facing copy goes through the i18n system, not scattered locale ternaries; locale switches preserve route/nav state.
- Definition of Done includes: test-first for new behavior, zero lint/type errors, unit + integration/DB behavioral tests, relevant Playwright journeys (desktop+mobile, both locales when copy/locale-affecting), migrations applied/linted, production build passes, and `STATE.md`/`CHANGELOG.md`/`TODO.md` updated (`DECISIONS.md` for architectural decisions).
- Commits are small, thematic, and don't mix cleanup/formatting/deps with feature changes.

## Working with docs

Treat `docs/STATE.md` as the current source of truth for what phase/slice is active and what's actually shipped vs. planned — don't infer status from code alone, since in-progress contracts (e.g. `retryProcessingJob` in `src/features/agent/actions.ts`, or the daily-cycle Inbox/Needs-Attention/Work projection mappers) can exist without a live UI consumer yet. `docs/TODO.md` tracks the active backlog by priority; `docs/DECISIONS.md` is an append-only ADR log — add to it, don't rewrite history.
