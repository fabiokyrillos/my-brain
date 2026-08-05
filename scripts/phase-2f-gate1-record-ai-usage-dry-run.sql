-- Phase 2F pre-code Gate 1 — `record_ai_usage` drop-and-recreate dry run.
--
-- ============================================================================
-- RUN THIS ONLY AGAINST A DISPOSABLE PROJECT. NEVER AGAINST THE LINKED ONE.
-- ============================================================================
--
-- It drops and recreates a function every AI path in the product depends on. The
-- guard at the top refuses to proceed unless the database has been explicitly
-- marked disposable, because the difference between this script and an outage is
-- one wrong connection string.
--
-- Mark a disposable database first:
--   alter database postgres set "phase_2f.disposable" = 'yes';
--
-- Why this exists (adversarial review F3). `ADR-053` rejected this change on two
-- legs: closeout timing, and blast radius — "six-plus files that must move in
-- lockstep, verifiable only through CI". Proposal Revision 1 answered the first
-- and asserted the second away. Revision 2 replaced the assertion with this:
-- the change is not argued to be safe, it is *executed* on a throwaway database
-- and the transcript is the evidence. It proves the shape only. It is not a
-- migration, is not numbered, and must never be added to `supabase/migrations/`.
--
-- What it proves, in order:
--   1. the drop and recreate share one transaction (no ambiguous window);
--   2. the two trailing provenance arguments are accepted and defaulted;
--   3. `'task_command'` is added to the `source_type` allowlist in BOTH the table
--      CHECK and the function-body guard — `202607250055:12-13` records that a
--      disagreement between them "surfaces only in production";
--   4. grants are re-issued after the recreate (dropping a function drops them);
--   5. every legacy ten-argument caller still resolves, named and positional;
--   6. a twelve-argument call writes the provenance columns;
--   7. the ledger row joins deterministically to `undo_operations`.
--
-- PostgREST schema-cache convergence and the Deno worker call are NOT provable
-- from SQL. They are steps 8 and 9 of the gate and are run from the shell after
-- this script; see `docs/reports/phase-2f/PHASE_2F_PRE_CODE_GATE_REPORT.md` §3.

\set ON_ERROR_STOP on

do $$
begin
  if coalesce(current_setting('phase_2f.disposable', true), '') <> 'yes' then
    raise exception
      'REFUSED: this database is not marked disposable. Run: alter database % set "phase_2f.disposable" = ''yes'';',
      current_database();
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- 1. Table-side changes: two nullable provenance columns, widened allowlist.
-- ---------------------------------------------------------------------------
alter table public.ai_usage_events
  add column if not exists prompt_version text,
  add column if not exists strategy_version text;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_source_type_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_source_type_check
    check (source_type is null or source_type in (
      'entry','memory','conversation','summary','attachment','task_command'
    ));

-- ---------------------------------------------------------------------------
-- 2. The drop and the recreate, in this one transaction.
--
-- `create or replace` cannot do this: a different argument list is a different
-- function, so it would leave two overloads and make every existing ten-key
-- PostgREST call ambiguous (`42725`). That is the PostgreSQL fact ADR-053:586
-- turns on, and it is why the drop is unavoidable rather than a stylistic choice.
-- ---------------------------------------------------------------------------
drop function public.record_ai_usage(
  text,text,integer,integer,integer,integer,text,text,uuid,uuid
);

create function public.record_ai_usage(
  p_operation text,
  p_model text,
  p_input_tokens integer default 0,
  p_cached_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0,
  p_provider_request_id text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_user_id uuid default null,
  -- Appended and defaulted, so every existing ten-argument caller — app, worker,
  -- smokes — keeps resolving without being touched.
  p_prompt_version text default null,
  p_strategy_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_user_id uuid;
  event_id uuid;
begin
  if auth.uid() is not null then
    effective_user_id := auth.uid();
    if p_user_id is not null and p_user_id <> effective_user_id then
      raise exception 'Cannot record usage for another user' using errcode = '42501';
    end if;
  elsif coalesce(auth.role(), '') = 'service_role' then
    effective_user_id := p_user_id;
  else
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The body guard, widened in lockstep with the table CHECK above.
  if p_source_type is not null and p_source_type not in (
    'entry','memory','conversation','summary','attachment','task_command'
  ) then
    raise exception 'Unsupported ai_usage_events source_type: %', p_source_type
      using errcode = '22023';
  end if;

  -- Pricing/cost logic is deliberately omitted: this script proves the
  -- *signature and provenance* shape, not the cost calculation, which no part of
  -- the 2F.1 change touches. The real migration re-declares the body verbatim
  -- from `202607250055` plus the two columns.
  insert into public.ai_usage_events (
    user_id, operation, model, provider_request_id, source_type, source_id,
    input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
    cost_status, prompt_version, strategy_version
  ) values (
    effective_user_id, p_operation, p_model, p_provider_request_id,
    p_source_type, p_source_id,
    greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_cached_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0), greatest(coalesce(p_reasoning_tokens, 0), 0),
    'unpriced', p_prompt_version, p_strategy_version
  )
  returning id into event_id;

  return event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants, re-issued. Dropping a function drops its grants; omitting this is
