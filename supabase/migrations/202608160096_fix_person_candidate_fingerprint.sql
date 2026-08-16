-- Forward-fix the person-candidate idempotency fingerprint to the 64-character
-- SHA-256 contract enforced by undo_operations.

do $migration$
declare
  function_definition text;
  corrected_definition text;
  old_fragment constant text := $old$request_fingerprint := md5(
    p_entry_id::text || ':' || p_expected_interpretation_id::text || ':' || canonical_resolutions::text
  );$old$;
  new_fragment constant text := $new$request_fingerprint := encode(
    extensions.digest(
      p_entry_id::text || ':' || p_expected_interpretation_id::text || ':' || canonical_resolutions::text,
      'sha256'
    ),
    'hex'
  );$new$;
begin
  select pg_get_functiondef(
    'public.resolve_entry_person_candidates(uuid,uuid,jsonb,uuid)'::regprocedure
  ) into function_definition;

  corrected_definition := replace(function_definition, old_fragment, new_fragment);
  if corrected_definition = function_definition then
    raise exception 'resolve_entry_person_candidates fingerprint source did not match the expected v095 definition';
  end if;

  execute corrected_definition;
end;
$migration$;

revoke all on function public.resolve_entry_person_candidates(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_entry_person_candidates(uuid, uuid, jsonb, uuid)
  to authenticated;
