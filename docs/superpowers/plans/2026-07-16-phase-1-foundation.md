# Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested bilingual Next.js foundation with Supabase authentication, user profile/preferences, enforced tenant isolation, and a distinctive responsive application shell.

**Architecture:** Next.js App Router is the authenticated web and server boundary. Supabase owns identity and Phase 1 state; browser access remains constrained by explicit forced RLS, while server actions validate all writes. Feature modules expose focused contracts and deterministic utilities remain framework-independent.

**Tech Stack:** Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn-compatible primitives, Supabase JS/SSR/CLI, next-intl, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Original inputs in later phases are immutable; interpretations are separate.
- User-owned data always has `user_id` and forced RLS with explicit CRUD policies.
- Only configured AI providers/models may appear in UI.
- PT-BR and English strings live outside components.
- Browser bundles contain no server secret.
- Desktop uses side navigation; mobile uses bottom navigation and thumb-reachable capture.
- No fake controls, permanent mocks, or incomplete states presented as ready.

---

### Task 1: Project and verification baseline

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `src/test/setup.ts`, `.github/workflows/ci.yml`

**Interfaces:** Produces `npm run lint`, `typecheck`, `test`, `test:e2e`, and `build` gates.

- [ ] Scaffold strict App Router project with Tailwind and `src/` layout.
- [ ] Add Vitest/Testing Library and Playwright configuration.
- [ ] Write a smoke test that imports the app metadata contract and verify RED.
- [ ] Implement metadata contract, verify GREEN, then run lint and typecheck.
- [ ] Add CI that installs, lints, typechecks, tests, and builds.

### Task 2: Localization and deterministic preferences

**Files:** `src/i18n/config.ts`, `src/i18n/messages/{pt-BR,en}.json`, `src/lib/preferences.ts`, `src/lib/preferences.test.ts`

**Interfaces:** Produces `Locale`, `isLocale`, `resolveLocale`, and `defaultAgentPreferences`.

- [ ] Write failing tests for locale fallback and default agent settings.
- [ ] Verify RED because preference contracts do not exist.
- [ ] Implement the minimal pure contracts and message catalogs.
- [ ] Verify GREEN and run full unit suite.

### Task 3: Supabase Phase 1 schema and RLS

**Files:** `supabase/config.toml`, `supabase/migrations/202607160001_phase1_identity.sql`, `supabase/tests/phase1_rls.sql`, `src/types/database.ts`

**Interfaces:** Produces `profiles`, `agent_preferences`, signup trigger, timestamps, indexes, forced RLS, explicit CRUD policies, and generated-compatible database types.

- [ ] Write SQL assertions for table ownership, RLS, policy count, and cross-user denial.
- [ ] Verify assertions fail against an empty local database when Docker is available.
- [ ] Add extensions, tables, trigger, grants, indexes, and explicit policies.
- [ ] Reset local Supabase and verify SQL assertions pass when Docker is available.
- [ ] Document the skipped command clearly if Docker is unavailable.

### Task 4: Supabase clients and authenticated route policy

**Files:** `src/lib/supabase/{client,server,middleware}.ts`, `src/lib/env.ts`, `src/lib/env.test.ts`, `src/proxy.ts`

**Interfaces:** Produces validated public environment, browser/server clients, session refresh, and redirects between `/auth/login` and `/app`.

- [ ] Write failing tests for missing or malformed public configuration.
- [ ] Implement schema validation and Supabase client factories.
- [ ] Add proxy route policy with safe redirect allowlist.
- [ ] Verify tests, typecheck, and server-only separation.

### Task 5: Authentication journeys

**Files:** `src/app/[locale]/auth/**`, `src/features/auth/actions.ts`, `src/features/auth/auth-form.tsx`, `src/features/auth/auth-form.test.tsx`

**Interfaces:** Produces typed sign-in, sign-up, password recovery/reset, Google OAuth, sign-out, and callback exchange.

- [ ] Write failing component tests for accessible fields, pending state, and server errors.
- [ ] Implement forms and validated server actions.
- [ ] Add OAuth callback and password-reset continuation.
- [ ] Verify tests, keyboard labels, safe redirects, and localized copy.

### Task 6: Responsive application shell

**Files:** `src/app/[locale]/app/**`, `src/features/shell/**`, `src/app/globals.css`, `src/features/shell/app-shell.test.tsx`

**Interfaces:** Produces desktop rail, mobile bottom navigation, locale control, notification affordance, profile menu, home overview, and quick-capture entry point.

- [ ] Write failing tests for landmarks, active navigation, and mobile capture label.
- [ ] Implement design tokens, typography, navigation data, shell, and complete home states.
- [ ] Add responsive and reduced-motion behavior with visible focus.
- [ ] Verify component tests and inspect desktop/mobile screenshots.

### Task 7: Profile and agent preferences

**Files:** `src/app/[locale]/app/settings/page.tsx`, `src/features/profile/{schema,actions,profile-form}.ts[x]`, tests beside schema/form.

**Interfaces:** Produces validated profile updates for name, locale, timezone, agent name, tone, autonomy, follow-up intensity, review schedules, quiet periods, response detail, and privacy.

- [ ] Write failing schema tests for IANA timezone, quiet periods, and supported locale.
- [ ] Implement schema, authenticated update action, and accessible localized form.
- [ ] Verify ownership is derived from session rather than submitted input.
- [ ] Verify unit/component tests and typecheck.

### Task 8: Operational documentation and final gate

**Files:** `README.md`, `docs/IMPLEMENTATION_PLAN.md`, `.env.example`

**Interfaces:** Produces repeatable local setup, Supabase linking/migration instructions, deployment checklist, and honest blocked-verification notes.

- [ ] Document prerequisites, local startup, OAuth URLs, variables, commands, and Supabase link/push/function workflow.
- [ ] Run lint, typecheck, unit tests, build, migration/RLS checks where available, and Playwright smoke tests.
- [ ] Fix failures without weakening assertions.
- [ ] Record verification evidence and commit the completed phase.

