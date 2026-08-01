-- BYOK Slice BYOK.4 -- the awaiting lifecycle and the credential-aware drain.
--
-- Migrations 202608010068 and 202608010069. Acceptance gates D3, D4, D5, D6,
-- D7, D8 and D10.
--
-- WHAT THIS FILE IS CAREFUL ABOUT
-- ---------------------------------------------------------------------------
-- Every skip is paired with a selection on the smallest possible difference. A
-- drain that returned nothing to anybody would satisfy every "does not select"
-- assertion here and would be a total outage rather than a security property --
-- so the uncredentialed owner's job is always tested against a credentialed
-- owner's job that IS selected, in the same transaction, from the same queue.
--
-- Section 5 is the one that does something unusual: it proves the drain skip is
-- **recoverable** by configuring a credential mid-transaction and watching the
-- same job become claimable. A predicate that stranded work permanently would
-- pass a simple skip test and fail this one.
--
-- Written in pure ASCII, following `byok_resolvers.sql`.

begin;
select plan(47);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
--
-- Two owners. A is credentialed throughout; B never is until section 5 gives it
-- one. Ordering fields are set so that B's job would be selected FIRST if the
-- predicate were absent -- otherwise "A was selected" would prove nothing about
-- B being skipped.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c8000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'drain-credentialed@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c8000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'drain-uncredentialed@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('c8000001-0000-4000-8000-000000000001', 'active',
   '\xaa01020304050607080910111213141516'::bytea,
   '\xaa0102030405060708091011'::bytea, 1, 'sk-proj:aaaaaa', now());

insert into public.entries (id, user_id, original_content, source, status, locale, created_at)
values
  ('c8200001-0000-4000-8000-000000000001', 'c8000001-0000-4000-8000-000000000001',
   'entrada da conta credenciada', 'web', 'saved', 'pt-BR', now() - interval '1 minute'),
  ('c8200002-0000-4000-8000-000000000002', 'c8000002-0000-4000-8000-000000000002',
   'entrada sem chave, a mais antiga', 'web', 'saved', 'pt-BR', now() - interval '10 minutes'),
  ('c8200003-0000-4000-8000-000000000003', 'c8000002-0000-4000-8000-000000000002',
   'entrada sem chave, a segunda', 'web', 'saved', 'pt-BR', now() - interval '5 minutes'),
  ('c8200004-0000-4000-8000-000000000004', 'c8000002-0000-4000-8000-000000000002',
   'entrada sem chave, a terceira', 'web', 'saved', 'pt-BR', now() - interval '2 minutes');

-- Every fixture row is written here, before any `set local role`, on purpose:
-- `service_role` is not granted INSERT on `entries`, so a later section that
-- created its own rows would fail on a permission rather than on the property it
-- was testing.
--
-- B's jobs are all OLDER than A's, so under
-- `priority desc, next_attempt_at, created_at` they sort first. If the
-- credential predicate were removed, section 5's very first assertion would
-- return one of B's -- which is what makes that assertion non-vacuous.
insert into public.jobs (id, user_id, type, payload, idempotency_key, created_at, next_attempt_at)
values
  ('c8100001-0000-4000-8000-000000000001', 'c8000001-0000-4000-8000-000000000001',
   'interpret_entry',
   jsonb_build_object('entry_id', 'c8200001-0000-4000-8000-000000000001', 'mode', 'initial'),
   'byok4-drain-credentialed', now() - interval '1 minute', now() - interval '1 minute'),
  ('c8100002-0000-4000-8000-000000000002', 'c8000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', 'c8200002-0000-4000-8000-000000000002', 'mode', 'initial'),
   'byok4-drain-uncredentialed', now() - interval '10 minutes', now() - interval '10 minutes'),
  ('c8100003-0000-4000-8000-000000000003', 'c8000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', 'c8200003-0000-4000-8000-000000000003', 'mode', 'initial'),
   'byok4-after-configuration', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('c8100004-0000-4000-8000-000000000004', 'c8000002-0000-4000-8000-000000000002',
   'interpret_entry',
   jsonb_build_object('entry_id', 'c8200004-0000-4000-8000-000000000004', 'mode', 'initial'),
   'byok4-post-removal', now() - interval '2 minutes', now() - interval '2 minutes');

-- ---------------------------------------------------------------------------
-- Section 1 -- the schema this slice added (10)
-- ---------------------------------------------------------------------------

