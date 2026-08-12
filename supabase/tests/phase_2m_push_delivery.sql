-- Phase 2M slice 2M.4b -- push consent, subscription and content-free delivery
-- (migration 202608120092).
--
-- This suite proves the properties the *application* cannot prove about itself:
-- the posture of the three new tables, the fail-closed direction of every
-- validated function, the six governance controls applied ON THE SERVER, and
-- the two claims the phase's threat model treats as load-bearing -- that a
-- foreign subscription is not observable (T-01) and that a revoked consent
-- cannot be delivered against (T-09).
--
-- Every behavioural section carries a POSITIVE CONTROL as well as the refusal,
-- because this repository has recorded six probe-side defects in a single
-- phase: a suite where the permitted case never succeeds is a suite that would
-- pass against a function that refuses everything.
--
-- Role discipline in this file: table fixtures are written as the superuser
-- (which bypasses even FORCED row-level security), every SCOPE claim is made
-- from a real `authenticated` session, and the sender's functions are called
-- under `service_role`. A scope assertion made with an elevated role would be
-- measuring the role, not the policy.

begin;

select plan(90);

-- Fixtures -------------------------------------------------------------------
--
-- Two owners. Hex-only UUIDs: `2m4b…` is not a UUID, and a fixture that cannot
-- be cast is a suite that fails for a reason unrelated to what it tests.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2f4b0001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'push-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('2f4b0002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'push-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  -- Owner C exists for section 8 alone, so the retirement sequence runs from a
  -- clean state rather than unpicking the state sections 4-7 deliberately built.
  ('2f4b0003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'push-owner-c@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- `handle_new_user` creates profiles and agent_preferences. Pin the zone and
-- the quiet window to known values so the assertions are exact rather than
-- dependent on whatever the defaults happen to be.
update public.profiles set timezone = 'America/Sao_Paulo'
 where user_id in ('2f4b0001-0000-4000-8000-000000000001', '2f4b0002-0000-4000-8000-000000000002',
                   '2f4b0003-0000-4000-8000-000000000003');
update public.agent_preferences
   set quiet_start = '22:30', quiet_end = '07:00', max_followups_per_day = 3
 where user_id in ('2f4b0001-0000-4000-8000-000000000001', '2f4b0002-0000-4000-8000-000000000002');
-- Owner C's window is start = end, which the predicate defines as NEVER quiet.
-- A narrow window would leave section 8 with a one-in-1440 chance of a red run,
-- and a flake in this repository is a defect rather than weather.
update public.agent_preferences
   set quiet_start = '03:00', quiet_end = '03:00', max_followups_per_day = 5
 where user_id = '2f4b0003-0000-4000-8000-000000000003';

-- 1. Structure and posture ---------------------------------------------------

select has_table('public', 'notification_consents', 'the consent record has a table');
select has_table('public', 'push_subscriptions', 'the subscription has a table');
select has_table('public', 'notification_deliveries', 'the content-free delivery audit has a table');

select results_eq(
  $$ select count(*)::int from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('notification_consents', 'push_subscriptions', 'notification_deliveries')
        and relrowsecurity and relforcerowsecurity $$,
  array[3],
  'all three tables have RLS enabled AND forced'
);

-- R-13/R-17, asserted against the catalogue rather than against the migration
-- text: a content column added by a later migration would still fail this.
select results_eq(
  $$ select count(*)::int from information_schema.columns
      where table_schema = 'public'
        and table_name in ('notification_consents', 'push_subscriptions', 'notification_deliveries')
        and column_name in ('title','body','description','name','text','message',
                            'content','payload','properties','metadata','data') $$,
  array[0],
  'no content-bearing column exists on any of the three tables'
);

select results_eq(
  $$ select count(*)::int from pg_policies
      where schemaname = 'public'
        and tablename in ('notification_consents','push_subscriptions','notification_deliveries')
        and cmd <> 'SELECT' $$,
  array[0],
  'authenticated has no direct write policy on any of the three tables'
);

select results_eq(
  $$ select count(*)::int from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('notification_consents','push_subscriptions','notification_deliveries')
        and grantee = 'authenticated' and privilege_type <> 'SELECT' $$,
  array[0],
  'authenticated holds SELECT and nothing else on the three tables'
);

select results_eq(
  $$ select prosecdef from pg_proc where oid = 'public.register_push_subscription(text,text,text)'::regprocedure $$,
  array[true], 'register_push_subscription is security definer');
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.register_push_subscription(text,text,text)'::regprocedure $$,
  array[true], 'register_push_subscription has an explicit safe search_path');
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.revoke_push_consent()'::regprocedure $$,
  array[true], 'revoke_push_consent has an explicit safe search_path');
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.begin_push_delivery(uuid,text,text)'::regprocedure $$,
  array[true], 'begin_push_delivery has an explicit safe search_path');
