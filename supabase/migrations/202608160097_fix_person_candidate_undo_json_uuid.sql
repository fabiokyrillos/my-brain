-- Forward-fix JSON scalar UUID extraction in the person-candidate undo handler.
-- `jsonb_array_elements(...).value::text` retains JSON quotes, so casting that
-- text directly to uuid fails. Extract the scalar text first instead.

do $migration$
declare
  function_definition text;
  corrected_definition text;
  old_fragment constant text := 'value::text::uuid';
  new_fragment constant text := '(value #>> ''{}'')::uuid';
  occurrence_count integer;
begin
  select pg_get_functiondef(
    'private.undo_resolve_entry_person_candidates(uuid,uuid)'::regprocedure
  ) into function_definition;

  occurrence_count := (
    length(function_definition) - length(replace(function_definition, old_fragment, ''))
  ) / length(old_fragment);

  if occurrence_count <> 2 then
    raise exception 'undo_resolve_entry_person_candidates expected two quoted JSON UUID casts, found %', occurrence_count;
  end if;

  corrected_definition := replace(function_definition, old_fragment, new_fragment);
  execute corrected_definition;
end;
$migration$;

revoke all on function private.undo_resolve_entry_person_candidates(uuid, uuid)
  from public, anon, authenticated, service_role;
