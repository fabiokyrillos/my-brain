-- Signup Hardening SH.6 -- the quota and fairness mechanism, executed.
--
-- SH-QUOTA-001 (entries per UTC day), SH-QUOTA-002 (live jobs), SH-QUOTA-003
-- (per-owner drain fairness, with the two-user positive control), SH-QUOTA-004
-- and SH-QUOTA-005 (storage bytes, object count, attachments per entry and per
-- day), SH-QUOTA-009 (a refusal vocabulary distinct from lifecycle and
-- throttle), SH-QUOTA-010 (the ceilings are parameters). Migration
-- 202608050076, ADR-077.
--
-- HOW THE CEILINGS ARE LOWERED HERE, AND WHY THAT IS ITSELF THE PROOF
-- ---------------------------------------------------------------------------
-- Proving a 300-entry ceiling by inserting 300 rows would be slow and would
-- prove less. Each section instead UPDATEs `private.quota_ceilings` to a small
-- number and restores it -- which is exactly the operation SH-QUOTA-010 says a
-- ceiling change must be. If the ceilings had been frozen into DDL the way a
-- CHECK constraint would freeze them, this file could not be written at all.
--
-- NOT COVERED HERE, AND SAID SO RATHER THAN IMPLIED
-- ---------------------------------------------------------------------------
-- Genuine concurrency. A pgTAP file is one session, so "two concurrent captures
-- at the ceiling admit exactly one" cannot be proven here -- the sections below
-- prove the sequential ceiling, which is necessary and not sufficient. The
-- concurrency half is `scripts/quota-concurrency.mjs`, run against a shared
-- environment, and until it has run the advisory-lock serialization is argued
-- rather than demonstrated. This is the same boundary `signup_hardening_auth_-
-- throttle.sql` draws for the throttle claim.
--
-- Written in pure ASCII.

begin;
select plan(41);

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- A helper that reports HOW a statement was refused, not merely that it was.
--
-- `throws_ok` can compare the SQLSTATE and the message, but the whole of
-- SH-QUOTA-009 lives in the DETAIL -- the field that distinguishes a quota
-- refusal from a lifecycle refusal, both of which are P0001. Raising inside a
-- function opens a subtransaction, so the refused statement rolls back and
-- everything before it survives, which is also how the "no partial write"
-- assertions below can be made at all.
-- ---------------------------------------------------------------------------

create function pg_temp.refusal(p_sql text)
returns text[]
language plpgsql
as $refusal$
declare
  refusal_state text;
  refusal_detail text;
  refusal_message text;
begin
  execute p_sql;
  return array['none', 'none', 'none'];
exception when others then
  get stacked diagnostics
    refusal_state = returned_sqlstate,
    refusal_detail = pg_exception_detail,
    refusal_message = message_text;
  return array[refusal_state, refusal_detail, refusal_message];
end;
$refusal$;

-- ---------------------------------------------------------------------------
-- Fixtures -- two owners, so every ceiling can be shown to be per-owner rather
-- than global. `handle_new_user` seeds their lifecycle rows.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'sh6-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c1000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sh6-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- Both hold ACTIVE credentials, so BYOK-JOBS-002's drain predicate passes for
-- both and fairness is the only discriminator in section 7.
insert into public.user_ai_credentials
  (user_id, status, ciphertext, iv, key_version, fingerprint, validated_at)
values
  ('c1000001-0000-4000-8000-000000000001', 'active',
   '\xc101020304050607080910111213141516'::bytea,
   '\xc10102030405060708091011'::bytea, 1, 'sk-proj:c1c1c1', now()),
  ('c1000002-0000-4000-8000-000000000002', 'active',
   '\xc201020304050607080910111213141516'::bytea,
   '\xc20102030405060708091011'::bytea, 1, 'sk-proj:c2c2c2', now());

-- ---------------------------------------------------------------------------
-- Section 1 -- the ceilings are data nobody can reach (5)
-- ---------------------------------------------------------------------------

select has_table('private', 'quota_ceilings', 'the ceilings table exists');

