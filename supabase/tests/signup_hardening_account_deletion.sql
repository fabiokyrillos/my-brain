-- Signup Hardening SH.2 -- the deletion database surfaces, executed.
--
-- SH-DELETE-003 (the request transitions through the SH.1 machine),
-- SH-DELETE-007 (the run-time owned-table census the executor stops on),
-- SH-DELETE-009 (the log is de-identified, append-only and RPC-only),
-- SH-DELETE-011 (whole-account residue with calibration and a negative
-- control), SH-DELETE-016 (colliding names across owners), SH-EXPOSURE-008.
--
-- The executor itself is Deno-tested (`delete-account/executor.test.ts`,
-- 15 cases). What is provable only here is the database half: that the request
-- surface is self-only and audited, that the census enumerates from the
-- catalog rather than a list, that no role can write the log directly, and
-- that a real `auth.users` delete leaves nothing behind while a neighbouring
-- account is untouched.
--
-- Written in pure ASCII, following the SH.0 and SH.1 suites.

begin;
select plan(25);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- two accounts, one of which will delete itself
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d2000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh2-doomed@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d2000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sh2-bystander@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('d2200001-0000-4000-8000-000000000001', 'd2000001-0000-4000-8000-000000000001',
   'registro da conta que sera apagada', 'web', 'saved', 'pt-BR'),
  ('d2200002-0000-4000-8000-000000000002', 'd2000002-0000-4000-8000-000000000002',
   'registro da conta que permanece', 'web', 'saved', 'pt-BR');

-- An active credential and two interpret_entry jobs for the doomed account, so
-- section 5's refusal has a positive control in the same file: job A is
-- claimed while the account is still active, job B only after the deletion
-- request. Without them a null claim would prove nothing.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('d2000001-0000-4000-8000-000000000001', 'active',
   '\xd201020304050607080910111213141516'::bytea,
   '\xd20102030405060708091011'::bytea, 1, 'sk-proj:d2d2d2', now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('d2200003-0000-4000-8000-000000000003', 'd2000001-0000-4000-8000-000000000001',
   'segundo registro da conta que sera apagada', 'web', 'saved', 'pt-BR');

insert into public.jobs (id, user_id, type, payload, idempotency_key)
values
  ('d2100001-0000-4000-8000-000000000001', 'd2000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', 'd2200001-0000-4000-8000-000000000001', 'mode', 'initial'),
   'sh2-job-a'),
  ('d2100002-0000-4000-8000-000000000002', 'd2000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', 'd2200003-0000-4000-8000-000000000003', 'mode', 'initial'),
   'sh2-job-b');

-- Colliding attachment names, distinguished only by the owner prefix
-- (SH-DELETE-016's shape, at the database level).
insert into public.attachments (user_id, storage_path, original_name, mime_type, size_bytes)
values
  ('d2000001-0000-4000-8000-000000000001',
   'd2000001-0000-4000-8000-000000000001/fatura.pdf', 'fatura.pdf', 'application/pdf', 2048),
  ('d2000002-0000-4000-8000-000000000002',
   'd2000002-0000-4000-8000-000000000002/fatura.pdf', 'fatura.pdf', 'application/pdf', 2048);

-- ---------------------------------------------------------------------------
-- Section 1 -- the log is unreachable outside its RPC (5)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'account_deletion_log'),
  0,
  'account_deletion_log carries no policy at all -- forced RLS with none means no non-superuser read'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_log', 'select')
  and not pg_catalog.has_table_privilege('authenticated', 'public.account_deletion_log', 'insert'),
  'authenticated can neither read nor write the deletion log'
);

select ok(
  not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_log', 'insert')
  and not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_log', 'update')
  and not pg_catalog.has_table_privilege('service_role', 'public.account_deletion_log', 'delete'),
  'not even service_role writes the log directly -- record_account_deletion is the only path'
);

-- The de-identification is structural: the column simply does not exist.
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'account_deletion_log'
     and column_name in ('user_id', 'email', 'display_name')),
  0,
  'the log has no user_id, email or display_name column -- de-identified by construction'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.record_account_deletion(timestamptz, timestamptz, timestamptz, timestamptz, text, text, integer, bigint, jsonb, text)',
    'execute'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.record_account_deletion(timestamptz, timestamptz, timestamptz, timestamptz, text, text, integer, bigint, jsonb, text)',
    'execute'
  ),
  'the recording RPC is the executor''s alone'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the log's closed vocabularies refuse free text (4)
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$ select public.record_account_deletion(
       now(), now(), now(), now(), 'stopped',
       'the disk was making a funny noise', 0, 0, '{}'::jsonb, null
     ) $$,
  '23514',
  null,
  'a free-text stop reason is refused by the database'
);

select throws_ok(
  $$ select public.record_account_deletion(
       now(), now(), now(), now(), 'finished-ish', null, 0, 0, '{}'::jsonb, null
     ) $$,
  '23514',
  null,
  'an outcome outside the closed set is refused'
);

