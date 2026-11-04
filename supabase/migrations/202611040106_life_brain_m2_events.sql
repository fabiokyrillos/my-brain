-- Life Brain LB-M2 (slice C.3, ADR-152; PRD `LB-C-003`/`-004`/`-010`;
-- `LIFE_DATA_MODEL.md` §3). The third and last migration ADR-145 allocated.
--
-- Events are "something that happens from X to Y": a consultation at 15:00, a
-- trip from the 3rd to the 10th. Nothing in the schema could hold one —
-- `planned_at` is an intention (OD-2M-3 A), a reminder is an instant, a task is
-- something to do — so the calendar drew a trip as nothing at all. ADR-145
-- Decision 6 superseded OD-2M-3 A for exactly this; ADR-152 records it.
--
-- Four things:
--
--  1. `public.events`, owner-scoped with RLS forced. `authenticated` may only
--     SELECT its own rows; every write goes through the two functions below.
--     Sensitivity is NOT a column: it is derived from `source_entry_id` at
--     read time, as tasks and reminders already do (2M-PRIVACY-004).
--  2. `public.confirm_entry_event_candidates` — the owner confirms candidates
--     the extraction proposed (`raw_output -> 'eventCandidates'`, no column),
--     the way tasks are confirmed: owner and current-interpretation checks,
--     idempotent by operation key and fingerprint, one undo row and one audit
--     row. A candidate becomes at most one event (a unique index, not a
--     convention). The event is filed under the entry's life area when the
--     reading has one (C.1).
--  3. `private.undo_confirm_entry_event_candidates`, registered with the undo
--     router: it deletes exactly the events the operation created.
--  4. `public.cancel_event` — the owner takes an event off the agenda; the row
--     stays, `status = 'cancelled'`, audited.

-- 1. The table -----------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text check (location is null or char_length(location) between 1 and 240),
  context_id uuid,
  source_entry_id uuid,
  source_interpretation_id uuid,
  candidate_index integer check (candidate_index is null or candidate_index between 0 and 49),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_period_check check (ends_at is null or ends_at >= starts_at),
  constraint events_user_id_id_key unique (user_id, id),
  constraint events_context_owned foreign key (user_id, context_id)
    references public.contexts (user_id, id) on delete set null (context_id),
  constraint events_source_entry_owned foreign key (user_id, source_entry_id)
    references public.entries (user_id, id) on delete set null (source_entry_id),
  constraint events_source_interpretation_owned foreign key (user_id, source_interpretation_id)
    references public.entry_interpretations (user_id, id) on delete set null (source_interpretation_id)
);

-- A candidate becomes at most one event, whatever the client sends twice.
create unique index events_candidate_once_idx
  on public.events (user_id, source_interpretation_id, candidate_index)
  where source_interpretation_id is not null and candidate_index is not null;

-- The calendar reads by owner and overlap with a window.
create index events_user_period_idx on public.events (user_id, starts_at, ends_at);
create index events_user_source_entry_idx on public.events (user_id, source_entry_id);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.events force row level security;

create policy events_select_own on public.events
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.events from public, anon, authenticated, service_role;
grant select on table public.events to authenticated;

-- 2. Confirmation -------------------------------------------------------------------

