begin;

select plan(44);

select has_column('public', 'entries', 'current_interpretation_id', 'entries points to the current immutable interpretation');
select results_eq(
  $$ select provolatile from pg_proc where oid = 'public.model_only_element_trust(numeric)'::regprocedure $$,
  array['s'::"char"],
  'model-only trust declares the stable volatility detected by database lint'
);
select has_column('public', 'entries', 'reprocessing_key', 'entries records the active reprocessing operation');
select has_column('public', 'entries', 'reprocessing_started_at', 'entries records when reprocessing started');
select has_column('public', 'entries', 'reprocessing_lease_expires_at', 'entries bounds a reprocessing lease');

select has_column('public', 'entry_interpretations', 'parent_interpretation_id', 'interpretation revisions link to their parent');
select has_column('public', 'entry_interpretations', 'origin', 'interpretation revisions record their origin');
select has_column('public', 'entry_interpretations', 'corrected_by', 'interpretation revisions record the correcting user');
select has_column('public', 'entry_interpretations', 'correction_reason', 'interpretation revisions record an optional reason');
select has_column('public', 'entry_interpretations', 'operation_key', 'interpretation revisions support idempotency');
select has_column('public', 'entry_interpretations', 'extracted_dates', 'interpretation revisions persist extracted dates');
select has_column('public', 'entry_interpretations', 'element_classifications', 'interpretation revisions classify elements');
select has_column('public', 'entry_interpretations', 'element_confidence', 'interpretation revisions persist per-element confidence');
select has_column('public', 'entry_interpretations', 'element_policy', 'interpretation revisions persist per-element policy');
select has_column('public', 'entry_interpretations', 'resolution_evidence', 'interpretation revisions persist bounded resolution evidence');

select has_table('public', 'entity_aliases', 'entity aliases have an owned temporal store');
select has_column('public', 'entity_aliases', 'entity_type', 'aliases identify the polymorphic entity type');
select has_column('public', 'entity_aliases', 'entity_id', 'aliases identify the owned entity');
select has_column('public', 'entity_aliases', 'normalized_alias', 'aliases store a normalized lookup value');
select has_column('public', 'entity_aliases', 'valid_from', 'aliases support temporal validity start');

select has_function('public', 'correct_entry_interpretation', array['uuid', 'integer', 'jsonb', 'text', 'text']);
select has_function('public', 'begin_entry_reprocessing', array['uuid', 'text', 'integer']);
select has_function('public', 'persist_reprocessed_entry_interpretation', array['uuid', 'text', 'jsonb', 'text', 'text', 'text', 'integer', 'integer', 'jsonb']);
select has_function('public', 'fail_entry_reprocessing', array['uuid', 'text', 'text']);
select has_function('public', 'undo_operation', array['uuid']);

select results_eq(
  $$
    select pg_get_constraintdef(oid) like all (array[
      '%saved%', '%interpreting%', '%awaiting_review%', '%partially_processed%',
      '%completed%', '%recoverable_error%', '%terminal_error%', '%reprocessing%'
    ])
    from pg_constraint
    where conrelid = 'public.entries'::regclass and conname = 'entries_status_check'
  $$,
  array[true],
  'entries accepts exactly the persisted Phase 2B lifecycle vocabulary'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.entries'::regclass
      and conname = 'entries_current_interpretation_owner_fk'
  $$,
  array[1::bigint],
  'the current interpretation pointer validates composite ownership'
);

select has_index('public', 'entry_interpretations', 'entry_interpretations_operation_key_idx', 'revision operation keys are unique per owned entry');
select has_index('public', 'entity_aliases', 'entity_aliases_lookup_idx', 'aliases have a bounded normalized lookup index');

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.entity_aliases'::regclass $$,
  array[true],
  'entity aliases enable RLS'
);
select results_eq(
  $$ select relforcerowsecurity from pg_class where oid = 'public.entity_aliases'::regclass $$,
  array[true],
  'entity aliases force RLS'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.entry_interpretations', 'update') $$,
  array[false],
  'authenticated users cannot update immutable interpretations directly'
);
select results_eq(
  $$ select has_table_privilege('authenticated', 'public.entry_interpretations', 'delete') $$,
  array[false],
  'authenticated users cannot delete immutable interpretations directly'
);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.correct_entry_interpretation(uuid,integer,jsonb,text,text)'::regprocedure $$,
  array[true],
  'correction is security definer and validates the authenticated owner internally'
);
select results_eq(
  $$ select pg_get_functiondef('public.correct_entry_interpretation(uuid,integer,jsonb,text,text)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'correction has an explicit safe search path'
);
select results_eq(
  $$ select pg_get_functiondef('public.begin_entry_reprocessing(uuid,text,integer)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'reprocessing begin has an explicit safe search path'
);
select results_eq(
  $$ select pg_get_functiondef('public.persist_reprocessed_entry_interpretation(uuid,text,jsonb,text,text,text,integer,integer,jsonb)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'reprocessing completion has an explicit safe search path'
);
select results_eq(
  $$ select pg_get_functiondef('public.fail_entry_reprocessing(uuid,text,text)'::regprocedure) like '%set search_path = ''''%' $$,
  array[true],
  'reprocessing failure has an explicit safe search path'
);

select results_eq(
  $$ select pg_get_functiondef('public.persist_entry_interpretation(uuid,jsonb,text,text,text,integer,integer)'::regprocedure) like '%current_interpretation_id%' $$,
  array[true],
  'compatible initial persistence advances the explicit current pointer'
);
select results_eq(
  $$ select pg_get_functiondef('public.undo_operation(uuid)'::regprocedure) like '%correct_entry_interpretation%' $$,
  array[true],
  'undo supports append-only interpretation compensation'
);
select results_eq(
  $$
    select count(*)::bigint
    from pg_trigger
    where tgrelid = 'public.entry_interpretations'::regclass
      and tgname = 'entry_interpretations_protect_immutable'
      and not tgisinternal
  $$,
  array[1::bigint],
  'an explicit trigger rejects interpretation row updates'
);
select results_eq(
  $$
    select pg_get_triggerdef(oid) like '%BEFORE UPDATE%'
    from pg_trigger
    where tgrelid = 'public.entry_interpretations'::regclass
      and tgname = 'entry_interpretations_protect_immutable'
  $$,
  array[true],
  'the immutability trigger does not block entry cascade deletion'
);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.prepare_entity_alias()'::regprocedure $$,
  array[true],
  'alias normalization runs with its internal function privilege only'
);
select results_eq(
  $$
    select bool_and(position('occurred_at = occurred_at' in pg_get_functiondef(signature)) = 0)
    from unnest(array[
      'public.persist_entry_interpretation(uuid,jsonb,text,text,text,integer,integer)'::regprocedure,
      'public.correct_entry_interpretation(uuid,integer,jsonb,text,text)'::regprocedure,
      'public.persist_reprocessed_entry_interpretation(uuid,text,jsonb,text,text,text,integer,integer,jsonb)'::regprocedure
    ]) signature
  $$,
  array[true],
  'entry mutation functions avoid timestamp variable and column ambiguity'
);

select * from finish();
rollback;