select results_eq(
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.finish_push_delivery(uuid,text,uuid[],uuid[])'::regprocedure $$,
  array[true], 'finish_push_delivery has an explicit safe search_path');

-- The two worker functions are service_role's and nobody else's.
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.begin_push_delivery(uuid,text,text)', 'execute') $$,
  array[false], 'authenticated cannot execute begin_push_delivery');
select results_eq(
  $$ select has_function_privilege('service_role', 'public.begin_push_delivery(uuid,text,text)', 'execute') $$,
  array[true], 'service_role can execute begin_push_delivery');
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.finish_push_delivery(uuid,text,uuid[],uuid[])', 'execute') $$,
  array[false], 'authenticated cannot execute finish_push_delivery');

select results_eq(
  $$ select has_function_privilege('authenticated', 'public.register_push_subscription(text,text,text)', 'execute') $$,
  array[true], 'authenticated can register its own subscription');
select results_eq(
  $$ select has_function_privilege('anon', 'public.register_push_subscription(text,text,text)', 'execute') $$,
  array[false], 'anon cannot register a subscription');

-- Retention: the window is the signed one, and the sweep is armed by nobody.
select results_eq(
  $$ select days from private.retention_windows where key = 'notification_deliveries' $$,
  array[90],
  'the delivery audit reuses the signed 90-day window rather than minting a value'
);
select results_eq(
  $$ select count(*)::int from (values ('authenticated'),('anon'),('service_role')) as r(role)
      where has_function_privilege(r.role, 'private.prune_notification_deliveries(integer)', 'execute') $$,
  array[0],
  'the retention sweep is executable by no role -- scheduling is authorization'
);

-- 2. The dedupe_hash column cannot hold content ------------------------------

select throws_ok(
  $$ insert into public.notification_deliveries
       (user_id, channel, notification_type, dedupe_hash, outcome)
     values ('2f4b0001-0000-4000-8000-000000000001', 'push', 'reminder',
             'Comprar remedio para a consulta de quinta', 'pending') $$,
  '23514',
  null,
  'a title cannot be written into dedupe_hash -- the CHECK admits only a digest'
);

-- The positive control for the same CHECK. Without it the assertion above
-- would also pass against a column that refuses everything.
select lives_ok(
  $$ insert into public.notification_deliveries
       (user_id, channel, notification_type, dedupe_hash, outcome)
     values ('2f4b0001-0000-4000-8000-000000000001', 'push', 'reminder',
             repeat('a', 64), 'pending') $$,
  'a real 64-character digest is accepted'
);

-- A reason belongs to a suppression and to nothing else: without this, a
-- delivered row could carry `quiet_hours` and the ledger would report a
-- refusal that never happened.
select throws_ok(
  $$ update public.notification_deliveries set suppression_reason = 'quiet_hours'
      where dedupe_hash = repeat('a', 64) $$,
  '23514',
  null,
  'a non-suppressed row cannot carry a suppression reason'
);
delete from public.notification_deliveries where dedupe_hash = repeat('a', 64);

