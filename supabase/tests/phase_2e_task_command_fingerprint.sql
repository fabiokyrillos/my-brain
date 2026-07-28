-- Phase 2E Slice 2E.3 - the preview fingerprint (PRD 2E-PREVIEW-004,
-- 2E-IDEMPOTENCY-003), migration 202607250057.
--
-- Postgres owns this value and TypeScript never hashes it, so every property
-- the requirement names is a property of SQL and nothing in Vitest can observe
-- any of them. Three of the four are silent when they break:
--
--   * canonicality. `jsonb_build_object` sorts keys and discards whitespace
--     before `::text` ever runs, which is what makes 2E-IDEMPOTENCY-003 hold
--     structurally rather than by convention. If a future edit reached for
--     `to_json`, `::json` or a hand-built string, key order and spacing would
--     start reaching the digest and a replay would stop being recognized as
--     one - with no error anywhere;
--   * timezone independence. `to_jsonb(timestamptz)` renders through the
--     session `TimeZone` GUC, which `set search_path = ''` does not pin, so a
--     bare instant inside the hashed object would hash differently for two
--     callers in two zones. `202607230051:203` carries exactly that latent bug.
--     The argument is `text` for this reason, and the probe below is what stops
--     someone casting it back;
--   * the security posture. `immutable`, not `security definer`, and pinned to
--     an empty `search_path` - which together are why 2E-PREVIEW-001 ("a
--     preview is read-only") is structurally true rather than asserted, and why
--     computing a fingerprint cannot re-read the task and reopen the TOCTOU
--     window `observed_before` exists to close.
--
-- The fourth, sensitivity to each input, is the one that fails loudly - but
-- only if every input is exercised, so all seven are, one at a time.
--
-- Written in pure ASCII, following the doctrine of
-- `phase_2e_task_command_matching.sql`: nothing here needs a non-ASCII value,
-- and an editor re-encoding one would change what is being asserted.

begin;
select plan(19);

-- Contract: it exists with the signature the migration declares ---------------

select has_function(
  'public',
  'task_command_fingerprint',
  array['uuid', 'uuid', 'text', 'jsonb', 'jsonb', 'text', 'text'],
  'the preview fingerprint exists with the seven inputs 2E-PREVIEW-004 enumerates'
);

-- The shape `undo_operations_request_fingerprint_check` already accepts
-- (`202607190032:20-27`), so Slice 2E.4 stores it with no new column and no new
-- constraint. Anchored at both ends: a 64-character prefix of a longer value
-- would satisfy an unanchored pattern and then fail that CHECK in production.
select matches(
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  '^[0-9a-f]{64}$',
  'the fingerprint is 64 lowercase hex characters, which is the shape the undo ledger already accepts'
);

-- The base value every difference below is measured against. Held in a temp
-- table rather than restated seven times, so a typo in the base cannot make one
-- of the seven assertions pass for the wrong reason.
create temporary table task_command_fingerprint_base as
select public.task_command_fingerprint(
  '51111111-1111-4111-8111-111111111111'::uuid,
  '51000001-1111-4111-8111-111111111111'::uuid,
  '2026-07-25T12:00:00.000Z',
  '{"status":"todo","dueAt":null}'::jsonb,
  '{"action":"complete_task"}'::jsonb,
  'task-command-policy-v1',
  'complete_task'
) as digest;

-- 2E-IDEMPOTENCY-003: canonical under key order and whitespace ---------------
--
-- These two are the requirement stated literally. They hold because jsonb is
-- already a canonical value by the time `::text` runs, not because anything
-- sorts or trims - which is why the assertion is worth having: it is what
-- fails if the canonicalizer is ever replaced by one that is not.

select is(
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"assign_person","personRef":"Bruno","reason":"handover"}'::jsonb,
    'task-command-policy-v1',
    'assign_person'
  ),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"reason":"handover","personRef":"Bruno","action":"assign_person"}'::jsonb,
    'task-command-policy-v1',
    'assign_person'
  ),
  'the same patch written in two key orders is one fingerprint'
);

select is(
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"a":1}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{ "a" : 1 }'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'and insignificant whitespace is not a difference either'
);

