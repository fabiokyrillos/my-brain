begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_table('public', 'entry_person_candidate_resolutions', 'person candidate resolution ledger exists');
select has_function(
  'public',
  'resolve_entry_person_candidates',
  array['uuid', 'uuid', 'jsonb', 'uuid']
);
select has_function(
  'private',
  'undo_resolve_entry_person_candidates',
  array['uuid', 'uuid']
);

select col_is_pk('public', 'entry_person_candidate_resolutions', array['interpretation_id', 'candidate_index'], 'candidate identity is interpretation-scoped');
select col_not_null('public', 'entry_person_candidate_resolutions', 'user_id', 'candidate resolution owner is required');
select col_not_null('public', 'entry_person_candidate_resolutions', 'entry_id', 'candidate resolution entry is required');
select col_not_null('public', 'entry_person_candidate_resolutions', 'disposition', 'candidate resolution disposition is required');
select col_not_null('public', 'entry_person_candidate_resolutions', 'original_name', 'candidate resolution original name is required');
select col_not_null('public', 'entry_person_candidate_resolutions', 'operation_key', 'candidate resolution operation key is required');

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.entry_person_candidate_resolutions'::regclass),
  'candidate resolutions enable and force RLS'
);
select policies_are(
  'public',
  'entry_person_candidate_resolutions',
  array['entry_person_candidate_resolutions_select_own']
);
select table_privs_are('public', 'entry_person_candidate_resolutions', 'authenticated', array['SELECT']);
select table_privs_are('public', 'entry_person_candidate_resolutions', 'anon', array[]::text[]);

select ok(
  position(
    'request_fingerprint := md5('
    in pg_get_functiondef('public.resolve_entry_person_candidates(uuid,uuid,jsonb,uuid)'::regprocedure)
  ) = 0,
  'person candidate idempotency never uses the rejected 32-character MD5 fingerprint'
);
select ok(
  position(
    'extensions.digest('
    in pg_get_functiondef('public.resolve_entry_person_candidates(uuid,uuid,jsonb,uuid)'::regprocedure)
  ) > 0
  and position(
    '''sha256'''
    in pg_get_functiondef('public.resolve_entry_person_candidates(uuid,uuid,jsonb,uuid)'::regprocedure)
  ) > 0,
  'person candidate idempotency uses the 64-character SHA-256 fingerprint contract'
);

select function_privs_are(
  'public',
  'resolve_entry_person_candidates',
  array['uuid', 'uuid', 'jsonb', 'uuid'],
  'authenticated',
  array['EXECUTE']
);
select function_privs_are(
  'public',
  'resolve_entry_person_candidates',
  array['uuid', 'uuid', 'jsonb', 'uuid'],
  'anon',
  array[]::text[]
);
select is(
  (select prosecdef from pg_proc where oid = 'public.resolve_entry_person_candidates(uuid,uuid,jsonb,uuid)'::regprocedure),
  true,
  'resolution RPC is security definer'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.resolve_entry_person_candidates(uuid,uuid,jsonb,uuid)'::regprocedure),
  true,
  'resolution RPC uses an empty search path'
);
select results_eq(
  $$ select handler_function from private.undo_operation_handlers where action_type = 'resolve_entry_person_candidates' $$,
  array['undo_resolve_entry_person_candidates'::text],
  'undo handler is registered'
);

select * from finish();
rollback;