select is(
  (select relrowsecurity and relforcerowsecurity
   from pg_catalog.pg_class where oid = 'private.quota_ceilings'::regclass),
  true,
  'RLS is enabled and forced on the ceilings table'
);

-- Every privilege, every client role. Checking the two that seem likely is how
-- a TRUNCATE grant survives a review.
select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
        unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as privilege
   where has_table_privilege(role_name::name, 'private.quota_ceilings', privilege)),
  0,
  'no client role holds any privilege on the ceilings'
);

select is(
  (select count(*)::int
   from unnest(array['anon', 'authenticated', 'service_role']) as role_name,
        unnest(array[
          'private.quota_ceiling(text)',
          'private.utc_day_start()',
          'private.enforce_entry_quota()',
          'private.enforce_live_job_quota()',
          'private.enforce_attachment_quota()',
          'private.enforce_entry_attachment_quota()'
        ]) as signature
   where has_function_privilege(role_name::name, signature, 'execute')),
  0,
  'no client role can execute a quota function -- triggers do not need the grant'
);

-- A quota whose trigger was dropped is a quota that silently stopped existing --
-- and one quietly converted to FOR EACH ROW is worse, because a row trigger
-- cannot see the earlier rows of its own multi-row INSERT and would let a single
-- array-bodied POST through untouched. So the SHAPE is asserted, not the name.
select is(
  (select count(*)::int
   from pg_catalog.pg_trigger as trigger
   where not trigger.tgisinternal
     and trigger.tgname in (
       'entries_quota_after_insert',
       'jobs_quota_after_insert',
       'attachments_quota_after_insert',
       'entity_attachments_quota_after_insert'
     )
     and trigger.tgrelid in (
       'public.entries'::regclass,
       'public.jobs'::regclass,
       'public.attachments'::regclass,
       'public.entity_attachments'::regclass
     )
     and (trigger.tgtype & 7) = 4
     and trigger.tgnewtable is not null),
  4,
  'all four are AFTER INSERT statement triggers with a transition table'
);

-- ---------------------------------------------------------------------------
-- Section 2 -- the seed is the signed sheet (2) -- SH-QUOTA-010
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from private.quota_ceilings),
  7,
  'exactly the seven signed ceilings are seeded'
);

-- The values, compared as a set rather than one at a time, so a ceiling that
-- gained a row or lost one fails here rather than in a section that happens to
-- read it.
select is(
  (select array_agg(ceilings.key || '=' || ceilings.value order by ceilings.key)
   from private.quota_ceilings as ceilings),
  array[
    'attachments_per_day=50',
    'attachments_per_entry=5',
    'drain_claims_per_owner_per_tick=5',
    'entries_per_day=300',
    'live_jobs_per_user=50',
    'storage_bytes_per_user=524288000',
    'storage_objects_per_user=200'
  ],
  'PRD sec. 20, amendment P-1, seeded unchanged'
);

-- ---------------------------------------------------------------------------
-- Section 3 -- the reader fails closed (2)
-- ---------------------------------------------------------------------------

select is(
  private.quota_ceiling('entries_per_day'),
  300::bigint,
  'a seeded ceiling reads back'
);

-- A quota system whose broken state is "no limit" is not a quota system.
select is(
  (pg_temp.refusal($$select private.quota_ceiling('a_ceiling_nobody_seeded')$$))[2],
  'QUOTA_CEILING_MISSING',
  'an absent ceiling refuses rather than admitting'
);

-- ---------------------------------------------------------------------------
-- Section 4 -- SH-QUOTA-001, the daily entry ceiling and its exact boundary (7)
-- ---------------------------------------------------------------------------

update private.quota_ceilings set value = 2 where key = 'entries_per_day';

-- Five rows one second before the window opens. Five, not one, so "out-of-window
-- rows do not count" is proven non-vacuously: were the boundary wrong in this
-- direction the ceiling of two would already be blown.
select lives_ok(
  $$insert into public.entries (user_id, original_content, source, status, locale, created_at)
    select 'c1000001-0000-4000-8000-000000000001', 'ontem ' || generation, 'web', 'saved', 'pt-BR',
           private.utc_day_start() - interval '1 second'
    from generate_series(1, 5) as generation$$,
  'SH-RETENTION-009 shape: rows before the UTC day start do not consume the day'
);

