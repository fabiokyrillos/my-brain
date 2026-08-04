-- Signup Hardening SH.1 -- the account lifecycle foundation, executed.
--
-- SH-LIFECYCLE-001..007 over migrations 202608040070/202608040071: the table
-- and its grants (executed probes, not catalog reads alone), the transition
-- machine and its unconditional audit write, the capture/reprocess refusals,
-- the identical predicate on all three claim paths, and the heartbeat skip.
--
-- The fixture discriminates on LIFECYCLE ALONE: both accounts carry active
-- credentials, valid entries and well-formed jobs, so a claim that skips the
-- suspended owner is proving the lifecycle predicate and nothing else. The
-- adversarial floor for this slice (plan sec. 3, SH.1): suspension bypass via
-- direct RPC (T-11) is the capture/reprocess section; the claim-path
-- asymmetry hazard is the drain-vs-direct section; backfill leaving a user
-- stateless is the migration's own failing postcondition, re-verified here by
-- the seed assertions.
--
-- Role juggling follows byok_awaiting_and_drain.sql: auth.role() reads the
-- JWT claim, never the PostgreSQL role, so worker calls run as the session
-- superuser with the service_role claim set; authenticated calls set the role
-- AND the claims. Written in pure ASCII.

begin;
select plan(28);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- three accounts; B will be suspended, C will cycle to deleting
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh1-active@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sh1-suspended@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a1000003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'sh1-cycling@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Both A and B hold ACTIVE credentials, so the credential predicate passes
-- for both and lifecycle is the only discriminator below.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('a1000001-0000-4000-8000-000000000001', 'active',
   '\xa101020304050607080910111213141516'::bytea,
   '\xa10102030405060708091011'::bytea, 1, 'sk-proj:a1a1a1', now()),
  ('a1000002-0000-4000-8000-000000000002', 'active',
   '\xa201020304050607080910111213141516'::bytea,
   '\xa20102030405060708091011'::bytea, 1, 'sk-proj:a2a2a2', now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('a1200001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000001',
   'entrada da conta ativa', 'web', 'saved', 'pt-BR'),
  ('a1200002-0000-4000-8000-000000000002', 'a1000002-0000-4000-8000-000000000002',
   'entrada da conta que sera suspensa', 'web', 'saved', 'pt-BR');

insert into public.jobs (id, user_id, type, payload, idempotency_key)
values
  ('a1100001-0000-4000-8000-000000000001', 'a1000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', 'a1200001-0000-4000-8000-000000000001', 'mode', 'initial'),
   'sh1-interpret-active'),
  ('a1100002-0000-4000-8000-000000000002', 'a1000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', 'a1200002-0000-4000-8000-000000000002', 'mode', 'initial'),
   'sh1-interpret-suspended'),
  ('a1100003-0000-4000-8000-000000000003', 'a1000001-0000-4000-8000-000000000001',
   'process_attachment', '{}'::jsonb, 'sh1-attach-active'),
  ('a1100004-0000-4000-8000-000000000004', 'a1000002-0000-4000-8000-000000000002',
   'process_attachment', '{}'::jsonb, 'sh1-attach-suspended');

-- ---------------------------------------------------------------------------
-- Section 1 -- the seed and the closed vocabularies (4)
-- ---------------------------------------------------------------------------

select is(
  (select status from public.account_lifecycle
   where user_id = 'a1000001-0000-4000-8000-000000000001'),
  'active',
  'handle_new_user seeds every new account active (SH-LIFECYCLE-003)'
);

select is(
  (select count(*)::int from public.account_lifecycle
   where user_id in (
     'a1000002-0000-4000-8000-000000000002',
     'a1000003-0000-4000-8000-000000000003'
   )),
  2,
  'no account exists without a lifecycle row'
);

select throws_ok(
  $$ update public.account_lifecycle
     set status = 'suspended', reason_code = 'because i felt like it', changed_by = 'operator'
     where user_id = 'a1000001-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'a free-text reason is refused by the database, not by convention'
);

select throws_ok(
  $$ update public.account_lifecycle
     set status = 'suspended', reason_code = 'operator_suspension', changed_by = 'robot'
     where user_id = 'a1000001-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'an undeclared actor is refused by the database'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- client grants, probed by execution (5) -- SH-LIFECYCLE-002
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', 'a1000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.account_lifecycle),
  1,
  'authenticated sees exactly its own lifecycle row, nobody else''s'
);

select throws_ok(
  $$ insert into public.account_lifecycle (user_id, status, reason_code, changed_by)
     values ('a1000001-0000-4000-8000-000000000001', 'active', 'initial_signup', 'user') $$,
  '42501',
  null,
  'authenticated cannot INSERT a lifecycle row'
);

select throws_ok(
  $$ update public.account_lifecycle set status = 'active'
     where user_id = 'a1000001-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'authenticated cannot UPDATE its lifecycle row -- no self-service transitions'
);

