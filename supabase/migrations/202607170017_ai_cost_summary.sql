-- Aggregate the immutable ledger in PostgreSQL so dashboard totals remain
-- complete after the table grows beyond the API row limit.
create or replace function public.get_ai_cost_summary(
  p_timezone text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  user_timezone text := coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo');
  local_now timestamp;
  local_date date;
  local_month_start date;
  day_start timestamptz;
  day_end timestamptz;
  month_start timestamptz;
  month_end timestamptz;
  today_cost_nano_usd bigint := 0;
  month_cost_nano_usd bigint := 0;
  all_time_cost_nano_usd bigint := 0;
  month_calls bigint := 0;
  all_time_calls bigint := 0;
  month_tokens bigint := 0;
  unpriced_calls bigint := 0;
  model_breakdown jsonb := '[]'::jsonb;
  operation_breakdown jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names timezone_name
    where timezone_name.name = user_timezone
  ) then
    user_timezone := 'America/Sao_Paulo';
  end if;

  local_now := now() at time zone user_timezone;
  local_date := local_now::date;
  local_month_start := date_trunc('month', local_now)::date;
  day_start := local_date::timestamp at time zone user_timezone;
  day_end := (local_date + 1)::timestamp at time zone user_timezone;
  month_start := local_month_start::timestamp at time zone user_timezone;
  month_end := (local_month_start + interval '1 month')::timestamp at time zone user_timezone;

  select
    coalesce(sum(trunc(usage.cost_usd * 1000000000)::bigint)
      filter (where usage.created_at >= day_start and usage.created_at < day_end), 0)::bigint,
    coalesce(sum(trunc(usage.cost_usd * 1000000000)::bigint)
      filter (where usage.created_at >= month_start and usage.created_at < month_end), 0)::bigint,
    coalesce(sum(trunc(usage.cost_usd * 1000000000)::bigint), 0)::bigint,
    count(*) filter (where usage.created_at >= month_start and usage.created_at < month_end),
    count(*),
    coalesce(sum(usage.input_tokens + usage.output_tokens)
      filter (where usage.created_at >= month_start and usage.created_at < month_end), 0)::bigint,
    count(*) filter (where usage.cost_status = 'unpriced')
  into
    today_cost_nano_usd,
    month_cost_nano_usd,
    all_time_cost_nano_usd,
    month_calls,
    all_time_calls,
    month_tokens,
    unpriced_calls
  from public.ai_usage_events usage
  where usage.user_id = current_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', grouped.key,
        'costNanoUsd', grouped.cost_nano_usd,
        'calls', grouped.calls,
        'inputTokens', grouped.input_tokens,
        'outputTokens', grouped.output_tokens
      ) order by grouped.cost_nano_usd desc, grouped.key
    ),
    '[]'::jsonb
  )
  into model_breakdown
  from (
    select
      usage.model as key,
      coalesce(sum(trunc(usage.cost_usd * 1000000000)::bigint), 0)::bigint as cost_nano_usd,
      count(*)::bigint as calls,
      coalesce(sum(usage.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(usage.output_tokens), 0)::bigint as output_tokens
    from public.ai_usage_events usage
    where usage.user_id = current_user_id
    group by usage.model
  ) grouped;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', grouped.key,
        'costNanoUsd', grouped.cost_nano_usd,
        'calls', grouped.calls,
        'inputTokens', grouped.input_tokens,
        'outputTokens', grouped.output_tokens
      ) order by grouped.cost_nano_usd desc, grouped.key
    ),
    '[]'::jsonb
  )
  into operation_breakdown
  from (
    select
      usage.operation as key,
      coalesce(sum(trunc(usage.cost_usd * 1000000000)::bigint), 0)::bigint as cost_nano_usd,
      count(*)::bigint as calls,
      coalesce(sum(usage.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(usage.output_tokens), 0)::bigint as output_tokens
    from public.ai_usage_events usage
    where usage.user_id = current_user_id
    group by usage.operation
  ) grouped;

  return jsonb_build_object(
    'todayCostNanoUsd', today_cost_nano_usd,
    'monthCostNanoUsd', month_cost_nano_usd,
    'allTimeCostNanoUsd', all_time_cost_nano_usd,
    'monthCalls', month_calls,
    'allTimeCalls', all_time_calls,
    'monthTokens', month_tokens,
    'unpricedCalls', unpriced_calls,
    'byModel', model_breakdown,
    'byOperation', operation_breakdown
  );
end;
$$;

revoke all on function public.get_ai_cost_summary(text) from public, anon;
grant execute on function public.get_ai_cost_summary(text) to authenticated;
