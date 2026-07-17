-- Phase 2X Slice 2X.2: private, allowlisted product funnel events.
-- This ledger records interaction metadata only. It is not audit history,
-- job telemetry, AI accounting, or a store for personal content.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'capture_started',
    'capture_save_succeeded',
    'capture_save_failed',
    'capture_processing_enqueued',
    'capture_processing_completed',
    'capture_processing_failed',
    'needs_attention_viewed',
    'needs_attention_item_opened',
    'interpretation_review_viewed',
    'interpretation_corrected',
    'technical_details_opened',
    'task_candidates_presented',
    'task_candidates_confirmed',
    'question_answered_basic',
    'processing_retry_requested',
    'work_view_viewed',
    'task_status_changed'
  )),
  surface text not null check (surface in (
    'home',
    'capture',
    'inbox',
    'needs_attention',
    'interpretation_review',
    'technical_details',
    'work',
    'server'
  )),
  locale text not null check (locale in ('pt-BR', 'en')),
  viewport_class text not null check (viewport_class in ('mobile', 'desktop', 'unknown')),
  app_version text not null check (app_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 4096
  ),
  subject_type text check (subject_type in ('entry', 'task', 'pending_question')),
  subject_id uuid,
  session_id uuid,
  idempotency_key uuid not null,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_events_subject_pair_check check (
    (subject_type is null and subject_id is null)
    or (subject_type is not null and subject_id is not null)
  ),
  constraint product_events_user_idempotency_key unique (user_id, idempotency_key)
);

comment on table public.product_events is
  'Private UX funnel ledger. Contains only allowlisted interaction metadata, never user content, evidence, prompts, answers, or raw errors. Retain at most 180 days; purge is an explicit pre-pilot operational requirement.';

create index product_events_user_created_idx
  on public.product_events (user_id, created_at desc);
create index product_events_user_name_created_idx
  on public.product_events (user_id, event_name, created_at desc);
create index product_events_synthetic_created_idx
  on public.product_events (is_synthetic, created_at)
  where is_synthetic;

alter table public.product_events enable row level security;
alter table public.product_events force row level security;

create policy product_events_select_own on public.product_events
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.product_events from public, anon, authenticated, service_role;
grant select on public.product_events to authenticated;