create or replace function public.confirm_entry_event_candidates(
  p_entry_id uuid,
  p_expected_interpretation_id uuid,
  p_candidate_indexes integer[],
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owned_entry public.entries%rowtype;
  interpretation public.entry_interpretations%rowtype;
  existing_operation public.undo_operations%rowtype;
  canonical_indexes integer[];
  request_fingerprint text;
  candidate_index integer;
  candidate jsonb;
  v_title text;
  v_location text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_all_day boolean;
  v_context_id uuid;
  v_event_id uuid;
  event_ids uuid[] := '{}'::uuid[];
  undo_id uuid;
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501', detail = 'AUTH_REQUIRED';
  end if;
  if p_entry_id is null or p_expected_interpretation_id is null or p_operation_key is null
     or p_candidate_indexes is null or cardinality(p_candidate_indexes) < 1 or cardinality(p_candidate_indexes) > 20 then
    raise exception 'Invalid event candidate request' using errcode = '22023', detail = 'INVALID_EVENT_CANDIDATE_REQUEST';
  end if;

  select array_agg(distinct value order by value) into canonical_indexes
  from unnest(p_candidate_indexes) as value;
  if cardinality(canonical_indexes) <> cardinality(p_candidate_indexes)
     or exists (select 1 from unnest(canonical_indexes) as value where value is null or value < 0 or value > 49) then
    raise exception 'Invalid or duplicate candidate index' using errcode = '22023', detail = 'INVALID_EVENT_CANDIDATE_REQUEST';
  end if;

  select * into owned_entry
  from public.entries
  where id = p_entry_id and user_id = current_user_id
  for update;
  if owned_entry.id is null then
    raise exception 'Entry not found' using errcode = 'P0002', detail = 'ENTRY_NOT_FOUND';
  end if;
  if owned_entry.current_interpretation_id is distinct from p_expected_interpretation_id then
    raise exception 'Interpretation is stale' using errcode = '55P03', detail = 'STALE_INTERPRETATION';
  end if;

  select * into interpretation
  from public.entry_interpretations
  where id = p_expected_interpretation_id and entry_id = p_entry_id and user_id = current_user_id
  for share;
  if interpretation.id is null then
    raise exception 'Interpretation not found' using errcode = 'P0002', detail = 'CANDIDATE_NOT_FOUND';
  end if;
  if interpretation.is_record_only then
    raise exception 'A record-only reading proposes nothing' using errcode = '55000', detail = 'RECORD_ONLY';
  end if;

  -- sha256 hex, the shape `undo_operations_request_fingerprint_check` admits
  -- (`202607190032`), computed as the task confirmation computes it.
  request_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_entry_id::text || ':' || p_expected_interpretation_id::text || ':' || canonical_indexes::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select * into existing_operation
  from public.undo_operations
  where user_id = current_user_id and operation_key = p_operation_key::text
  for update;
  if existing_operation.id is not null then
    if existing_operation.action_type <> 'confirm_entry_event_candidates'
       or existing_operation.request_fingerprint is distinct from request_fingerprint then
      raise exception 'Operation key already used for different input'
        using errcode = '23505', detail = 'EVENT_CANDIDATE_IDEMPOTENCY_MISMATCH';
    end if;
    return (existing_operation.after_state -> 'result') || jsonb_build_object('idempotent', true);
  end if;

  -- The area the reading filed the entry under (C.1), if any.
  select ee.entity_id into v_context_id
  from public.entry_entities ee
  join public.contexts c on c.id = ee.entity_id and c.user_id = ee.user_id
  where ee.user_id = current_user_id
    and ee.interpretation_id = interpretation.id
    and ee.entity_type = 'context'
    and c.kind in ('health', 'family', 'home', 'finance', 'travel', 'work', 'study', 'leisure', 'ideas')
  order by ee.confidence desc nulls last, ee.entity_id
  limit 1;

  foreach candidate_index in array canonical_indexes loop
    candidate := interpretation.raw_output -> 'eventCandidates' -> candidate_index;
    if candidate is null or jsonb_typeof(candidate) <> 'object' then
      raise exception 'Candidate not found' using errcode = 'P0002', detail = 'CANDIDATE_NOT_FOUND';
    end if;

    v_title := btrim(regexp_replace(coalesce(candidate ->> 'title', ''), '\s+', ' ', 'g'));
    v_location := nullif(btrim(regexp_replace(coalesce(candidate ->> 'location', ''), '\s+', ' ', 'g')), '');
    if char_length(v_title) < 1 or char_length(v_title) > 240
       or (v_location is not null and char_length(v_location) > 240)
       or jsonb_typeof(candidate -> 'allDay') is distinct from 'boolean' then
      raise exception 'Event candidate is invalid' using errcode = '22023', detail = 'INVALID_EVENT_CANDIDATE';
    end if;
    v_all_day := (candidate ->> 'allDay')::boolean;
    begin
      v_starts := (candidate ->> 'startsAt')::timestamptz;
      v_ends := case when jsonb_typeof(candidate -> 'endsAt') = 'string' then (candidate ->> 'endsAt')::timestamptz end;
    exception when others then
      raise exception 'Event candidate is invalid' using errcode = '22023', detail = 'INVALID_EVENT_CANDIDATE';
    end;
    if v_starts is null or (v_ends is not null and v_ends < v_starts) then
      raise exception 'Event candidate is invalid' using errcode = '22023', detail = 'INVALID_EVENT_CANDIDATE';
    end if;

    insert into public.events (
      user_id, title, starts_at, ends_at, all_day, location, context_id,
      source_entry_id, source_interpretation_id, candidate_index
    ) values (
      current_user_id, v_title, v_starts, v_ends, v_all_day, v_location, v_context_id,
      p_entry_id, interpretation.id, candidate_index
    )
    returning id into v_event_id;
    event_ids := event_ids || v_event_id;
  end loop;

  result := jsonb_build_object(
    'eventIds', to_jsonb(event_ids),
    'candidateIndexes', to_jsonb(canonical_indexes),
    'idempotent', false
  );

  insert into public.undo_operations (
    user_id, action_type, entity_type, entity_ids, before_state, after_state,
    operation_key, request_fingerprint, source_entry_id, source_interpretation_id
  ) values (
    current_user_id, 'confirm_entry_event_candidates', 'event', event_ids,
    jsonb_build_object('event_count', 0),
    jsonb_build_object('event_ids', to_jsonb(event_ids), 'candidate_indexes', to_jsonb(canonical_indexes), 'result', result),
    p_operation_key::text, request_fingerprint, p_entry_id, interpretation.id
  ) returning id into undo_id;

  result := result || jsonb_build_object('undoId', undo_id);
  update public.undo_operations
  set after_state = jsonb_set(after_state, '{result}', result, true)
  where id = undo_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, actor, after_state, reason, source_entry_id
  ) values (
    current_user_id, 'entry_event_candidates_confirmed', 'event', 'user',
    jsonb_build_object(
      'operation_key', p_operation_key,
      'event_ids', to_jsonb(event_ids),
      'candidate_indexes', to_jsonb(canonical_indexes),
      'interpretation_id', interpretation.id
    ),
    'explicit_user_confirmation', p_entry_id
  );

  return result;