-- Equality at the boundary, in the direction that counts: `>=` means a row
-- stamped exactly at the day start is INSIDE the window.
select lives_ok(
  $$insert into public.entries (user_id, original_content, source, status, locale, created_at)
    values ('c1000001-0000-4000-8000-000000000001', 'exatamente na virada', 'web', 'saved', 'pt-BR',
            private.utc_day_start())$$,
  'a row stamped exactly at the UTC day start is admitted'
);

select lives_ok(
  $$insert into public.entries (user_id, original_content, source, status, locale)
    values ('c1000001-0000-4000-8000-000000000001', 'segunda de hoje', 'web', 'saved', 'pt-BR')$$,
  'the second entry of the day is admitted -- the ceiling is two, not one'
);

-- And now the equality assertion pays: the row at the boundary DID count, so
-- this third insert is the one over the line. Had the boundary been exclusive,
-- this would have lived.
select is(
  (pg_temp.refusal(
    $$insert into public.entries (user_id, original_content, source, status, locale)
      values ('c1000001-0000-4000-8000-000000000001', 'terceira de hoje', 'web', 'saved', 'pt-BR')$$
  ))[1],
  'P0001',
  'the entry over the ceiling is refused'
);

select is(
  (pg_temp.refusal(
    $$insert into public.entries (user_id, original_content, source, status, locale)
      values ('c1000001-0000-4000-8000-000000000001', 'quarta de hoje', 'web', 'saved', 'pt-BR')$$
  ))[2],
  'QUOTA_ENTRIES_PER_DAY',
  'SH-QUOTA-009: the refusal carries the declared quota code'
);

select is(
  (select count(*)::int from public.entries
   where user_id = 'c1000001-0000-4000-8000-000000000001'),
  7,
  'no partial write: two refused inserts left exactly the seven admitted rows'
);

select lives_ok(
  $$insert into public.entries (user_id, original_content, source, status, locale)
    values ('c1000002-0000-4000-8000-000000000002', 'entrada do outro dono', 'web', 'saved', 'pt-BR')$$,
  'the ceiling is per owner: B is unaffected by A having exhausted the day'
);

-- ---------------------------------------------------------------------------
-- Section 4b -- one INSERT of many rows is still one ceiling (2)
-- ---------------------------------------------------------------------------
-- The bypass that makes these triggers statement-level rather than row-level: a
-- BEFORE ... FOR EACH ROW trigger cannot see the earlier rows of its own
-- statement, so five rows in one INSERT would each count zero and all five
-- would be admitted at a ceiling of two. This is the assertion that fails if
-- anybody converts them back.

delete from public.entries
where user_id = 'c1000001-0000-4000-8000-000000000001'
  and created_at >= private.utc_day_start();

select is(
  (pg_temp.refusal(
    $$insert into public.entries (user_id, original_content, source, status, locale)
      select 'c1000001-0000-4000-8000-000000000001', 'lote ' || generation, 'web', 'saved', 'pt-BR'
      from generate_series(1, 5) as generation$$
  ))[2],
  'QUOTA_ENTRIES_PER_DAY',
  'five rows in ONE insert are refused at a ceiling of two'
);

select is(
  (select count(*)::int from public.entries
   where user_id = 'c1000001-0000-4000-8000-000000000001'
     and created_at >= private.utc_day_start()),
  0,
  'the refused batch left no partial row behind'
);

update private.quota_ceilings set value = 300 where key = 'entries_per_day';

-- ---------------------------------------------------------------------------
-- Section 5 -- SH-QUOTA-002, the live-job ceiling (5)
-- ---------------------------------------------------------------------------
-- `process_attachment` jobs, because they carry no payload contract and no
-- one-active-per-entry unique index -- the ceiling under test is the count, and
-- borrowing the interpretation type would test two things at once.

update private.quota_ceilings set value = 3 where key = 'live_jobs_per_user';