select throws_ok(
  $$ delete from public.account_lifecycle
     where user_id = 'a1000001-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'authenticated cannot DELETE its lifecycle row'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.account_lifecycle $$,
  '42501',
  null,
  'anon holds nothing on account_lifecycle'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 3 -- the transition machine and its audit write (6)
-- ---------------------------------------------------------------------------
-- SH-LIFECYCLE-004. postgres carries bypassrls here, so these updates probe
-- the MACHINE (triggers fire regardless), the way SH.3's DEFINER admin
-- functions will reach it.

select lives_ok(
  $$ update public.account_lifecycle
     set status = 'suspended', reason_code = 'operator_suspension', changed_by = 'operator'
     where user_id = 'a1000002-0000-4000-8000-000000000002' $$,
  'active -> suspended is a legal transition'
);

select is(
  (
    select count(*)::int from public.audit_logs
    where user_id = 'a1000002-0000-4000-8000-000000000002'
      and action_type = 'account_lifecycle_transition'
      and before_state ->> 'status' = 'active'
      and after_state ->> 'status' = 'suspended'
      and after_state ->> 'changed_by' = 'operator'
  ),
  1,
  'the transition wrote its audit row -- actor, reason code, before and after state'
);

select throws_ok(
  $$ update public.account_lifecycle
     set status = 'suspended', reason_code = 'operator_suspension', changed_by = 'operator'
     where user_id = 'a1000002-0000-4000-8000-000000000002' $$,
  'P0001',
  'Illegal account lifecycle transition from suspended to suspended',
  'a self-transition is outside the declared machine'
);

select lives_ok(
  $$ update public.account_lifecycle
     set status = 'deleting', reason_code = 'operator_deletion_start', changed_by = 'operator'
     where user_id = 'a1000003-0000-4000-8000-000000000003' $$,
  'active -> deleting is a legal transition'
);

select throws_ok(
  $$ update public.account_lifecycle
     set status = 'suspended', reason_code = 'operator_suspension', changed_by = 'operator'
     where user_id = 'a1000003-0000-4000-8000-000000000003' $$,
  'P0001',
  'Illegal account lifecycle transition from deleting to suspended',
  'deleting -> suspended is outside the declared machine'
);

select lives_ok(
  $$ update public.account_lifecycle
     set status = 'active', reason_code = 'deletion_reverted', changed_by = 'operator'
     where user_id = 'a1000003-0000-4000-8000-000000000003' $$,
  'deleting -> active is legal -- the SH-DELETE-014 pre-executor return path'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- capture and reprocessing refuse a non-active account (3)
-- ---------------------------------------------------------------------------
-- SH-LIFECYCLE-005 / T-11: called directly as the suspended user, the way an
-- attacker would, not through any UI.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000002-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', 'a1000002-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.capture_entry_async('tentativa da conta suspensa', 'pt-BR', 'web', 'sh1-suspended-capture') $$,
  'P0001',
  'Account lifecycle does not permit this action',
  'capture refuses a suspended account with the declared lifecycle code'
);

select throws_ok(
  $$ select public.enqueue_entry_reprocessing('a1200002-0000-4000-8000-000000000002', 'sh1-suspended-reprocess') $$,
  'P0001',
  'Account lifecycle does not permit this action',
  'reprocessing refuses a suspended account with the same declared code'
);

reset role;

select is(
  (select count(*)::int from public.entries
   where user_id = 'a1000002-0000-4000-8000-000000000002'),
  1,
  'the refused capture wrote nothing -- no partial write'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- every claim path skips the non-active owner (6)
-- ---------------------------------------------------------------------------
-- SH-LIFECYCLE-006 / SH-WORKER-003. Both owners have active credentials and
-- well-formed pending jobs; lifecycle is the only difference.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select public.claim_next_entry_interpretation_job('sh1-worker-1', 120) ->> 'user_id'),
  'a1000001-0000-4000-8000-000000000001',
  'the drain claims the active owner''s job'
);

select is(
  public.claim_next_entry_interpretation_job('sh1-worker-2', 120),
  null::jsonb,
  'the drain finds nothing else -- the suspended owner''s pending job is skipped, not failed'
);

select is(
  (
    select status || ':' || attempts::text from public.jobs
    where id = 'a1100002-0000-4000-8000-000000000002'
  ),
  'pending:0',
  'the suspended owner''s job stays queued and unclaimed with no attempt burned (SH-SUSPEND-004''s foundation)'
);

select is(
  public.claim_entry_interpretation_job(
    'a1100002-0000-4000-8000-000000000002',
    'a1000002-0000-4000-8000-000000000002',
    'sh1-worker-3', 120
  ),
  null::jsonb,
  'the direct claim path refuses the same job -- no drain/direct asymmetry'
);

select is(
  public.claim_attachment_job(
    'a1100004-0000-4000-8000-000000000004',
    'a1000002-0000-4000-8000-000000000002',
    'sh1-worker-4', 120
  ),
  null::jsonb,
  'the attachment claim path carries the identical predicate'
);

select is(
  (
    select public.claim_attachment_job(
      'a1100003-0000-4000-8000-000000000003',
      'a1000001-0000-4000-8000-000000000001',
      'sh1-worker-5', 120
    ) ->> 'status'
  ),
  'running',
  'the attachment claim still serves the active owner -- the predicate skips, it does not disable'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- capture still works for the active account (1)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', 'a1000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select public.capture_entry_async('entrada nova da conta ativa', 'pt-BR', 'web', 'sh1-active-capture') ->> 'replayed'),
  'false',
  'the active account captures exactly as before -- the refusal is scoped'
);

reset role;

-- ---------------------------------------------------------------------------
-- Section 7 -- the heartbeat skips before it reads (3)
-- ---------------------------------------------------------------------------
-- SH-LIFECYCLE-007.

select is(
  (select public.run_user_heartbeat('a1000002-0000-4000-8000-000000000002') ->> 'reason'),
  'account-not-active',
  'the heartbeat skips a suspended user with the declared reason'
);

select is(
  (select count(*)::int from public.heartbeat_runs
   where user_id = 'a1000002-0000-4000-8000-000000000002'),
  0,
  'the skip happened before any read or write of the user''s data -- no run row exists'
);

select isnt(
  (select public.run_user_heartbeat('a1000001-0000-4000-8000-000000000001') ->> 'reason'),
  'account-not-active',
  'the active user''s heartbeat is untouched by the new predicate'
);

select * from finish();
rollback;
