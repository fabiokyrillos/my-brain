-- Forward-fix, discovered by actually running the new Issue #3 pgTAP suite
-- (editable_candidate_analytics_events.sql) against the linked development
-- project rather than assuming success from a local read-through.
--
-- Both private.require_product_event_integer and
-- private.require_product_event_enum (migration 202607170024) skipped their
-- own rejection when the required key was entirely absent: `p_properties ->
-- p_key` on a missing key returns SQL NULL, jsonb_typeof(NULL) is SQL NULL,
-- `NULL <> 'number'`/`NULL <> 'string'` is SQL NULL, and PL/pgSQL treats a
-- NULL `IF` condition as false — so the exception never raised, and (for the
-- integer helper) the same NULL propagated through the follow-up
-- regex/bounds check, which also never raised. A payload omitting a
-- required property (e.g. `{}` for candidate_edit_started, which requires
-- candidateCount) silently passed both functions' validation. In practice
-- this was masked for every pre-existing event by the TypeScript client's
-- exact-key contract check before the request was ever sent, but the
-- database itself — the actual trust boundary in this codebase — did not
-- independently enforce key presence. Additive, no signature change, no
-- behavior change for any payload that already includes its required
-- key(s) with a valid value; every existing event using either helper
-- (all capture_* events, needs_attention_viewed/item_opened,
-- interpretation_corrected, task_candidates_presented/confirmed,
-- processing_retry_requested, work_view_viewed, task_status_changed, and
-- the two events added in migration 202607210034) is affected identically
-- and consistently by this correction.

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
  if not (p_properties ? p_key) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

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

revoke all on function private.require_product_event_integer(jsonb, text, integer, integer)
  from public, anon, authenticated, service_role;

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
  if not (p_properties ? p_key) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> p_key) <> 'string'
    or not ((p_properties ->> p_key) = any(p_allowed)) then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_product_event_enum(jsonb, text, text[])
  from public, anon, authenticated, service_role;