select has_column(
  'public', 'entries', 'capture_idempotency_key',
  'entries carries the capture idempotency key'
);
select col_is_null(
  'public', 'entries', 'capture_idempotency_key',
  'the key is nullable, because rows created before BYOK.4 have none'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'entries'
      and indexname = 'entries_capture_idempotency_key_idx'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ),
  'the capture idempotency index is unique'
);
select ok(
  (
    select indexdef like '%user_id%' and indexdef like '%WHERE%'
    from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'entries_capture_idempotency_key_idx'
  ),
  'the index is scoped by user and partial, so one user cannot collide with another'
);

select ok(
  pg_catalog.pg_get_constraintdef(oid) like '%awaiting_ai_configuration%',
  'entries_status_check admits the awaiting literal'
) from pg_catalog.pg_constraint
where conname = 'entries_status_check' and conrelid = 'public.entries'::regclass;

-- The eight that were already there survive. A migration that replaced the
-- constraint with only the new literal would pass the assertion above.
select is(
  (
    select count(*)::int
    from unnest(array[
      'saved', 'interpreting', 'awaiting_review', 'partially_processed',
      'completed', 'recoverable_error', 'terminal_error', 'reprocessing'
    ]) as literal
    where exists (
      select 1 from pg_catalog.pg_constraint
      where conname = 'entries_status_check'
        and conrelid = 'public.entries'::regclass
        and pg_catalog.pg_get_constraintdef(oid) like '%''' || literal || '''%'
    )
  ),
  8,
  'all eight pre-existing status literals survive the constraint replacement'
);

select has_function(
  'public', 'mark_entry_awaiting_ai_configuration', array['uuid', 'uuid']::name[],
  'the awaiting-state RPC exists with the declared signature'
);
select has_function(
  'public', 'fail_job_terminal', array['uuid', 'text', 'text']::name[],
  'the terminal-failure RPC exists with the declared signature'
);

select results_eq(
  $$ select prosecdef from pg_catalog.pg_proc
      where oid = 'public.fail_job_terminal(uuid, text, text)'::regprocedure $$,
  array[true],
  'fail_job_terminal is SECURITY DEFINER'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join pg_catalog.unnest(coalesce(procedure.proconfig, array[]::text[])) as setting(value)
    where procedure.oid = 'public.fail_job_terminal(uuid, text, text)'::regprocedure
      and pg_catalog.lower(setting.value) in ('search_path=', 'search_path=""')
  ),
  'fail_job_terminal pins an empty search_path'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the grants (6)
-- ---------------------------------------------------------------------------

select ok(
  pg_catalog.has_function_privilege(
    'service_role', 'public.fail_job_terminal(uuid, text, text)', 'execute'
  ),
  'service_role can end a job terminally'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated', 'public.fail_job_terminal(uuid, text, text)', 'execute'
  ),
  'authenticated cannot end a job terminally'
);
select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.fail_job_terminal(uuid, text, text)', 'execute'
  ),
  'anon cannot end a job terminally'
);
select ok(
  pg_catalog.has_function_privilege(
    'service_role', 'public.mark_entry_awaiting_ai_configuration(uuid, uuid)', 'execute'
  ),
  'service_role can return an entry to the awaiting state'
);
select ok(
  not pg_catalog.has_function_privilege(
    'authenticated', 'public.mark_entry_awaiting_ai_configuration(uuid, uuid)', 'execute'
  ),
  'a user cannot put their own entry into the awaiting state'
);
select ok(
  pg_catalog.has_function_privilege(
    'authenticated', 'public.capture_entry_async(text, text, text, text)', 'execute'
  ),
  'capture_entry_async kept its grant through the replacement'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- capture without a credential (gate D7) (8)
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c8000002-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.capture_entry_async(
       'anotacao sem chave configurada', 'pt-BR', 'web', 'byok4-nokey-0001'
     ) $$,
  'capture succeeds for a user with no active credential'
);

select is(
  (
    select status from public.entries
    where user_id = 'c8000002-0000-4000-8000-000000000002'
      and capture_idempotency_key = 'byok4-nokey-0001'
  ),
  'awaiting_ai_configuration',
  'gate D7: the entry is stored in the awaiting state'
);

select is(
  (
    select original_content from public.entries
    where capture_idempotency_key = 'byok4-nokey-0001'
  ),
  'anotacao sem chave configurada',
  'gate D7: the user''s own words are preserved exactly'
);

select is(
  (
    select count(*)::int from public.jobs
    where user_id = 'c8000002-0000-4000-8000-000000000002'
      and idempotency_key = 'entry-capture:byok4-nokey-0001'
  ),
  0,
  'gate D7: no interpretation job is created'
);

-- The audit row exists, and it says what happened rather than claiming a queue.
select is(
  (
    select action_type from public.audit_logs
    where user_id = 'c8000002-0000-4000-8000-000000000002'
      and entity_id = (
        select id from public.entries where capture_idempotency_key = 'byok4-nokey-0001'
      )
  ),
  'entry_awaiting_ai_configuration',
  'the automatic decision not to enqueue is auditable'
);

-- Replay. Without the entry-side key this would write a second entry, because
-- there is no job row for the old replay path to recognise.
select lives_ok(
  $$ select public.capture_entry_async(
       'anotacao sem chave configurada', 'pt-BR', 'web', 'byok4-nokey-0001'
     ) $$,
  'a replayed capture with no credential does not raise'
);
select is(
  (
    select count(*)::int from public.entries
    where user_id = 'c8000002-0000-4000-8000-000000000002'
      and capture_idempotency_key = 'byok4-nokey-0001'
  ),
  1,
  'the replay is idempotent: one entry, not two'
);
select is(
  (
    select (public.capture_entry_async(
      'anotacao sem chave configurada', 'pt-BR', 'web', 'byok4-nokey-0001'
    ) ->> 'replayed')
  ),
  'true',
  'the replay reports itself as a replay'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- capture WITH a credential is unchanged (4)
-- ---------------------------------------------------------------------------
--
-- The positive control for section 3. Without it, a `capture_entry_async` that
-- had simply stopped enqueueing anything would pass every assertion above.

select set_config(
  'request.jwt.claims',
  '{"sub":"c8000001-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.capture_entry_async(
       'anotacao com chave ativa', 'pt-BR', 'web', 'byok4-withkey-0001'
     ) $$,
  'capture succeeds for a user with an active credential'
);
select is(
  (
    select status from public.entries
    where capture_idempotency_key = 'byok4-withkey-0001'
  ),
  'saved',
  'a credentialed capture is saved, not awaiting'
);
select is(
  (
    select count(*)::int from public.jobs
    where idempotency_key = 'entry-capture:byok4-withkey-0001'
  ),
  1,
  'a credentialed capture still enqueues exactly one job'
);
select is(
  (
    select action_type from public.audit_logs
    where entity_id = (
      select id from public.entries where capture_idempotency_key = 'byok4-withkey-0001'
    )
  ),
  'entry_processing_enqueued',
  'the credentialed audit row is the one it has always been'
);

-- ---------------------------------------------------------------------------
-- Section 5 -- the credential-aware drain (gate D4) (8)
-- ---------------------------------------------------------------------------

set local role service_role;

-- B's job is older and would sort first. This selects A's, which is the whole
-- claim.
select is(
  (
    select (public.claim_next_entry_interpretation_job('pgtap-worker-1', 120) ->> 'user_id')
  ),
  'c8000001-0000-4000-8000-000000000001',
  'gate D4: the drain selects the credentialed owner''s job, skipping the older uncredentialed one'
);

-- A's second job -- the one section 4's capture created -- is claimed next,
-- because A is still the only credentialed owner.
select is(
  (
    select (public.claim_next_entry_interpretation_job('pgtap-worker-2', 120) ->> 'user_id')
  ),
  'c8000001-0000-4000-8000-000000000001',
  'the drain keeps serving the credentialed owner while that owner has work'
);

-- Everything credentialed is now claimed, and three of B's jobs remain: pending,
-- inside their retry budget, and due. That is the non-vacuous part -- the queue
-- is not empty, it is ineligible.
select is(
  (
    select count(*)::int from public.jobs
    where user_id = 'c8000002-0000-4000-8000-000000000002'
      and type = 'interpret_entry'
      and status = 'pending'
      and attempts < max_attempts
      and next_attempt_at <= now()
  ),
  3,
  'the uncredentialed owner''s jobs are still pending and otherwise eligible'
);

select ok(
  public.claim_next_entry_interpretation_job('pgtap-worker-3', 120) is null,
  'gate D4: with only uncredentialed work left, the drain claims nothing'
);

select ok(
  public.claim_next_entry_interpretation_job('pgtap-worker-4', 120) is null,
  'the drain does not repeatedly claim impossible work'
);

-- The skipped job is unharmed: no attempt was spent and no lease was taken.
select is(
  (
    select attempts from public.jobs
    where id = 'c8100002-0000-4000-8000-000000000002'
  ),
  0,
  'a skipped job spends no attempt'
);
select ok(
  (
    select locked_by is null and lease_expires_at is null
    from public.jobs where id = 'c8100002-0000-4000-8000-000000000002'
  ),
  'a skipped job is never locked, so it cannot starve anybody'
);

-- And it is recoverable. This is the assertion a predicate that stranded work
-- would fail.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('c8000002-0000-4000-8000-000000000002', 'active',
   '\xbb01020304050607080910111213141516'::bytea,
   '\xbb0102030405060708091011'::bytea, 1, 'sk-proj:bbbbbb', now());

select is(
  (
    select (public.claim_next_entry_interpretation_job('pgtap-worker-5', 120) ->> 'id')
  ),
  'c8100002-0000-4000-8000-000000000002',
  'gate D4: the skipped job becomes claimable the moment its owner configures a key'
);

-- ---------------------------------------------------------------------------
-- Section 6 -- removal makes future claims ineligible (2)
-- ---------------------------------------------------------------------------

-- The positive control first: with B's credential still active, B's next job IS
-- claimable. Without this line the assertion below would be satisfied by a drain
-- that had stopped working entirely.
select is(
  (
    select (public.claim_next_entry_interpretation_job('pgtap-worker-6', 120) ->> 'id')
  ),
  'c8100003-0000-4000-8000-000000000003',
  'B''s next job is claimable while B''s credential is active'
);

-- Now remove the credential the way `removeAiCredential` does -- one statement,
-- status and material together. `c8100004` is still pending and untouched.
update public.user_ai_credentials
set status = 'removed', ciphertext = null, iv = null, key_version = null, validated_at = null
where user_id = 'c8000002-0000-4000-8000-000000000002';

select ok(
  public.claim_next_entry_interpretation_job('pgtap-worker-7', 120) is null,
  'gate D3: a removed credential makes future claims ineligible immediately'
);

-- ---------------------------------------------------------------------------
-- Section 7 -- terminal failure (gates D5, D6) (5)
-- ---------------------------------------------------------------------------

-- A claimed, running job to end. `c8100002` was claimed by worker-4 above.
select is(
  (select status from public.jobs where id = 'c8100002-0000-4000-8000-000000000002'),
  'running',
  'the fixture job is claimed and running'
);

select is(
  (
    select (public.fail_job_terminal(
      'c8100002-0000-4000-8000-000000000002', 'pgtap-worker-5', 'credential_required'
    ) ->> 'status')
  ),
  'exhausted',
  'gate D5: a configuration failure ends the job immediately'
);

select is(
  (select error from public.jobs where id = 'c8100002-0000-4000-8000-000000000002'),
  'credential_required',
  'gate D6: jobs.error carries the declared code and nothing else'
);

-- The retry budget was not spent past this attempt, and nothing is scheduled.
select is(
  (
    select attempts from public.jobs
    where id = 'c8100002-0000-4000-8000-000000000002'
  ),
  1,
  'gate D5: no further attempt is consumed -- the claim''s single attempt stands'
);

-- The closed vocabulary is enforced by the database, not only by the worker.
select throws_ok(
  $$ select public.fail_job_terminal(
       'c8100004-0000-4000-8000-000000000004', 'pgtap-worker-8',
       'OpenAI rejected the key sk-proj-something'
     ) $$,
  '22023',
  null,
  'gate D6: a provider message cannot be stored, even by a caller that tries'
);

-- ---------------------------------------------------------------------------
-- Section 8 -- returning an entry to the awaiting state (4)
-- ---------------------------------------------------------------------------

select is(
  public.mark_entry_awaiting_ai_configuration(
    'c8200002-0000-4000-8000-000000000002', 'c8000002-0000-4000-8000-000000000002'
  ),
  true,
  'an entry with no interpretation returns to the awaiting state'
);
select is(
  (select status from public.entries where id = 'c8200002-0000-4000-8000-000000000002'),
  'awaiting_ai_configuration',
  'the entry''s status says so'
);

-- Ownership is proven by both columns. A worker holding a real entry id but the
-- wrong owner gets P0002, not somebody else's row mutated.
select throws_ok(
  $$ select public.mark_entry_awaiting_ai_configuration(
       'c8200001-0000-4000-8000-000000000001', 'c8000002-0000-4000-8000-000000000002'
     ) $$,
  'P0002',
  null,
  'a foreign owner cannot move another account''s entry'
);
select is(
  (select status from public.entries where id = 'c8200001-0000-4000-8000-000000000001'),
  'saved',
  'and the entry it named is untouched'
);

select * from finish();
rollback;
