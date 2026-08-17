begin;

select plan(9);

select has_function('public', 'confirm_entry_interpretation', array['uuid', 'uuid', 'uuid']);
select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.confirm_entry_interpretation(uuid,uuid,uuid)'::regprocedure $$,
  array[true],
  'confirmation is security definer'
);
select ok(has_function_privilege('authenticated', 'public.confirm_entry_interpretation(uuid,uuid,uuid)', 'execute'), 'authenticated may confirm');
select ok(not has_function_privilege('anon', 'public.confirm_entry_interpretation(uuid,uuid,uuid)', 'execute'), 'anon may not confirm');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('19191919-1919-4191-8191-191919191919', 'authenticated', 'authenticated', 'confirm-understanding@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values ('29292929-2929-4292-8292-292929292929', '19191919-1919-4191-8191-191919191919', 'A correct interpretation', 'web', 'awaiting_review', 'en');

insert into public.entry_interpretations (id, user_id, entry_id, version, model, strategy_version, prompt_version, confidence, raw_output, summary, task_candidates, is_record_only)
values ('39393939-3939-4393-8393-393939393939', '19191919-1919-4191-8191-191919191919', '29292929-2929-4292-8292-292929292929', 1, 'pgtap', 'v1', 'v1', 0.5, '{}'::jsonb, 'Correct summary', '[]'::jsonb, false);

update public.entries set current_interpretation_id = '39393939-3939-4393-8393-393939393939' where id = '29292929-2929-4292-8292-292929292929';
select set_config('request.jwt.claim.sub', '19191919-1919-4191-8191-191919191919', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.confirm_entry_interpretation('29292929-2929-4292-8292-292929292929', '39393939-3939-4393-8393-393939393939', '49494949-4949-4494-8494-494949494949') $$,
  'the owner can confirm the current interpretation'
);
select is((select status from public.entries where id = '29292929-2929-4292-8292-292929292929'), 'completed', 'confirmation completes the entry');
select is((select count(*)::integer from public.list_needs_attention(50, null, null) where entry_id = '29292929-2929-4292-8292-292929292929'), 0, 'the confirmed entry leaves Needs Attention');
select is((select count(*)::integer from public.audit_logs where source_entry_id = '29292929-2929-4292-8292-292929292929' and action_type = 'interpretation_confirmed'), 1, 'confirmation is audited once');
select is((public.confirm_entry_interpretation('29292929-2929-4292-8292-292929292929', '39393939-3939-4393-8393-393939393939', '59595959-5959-4595-8595-595959595959')->>'idempotent')::boolean, true, 'replay is idempotent');

select * from finish();
rollback;
