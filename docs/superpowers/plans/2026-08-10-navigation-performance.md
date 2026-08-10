# Navigation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated route changes immediately responsive and remove avoidable network serialization without weakening authorization.

**Architecture:** Add an App Router loading shell and link-level pending feedback, migrate page authentication to verified claims, parallelize independent projections, and reuse the existing Work action state machine for safe optimistic pending feedback. Supabase and RLS remain authoritative.

**Tech Stack:** Next.js 16.2 App Router, React 19, Supabase SSR, Vitest, Testing Library.

## Global Constraints

- Preserve lifecycle, consent, RLS, idempotency, and undo contracts.
- Do not introduce a general offline/client-cache subsystem.
- Use local Next 16 documentation under `node_modules/next/dist/docs/`.
- Every production behavior change starts with a failing focused test.

---

### Task 1: Immediate route transition shell

**Files:**
- Create: `src/app/[locale]/app/loading.tsx`
- Create: `src/app/[locale]/app/loading.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: route-level fallback rendered automatically by the App Router.

- [ ] Write a rendering test that requires an accessible localized loading status and stable skeleton regions.
- [ ] Run the test and confirm it fails because `loading.tsx` does not exist.
- [ ] Implement the minimal loading component and responsive/motion-safe CSS.
- [ ] Run the focused test and confirm it passes.

### Task 2: Client transitions and pending navigation feedback

**Files:**
- Modify: `src/features/shell/navigation-links.tsx`
- Modify: `src/features/shell/navigation-links.test.tsx`
- Modify: `src/features/daily-cycle/inbox-item.tsx`
- Modify: `src/features/daily-cycle/capture-receipt.tsx`
- Modify: corresponding component tests

**Interfaces:**
- Produces: `NavigationPendingIndicator` using Next `useLinkStatus` inside product links.

- [ ] Write failing tests for pending navigation semantics and client-side internal links.
- [ ] Verify the tests fail for the missing behavior.
- [ ] Implement the indicator and replace product anchors with `Link`.
- [ ] Run focused tests and confirm they pass.

### Task 3: Remove the routine Auth network lookup

**Files:**
- Modify: `src/lib/auth/require-user.ts`
- Modify: `src/lib/auth/require-user.test.ts`

**Interfaces:**
- Produces: the existing `{ supabase, user: { id } }` contract, sourced from verified claims.

- [ ] Change tests to require `getClaims()`, reject missing `sub`, and prove `getUser()` is not called.
- [ ] Run tests and confirm failure against the current implementation.
- [ ] Implement claims-based identity while preserving lifecycle-before-consent redirects.
- [ ] Run focused auth tests and TypeScript checks.

### Task 4: Parallelize independent page projections

**Files:**
- Modify: `src/app/[locale]/app/settings/page.tsx`
- Modify: settings page test or add a source contract test if no route test exists.

**Interfaces:**
- Consumes: existing settings projection loaders.
- Produces: the same rendered props, resolved with one concurrent barrier.

- [ ] Write a test with deferred loaders proving all three start before any resolves.
- [ ] Confirm it fails with sequential awaits.
- [ ] Replace the waterfall with `Promise.all`.
- [ ] Run the focused test.

### Task 5: Safe optimistic Work affordance

**Files:**
- Modify: `src/features/operations/work-item-actions.tsx`
- Modify: `src/features/operations/work-item-actions.test.tsx`
- Modify: Work CSS file or `src/app/globals.css`

**Interfaces:**
- Produces: immediate `aria-busy` and visible optimistic pending state; existing action result remains authoritative.

- [ ] Write a failing interaction test that requires the clicked action to identify itself as updating immediately and prevents a second command.
- [ ] Confirm it fails for the missing visual state.
- [ ] Implement the minimal optimistic pending affordance without claiming success before the Server Action settles.
- [ ] Run focused action tests.

### Task 6: Verification and delivery

**Files:**
- Modify: the design/plan only if implementation evidence changes the contract.

- [ ] Run all focused tests for touched modules.
- [ ] Run lint on touched files, TypeScript, production build, and `git diff --check`.
- [ ] Run the full Vitest suite and distinguish new regressions from the three recorded baseline parse failures.
- [ ] Review the diff for scope, security, mobile layout, and accessibility.
- [ ] Commit atomically, push `codex/navigation-performance`, and open a non-draft PR against `main`.

