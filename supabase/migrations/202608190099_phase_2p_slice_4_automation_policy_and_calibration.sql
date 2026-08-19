-- Phase 2P slice 2P.4 -- per-category automation policy and calibration.
--
-- THE OWNER'S SECOND AND FINAL PHASE 2P MIGRATION. A third is a stop condition.
--
-- WHY THE EXISTING SCHEMA CANNOT CARRY THIS
--
-- public.agent_preferences.autonomy_level is a single global `text`, NOT NULL,
-- DEFAULT 'autonomous', with no check constraint and no behavioural consumer
-- anywhere in the product: it appears in one select list and is passed to a
-- settings payload, and nothing branches on it. One scalar cannot express six
-- policies, and it cannot be disabled for one category while another stays on,
-- which is exactly what 2P-AUTONOMY-001 and -010 require.
--
-- Worse, its value is a schema default nobody chose. Reading authority out of
-- 'autonomous' would convert `create table` into consent for six categories of
-- automatic write. NOTHING BELOW READS THAT COLUMN, and a guard asserts the
-- absence rather than trusting this comment.
--
-- privacy_preferences (jsonb, zero references outside the generated types) is
-- not available either: one vocabulary serving two authorities is the defect
-- this repository has already paid for, and the reason element_trust and
-- element_policy had to be normalized in slice 2P.1.
--
-- element_trust is a DIFFERENT authority and stays one. It decides whether an
-- element of an interpretation may be applied; these six categories are domain
-- writes. Overloading it would make one score govern both -- the generic
-- "confidence above 90%" rule the owner explicitly forbade.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- It changes no existing grant, no RLS policy, no retention rule and no EXECUTE
-- privilege on any function that already exists. It adds no product_events
-- vocabulary value, name or surface -- that vocabulary is a deployed CHECK and
-- widening it is a stop condition, so the audit trail uses audit_logs, whose
-- action_type carries no constraint. It writes NO policy row: absence computes
-- as 'suggest_only', so no category is automatic and none can be read as having
-- been consented to. It enables nothing.
--
-- ---------------------------------------------------------------------------
-- 1. The policy store.
--
-- Least privilege on purpose: `authenticated` gets SELECT and nothing else.
-- Every write goes through public.set_automation_category_policy, which audits
-- and registers an undo. An authority table with direct DML is an authority
-- anybody can rewrite without leaving a trace.
-- ---------------------------------------------------------------------------

create table public.automation_category_policies (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category),
  constraint automation_category_policies_category_check
    check (category in ('task', 'person', 'project', 'organization', 'memory', 'relation')),
  constraint automation_category_policies_state_check
    check (state in ('disabled', 'suggest_only', 'automatic_when_eligible'))
);

alter table public.automation_category_policies enable row level security;
alter table public.automation_category_policies force row level security;

-- `to authenticated` is explicit, not decorative. A policy with no role list
-- applies to PUBLIC, and `phase_2o_privacy_enumeration.sql` requires every
-- counted table to carry a SELECT policy naming `authenticated` -- because a
-- PUBLIC policy is not evidence that the owner can read their own rows, which
-- is the property that assertion exists to establish.
create policy automation_category_policies_select_own
  on public.automation_category_policies
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.automation_category_policies from public, anon, authenticated;
grant select on table public.automation_category_policies to authenticated;

create trigger automation_category_policies_updated_at
  before update on public.automation_category_policies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The calibration evidence.
--
-- CONTENT-MINIMAL, STRUCTURALLY. There is no free-text content column on this
-- table at all. The only text columns are three closed vocabularies and two
-- keys built from identifiers. `corrected` is COMPUTED by comparing a stored
-- title to a candidate title and only the resulting outcome is kept -- the
-- comparison touches content, the row never does.
--
-- Append-only, and no INSERT/UPDATE/DELETE grant to anybody. The producer is a
-- SECURITY DEFINER function reached only by triggers on rows that already prove
-- their owner, which is what makes the polymorphic subject_id safe without a
-- foreign key it cannot have.
--
-- No retention sweep is scheduled here, and that is deliberate in both
-- directions. Scheduling a destructive sweep inside a migration is authorizing
-- it. And a 90-day window would make the calibration contract unsatisfiable at
-- the owner's real review volume: the sample could never accumulate. Lifecycle
-- is the account cascade, like every other user-owned table.
-- ---------------------------------------------------------------------------

