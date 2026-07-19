begin;
select plan(8);
select has_table('public', 'entries', 'entries exists');
select has_table('public', 'entry_interpretations', 'interpretations exist');
select has_table('public', 'tasks', 'tasks exist');
select has_table('public', 'audit_logs', 'audit logs exist');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.entries'::regclass),
  'entries RLS is active'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'tasks RLS is active'
);
select has_function('public', 'confirm_entry_tasks', array['uuid','integer[]']);
select has_function('public', 'undo_operation', array['uuid']);
select * from finish();
rollback;