create or replace function private.require_product_event_enum(
  p_properties jsonb,
  p_key text,
  p_allowed text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_properties -> p_key) <> 'string'
    or not ((p_properties ->> p_key) = any(p_allowed)) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.require_product_event_integer(
  p_properties jsonb,
  p_key text,
  p_minimum integer,
  p_maximum integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  value_text text;
begin
  if jsonb_typeof(p_properties -> p_key) <> 'number' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  value_text := p_properties ->> p_key;
  if value_text !~ '^[0-9]+$'
    or value_text::numeric < p_minimum
    or value_text::numeric > p_maximum then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.validate_product_event_properties(
  p_event_name text,
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed_keys text[];
  unknown_key text;
begin
  if p_properties is null or jsonb_typeof(p_properties) <> 'object' then
    raise exception 'Product event properties must be an object' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      allowed_keys := array['captureSource'];
    when 'capture_save_succeeded' then
      allowed_keys := array['captureSource', 'durationMs'];
    when 'capture_save_failed' then
      allowed_keys := array['captureSource', 'durationMs', 'failureKind'];
    when 'capture_processing_enqueued' then
      allowed_keys := array['processingMode'];
    when 'capture_processing_completed' then
      allowed_keys := array['processingMode', 'durationMs', 'outcome'];
    when 'capture_processing_failed' then
      allowed_keys := array['processingMode', 'durationMs', 'failureKind'];
    when 'needs_attention_viewed' then
      allowed_keys := array['itemCount'];
    when 'needs_attention_item_opened' then
      allowed_keys := array['attentionReason'];
    when 'interpretation_review_viewed', 'technical_details_opened', 'question_answered_basic' then
      allowed_keys := array[]::text[];
    when 'interpretation_corrected' then
      allowed_keys := array['fieldCount'];
    when 'task_candidates_presented', 'task_candidates_confirmed' then
      allowed_keys := array['candidateCount'];
    when 'processing_retry_requested' then
      allowed_keys := array['retrySource'];
    when 'work_view_viewed' then
      allowed_keys := array['workView'];
    when 'task_status_changed' then
      allowed_keys := array['fromStatus', 'toStatus'];
    else
      raise exception 'Unsupported product event' using errcode = '22023';
  end case;

  select key into unknown_key
  from jsonb_object_keys(p_properties) as key
  where not (key = any(allowed_keys))
  limit 1;

  if unknown_key is not null then
    raise exception 'Unsupported product event property' using errcode = '22023';
  end if;

  case p_event_name
    when 'capture_started' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
    when 'capture_save_succeeded' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
    when 'capture_save_failed' then
      perform private.require_product_event_enum(p_properties, 'captureSource', array['home', 'capture_page', 'global']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['validation', 'session', 'storage', 'unknown']);
    when 'capture_processing_enqueued' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
    when 'capture_processing_completed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'outcome', array['ready', 'needs_attention']);
    when 'capture_processing_failed' then
      perform private.require_product_event_enum(p_properties, 'processingMode', array['initial', 'reprocess']);
      perform private.require_product_event_integer(p_properties, 'durationMs', 0, 86400000);
      perform private.require_product_event_enum(p_properties, 'failureKind', array['retryable', 'terminal']);
    when 'needs_attention_viewed' then
      perform private.require_product_event_integer(p_properties, 'itemCount', 0, 1000);
    when 'needs_attention_item_opened' then
      perform private.require_product_event_enum(p_properties, 'attentionReason', array[
        'review_interpretation',
        'confirm_existing_candidates',
        'answer_existing_question',
        'retry_processing',
        'resolve_consistency'
      ]);
    when 'interpretation_review_viewed', 'technical_details_opened', 'question_answered_basic' then
      null;
    when 'interpretation_corrected' then
      perform private.require_product_event_integer(p_properties, 'fieldCount', 1, 30);
    when 'task_candidates_presented' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 0, 100);
    when 'task_candidates_confirmed' then
      perform private.require_product_event_integer(p_properties, 'candidateCount', 1, 100);
    when 'processing_retry_requested' then
      perform private.require_product_event_enum(p_properties, 'retrySource', array['user', 'worker']);
    when 'work_view_viewed' then
      perform private.require_product_event_enum(p_properties, 'workView', array['today', 'all', 'waiting']);
    when 'task_status_changed' then
      perform private.require_product_event_enum(p_properties, 'fromStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
      perform private.require_product_event_enum(p_properties, 'toStatus', array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed', 'cancelled'
      ]);
  end case;
end;
$$;

create or replace function private.assert_product_event_subject_owner(
  p_user_id uuid,
  p_subject_type text,
  p_subject_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (p_subject_type is null) <> (p_subject_id is null) then
    raise exception 'Product event subject must be complete' using errcode = '22023';
  end if;
  if p_subject_type is null then return; end if;

  case p_subject_type
    when 'entry' then
      perform 1 from public.entries where id = p_subject_id and user_id = p_user_id;
    when 'task' then
      perform 1 from public.tasks where id = p_subject_id and user_id = p_user_id;
    when 'pending_question' then
      perform 1 from public.pending_questions where id = p_subject_id and user_id = p_user_id;
    else
      raise exception 'Unsupported product event subject' using errcode = '22023';
  end case;

  if not found then
    raise exception 'Product event subject is not owned by caller' using errcode = '42501';
  end if;
end;
$$;

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
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22004';
  end if;
  if p_event_name not in (
    'capture_started', 'capture_save_succeeded', 'capture_save_failed',
    'capture_processing_enqueued', 'capture_processing_completed', 'capture_processing_failed',
    'needs_attention_viewed', 'needs_attention_item_opened', 'interpretation_review_viewed',
    'interpretation_corrected', 'technical_details_opened', 'task_candidates_presented',
    'task_candidates_confirmed', 'question_answered_basic', 'processing_retry_requested',
    'work_view_viewed', 'task_status_changed'
  ) then
    raise exception 'Unsupported product event' using errcode = '22023';
  end if;
  if p_surface not in (
    'home', 'capture', 'inbox', 'needs_attention', 'interpretation_review',
    'technical_details', 'work', 'server'
  ) then
    raise exception 'Unsupported product surface' using errcode = '22023';
  end if;
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

  insert into public.product_events (
    user_id, event_name, surface, locale, viewport_class, app_version, properties,
    subject_type, subject_id, session_id, idempotency_key, is_synthetic
  ) values (
    p_user_id, p_event_name, p_surface, p_locale, p_viewport_class, p_app_version, p_properties,
    p_subject_type, p_subject_id, p_session_id, p_idempotency_key, p_is_synthetic
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into inserted_event_id;

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

create or replace function public.record_product_event(
  p_event_name text,
  p_surface text,
  p_locale text,
  p_viewport_class text,
  p_app_version text,
  p_properties jsonb,
  p_subject_type text default null,
  p_subject_id uuid default null,
  p_session_id uuid default null,
  p_idempotency_key uuid default null,
  p_is_synthetic boolean default false
)
returns table(event_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select * from private.record_product_event(
    auth.uid(), p_event_name, p_surface, p_locale, p_viewport_class, p_app_version,
    p_properties, p_subject_type, p_subject_id, p_session_id, p_idempotency_key, p_is_synthetic
  );
end;
$$;

create or replace function public.record_product_event_for_user(
  p_user_id uuid,
  p_event_name text,
  p_surface text,
  p_locale text,
  p_viewport_class text,
  p_app_version text,
  p_properties jsonb,
  p_subject_type text default null,
  p_subject_id uuid default null,
  p_session_id uuid default null,
  p_idempotency_key uuid default null,
  p_is_synthetic boolean default false
)
returns table(event_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  select * from private.record_product_event(
    p_user_id, p_event_name, p_surface, p_locale, p_viewport_class, p_app_version,
    p_properties, p_subject_type, p_subject_id, p_session_id, p_idempotency_key, p_is_synthetic
  );
end;
$$;

revoke all on function private.require_product_event_enum(jsonb, text, text[]) from public, anon, authenticated, service_role;
revoke all on function private.require_product_event_integer(jsonb, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function private.validate_product_event_properties(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.assert_product_event_subject_owner(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.record_product_event(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.record_product_event(text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean) from public, anon, service_role;
revoke all on function public.record_product_event_for_user(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_product_event(text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.record_product_event_for_user(uuid, text, text, text, text, text, jsonb, text, uuid, uuid, uuid, boolean) to service_role;
