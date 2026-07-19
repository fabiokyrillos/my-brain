# AI Routing and Cost Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each AI workload to an intentional model and show a user-isolated, price-snapshotted cost ledger and dashboard.

**Architecture:** A pure TypeScript routing module defines presets and model metadata. OpenAI responses expose normalized usage details, while one Supabase RPC owns price lookup, idempotency, and numeric cost calculation for both Next.js and Edge Function callers. Settings and a server-rendered dashboard consume the same contracts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, OpenAI Responses API, Supabase Postgres/RLS/Edge Functions, Vitest, Playwright.

## Global Constraints

- Keep `OPENAI_API_KEY` server-only and never store prompt or file content in cost rows.
- Keep the original `ai_model` database field during this migration for backwards compatibility.
- Use Standard API prices in USD per one million tokens and persist the price snapshot on every event.
- Treat OpenAI billing as the accounting authority; label local totals as calculated costs.
- Follow test-first red-green-refactor for new TypeScript behavior.
- Preserve complete user isolation with forced RLS.

---

### Task 1: Routing contract and cost math

**Files:**
- Create: `src/lib/ai/model-routing.test.ts`
- Create: `src/lib/ai/model-routing.ts`
- Create: `src/lib/ai/cost-calculator.test.ts`
- Create: `src/lib/ai/cost-calculator.ts`

**Interfaces:**
- Produces: `AIModelId`, `AIOperation`, `AIRoutingProfile`, `MODEL_PROFILES`, `resolveAIRoutes`, `calculateAIUsageCost`.

- [ ] Write tests proving the Maximum quality route map, preset switching, custom overrides, cached-token subtraction, and long-context multipliers.
- [ ] Run `npm test -- src/lib/ai/model-routing.test.ts src/lib/ai/cost-calculator.test.ts` and confirm failures caused by missing modules.
- [ ] Implement the typed catalogs and pure decimal-safe micro-dollar calculation.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 2: Database preferences and immutable usage ledger

**Files:**
- Create: `supabase/migrations/202607160015_ai_routing_costs.sql`
- Create: `supabase/tests/ai_usage_rls.sql`

**Interfaces:**
- Produces: routing columns on `agent_preferences`, `ai_model_pricing`, `ai_usage_events`, and `record_ai_usage(...)`.

- [ ] Add preference constraints and backfill every existing user to Maximum quality.
- [ ] Seed prices for Terra, Luna, GPT-5 mini, and `text-embedding-3-small`, including cached input and applicable long-context multipliers.
- [ ] Create the forced-RLS ledger with an idempotent partial unique request-id index.
- [ ] Implement `record_ai_usage` so authenticated callers can only record themselves and service-role callers must provide a user.
- [ ] Add SQL assertions for cross-user denial, price snapshots, cached math, and idempotency.

### Task 3: Normalize and record provider usage

**Files:**
- Modify: `src/lib/ai/types.ts`
- Modify: `src/lib/ai/openai-provider.ts`
- Create: `src/lib/ai/usage.ts`
- Modify: `src/features/capture/actions.ts`
- Modify: `src/features/chat/actions.ts`
- Modify: `src/features/agent/actions.ts`
- Modify: `supabase/functions/process-jobs/index.ts`

**Interfaces:**
- Consumes: `record_ai_usage` and route columns.
- Produces: normalized `AIUsage` on extraction, embedding, and chat results.

- [ ] Extend result types with request id, cached input tokens, and reasoning tokens.
- [ ] Read usage details from Responses API and embedding responses without storing content.
- [ ] Add a best-effort server recorder that logs only safe metadata on failure.
- [ ] Route extraction, chat, review, embedding, and file analysis through their assigned preference columns.
- [ ] Record one event per successful provider call with source entity ids where available.

### Task 4: Settings profiles and route controls

**Files:**
- Modify: `src/features/profile/schema.test.ts`
- Modify: `src/features/profile/settings-form.test.tsx`
- Modify: `src/features/profile/schema.ts`
- Modify: `src/features/profile/actions.ts`
- Modify: `src/features/profile/settings-form.tsx`
- Modify: `src/app/[locale]/app/settings/page.tsx`
- Modify: `src/app/settings-extended.css`

**Interfaces:**
- Consumes: routing model ids and presets.
- Produces: persisted `aiProfile` plus six model route form values.

- [ ] Write tests for Maximum quality defaults, supported routes, and readable controls.
- [ ] Confirm targeted profile tests fail before implementation.
- [ ] Extend schema and server action validation for every route.
- [ ] Build accessible preset cards and route selectors with Portuguese and English copy.
- [ ] Confirm preset changes update routes client-side and individual changes select Custom.
- [ ] Re-run targeted tests until green.

### Task 5: Cost dashboard and navigation

**Files:**
- Create: `src/lib/ai/cost-summary.test.ts`
- Create: `src/lib/ai/cost-summary.ts`
- Create: `src/app/[locale]/app/costs/page.tsx`
- Create: `src/app/costs.css`
- Modify: `src/app/globals.css`
- Modify: `src/features/shell/navigation-links.tsx`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Produces: `summarizeAIUsage` and the `/[locale]/app/costs` route.

- [ ] Write failing aggregation tests for today, month, all time, model, and operation totals.
- [ ] Implement pure summaries using integer micro-dollars to avoid floating drift.
- [ ] Build empty/populated server-rendered states, spend trace, breakdowns, recent calls, and pricing table.
- [ ] Add the desktop navigation item and responsive styles with visible focus and reduced-motion support.

### Task 6: Documentation, online rollout, and verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/AI_AGENT.md`
- Modify: `docs/DATABASE.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/IMPLEMENTATION_PLAN.md`

**Interfaces:**
- Consumes: all earlier deliverables.
- Produces: reproducible operational documentation and deployed Supabase state.

- [ ] Document routes, cost precision boundaries, catalog update procedure, and provider-invoice reconciliation.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Run `npx supabase db lint --linked --level error`, apply migration `202607160015`, and deploy `process-jobs`.
- [ ] Exercise settings, one real AI call, ledger insertion, dashboard rendering, and mobile layout with an authenticated temporary user.
- [ ] Inspect `git diff`, commit the focused scope, push `main`, and verify remote parity.
