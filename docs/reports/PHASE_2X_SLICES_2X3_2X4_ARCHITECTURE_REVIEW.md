# Architecture Review — Slices 2X.3 and 2X.4

Scope: `202607170025_phase_2x_entry_processing_jobs.sql`, `202607170026_phase_2x_entry_interpretation_worker.sql`, `202607170027_fix_entry_interpretation_job_payload_check_privilege.sql`, `supabase/functions/process-jobs/*`, `supabase/functions/_shared/*`, and their Node-side counterparts (`src/features/interpretations/*`, `src/lib/ai/openai-provider.ts`). No code was changed to produce this document. Findings are numbered F1–F12, each with severity, area, recommended action, and timing.

## Summary

Both slices are functionally sound — everything below was found by reading the delivered code, not inferred from a failure. The dominant risk pattern is **silent divergence**: several pieces of behavior now exist in two places (Node and Deno, or two migration files) that must be kept in sync by hand, with no automated check that would catch drift. None of these fail loudly; a mismatch would produce *wrong* data (a different trust score, a stale prompt version) rather than an error, which is what makes them worth closing before the branch accumulates many more slices on top. Positively: no premature abstraction was introduced — no generic queue platform, no generic read-model framework, no cross-runtime package was attempted where a simpler duplication-with-a-comment sufficed, and the dependency graph between the three tiers (Postgres, Deno Edge Function, Next.js app) has no reverse edges.

| # | Finding | Area | Severity | Before main / After 2X |
|---|---|---|---|---|
| F1 | Entity-resolution/trust modules duplicated Node↔Deno, no drift check | Duplicated logic, Node/Deno | High | Before main |
| F2 | OpenAI prompt/schema/version constants duplicated Node↔Deno, no drift check | Duplicated logic, Node/Deno | High | Before main |
| F3 | `entry.ts` mixes four concerns in one 579-line file | Layering | Medium | After 2X |
| F4 | Six repeated auth-resolution blocks in migration 026 SQL | Duplicated logic | Medium | After 2X |
| F5 | Current RPC bodies spread across migrations 020/021/026 | Maintainability | Medium | After 2X |
| F6 | Product-event names hardcoded as untyped string literals in `entry.ts` | Dependency direction | Low-Medium | After 2X |
| F7 | Vitest asserts ordering by reading Deno source as raw text | Dependency direction | Low | After 2X |
| F8 | `dispatch.ts` mixes generic routing with entry-specific drain loop | Layering | Low | After 2X |
| F9 | No automated lock-in for the migration 027 trigger fix | Future maintainability | Low | After 2X |
| F10 | No premature abstraction found | (positive) | — | — |
| F11 | Unconsumed projection prework still in the tree | Future maintainability | Low | After 2X |
| F12 | No runbook/script for Vault + Edge Function secret provisioning | Future maintainability | Medium | Before main |

## Findings

### F1 — Entity-resolution and trust modules duplicated between Node and Deno, with no drift detection

**Area:** Duplicated business logic / Node vs Deno shared code
**Severity:** High
**Where:** `src/features/interpretations/{entity-resolution,trust-builders,trust-policy}.ts` (Node, canonical) vs `supabase/functions/_shared/{entity-resolution,trust-builders,trust-policy}.ts` (Deno, copied).

These three files are the deterministic core of trust scoring and entity matching — the exact logic that decides whether an AI-extracted mention is trusted enough to auto-link. They were copied verbatim into `_shared/` because the Deno runtime cannot import the Node originals (see ADR-021: `src/lib/ai/openai-provider.ts` pulls in `"server-only"`, which throws unconditionally outside a bundler). The copies are correct today — each was diffed against its Node source by hand at write time, and every touched RPC round-tripped through a real remote smoke — but nothing *enforces* that they stay correct. A future change to `trust-policy.ts`'s scoring weights, made by someone unaware a Deno copy exists, would silently make the async worker's reprocessing trust scores diverge from the synchronous path's. There is no error, no failing test, no lint rule — just two interpretations of the same entry, from the same button, scored differently depending on which pipeline happened to process it.

**Recommended action:** Add a Vitest test that reads both copies of each file, strips the known, intentional deltas (the `.ts` extension on relative imports, the header comment block), and asserts the remaining source is character-identical. This is the same "read source as text and assert" technique already used by `src/lib/ai/usage-order.test.ts` (F7), so it fits the codebase's existing conventions and needs no new tooling. It converts a manual-discipline risk into a CI-enforced one without touching runtime behavior.

