alter table public.agent_preferences
  add column ai_profile text not null default 'quality'
    check (ai_profile in ('quality','balanced','economy','custom')),
  add column chat_model text not null default 'gpt-5.6-terra'
    check (chat_model in ('gpt-5.6-terra','gpt-5.6-luna','gpt-5-mini')),
  add column extraction_model text not null default 'gpt-5.6-luna'
    check (extraction_model in ('gpt-5.6-terra','gpt-5.6-luna','gpt-5-mini')),
  add column reasoning_model text not null default 'gpt-5.6-terra'
    check (reasoning_model in ('gpt-5.6-terra','gpt-5.6-luna','gpt-5-mini')),
  add column review_model text not null default 'gpt-5.6-terra'
    check (review_model in ('gpt-5.6-terra','gpt-5.6-luna','gpt-5-mini')),
  add column file_model text not null default 'gpt-5.6-luna'
    check (file_model in ('gpt-5.6-terra','gpt-5.6-luna','gpt-5-mini')),
  add column background_model text not null default 'gpt-5-mini'
    check (background_model in ('gpt-5.6-terra','gpt-5.6-luna','gpt-5-mini')),
  add column embedding_model text not null default 'text-embedding-3-small'
    check (embedding_model in ('text-embedding-3-small'));

comment on column public.agent_preferences.ai_model is
  'Legacy single-model preference retained for backwards compatibility. New calls use operation-specific route columns.';

create table public.ai_model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  service_tier text not null default 'standard',
  currency text not null default 'USD' check (currency = 'USD'),
  input_usd_per_million numeric(14,6) not null check (input_usd_per_million >= 0),
  cached_input_usd_per_million numeric(14,6) not null check (cached_input_usd_per_million >= 0),
  output_usd_per_million numeric(14,6) not null check (output_usd_per_million >= 0),
  long_context_threshold integer check (long_context_threshold > 0),
  long_context_input_multiplier numeric(8,4) not null default 1 check (long_context_input_multiplier >= 1),
  long_context_output_multiplier numeric(8,4) not null default 1 check (long_context_output_multiplier >= 1),
  pricing_version text not null,
  source_url text not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, model, service_tier, effective_from),
  check (effective_until is null or effective_until > effective_from)
);
create index ai_model_pricing_lookup_idx on public.ai_model_pricing
  (provider, model, service_tier, effective_from desc);

insert into public.ai_model_pricing (
  provider, model, input_usd_per_million, cached_input_usd_per_million,
  output_usd_per_million, long_context_threshold, long_context_input_multiplier,
  long_context_output_multiplier, pricing_version, source_url, effective_from
) values
  ('openai','gpt-5.6-terra',2.50,0.25,15.00,272000,2.0,1.5,'openai-standard-2026-07-16','https://developers.openai.com/api/docs/models/gpt-5.6-terra','2026-07-16T00:00:00Z'),
  ('openai','gpt-5.6-luna',1.00,0.10,6.00,272000,2.0,1.5,'openai-standard-2026-07-16','https://developers.openai.com/api/docs/models/gpt-5.6-luna','2026-07-16T00:00:00Z'),
  ('openai','gpt-5-mini',0.25,0.025,2.00,null,1.0,1.0,'openai-standard-2026-07-16','https://developers.openai.com/api/docs/models/gpt-5-mini','2026-07-16T00:00:00Z'),
  ('openai','text-embedding-3-small',0.02,0.02,0.00,null,1.0,1.0,'openai-standard-2026-07-16','https://developers.openai.com/api/docs/models/text-embedding-3-small','2026-07-16T00:00:00Z');

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in (
    'capture_extraction','semantic_search','chat','review','file_analysis',
    'advanced_reasoning','background'
  )),
  provider text not null default 'openai',
  model text not null,
  service_tier text not null default 'standard',
  provider_request_id text,
  source_type text,
  source_id uuid,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens between 0 and input_tokens),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  pricing_id uuid references public.ai_model_pricing(id),
  pricing_version text,
  input_price_usd_per_million numeric(14,6),
  cached_input_price_usd_per_million numeric(14,6),
  output_price_usd_per_million numeric(14,6),
  long_context_applied boolean not null default false,
  cost_status text not null check (cost_status in ('calculated','unpriced')),
  cost_usd numeric(20,12),
  created_at timestamptz not null default now(),
  check ((cost_status = 'calculated' and cost_usd is not null) or (cost_status = 'unpriced' and cost_usd is null))
);
create index ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_events_user_model_idx on public.ai_usage_events (user_id, model, created_at desc);
create index ai_usage_events_user_operation_idx on public.ai_usage_events (user_id, operation, created_at desc);
create unique index ai_usage_events_request_id_idx on public.ai_usage_events (user_id, provider_request_id)
  where provider_request_id is not null;

alter table public.ai_model_pricing enable row level security;
alter table public.ai_model_pricing force row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_events force row level security;

create policy ai_model_pricing_select_authenticated on public.ai_model_pricing
  for select to authenticated using (true);
create policy ai_usage_events_select_own on public.ai_usage_events
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.ai_model_pricing, public.ai_usage_events to authenticated;
revoke insert, update, delete on public.ai_model_pricing, public.ai_usage_events from authenticated, anon;
revoke all on public.ai_model_pricing, public.ai_usage_events from anon;

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
      raise exception 'Cannot record usage for another user';
    end if;
  elsif coalesce(auth.role(), '') = 'service_role' then
    effective_user_id := p_user_id;
  else
    raise exception 'Authentication required';
  end if;

  if effective_user_id is null then raise exception 'User id is required'; end if;
  if p_operation not in ('capture_extraction','semantic_search','chat','review','file_analysis','advanced_reasoning','background') then
    raise exception 'Unsupported AI operation';
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
