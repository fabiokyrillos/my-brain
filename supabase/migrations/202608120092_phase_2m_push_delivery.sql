-- Phase 2M, slice 2M.4b -- the third and last allocated migration of Phase 2M.
--
-- ============================================================================
-- WHY THIS MIGRATION EXISTS, AND WHY IT IS THIS SMALL
-- ============================================================================
--
-- OD-2M-4 was signed as option B (ADR-105, decision 4): push, opt-in,
-- content-free. `2M-NOTIFY-011` names what delivery must do, and slice 2M.4a
-- shipped the rules -- `consent-contract.ts`, `governance.ts`, `payload.ts` --
-- with no table behind them. This migration is the persistence those rules
-- decide over, and nothing else.
--
-- The plan's migration budget is THREE, NON-TRANSFERABLE. The telemetry
-- vocabulary and the `calendar` surface were spent as `202608110090`;
-- `clear_planned` was spent as `202608110091`. This is the last one, and
-- R-13 makes a fourth a stop condition.
--
-- ---------------------------------------------------------------------------
-- What was RE-AUDITED before a single column was written
-- ---------------------------------------------------------------------------
--
-- The brief requires proof that no authorized obligation can be met by an
-- existing path. Four of the eleven can, and are therefore NOT here:
--
--   * QUIET HOURS already have persistent authority in
--     `agent_preferences.quiet_start` / `.quiet_end` (`202607160007:2-3`),
--     read by `run_user_heartbeat_unbounded` (`202607160007:228-240`) with a
--     wrap-around predicate. A second quiet-hours column would be a second
--     source of truth for the same user promise, and the failure mode is
--     concrete: a user sets quiet hours once and gets pushed at 03:00 because
--     the other copy was never written. Push READS THE SAME COLUMNS.
--
--   * THE DAILY CAP already lives in `agent_preferences.max_followups_per_day`
--     (`202607160007:5`, smallint 0..20), read by `run_user_heartbeat`
--     (`202607160013:19`). Same argument, same reuse.
--
--   * THE USER'S TIMEZONE is `profiles.timezone`, already the input to every
--     local-day boundary in the product (`2M-TIME-003`).
--
--   * THE DELIVERY JOB needs no schema at all: `public.jobs.type` carries NO
--     CHECK constraint (`202607160007:132`), so a `deliver_push` job is data in
--     an existing table with an existing lease, an existing bounded retry and
--     an existing reaper.
--
-- What genuinely has no existing home, and is therefore what this migration
-- models:
--
--   1. the consent RECORD and its five states           -> notification_consents
--   2. the per-type mute list and the frequency         -> notification_consents
--   3. the browser subscription and its owner           -> push_subscriptions
--   4. a CONTENT-FREE per-channel delivery/audit row    -> notification_deliveries
--      (`public.notifications` cannot serve: it carries `title` and `body`,
--       which is exactly the content `2M-NOTIFY-009` forbids recording, and it
--       is the in-app surface `2M-NOTIFY-008` requires left untouched)
--   5. dedupe and the 24h per-item cooldown ON THIS CHANNEL
--   6. revocation, retirement and bounded retry
--   7. RLS, grants, fail-closed functions and retention over all of the above
--
-- ---------------------------------------------------------------------------
-- What this migration MAY NOT contain, and does not
-- ---------------------------------------------------------------------------
--
-- No task title, description, person, project, entry text, user-supplied
-- notification text or free-form payload column (R-13, R-17). The prohibition
-- is STRUCTURAL rather than customary: the only column in the whole migration
-- that carries a caller-chosen value is `notification_deliveries.dedupe_hash`,
-- and a CHECK restricts it to exactly 64 lowercase hex characters. A column
-- that can hold nothing but a SHA-256 digest cannot hold a title.
--
-- It also carries nothing belonging to another allocation: no telemetry
-- vocabulary (that was migration 1, and the two events this slice produces are
-- ALREADY admitted by it -- `notification_consent_changed` and
-- `notification_suppressed`, `202608110090:290-293`), no `clear_planned`
-- (migration 2), and no schedule. Per ADR-082 and this repository's recorded
-- rule that SCHEDULING IS AUTHORIZATION, the retention sweep below is defined
-- and granted to NO role; arming it is an operator action, not a migration's.

