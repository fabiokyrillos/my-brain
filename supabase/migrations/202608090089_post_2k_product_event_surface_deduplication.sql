-- POST-2K CORRECTION -- the surface vocabulary's third copy, deleted.
--
-- AN EXTRAORDINARY MIGRATION, AUTHORIZED BY THE OWNER, OUTSIDE PHASE 2K'S BUDGET
--
-- Phase 2K's implementation budget was `1 allocated · 1 spent` and it stays
-- that way. This file is a POST-PHASE CORRECTION, named `post_2k_*` so the
-- phase generator's `/phase_2k/i` filter cannot absorb it into a budget that is
-- closed -- the same mechanism `202608070084` and `202608080087` used, and for
-- the same reason. It belongs to no successor phase either.
--
-- WHAT WENT WRONG, STATED PLAINLY
--
-- Phase 2K closed with its telemetry INERT. Every Conversar event was refused
-- `22023 Unsupported product surface` at the last real write path, inside
-- producers that wrap emission in `.catch(() => {})`. The application
-- contracts, the table's event-name CHECK and the property validator all
-- accepted `conversation`; a hardcoded SURFACE list inside
-- `private.record_product_event` did not.
--
-- It is `202608080087`'s defect one field over. That correction deleted the
-- frozen EVENT-NAME copy from this same function and left the SURFACE copy
-- standing, describing it as a "non-vocabulary guard". It was a vocabulary
-- guard, and calling it something else is what let it survive.
--
-- TWO GATES WERE WRONG, NOT ONE
--
-- `202608090088` widened the event-name CHECK and the property validator but
-- NOT `product_events_surface_check`, which still stopped at `task_command`.
-- The writer's hardcoded list refused first and masked it. So this migration
-- has to do both things:
--
--   1. widen the CANONICAL surface CHECK to admit `conversation`, which the
--      application has declared in `productSurfaces` since `202608090088`; and
--   2. DELETE the writer's copy, so there is exactly one declaration left.
--
-- Widening (1) is not a vocabulary change: `conversation` was already declared
-- and already shipped. It is the canonical gate catching up to it.
--
-- WHY THE REFUSAL STILL RAISES 22023
--
-- Deleting the list without more would move the refusal to a raw `23514` from
-- the table CHECK. That is still fail-closed, but it changes a contract callers
-- and tests depend on. So the insert is wrapped and `GET STACKED DIAGNOSTICS`
-- names the constraint that fired: a surface violation is re-raised with the
-- identical message and errcode, and EVERY OTHER check violation re-raises
-- untouched. No second list exists anywhere -- which is the whole point.
--
-- ONE ORDERING CHANGE, STATED RATHER THAN HIDDEN
--
-- The surface was validated before the event name; now it is validated at the
-- insert, after it. A call that is wrong in both ways now reports the event
-- name first. That is an improvement rather than a regression: it is precisely
-- what made this phase's own negative controls vacuous -- they were refused by
-- the surface gate before the gate under test could answer.

-- ---------------------------------------------------------------------------
-- 1. The canonical surface vocabulary, on the table. The only declaration.
-- ---------------------------------------------------------------------------

alter table public.product_events
  drop constraint if exists product_events_surface_check;

alter table public.product_events
  add constraint product_events_surface_check check (surface in (
    'home',
    'capture',
    'inbox',
    'needs_attention',
    'interpretation_review',
    'technical_details',
    'work',
    'questions',
    'server',
    'task_command',
    -- Phase 2K slice 2K.8 declared this in `productSurfaces` and shipped its
    -- producers; the canonical gate never learned it. Conversar is its own
    -- surface rather than a fold into `task_command`, which stays the command
    -- console's surface wherever it mounts.
    'conversation'
  ));

-- `drop constraint if exists` is fail-open: if the name were ever not what this
-- assumes, the DROP would no-op, the ADD would succeed under a free name, and
-- the old vocabulary would survive while everything looked applied.
do $$
declare
  definition text;