-- Every one of the seven inputs reaches the digest --------------------------
--
-- 2E-PREVIEW-004 names task identity, observed pre-state, canonical patch,
-- policy version, owner and operation key. An input dropped from the hashed
-- object would make two materially different requests share a fingerprint,
-- which is how a confirmation token bound to one of them would authorize the
-- other. Each is varied alone, against the same base.

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '52222222-2222-4222-8222-222222222222'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'the owner reaches the digest'
);

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000002-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'the task identity reaches the digest'
);

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.001Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'the observed instant reaches the digest, down to the millisecond'
);

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"in_progress","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'the observed pre-state reaches the digest, which is what makes a stale preview detectable'
);

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"cancel_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'the canonical patch reaches the digest'
);

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v2',
    'complete_task'
  ),
  'the policy version reaches the digest, so a policy change cannot silently reuse a confirmation'
);

select isnt(
  (select digest from task_command_fingerprint_base),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'cancel_task'
  ),
  'the operation key reaches the digest'
);

-- No timezone-dependent rendering -------------------------------------------
--
-- The migration takes the instant as `text` precisely so that the session
-- `TimeZone` GUC cannot reach the hashed object. This is the probe that fails
-- if anyone casts it back to `timestamptz` inside the function: two callers in
-- two zones would then derive two fingerprints for one request, and every
-- replay would look new.
--
-- `set local` is transaction-scoped, so the rollback below restores nothing
-- that needed restoring.

set local timezone to 'UTC';
create temporary table task_command_fingerprint_utc as
select public.task_command_fingerprint(
  '51111111-1111-4111-8111-111111111111'::uuid,
  '51000001-1111-4111-8111-111111111111'::uuid,
  '2026-07-25T12:00:00.000Z',
  '{"status":"todo","dueAt":null}'::jsonb,
  '{"action":"complete_task"}'::jsonb,
  'task-command-policy-v1',
  'complete_task'
) as digest;

set local timezone to 'America/Sao_Paulo';

select is(
  (select digest from task_command_fingerprint_utc),
  public.task_command_fingerprint(
    '51111111-1111-4111-8111-111111111111'::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  'the same request hashes identically under UTC and under America/Sao_Paulo'
);

set local timezone to 'UTC';

-- Strict: a hole is null, never a plausible-looking hash of one --------------
--
-- Mirrors `public.normalize_entity_alias` (`202607170020:97-102`). Strictness
-- is all-or-nothing in Postgres (`pg_proc.proisstrict`), so one null input is
-- the whole property.

select is(
  public.task_command_fingerprint(
    null::uuid,
    '51000001-1111-4111-8111-111111111111'::uuid,
    '2026-07-25T12:00:00.000Z',
    '{"status":"todo","dueAt":null}'::jsonb,
    '{"action":"complete_task"}'::jsonb,
    'task-command-policy-v1',
    'complete_task'
  ),
  null::text,
  'a null input yields null rather than a hash of a hole'
);

-- Grants ---------------------------------------------------------------------
--
-- The fingerprint is identity, never authorization: its inputs are all values
-- the caller already holds, so a client can derive it. That is exactly why
-- 2E-DESTRUCTIVE-002 requires a separate, server-issued, single-use
-- confirmation token bound to it, and why granting `authenticated` here costs
-- nothing.

select ok(
  has_function_privilege(
    'authenticated',
    'public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text)'::regprocedure,
    'execute'
  ),
  'authenticated may derive its own preview fingerprint'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text)'::regprocedure,
    'execute'
  ),
  'anon may not (2E-OWNERSHIP-003)'
);

select ok(
  not has_function_privilege(
    'public',
    'public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text)'::regprocedure,
    'execute'
  ),
  'and neither may PUBLIC, so the revoke is real rather than shadowed by a default grant'
);

-- Security posture, pinned against the catalog -------------------------------

-- Compared as text: `provolatile` is `"char"`, and a quoted-identifier cast
-- inside a polymorphic pgTAP argument is fragile to write portably.
select is(
  (select provolatile::text from pg_proc where oid =
    'public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text)'::regprocedure),
  'i',
  'the fingerprint is IMMUTABLE, which is what says it reads no row and cannot reopen the TOCTOU window'
);

select is(
  (select prosecdef from pg_proc where oid =
    'public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text)'::regprocedure),
  false,
  'and it is deliberately NOT SECURITY DEFINER: it needs no privilege it is not already given'
);

-- Compared as text for the reason `phase_2e_task_command_ai_usage.sql` records:
-- `proconfig` is text[] and Postgres stores the empty value quoted.
select is(
  (select array_to_string(proconfig, ',') from pg_proc where oid =
    'public.task_command_fingerprint(uuid, uuid, text, jsonb, jsonb, text, text)'::regprocedure),
  'search_path=""',
  'and it still pins an empty search_path, so every function it calls is schema-qualified'
);

select * from finish();
rollback;
