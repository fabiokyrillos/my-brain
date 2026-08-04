-- Signup Hardening SH.3 -- suspension and the administrative boundary, executed.
--
-- SH-ADMIN-001/004, SH-SUSPEND-001/004/005/006/007, SH-WORKER-001 over
-- migration 202608040073. The adversarial floor for this slice (plan sec. 3):
-- an over-broad service-role surface (T-10) is the grant section; suspension
-- bypass via a direct call (T-11) is the forged-claim probe; admin-without-audit
-- (T-12) is the audit assertions on every transition; suspended work still
-- running (T-13) is the claim/defer sections.
--
-- Role juggling follows signup_hardening_account_lifecycle.sql: auth.role()
-- reads the JWT claim, never the PostgreSQL role, so the operator path runs as
-- the session superuser with the service_role claim set -- except for one
-- deliberate positive probe under `set local role service_role`, so the EXECUTE
-- grant is proven by execution and not by the catalog alone. Written in pure
-- ASCII.
--
-- TIME INSIDE A TRANSACTION, WHICH THIS SUITE DEPENDS ON
-- ---------------------------------------------------------------------------
-- `now()` is the transaction timestamp and is therefore CONSTANT here. That is
-- what makes the SH-SUSPEND-005 section deterministic: a reactivation performed
-- in this transaction stamps `changed_at = now()`, so a reminder at
-- `now() - 2 days` is unambiguously "came due while suspended" and a reminder at
-- exactly `now()` is unambiguously "due at or after the reactivation". No
-- wall-clock race, and no dependence on when CI happens to run.

begin;
select plan(42);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures -- S will be suspended and cycled; K is the untouched bystander
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('53000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh3-suspended@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sh3-bystander@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Both hold ACTIVE credentials, so the BYOK predicate passes for both and
-- lifecycle is the only discriminator in the claim sections.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  -- 17 bytes of ciphertext, not 16: the BYOK CHECK floors it at the 128-bit tag
  -- plus one byte, and a 16-byte fixture is refused by the table.
  ('53000001-0000-4000-8000-000000000001', 'active',
   '\x5301020304050607080910111213141516'::bytea,
   '\x530102030405060708091011'::bytea, 1, 'sk-proj:530101', now()),
  ('53000002-0000-4000-8000-000000000002', 'active',
   '\x5302020304050607080910111213141516'::bytea,
   '\x530202030405060708091011'::bytea, 1, 'sk-proj:530202', now());

insert into public.entries (id, user_id, original_content, source, status, locale)
values
  ('53200001-0000-4000-8000-000000000001', '53000001-0000-4000-8000-000000000001',
   'entrada que fica na fila', 'web', 'saved', 'pt-BR'),
  ('53200002-0000-4000-8000-000000000002', '53000001-0000-4000-8000-000000000001',
   'entrada reivindicada antes da suspensao', 'web', 'saved', 'pt-BR'),
  ('53200003-0000-4000-8000-000000000003', '53000002-0000-4000-8000-000000000002',
   'entrada do espectador', 'web', 'saved', 'pt-BR'),
  ('53200004-0000-4000-8000-000000000004', '53000002-0000-4000-8000-000000000002',
   'segunda entrada do espectador', 'web', 'saved', 'pt-BR');

insert into public.jobs (id, user_id, type, payload, idempotency_key)
values
  ('53100001-0000-4000-8000-000000000001', '53000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', '53200001-0000-4000-8000-000000000001', 'mode', 'initial'),
   'sh3-queued'),
  ('53100002-0000-4000-8000-000000000002', '53000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', '53200002-0000-4000-8000-000000000002', 'mode', 'initial'),
   'sh3-claimed-then-deferred'),
  ('53100003-0000-4000-8000-000000000003', '53000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', '53200003-0000-4000-8000-000000000003', 'mode', 'initial'),
   'sh3-bystander-running'),
  ('53100004-0000-4000-8000-000000000004', '53000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', '53200004-0000-4000-8000-000000000004', 'mode', 'initial'),
   'sh3-bystander-queued');

-- ---------------------------------------------------------------------------
-- Section A -- the administrative boundary is closed to client roles (7)
-- ---------------------------------------------------------------------------
-- SH-ADMIN-001, SH-SUSPEND-001, T-10/T-11. Executed probes: the EXECUTE grant
-- is checked by calling, not by reading pg_proc.

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"53000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '53000001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.suspend_account('53000002-0000-4000-8000-000000000002', 'operator_suspension') $$,
  '42501',
  null,
  'authenticated cannot execute suspend_account -- suspension has no client path'
);

