# My Brain — Foundation Design

## Decision

My Brain will be built as a modular monolith on Next.js and Supabase. This keeps the first vertical slices deployable by one team while enforcing boundaries that can later move to dedicated workers or services. The product is decomposed into eight independently testable phases; this specification covers the product-wide contracts and the Phase 1 foundation.

## Approaches considered

1. **Modular monolith (selected):** Next.js owns the web experience and authenticated server boundary; Supabase owns identity, Postgres, Storage, scheduled triggers, and edge workers. It has the lowest operational burden and supports strong RLS.
2. **Frontend plus many Edge Functions:** attractive for scale, but creates premature distributed-system complexity, weak local discoverability, and harder transaction boundaries.
3. **Dedicated API service from day one:** clean isolation, but duplicates auth, deployment, and observability before usage validates the cost.

## Product shape

The home screen is an operational cockpit, not a generic dashboard. A persistent natural-language capture surface sits above a calm daily field containing priorities, deadlines, waiting items, pending questions, recent activity, and the next agent review. Desktop uses a narrow left rail; mobile uses a bottom bar and a thumb-reachable capture action.

The visual identity is inspired by a field notebook crossed with an operations console: deep ink, electric blue, mist, signal amber, and paper-white. `Manrope` carries UI text; `Newsreader` is reserved for reflective summaries; `JetBrains Mono` labels system evidence, dates, and confidence. The signature element is the **context thread**: a thin vertical trace that visually links an original entry to its interpretation, resulting actions, and audit history.

## System boundaries

- `app`: routes, layouts, server actions, and HTTP handlers.
- `features`: cohesive user-facing capabilities such as auth, profile, capture, and tasks.
- `lib/supabase`: browser, server, and middleware clients only.
- `lib/ai`: provider-neutral interfaces, schemas, routing, and cost metadata.
- `lib/domain`: deterministic policies for confidence, permissions, priority, time, and undo.
- `supabase/migrations`: reproducible schema, indexes, RLS, grants, and database functions.
- `supabase/functions`: privileged asynchronous workers with idempotency boundaries.

## Phase 1 flow

An unauthenticated visitor can register, sign in, request password recovery, or start Google OAuth. Supabase creates a profile and preferences row through a security-definer trigger. Middleware refreshes sessions and protects application routes. Authenticated users can edit their profile, locale, timezone, and agent basics. Every owned row is scoped by `user_id = auth.uid()` through explicit select/insert/update/delete policies.

## Error and security model

Expected failures return typed results and field-level messages. Unexpected failures receive a correlation id and a safe user message. Secrets stay server-side. Service-role access is forbidden in browser bundles. Storage is private and path-scoped by user id. Security headers, upload validation, rate limiting contracts, audit events, and prompt-injection separation are part of the platform contract.

## Testing

Vitest and Testing Library cover deterministic domain and component behavior. Supabase SQL assertions verify RLS and schema invariants. Playwright covers auth and responsive journeys once a local Supabase instance is available. Every phase gates on lint, typecheck, tests, build, migrations, RLS checks, and a manual primary-flow pass.

## Assumptions

- The temporary product name and default agent name are `My Brain` and `Brain`.
- Brazil Portuguese is the initial locale, English is fully supported, and stored timestamps use UTC with an IANA timezone preference.
- OpenAI is the first AI provider, but no provider is visible until its server configuration is valid.
- External Gmail, Calendar, WhatsApp, push, and BYOK integrations remain contracts only until their planned phases.