select lives_ok(
  $$insert into public.jobs (user_id, type, payload, idempotency_key, status)
    select 'c1000001-0000-4000-8000-000000000001', 'process_attachment', '{}'::jsonb,
           'sh6-live-' || generation, 'pending'
    from generate_series(1, 3) as generation$$,
  'three live jobs are admitted'
);

select is(
  (pg_temp.refusal(
    $$insert into public.jobs (user_id, type, payload, idempotency_key)
      values ('c1000001-0000-4000-8000-000000000001', 'process_attachment', '{}'::jsonb, 'sh6-live-over')$$
  ))[2],
  'QUOTA_LIVE_JOBS',
  'the fourth live job is refused with the declared code'
);

-- Terminal rows never count, so a busy owner is bounded by their backlog and
-- not by their history. Proven by moving the three to terminal states and
-- showing the queue opens again.
update public.jobs set status = 'completed'
where user_id = 'c1000001-0000-4000-8000-000000000001' and idempotency_key <> 'sh6-live-3';
update public.jobs set status = 'cancelled'
where user_id = 'c1000001-0000-4000-8000-000000000001' and idempotency_key = 'sh6-live-3';

select lives_ok(
  $$insert into public.jobs (user_id, type, payload, idempotency_key)
    values ('c1000001-0000-4000-8000-000000000001', 'process_attachment', '{}'::jsonb, 'sh6-live-after')$$,
  'completed and cancelled rows do not consume the live ceiling'
);

select is(
  (select count(*)::int from public.jobs
   where user_id = 'c1000001-0000-4000-8000-000000000001'),
  4,
  'no partial write: the refused job left no row behind'
);

select lives_ok(
  $$insert into public.jobs (user_id, type, payload, idempotency_key)
    select 'c1000002-0000-4000-8000-000000000002', 'process_attachment', '{}'::jsonb, 'sh6-live-b-' || generation
    from generate_series(1, 3) as generation$$,
  'the ceiling is per owner: B still has its full queue'
);

update private.quota_ceilings set value = 50 where key = 'live_jobs_per_user';
delete from public.jobs;

-- ---------------------------------------------------------------------------
-- Section 6 -- SH-QUOTA-004/005, storage and attachments (7)
-- ---------------------------------------------------------------------------

update private.quota_ceilings set value = 2 where key = 'storage_objects_per_user';

select lives_ok(
  $$insert into public.attachments (user_id, storage_path, original_name, mime_type, size_bytes)
    select 'c1000001-0000-4000-8000-000000000001',
           'c1000001-0000-4000-8000-000000000001/obj-' || generation,
           'arquivo.txt', 'text/plain', 1024
    from generate_series(1, 2) as generation$$,
  'two objects are admitted at a ceiling of two'
);

select is(
  (pg_temp.refusal(
    $$insert into public.attachments (user_id, storage_path, original_name, mime_type, size_bytes)
      values ('c1000001-0000-4000-8000-000000000001',
              'c1000001-0000-4000-8000-000000000001/obj-3', 'arquivo.txt', 'text/plain', 1024)$$
  ))[2],
  'QUOTA_STORAGE_OBJECTS',
  'the third object is refused with the declared code'
);

update private.quota_ceilings set value = 200 where key = 'storage_objects_per_user';

-- The incoming row's own size is part of the comparison. A ceiling that looked
-- only at what is already stored would let one final upload of any size
-- through, which is the whole of T-23.
update private.quota_ceilings set value = 4096 where key = 'storage_bytes_per_user';

select is(
  (pg_temp.refusal(
    $$insert into public.attachments (user_id, storage_path, original_name, mime_type, size_bytes)
      values ('c1000001-0000-4000-8000-000000000001',
              'c1000001-0000-4000-8000-000000000001/huge', 'grande.bin', 'application/pdf', 4096)$$
  ))[2],
  'QUOTA_STORAGE_BYTES',
  'T-23: the incoming size counts, so 2048 stored plus 4096 incoming is refused'
);

