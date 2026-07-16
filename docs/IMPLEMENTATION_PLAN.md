# Implementation Plan

## Phase 1 — Foundation

Next.js strict TypeScript, Supabase local setup, email/password and Google auth, recovery, profile/preferences, complete RLS for Phase 1, responsive shell, PT-BR/EN i18n, security headers, unit/integration scaffolding, and Playwright setup.

## Phase 2 — Capture and interpretation

Immutable original capture, origins, event dates, contexts, people, projects, structured provider abstraction, confidence policy, candidate actions, and pending questions.

## Phase 3 — Work and undo

Tasks, subtasks, dependencies, waiting states, priority, deadlines, audit history, protected-action confirmation, and compensating undo.

## Phase 4 — Grounded intelligence

Chat, embeddings, hybrid retrieval, memories, timelines, evidence links, and completion matching.

## Phase 5 — Proactivity

Durable jobs, heartbeat, quiet periods, internal notifications, reminders, cooldowns, deduplication, and technical failed-job view.

## Phase 6 — Reviews

Daily, Friday, Monday, and monthly reviews; historical invalidation/regeneration; editable versions; correction signals.

## Phase 7 — Files

Private uploads, signed URLs, image/PDF/document/spreadsheet processing, progress, retries, interpretation, and entity links.

## Phase 8 — Production hardening

Installable PWA, safe offline drafts and sync, accessibility refinement, end-to-end coverage, observability, cost controls, deployment runbooks, and production readiness review.

## Definition of done per phase

The slice works from UI through database; no permanent mocks or fake controls; lint, typecheck, unit/integration/E2E tests, build, migrations, RLS verification, and manual primary-flow checks pass; docs and operational notes match reality.

## Phase 1 verification — 2026-07-16

- Passed: ESLint, TypeScript, 9 Vitest tests, production build, and 2 Playwright desktop/mobile smoke tests.
- Visually inspected: desktop and 390 × 844 mobile home layouts.
- Pending external prerequisite: migration execution and pgTAP RLS assertions require Docker Desktop. `supabase start` could not connect to the local Docker engine; no Supabase project credentials exist yet.