-- ============================================================================
-- 1. CONSENT
-- ============================================================================

create table public.notification_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- One channel today. A closed set rather than free text, for the same reason
  -- the deployed telemetry validator admits exactly `'push'`: widening it later
  -- must be a visible decision, not a value somebody inserted.
  channel text not null check (channel in ('push')),
  -- `2M-NOTIFY-010`'s five distinguishable states. `unsupported` is the state
  -- an absent record resolves to in `consent-contract.ts`, so a row in this
  -- table is never REQUIRED for correctness -- absence already means no
  -- delivery (`2M-NOTIFY-002`).
  state text not null check (state in ('granted', 'denied', 'unsupported', 'revoked', 'expired')),
  -- `2M-NOTIFY-001`: "a recorded time".
  recorded_at timestamptz not null default now(),
  -- The types the user has NOT muted. An empty array is a valid, meaningful
  -- choice ("none of them"), which is why there is no NOT NULL default of the
  -- full set: defaulting to everything would be a default-on by another name.
  enabled_types text[] not null default '{}'::text[]
    check (enabled_types <@ array['reminder', 'follow_up', 'review', 'digest']::text[]),
  frequency text not null default 'off' check (frequency in ('immediate', 'daily_digest', 'off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel)
);

comment on table public.notification_consents is
  '2M-NOTIFY-001/-002/-004. The consent record `consent-contract.ts` declares. Quiet hours and the daily cap are DELIBERATELY ABSENT: their authority is agent_preferences.quiet_start/quiet_end/max_followups_per_day, and a second copy here would be a second source of truth for the same promise.';

alter table public.notification_consents enable row level security;
alter table public.notification_consents force row level security;

create policy notification_consents_select_own on public.notification_consents
  for select to authenticated using (user_id = (select auth.uid()));

-- No INSERT/UPDATE/DELETE policy for `authenticated`, deliberately. Every write
-- goes through the validated SECURITY DEFINER functions below, so the state
-- machine cannot be driven sideways by a client that sets `state = 'granted'`
-- with no subscription behind it.

revoke all on table public.notification_consents from public, anon, authenticated;
grant select on table public.notification_consents to authenticated;

create trigger notification_consents_updated_at
  before update on public.notification_consents
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. SUBSCRIPTION
-- ============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The push service's endpoint URL and the two client-generated keys. These
  -- are the browser's, not the user's records: nothing here identifies an item.
  endpoint text not null check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 16 and 256),
  auth text not null check (char_length(auth) between 8 and 256),
  state text not null default 'active' check (state in ('active', 'revoked', 'expired')),
  -- `2M-NOTIFY-010`: "no failure is retried indefinitely". The ceiling is a
  -- CHECK rather than application logic, so a retry loop cannot outrun it.
  failure_count smallint not null default 0 check (failure_count between 0 and 3),
  last_delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- OWNER-SCOPED uniqueness, not global.
  --
  -- A global unique on `endpoint` would make an insert failure an existence
  -- oracle for another user's subscription, and taking an endpoint over from
  -- its previous owner would be a cross-user write from an authenticated path.
  -- Owner-scoped costs one thing and it is stated rather than hidden: two
  -- accounts signed into the SAME browser each keep their own row and each
  -- receives their own content-free ping, governed by their own consent. That
  -- is the correct outcome -- both are sessions the person opened -- and it
  -- discloses nothing, because the payload says only that something is waiting.
  unique (user_id, endpoint)
);

comment on table public.push_subscriptions is
  '2M-NOTIFY-011. One row per browser instance per owner. Owner-scoped unique rather than global: a global unique would turn an insert failure into an existence oracle for another user''s subscription.';

create index push_subscriptions_active_idx
  on public.push_subscriptions (user_id, state) where state = 'active';

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select on table public.push_subscriptions to authenticated;