select lives_ok(
  $$insert into public.attachments (user_id, storage_path, original_name, mime_type, size_bytes)
    values ('c1000001-0000-4000-8000-000000000001',
            'c1000001-0000-4000-8000-000000000001/exact', 'cabe.bin', 'application/pdf', 2048)$$,
  'a row that lands exactly on the byte ceiling is admitted -- the boundary is not off by one'
);

update private.quota_ceilings set value = 524288000 where key = 'storage_bytes_per_user';

-- Per-day, measured on the same UTC day start as the entry ceiling.
update private.quota_ceilings set value = 3 where key = 'attachments_per_day';

select is(
  (pg_temp.refusal(
    $$insert into public.attachments (user_id, storage_path, original_name, mime_type, size_bytes)
      values ('c1000001-0000-4000-8000-000000000001',
              'c1000001-0000-4000-8000-000000000001/today-4', 'hoje.txt', 'text/plain', 16)$$
  ))[2],
  'QUOTA_ATTACHMENTS_PER_DAY',
  'the daily attachment ceiling refuses with its own code'
);

update private.quota_ceilings set value = 50 where key = 'attachments_per_day';

-- Attachments per entry. The link is `entity_attachments`, not a column on
-- `attachments`, so the ceiling lives on the relationship.
update private.quota_ceilings set value = 2 where key = 'attachments_per_entry';

select is(
  (pg_temp.refusal(
    $$insert into public.entity_attachments (user_id, attachment_id, entity_type, entity_id)
      select 'c1000001-0000-4000-8000-000000000001', attachment.id, 'entry',
             (select entry.id from public.entries entry
              where entry.user_id = 'c1000001-0000-4000-8000-000000000001'
              order by entry.created_at, entry.id limit 1)
      from public.attachments attachment
      where attachment.user_id = 'c1000001-0000-4000-8000-000000000001'
      order by attachment.storage_path
      limit 3$$
  ))[2],
  'QUOTA_ATTACHMENTS_PER_ENTRY',
  'a third attachment on one entry is refused'
);

select lives_ok(
  $$insert into public.entity_attachments (user_id, attachment_id, entity_type, entity_id)
    select 'c1000001-0000-4000-8000-000000000001', attachment.id, 'entry',
           (select entry.id from public.entries entry
            where entry.user_id = 'c1000001-0000-4000-8000-000000000001'
            order by entry.created_at desc, entry.id desc limit 1)
    from public.attachments attachment
    where attachment.user_id = 'c1000001-0000-4000-8000-000000000001'
    order by attachment.storage_path
    limit 2$$,
  'the ceiling is per entry: a different entry starts from zero'
);

update private.quota_ceilings set value = 5 where key = 'attachments_per_entry';
delete from public.entity_attachments;
delete from public.attachments;

-- ---------------------------------------------------------------------------
-- Section 7 -- SH-QUOTA-003, per-owner drain fairness, two owners (6)
-- ---------------------------------------------------------------------------
-- The fixture is built so that WITHOUT the fairness predicate owner A wins
-- every claim: A's pending jobs carry priority 10 and 9, B's carries 0, and the
-- drain orders by priority first. So "the drain chose B" can only mean it
-- skipped A on purpose.

delete from public.entries;

insert into public.entries (id, user_id, original_content, source, status, locale) values
  ('c1200001-0000-4000-8000-000000000001', 'c1000001-0000-4000-8000-000000000001', 'a1', 'web', 'saved', 'pt-BR'),
  ('c1200002-0000-4000-8000-000000000002', 'c1000001-0000-4000-8000-000000000001', 'a2', 'web', 'saved', 'pt-BR'),
  ('c1200003-0000-4000-8000-000000000003', 'c1000001-0000-4000-8000-000000000001', 'a3', 'web', 'saved', 'pt-BR'),
  ('c1200004-0000-4000-8000-000000000004', 'c1000001-0000-4000-8000-000000000001', 'a4', 'web', 'saved', 'pt-BR'),
  ('c1200005-0000-4000-8000-000000000005', 'c1000002-0000-4000-8000-000000000002', 'b1', 'web', 'saved', 'pt-BR');