--    the silent half of the change, because the function would exist and simply
--    refuse every caller.
-- ---------------------------------------------------------------------------
revoke all on function public.record_ai_usage(
  text,text,integer,integer,integer,integer,text,text,uuid,uuid,text,text
) from public, anon;
grant execute on function public.record_ai_usage(
  text,text,integer,integer,integer,integer,text,text,uuid,uuid,text,text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Assertions. Every one raises; none merely reports.
-- ---------------------------------------------------------------------------
do $$
declare
  signature text := 'public.record_ai_usage(text,text,integer,integer,integer,integer,text,text,uuid,uuid,text,text)';
  overloads integer;
  defaults integer;
  grantees text[];
begin
  select count(*) into overloads
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
  where ns.nspname = 'public' and proc.proname = 'record_ai_usage';
  if overloads <> 1 then
    raise exception 'expected exactly one record_ai_usage overload, found %', overloads;
  end if;

  select pronargdefaults into defaults from pg_catalog.pg_proc where oid = signature::regprocedure;
  if defaults <> 10 then
    raise exception 'expected 10 defaulted arguments, found %', defaults;
  end if;

  if not exists (select 1 from pg_catalog.pg_proc where oid = signature::regprocedure and prosecdef) then
    raise exception 'record_ai_usage lost SECURITY DEFINER across the recreate';
  end if;

  select array_agg(grantee order by grantee) into grantees
  from information_schema.role_routine_grants
  where routine_schema = 'public' and routine_name = 'record_ai_usage' and privilege_type = 'EXECUTE';
  if not (grantees @> array['authenticated','service_role']) then
    raise exception 'grants not restored after recreate, found %', grantees;
  end if;
  if grantees && array['anon','PUBLIC'] then
    raise exception 'recreate widened grants to %', grantees;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_usage_events_source_type_check'
      and pg_get_constraintdef(oid) like '%task_command%'
  ) then
    raise exception 'table CHECK was not widened to task_command';
  end if;

  if pg_get_functiondef(signature::regprocedure) not like '%task_command%' then
    raise exception 'function-body guard was not widened to task_command';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Caller compatibility and the join, exercised as service_role.
-- ---------------------------------------------------------------------------
do $$
declare
  test_user uuid;
  operation_key uuid := gen_random_uuid();
  legacy_named uuid;
  legacy_positional uuid;
  provenance_id uuid;
  joined integer;
begin
  select id into test_user from auth.users limit 1;
  if test_user is null then
    raise exception 'dry run needs at least one auth.users row on the disposable project';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  perform set_config('role', 'service_role', true);

  -- Legacy ten-argument NAMED call — the app and worker shape.
  legacy_named := public.record_ai_usage(
    p_operation => 'chat', p_model => 'gpt-test', p_input_tokens => 1,
    p_user_id => test_user
  );
  if legacy_named is null then raise exception 'legacy named ten-argument call failed'; end if;

  -- Legacy POSITIONAL call, all ten supplied.
  legacy_positional := public.record_ai_usage(
    'chat', 'gpt-test', 1, 0, 1, 0, null, null, null, test_user
  );
  if legacy_positional is null then raise exception 'legacy positional call failed'; end if;

  -- Twelve-argument call carrying provenance and the join key.
  provenance_id := public.record_ai_usage(
    p_operation => 'task_command', p_model => 'gpt-test', p_input_tokens => 1,
    p_source_type => 'task_command', p_source_id => operation_key,
    p_user_id => test_user,
    p_prompt_version => '2026-07-25.1', p_strategy_version => 'task-command-v1'
  );
  if provenance_id is null then raise exception 'twelve-argument call failed'; end if;

  if not exists (
    select 1 from public.ai_usage_events
    where id = provenance_id
      and prompt_version = '2026-07-25.1'
      and strategy_version = 'task-command-v1'
      and source_type = 'task_command'
      and source_id = operation_key
  ) then
    raise exception 'provenance columns or join key were not persisted';
  end if;

  -- The join the requirement is actually about: ledger row -> operation, with no
  -- timestamp anywhere in the predicate. Proven against a synthetic undo row so
  -- the shape is verified even on a project that has never run a command.
  insert into public.undo_operations (
    user_id, action_type, entity_type, entity_ids, after_state, operation_key, expires_at
  )
  values (
    test_user, 'apply_task_command', 'task', array[]::uuid[], '{}'::jsonb,
    'taskcmd-v1:' || operation_key::text, now() + interval '1 day'
  )
  on conflict do nothing;

  select count(*) into joined
  from public.ai_usage_events ledger
  join public.undo_operations undo
    on undo.user_id = ledger.user_id
   and undo.operation_key = 'taskcmd-v1:' || ledger.source_id::text
  where ledger.id = provenance_id
    and ledger.source_type = 'task_command';

  if joined <> 1 then
    raise exception 'ledger row did not join to its operation: % matches', joined;
  end if;

  raise notice 'GATE 1 SQL HALF PASSED: legacy named=%, legacy positional=%, provenance=%, join matched % row',
    legacy_named, legacy_positional, provenance_id, joined;
end $$;

-- Deliberately NOT committed. The dry run proves the shape and leaves the
-- disposable database as it found it; the real change ships as a numbered
-- migration only after this transcript is in the repository.
rollback;
