-- Phase 2E Slice 2E.3 — the preview fingerprint (PRD 2E-PREVIEW-004).
--
-- 2E-PREVIEW-004: "A preview carries a fingerprint over task identity, observed
-- pre-state, canonical patch, policy version, owner and operation key."
-- 2E-IDEMPOTENCY-003: "The canonical request fingerprint is stable under key
-- reordering and insignificant whitespace."
--
-- Postgres owns this, and TypeScript never hashes. Every one of the fourteen
-- `request_fingerprint` values this repository computes is computed in SQL
-- (`202607190032:352`, `202607210036:498`, `202607220038:780`, `202607220039:763`,
-- `202607220040:578,1226,2157`, `202607220041:1184`, `202607220044:1101`,
-- `202607230046:124`, `202607230047:116`, `202607230048:210`, `202607230050:248`,
-- `202607230051:211`), and Slice 2E.4's mutation RPC has to derive the same value
-- to recognize a replay and to bind a confirmation token to it. A TypeScript
-- implementation would therefore create a cross-language canonical-serializer
-- parity surface — the identical defect class 2E-MATCH-008 characterizes one
-- slice earlier for the normalizer, where the two languages *cannot* be made to
-- agree. `JSON.stringify` and `jsonb::text` diverge on key order (jsonb sorts by
-- key length, then bytes; `schema.ts`'s `canonicalize` sorts lexicographically),
-- on separators, and on how they render an instant. None of that has to be
-- reconciled if only one of them ever hashes.
--
-- Why this is a new migration and not another amendment to `202607250056`:
-- adding a function is not a `RETURNS TABLE` change, so it costs no `42P13`
-- budget, and keeping it separate keeps slice attribution honest — `…056` is
-- Slice 2E.2's artifact that Slice 2E.3 amended, while this is Slice 2E.3's own.
--
-- `jsonb_build_object` *is* the canonicalizer. jsonb stores an object with its
-- keys sorted and its whitespace discarded, so two payloads differing only in
-- key order or spacing are the same value before `::text` ever runs, and
-- 2E-IDEMPOTENCY-003 holds structurally rather than by a convention someone has
-- to remember. `202607230046:117-118` states the same claim for the same reason.
--
-- **No `timestamptz` argument, and no bare timestamp inside the hashed jsonb.**
-- `to_jsonb(timestamptz)` renders through the session's `TimeZone` GUC, which
-- `set search_path = ''` does not pin, so the same logical payload would hash
-- differently for two callers in two zones. Instants arrive already rendered as
-- text by the caller that read them. `202607230051:203` hashes a
-- timestamptz-derived value and carries that latent bug; this does not copy it.
--
-- **`immutable`, not `stable`, and deliberately not `security definer`.** This
-- function reads no table and touches no row, which is what makes 2E-PREVIEW-001
-- ("a preview is read-only") and 2E-PREVIEW-007 structurally true rather than
-- asserted, and it is why computing a fingerprint cannot re-read the task and
-- reopen the TOCTOU window `observed_before` exists to close. `strict` mirrors
-- `public.normalize_entity_alias` (`202607170020:97-102`): a null input yields
-- null rather than a plausible-looking hash of a hole.
--
-- **The fingerprint is identity, never authorization.** It is granted to
-- `authenticated` and its inputs are all values the caller already holds, so a
-- client can derive it. That is exactly why 2E-DESTRUCTIVE-002 requires a
-- *separate*, server-issued, single-use confirmation token bound to it, and why
-- Slice 2E.5 must not accept a matching fingerprint as evidence of confirmation.
--
-- Output is 64 lowercase hex characters, which is already the shape
-- `undo_operations_request_fingerprint_check` (`202607190032:20-27`) accepts, so
-- Slice 2E.4 stores it with no new column and no new constraint.

create or replace function public.task_command_fingerprint(
  p_owner_id uuid,
  p_task_id uuid,
  p_observed_before text,
  p_pre_state jsonb,
  p_patch jsonb,
  p_policy_version text,
  p_operation_key text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
    -- pgcrypto installs digest in extensions; encode is a PostgreSQL built-in
    -- in pg_catalog. Identical to the idiom every other fingerprint here uses.
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'ownerId', p_owner_id,
          'taskId', p_task_id,
          'observedBefore', p_observed_before,
          'preState', p_pre_state,
          'patch', p_patch,
          'policyVersion', p_policy_version,
          'operationKey', p_operation_key
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

comment on function public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text) is
  'Phase 2E preview fingerprint (PRD 2E-PREVIEW-004, 2E-IDEMPOTENCY-003). Pure and immutable: hashes the canonical jsonb request and reads nothing. Identity for replay and confirmation-token binding only, never authorization evidence.';

grant execute on function public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text) to authenticated;
revoke all on function public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text) from public, anon;