select throws_ok(
  $$ select public.record_account_deletion(
       now(), now(), now(), now(), 'completed', null, 0, 0, '{}'::jsonb,
       'user@example.test'
     ) $$,
  '23514',
  null,
  'a raw identifier cannot land in the session-hash column -- it is 64 hex or nothing'
);

select lives_ok(
  $$ select public.record_account_deletion(
       now(), now(), now(), now(), 'completed', null, 2, 300,
       '{"entries": 1}'::jsonb, repeat('a', 64)
     ) $$,
  'a well-formed completion record is accepted -- the refusals above are not vacuous'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the owned-row census (4) -- SH-DELETE-007
-- ---------------------------------------------------------------------------

select ok(
  (public.account_owned_row_counts('d2000001-0000-4000-8000-000000000001') ->> 'entries')::int >= 1,
  'the census sees the doomed account''s entry'
);

select ok(
  (public.account_owned_row_counts('d2000001-0000-4000-8000-000000000001')) ? 'attachments',
  'and its attachment'
);

-- It enumerates rather than hardcodes: the account carries rows in more than
-- the two tables this file inserted into, because handle_new_user seeded three.
select cmp_ok(
  (select count(*)::int from jsonb_object_keys(
     public.account_owned_row_counts('d2000001-0000-4000-8000-000000000001')
   )),
  '>=',
  4,
  'the census reaches trigger-seeded tables too -- it reads the catalog, not a list'
);

select is(
  public.account_owned_row_counts('d2000003-0000-4000-8000-000000000003'),
  '{}'::jsonb,
  'an account with no rows censuses empty -- the executor''s zero-residue check has a true negative'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 4 -- the request surface is self-only and audited (6)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', 'd2000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.account_owned_row_counts('d2000002-0000-4000-8000-000000000002') $$,
  '42501',
  null,
  'a user cannot census another account -- the executor''s surface is not theirs'
);

-- The positive control, taken while the account is still active: the drain
-- claims its work. Everything section 5 asserts afterwards is a change from
-- this, not a property of an empty queue.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select public.claim_next_entry_interpretation_job('sh2-worker-before', 120) ->> 'user_id'),
  'd2000001-0000-4000-8000-000000000001',
  'while active, the account''s job IS claimable -- the refusal below is a change, not a vacuum'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', 'd2000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select public.request_account_deletion() ->> 'status'),
  'deleting',
  'the account can start its own deletion'
);

select is(
  (select status from public.account_lifecycle
   where user_id = 'd2000001-0000-4000-8000-000000000001'),
  'deleting',
  'the lifecycle row moved through the SH.1 machine'
);

select is(
  (
    select count(*)::int from public.audit_logs
    where user_id = 'd2000001-0000-4000-8000-000000000001'
      and action_type = 'account_lifecycle_transition'
      and after_state ->> 'status' = 'deleting'
      and after_state ->> 'reason_code' = 'user_deletion_request'
      and after_state ->> 'changed_by' = 'user'
  ),
  1,
  'and wrote the audit row with the user as the actor'
);

select is(
  (select public.request_account_deletion() ->> 'already_requested'),
  'true',
  'a second request is idempotent rather than an error -- the surface may be retried'
);

-- The neighbour is untouched by any of it: the request took no target.
select is(
  (select status from public.account_lifecycle
   where user_id = 'd2000002-0000-4000-8000-000000000002'),
  'active',
  'the bystander account is still active -- the request surface accepts no target'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 5 -- writes are already blocked while deleting (2)
-- ---------------------------------------------------------------------------
-- SH-DELETE-003's "from that instant" clause, over the SH.1 predicates.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"d2000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', 'd2000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.capture_entry_async('mais um registro', 'pt-BR', 'web', 'sh2-deleting-capture') $$,
  'P0001',
  'Account lifecycle does not permit this action',
  'a deleting account cannot capture -- writes stop at the request, not at the executor'
);

reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.claim_next_entry_interpretation_job('sh2-worker-after', 120),
  null::jsonb,
  'and job B -- pending, credentialed, identical to the one claimed above -- is now unclaimable'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 6 -- the cascade, and the neighbour that survives it (3)
-- ---------------------------------------------------------------------------
-- SH-DELETE-011's calibration and negative control, at the row level. The
-- storage half is the executor's (Deno) and the deployed journey's.

select lives_ok(
  $$ delete from auth.users where id = 'd2000001-0000-4000-8000-000000000001' $$,
  'deleting the account is not blocked -- the SH.0 drill''s property, re-asserted with SH.2''s tables present'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  public.account_owned_row_counts('d2000001-0000-4000-8000-000000000001'),
  '{}'::jsonb,
  'zero owned rows survive -- including the lifecycle row and the attachment'
);

select is(
  (
    select count(*)::int from public.attachments
    where user_id = 'd2000002-0000-4000-8000-000000000002'
      and storage_path = 'd2000002-0000-4000-8000-000000000002/fatura.pdf'
  ),
  1,
  'the bystander''s identically-named attachment survives -- names collide, prefixes do not'
);

select * from finish();
rollback;
