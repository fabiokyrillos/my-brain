-- Phase 2E Slice 2E.1 — make command parsing recordable in the usage ledger.
--
-- PRD 2E-COMMAND-011 / 2E-PROVENANCE-002. Command parsing is a real OpenAI
-- call that costs real money, and `ai_usage_events` had no operation literal
-- that describes it: the table CHECK (`202607160015:58-61`) and the guard
-- inside `record_ai_usage` (`202607170018:55`) both close over seven values,
-- none of which is truthful for "turn a sentence into a task command".
--
-- Recording it as `chat` or `background` would corrupt the cost dashboard and
-- make the Phase 2E spend unattributable, so this adds the eighth literal
-- rather than borrowing one. The list is widened in both places in the same
-- migration, because the CHECK and the RPC guard disagreeing is a failure mode
-- that surfaces only in production.
--
-- `source_type` is deliberately NOT widened. At parse time the command has no
-- persisted row of any kind — no task is selected yet, by construction — so
-- `source_type = null` is the truthful classification and the existing
-- vocabulary ('entry','memory','conversation','summary','attachment') stands
-- unchanged. Phase 2F's task embeddings are the change that needs `'task'`
-- there (PRD §22), and inventing it here would pre-empt that decision.
--
-- Generated types are unaffected: `operation` is `text`, so its CHECK literals
-- never appear in `src/lib/supabase/database.types.ts`. Verified by content —
-- the file contains no occurrence of `capture_extraction`.
--
-- Rollback: re-run the previous constraint and the previous function body. No
-- row written under the new literal becomes invalid, because narrowing a CHECK
-- would fail against existing rows; rollback therefore means "stop routing to
-- the new operation", per PRD §21.

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_operation_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_operation_check check (operation in (
    'capture_extraction','semantic_search','chat','review','file_analysis',
    'advanced_reasoning','background','task_command'
  ));

-- `drop constraint if exists` is fail-open, and this is the one statement in
-- the change whose failure would be silent. The constraint was created inline
-- in `202607160015:58-61`, so its name is PostgreSQL's generated
-- `<table>_<column>_check`; if that assumption were ever wrong the DROP would
-- no-op, the ADD would succeed under a free name, the old seven-value
-- constraint would survive, and every `task_command` insert would fail at
-- runtime — where `src/lib/ai/usage.ts` swallows the error into a console line.
-- CI proves the chain from an empty database; this proves the swap on whatever
-- database the migration is actually applied to. Same fail-closed shape as
-- `202607250054:58`.
do $$
declare
  operation_checks integer;
begin
  select count(*) into operation_checks
  from pg_constraint
  where conrelid = 'public.ai_usage_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%operation%';

  if operation_checks <> 1 then
    raise exception 'expected exactly one operation CHECK on ai_usage_events, found %', operation_checks;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_usage_events_operation_check'
      and conrelid = 'public.ai_usage_events'::regclass
      and pg_get_constraintdef(oid) like '%task_command%'
  ) then
    raise exception 'the ai_usage_events operation CHECK was not widened to task_command';
  end if;
end $$;

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
  if p_operation not in ('capture_extraction','semantic_search','chat','review','file_analysis','advanced_reasoning','background','task_command') then
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