create table public.automation_calibration_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  outcome text not null,
  source_kind text not null,
  subject_key text not null,
  observation_key text not null,
  entry_id uuid,
  interpretation_id uuid,
  subject_id uuid,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint automation_calibration_observations_category_check
    check (category in ('task', 'person', 'project', 'organization', 'memory', 'relation')),
  constraint automation_calibration_observations_outcome_check
    check (outcome in ('approved', 'corrected', 'rejected', 'undone')),
  constraint automation_calibration_observations_source_kind_check
    check (source_kind in ('task_candidate', 'person_candidate', 'acceptance_undone')),
  constraint automation_calibration_observations_subject_key_check
    check (char_length(subject_key) between 1 and 200),
  constraint automation_calibration_observations_observation_key_check
    check (char_length(observation_key) between 1 and 260),
  constraint automation_calibration_observations_entry_owner_fk
    foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  -- MATCH SIMPLE, so a row without an interpretation is allowed and a row with
  -- one must prove the same owner. Composite, because a relationship's own
  -- user_id is never proof on its own.
  constraint automation_calibration_observations_interpretation_owner_fk
    foreign key (user_id, entry_id, interpretation_id)
    references public.entry_interpretations (user_id, entry_id, id) on delete cascade
);

create unique index automation_calibration_observations_key_uniq
  on public.automation_calibration_observations (user_id, observation_key);

create index automation_calibration_observations_lookup
  on public.automation_calibration_observations (user_id, category, observed_at desc, id desc);

alter table public.automation_calibration_observations enable row level security;
alter table public.automation_calibration_observations force row level security;

create policy automation_calibration_observations_select_own
  on public.automation_calibration_observations
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.automation_calibration_observations from public, anon, authenticated;
grant select on table public.automation_calibration_observations to authenticated;

-- UPDATE ONLY, AND THE OMISSION OF DELETE IS THE WHOLE POINT.
--
-- The first cut of this trigger covered `update or delete`, and its comment
-- claimed "the account cascade deletes rows through the foreign key, which does
-- not fire this trigger". That is FALSE, and CI proved it false: an
-- `on delete cascade` performs a real DELETE on the child table, row triggers
-- fire, and this refused it -- so no account could be deleted at all.
--
-- This repository has already paid for exactly this defect once.
-- `202608070081_phase_2h_rate_limiting.sql:182-188` records it in as many
-- words: *"2H.2's cascade defect was an append-only trigger on a table whose
-- rows cascade: the cascade **is** a delete, so the trigger refused it and no
-- account could be deleted at all."*
--
-- Deletion is governed where it is actually governed on every other append-only
-- table here -- by grants. `authenticated` holds SELECT and nothing else, so no
-- client can update or delete a row. This trigger is the second lock on the one
-- operation a future grant widening or a definer bug could still reach, and it
-- deliberately says nothing about DELETE, so the account cascade stays the
-- complete cleanup story.
create or replace function private.refuse_calibration_observation_mutation()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  raise exception 'automation_calibration_observations is append-only'
    using errcode = '42501', detail = '2P_CALIBRATION_APPEND_ONLY';
end;
$$;

revoke all on function private.refuse_calibration_observation_mutation() from public, anon, authenticated;

create trigger automation_calibration_observations_append_only
  before update on public.automation_calibration_observations
  for each row execute function private.refuse_calibration_observation_mutation();

