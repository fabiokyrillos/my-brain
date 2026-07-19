# Phase 2C Slice 01 — Database Gate Report

## Status

**READY FOR LINKED EXECUTION — NOT YET DATABASE GREEN.**

The Phase 2C.1 database implementation has passed static review, lint, and
typecheck. Because the local Supabase/PostgreSQL runtime is unavailable, the
authorized linked project will provide the required runtime execution. At this
checkpoint migration `032` has not been applied remotely, the 74 pgTAP
assertions and the relevant legacy suites have not yet executed there, and this
report must not yet be read as deployment or acceptance evidence.

## Baseline and scope

- Date: 2026-07-19
- Branch: `codex/phase-2c-editable-candidate-tasks`
- Approved base: `7d550cafa3f3346811b7c293d6d3d99f69813925`
- Starting RED commit: `c292301fc3641162056b30b9ea7aa680983d157b`
- Starting commit subject: `test(phase-2c): define editable candidate confirmation behavior`
- Migration tail before implementation: local and linked history both ended at `202607180031`
- Migration drafted: `supabase/migrations/202607190032_phase_2c_editable_candidate_confirmation.sql`

Only the database migration, the two directly relevant pgTAP files, and this
report were changed. The UI, TypeScript edit contract, Server Actions, Edge
Functions, queues, workers, Auth, providers, and generated database types were
not changed.

## Drafted database contract

Exact RPC:

```sql
public.confirm_entry_task_candidates_v2(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_candidate_edits jsonb,
  p_operation_key text
) returns jsonb
```

Schema delta:

- Adds nullable `public.undo_operations.request_fingerprint text`.
- Adds a check requiring every non-null fingerprint to match
  `^[0-9a-f]{64}$`.
- Adds the versioned RPC without replacing or redefining
  `public.confirm_entry_task_candidates(uuid,uuid,integer[],text)`.

Security and grants:

- `language plpgsql`, `security definer`, `set search_path = ''`.
- Caller identity comes only from `auth.uid()`; there is no owner argument.
- Relations and security-sensitive functions are schema-qualified.
- No dynamic SQL is used.
- Execute is revoked from `public` and `anon` and granted to `authenticated`.
- Owner/entry/interpretation lookups use the same generic `P0002` boundary, so
  cross-owner existence is not disclosed.

## Input and materialization rules

- Normalized operation key length: 8–240; internal namespace:
  `confirm-v2:<normalized-key>`.
- Selected indices: one-dimensional, non-null, 1–50, non-negative, unique, and
  sorted canonically.
- Candidate edits: JSON array, 0–50 objects, no more than 131,072 serialized
  UTF-8 bytes, one edit per selected candidate, and closed keys only.
- Editable fields: `title`, `description`, and `dueAt` only.
- Title is trimmed, non-empty, non-null, and at most 240 characters.
- Description is trimmed, at most 2,000 characters, and explicit null or blank
  canonicalizes to SQL null.
- Due date is null or an offset-bearing ISO-8601 instant accepted as
  `timestamptz`; offsetless and malformed values are rejected.
- Effective values are resolved from the immutable candidate plus normalized
  edits. Values equal to the immutable suggestion are removed from canonical
  changes.
- Created tasks are `inbox`, have no parent, waiting person, planned date,
  manual priority, no-due reason, relation rows, or dependency rows, and retain
  entry/interpretation/candidate/operation/confidence/creator provenance.

## Canonical fingerprint

The deterministic jsonb request is:

```json
{
  "entryId": "uuid",
  "interpretationId": "uuid",
  "selectedCandidateIndexes": [0, 1],
  "candidateEdits": [
    {
      "candidateIndex": 0,
      "changes": {
        "title": "normalized text",
        "description": null,
        "dueAt": "2026-07-22T09:00:00-03:00"
      }
    }
  ]
}
```

Selected indices and edit objects are ordered by candidate index. Empty changes
and values equal to the immutable suggestion are omitted. The function hashes
the PostgreSQL jsonb text representation as UTF-8 and persists lowercase
SHA-256 hexadecimal.

Read-only inspection of the linked catalog found:

- `extensions.digest(bytea,text)` from `pgcrypto 1.3`;
- `pg_catalog.encode(bytea,text)`, the PostgreSQL built-in hexadecimal encoder;
- no `extensions.encode(bytea,text)` function.

The RED pgTAP expectation and its SHA helper were corrected to use the actual
deployed qualification, `extensions.digest` plus `pg_catalog.encode`. No schema
wrapper or substitute hash was introduced.

## Transaction and idempotency sequence

1. Require `auth.uid()` and validate all bounded input before writes.
2. Load the immutable owner/entry/interpretation tuple and reject record-only or
   out-of-range candidates.
3. Resolve effective values, canonical edits, edited-field names, and SHA-256.
4. Reserve `undo_operations(user_id, operation_key)` with the namespaced key,
   fingerprint, and bounded placeholder evidence.
5. On conflict, lock the existing operation: an equal fingerprint returns the
   original task IDs/undo ID; a different fingerprint raises
   `2C_IDEMPOTENCY_MISMATCH`.
6. For a new request, lock the owner-scoped entry and require the supplied
   interpretation to remain current.
7. Reject a candidate already materialized by another operation with
   `2C_ALREADY_MATERIALIZED`.
8. Insert tasks in candidate-index order, finalize undo evidence, append one
   bounded audit row, and return the deterministic IDs.

Any downstream exception rolls back the reservation, tasks, audit row, and undo
evidence together. Replay ignores undo/expiry status and returns the original
result without rematerializing.

