-- Keep the already-deployed 015 migration immutable while tightening the
-- public ledger RPC and its metadata contract incrementally.
alter table public.ai_usage_events
  add constraint ai_usage_events_model_length_check
    check (char_length(model) between 1 and 120),
  add constraint ai_usage_events_request_id_length_check
    check (provider_request_id is null or char_length(provider_request_id) <= 255),
  add constraint ai_usage_events_source_type_check
    check (source_type is null or source_type in ('entry','memory','conversation','summary','attachment'));

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
  if p_operation not in ('capture_extraction','semantic_search','chat','review','file_analysis','advanced_reasoning','background') then
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
