-- Phase 2J, slice 2J.4 — `transcription` joins the AI usage vocabulary.
--
-- ADR-096. ADR-095 allocated this slice at most one migration and hoped it
-- would stay unspent, on the premise that `ai_usage_events.operation` already
-- allowed `other`. **It does not.** That value belongs to
-- `error_events.operation` (`202608070080:93`), a different table from the
-- Phase 2H error sink. `ai_usage_events.operation` has carried exactly eight
-- values since `202607250055` and none of them can truthfully hold a
-- user-initiated transcription:
--
--   * `background` names work the user did not initiate. Transcription is
--     foreground and user-triggered, so recording it there hides spend from the
--     one person paying for it -- their own BYOK key.
--   * `file_analysis` belongs to `process_attachment`. Voice deliberately
--     creates NO attachment: the audio is discarded after transcription, so
--     there is no file to analyse.
--
-- One value. Nothing else in this migration.
--
-- WHY THE VERIFICATION BLOCK EXISTS, restated rather than inherited:
-- `drop constraint if exists` is fail-open. The constraint was created inline
-- in `202607160015:58`, so its name is PostgreSQL's generated
-- `<table>_<column>_check`. If that assumption were ever wrong the DROP would
-- no-op, the ADD would succeed under a free name, the old eight-value
-- constraint would survive, and every `transcription` insert would fail at
-- runtime -- where `src/lib/ai/usage.ts` swallows the error into a console
-- line. CI proves the chain from an empty database; this block proves the swap
-- on whatever database the migration is actually applied to. Same shape as
-- `202607250055:52`, and for the same reason.

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_operation_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_operation_check check (operation in (
    'capture_extraction','semantic_search','chat','review','file_analysis',
    'advanced_reasoning','background','task_command',
    -- Phase 2J slice 2J.4. Billed to the user's own credential.
    'transcription'
  ));

do $$
declare
  definition text;
begin
  select pg_get_constraintdef(oid)
    into definition
    from pg_constraint
   where conname = 'ai_usage_events_operation_check'
     and conrelid = 'public.ai_usage_events'::regclass;

  if definition is null then
    raise exception
      'ai_usage_events_operation_check is absent after the swap: the DROP matched a different name and the old constraint may still be enforcing eight values';
  end if;

  if position('transcription' in definition) = 0 then
    raise exception
      'ai_usage_events_operation_check does not admit transcription: %', definition;
  end if;

  -- The eight that were already there must survive. A swap that widened the
  -- vocabulary by dropping the rest of it would pass the check above.
  if position('task_command' in definition) = 0
     or position('capture_extraction' in definition) = 0
     or position('background' in definition) = 0 then
    raise exception
      'ai_usage_events_operation_check lost a pre-existing value: %', definition;
  end if;
end $$;

-- The writer, re-declared verbatim plus one value.
--
-- Postgres cannot extend an `in (...)` list in place, so a full re-declaration
-- is this repository's convention (`202607250055`, `202608070081`) and the diff
-- against that migration is exactly the one literal this change adds.
--
-- This half is NOT optional. `record_ai_usage` enumerates the vocabulary in its
-- own body and raises `22023` for anything outside it, so widening only the
-- table CHECK would deploy clean and then reject every transcription at runtime.
-- The verification block above is what surfaced that while this migration was
-- being written.
--
-- Note `cost_status`: when no `ai_model_pricing` row matches the model the
-- function already writes `'unpriced'` with a null `pricing_id`. There is no
-- audio-model pricing row and transcription is billed per audio minute rather
-- than per token, so transcription events land as `unpriced` -- a first-class
-- state this function already models, not a hole (ADR-096).

