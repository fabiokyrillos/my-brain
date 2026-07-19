# Phase 2C Slice 01 — Database GREEN Report

## Status

**DATABASE GREEN** for the editable candidate confirmation contract in linked
Supabase project `ulvwzqlpsjyrnqzfxmck`.

This gate covers migrations, PostgreSQL functions and triggers, RLS-facing
privileges, idempotency, undo, authenticated behavior, concurrency, generated
database types, and repository checks. The TypeScript edit contract, due-date
utilities, `CandidateEditor`, and Server Action integration are intentionally
outside this database slice and remain unimplemented.

## Baseline and commits

- Date: 2026-07-19
- Branch: `codex/phase-2c-editable-candidate-tasks`
- Approved base: `7d550cafa3f3346811b7c293d6d3d99f69813925`
- Starting RED commit: `c292301fc3641162056b30b9ea7aa680983d157b`
- Reviewed implementation commit:
  `495cf1671b258101f3a0975a5fde4fd0babe70ec`
  (`feat(db): add editable candidate confirmation contract`)
- Migration history before execution: local and linked both ended at
  `202607180031`
- Database contract migration:
  `202607190032_phase_2c_editable_candidate_confirmation.sql`
- Forward-only concurrency correction:
  `202607190033_guard_v2_confirmation_correction_race.sql`
- Verification commit subject:
  `chore(db): verify editable confirmation remotely`

The linked project was not empty, contrary to the premise in the execution
request. Before testing it contained 2 Auth users, 2 profiles, 2 entries,
2 interpretations, 3 tasks, 1 undo operation, and 6 audit rows. The test
harness therefore used uniquely prefixed, user-scoped fixtures and preserved
all pre-existing rows. No claim is made that the project contained no important
data.

## Deployed contract

Migration `032` adds:

- nullable `public.undo_operations.request_fingerprint text`;
- a constraint accepting only `NULL` or a 64-character lowercase SHA-256
  hexadecimal fingerprint;
- `public.confirm_entry_task_candidates_v2(
  uuid, uuid, integer[], jsonb, text) returns jsonb`;
- canonical edit normalization and fingerprinting with
  `extensions.digest` plus `pg_catalog.encode`;
- editable `title`, `description`, and `due_at` fields without mutating the
  stored interpretation candidate;
- stale-interpretation, ownership, selection, duplicate, unknown-field,
  malformed-payload, due-date, and already-materialized guards;
- same-key/same-payload replay, same-key/different-payload rejection, atomic
  task/evidence/audit/undo creation, and replay-after-undo behavior;
- `SECURITY DEFINER`, explicit empty `search_path`, authenticated-only execute,
  and preserved legacy RPC compatibility.

Real two-session testing exposed a correction-versus-confirmation race after
`032`: confirmation and a new `user_corrected` interpretation could both commit
when they started against the same current interpretation. Because `032` was
already applied, the defect was corrected only through forward migration `033`.

Migration `033` installs a private `SECURITY DEFINER` trigger function with an
empty `search_path`. Its `BEFORE INSERT` trigger rejects a new
`user_corrected` interpretation with SQLSTATE `55P03` while active tasks from a
v2 confirmation still exist. Undo cancels those tasks and releases the
correction boundary. The trigger function has no execute grant for `PUBLIC`,
`anon`, or `authenticated`.

## Linked migration execution

1. The first linked dry-run listed only migration `202607190032`.
2. Migration `032` applied successfully.
3. The focused contract and authenticated smokes passed, but the real
   correction race identified the defect described above.
4. The next linked dry-run listed only migration `202607190033`.
5. Migration `033` applied successfully.
6. Final migration listing confirmed local/remote parity through `033`.

No reset, drop, migration-history rewrite, or production deployment was used.

## Validation evidence