select throws_ok(
  $$ select public.reactivate_account('53000001-0000-4000-8000-000000000001', 'operator_reactivation') $$,
  '42501',
  null,
  'authenticated cannot execute reactivate_account -- no self-service un-suspension'
);

select throws_ok(
  $$ select public.begin_account_deletion_admin('53000002-0000-4000-8000-000000000002', 'operator_deletion_start') $$,
  '42501',
  null,
  'authenticated cannot execute begin_account_deletion_admin -- no client path to another account'
);

select throws_ok(
  $$ select public.admin_account_lifecycle_status(null, 'sh3-bystander@example.test') $$,
  '42501',
  null,
  'authenticated cannot execute the readback -- it resolves emails and stays operator-only'
);

select throws_ok(
  $$ select public.defer_job_for_inactive_owner('53100002-0000-4000-8000-000000000002', 'anything') $$,
  '42501',
  null,
  'authenticated cannot execute the worker deferral'
);

-- T-11 in its sharpest form: a client that forges the service_role claim gets
-- nowhere, because EXECUTE is decided by the PostgreSQL role and the claim is
-- only read inside a function the caller cannot enter.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  $$ select public.suspend_account('53000002-0000-4000-8000-000000000002', 'operator_suspension') $$,
  '42501',
  null,
  'forging the service_role claim does not open the boundary -- the EXECUTE grant is checked first'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.suspend_account('53000002-0000-4000-8000-000000000002', 'operator_suspension') $$,
  '42501',
  null,
  'anon reaches none of it either'
);

reset role;

-- From here on: the operator boundary.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- ---------------------------------------------------------------------------
-- Section B -- the readback, which is how the runbook proves what it did (4)
-- ---------------------------------------------------------------------------
-- SH-ADMIN-002.

select is(
  (select public.admin_account_lifecycle_status(null, 'sh3-suspended@example.test') ->> 'status'),
  'active',
  'the readback resolves an account by email and reports its state'
);

select is(
  (select public.admin_account_lifecycle_status(
     '53000002-0000-4000-8000-000000000002', null) ->> 'user_id'),
  '53000002-0000-4000-8000-000000000002',
  'the readback resolves an account by id'
);

select is(
  (select public.admin_account_lifecycle_status(null, 'nobody@example.test') ->> 'found'),
  'false',
  'an unknown account reports found=false rather than inventing a state'
);

select throws_ok(
  $$ select public.admin_account_lifecycle_status(
       '53000002-0000-4000-8000-000000000002', 'sh3-bystander@example.test') $$,
  '22023',
  null,
  'naming an account twice is refused -- exactly one selector'
);

-- ---------------------------------------------------------------------------
-- Section C -- the pre-suspension claims, which are this suite's positive
-- controls for everything the later sections say cannot happen (2)
-- ---------------------------------------------------------------------------

select is(
  (select public.claim_entry_interpretation_job(
     '53100002-0000-4000-8000-000000000002',
     '53000001-0000-4000-8000-000000000001',
     'sh3-worker-a', 120) ->> 'status'),
  'running',
  'while the account is active its job claims normally -- the control for T-13'
);

select is(
  (select public.claim_entry_interpretation_job(
     '53100003-0000-4000-8000-000000000003',
     '53000002-0000-4000-8000-000000000002',
     'sh3-worker-b', 120) ->> 'status'),
  'running',
  'the bystander also holds a running job -- the control for the deferral refusal'
);

-- The SH-SUSPEND-006 census, taken before the cycle begins.
create temporary table sh3_census_before on commit drop as
select public.account_owned_row_counts('53000001-0000-4000-8000-000000000001') as counts;

-- ---------------------------------------------------------------------------
-- Section D -- suspension, audited, idempotent, and closed to free text (7)
-- ---------------------------------------------------------------------------
-- SH-ADMIN-001/004, SH-SUSPEND-007, T-12.

-- The one positive EXECUTE probe performed as the role itself, so the grant is
-- proven by execution in both directions rather than by pg_proc alone.
reset role;
set local role service_role;

select is(
  (select public.suspend_account(
     '53000001-0000-4000-8000-000000000001', 'operator_suspension_abuse') ->> 'before'),
  'active',
  'service_role executes suspend_account and it reports the before state'
);

reset role;

select is(
  (
    select status || '/' || reason_code || '/' || changed_by
    from public.account_lifecycle
    where user_id = '53000001-0000-4000-8000-000000000001'
  ),
  'suspended/operator_suspension_abuse/operator',
  'the row carries the suspension, the closed reason, and the operator actor'
);

