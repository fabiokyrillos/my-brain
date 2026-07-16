# Intelligent Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete My Brain experience: preserve a free-form original, interpret it with validated OpenAI output, present entities and task candidates, confirm selected tasks, audit the changes, and undo them.

**Architecture:** A Next.js Server Action authenticates the user and writes the immutable entry before calling a provider-neutral extraction interface. Structured output is validated with Zod, persisted separately, and rendered from Supabase. Task confirmation is a protected transaction implemented in Postgres RPC so tasks, audit, and undo records cannot diverge.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript strict, Supabase Postgres/RLS, OpenAI Responses API, Zod Structured Outputs, Vitest, Playwright.

## Global Constraints

- Save original user content before any AI request and never update or delete it.
- All owned rows carry `user_id`; forced RLS has explicit CRUD policies.
- Implicit tasks remain candidates until the user confirms them.
- Structured AI output is schema-validated before persistence.
- Every confirmed task is audited and has a real compensating undo operation.
- OpenAI keys and service-role credentials stay server-only.
- PT-BR and English copy live outside database implementation details.

---

### Task 1: Phase 2 database and RLS

**Files:**
- Create: `supabase/migrations/202607160003_intelligent_capture.sql`
- Create: `supabase/tests/intelligent_capture_rls.sql`

**Interfaces:**
- Produces `entries`, `entry_interpretations`, `contexts`, `organizations`, `projects`, `people`, `tasks`, `audit_logs`, and `undo_operations`.
- Produces RPCs `confirm_entry_tasks(p_entry_id uuid, p_candidate_indexes integer[])` and `undo_operation(p_undo_id uuid)`.

- [ ] Add a SQL test that asserts forced RLS, four policies per owned table, immutable entry-content trigger, and cross-user invisibility.
- [ ] Run `npx supabase db push --dry-run`; expect only `202607160003_intelligent_capture.sql`.
- [ ] Create normalized tables with `user_id`, timestamps, indexes, constraints, and explicit policies.
- [ ] Implement confirmation RPC that locks the interpretation, validates candidate indexes, inserts tasks, creates an audit record, and stores task ids in an undo snapshot.
- [ ] Implement undo RPC that marks created tasks cancelled, records compensation, and prevents a second undo.
- [ ] Apply with `npx supabase db push --yes` and run `npx supabase db lint --linked --level warning`.

### Task 2: Provider-neutral structured extraction

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/extraction-schema.ts`
- Create: `src/lib/ai/extraction-schema.test.ts`
- Create: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/openai-provider.ts`
- Create: `src/lib/ai/index.ts`

**Interfaces:**
- Produces `EntryExtraction` with `summary`, `occurredAt`, `concepts`, `contexts`, `organizations`, `projects`, `people`, `taskCandidates`, `pendingQuestions`, and `confidence`.
- Produces `AIProvider.extractEntry(input): Promise<ExtractionResult>` with normalized model and token usage.

- [ ] Write a failing schema test using the Jaime/Next Cruise/Maria example and rejecting invalid confidence or malformed dates.
- [ ] Run `npm test -- src/lib/ai/extraction-schema.test.ts`; expect missing module failure.
- [ ] Implement strict Zod schemas and provider interfaces.
- [ ] Install `openai`, call `responses.parse` with `zodTextFormat`, `gpt-5.6-luna`, low reasoning, the user timezone, and explicit fact/inference rules.
- [ ] Run the schema test; expect all assertions to pass.

### Task 3: Immutable capture action and detail page

**Files:**
- Create: `src/features/capture/schema.ts`
- Create: `src/features/capture/schema.test.ts`
- Create: `src/features/capture/actions.ts`
- Create: `src/features/capture/quick-capture-form.tsx`
- Create: `src/app/[locale]/app/inbox/[entryId]/page.tsx`
- Modify: `src/features/shell/home-dashboard.tsx`

**Interfaces:**
- Produces `captureEntry(state, formData)` returning an error state or redirecting to the persisted entry detail.
- Consumes authenticated user, profile timezone, and `AIProvider.extractEntry`.

- [ ] Write failing tests for blank/oversized input and source normalization.
- [ ] Insert `entries.original_content` with status `processing` before the provider call.
- [ ] Persist validated interpretation, extracted entities, model, strategy version, confidence, and token usage; mark failures without deleting the original.
- [ ] Replace the cosmetic home form with `QuickCaptureForm`, including pending and error states.
- [ ] Render a context-thread detail page with interpretation, original toggle, entities, task candidates, confidence, and internal evidence.
- [ ] Verify the original remains queryable when the provider throws.

### Task 4: Confirmation, audit, and undo UI

**Files:**
- Create: `src/features/tasks/actions.ts`
- Create: `src/features/tasks/task-candidate-form.tsx`
- Create: `src/features/tasks/task-candidate-form.test.tsx`
- Create: `src/features/undo/undo-button.tsx`
- Modify: `src/app/[locale]/app/inbox/[entryId]/page.tsx`

**Interfaces:**
- Produces `confirmEntryTasks` and `undoAgentAction` authenticated server actions backed by RPCs.

- [ ] Write failing component tests for selecting all/some candidates and visible confirmation.
- [ ] Submit selected candidate indexes to `confirm_entry_tasks`.
- [ ] Render created tasks and a time-bound undo action from the persisted undo operation.
- [ ] Execute undo and verify tasks are compensated while audit history remains.

### Task 5: Operational pages

**Files:**
- Create: `src/app/[locale]/app/inbox/page.tsx`
- Create: `src/app/[locale]/app/tasks/page.tsx`
- Create: `src/app/[locale]/app/today/page.tsx`
- Create: `src/app/[locale]/app/waiting/page.tsx`
- Create: `src/app/[locale]/app/projects/page.tsx`
- Create: `src/app/[locale]/app/people/page.tsx`
- Modify: `src/features/shell/app-shell.tsx`

**Interfaces:**
- Each route queries authenticated Supabase data and renders loading, empty, error, and populated states without mock records.

- [ ] Add a shared page header and evidence-aware empty state.
- [ ] Implement Inbox ordered by `occurred_at`, Tasks by status/due date, Today by dynamic priority, and Waiting by waiting status.
- [ ] Implement project and person collections from extracted entities with real timeline counts.
- [ ] Calculate active navigation from pathname in a focused client navigation component.

### Task 6: Full verification and documentation

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`
- Modify: `docs/AI_AGENT.md`
- Modify: `README.md`
- Modify: `e2e/online-auth.spec.ts`
- Create: `e2e/intelligent-capture.spec.ts`

**Interfaces:** The phase is reproducible locally and against the linked Supabase project.

- [ ] Add an online E2E that captures the Jaime example, verifies original preservation, confirms selected tasks, and undoes them.
- [ ] Run lint, typecheck, all Vitest tests, production build, linked database lint, and desktop/mobile Playwright.
- [ ] Update docs with the implemented model, security boundary, migration, commands, and known deferred integrations.
- [ ] Commit and push only after the complete gate passes.