-- 3. Quiet hours: the predicate wraps midnight -------------------------------
--
-- 22:30-07:00 is the realistic configuration and the one the heartbeat ships
-- as its default. A naive `start <= now < end` reports the middle of the night
-- as loud, so each boundary is asserted individually.

select results_eq(
  $$ select private.push_within_quiet_hours('23:00'::time, '22:30'::time, '07:00'::time) $$,
  array[true], 'a wrapping window is quiet before midnight');
select results_eq(
  $$ select private.push_within_quiet_hours('03:00'::time, '22:30'::time, '07:00'::time) $$,
  array[true], 'a wrapping window is quiet after midnight');
select results_eq(
  $$ select private.push_within_quiet_hours('12:00'::time, '22:30'::time, '07:00'::time) $$,
  array[false], 'the middle of the afternoon is not quiet');
select results_eq(
  $$ select private.push_within_quiet_hours('22:30'::time, '22:30'::time, '07:00'::time) $$,
  array[true], 'the window is inclusive at its start');
select results_eq(
  $$ select private.push_within_quiet_hours('07:00'::time, '22:30'::time, '07:00'::time) $$,
  array[false], 'the window is exclusive at its end');
select results_eq(
  $$ select private.push_within_quiet_hours('12:00'::time, '09:00'::time, '17:00'::time) $$,
  array[true], 'a non-wrapping window still works');
select results_eq(
  $$ select private.push_within_quiet_hours('12:00'::time, null, '07:00'::time) $$,
  array[false],
  'an unreadable window is NOT quiet -- refusing everything would silence a user who never asked for silence');

-- `2M-NOTIFY-005`'s parity claim rests on this: the push predicate and the
-- heartbeat's inline one are the same function of the same inputs. Asserted by
-- EVALUATING the heartbeat's expression beside it at every quarter hour, rather
-- than by reading the source and agreeing with it.
select results_eq(
  $$ select bool_and(
       private.push_within_quiet_hours(g.ts::time, '22:30'::time, '07:00'::time)
       = (case when '22:30'::time < '07:00'::time
               then g.ts::time >= '22:30'::time and g.ts::time < '07:00'::time
               else g.ts::time >= '22:30'::time or g.ts::time < '07:00'::time end))
     from generate_series(timestamp '2026-01-01 00:00', timestamp '2026-01-01 23:45',
                          interval '15 min') as g(ts) $$,
  array[true],
  'the push predicate agrees with the heartbeat''s inline predicate at every quarter hour'
);

-- 4. The user-facing writes are fail-closed ----------------------------------

select set_config('request.jwt.claims',
  '{"sub":"2f4b0001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select throws_ok(
  $$ select public.register_push_subscription('', 'key', 'auth') $$,
  '22023', null, 'an empty endpoint is refused');
select throws_ok(
  $$ select public.register_push_subscription('http://evil.test/x', 'key', 'auth') $$,
  '22023', null, 'a non-https endpoint is refused');
select throws_ok(
  $$ select public.register_push_subscription('https://push.test/a', null, 'auth') $$,
  '22023', null, 'a missing key is refused');

-- A refusal leaves NO partial state: the claim the brief names by name.
select results_eq(
  $$ select count(*)::int from public.notification_consents $$,
  array[0],
  'three refused registrations wrote no consent row -- no partial write'
);
select results_eq(
  $$ select count(*)::int from public.push_subscriptions $$,
  array[0],
  'three refused registrations wrote no subscription row'
);

-- A client may not assert its own consent.
select throws_ok(
  $$ select public.record_push_consent_state('granted') $$,
  '22023', null,
  'a client cannot claim `granted` -- consent is concluded from a real subscription');
select throws_ok(
  $$ select public.record_push_consent_state('nonsense') $$,
  '22023', null, 'an unknown consent state is refused');