| Gate | Result |
| --- | --- |
| Focused linked pgTAP | **74/74 passed** |
| Complete linked pgTAP suite | **385/385 passed** across 13 files |
| pgTAP failures, skips, errors, or plan mismatches | **0** |
| Authenticated disposable smoke cases | **25/25 passed** |
| Same key, same payload race | Passed; one semantic result, 15.584 s |
| Same key, different payload race | Passed; mismatch rejected, 14.232 s |
| Different keys, same candidate race | Passed; duplicate materialization prevented, 12.917 s |
| Confirmation-first correction race | Confirmation committed; correction rejected `55P03`, 4.976 s |
| Correction-first confirmation race | Correction committed; confirmation rejected `55P03`, 4.289 s |
| Linked catalog/security inspection | Passed |
| Linked migration parity | `032` and `033` local/remote |
| `supabase db lint --linked --level error` | Passed |
| Generated database types | Passed; 13 expected additions, 0 removals |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `git diff --check` | Passed; only line-ending notices |

The full pgTAP result was:

- `ai_usage_rls.sql`: 19
- `candidate_action_consistency.sql`: 33
- `editable_candidate_confirmation.sql`: 74
- `editable_candidate_confirmation_race.sql`: 6
- `entry_interpretation_worker.sql`: 25
- `entry_processing_jobs.sql`: 46
- `foundation_hardening.sql`: 36
- `intelligent_capture_rls.sql`: 8
- `interpretation_revisions.sql`: 46
- `job_queue_reliability.sql`: 26
- `needs_attention_projection.sql`: 35
- `phase1_rls.sql`: 8
- `product_events.sql`: 23

The installed Supabase CLI still attempted to use Docker for `supabase test db
--linked`, and Docker was unavailable. The linked test harness therefore used
temporary CLI database credentials without printing them, executed each pgTAP
file as PostgreSQL in an isolated transaction, and rolled every file back. The
temporary `pgtap` extension creation was also transactional; final catalog
inspection confirmed that it was not left installed.

## Authenticated smoke coverage

Disposable Auth users exercised:

- no-edit confirmation;
- title edit, description edit and clear, due-date edit and clear, and combined
  edits;
- anonymous and cross-owner rejection;
- malformed JSON, unknown fields, duplicate indexes, unselected candidates,
  stale interpretations, and record-only candidates;
- same-key replay and mismatch, already-materialized behavior, undo, repeated
  undo, and replay after undo;
- audit and undo privacy;
- partial confirmation with `needs_attention` projection;
- immutable interpretation candidates;
- excluded relation behavior;
- real separate-session races in both transaction orderings.

Cleanup removed the exact disposable Auth users and their cascaded rows. Final
inspection found 0 `phase-2c-test-*` users, 0 Phase 2C smoke entries, and the
same pre-existing row counts recorded before testing.

## Generated types and test reconciliation

`src/lib/supabase/database.types.ts` was regenerated from the linked project in
the repository-standard location. Its diff contains only the expected three
`request_fingerprint` row/insert/update properties and the v2 RPC signature.

The complete linked suite also exposed stale assertions in older pgTAP files:
old function signatures, brittle `proconfig` comparisons, invalid pgTAP helper
usage, missing RLS assertions, and fixtures that could claim unrelated queued
jobs. Those tests were reconciled with the migration-backed current schema and
made transaction-scoped; no unrelated production behavior was changed.

## Independent review

- **PostgreSQL:** checked function signatures, JSON normalization, constraints,
  lock ordering, atomic writes, undo behavior, migration forward compatibility,
  and transactional test isolation.
- **Security:** checked ownership and stale-state guards, `SECURITY DEFINER`
  search paths, execute grants, RLS-facing authenticated behavior, privacy of
  audit/undo rows, and absence of direct trigger-function execution grants.
- **Concurrency:** checked same-key replay/mismatch, competing keys for one
  candidate, confirmation-versus-correction in both orderings, and release of
  the guard after undo.

No unresolved database blocker remains for Phase 2C.1.

## Rollback and remaining scope

The old UI continues to call the preserved legacy RPC, so application rollback
does not require reverting the database. If either deployed contract must be
changed, use a new forward migration (`034+`); do not edit applied migrations
`032` or `033`.

No UI, Server Action, Edge Function, provider, queue, worker, push, or pull
request is part of this closeout.

The exact next task is: implement the TypeScript edit contract, due-date
utilities, `CandidateEditor`, and Server Action integration for Phase 2C.1.