create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. DELIVERY -- THE CONTENT-FREE AUDIT
-- ============================================================================

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('push')),
  notification_type text not null
    check (notification_type in ('reminder', 'follow_up', 'review', 'digest')),
  -- THE ONLY CALLER-CHOSEN VALUE IN THIS MIGRATION, and it is a digest.
  --
  -- Dedup and the 24-hour per-item cooldown both need to know "same item as
  -- last time", and the caller's natural key for that is `reminder:<uuid>` --
  -- a record identifier. Storing the digest instead of the key keeps the
  -- cooldown exact (same item -> same digest) while making the column
  -- INCAPABLE of holding a title: the CHECK admits 64 lowercase hex characters
  -- and nothing else. `2M-NOTIFY-009` asks for an audit "without recording the
  -- content"; this is that, enforced by the database rather than by review.
  dedupe_hash text not null check (dedupe_hash ~ '^[0-9a-f]{64}$'),
  -- Four states, and the set is deliberately this small.
  --
  -- An earlier draft also carried `failed`, and writing the pgTAP suite proved
  -- it made `cooldown` UNREACHABLE: if a delivered row counted as a duplicate,
  -- the duplicate branch always fired first and the 24-hour cooldown could
  -- never be the answer. So the two controls are separated by what they
  -- actually mean -- `duplicate` is "already IN FLIGHT", `cooldown` is
  -- "delivered to this item recently" -- and a failure that has not exhausted
  -- its attempts stays `pending`, holding its in-flight slot, rather than
  -- becoming a fourth state that blocks the item forever.
  outcome text not null
    check (outcome in ('pending', 'delivered', 'suppressed', 'retired')),
  -- The six controls the deployed validator admits, and no seventh.
  suppression_reason text
    check (suppression_reason in ('quiet_hours', 'daily_cap', 'cooldown', 'duplicate', 'not_consented', 'type_muted')),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  -- `2M-NOTIFY-009`: "under which consent record". The consent's recorded
  -- instant identifies the record that was in force, without copying its state.
  consent_recorded_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- A reason belongs to a suppression and to nothing else. Without this, a
  -- `delivered` row could carry `quiet_hours` and the ledger would report a
  -- refusal that did not happen.
  constraint notification_deliveries_reason_matches_outcome check (
    (outcome = 'suppressed' and suppression_reason is not null)
    or (outcome <> 'suppressed' and suppression_reason is null)
  )
);

comment on table public.notification_deliveries is
  '2M-NOTIFY-005/-009. Content-free per-channel delivery audit. public.notifications cannot serve this: it carries title and body, which is the content -009 forbids recording and the in-app surface -008 requires left untouched.';

-- Deduplication that a retry cannot walk around.
--
-- The partial unique index is what makes `2M-NOTIFY-005`'s "deduplication"
-- true under concurrency: two workers racing the same item cannot both insert
-- an in-flight row, because the second violates the index rather than losing a
-- read-then-write race.
--
-- Scoped to `pending` ALONE, and that scope is the correctness argument. A
-- `delivered` row must not hold the slot forever -- a reminder the user snoozes
-- daily is a legitimate delivery tomorrow, and an index covering `delivered`
-- would silently make the 24-hour cooldown a permanent ban. `suppressed` and
-- `retired` are excluded for the same reason: a refusal must never block a
-- later legitimate delivery.
create unique index notification_deliveries_live_idx
  on public.notification_deliveries (user_id, channel, dedupe_hash)
  where outcome = 'pending';

create index notification_deliveries_user_day_idx
  on public.notification_deliveries (user_id, channel, occurred_at desc);

alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;

create policy notification_deliveries_select_own on public.notification_deliveries
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.notification_deliveries from public, anon, authenticated;
grant select on table public.notification_deliveries to authenticated;

-- ============================================================================
-- 4. QUIET HOURS -- ONE PREDICATE, SHARED WITH THE HEARTBEAT
-- ============================================================================