-- The positive control: the real path works.
select lives_ok(
  $$ select public.register_push_subscription(
       'https://push.test/endpoint-a', 'p256dh-owner-a-0123456789', 'auth-secret-a-01') $$,
  'a complete https registration succeeds');

select results_eq(
  $$ select state from public.notification_consents where channel = 'push' $$,
  array['granted'],
  'a real registration concludes consent `granted`');

select results_eq(
  $$ select recorded_at is not null from public.notification_consents where channel = 'push' $$,
  array[true],
  '2M-NOTIFY-001: the consent carries a recorded time');

-- Preferences reach the columns that already own them.
select lives_ok(
  $$ select public.update_notification_preferences(
       array['reminder','review']::text[], 'immediate', '23:00'::time, '06:00'::time, 2::smallint) $$,
  'preferences are accepted');
select results_eq(
  $$ select quiet_start::text || '|' || quiet_end::text || '|' || max_followups_per_day::text
       from public.agent_preferences where user_id = '2f4b0001-0000-4000-8000-000000000001' $$,
  array['23:00:00|06:00:00|2'],
  'quiet hours and the cap were written to agent_preferences -- the columns the heartbeat already reads');
select throws_ok(
  $$ select public.update_notification_preferences(
       array['recurrence']::text[], 'immediate', '23:00'::time, '06:00'::time, 2::smallint) $$,
  '22023', null, 'an undeclared notification type is refused');
select throws_ok(
  $$ select public.update_notification_preferences(
       array['reminder']::text[], 'immediate', '23:00'::time, '06:00'::time, 99::smallint) $$,
  '22023', null, 'a cap beyond the existing column bound is refused');

-- 5. A foreign subscription is not observable (T-01) -------------------------

select set_config('request.jwt.claims',
  '{"sub":"2f4b0002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0002-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$ select count(*)::int from public.push_subscriptions $$,
  array[0],
  'owner B sees zero subscriptions while A has one -- proved from B''s session, not by a global count');
select results_eq(
  $$ select count(*)::int from public.notification_consents $$,
  array[0],
  'owner B sees no consent record belonging to A');

-- B registering the SAME endpoint gets its own row and does not disturb A's:
-- the owner-scoped unique is what makes that true rather than an error that
-- would itself reveal A's row.
select lives_ok(
  $$ select public.register_push_subscription(
       'https://push.test/endpoint-a', 'p256dh-owner-b-0123456789', 'auth-secret-b-01') $$,
  'a second owner may register the same browser endpoint without an error that would reveal A');
select results_eq(
  $$ select count(*)::int from public.push_subscriptions $$,
  array[1],
  'and still sees exactly its own row');

-- 6. The six controls, on the server, before sending -------------------------

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

-- `type_muted`: A enabled only reminder and review above.
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'digest', repeat('b', 64)) ->> 'reason') $$,
  array['type_muted'],
  'a muted type is refused, and the reason names the control');

-- `quiet_hours` is proved by moving the WINDOW rather than the clock: the
-- alternative is a test that only passes at certain times of day. `24:00:00` is
-- a real `time` value and makes the window total, so the assertion holds in
-- every minute of the day rather than in most of them.
reset role;
update public.agent_preferences set quiet_start = '00:00', quiet_end = '24:00'
 where user_id = '2f4b0001-0000-4000-8000-000000000001';
set local role service_role;
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'reminder', repeat('c', 64)) ->> 'reason') $$,
  array['quiet_hours'],
  'quiet hours refuse the delivery, and the reason names the control');

-- A window whose start EQUALS its end is never quiet, by the predicate's own
-- rule. That makes the positive control deterministic in every minute of the
-- day: a narrow window would leave a one-in-1440 chance of a red CI run, and a
-- flake in this repository is treated as a defect rather than as weather.
reset role;
update public.agent_preferences set quiet_start = '03:00', quiet_end = '03:00'
 where user_id = '2f4b0001-0000-4000-8000-000000000001';
