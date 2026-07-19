# Engineering Standards

Status: mandatory and permanent  
Adopted: 2026-07-17  
Applies to: all new code and every existing file changed after adoption

These standards define the minimum engineering contract for My Brain. A deviation is allowed only when the reason, risk, owner, and removal condition are recorded in the same change. Existing debt is not silently grandfathered: when it is outside the active scope, it must be recorded in `TODO.md`; when it blocks correctness, security, or the current slice, it must be fixed before merge.

## Code and architecture

1. TypeScript runs in strict mode. New code must preserve strict type checking.
2. Do not use `any` without a documented justification beside the use and a removal condition. Prefer `unknown`, schemas, generics, or explicit domain types.
3. Separate visual components, domain rules, data access, and external integrations. Each boundary must have a typed interface.
4. Do not place complex business rules in React components. Components coordinate rendering and user interaction; domain modules decide behavior.
5. Use a typed data-access layer for non-trivial queries and mutations. Pages must not duplicate query assembly or result interpretation.
6. Use generated Supabase types as the database contract. Regenerate and review them after schema changes.
7. Prefer controlled domain operations through Server Actions, validated RPCs, or leased workers.
8. Sensitive mutations must never be available as unrestricted client writes. Authorization belongs in the backend and database.
9. Do not duplicate logic across pages or domains. Extract the smallest stable shared rule and test it directly.
10. Functions, modules, and components must have one clear responsibility, explicit inputs and outputs, and names that describe domain intent.
11. Validate every untrusted boundary with a schema or an equivalent explicit parser: forms, model output, webhook payloads, route input, worker payloads, and environment-derived configuration.
12. Follow the installed Next.js documentation in `node_modules/next/dist/docs/` before changing framework APIs or conventions.
13. The four daily-cycle product surfaces (Home, Inbox/Caixa, Work, and the entry review) never import a generated `Database["public"]["Tables"]` row type, never call `supabase.from(...)` directly, never parse `element_confidence`/`element_policy`/`resolution_evidence`, and never render a raw internal enum or a numeric confidence score. Each surface's query and DTO mapping live in a dedicated `src/features/daily-cycle/*-projection.ts` server-only module; a page or client component receives only the resulting product DTO. `src/features/daily-cycle/architecture.test.ts` enforces this boundary by asserting on each surface's source text (forbidden/required import patterns) — extend that table, not the enforcement mechanism, when a new surface or central component is added. When two surfaces need the same rule (e.g., what counts as "due"), the rule is implemented once in the owning projection module and reused, never re-derived per surface (Slice 2X.16).

## Database

1. Migrations are append-only. Never edit a migration that has been applied to any shared environment.
2. Never change the schema manually in the Dashboard when the change can be versioned.
3. Every user-owned table must contain a non-null `user_id` referencing `auth.users(id)` unless an accepted ADR documents a different ownership model.
4. Every user-owned table must enable and force RLS. Grants and policies must expose only the operations the user is allowed to perform.
5. Relationships must validate ownership of every referenced entity. A relationship row's own `user_id` is not sufficient proof.
6. Audit, ledger, interpretation-version, event, and other evidence tables are append-only when their history affects trust, accounting, or undo.
7. Every `SECURITY DEFINER` function must set an explicit safe `search_path`, validate the caller or target owner, and receive least-privilege grants.
8. Relevant migrations require structural tests and behavioral tests, including happy path, denial, concurrency, and recovery where applicable.
9. Database changes must regenerate TypeScript types and update affected data-access contracts in the same slice.
10. Constraints, foreign keys, unique keys, and transactional RPCs enforce invariants at the database boundary; UI validation is supplemental.
11. Destructive migrations require an explicit data-safety plan, rollback or recovery procedure, and user authorization before execution.

## Security

1. Never expose service-role keys, provider secrets, private prompts, or privileged credentials to client bundles.
2. Never log secrets or unnecessarily sensitive user content. Logs use identifiers, sanitized codes, and bounded messages.
3. Every automatic action must be auditable with actor, source, reason, target, time, and resulting state.
4. Every reversible automatic action must create a real, tested undo operation.
5. Every irreversible action requires explicit confirmation that describes the consequence.
6. User content and files are untrusted data and can never replace system, developer, or agent instructions.
7. Every new entity relationship requires a cross-user denial test.
8. Every route, Server Action, RPC, and worker entry point validates authentication and authorization independently of the UI.
9. User-facing errors are sanitized, localized, actionable, and do not reveal internal details.
10. A visual control never grants authority that is absent from the backend.
11. Security-sensitive operations fail closed. Partial success must be explicit, auditable, and recoverable.

## Artificial intelligence

1. Model output used for persistence follows a strict structured schema and is validated before domain writes.
2. Every AI decision records model, operation, confidence, prompt/strategy version, origin, and usage reference when available.
3. Domain data distinguishes fact, interpretation, inference, and suggestion.
4. The model must not invent absent information. Ambiguity becomes a pending question or an explicitly uncertain interpretation.
5. Do not send complete history by default. Select bounded, relevant context with clear provenance.
6. Use contextual retrieval and hybrid structured/semantic search where matching quality depends on prior data.
7. Use the least expensive model that satisfies the operation's quality and safety requirements.
8. Record cost immediately after a successful paid call, regardless of whether later domain persistence succeeds.
9. AI operations are idempotent when possible. Provider request IDs and domain idempotency keys prevent duplicate charging and writes.
10. AI cannot execute protected, irreversible, destructive, or materially ambiguous actions without confirmation.
11. Confidence is a domain calculation, not merely the model's self-reported score. Hard safety rules override numeric thresholds.