-- ---------------------------------------------------------------------------
-- 3. The thresholds.
--
-- A PROPOSAL awaiting the owner's signature, and unreachable today by every
-- category. They are constants in a function rather than rows in a table on
-- purpose: a threshold the running system can write is a threshold the running
-- system can lower.
--
-- They are deliberately NOT one number. `task` is the only fully reversible
-- category -- cancellation plus a registered undo -- and the only one with real
-- review volume, so it sits lowest. `relation` sits highest because
-- 2N-RELATION-TRIGGER is a hard boundary and a relation asserted as
-- owner-authored is the costliest error the product can make.
-- ---------------------------------------------------------------------------

create or replace function private.automation_calibration_thresholds()
returns table (category text, minimum_reviewed integer, minimum_precision numeric)
language sql
immutable
set search_path to ''
as $$
  select *
  from (
    values
      ('task', 50, 0.90::numeric),
      ('person', 80, 0.97::numeric),
      ('project', 60, 0.95::numeric),
      ('organization', 60, 0.95::numeric),
      ('memory', 80, 0.97::numeric),
      ('relation', 100, 0.98::numeric)
  ) as thresholds (category, minimum_reviewed, minimum_precision);
$$;

revoke all on function private.automation_calibration_thresholds() from public, anon, authenticated;

-- Freshness and the undo block, shared by every category.
--   minimum_recent_reviewed : reviewed subjects required inside recent_window_days
--   newest_within_days      : a calibration that stopped being measured is not one
--   undo_block_window       : an `undone` among the N most recent observations blocks
create or replace function private.automation_calibration_freshness()
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select pg_catalog.jsonb_build_object(
    'minimumRecentReviewed', 10,
    'recentWindowDays', 90,
    'newestWithinDays', 30,
    'undoBlockWindow', 20
  );
$$;

revoke all on function private.automation_calibration_freshness() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Which categories can produce evidence at all.
--
-- Two of the six have a review flow, so two of the six have a producer. The
-- other four are recorded as producer-less rather than silently reading zero,
-- because "no evidence yet" and "no way to ever gather evidence" are different
-- answers and the owner has to be able to tell them apart.
-- ---------------------------------------------------------------------------