set local role service_role;

-- The positive control. Without this the refusals above prove nothing.
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'reminder', repeat('d', 64)) -> 'permitted')::text $$,
  array['true'],
  'a permitted delivery really is permitted -- the non-vacuity control');

-- `duplicate`: the same item again, while the first is still IN FLIGHT. A retry
-- cannot walk around this, because the refusal is backed by a unique index
-- rather than by a read-then-write check two workers could interleave.
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'reminder', repeat('d', 64)) ->> 'reason') $$,
  array['duplicate'],
  'deduplication refuses the same item while one is in flight');

-- The delivery's id is PINNED by the superuser, for the reason section 8 states
-- at length: `service_role` is not asserted anywhere to hold `SELECT` on these
-- tables, and a sub-select here would smuggle one into a `service_role` block.
-- This repository has already been caught by that assumption once, on
-- `product_events`.
reset role;
update public.notification_deliveries set id = '2f4b0001-0000-4000-8000-0000000000d0'
 where user_id = '2f4b0001-0000-4000-8000-000000000001' and dedupe_hash = repeat('d', 64) and outcome = 'pending';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

-- Bounded retry: a failure below the ceiling stays `pending`, holding its
-- in-flight slot, so the retry reuses this row instead of inserting a second.
select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0001-0000-4000-8000-0000000000d0', 'failed') ->> 'outcome') $$,
  array['pending'],
  'a failure below the retry ceiling stays in flight rather than becoming a second row');

select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0001-0000-4000-8000-0000000000d0', 'delivered') ->> 'outcome') $$,
  array['delivered'],
  'a delivered result is recorded as delivered');

-- `cooldown`: the same item once more, now that nothing is in flight but it was
-- delivered moments ago. This is the control an earlier draft made unreachable
-- by letting a delivered row count as a duplicate.
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'reminder', repeat('d', 64)) ->> 'reason') $$,
  array['cooldown'],
  'the 24-hour per-item cooldown refuses a re-delivery, distinctly from duplicate');

-- `daily_cap`: one delivery has happened today, and the ceiling is now zero.
-- `>=` rather than `>` is what makes a cap of three refuse the fourth.
reset role;
update public.agent_preferences set max_followups_per_day = 0
 where user_id = '2f4b0001-0000-4000-8000-000000000001';
set local role service_role;
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'review', repeat('9', 64)) ->> 'reason') $$,
  array['daily_cap'],
  'the daily cap refuses the delivery, and the reason names the control');

-- `not_consented`: revocation takes effect immediately (T-09).
reset role;
select set_config('request.jwt.claims',
  '{"sub":"2f4b0001-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0001-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok($$ select public.revoke_push_consent() $$, 'revocation succeeds in one step');
select results_eq(
  $$ select count(*)::int from public.push_subscriptions where state = 'active' $$,
  array[0],
  'revocation marked the subscription too -- not just the consent (T-09)');
select lives_ok($$ select public.revoke_push_consent() $$, 'revoking twice is not an error');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'reminder', repeat('e', 64)) ->> 'reason') $$,
  array['not_consented'],
  'after revocation nothing may be delivered, and the reason names the control');

-- 7. The worker functions refuse a non-service caller ------------------------

reset role;
select set_config('request.jwt.claims',
  '{"sub":"2f4b0002-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select throws_ok(
  $$ select public.begin_push_delivery(
       '2f4b0001-0000-4000-8000-000000000001', 'reminder', repeat('f', 64)) $$,
  '42501', null,
  'an authenticated caller cannot drive the sender against another user');

