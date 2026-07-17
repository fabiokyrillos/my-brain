# Technical Changelog

All notable technical changes are recorded here. The format follows Keep a Changelog principles without assigning a public semantic version before the product has a release policy.

## Unreleased — Sprint 1.5

### Added

- Permanent project state documentation: `STATE.md`, `DECISIONS.md`, `CHANGELOG.md`, and `TODO.md`.
- Completed password-recovery journey with PKCE callback continuation, reset page, validated password update, session close, and fresh-login confirmation.
- Zod authentication schemas and regression tests for signup, sign-in, recovery, password strength, and confirmation.
- Public and online Playwright coverage for signup/reset form contracts and remote signup/recovery journeys.

### Changed

- Sprint scope is now explicitly limited to foundation hardening and completion of the already-started AI Routing and Cost Control phase.
- Signup now normalizes and validates names/emails, enforces a strong confirmed password, and supplies an explicit email callback URL.
- Authentication proxy validation uses verified claims and preserves only callback/reset continuation routes for an authenticated recovery session.
- Provider errors are mapped to stable localized messages instead of being exposed in URLs.

### Removed

- Hid the Google OAuth action until the provider, redirect URLs, and end-to-end journey are configured.

### Pending in this sprint

- Complete mobile navigation.
- RLS and relationship ownership hardening.
- Heartbeat correctness and delivery semantics.
- Pagination and Supabase error handling.
- AI Routing and Cost Control validation/deployment.
- Full lint, typecheck, unit, coverage, build, database, and Playwright quality gate.

## 2026-07-16 — Intelligent brain pre-MVP

### Added

- Intelligent capture interpretation, confirmations, pending questions, and entity materialization.
- Agent chat, memory retrieval, summaries, embeddings, and attachment processing.
- Tasks, Today, Waiting, Projects, People, Reminders, Reviews, Files, Memories, Notifications, and Change History experiences.
- Entity relationships and timelines.
- Agent operations, undo records, and task change auditing.
- Scheduled heartbeat database functions, preference limits, and notification generation.
- Durable AI job queue and `process-jobs` Edge Function.
- Unit/component, Playwright, and pgTAP test foundations.

### Changed

- Profile settings save behavior was made more reliable.
- Online Supabase authentication received a dedicated Playwright validation flow.

### Database

- Added migrations `003` through `014` for intelligent capture, chat/memory, agent operations, heartbeat, relationships, timelines, attachments, preference limits, and audit behavior.

## 2026-07-16 — Phase 1 foundation

### Added

- Next.js 16 App Router foundation with TypeScript, Tailwind CSS 4, Vitest, and Playwright.
- Supabase SSR authentication, profiles, agent preferences, localized routes, protected shell, and user-scoped RLS.
- `pt-BR` and English message catalogs.
- Core product, architecture, database, AI agent, security, and implementation documentation.

### Database

- Added identity/profile migrations `001` and `002` with signup trigger, timestamps, indexes, grants, and RLS.