begin
  select pg_get_constraintdef(oid) into definition
    from pg_constraint
   where conname = 'product_events_surface_check'
     and conrelid = 'public.product_events'::regclass;

  if definition is null then
    raise exception 'product_events_surface_check is absent after the swap';
  end if;
  if position('conversation' in definition) = 0 then
    raise exception 'the surface vocabulary was not widened: %', definition;
  end if;
  -- Every pre-existing surface must survive. A swap that widened by replacing
  -- would pass the check above.
  if position('task_command' in definition) = 0
     or position('needs_attention' in definition) = 0
     or position('interpretation_review' in definition) = 0
     or position('home' in definition) = 0
     or position('server' in definition) = 0 then
    raise exception 'the surface vocabulary lost a pre-existing name: %', definition;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The writer, re-declared without its copy of that vocabulary.
--
-- Assembled from `202608080087`'s own text rather than retyped. Everything
-- below is byte-identical to what stood there except the deleted list, the
-- declaration of `violated_constraint`, and the insert's exception handler.
-- ---------------------------------------------------------------------------

create or replace function private.record_product_event(
  p_user_id uuid,
  p_event_name text,
  p_surface text,
  p_locale text,
  p_viewport_class text,
  p_app_version text,
  p_properties jsonb,
  p_subject_type text,
  p_subject_id uuid,
  p_session_id uuid,
  p_idempotency_key uuid,
  p_is_synthetic boolean
)
returns table(event_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_event_id uuid;
  violated_constraint text;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22004';
  end if;
  -- The event-name allowlist that stood here is deliberately gone. The table
  -- CHECK and `private.validate_product_event_properties` are the vocabulary,
  -- and the validator's `else` arm raises the identical
  -- `'Unsupported product event'` / `22023` this block used to raise.
  --
  -- The SURFACE allowlist that stood here is deliberately gone too, and for the
  -- same reason one migration later. `202608080087` removed the event-name copy
  -- and left this one; Phase 2K then declared the `conversation` surface, and
  -- every Conversar event was refused here -- at the last real write path,
  -- inside producers that swallow the failure. Same defect, one field over.
  --
  -- `product_events_surface_check` on the table is now the ONLY declaration of
  -- the surface vocabulary. The refusal moves to the insert, and the handler
  -- below re-raises it with the identical message and errcode this block used
  -- to raise, so no caller can tell the difference.
  if p_locale not in ('pt-BR', 'en') then
    raise exception 'Unsupported product locale' using errcode = '22023';
  end if;
  if p_viewport_class not in ('mobile', 'desktop', 'unknown') then
    raise exception 'Unsupported viewport class' using errcode = '22023';
  end if;
  if p_app_version is null or p_app_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' then
    raise exception 'Invalid application version' using errcode = '22023';
  end if;
  if p_idempotency_key is null or p_is_synthetic is null then
    raise exception 'Product event idempotency and synthetic flags are required' using errcode = '22004';
  end if;

  perform private.validate_product_event_properties(p_event_name, p_properties);
  perform private.assert_product_event_subject_owner(p_user_id, p_subject_type, p_subject_id);

  -- The surface refusal, preserved exactly, without a second list to keep in
  -- sync. `GET STACKED DIAGNOSTICS` names the constraint that fired, so only a
  -- surface violation is translated; every other check violation re-raises
  -- untouched rather than being flattened into a message about surfaces.
  begin
    insert into public.product_events (
      user_id, event_name, surface, locale, viewport_class, app_version, properties,
      subject_type, subject_id, session_id, idempotency_key, is_synthetic
    ) values (
      p_user_id, p_event_name, p_surface, p_locale, p_viewport_class, p_app_version, p_properties,
      p_subject_type, p_subject_id, p_session_id, p_idempotency_key, p_is_synthetic
    )
    on conflict (user_id, idempotency_key) do nothing
    returning id into inserted_event_id;
  exception when check_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'product_events_surface_check' then
      raise exception 'Unsupported product surface' using errcode = '22023';
    end if;
    raise;
  end;

  if inserted_event_id is null then
    select id into inserted_event_id
    from public.product_events
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    return query select inserted_event_id, false;
  else
    return query select inserted_event_id, true;
  end if;
end;
$$;
-- Unchanged posture, restated because a `create or replace` is silent about it.
revoke all on function private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Post-deploy assertions. Ordered AFTER the re-declaration, never before.
-- ---------------------------------------------------------------------------

do $$
declare
  recorder_body text;
begin
  select pg_get_functiondef(oid)
    into recorder_body
    from pg_proc
   where proname = 'record_product_event'
     and pronamespace = 'private'::regnamespace
   limit 1;

  if recorder_body is null then
    raise exception 'private.record_product_event is absent; the ledger has no writer';
  end if;

  -- THE DUPLICATION IS GONE. These surfaces existed in the writer ONLY inside
  -- the deleted gate, so their presence would mean a partial paste left it.
  if position('''needs_attention''' in recorder_body) > 0
     or position('''interpretation_review''' in recorder_body) > 0
     or position('''task_command''' in recorder_body) > 0
     or position('''questions''' in recorder_body) > 0 then
    raise exception
      'private.record_product_event still enumerates surfaces; the redundant gate was not removed';
  end if;

  -- And the event-name copy `202608080087` removed must not have come back.
  if position('task_command_undone' in recorder_body) > 0
     or position('capture_started' in recorder_body) > 0 then
    raise exception 'private.record_product_event enumerates event names again';
  end if;

  -- Everything else must have survived. A "fix" that removed the gate by
  -- removing the validation around it would pass the checks above.
  if position('validate_product_event_properties' in recorder_body) = 0 then
    raise exception 'the writer no longer validates event properties';
  end if;
  if position('assert_product_event_subject_owner' in recorder_body) = 0 then
    raise exception 'the writer no longer asserts subject ownership';
  end if;
  if position('Unsupported product locale' in recorder_body) = 0
     or position('Unsupported viewport class' in recorder_body) = 0
     or position('Invalid application version' in recorder_body) = 0
     or position('Product event idempotency and synthetic flags are required' in recorder_body) = 0 then
    raise exception 'the writer lost one of its non-vocabulary guards';
  end if;
  -- The surface refusal survives as a CONTRACT even though its list is gone.
  if position('Unsupported product surface' in recorder_body) = 0
     or position('product_events_surface_check' in recorder_body) = 0 then
    raise exception 'the writer no longer translates a surface violation into its documented refusal';
  end if;
  if position('on conflict (user_id, idempotency_key) do nothing' in recorder_body) = 0 then
    raise exception 'the writer lost its idempotent insert';
  end if;

  -- The security boundary is unchanged.
  if not (select prosecdef from pg_proc
           where proname = 'record_product_event'
             and pronamespace = 'private'::regnamespace limit 1) then
    raise exception 'private.record_product_event is no longer security definer';
  end if;
  if not (select 'search_path=""' = any(coalesce(proconfig, array[]::text[]))
            from pg_proc
           where proname = 'record_product_event'
             and pronamespace = 'private'::regnamespace limit 1) then
    raise exception 'private.record_product_event lost its empty search_path';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The invariant this defect existed for want of, now applied to SURFACES:
-- exactly one declaration, and the writer is not it.
--
-- Name-by-name from the constraint, and REFUSING TO RUN VACUOUSLY -- an empty
-- or implausibly short extraction raises rather than reporting agreement.
-- ---------------------------------------------------------------------------

do $$
declare
  definition text;
  recorder_body text;
  declared text[];
  name text;
  leaked text[] := array[]::text[];
begin
  select pg_get_constraintdef(oid) into definition
    from pg_constraint
   where conname = 'product_events_surface_check'
     and conrelid = 'public.product_events'::regclass;

  select pg_get_functiondef(oid) into recorder_body
    from pg_proc
   where proname = 'record_product_event'
     and pronamespace = 'private'::regnamespace
   limit 1;

  select array_agg(distinct match[1]) into declared
    from regexp_matches(definition, '''([a-z_]+)''', 'g') as match;

  if declared is null or array_length(declared, 1) < 10 then
    raise exception 'refusing to run vacuously: extracted % surfaces from the CHECK',
      coalesce(array_length(declared, 1), 0);
  end if;

  -- Not one of them may appear in the writer. That is what "one declaration"
  -- means, and it is checked from the catalog rather than from this file.
  foreach name in array declared loop
    if position('''' || name || '''' in recorder_body) > 0 then
      leaked := leaked || name;
    end if;
  end loop;

  if array_length(leaked, 1) > 0 then
    raise exception 'the writer still names declared surfaces: %', leaked;
  end if;
end $$;