-- 8. Retirement, the two retry ceilings, and the states in between -----------
--
-- Everything below is owner C's, from a clean start. Sections 4-7 proved the
-- controls that REFUSE; this proves what happens to a subscription and a consent
-- once delivery has been permitted and then goes wrong -- which is where
-- `2M-NOTIFY-010`'s "no failure is retried indefinitely" actually lives.
--
-- ROLE DISCIPLINE, and it is not decoration.
--
-- `service_role` is NOT assumed to hold `SELECT` on these tables. This
-- repository has already been caught by that assumption once -- `product_events`
-- is unreadable to `service_role`, and a probe that read it globally proved
-- nothing. So below, `service_role` CALLS the two worker functions and reads
-- nothing; every raw table read is made either from the owner's own
-- `authenticated` session (where it is a scope claim and must be) or with the
-- role reset (where it is a state claim and the role is irrelevant). Row ids the
-- worker calls need are pinned to literals by the superuser first, so no
-- assertion smuggles a `SELECT` into a `service_role` block.

reset role;
select set_config('request.jwt.claims',
  '{"sub":"2f4b0003-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0003-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- The endpoint is a URL the SERVER will later POST to. An endpoint that
-- resolves inside the deployment is a request-forgery primitive with a user id
-- attached, and `https` alone does not refuse one.
select throws_ok(
  $$ select public.register_push_subscription('https://127.0.0.1/push', 'p256dh-owner-c-0123456789', 'auth-secret-c-01') $$,
  '22023', null, 'a loopback endpoint is refused even though it is https');
select throws_ok(
  $$ select public.register_push_subscription('https://localhost/push', 'p256dh-owner-c-0123456789', 'auth-secret-c-01') $$,
  '22023', null, 'a dotless internal hostname is refused');
select throws_ok(
  $$ select public.register_push_subscription('https://10.0.0.5/push', 'p256dh-owner-c-0123456789', 'auth-secret-c-01') $$,
  '22023', null, 'a private-range endpoint is refused');
-- The trap the naive check would miss: an authority that STARTS with a
-- legitimate-looking host and still resolves to loopback.
select throws_ok(
  $$ select public.register_push_subscription('https://push.test@127.0.0.1/x', 'p256dh-owner-c-0123456789', 'auth-secret-c-01') $$,
  '22023', null, 'a userinfo prefix cannot smuggle a loopback host past the check');

-- `2M-NOTIFY-002`: absence of a consent record refuses, with no row required to
-- say so. Asserted BEFORE C registers anything, which is the only moment this
-- state exists.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0003-0000-4000-8000-000000000003', 'reminder', repeat('1', 64)) ->> 'reason') $$,
  array['not_consented'],
  'a user with NO consent record at all is refused -- absence is not permission');

reset role;
select results_eq(
  $$ select count(*)::int from public.notification_deliveries
      where user_id = '2f4b0003-0000-4000-8000-000000000003' and outcome <> 'suppressed' $$,
  array[0],
  'the refusal wrote a suppression row and nothing else -- no partial delivery state');

-- The preference write CREATES the row when there is none.
--
-- A bare UPDATE matching nothing succeeds silently, and the function would have
-- returned success having discarded the quiet hours the user just set -- the
-- "sets quiet hours once and is still pushed at 03:00" failure arriving through
-- the back door of the reuse that was supposed to prevent it.
reset role;
delete from public.agent_preferences where user_id = '2f4b0003-0000-4000-8000-000000000003';
select set_config('request.jwt.claims',
  '{"sub":"2f4b0003-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0003-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok(
  $$ select public.update_notification_preferences(
       array['reminder','follow_up','review','digest']::text[], 'immediate',
       '03:00'::time, '03:00'::time, 5::smallint) $$,
  'preferences are accepted for a user with no agent_preferences row');
select results_eq(
  $$ select quiet_start::text || '|' || quiet_end::text || '|' || max_followups_per_day::text
       from public.agent_preferences where user_id = '2f4b0003-0000-4000-8000-000000000003' $$,
  array['03:00:00|03:00:00|5'],
  'the quiet hours really persisted rather than being silently discarded');