insert into public.jobs
  (id, user_id, type, payload, idempotency_key, status, priority, lease_expires_at, locked_by)
values
  -- A's two in-flight claims, under live leases.
  ('c1300001-0000-4000-8000-000000000001', 'c1000001-0000-4000-8000-000000000001', 'interpret_entry',
   '{"entry_id":"c1200001-0000-4000-8000-000000000001","mode":"initial"}'::jsonb,
   'sh6-a-inflight-1', 'running', 5, now() + interval '5 minutes', 'worker-old'),
  ('c1300002-0000-4000-8000-000000000002', 'c1000001-0000-4000-8000-000000000001', 'interpret_entry',
   '{"entry_id":"c1200002-0000-4000-8000-000000000002","mode":"initial"}'::jsonb,
   'sh6-a-inflight-2', 'running', 5, now() + interval '5 minutes', 'worker-old'),
  -- A's waiting work, deliberately the most attractive in the queue.
  ('c1300003-0000-4000-8000-000000000003', 'c1000001-0000-4000-8000-000000000001', 'interpret_entry',
   '{"entry_id":"c1200003-0000-4000-8000-000000000003","mode":"initial"}'::jsonb,
   'sh6-a-pending-1', 'pending', 10, null, null),
  ('c1300004-0000-4000-8000-000000000004', 'c1000001-0000-4000-8000-000000000001', 'interpret_entry',
   '{"entry_id":"c1200004-0000-4000-8000-000000000004","mode":"initial"}'::jsonb,
   'sh6-a-pending-2', 'pending', 9, null, null),
  -- B's single, least attractive job.
  ('c1300005-0000-4000-8000-000000000005', 'c1000002-0000-4000-8000-000000000002', 'interpret_entry',
   '{"entry_id":"c1200005-0000-4000-8000-000000000005","mode":"initial"}'::jsonb,
   'sh6-b-pending-1', 'pending', 0, null, null);

-- The drain is service_role by claim, as everywhere else in this chain.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- The positive control first: BELOW the ceiling, A wins on priority as it
-- should. Without this, section 7 could pass with a predicate that refuses
-- everyone.
update private.quota_ceilings set value = 3 where key = 'drain_claims_per_owner_per_tick';

select is(
  (public.claim_next_entry_interpretation_job('worker-sh6', 60) ->> 'id')::uuid,
  'c1300003-0000-4000-8000-000000000003'::uuid,
  'below the ceiling the drain claims the highest-priority job, which is A''s'
);

-- Now A holds three in flight and the ceiling drops to two.
update private.quota_ceilings set value = 2 where key = 'drain_claims_per_owner_per_tick';

select is(
  (public.claim_next_entry_interpretation_job('worker-sh6', 60) ->> 'user_id')::uuid,
  'c1000002-0000-4000-8000-000000000002'::uuid,
  'SH-QUOTA-003: at the ceiling the drain skips A and B makes progress'
);

select is(
  (select status from public.jobs where id = 'c1300004-0000-4000-8000-000000000004'),
  'pending',
  'A''s remaining work is deferred, not discarded'
);

-- The same ceiling on the direct path. An owner who can walk around it through
-- the direct claim has no ceiling (SH-WORKER-003).
select is(
  public.claim_entry_interpretation_job(
    'c1300004-0000-4000-8000-000000000004',
    'c1000001-0000-4000-8000-000000000001',
    'worker-sh6-direct',
    60
  ),
  null::jsonb,
  'the direct claim path enforces the identical fairness ceiling'
);

-- An expired lease is not in flight. A worker that died must not lock its owner
-- out of their own queue until the reaper runs.
update public.jobs
set lease_expires_at = now() - interval '1 minute'
where user_id = 'c1000001-0000-4000-8000-000000000001' and status = 'running';

select is(
  (public.claim_next_entry_interpretation_job('worker-sh6', 60) ->> 'id')::uuid,
  'c1300004-0000-4000-8000-000000000004'::uuid,
  'an expired lease frees the owner''s share -- a dead worker is not in flight'
);