create or replace function private.automation_category_has_producer(p_category text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_category in ('task', 'person');
$$;

revoke all on function private.automation_category_has_producer(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The measurement.
--
-- Rows are append-only and a subject can be judged more than once, so the
-- summary reduces to the LATEST observation per subject_key: one candidate
-- contributes exactly one verdict. The raw `undone` rows are read separately
-- for the blocking rule, because an undo is evidence even when a later approval
-- supersedes it.
--
-- `retained` -- the task disposition meaning "keep it pending" -- never reaches
-- this table at all. It is a deferral, not a verdict, and counting it as
-- approval would be treating absence of review as approval.
-- ---------------------------------------------------------------------------

create or replace function private.automation_calibration_summary(p_user_id uuid, p_category text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $$
declare
  freshness jsonb := private.automation_calibration_freshness();
  reviewed integer := 0;
  approved integer := 0;
  corrected integer := 0;
  rejected integer := 0;
  undone integer := 0;
  recent_reviewed integer := 0;
  newest timestamptz;
  recent_undo boolean := false;
begin
  with latest as (
    select distinct on (observations.subject_key)
      observations.subject_key,
      observations.outcome,
      observations.observed_at
    from public.automation_calibration_observations as observations
    where observations.user_id = p_user_id
      and observations.category = p_category
    order by observations.subject_key, observations.observed_at desc, observations.id desc
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where latest.outcome = 'approved')::integer,
    pg_catalog.count(*) filter (where latest.outcome = 'corrected')::integer,
    pg_catalog.count(*) filter (where latest.outcome = 'rejected')::integer,
    pg_catalog.count(*) filter (where latest.outcome = 'undone')::integer,
    pg_catalog.count(*) filter (
      where latest.observed_at >= pg_catalog.now()
        - ((freshness ->> 'recentWindowDays')::integer * '1 day'::interval)
    )::integer,
    pg_catalog.max(latest.observed_at)
  into reviewed, approved, corrected, rejected, undone, recent_reviewed, newest
  from latest;

  select pg_catalog.bool_or(recent.outcome = 'undone')
  into recent_undo
  from (
    select observations.outcome
    from public.automation_calibration_observations as observations
    where observations.user_id = p_user_id
      and observations.category = p_category
    order by observations.observed_at desc, observations.id desc
    limit (freshness ->> 'undoBlockWindow')::integer
  ) as recent;

  return pg_catalog.jsonb_build_object(
    'reviewed', reviewed,
    'approved', approved,
    'corrected', corrected,
    'rejected', rejected,
    'undone', undone,
    'precision', case when reviewed = 0 then null else pg_catalog.round((approved::numeric / reviewed), 4) end,
    'recentReviewed', recent_reviewed,
    'newestObservedAt', newest,
    'recentUndo', coalesce(recent_undo, false),
    'hasProducer', private.automation_category_has_producer(p_category)
  );
end;
$$;

revoke all on function private.automation_calibration_summary(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. THE SINGLE AUTHORITY.
--
-- Every reader -- the owner's status surface and any future automatic writer --
-- consults this one function, so there is exactly one definition of "may this
-- category write automatically?". Two definitions is how slice 2P.1's defect
-- began.
--
-- It reads NO confidence, score or probability column. 2P-AUTONOMY-002 is
-- therefore discharged structurally rather than by comparing a model score to a
-- number: there is nothing here for a score to be compared against.
--
-- FAIL-CLOSED LAWS, each of which is a pgTAP assertion:
--   * an absent policy row is 'suggest_only_by_owner', never 'automatic';
--   * an unrecognized state degrades to the default and does NOT raise --
--     raising would deny the owner the screen that explains the refusal;
--   * agent_preferences.autonomy_level is not read;
--   * exactly one reason permits a write.
-- ---------------------------------------------------------------------------

create or replace function private.automation_category_decision(p_user_id uuid, p_category text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $$
declare
  freshness jsonb := private.automation_calibration_freshness();
  stored text;
  state text;
  summary jsonb;
  minimum_reviewed integer;
  minimum_precision numeric;
  newest timestamptz;
  reason text;
  eligible boolean := false;
begin
  if p_user_id is null
     or p_category is null
     or p_category not in ('task', 'person', 'project', 'organization', 'memory', 'relation')
  then
    raise exception 'Unknown automation category' using errcode = 'P0002';
  end if;

  select policies.state into stored
  from public.automation_category_policies as policies
  where policies.user_id = p_user_id and policies.category = p_category;

  -- Absence, and anything unrecognized, is 'suggest_only'. This is a COMPUTED
  -- default, never a stored one: a stored default is a value nobody chose that
  -- a later reader mistakes for consent, which is what autonomy_level already
  -- shows.
  state := case
    when stored in ('disabled', 'suggest_only', 'automatic_when_eligible') then stored
    else 'suggest_only'
  end;

  summary := private.automation_calibration_summary(p_user_id, p_category);

  select thresholds.minimum_reviewed, thresholds.minimum_precision
  into minimum_reviewed, minimum_precision
  from private.automation_calibration_thresholds() as thresholds
  where thresholds.category = p_category;

  newest := (summary ->> 'newestObservedAt')::timestamptz;

  if state = 'disabled' then
    reason := 'automation_disabled_by_owner';
  elsif state <> 'automatic_when_eligible' then
    reason := 'suggest_only_by_owner';
  elsif not private.automation_category_has_producer(p_category)
        or (summary ->> 'reviewed')::integer < minimum_reviewed
        or summary ->> 'precision' is null
        or (summary ->> 'precision')::numeric < minimum_precision
        or (summary ->> 'recentReviewed')::integer < (freshness ->> 'minimumRecentReviewed')::integer
        or newest is null
        or newest < pg_catalog.now() - ((freshness ->> 'newestWithinDays')::integer * '1 day'::interval)
  then
    reason := 'insufficient_calibration';
  elsif (summary ->> 'recentUndo')::boolean then
    -- The owner reversing an acceptance is the strongest available signal that
    -- the category is not ready, and it must outrank an aggregate that a long
    -- history of approvals would otherwise keep afloat.
    reason := 'blocked_by_recent_undo';
  else
    reason := 'automatic';
    eligible := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'category', p_category,
    'state', state,
    'eligible', eligible,
    'reason', reason,
    'calibration', summary,
    'requiredReviewed', minimum_reviewed,
    'requiredPrecision', minimum_precision
  );
end;
$$;

revoke all on function private.automation_category_decision(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The owner's read surface -- always six rows, computed.
--
-- Six rows even when no policy row exists, because the owner has to be able to
-- see a category that has never been touched. A projection that returned only
-- stored rows would show an empty screen and say nothing at all.
-- ---------------------------------------------------------------------------

create or replace function public.automation_category_status()
returns table (
  category text,
  state text,
  eligible boolean,
  reason text,
  reviewed integer,
  approved integer,
  corrected integer,
  rejected integer,
  undone integer,
  precision_ratio numeric,
  recent_reviewed integer,
  newest_observed_at timestamptz,
  recent_undo boolean,
  has_producer boolean,
  required_reviewed integer,
  required_precision numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    (decision.value ->> 'category')::text,
    (decision.value ->> 'state')::text,
    (decision.value ->> 'eligible')::boolean,
    (decision.value ->> 'reason')::text,
    (decision.value -> 'calibration' ->> 'reviewed')::integer,
    (decision.value -> 'calibration' ->> 'approved')::integer,
    (decision.value -> 'calibration' ->> 'corrected')::integer,
    (decision.value -> 'calibration' ->> 'rejected')::integer,
    (decision.value -> 'calibration' ->> 'undone')::integer,
    (decision.value -> 'calibration' ->> 'precision')::numeric,
    (decision.value -> 'calibration' ->> 'recentReviewed')::integer,
    (decision.value -> 'calibration' ->> 'newestObservedAt')::timestamptz,
    (decision.value -> 'calibration' ->> 'recentUndo')::boolean,
    (decision.value -> 'calibration' ->> 'hasProducer')::boolean,
    (decision.value ->> 'requiredReviewed')::integer,
    (decision.value ->> 'requiredPrecision')::numeric
  from (
    select private.automation_category_decision(owner_id, ordered.category) as value, ordered.sort_order
    from (
      values ('task', 1), ('person', 2), ('project', 3), ('organization', 4), ('memory', 5), ('relation', 6)
    ) as ordered (category, sort_order)
  ) as decision
  order by decision.sort_order;
end;
$$;

revoke all on function public.automation_category_status() from public, anon;
grant execute on function public.automation_category_status() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The owner's control.
--
-- Arming a category is NOT authorizing a write. The gate re-measures on every
-- read, so an armed but uncalibrated category still refuses -- which keeps the
-- switch honest and keeps the evidence, rather than the switch, in charge.
--
-- Idempotent on the real unique index over (user_id, operation_key), audited
-- with prose in `reason` and identifiers in the states, and reversible through
-- the deployed handler registry.
-- ---------------------------------------------------------------------------

create or replace function public.set_automation_category_policy(
  p_category text,
  p_state text,
  p_operation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  owner_id uuid := (select auth.uid());
  key text;
  existing public.undo_operations%rowtype;
  previous text;
  policy_row public.automation_category_policies%rowtype;
  undo_id uuid;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_category is null
     or p_category not in ('task', 'person', 'project', 'organization', 'memory', 'relation')
  then
    raise exception 'Unknown automation category' using errcode = 'P0002';
  end if;
  if p_state is null
     or p_state not in ('disabled', 'suggest_only', 'automatic_when_eligible')
  then
    raise exception 'Unknown automation policy state' using errcode = 'P0002';
  end if;
  if p_operation_key is null then
    raise exception 'Operation key is required' using errcode = 'P0002';
  end if;

  key := 'automation-policy:' || p_operation_key::text;

  select * into existing
  from public.undo_operations
  where user_id = owner_id and operation_key = key;

  if existing.id is not null then
    return pg_catalog.jsonb_build_object(
      'category', p_category,
      'state', existing.after_state ->> 'state',
      'undoId', existing.id,
      'idempotent', true
    );
  end if;

  select * into policy_row
  from public.automation_category_policies
  where user_id = owner_id and category = p_category
  for update;

  previous := policy_row.state;

  insert into public.automation_category_policies (user_id, category, state)
  values (owner_id, p_category, p_state)
  on conflict (user_id, category) do update set state = excluded.state;

  insert into public.undo_operations (
    user_id, action_type, entity_type, entity_ids,
    before_state, after_state, operation_key
  ) values (
    owner_id,
    'set_automation_category_policy',
    'automation_category_policy',
    '{}'::uuid[],
    pg_catalog.jsonb_build_object('category', p_category, 'state', previous),
    pg_catalog.jsonb_build_object('category', p_category, 'state', p_state),
    key
  )
  returning id into undo_id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor,
    before_state, after_state, reason
  ) values (
    owner_id,
    'automation_policy_changed',
    'automation_category_policy',
    undo_id,
    'user',
    pg_catalog.jsonb_build_object('category', p_category, 'state', previous),
    pg_catalog.jsonb_build_object('category', p_category, 'state', p_state),
    'Owner changed the automation policy for one category'
  );

  return pg_catalog.jsonb_build_object(
    'category', p_category,
    'state', p_state,
    'undoId', undo_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.set_automation_category_policy(text, text, uuid) from public, anon;
grant execute on function public.set_automation_category_policy(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Undo, against the deployed handler registry.
--
-- Guarded on the state the operation produced: if the category has moved since,
-- the handler refuses rather than overwriting a newer decision with an older
-- one. A policy that had no row before is restored to having no row, not to a
-- default that would look like a choice.
-- ---------------------------------------------------------------------------

create or replace function private.undo_set_automation_category_policy(p_user_id uuid, p_undo_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  operation public.undo_operations%rowtype;
  target_category text;
  produced text;
  restore text;
  current_state text;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'set_automation_category_policy' then
    raise exception 'Unsupported undo operation';
  end if;

  target_category := operation.after_state ->> 'category';
  produced := operation.after_state ->> 'state';
  restore := operation.before_state ->> 'state';

  select policies.state into current_state
  from public.automation_category_policies as policies
  where policies.user_id = p_user_id and policies.category = target_category
  for update;

  if current_state is distinct from produced then
    raise exception 'Automation policy changed since this operation'
      using errcode = '55P03', detail = '2P_AUTOMATION_POLICY_MOVED';
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  if restore is null then
    delete from public.automation_category_policies
    where user_id = p_user_id and category = target_category;
  else
    update public.automation_category_policies
    set state = restore
    where user_id = p_user_id and category = target_category;
  end if;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor,
    before_state, after_state, reason
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    operation.id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object('category', target_category, 'state', restore),
    'User executed the stored compensating operation'
  );

  return pg_catalog.jsonb_build_object('undone', true, 'affected', 1, 'idempotent', false);
end;
$$;

revoke all on function private.undo_set_automation_category_policy(uuid, uuid) from public, anon, authenticated;

insert into private.undo_operation_handlers (action_type, handler_function, description)
values (
  'set_automation_category_policy',
  'undo_set_automation_category_policy',
  'Phase 2P slice 2P.4: restore the previous per-category automation policy, or remove the row if there was none, refusing when the category moved since.'
);

-- ---------------------------------------------------------------------------
-- 10. THE PRODUCER.
--
-- Bound to the tables the owner's reviews land in, not to the bodies of the
-- functions that write them -- the same reasoning slice 2P.1 recorded: a
-- superseded resolver version, a route the application never calls, and direct
-- DML all produce evidence, and a route added later inherits the rule without
-- being told it exists.
--
-- IT CARRIES NO EXCEPTION HANDLER, AND THAT IS DELIBERATE. It performs no
-- lookup that can raise and inserts ON CONFLICT DO NOTHING, so it cannot fail
-- on valid input; if it ever does fail, a real defect must surface in CI rather
-- than be swallowed into silence -- which is how a producer becomes invisible.
-- ---------------------------------------------------------------------------

create or replace function private.record_automation_calibration_observation(
  p_user_id uuid,
  p_category text,
  p_outcome text,
  p_source_kind text,
  p_subject_key text,
  p_observation_key text,
  p_entry_id uuid,
  p_interpretation_id uuid,
  p_subject_id uuid
)
returns void
language plpgsql
set search_path to ''
as $$
begin
  if p_user_id is null or p_category is null or p_outcome is null then
    return;
  end if;

  insert into public.automation_calibration_observations (
    user_id, category, outcome, source_kind, subject_key, observation_key,
    entry_id, interpretation_id, subject_id
  ) values (
    p_user_id, p_category, p_outcome, p_source_kind, p_subject_key, p_observation_key,
    p_entry_id, p_interpretation_id, p_subject_id
  )
  on conflict (user_id, observation_key) do nothing;
end;
$$;

revoke all on function private.record_automation_calibration_observation(
  uuid, text, text, text, text, text, uuid, uuid, uuid
) from public, anon, authenticated;

-- 10a. Task candidates.
--
-- `confirmed` with a title the owner changed is `corrected`, not `approved`:
-- the suggestion was useful and it was wrong. The title comparison reads
-- content and stores none.
--
-- ONLY `rejected` IS A REJECTION, AND THE PRODUCT'S OWN COPY IS WHY.
--
-- `task-candidate-form.tsx:79-94` defines all four dispositions to the owner,
-- in both locales:
--
--   confirmed  "Criar tarefa"          / "Creates a task with the selected edits."
--   rejected   "Rejeitar sugestao"     / "Marks the suggestion as INCORRECT OR UNSUITABLE."
--   retained   "Manter como registro"  / "Keeps it only in this entry's history."
--   dismissed  "Dispensar sugestao"    / "Closes it WITHOUT SAYING THE SUGGESTION WAS WRONG."
--
-- So `rejected` is the only one that means the suggestion was wrong.
-- `retained` says the owner wanted it as a record rather than a task, and
-- `dismissed` says in as many words that no claim about correctness is being
-- made. Counting either as a miss would systematically understate the model
-- and would put a verdict in the owner's mouth that the interface promised not
-- to take -- which is the same failure as treating absence of review as
-- approval, in the other direction.
--
-- Both therefore produce NO observation at all.
create or replace function private.automation_observation_from_task_resolution()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  candidate_title text;
  stored_title text;
  outcome text;
begin
  if new.disposition = 'confirmed' then
    select pg_catalog.btrim(coalesce(interpretations.task_candidates -> new.candidate_index ->> 'title', ''))
    into candidate_title
    from public.entry_interpretations as interpretations
    where interpretations.id = new.interpretation_id and interpretations.user_id = new.user_id;

    select pg_catalog.btrim(tasks.title) into stored_title
    from public.tasks as tasks
    where tasks.id = new.task_id and tasks.user_id = new.user_id;

    outcome := case
      when candidate_title is null or candidate_title = '' then 'approved'
      when stored_title is null then 'approved'
      when stored_title is distinct from candidate_title then 'corrected'
      else 'approved'
    end;
  elsif new.disposition = 'rejected' then
    outcome := 'rejected';
  else
    -- 'retained' and 'dismissed': see the header. Neither is a claim that the
    -- suggestion was wrong, so neither is evidence.
    return null;
  end if;

  perform private.record_automation_calibration_observation(
    new.user_id,
    'task',
    outcome,
    'task_candidate',
    'task_candidate:' || new.interpretation_id::text || ':' || new.candidate_index::text,
    'task_resolution:' || new.id::text,
    new.entry_id,
    new.interpretation_id,
    new.task_id
  );
  return null;
end;
$$;

revoke all on function private.automation_observation_from_task_resolution() from public, anon, authenticated;

create trigger entry_task_candidate_resolutions_automation_calibration
  after insert on public.entry_task_candidate_resolutions
  for each row execute function private.automation_observation_from_task_resolution();

-- 10b. Person candidates.
--
-- The resolved name differing from the extracted one is the owner correcting
-- an identity, which is precisely the signal 2P-AUTONOMY-006 needs and the one
-- a raw confirmation count would hide.
create or replace function private.automation_observation_from_person_resolution()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  outcome text;
begin
  if new.disposition = 'confirmed' then
    outcome := case
      when new.resolved_name is distinct from new.original_name then 'corrected'
      else 'approved'
    end;
  elsif new.disposition = 'rejected' then
    outcome := 'rejected';
  else
    return null;
  end if;

  perform private.record_automation_calibration_observation(
    new.user_id,
    'person',
    outcome,
    'person_candidate',
    'person_candidate:' || new.interpretation_id::text || ':' || new.candidate_index::text,
    'person_resolution:' || new.interpretation_id::text || ':' || new.candidate_index::text
      || ':' || new.operation_key::text,
    new.entry_id,
    new.interpretation_id,
    new.person_id
  );
  return null;
end;
$$;

revoke all on function private.automation_observation_from_person_resolution() from public, anon, authenticated;

create trigger entry_person_candidate_resolutions_automation_calibration
  after insert on public.entry_person_candidate_resolutions
  for each row execute function private.automation_observation_from_person_resolution();

-- 10c. The owner taking an acceptance back.
--
-- This is the `undone` signal, and it is REACHABLE TODAY: undoing a candidate
-- confirmation is an existing product action with rows on the hosted database.
-- An undo of an automatic write would arrive here too, when one exists.
--
-- It is its own subject rather than an amendment to the approval it reverses,
-- so it never rewrites history: the acceptance and the reversal are both
-- counted, and precision falls accordingly.
create or replace function private.automation_observation_from_undo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  target_category text;
begin
  if new.status <> 'undone' or old.status = 'undone' then
    return null;
  end if;

  target_category := case
    when new.action_type in (
      'confirm_entry_tasks',
      'confirm_entry_task_candidates',
      'confirm_entry_task_candidates_v5',
      'confirm_entry_task_candidates_v6'
    ) then 'task'
    when new.action_type = 'resolve_entry_person_candidates' then 'person'
    else null
  end;

  if target_category is null then
    return null;
  end if;

  perform private.record_automation_calibration_observation(
    new.user_id,
    target_category,
    'undone',
    'acceptance_undone',
    'acceptance_undone:' || new.id::text,
    'acceptance_undone:' || new.id::text,
    new.source_entry_id,
    new.source_interpretation_id,
    null
  );
  return null;
end;
$$;

revoke all on function private.automation_observation_from_undo() from public, anon, authenticated;

create trigger undo_operations_automation_calibration
  after update on public.undo_operations
  for each row execute function private.automation_observation_from_undo();

-- ---------------------------------------------------------------------------
-- 11. What is deliberately absent.
--
-- No policy row is inserted for any account. No category is set to
-- 'automatic_when_eligible'. No automatic writer is created, because none can
-- be authorized: every category reads 'suggest_only_by_owner' with an empty
-- calibration, and the owner's checkpoint is what changes that.
--
-- No retention sweep is scheduled. No product_events vocabulary is widened. No
-- existing grant, policy, function or trigger is modified.
-- ---------------------------------------------------------------------------