-- Setting a preference must never be a way to reach `granted`.
select results_eq(
  $$ select state from public.notification_consents
      where user_id = '2f4b0003-0000-4000-8000-000000000003' and channel = 'push' $$,
  array['unsupported'],
  'editing preferences created an `unsupported` consent, never a `granted` one');

-- A granted consent with NO LIVE DEVICE is not a deliverable consent.
select lives_ok(
  $$ select public.register_push_subscription(
       'https://push.test/endpoint-c', 'p256dh-owner-c-0123456789', 'auth-secret-c-01') $$,
  'owner C registers a real subscription');
reset role;
update public.push_subscriptions set state = 'revoked'
 where user_id = '2f4b0003-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0003-0000-4000-8000-000000000003', 'reminder', repeat('2', 64)) ->> 'reason') $$,
  array['not_consented'],
  'a granted consent with no ACTIVE device is refused rather than permitted with an empty send list');

-- Back to a real, deliverable state, and then the per-device ceiling.
--
-- The subscription's id is PINNED to a literal here, by the superuser. Every
-- `finish_push_delivery` call below then names it directly instead of looking it
-- up, which is what keeps the `service_role` blocks free of any `SELECT` on a
-- table `service_role` is not asserted to be able to read.
reset role;
update public.push_subscriptions
   set state = 'active', id = '2f4b0003-0000-4000-8000-0000000000c1'
 where user_id = '2f4b0003-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0003-0000-4000-8000-000000000003', 'reminder', repeat('3', 64)) -> 'permitted')::text $$,
  array['true'],
  'owner C can be delivered to -- the positive control section 8 rests on');

-- The permitted result carries the subscription the sender must POST to, and
-- carries it as identity plus keys and nothing else.
select results_eq(
  $$ select jsonb_array_length(
       public.begin_push_delivery(
         '2f4b0003-0000-4000-8000-000000000003', 'digest', repeat('4', 64)) -> 'subscriptions') $$,
  array[1],
  'the permitted result hands the sender exactly the one active subscription');

-- Pin the in-flight delivery's id too, for the same reason.
reset role;
update public.notification_deliveries set id = '2f4b0003-0000-4000-8000-0000000000d1'
 where user_id = '2f4b0003-0000-4000-8000-000000000003' and dedupe_hash = repeat('3', 64) and outcome = 'pending';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

-- THE TWO CEILINGS, exercised together on the `3` delivery.
--
-- Each `finish(..., 'failed', ...)` costs the DELIVERY one attempt and the
-- DEVICE one strike. The third of each retires its own subject, and neither
-- ceiling can be outrun because both columns carry a CHECK.
select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0003-0000-4000-8000-0000000000d1', 'failed', '{}'::uuid[],
       array['2f4b0003-0000-4000-8000-0000000000c1']::uuid[]) ->> 'outcome') $$,
  array['pending'],
  'the first device failure leaves the delivery in flight');

reset role;
select results_eq(
  $$ select failure_count::int from public.push_subscriptions
      where id = '2f4b0003-0000-4000-8000-0000000000c1' $$,
  array[1],
  'and the device carries one strike -- failure_count has a writer, not just a CHECK');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0003-0000-4000-8000-0000000000d1', 'failed', '{}'::uuid[],
       array['2f4b0003-0000-4000-8000-0000000000c1']::uuid[]) ->> 'outcome') $$,
  array['pending'],
  'the second failure is still in flight, holding its dedupe slot');

-- Deduplication is not walked around by a retry: while the delivery is still
-- `pending`, the same item asks again and is refused by the unique index rather
-- than by a read-then-write check two workers could interleave.
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0003-0000-4000-8000-000000000003', 'reminder', repeat('3', 64)) ->> 'reason') $$,
  array['duplicate'],
  'a retry cannot walk around deduplication while the first is still in flight');

select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0003-0000-4000-8000-0000000000d1', 'failed', '{}'::uuid[],
       array['2f4b0003-0000-4000-8000-0000000000c1']::uuid[]) ->> 'outcome') $$,
  array['retired'],
  'the THIRD delivery failure retires it -- no failure is retried indefinitely');