## Closed failure contract

- `42501`: unauthenticated/forbidden.
- `P0002`: owner-scoped entry or interpretation not found.
- `55P03`: stale expected interpretation.
- `55000`: record-only interpretation.
- `22023`: malformed selection, edit, or editable value.
- `P0001`, detail `2C_IDEMPOTENCY_MISMATCH`: same key, different canonical request.
- `P0001`, detail `2C_ALREADY_MATERIALIZED`: another operation already resolved a candidate.

Database messages contain no private row content. The only application-facing
details are the two approved closed tokens.

## Legacy security reconciliation

`supabase/tests/candidate_action_consistency.sql` expected the legacy candidate
RPC to be `SECURITY INVOKER`. Migration `028`, `docs/SECURITY.md`, and
`docs/DECISIONS.md` establish `SECURITY DEFINER` with an empty search path,
explicit owner checks, authenticated execute, and public/anonymous denial as
the intended architecture. Only that stale expectation and its explanatory
text were changed; production security and the legacy RPC definition were not.

## `undo_operation` `40001` investigation

The remaining `40001` branch belongs to undoing an interpretation correction
after a newer revision. Candidate-confirmation undo takes the earlier
`action_type in ('confirm_entry_tasks', 'confirm_entry_task_candidates')` path,
cancels only the stored task IDs, records audit evidence, and supports repeated
undo. The v2 RPC intentionally reuses `confirm_entry_task_candidates`, so its
undo does not enter the correction-conflict branch. No `undo_operation` rewrite
is required for the Phase 2C.1 candidate acceptance boundary, and concurrency
semantics were not weakened.

## Validation evidence

| Gate | Result |
| --- | --- |
| Branch/base/RED SHA and clean starting worktree | Pass |
| Local and linked migration parity through `031` | Pass, read-only |
| Linked cryptographic catalog inspection | Pass, read-only |
| Focused local pgTAP (`editable_candidate_confirmation.sql`) | **Blocked before execution** |
| Full local pgTAP suite | **Blocked before execution** |
| Declared pgTAP plan/assertion count | Pass: 74/74 statically |
| Inline JSON fixture parsing | Pass: 0 invalid literals |
| PostgreSQL SQL parser | Pass: 5 statements |
| PL/pgSQL parser | Pass: 1 function |
| Static SQL/security/scope checks | Pass: 16/16 |
| Ephemeral local PostgreSQL-WASM semantic smoke | Pass, supplemental only |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| Intentional Phase 2C TypeScript RED boundary | Preserved: 104 failed, 2 passed |
| `npx supabase db lint --linked --level error` | Pass, read-only baseline only |
| `git diff --check` plus untracked migration whitespace check | Pass |

The supplemental PostgreSQL-WASM smoke applied migration `032` to an in-memory
schema and confirmed: two ordered task IDs, a non-idempotent first result,
same-ID/same-undo replay, mismatch and already-materialized detail tokens,
`22023` due-date rejection, one audit/undo row, rollback of failed reservations,
and a 64-character lowercase fingerprint. It does not include Supabase RLS,
pgTAP, the complete migration history, or real two-session concurrency and is
not a substitute for the blocked gates.

## Local environment blocker

- `docker` is not installed or discoverable.
- No Docker/PostgreSQL Windows service is present.
- No listener exists on ports `5432` or `54322`.
- No WSL distribution or PostgreSQL executable is available.
- `npx supabase status` cannot find the local Docker engine.
- Both focused and full `npx supabase test db --local` attempts fail while
  connecting to `127.0.0.1:54322`; no pgTAP assertion executes.

Local runtime execution remains unavailable. The user has explicitly authorized
replacing it with execution against the linked development project, which has
zero users and zero important data. The database boundary is not GREEN until
all linked pgTAP, authenticated smoke, concurrency, cleanup, and review gates
pass.

## Independent review

Three local review passes were completed:

1. PostgreSQL: additive schema, bounds, canonical values, exact evidence, parser
   validity, and legacy coexistence.
2. Application security: caller derivation, closed JSON, empty search path,
   qualification, grants, cross-owner disclosure, and audit privacy.
3. Concurrency/idempotency: owner/key reservation, same/different payload,
   entry locking, candidate uniqueness, rollback, replay after undo, and atomic
   task/audit/undo writes.

No critical or important static/supplemental finding remains. The review is not
complete for acceptance until real two-session confirmation and
correction-versus-confirmation races run against the local Supabase stack.

## No remote mutation and rollback

No migration was applied locally, to the linked project, or to production. The
only linked operations were read-only migration listing, catalog queries, and
database lint. No deployment, push, or pull request occurred.

Before deployment, rollback is simply discarding the uncommitted migration and
test/report edits. After a future authorized migration application, the old UI
continues using the preserved legacy signature, so UI rollback requires no
database rollback. Any schema removal would require a new forward migration.

## Linked execution authorization and next gates

The user explicitly authorized the linked online Supabase project as the
development and validation environment for this slice. The project reference is
`ulvwzqlpsjyrnqzfxmck`; no credential, token, connection string, or secret is
recorded here.

After the reviewed implementation commit, the remaining gates are: dry-run and
apply only migration `032`, confirm migration parity and the deployed contract,
run focused and complete linked pgTAP suites, run authenticated disposable
smokes and real two-session races, prove fixture cleanup, regenerate the
repository-standard database types, and complete the final independent review.
Only then may this report be changed to GREEN.