exception
  when unique_violation then
    if sqlerrm like '%events_candidate_once_idx%' then
      raise exception 'Candidate already confirmed' using errcode = '23505', detail = 'EVENT_CANDIDATE_ALREADY_CONFIRMED';
    end if;
    raise;
end;
$$;

revoke all on function public.confirm_entry_event_candidates(uuid, uuid, integer[], uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_entry_event_candidates(uuid, uuid, integer[], uuid)
  to authenticated;

-- 3. Undo ---------------------------------------------------------------------------------

create or replace function private.undo_confirm_entry_event_candidates(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  event_ids uuid[] := '{}'::uuid[];
  deleted_events integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'confirm_entry_event_candidates' then
    raise exception 'Unsupported undo operation' using errcode = '22023';
  end if;

  select coalesce(array_agg(value::text::uuid), '{}'::uuid[])
  into event_ids
  from jsonb_array_elements_text(coalesce(operation.after_state -> 'event_ids', '[]'::jsonb)) as value;

  delete from public.events
  where user_id = p_user_id and id = any(event_ids);
  get diagnostics deleted_events = row_count;

  update public.undo_operations
  set status = 'undone', undone_at = now()
  where id = operation.id and user_id = p_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id, 'entry_event_candidates_undone', 'event', 'user',
    operation.after_state,
    jsonb_build_object('operation_key', operation.operation_key, 'deleted_count', deleted_events),
    'user_undo', operation.source_entry_id
  );

  return jsonb_build_object('undone', true, 'affected', deleted_events, 'idempotent', false);
end;
$$;

revoke all on function private.undo_confirm_entry_event_candidates(uuid, uuid)
  from public, anon, authenticated, service_role;

insert into private.undo_operation_handlers (action_type, handler_function, description)
values (
  'confirm_entry_event_candidates',
  'undo_confirm_entry_event_candidates',
  'Delete exactly the events the confirmation created.'
)
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- 4. Cancel -----------------------------------------------------------------------------------

create or replace function public.cancel_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  v_event public.events%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501', detail = 'AUTH_REQUIRED';
  end if;
  if p_event_id is null then
    raise exception 'Event is required' using errcode = '22023', detail = 'INVALID_EVENT_REQUEST';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id and user_id = current_user_id
  for update;
  if v_event.id is null then
    raise exception 'Event not found' using errcode = 'P0002', detail = 'EVENT_NOT_FOUND';
  end if;
  if v_event.status = 'cancelled' then
    return jsonb_build_object('eventId', v_event.id, 'status', 'cancelled', 'changed', false);
  end if;

  update public.events set status = 'cancelled'
  where id = v_event.id and user_id = current_user_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    current_user_id, 'event_cancelled', 'event', v_event.id, 'user',
    jsonb_build_object('status', v_event.status),
    jsonb_build_object('status', 'cancelled'),
    'owner_choice', v_event.source_entry_id
  );

  return jsonb_build_object('eventId', v_event.id, 'status', 'cancelled', 'changed', true);
end;
$$;

revoke all on function public.cancel_event(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_event(uuid) to authenticated;
