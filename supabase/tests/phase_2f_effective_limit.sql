-- Phase 2F Slice 2F.1 — 2F-PRECOND-002: the `effective_limit` row semantics
-- of `public.list_task_command_candidates`, pinned before 2F.2's click-time
-- resolution path is allowed to rely on them.
--
-- Why this file exists: the Gate 3 behavioural probe observed 26 rows returned
-- for a null-title query under the default limit of 25
-- (`docs/reports/PHASE_2F_PRE_CODE_GATE_REPORT.md` §6.4), which is the
-- documented `limit + 1` overflow probe — but "the clamping semantics of
-- `effective_limit` are not what a reader would assume", and 2F.2 must not
-- build any "did we see everything?" claim on `p_limit` without these pins.
--
-- What is already pinned elsewhere, deliberately not restated here:
-- `phase_2e_task_command_matching.sql:262-275` pins the limit-1 overflow case
-- and that `effective_limit` reports the applied limit; `:424-443` pins the
-- clamp bounds (0 -> 1, 101 -> 100, null -> 25). This file adds the laws a
-- consumer of the resolution result actually depends on:
--
--   1. When the eligible population exceeds the limit, exactly
--      `effective_limit + 1` rows come back — the overflow probe row is part
--      of the result, so a caller must treat "row count > effective_limit" as
--      truncation, never as a bigger page.
--   2. When the population equals the limit, exactly the population comes
--      back — no phantom probe row.
--   3. When the population is under the limit, the population comes back.
--   4. A negative limit clamps up to one, like zero does.
--   5. `effective_limit` is a query-scalar: one distinct value per result set.
--
-- The clamp under pin: `least(greatest(coalesce(p_limit, 25), 1), 100)`
-- (`202607260059:2607`).

begin;
select plan(7);

-- Fixtures: one owner, five eligible `todo` tasks with distinct titles. A
-- null title query ranks every eligible task, so the population is exactly 5.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('46111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'limit-pin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.tasks (id, user_id, title, status, created_at) values
  ('46000001-1111-4111-8111-111111111111', '46111111-1111-4111-8111-111111111111', 'Primeira tarefa', 'todo', now() - interval '5 days'),
  ('46000002-1111-4111-8111-111111111111', '46111111-1111-4111-8111-111111111111', 'Segunda tarefa', 'todo', now() - interval '4 days'),
  ('46000003-1111-4111-8111-111111111111', '46111111-1111-4111-8111-111111111111', 'Terceira tarefa', 'todo', now() - interval '3 days'),
  ('46000004-1111-4111-8111-111111111111', '46111111-1111-4111-8111-111111111111', 'Quarta tarefa', 'todo', now() - interval '2 days'),
  ('46000005-1111-4111-8111-111111111111', '46111111-1111-4111-8111-111111111111', 'Quinta tarefa', 'todo', now() - interval '1 day');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"46111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

-- Law 1: truncation returns effective_limit + 1 rows, and the probe row is
-- part of the result a consumer receives.

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 2)),
  3,
  'five eligible rows under a limit of two return exactly three — the overflow probe row is included'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 4)),
  5,
  'five eligible rows under a limit of four return exactly five, not four'
);

-- Law 2: a population exactly at the limit produces no phantom probe row.

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 5)),
  5,
  'a population equal to the limit returns exactly the population — truncation is row count > effective_limit, never >='
);

-- Law 3: a population under the limit returns the population.

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 6)),
  5,
  'a population under the limit returns the population'
);

-- Law 4: a negative limit clamps up to one, like zero does
-- (`phase_2e_task_command_matching.sql:428-433` pins zero; nothing pinned the
-- negative branch of the same `greatest`).

select is(
  (select distinct effective_limit from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), -5)),
  1,
  'a negative limit clamps up to one'
);

select is(
  (select count(*)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), -5)),
  2,
  'and returns at most two rows: the clamped limit plus the probe'
);

-- Law 5: `effective_limit` is a query-scalar — one value per result set.

select is(
  (select count(distinct effective_limit)::integer from public.list_task_command_candidates(
     array['todo'], null, null, null, null, now(), 2)),
  1,
  'effective_limit is a query-scalar: every row of one result set carries the same value'
);

select * from finish();
rollback;