-- The point of the whole section, stated as the property rather than the steps.
select is(
  (select count(distinct job.user_id)::int
   from public.jobs job
   where job.status = 'running' and job.locked_by = 'worker-sh6'),
  2,
  'both owners made progress in the same drain -- neither occupied all of it'
);

update private.quota_ceilings set value = 5 where key = 'drain_claims_per_owner_per_tick';

-- ---------------------------------------------------------------------------
-- Section 8 -- SH-QUOTA-009, three vocabularies stay three (2)
-- ---------------------------------------------------------------------------

-- The same surface, the same SQLSTATE, two different answers. A caller that
-- reads only the SQLSTATE cannot tell a suspended account from an exhausted
-- quota, which is why the detail is the vocabulary and not the code.
-- The reason and actor vocabularies are the closed sets 202608040070 declares;
-- anything else is refused by the table, not by convention.
update public.account_lifecycle
set status = 'suspended', reason_code = 'operator_suspension', changed_by = 'operator'
where user_id = 'c1000002-0000-4000-8000-000000000002';

select set_config('request.jwt.claims',
  '{"sub":"c1000002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'c1000002-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (pg_temp.refusal(
    $$select public.capture_entry_async('texto qualquer', 'pt-BR', 'web', 'sh6-vocab-key-01')$$
  ))[2],
  'ACCOUNT_LIFECYCLE_NOT_ACTIVE',
  'a suspended owner still gets the lifecycle code, not a quota code'
);

-- And the quota refusal names the class, never the row. The message must not
-- echo the content that was refused.
update public.account_lifecycle
set status = 'active', reason_code = 'operator_reactivation', changed_by = 'operator'
where user_id = 'c1000002-0000-4000-8000-000000000002';
update private.quota_ceilings set value = 1 where key = 'entries_per_day';

select is(
  (pg_temp.refusal(
    $$select public.capture_entry_async('segredo que nao pode vazar', 'pt-BR', 'web', 'sh6-vocab-key-02')$$
  ))[3],
  'Daily entry quota reached',
  'the refusal message names the ceiling and never the content it refused'
);

-- ---------------------------------------------------------------------------
-- Section 9 -- the direct client path meets the identical ceiling (3)
-- ---------------------------------------------------------------------------
-- `authenticated` holds INSERT on both tables -- granted in bulk by
-- 202607160003 and 202607160007 -- so a ceiling enforced only inside the RPC
-- would be a ceiling any client walks around with one POST. The first assertion
-- proves the bypass is REAL rather than hypothetical; without it the two that
-- follow would be guarding a door nobody can reach.
--
-- Written with `throws_ok` rather than the DETAIL helper, because these run
-- under a switched role and `throws_ok` under `set local role authenticated` is
-- the pattern the SH.1 suite already established here.

select is(
  (select count(*)::int
   from unnest(array['public.entries', 'public.jobs']) as relation
   where has_table_privilege('authenticated', relation, 'insert')),
  2,
  'authenticated really can insert into both tables -- the bypass is not hypothetical'
);

set local role authenticated;

select throws_ok(
  $$insert into public.entries (user_id, original_content, source, status, locale)
    values ('c1000002-0000-4000-8000-000000000002', 'direto no postgrest', 'web', 'saved', 'pt-BR')$$,
  'P0001',
  'Daily entry quota reached',
  'a direct PostgREST insert meets the same daily ceiling as the capture RPC'
);

reset role;
update private.quota_ceilings set value = 300 where key = 'entries_per_day';
update private.quota_ceilings set value = 1 where key = 'live_jobs_per_user';
set local role authenticated;

select throws_ok(
  $$insert into public.jobs (user_id, type, payload, idempotency_key)
    values ('c1000002-0000-4000-8000-000000000002', 'process_attachment', '{}'::jsonb, 'sh6-direct-job')$$,
  'P0001',
  'Queued work quota reached',
  'the upload path''s direct job insert meets the same live-job ceiling'
);

reset role;
update private.quota_ceilings set value = 50 where key = 'live_jobs_per_user';

select * from finish();
rollback;
