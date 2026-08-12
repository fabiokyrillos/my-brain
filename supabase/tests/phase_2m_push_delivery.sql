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

select plan(61);

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
   'push-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- `handle_new_user` creates profiles and agent_preferences. Pin the zone and
-- the quiet window to known values so the assertions are exact rather than
-- dependent on whatever the defaults happen to be.
update public.profiles set timezone = 'America/Sao_Paulo'
 where user_id in ('2f4b0001-0000-4000-8000-000000000001', '2f4b0002-0000-4000-8000-000000000002');
update public.agent_preferences
   set quiet_start = '22:30', quiet_end = '07:00', max_followups_per_day = 3
 where user_id in ('2f4b0001-0000-4000-8000-000000000001', '2f4b0002-0000-4000-8000-000000000002');

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
  $$ select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.finish_push_delivery(uuid,text,uuid[])'::regprocedure $$,
  array[true], 'finish_push_delivery has an explicit safe search_path');

-- The two worker functions are service_role's and nobody else's.
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.begin_push_delivery(uuid,text,text)', 'execute') $$,
  array[false], 'authenticated cannot execute begin_push_delivery');
select results_eq(
  $$ select has_function_privilege('service_role', 'public.begin_push_delivery(uuid,text,text)', 'execute') $$,
  array[true], 'service_role can execute begin_push_delivery');
select results_eq(
  $$ select has_function_privilege('authenticated', 'public.finish_push_delivery(uuid,text,uuid[])', 'execute') $$,
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
       'https://push.test/endpoint-a', 'p256dh-a', 'auth-a') $$,
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
       'https://push.test/endpoint-a', 'p256dh-b', 'auth-b') $$,
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

-- Bounded retry: a failure below the ceiling stays `pending`, holding its
-- in-flight slot, so the retry reuses this row instead of inserting a second.
select results_eq(
  $$ select (public.finish_push_delivery(
       (select id from public.notification_deliveries where dedupe_hash = repeat('d', 64)),
       'failed') ->> 'outcome') $$,
  array['pending'],
  'a failure below the retry ceiling stays in flight rather than becoming a second row');

select results_eq(
  $$ select (public.finish_push_delivery(
       (select id from public.notification_deliveries where dedupe_hash = repeat('d', 64)),
       'delivered') ->> 'outcome') $$,
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

reset role;
select * from finish();
rollback;