-- A stale worker must not overwrite newer work.
select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0003-0000-4000-8000-0000000000d1', 'delivered') -> 'changed')::text $$,
  array['false'],
  'a finished delivery is never re-finished -- a late worker changes nothing');

reset role;
select results_eq(
  $$ select state || '|' || failure_count::text from public.push_subscriptions
      where id = '2f4b0003-0000-4000-8000-0000000000c1' $$,
  array['expired|3'],
  'and the third device strike retires the DEVICE -- the ceiling a sibling delivery cannot reset');

-- The consent follows the last device out, and `2M-NOTIFY-010` gives that state
-- a name the surface can render rather than leaving a granted consent that can
-- never deliver.
select results_eq(
  $$ select state from public.notification_consents
      where user_id = '2f4b0003-0000-4000-8000-000000000003' and channel = 'push' $$,
  array['expired'],
  'the consent expires with the last device rather than staying granted forever');

select results_eq(
  $$ select outcome from public.notification_deliveries
      where id = '2f4b0003-0000-4000-8000-0000000000d1' $$,
  array['retired'],
  'and the retired outcome really is unchanged, not merely reported unchanged');

-- 9. A gone subscription is retired rather than retried ----------------------
--
-- A 404/410 from the push service means the browser threw the subscription
-- away. That is a different fact from a failure, and it retires IMMEDIATELY
-- rather than after three strikes: retrying a subscription the browser has
-- discarded cannot ever succeed.

reset role;
select set_config('request.jwt.claims',
  '{"sub":"2f4b0003-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0003-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
-- Re-registering revives the lapsed device and clears its strikes: this is the
-- user pressing the control again, the one action that should clear a lapse.
select lives_ok(
  $$ select public.register_push_subscription(
       'https://push.test/endpoint-c', 'p256dh-owner-c-9876543210', 'auth-secret-c-02') $$,
  're-registering revives an expired subscription');
select results_eq(
  $$ select state || '|' || failure_count::text from public.push_subscriptions
      where user_id = '2f4b0003-0000-4000-8000-000000000003' $$,
  array['active|0'],
  'and it comes back active with its strikes cleared');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select results_eq(
  $$ select (public.begin_push_delivery(
       '2f4b0003-0000-4000-8000-000000000003', 'review', repeat('5', 64)) -> 'permitted')::text $$,
  array['true'],
  'the revived device can be delivered to again');

reset role;
update public.notification_deliveries set id = '2f4b0003-0000-4000-8000-0000000000d2'
 where user_id = '2f4b0003-0000-4000-8000-000000000003' and dedupe_hash = repeat('5', 64) and outcome = 'pending';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select results_eq(
  $$ select (public.finish_push_delivery(
       '2f4b0003-0000-4000-8000-0000000000d2', 'failed',
       array['2f4b0003-0000-4000-8000-0000000000c1']::uuid[]) ->> 'outcome') $$,
  array['pending'],
  'a gone report on the first attempt leaves the delivery itself in flight');

reset role;
select results_eq(
  $$ select state || '|' || failure_count::text from public.push_subscriptions
      where id = '2f4b0003-0000-4000-8000-0000000000c1' $$,
  array['expired|0'],
  'but the GONE subscription is retired at once, with no strikes needed');

-- 10. The client-reportable states, and their positive control ---------------

reset role;
select set_config('request.jwt.claims',
  '{"sub":"2f4b0003-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '2f4b0003-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select lives_ok(
  $$ select public.record_push_consent_state('denied') $$,
  'a browser-observed `denied` is recorded');
select results_eq(
  $$ select state from public.notification_consents
      where user_id = '2f4b0003-0000-4000-8000-000000000003' and channel = 'push' $$,
  array['denied'],
  'and the consent really carries it -- the positive control for the three refusals above');

reset role;
select * from finish();
rollback;