### F2 — OpenAI prompt, JSON schema, and extraction version constants duplicated between Node and Deno

**Area:** Duplicated business logic / Node vs Deno shared code
**Severity:** High
**Where:** `src/lib/ai/openai-provider.ts` (system prompt string, `entryExtractionSchema` via `zodTextFormat`, `EXTRACTION_STRATEGY_VERSION`, `EXTRACTION_PROMPT_VERSION`) vs `supabase/functions/process-jobs/entry.ts` (hand-transcribed JSON Schema, hand-copied prompt string, duplicated version constants).

This is the same risk class as F1 but with a larger blast radius for two reasons. First, the JSON Schema in `entry.ts` was *transcribed*, not copied — it is a raw JSON Schema object built by hand to match what `zodTextFormat(entryExtractionSchema, ...)` compiles to from the Zod schema, not a mechanical copy of source text, so there is strictly more room for a subtle shape mismatch than in F1. Second, `EXTRACTION_STRATEGY_VERSION`/`EXTRACTION_PROMPT_VERSION` are recorded into `entry_interpretations.strategy_version`/`prompt_version` — persisted, audited metadata. If the Node constant is bumped (e.g., a prompt-quality change ships as `"2026-08-01.1"`) without updating `entry.ts`, every interpretation produced by the worker would silently record the *old* prompt version against the *new* prompt behavior, corrupting the audit trail this project's own engineering standards require ("every AI decision records model, operation, confidence, prompt/strategy version"). Verified today: both copies currently hold `"entry-extraction-v1"` / `"2026-07-16.1"`, but nothing would catch the next change.

**Recommended action:** At minimum, extend the F1 drift test to also assert the two version-constant pairs are string-equal (cheap — no schema-shape comparison needed, just the two literals). A stronger version would additionally assert the two system-prompt strings are identical. Schema-shape equivalence (Zod vs raw JSON Schema) is harder to test mechanically and is reasonable to leave as a manual-review checklist item in `PHASE_2X_IMPLEMENTATION_PLAN.md` rather than block on tooling for it.

### F3 — `entry.ts` mixes four concerns in a single 579-line file

**Area:** Layering
**Severity:** Medium
**Where:** `supabase/functions/process-jobs/entry.ts`.

On the Node side, the equivalent responsibilities are split across `interpret-entry.ts` (extraction), `capture/actions.ts`/`interpretations/actions.ts` (orchestration and persistence), and `product-analytics/server.ts` (telemetry). In Deno, all four — provider call/schema construction, entity-resolution orchestration, RPC persistence orchestration, and best-effort product-event emission — live in one file. This isn't a correctness problem (the file is coherent and was fully exercised by the remote smoke), and Deno Edge Functions' single-bundle-per-function model makes some collapsing reasonable, but at 579 lines it's already larger than any single Node module in this area and will keep growing if a future slice adds more entry-worker responsibility (e.g., a second job mode).

**Recommended action:** Split along the same seams the Node side already uses: an `extraction` module (OpenAI call, schema, prompt), a `persistence` module (the mode-specific RPC calls), and keep `processEntryJob` in `entry.ts` as the thin orchestrator. Purely organizational — no behavior change, low risk.

### F4 — Six repeated `p_service_user_id` auth-resolution blocks in migration 026

**Area:** Duplicated business logic (SQL)
**Severity:** Medium
**Where:** `202607170026_phase_2x_entry_interpretation_worker.sql`, all six extended functions.

Each of `begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, and `fail_entry_reprocessing` repeats the identical ~8-line block:

```sql
if p_service_user_id is not null then
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  current_user_id := p_service_user_id;
else
  current_user_id := auth.uid();
