-- Forward-fix, discovered by actually running the extended Slice 2C.2 online
-- Playwright journey against the linked project rather than assuming success
-- from a local read-through: editing 2 candidates across all 7 now-editable
-- fields (title, description, dueAt, plannedAt, manualPriority,
-- intentionalNoDue, noDueReason) correctly produces editedCandidateCount=2,
-- editedFieldCount=7, but private.require_task_candidates_confirmed_edit_counts
-- (migration 202607210034, written for Phase 2C.1's title/description/dueAt
-- only) still bounded editedFieldCount by editedCandidateCount * 3 — a
-- genuinely valid Slice 2C.2 edit (7 > 2*3=6) was rejected by the database's
-- own analytics allowlist, causing task_candidates_confirmed to silently fail
-- open (dropped, not persisted) for any confirmation editing more than 3
-- fields per candidate on average. The bound now reflects the 7 fields Slice
-- 2C.2 actually introduces. Additive, same signature, no behavior change for
-- any payload that was already valid under the old (now too-narrow) bound.

create or replace function private.require_task_candidates_confirmed_edit_counts(
  p_properties jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_edited_candidate_count boolean := p_properties ? 'editedCandidateCount';
  has_edited_field_count boolean := p_properties ? 'editedFieldCount';
  candidate_count numeric;
  edited_candidate_count numeric;
  edited_field_count numeric;
begin
  if not has_edited_candidate_count and not has_edited_field_count then
    return;
  end if;

  -- NULL-safe presence check: jsonb_typeof(missing key) is SQL NULL, and
  -- `NULL <> 'number'` is NULL (not TRUE), so a naive type-only check below
  -- would silently accept a payload supplying only one of the pair. Require
  -- both keys present (or both absent, already handled above) explicitly.
  if has_edited_candidate_count <> has_edited_field_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if jsonb_typeof(p_properties -> 'candidateCount') <> 'number'
    or jsonb_typeof(p_properties -> 'editedCandidateCount') <> 'number'
    or jsonb_typeof(p_properties -> 'editedFieldCount') <> 'number' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  if (p_properties ->> 'candidateCount') !~ '^[0-9]+$'
    or (p_properties ->> 'editedCandidateCount') !~ '^[0-9]+$'
    or (p_properties ->> 'editedFieldCount') !~ '^[0-9]+$' then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  candidate_count := (p_properties ->> 'candidateCount')::numeric;
  edited_candidate_count := (p_properties ->> 'editedCandidateCount')::numeric;
  edited_field_count := (p_properties ->> 'editedFieldCount')::numeric;

  if edited_candidate_count < 0 or edited_candidate_count > candidate_count then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;

  -- 7 editable candidate fields as of Slice 2C.2: title, description, dueAt,
  -- plannedAt, manualPriority, intentionalNoDue, noDueReason.
  if edited_field_count < 0 or edited_field_count > edited_candidate_count * 7 then
    raise exception 'Invalid product event property' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.require_task_candidates_confirmed_edit_counts(jsonb)
  from public, anon, authenticated, service_role;