## Jobs and automations

1. Every job has an idempotency key whose scope is enforced by the database.
2. Every worker claim creates a lease with `locked_at`, `locked_by`, and an expiry.
3. Retry uses bounded exponential backoff with optional jitter; the next eligible time is persisted.
4. A reaper recovers expired leases atomically and never races an active valid lease.
5. Attempts are bounded and exhaustion produces an explicit terminal failure state.
6. Atomic claim plus lease validation prevents concurrent processing of the same job.
7. One user's or job's failure cannot stop the remainder of a batch.
8. External calls have timeouts and cancellation. A timed-out call follows the same audited retry rules as other recoverable failures.
9. Jobs expose bounded operational metrics and sanitized failure details to authorized users and operators.
10. Automation must never silently discard pending work. Every terminal transition is explicit and queryable.
11. Completion and failure updates must validate the active lease owner so a stale worker cannot overwrite newer work.

## Interface

1. Do not ship buttons without behavior or persistent controls without a real consumer.
2. Incomplete functionality is hidden or explicitly marked unavailable; it never pretends to work.
3. Every page and asynchronous flow defines loading, empty, error, success, and retry/recovery states as applicable.
4. Every released flow works on desktop and mobile, and every important destination is reachable on mobile.
5. User-facing copy uses the internationalization system. Do not scatter locale ternaries through components.
6. Locale changes preserve the current route and meaningful navigation state.
7. Interfaces meet keyboard, focus, semantic HTML, contrast, reduced-motion, and touch-target requirements.
8. Optimistic UI is allowed only when failure restores a truthful state and the underlying operation is safely retryable.
9. Processing indicators reflect persisted state rather than timers or cosmetic simulation.

## Tests and Definition of Done

A feature or vertical slice is complete only when all applicable items are true:

1. The behavior is implemented end to end from interface to database or external boundary.
2. The released flow has no permanent mock dependency.
3. New behavior followed test-first development: the relevant test failed for the expected reason before the implementation passed it.
4. ESLint passes with zero errors.
5. TypeScript type checking passes with zero errors.
6. Unit and component tests pass.
7. Integration and database behavioral tests pass.
8. Relevant Playwright journeys pass on supported desktop and mobile projects and in `pt-BR` and English where copy or locale behavior changed.
9. Migrations are applied, synchronized, and linted in the linked environment when applicable.
10. RLS, ownership, cross-user denial, idempotency, and concurrency are tested when affected.
11. The remote Supabase smoke passes when the slice changes hosted behavior.
12. The production build passes.
13. `STATE.md`, `CHANGELOG.md`, and `TODO.md` reflect the new truth; `DECISIONS.md` is updated for architectural decisions.
14. External blockers, skipped gates, and residual risks are explicit and have an owner/condition in `TODO.md`.
15. The work is committed in a small, reviewable, thematic commit.

## Commits and repository hygiene

1. Commits are small, thematic, independently reviewable, and leave the repository in a valid state.
2. Commit messages use a clear imperative subject with the affected domain, for example `feat(jobs): add expiring worker leases`.
3. Do not mix unrelated cleanup, formatting, dependency updates, or product changes into a feature commit.
4. Do not commit secrets, generated local credentials, runtime artifacts, or temporary diagnostic files.
5. Remove dead code, obsolete flags, unused exports, stale comments, and superseded tests as part of the change that makes them obsolete.
6. Do not retain speculative abstractions. Add extension points only for a real current consumer or an accepted near-term plan.
7. External pending work is not hidden behind a successful local result. Record the dependency, impact, evidence, workaround, and exact completion condition.
8. A skipped test is acceptable only when the reason is stable, explicit in output, and tracked if it represents unfinished product coverage.

## Enforcement and exceptions

- Reviewers and agentic workers must check this document before planning and before completion claims.
- Automated gates enforce the mechanically verifiable subset; review enforces architecture, security, trust, and scope.
- An exception must be written in `DECISIONS.md` when it changes architecture or trust, or in `TODO.md` when it is temporary debt.
- A phase cannot be closed while an undocumented standards exception remains.

## Phase 2X remote gate precedent

- Hosted worker changes require preservation of the prior complete bundle, exact local/deployed source comparison, and attributable post-deploy entry plus attachment health smoke.
- `npm run test:remote:2x` is the Phase 2X fail-fast aggregate for jobs, interpretations, product events, entry processing, daily cycle, the complete Supabase baseline, and final residual-data cleanup.
- Shared-project queue smokes must use ID-scoped claims. A necessarily global reaper must first prove the disposable fixture is the only `running` job, make it deterministically first, and use `p_limit: 1`; a scheduled-drain check observes the existing schedule instead of manually draining the shared queue.
- Remote cleanup errors are gate failures, not log-only warnings. `npm run test:remote:2x:cleanup` verifies disposable Auth prefixes, accessible owner-row orphans, and storage leftovers; deliberately private tables use an owner-scoped post-delete assertion rather than widening service-role read grants.
- When Deno or Docker is unavailable, the missing gate must be named explicitly; successful deployment bundling, downloaded-source parity, focused tests, linked lint, and remote behavioral smoke are evidence, not a false `deno check` or pgTAP pass.
- Provider-dependent browser results are reported separately. A stable external skip is never summarized as green and must not obscure the core authenticated product matrix.