select is(
  (
    select count(*)::int from public.audit_logs
    where user_id = '53000001-0000-4000-8000-000000000001'
      and action_type = 'account_lifecycle_transition'
      and before_state ->> 'status' = 'active'
      and after_state ->> 'status' = 'suspended'
      and after_state ->> 'changed_by' = 'operator'
      and after_state ->> 'reason_code' = 'operator_suspension_abuse'
  ),
  1,
  'the suspension wrote its audit row through the machine -- admin without audit is impossible'
);

select is(
  (select public.suspend_account(
     '53000001-0000-4000-8000-000000000001', 'operator_suspension') ->> 'changed'),
  'false',
  'suspending an already-suspended account is idempotent, not an error'
);

select is(
  (
    select count(*)::int from public.audit_logs
    where user_id = '53000001-0000-4000-8000-000000000001'
      and action_type = 'account_lifecycle_transition'
  ),
  1,
  'the idempotent call wrote no second audit row and no second transition'
);

select throws_ok(
  $$ select public.suspend_account(
       '53000002-0000-4000-8000-000000000002', 'porque sim') $$,
  '22023',
  null,
  'a free-text reason is refused before anything is written'
);

select throws_ok(
  $$ select public.suspend_account(
       '53000009-0000-4000-8000-000000000009', 'operator_suspension') $$,
  'P0001',
  'Account lifecycle state is missing',
  'an account with no lifecycle row is named, not silently created'
);

-- ---------------------------------------------------------------------------
-- Section E -- the worker deferral (5)
-- ---------------------------------------------------------------------------
-- SH-WORKER-001. The job claimed in section C is executing; its owner became
-- suspended a moment later; the handler re-verifies and calls this.

select throws_ok(
  $$ select public.defer_job_for_inactive_owner(
       '53100003-0000-4000-8000-000000000003', 'sh3-worker-b') $$,
  'P0001',
  'The owner of this job is active; nothing to defer',
  'the deferral refuses an active owner -- it is not a generic put-this-back primitive'
);

select is(
  public.defer_job_for_inactive_owner(
    '53100002-0000-4000-8000-000000000002', 'sh3-worker-impostor'),
  null::jsonb,
  'a worker that does not hold the lease gets the existing null signal, not the row'
);

select is(
  (select public.defer_job_for_inactive_owner(
     '53100002-0000-4000-8000-000000000002', 'sh3-worker-a') ->> 'status'),
  'deferred',
  'the lease holder defers the job of a suspended owner'
);

select is(
  (
    select status || '/' || attempts::text || '/' || coalesce(locked_by, 'unlocked')
      || '/' || coalesce(lease_expires_at::text, 'no-lease')
    from public.jobs where id = '53100002-0000-4000-8000-000000000002'
  ),
  'pending/1/unlocked/no-lease',
  'the job is back in the queue with its lease cleared and only the claim''s own attempt burned'
);

select is(
  (
    select count(*)::int from public.audit_logs
    where user_id = '53000001-0000-4000-8000-000000000001'
      and action_type = 'job_deferred_inactive_owner'
      and after_state ->> 'owner_status' = 'suspended'
  ),
  1,
  'the deferral is auditable: actor, target, before and after state'
);

-- ---------------------------------------------------------------------------
-- Section F -- suspended work does not run, and is not destroyed (3)
-- ---------------------------------------------------------------------------
-- SH-SUSPEND-004, T-13.

select is(
  (select public.claim_next_entry_interpretation_job('sh3-worker-c', 120) ->> 'user_id'),
  '53000002-0000-4000-8000-000000000002',
  'the drain still serves the bystander -- the predicate skips one owner, not the queue'
);

select is(
  public.claim_next_entry_interpretation_job('sh3-worker-d', 120),
  null::jsonb,
  'and then finds nothing: both of the suspended owner''s jobs are skipped'
);

select is(
  (
    select string_agg(status, ',' order by idempotency_key)
    from public.jobs where user_id = '53000001-0000-4000-8000-000000000001'
  ),
  'pending,pending',
  'the suspended owner''s jobs stay queued -- not failed, not exhausted, not deleted'
);

-- ---------------------------------------------------------------------------
-- Section G -- reactivation, and the queue resuming on its own (3)
-- ---------------------------------------------------------------------------
-- SH-SUSPEND-004: "claimable again with no operator re-enqueue".

select throws_ok(
  $$ select public.reactivate_account(
       '53000001-0000-4000-8000-000000000001', 'deletion_reverted') $$,
  '22023',
  null,
  'reverting a deletion and lifting a suspension are not interchangeable words'
);

select is(
  (select public.reactivate_account(
     '53000001-0000-4000-8000-000000000001', 'operator_reactivation') ->> 'changed'),
  'true',
  'the suspension is lifted with its own reason'
);

select is(
  (select public.claim_next_entry_interpretation_job('sh3-worker-e', 120) ->> 'user_id'),
  '53000001-0000-4000-8000-000000000001',
  'the drain claims the reactivated owner''s work with no operator re-enqueue'
);