-- `2M-NOTIFY-005` forbids inheriting the in-app controls "by assumption". It
-- does NOT ask for a second, differently-behaving copy of them -- that would be
-- the same defect wearing the opposite coat. So the wrap-around predicate the
-- heartbeat has used since `202607160007:238-240` is extracted here by value,
-- and `phase-2m-push-parity.test.ts` plus the pgTAP suite assert the two agree.
create or replace function private.push_within_quiet_hours(
  p_local_time time,
  p_quiet_start time,
  p_quiet_end time
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_quiet_start is null or p_quiet_end is null then false
    when p_quiet_start = p_quiet_end then false
    when p_quiet_start < p_quiet_end
      then p_local_time >= p_quiet_start and p_local_time < p_quiet_end
    else p_local_time >= p_quiet_start or p_local_time < p_quiet_end
  end;
$$;

comment on function private.push_within_quiet_hours(time, time, time) is
  '2M-NOTIFY-005. The heartbeat''s wrap-around quiet-hours predicate (202607160007:238-240) by value. 22:30-07:00 wraps midnight, so a naive start <= now < end reports the middle of the night as loud.';

revoke all on function private.push_within_quiet_hours(time, time, time) from public, anon, authenticated;

-- ============================================================================
-- 5. THE USER-FACING WRITES -- authenticated, owner-scoped, fail-closed
-- ============================================================================

-- `2M-NOTIFY-011`: "no service_role client on a product path". Every function
-- in this section runs as `authenticated`, derives the owner from `auth.uid()`
-- and NEVER takes a user id as a parameter -- there is no argument a caller
-- could put somebody else's id into.

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  now_at timestamptz := pg_catalog.now();
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Fail closed on every argument BEFORE any write, so a refusal leaves no
  -- partial state: no consent row without a subscription, no subscription
  -- without keys.
  if p_endpoint is null or pg_catalog.btrim(p_endpoint) = ''
     or p_p256dh is null or pg_catalog.btrim(p_p256dh) = ''
     or p_auth is null or pg_catalog.btrim(p_auth) = '' then
    raise exception 'Subscription is incomplete' using errcode = '22023';
  end if;

  -- Only an https endpoint, and never one pointing back at this application:
  -- a subscription is a URL the server will later POST to, so an unvalidated
  -- one is a request-forgery primitive with a user id attached.
  if p_endpoint !~ '^https://' then
    raise exception 'Subscription endpoint must be https' using errcode = '22023';
  end if;

  insert into public.push_subscriptions as subscription
    (user_id, endpoint, p256dh, auth, state, failure_count)
  values (actor, p_endpoint, p_p256dh, p_auth, 'active', 0)
  on conflict (user_id, endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        -- Re-registering a previously expired or revoked endpoint revives it.
        -- That is the user pressing the control again, which is the one action
        -- that should clear a lapse.
        state = 'active',
        failure_count = 0;

  insert into public.notification_consents as consent
    (user_id, channel, state, recorded_at, enabled_types, frequency)
  values (
    actor, 'push', 'granted', now_at,
    -- The four declared types, on, and `immediate`. This is the DEFAULT AFTER
    -- AN EXPLICIT GRANT, not a default-on: the row only exists because the user
    -- pressed a control and the browser returned a subscription.
    array['reminder', 'follow_up', 'review', 'digest']::text[], 'immediate'
  )
  on conflict (user_id, channel) do update
    set state = 'granted',
        recorded_at = now_at,
        -- The types and the frequency are LEFT AS THEY WERE on re-grant, the
        -- same rule `revoke()` follows in `consent-contract.ts`: a user who
        -- turns it back on has not asked to lose the preferences they set.
        enabled_types = consent.enabled_types,
        frequency = consent.frequency;

  return pg_catalog.jsonb_build_object('state', 'granted', 'recorded_at', now_at);
end;
$$;

comment on function public.register_push_subscription(text, text, text) is
  '2M-NOTIFY-001/-011. Owner from auth.uid(), never a parameter. Validates every argument before the first write, so a refusal leaves no partial state.';

revoke all on function public.register_push_subscription(text, text, text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

create or replace function public.revoke_push_consent()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  now_at timestamptz := pg_catalog.now();
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- `2M-NOTIFY-001`: revocation "takes effect without a further step". Both
  -- writes happen here, in one statement pair, in one transaction: a revocation
  -- that marked the consent but left the subscription active would be a
  -- revocation the sender could still deliver against (T-09).
  update public.push_subscriptions
     set state = 'revoked'
   where user_id = actor and state <> 'revoked';

  insert into public.notification_consents (user_id, channel, state, recorded_at)
  values (actor, 'push', 'revoked', now_at)
  on conflict (user_id, channel) do update
    set state = 'revoked', recorded_at = now_at;

  -- Idempotent by construction: revoking twice is the same end state, and the
  -- second call is not an error. A user pressing a control twice must not see
  -- a failure for having been decisive.
  return pg_catalog.jsonb_build_object('state', 'revoked', 'recorded_at', now_at);
end;
$$;

comment on function public.revoke_push_consent() is
  '2M-NOTIFY-001. Consent and every subscription in one transaction: marking only the consent would leave a subscription the sender could still deliver against (T-09). Idempotent.';

revoke all on function public.revoke_push_consent() from public, anon, authenticated;
grant execute on function public.revoke_push_consent() to authenticated;

create or replace function public.record_push_consent_state(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  now_at timestamptz := pg_catalog.now();
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- The states the CLIENT may report are the ones only the browser knows.
  -- `granted` is excluded on purpose: it is not something a client asserts, it
  -- is what `register_push_subscription` concludes from a real subscription.
  -- Without this exclusion a client could claim consent it never obtained.
  if p_state is null or p_state not in ('denied', 'unsupported', 'expired') then
    raise exception 'Unsupported consent state' using errcode = '22023';
  end if;

  if p_state in ('denied', 'expired') then
    update public.push_subscriptions
       set state = case when p_state = 'expired' then 'expired' else 'revoked' end
     where user_id = actor and state = 'active';
  end if;

  insert into public.notification_consents (user_id, channel, state, recorded_at)
  values (actor, 'push', p_state, now_at)
  on conflict (user_id, channel) do update
    set state = p_state, recorded_at = now_at;

  return pg_catalog.jsonb_build_object('state', p_state, 'recorded_at', now_at);
end;
$$;

comment on function public.record_push_consent_state(text) is
  '2M-NOTIFY-010. The three states only the browser can observe. `granted` is refused here: consent is concluded from a real subscription, never asserted by a client.';

revoke all on function public.record_push_consent_state(text) from public, anon, authenticated;
grant execute on function public.record_push_consent_state(text) to authenticated;

create or replace function public.update_notification_preferences(
  p_enabled_types text[],
  p_frequency text,
  p_quiet_start time,
  p_quiet_end time,
  p_daily_cap smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_enabled_types is null
     or not (p_enabled_types <@ array['reminder', 'follow_up', 'review', 'digest']::text[]) then
    raise exception 'Unsupported notification type' using errcode = '22023';
  end if;
  if p_frequency is null or p_frequency not in ('immediate', 'daily_digest', 'off') then
    raise exception 'Unsupported notification frequency' using errcode = '22023';
  end if;
  if p_quiet_start is null or p_quiet_end is null then
    raise exception 'Quiet period is incomplete' using errcode = '22023';
  end if;
  -- The existing column's own bound, restated so this path cannot write a value
  -- the heartbeat's reader would refuse.
  if p_daily_cap is null or p_daily_cap < 0 or p_daily_cap > 20 then
    raise exception 'Daily cap out of range' using errcode = '22023';
  end if;

  -- The type and the frequency are THIS channel's, so they live on the consent.
  -- A row is created if none exists, in `unsupported` -- setting a preference is
  -- not granting consent, and this must never be a way to reach `granted`.
  insert into public.notification_consents (user_id, channel, state, enabled_types, frequency)
  values (actor, 'push', 'unsupported', p_enabled_types, p_frequency)
  on conflict (user_id, channel) do update
    set enabled_types = p_enabled_types, frequency = p_frequency;

  -- Quiet hours and the cap are the WHOLE PRODUCT'S, so they go where they have
  -- always lived and where the heartbeat already reads them. This is the reuse
  -- this migration was audited for: one promise, one pair of columns.
  update public.agent_preferences
     set quiet_start = p_quiet_start,
         quiet_end = p_quiet_end,
         max_followups_per_day = p_daily_cap
   where user_id = actor;

  return pg_catalog.jsonb_build_object('updated', true);
end;
$$;

comment on function public.update_notification_preferences(text[], text, time, time, smallint) is
  '2M-NOTIFY-004. Type and frequency to the consent; quiet hours and the cap to agent_preferences, where the heartbeat already reads them. Creating a preference row can never reach `granted`.';

revoke all on function public.update_notification_preferences(text[], text, time, time, smallint) from public, anon, authenticated;
grant execute on function public.update_notification_preferences(text[], text, time, time, smallint) to authenticated;

-- ============================================================================
-- 6. THE SENDER'S SIDE -- service_role only, and it is not a product path
-- ============================================================================

-- These two are the leased worker's, in the same shape `run_user_heartbeat` and
-- the job claims already use: `service_role` only, owner passed explicitly
-- because the worker has no session. That is a BACKGROUND path, not the
-- "product path" `2M-NOTIFY-011` forbids service_role on -- every user-facing
-- read and write above runs as `authenticated` under RLS.

create or replace function public.begin_push_delivery(
  p_user_id uuid,
  p_type text,
  p_dedupe_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  consent public.notification_consents%rowtype;
  user_zone text;
  quiet_from time;
  quiet_to time;
  cap smallint;
  -- `timestamp`, NOT `timestamptz`. `now() at time zone <zone>` yields a
  -- timestamp WITHOUT a zone -- the wall clock the user is reading. Declaring
  -- this `timestamptz` would make the assignment re-interpret that wall clock
  -- in the SERVER's zone, and every quiet-hours and local-day comparison below
  -- would silently be off by the offset between them.
  local_now timestamp;
  delivered_today integer;
  last_same timestamptz;
  delivery_id uuid;
  refusal text;
  subscriptions jsonb;
begin
  if pg_catalog.coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_type not in ('reminder', 'follow_up', 'review', 'digest')
     or p_dedupe_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid delivery request' using errcode = '22023';
  end if;

  select * into consent from public.notification_consents
   where user_id = p_user_id and channel = 'push';

  select profile.timezone, preferences.quiet_start, preferences.quiet_end,
         preferences.max_followups_per_day
    into user_zone, quiet_from, quiet_to, cap
    from public.profiles profile
    join public.agent_preferences preferences on preferences.user_id = profile.user_id
   where profile.user_id = p_user_id;

  -- `2M-TIME-003`: the boundary is computed from the STORED zone. A missing one
  -- is a caller error rather than a silent default, and the fail-closed
  -- direction for a delivery decision is to refuse.
  if user_zone is null then
    raise exception 'User timezone is not set' using errcode = '22023';
  end if;
  local_now := pg_catalog.now() at time zone user_zone;

  -- THE ORDER IS `governance.ts`'s ORDER, and it is load-bearing: the first
  -- refusal wins, so an unconsented user never produces a `daily_cap` row --
  -- the ledger would be reporting a ceiling they cannot reach.
  if consent.user_id is null or consent.state <> 'granted' then
    refusal := 'not_consented';
  elsif not (p_type = any (consent.enabled_types)) then
    refusal := 'type_muted';
  elsif consent.frequency = 'off' then
    refusal := 'type_muted';
  elsif private.push_within_quiet_hours(local_now::time, quiet_from, quiet_to) then
    refusal := 'quiet_hours';
  -- `duplicate` is "already IN FLIGHT", and `cooldown` below is "delivered to
  -- this item recently". Collapsing the two would make one of them unreachable.
  elsif exists (
    select 1 from public.notification_deliveries
     where user_id = p_user_id and channel = 'push' and dedupe_hash = p_dedupe_hash
       and outcome = 'pending'
  ) then
    refusal := 'duplicate';
  else
    select pg_catalog.max(occurred_at) into last_same
      from public.notification_deliveries
     where user_id = p_user_id and channel = 'push' and dedupe_hash = p_dedupe_hash
       and outcome = 'delivered';
    if last_same is not null and last_same > pg_catalog.now() - interval '24 hours' then
      refusal := 'cooldown';
    else
      -- The cap counts THIS CHANNEL's deliveries in the user's LOCAL day. An
      -- in-app term here is what `2M-NOTIFY-005` means by "inherited by
      -- assumption", and there is none: this reads its own table only.
      select pg_catalog.count(*) into delivered_today
        from public.notification_deliveries
       where user_id = p_user_id and channel = 'push' and outcome = 'delivered'
         and (occurred_at at time zone user_zone)::date = local_now::date;
      -- `>=`, not `>`. A cap of three means the fourth is refused.
      if delivered_today >= pg_catalog.coalesce(cap, 0) then
        refusal := 'daily_cap';
      end if;
    end if;
  end if;

  if refusal is not null then
    insert into public.notification_deliveries
      (user_id, channel, notification_type, dedupe_hash, outcome, suppression_reason, consent_recorded_at)
    values (p_user_id, 'push', p_type, p_dedupe_hash, 'suppressed', refusal, consent.recorded_at);
    return pg_catalog.jsonb_build_object('permitted', false, 'reason', refusal);
  end if;

  insert into public.notification_deliveries
    (user_id, channel, notification_type, dedupe_hash, outcome, attempts, consent_recorded_at)
  values (p_user_id, 'push', p_type, p_dedupe_hash, 'pending', 0, consent.recorded_at)
  -- The dedupe index is the arbiter under concurrency: a racing worker that
  -- lost gets nothing back and sends nothing, rather than both sending.
  on conflict do nothing
  returning id into delivery_id;

  if delivery_id is null then
    return pg_catalog.jsonb_build_object('permitted', false, 'reason', 'duplicate');
  end if;

  select pg_catalog.coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'id', id, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), '[]'::jsonb)
    into subscriptions
    from public.push_subscriptions
   where user_id = p_user_id and state = 'active';

  return pg_catalog.jsonb_build_object(
    'permitted', true, 'delivery_id', delivery_id, 'subscriptions', subscriptions);
end;
$$;

comment on function public.begin_push_delivery(uuid, text, text) is
  '2M-NOTIFY-005/-009/-011. The six controls applied ON THE SERVER BEFORE SENDING, in governance.ts''s order, against this channel''s own counters. Reads quiet hours and the cap from agent_preferences -- the same columns the heartbeat reads.';

revoke all on function public.begin_push_delivery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_push_delivery(uuid, text, text) to service_role;

create or replace function public.finish_push_delivery(
  p_delivery_id uuid,
  p_outcome text,
  p_gone_subscription_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.notification_deliveries%rowtype;
  final_outcome text;
begin
  if pg_catalog.coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('delivered', 'failed') then
    raise exception 'Unsupported delivery outcome' using errcode = '22023';
  end if;

  select * into target from public.notification_deliveries where id = p_delivery_id;
  if target.id is null then
    raise exception 'Delivery not found' using errcode = '22023';
  end if;
  -- A finished delivery is never re-finished: a stale worker must not overwrite
  -- newer work, which is this repository's standing job rule.
  if target.outcome <> 'pending' then
    return pg_catalog.jsonb_build_object('outcome', target.outcome, 'changed', false);
  end if;

  -- `2M-NOTIFY-010`: bounded, never indefinite.
  --
  -- A failure below the ceiling leaves the row `pending` -- still in flight,
  -- still holding its dedupe slot, with one more attempt recorded -- so a retry
  -- reuses this row instead of inserting a second one. The THIRD failure
  -- retires it permanently, and `attempts` carries a CHECK ceiling of 3 so no
  -- code path can raise it further.
  if p_outcome = 'delivered' then
    final_outcome := 'delivered';
  elsif target.attempts + 1 >= 3 then
    final_outcome := 'retired';
  else
    final_outcome := 'pending';
  end if;

  update public.notification_deliveries
     set outcome = final_outcome,
         attempts = pg_catalog.least(target.attempts + 1, 3),
         occurred_at = case when p_outcome = 'delivered' then pg_catalog.now() else occurred_at end
   where id = p_delivery_id;

  if p_outcome = 'delivered' then
    update public.push_subscriptions
       set last_delivered_at = pg_catalog.now(), failure_count = 0
     where user_id = target.user_id and state = 'active';
  end if;

  -- A 404/410 from the push service means the browser threw the subscription
  -- away. `2M-NOTIFY-011` requires it RETIRED rather than retried, and retiring
  -- it is scoped to the delivery's own owner so a malformed id list cannot
  -- reach across users.
  if p_gone_subscription_ids is not null and pg_catalog.array_length(p_gone_subscription_ids, 1) > 0 then
    update public.push_subscriptions
       set state = 'expired'
     where user_id = target.user_id and id = any (p_gone_subscription_ids);

    if not exists (
      select 1 from public.push_subscriptions where user_id = target.user_id and state = 'active'
    ) then
      update public.notification_consents
         set state = 'expired', recorded_at = pg_catalog.now()
       where user_id = target.user_id and channel = 'push' and state = 'granted';
    end if;
  end if;

  return pg_catalog.jsonb_build_object('outcome', final_outcome, 'changed', true);
end;
$$;

comment on function public.finish_push_delivery(uuid, text, uuid[]) is
  '2M-NOTIFY-010/-011. Bounded retry (the third failure retires), expired subscriptions retired rather than retried, and a finished delivery never re-finished by a stale worker.';

revoke all on function public.finish_push_delivery(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.finish_push_delivery(uuid, text, uuid[]) to service_role;

-- ============================================================================
-- 7. RETENTION -- defined here, ARMED BY NOBODY
-- ============================================================================

-- The window is the one already signed for this repository (PRD sec. 14.1,
-- ADR-082, `202608070083`): 90 days, taken from `private.retention_windows`
-- rather than written as a number here, so the sweep statement carries none.
insert into private.retention_windows (key, days, note) values
  ('notification_deliveries', 90,
   '2M-NOTIFY-009. The content-free delivery audit. Reuses the signed 90-day window (PRD sec. 14.1) rather than minting a new value.')
on conflict (key) do nothing;

create or replace function private.prune_notification_deliveries(p_limit integer default 10000)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
begin
  with expired as (
    select id from public.notification_deliveries
     where occurred_at < pg_catalog.now()
       - pg_catalog.make_interval(days => private.retention_window('notification_deliveries'))
     limit pg_catalog.greatest(pg_catalog.coalesce(p_limit, 10000), 0)
  )
  delete from public.notification_deliveries target
   using expired where target.id = expired.id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function private.prune_notification_deliveries(integer) is
  '2M-NOTIFY-009 retention. Window from private.retention_windows so the statement carries no number. Executable by NO role and NOT SCHEDULED: scheduling is authorization (ADR-082), and arming this is an operator action.';

-- Executable by no role, deliberately. This repository has recorded the rule
-- that a migration which schedules a destructive sweep has authorized it.
revoke all on function private.prune_notification_deliveries(integer) from public, anon, authenticated, service_role;

-- ============================================================================
-- 8. SELF-CHECKS -- the migration proves its own claims before it commits
-- ============================================================================

do $$
begin
  -- The content prohibition, asserted structurally rather than promised. If a
  -- later edit adds a text column to any of the three tables, this fires.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name in ('notification_consents', 'push_subscriptions', 'notification_deliveries')
       and column_name in ('title', 'body', 'description', 'name', 'text', 'message',
                           'content', 'payload', 'properties', 'metadata', 'data')
  ) then
    raise exception 'Phase 2M migration 3 introduced a content-bearing column (R-13, R-17)';
  end if;

  -- Forced RLS on all three, because `enable` without `force` leaves the table
  -- open to its owner and this repository's standard is both.
  if exists (
    select 1 from pg_class
     where relnamespace = 'public'::regnamespace
       and relname in ('notification_consents', 'push_subscriptions', 'notification_deliveries')
       and (relrowsecurity is false or relforcerowsecurity is false)
  ) then
    raise exception 'Phase 2M migration 3 left a table without forced RLS';
  end if;

  -- No write policy for `authenticated` on any of the three: every write goes
  -- through a validated function, so a client cannot set its own consent state.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('notification_consents', 'push_subscriptions', 'notification_deliveries')
       and cmd <> 'SELECT'
  ) then
    raise exception 'Phase 2M migration 3 granted a direct write policy';
  end if;

  -- The two events this slice produces must already be admitted by migration 1.
  -- A producer that predates its vocabulary is R-11, and this repository has
  -- paid for that twice.
  if (select 1 from pg_proc
       where proname = 'validate_product_event_properties'
         and pronamespace = 'private'::regnamespace
         and pg_catalog.position('notification_consent_changed' in pg_get_functiondef(oid)) > 0
         and pg_catalog.position('notification_suppressed' in pg_get_functiondef(oid)) > 0
      ) is null then
    raise exception 'The notification telemetry vocabulary is not deployed; migration 1 must land first';
  end if;
end;
$$;