end if;
```

This was a deliberate choice at implementation time — introducing a shared `private` helper would have meant a seventh new function in an already-large migration, for a slice explicitly scoped to avoid unnecessary new surface. The duplication is real but low-risk: the block is small, self-contained, and identical everywhere it appears (confirmed by direct grep), so drift within migration 026 itself is unlikely. The risk is more about the *next* function that needs the same pattern being written slightly differently by whoever adds it.

**Recommended action:** Factor into `private.resolve_acting_user(p_service_user_id uuid) returns uuid` the next time any of these six functions needs a migration anyway (e.g., alongside Slice 2X.7's candidate-consistency work, which already touches `correct_entry_interpretation`/`persist_reprocessed_entry_interpretation`). Not worth a dedicated migration on its own.

### F5 — Current RPC bodies spread across three migration files

**Area:** Future maintainability
**Severity:** Medium
**Where:** `persist_entry_interpretation`, `correct_entry_interpretation`, `persist_reprocessed_entry_interpretation` were defined in `020`, redefined in `021` (timestamp-ambiguity fix), and (the first four plus `begin_entry_interpretation`/`fail_entry_interpretation`/`begin_entry_reprocessing`/`fail_entry_reprocessing`) redefined again in `026`.

This is inherent to append-only migrations (never edit an applied migration) and is not a defect — but it means "what does `persist_entry_interpretation` actually do today" requires knowing the answer lives in `026`, not `020`. A reviewer or future agent grepping for the function by name will find three hits and needs out-of-band knowledge (this review, or the migration filenames' chronology) to know which one is authoritative.

**Recommended action:** No code change. Consider a short "current definition" pointer table in `DATABASE.md` for any RPC that has been redefined more than once, updated as part of the same slice that redefines it. Low cost, meaningfully reduces the "which file is real" tax on future readers.

### F6 — Product-event names hardcoded as untyped string literals in `entry.ts`

**Area:** Dependency direction
**Severity:** Low-Medium
**Where:** `entry.ts`'s `recordProcessingEvent` hardcodes `"capture_processing_completed"` / `"capture_processing_failed"` and their property shapes, duplicating (a two-name slice of) `src/features/product-analytics/contracts.ts`'s `productEventNames` allowlist and `ProductEventPropertiesByName`.

Small surface (two names, one property shape each), and the database's own allowlist (`private.validate_product_event_properties`, from migration 024) is the actual authority — a mismatch would be rejected at the RPC boundary, not silently accepted. So this is lower risk than F1/F2 (fails loudly via `record_product_event_for_user` returning an error, which the worker already treats as best-effort and logs), but it is still a place where Deno code encodes knowledge that TypeScript's type system enforces everywhere else in the product-analytics feature.

**Recommended action:** No urgency given the RPC-level allowlist backstop. If `entry.ts` is split per F3, consider a small local constant block naming the two events it emits, so at least the *set* of possible names is declared once inside the file rather than inline at each call site.

### F7 — Vitest asserts AI-usage ordering by reading Deno source files as raw text

**Area:** Dependency direction (test-time only, not runtime)
**Severity:** Low
**Where:** `src/lib/ai/usage-order.test.ts` — pre-existing pattern (previously pointed at `index.ts`), now repointed at `attachment.ts` and extended to `entry.ts`.

This creates a one-directional, test-time coupling: the Node test suite knows the Deno file paths and searches their text for literal substrings (`"const responseJson = await openaiResponse.json()"`, etc.). It is inherently fragile to cosmetic changes (renaming a variable breaks the assertion, not the behavior) and is exactly the kind of check that looks like it's testing behavior but is really testing source-text layout. That said, it's a pre-existing, deliberate convention in this codebase (not introduced by these slices), it's cheap, and it already caught one genuine ordering bug in `entry.ts` during this session (usage recorded before parsing) before deployment — so despite the fragility, it has demonstrated real value here.

**Recommended action:** No change recommended. Keep using it for ordering guarantees that can't otherwise be expressed (there's no integration harness that could observe "usage was recorded even though parsing later threw" without a real OpenAI call). Worth knowing it exists as a convention so future files that need the same guarantee follow the same pattern rather than inventing a new one.

### F8 — `dispatch.ts` mixes a generic type router with an entry-specific drain loop

**Area:** Layering
**Severity:** Low
**Where:** `supabase/functions/process-jobs/dispatch.ts` — `processClaimedJob` (generic, type-agnostic) and `runEntryDispatchDrain` (specific to `interpret_entry`) live in the same 88-line file.

Small enough today that this isn't worth acting on, but if a second job type ever gets its own drain loop, `dispatch.ts` would become the place where every type's specific orchestration accumulates, which is a different responsibility than "decide which processor a claimed job goes to."

**Recommended action:** No change now. If a second drain loop is ever added, split `dispatch.ts` into `router.ts` (type-agnostic) and per-type drain modules at that point.

### F9 — No automated lock-in for the migration 027 trigger fix beyond the (unexecuted) pgTAP file

**Area:** Future maintainability
**Severity:** Low
**Where:** `202607170027_fix_entry_interpretation_job_payload_check_privilege.sql`; the errcode contract it must preserve is asserted only in `supabase/tests/entry_processing_jobs.sql`, which cannot run on this workstation (Docker unavailable — already logged as an external limitation in every slice report to date, not new to 2X.4).

The fix itself is verified (remote smokes passed before-broken/after-fixed), but the *specific* behavior it must not regress again — an `authenticated` insert of a `process_attachment` job must succeed, and an invalid `interpret_entry` payload must still fail with `23514` — has no standing regression test that runs in this environment today. `remote-job-reliability-smoke.mjs` now incidentally covers the first half every time it runs; nothing besides the un-runnable pgTAP file covers the second half.

**Recommended action:** No new action beyond what's already tracked — this is the same Docker/pgTAP gap every prior slice has carried, not a new one. Restate it here only because migration 027 is a case where that gap has already once cost real production behavior (the 025 regression went undetected for one whole slice). Prioritize enabling pgTAP in CI (already on `TODO.md`) over adding yet another remote-smoke-only check for this specific trigger.

### F10 — No premature abstraction found (positive finding)

**Area:** Unnecessary abstractions
**Severity:** — (informational)

Explicitly checked for and not found: no generic job-queue platform was introduced (the existing `jobs` table and lease RPCs were reused as-is); no generic read-model/projection framework was built for the trust/entity-resolution reuse problem (a direct file copy plus a comment was chosen over a shared-package abstraction, which would have been more machinery than three ~120-line files justify); the `p_service_user_id` extension pattern is the minimal viable shape (one optional parameter) rather than a new authorization framework; `dispatch.ts`'s type router is a four-line switch, not a plugin registry. This restraint is itself a maintainability asset and is worth preserving as later slices (2X.7 onward, which touch more of this same surface) get planned.

### F11 — Unconsumed projection prework still present in the tree

**Area:** Future maintainability
**Severity:** Low
**Where:** `src/features/daily-cycle/projection-mappers.ts` and its DTOs (historical commit `9f0c1e6`, explicitly reclassified as prework, not credited to 2X.3).

Not introduced by 2X.3 or 2X.4 and not blocking either, but it sits in the same directory tree as the daily-cycle contracts these slices build on, has zero consumers, and a reviewer scanning `src/features/daily-cycle/` today would reasonably wonder why. `STATE.md`/`TODO.md` already track this accurately (unconsumed, awaiting an authorized loader/UI slice), so this is a documentation-is-already-correct case — flagged here only because "future maintainability" was explicitly in scope for this review.

**Recommended action:** No action until the slice that's meant to consume it (per the traceability table, projection consumers land across 2X.6/2X.8/2X.10/2X.12/2X.16). If that keeps slipping, worth a TODO note that unconsumed prework older than N slices should be revisited.

### F12 — No runbook or script for the Vault + Edge Function secret provisioning this slice depends on

**Area:** Future maintainability
**Severity:** Medium
**Where:** `WORKER_DISPATCH_SECRET` (Edge Function secret) and the `entry_dispatch_url`/`entry_dispatch_secret` Vault entries were provisioned this session via ad hoc CLI/SQL commands, not a script.

Every other piece of remote setup in this project (migrations, remote smokes, even `HEARTBEAT_SECRET`) has either a committed script or is at least a one-line documented CLI invocation. The Vault secret creation in this slice was a one-off `supabase db query --file` call constructed inline in the session and discarded — correct and verified (both secrets confirmed present by name), but if this project is ever provisioned on a fresh Supabase project (disaster recovery, staging, a second environment), whoever does that provisioning has no written procedure to follow; they would need to reconstruct the exact `vault.create_secret(...)` calls and the Edge Function secret name from `DECISIONS.md`/`SECURITY.md` prose rather than running a command.

**Recommended action:** Add a short, explicit operational runbook (a few lines in `SECURITY.md` or a new `docs/OPERATIONS.md`) naming the three secrets that must exist for entry dispatch to function (`WORKER_DISPATCH_SECRET` Edge Function secret, `entry_dispatch_url` and `entry_dispatch_secret` Vault entries) and the exact commands to (re)create them, without embedding any value. Cheap, and closes a real "how would the next person even know to do this" gap.

## Recommended before Slice 2X.5 continues

None of the above are correctness blockers — every remote smoke this session ran passed, including after the migration 027 fix. Nothing here should hold up starting 2X.5. F1, F2, and F12 are flagged "before main" because they are cheap now and get more expensive the longer the branch runs with more slices layering on top of this same Node/Deno boundary; they fit naturally as a small, standalone slice (or as the first task of whichever slice next touches `entry.ts`) rather than something to interrupt 2X.5 for.