create or replace function public.record_ai_usage(
  p_operation text,
  p_model text,
  p_input_tokens integer default 0,
  p_cached_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0,
  p_provider_request_id text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  effective_user_id uuid;
  price public.ai_model_pricing%rowtype;
  safe_input integer := greatest(coalesce(p_input_tokens, 0), 0);
  safe_cached integer;
  safe_output integer := greatest(coalesce(p_output_tokens, 0), 0);
  safe_reasoning integer := greatest(coalesce(p_reasoning_tokens, 0), 0);
  input_multiplier numeric := 1;
  output_multiplier numeric := 1;
  is_long_context boolean := false;
  calculated_cost numeric(20,12);
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
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if effective_user_id is null then
    raise exception 'User id is required' using errcode = '22004';
  end if;
  if p_operation not in ('capture_extraction','semantic_search','chat','review','file_analysis','advanced_reasoning','background','task_command','transcription') then
    raise exception 'Unsupported AI operation' using errcode = '22023';
  end if;
  if p_model is null or char_length(p_model) not between 1 and 120 then
    raise exception 'Invalid model identifier' using errcode = '22023';
  end if;
  if p_provider_request_id is not null and char_length(p_provider_request_id) > 255 then
    raise exception 'Invalid provider request id' using errcode = '22023';
  end if;
  if p_source_type is not null and p_source_type not in ('entry','memory','conversation','summary','attachment') then
    raise exception 'Unsupported source type' using errcode = '22023';
  end if;

  safe_cached := least(safe_input, greatest(coalesce(p_cached_input_tokens, 0), 0));

  select pricing.* into price
  from public.ai_model_pricing pricing
  where pricing.provider = 'openai'
    and pricing.model = p_model
    and pricing.service_tier = 'standard'
    and pricing.effective_from <= now()
    and (pricing.effective_until is null or pricing.effective_until > now())
  order by pricing.effective_from desc
  limit 1;

  if price.id is not null then
    is_long_context := price.long_context_threshold is not null and safe_input > price.long_context_threshold;
    if is_long_context then
      input_multiplier := price.long_context_input_multiplier;
      output_multiplier := price.long_context_output_multiplier;
    end if;
    calculated_cost := round((
      ((safe_input - safe_cached)::numeric * price.input_usd_per_million * input_multiplier)
      + (safe_cached::numeric * price.cached_input_usd_per_million * input_multiplier)
      + (safe_output::numeric * price.output_usd_per_million * output_multiplier)
    ) / 1000000, 12);
  end if;

  insert into public.ai_usage_events (
    user_id, operation, provider, model, service_tier, provider_request_id,
    source_type, source_id, input_tokens, cached_input_tokens, output_tokens,
    reasoning_tokens, pricing_id, pricing_version, input_price_usd_per_million,
    cached_input_price_usd_per_million, output_price_usd_per_million,
    long_context_applied, cost_status, cost_usd
  ) values (
    effective_user_id, p_operation, 'openai', p_model, 'standard', nullif(p_provider_request_id, ''),
    p_source_type, p_source_id, safe_input, safe_cached, safe_output,
    safe_reasoning, price.id, price.pricing_version, price.input_usd_per_million,
    price.cached_input_usd_per_million, price.output_usd_per_million,
    is_long_context, case when price.id is null then 'unpriced' else 'calculated' end, calculated_cost
  )
  on conflict (user_id, provider_request_id) where provider_request_id is not null
  do update set provider_request_id = excluded.provider_request_id
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.record_ai_usage(text,text,integer,integer,integer,integer,text,text,uuid,uuid)
  from public, anon;
grant execute on function public.record_ai_usage(text,text,integer,integer,integer,integer,text,text,uuid,uuid)
  to authenticated, service_role;

-- The writer must now agree with the table.
--
-- ORDERING IS LOAD-BEARING: this runs AFTER the re-declaration above, not
-- before it. A first draft placed it before, where on a fresh chain the
-- function still carried the eight-value list -- so the block raised and
-- aborted the migration it was written to protect. Caught by reading the file
-- in order rather than by CI.
do $$
declare
  body text;
begin
  select pg_get_functiondef(oid)
    into body
    from pg_proc
   where proname = 'record_ai_usage'
     and pronamespace = 'public'::regnamespace
   limit 1;

  if body is null then
    raise exception 'record_ai_usage is absent; the usage ledger has no writer';
  end if;

  if position('transcription' in body) = 0 then
    raise exception
      'record_ai_usage does not admit transcription; the table and its writer disagree, and every transcription would fail at runtime inside a call site that swallows the error';
  end if;

  -- The pre-existing vocabulary must survive the re-declaration.
  if position('task_command' in body) = 0 or position('capture_extraction' in body) = 0 then
    raise exception 'record_ai_usage lost a pre-existing operation during the re-declaration';
  end if;
end $$;