-- ---------------------------------------------------------------------------
-- Section H -- the cycle changed no user data (2)
-- ---------------------------------------------------------------------------
-- SH-SUSPEND-006. `audit_logs` is excluded from the equality and asserted
-- separately, because the audit trail SHOULD grow: a census that hid it would
-- be hiding the very proof SH-ADMIN-004 demands.

select is(
  (
    select public.account_owned_row_counts('53000001-0000-4000-8000-000000000001')
      - 'audit_logs'
  ),
  (select counts - 'audit_logs' from sh3_census_before),
  'a suspend/reactivate cycle leaves every owned table with identical row counts'
);

select is(
  (
    select count(*)::int from public.audit_logs
    where user_id = '53000001-0000-4000-8000-000000000001'
  ),
  3,
  'exactly three audit rows were added: the suspension, the deferral, the reactivation'
);

-- ---------------------------------------------------------------------------
-- Section I -- administrative deletion-start (4)
-- ---------------------------------------------------------------------------
-- SH-ADMIN-001. It freezes; it does not erase (the executor is self-only,
-- ADR-074), and the runbook says so in those words.

select throws_ok(
  $$ select public.begin_account_deletion_admin(
       '53000001-0000-4000-8000-000000000001', 'operator_suspension') $$,
  '22023',
  null,
  'deletion-start refuses any reason but its own'
);

select is(
  (
    select public.begin_account_deletion_admin(
      '53000001-0000-4000-8000-000000000001', 'operator_deletion_start') ->> 'after'
  ),
  'deleting',
  'the operator can start a deletion, and the machine records who and why'
);

select throws_ok(
  $$ select public.suspend_account(
       '53000001-0000-4000-8000-000000000001', 'operator_suspension') $$,
  'P0001',
  'Only an active account can be suspended (it is deleting)',
  'a deleting account is not suspendable -- the vocabularies do not overlap'
);

select is(
  (select public.reactivate_account(
     '53000001-0000-4000-8000-000000000001', 'deletion_reverted') ->> 'after'),
  'active',
  'the pre-executor return path exists and is operator-only (SH-DELETE-014)'
);

-- ---------------------------------------------------------------------------
-- Section J -- no retroactive reminder burst (5)
-- ---------------------------------------------------------------------------
-- SH-SUSPEND-005. The account above is now `active` with reason
-- `deletion_reverted`, so its reactivation window is `now()`. Both reminders
-- are `important` and the override is on, so quiet hours cannot decide the
-- outcome whatever time CI runs.

update public.agent_preferences
set important_reminder_override = true, max_followups_per_day = 3
where user_id in (
  '53000001-0000-4000-8000-000000000001',
  '53000002-0000-4000-8000-000000000002'
);

insert into public.reminders (id, user_id, title, remind_at, important, status)
values
  ('53300001-0000-4000-8000-000000000001', '53000001-0000-4000-8000-000000000001',
   'venceu enquanto a conta estava suspensa', now() - interval '2 days', true, 'scheduled'),
  ('53300002-0000-4000-8000-000000000002', '53000001-0000-4000-8000-000000000001',
   'vence a partir da reativacao', now(), true, 'scheduled'),
  ('53300003-0000-4000-8000-000000000003', '53000002-0000-4000-8000-000000000002',
   'lembrete antigo de uma conta nunca suspensa', now() - interval '2 days', true, 'scheduled');

select is(
  (select public.run_user_heartbeat(
     '53000001-0000-4000-8000-000000000001') ->> 'notifications_created'),
  '1',
  'the first heartbeat after reactivation delivers one reminder, not the backlog'
);

select is(
  (
    select count(*)::int from public.notifications
    where user_id = '53000001-0000-4000-8000-000000000001'
      and dedupe_key = 'reminder:53300002-0000-4000-8000-000000000002'
  ),
  1,
  'the one delivered is the reminder due at or after the reactivation'
);

select is(
  (
    select status from public.reminders
    where id = '53300001-0000-4000-8000-000000000001'
  ),
  'scheduled',
  'the withheld reminder is untouched -- not cancelled, not sent, not deleted'
);

select is(
  (
    select status from public.reminders
    where id = '53300002-0000-4000-8000-000000000002'
  ),
  'sent',
  'the delivered reminder is marked sent exactly as before'
);

select is(
  (select public.run_user_heartbeat(
     '53000002-0000-4000-8000-000000000002') ->> 'notifications_created'),
  '1',
  'the control: an account that was never suspended still receives its old reminder -- the window is scoped to reactivation, not to age'
);

select * from finish();
rollback;
