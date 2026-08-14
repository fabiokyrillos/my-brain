-- Phase 2N slice 2N.3 — M3: transactional deletion of a person, a project and
-- a memory (PRD `2N-CORRECT-004…005`, `009…013`; `OD-2N-11` **B**; ADR-113).
--
-- This is the phase's third allocated migration and its ONLY irreversible
-- operation. `3 allocated · M1 spent · M3 here · M2 reserved for 2N.7`, all
-- non-transferable, and **a fourth is a STOP CONDITION**.
--
-- ===========================================================================
-- WHY THIS FILE LOOKS THE WAY IT DOES
-- ===========================================================================
--
-- Everything below is a consequence of something the intermediate deletion
-- re-audit MEASURED against the live database rather than read from the
-- schema (`docs/reports/phase-2n/PHASE_2N_SLICE_3_DELETION_REAUDIT.md`).
--
-- 1. THE CASCADE DOES NOT REACH THE TABLES THAT MATTER MOST.
--    `entry_entities`, `entity_aliases`, `entity_attachments` and
--    `entity_tags` carry `entity_type`/`entity_id` as an **unconstrained
--    pair** — no foreign key at all — validated only by
--    `validate_polymorphic_entity_owner`, a `BEFORE INSERT OR UPDATE` trigger
--    that never fires on the parent's delete. Deleting a person left every one
--    of them alive, pointing at a dead id. `entry_entities` has four live
--    readers, so an entry would go on reporting a mention of someone the owner
--    deleted. **That is the partial deletion `2N-CORRECT-012` forbids**, so
--    this function deletes them EXPLICITLY. Nothing else will.
--
-- 2. THE OWNERSHIP KEYS DO NOT BLOCK THE DELETE.
--    Every relation table holds two keys to its parent: a single-column
--    `CASCADE`/`SET NULL`, and a composite `(user_id, id)` with `NO ACTION`.
--    Which one wins is not readable from the catalogue — both are
--    after-triggers on one event. Measured: **the delete succeeds**, and the
--    cascade satisfies the ownership check before it is evaluated. So this
--    function does not fight them; it relies on them for the tables they cover
--    and covers the rest itself.
--
-- 3. `SECURITY DEFINER` IS FORCED, NOT PREFERRED.
--    `authenticated` holds **no `DELETE` and no `INSERT`** on `entry_entities`
--    or `entity_attachments`. A `SECURITY INVOKER` path would remove **zero**
--    of them and **raise nothing** — RLS filters a `DELETE` silently. The most
--    dangerous failure available here is the quiet one, which is also why
--    `2N-CORRECT-009`'s refusal of a client-side sequence is a proof rather
--    than a rule: a client **cannot** complete this deletion correctly.
--
--    The price is exact, and it was measured rather than assumed: **`postgres`
--    holds `rolbypassrls = true`**, so inside a definer function owned by it,
--    row-level security is not merely satisfied — it is **not consulted at
--    all**, and the `FORCE ROW LEVEL SECURITY` these tables carry protects
--    nothing here. Owner scope therefore stops being the database's job and
--    becomes this file's, entirely.
--
--    Every statement below carries an explicit `user_id = v_owner` predicate,
--    and that predicate is the ONLY thing standing between this function and
--    another account's rows. `supabase/tests/phase_2n_entity_deletion.sql`
--    asserts it against a second owner's identical object rather than trusting
--    this sentence.
--
-- 4. A TRUE UNDO IS POSSIBLE, AND IT WAS PROVED BY EXECUTION.
--    A fully populated person — relations in both directions with types and
--    confidences, an association with a `role`, a context, a task assignment,
--    a task `waiting`, a memory with a real 1536-dimension embedding, an alias,
--    an entry mention — was snapshotted with `to_jsonb`, deleted, restored with
--    `jsonb_populate_recordset` under the **same ids**, and compared: **nine
--    row sets byte-identical**. The embedding survives the round trip at
--    **cosine distance 0**, so a restored memory is retrieved exactly as before
--    **with no provider call**. That is why the snapshot is `to_jsonb` of whole
--    rows and the restore reuses the recorded ids: `2N-CORRECT-007` forbids
--    re-resolving names, and the truth contract refuses to call a lookalike an
--    undo.
--
-- ===========================================================================
-- THE TABLE ADR-113 AUTHORIZED, AND WHY IT EXISTS AT ALL
-- ===========================================================================
--
-- `PHASE_2N_IMPLEMENTATION_PLAN.md` §6.3 predicted M3 would create "one new
-- function, no new table". **That prediction was wrong** and is annotated in
-- place rather than rewritten. A confirmation that is server-issued, single-use
-- and fingerprint-bound **is a row**, and the only existing store —
-- `task_command_confirmations` — is welded to tasks by
-- `foreign key (user_id, task_id) references public.tasks` and by a **closed**
-- `CHECK (action in ('cancel_task','create_task'))` that Phase 2E's own tests
-- defend. Widening it would put deletion into the task-command taxonomy.
--
-- Binding only a fingerprint the caller hands back was considered and refused
-- for the reason `202607260059` already recorded: a value the caller can derive
-- is not evidence, and single-use cannot be enforced without state.
--
-- **It stores identifiers and hashes only.** No name, title, note, memory
-- content, excerpt or endpoint. The enumerated consequences are bound as a
-- **digest**, not stored as counts — the binding is provable and the row
-- carries nothing to leak.
--
-- ===========================================================================
-- WHERE THE DELETED CONTENT LIVES, AND FOR HOW LONG
-- ===========================================================================
--
-- `audit_logs` is append-only and permanent. Writing the snapshot there would
-- turn "delete" into retention **forever**, which is the opposite of what the
-- owner asked for. So the split is deliberate and is asserted by test:
--
--   * `audit_logs`      — actor, target, time, the consequence COUNTS and the
--                         resulting state. Permanent. **No content.**
--   * `undo_operations` — the full snapshot, so the undo can be true.
--                         **24 hours**, then `prune_undo_operations` reaps it.
--
-- That 24-hour window is retention and `2N-CORRECT-012` requires the preview to
-- name it as retention rather than let the owner assume otherwise. No retention
-- value is minted here and **no schedule is created** (`2N-SEC-006`; scheduling
-- is authorization and belongs in an operator script, not a migration).
--
-- Growth of the confirmation store is bounded structurally rather than by a
-- sweep: issuing supersedes the caller's own unconsumed confirmations for the
-- same subject, and `on delete cascade` from `auth.users` clears the rest with
-- the account (`2N-SEC-005`).
--
-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- Drop the three public functions, the two private ones, the three registry
-- rows and the table. **Rows already deleted are not restored by a rollback** —
-- which is exactly why `2N-CORRECT-005` requires a registered undo and
-- `2N-CORRECT-013` makes an un-undoable propagation a stop condition.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The confirmation store
-- ---------------------------------------------------------------------------
-- `entity_id` deliberately carries NO foreign key. Two reasons, and both are
-- load-bearing: a foreign key would cascade the confirmation away with the very
-- row it authorized, destroying the record that consent was given; and a
-- composite owner key would make the consumed row unrepresentable after the
-- delete. Ownership is validated by the issuing function against the subject
-- itself, which is stricter than a key on this column would be.
--
-- The `status`/`consumed_at` equivalence CHECK is what makes "single-use"
-- checkable from the row alone: a `consumed` row with no instant, or an
-- `issued` row carrying one, is unrepresentable rather than merely unexpected.

create table if not exists public.entity_deletion_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation_key text not null,
  request_fingerprint text not null,
  status text not null default 'issued',
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint entity_deletion_confirmations_entity_type_check
    check (entity_type in ('person', 'project', 'memory')),
  constraint entity_deletion_confirmations_operation_key_check
    check (char_length(operation_key) between 8 and 240),
  constraint entity_deletion_confirmations_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint entity_deletion_confirmations_status_check
    check (status in ('issued', 'consumed')),
  constraint entity_deletion_confirmations_consumed_at_check
    check ((status = 'consumed') = (consumed_at is not null))
);

-- Makes issuance idempotent and re-binding impossible: one key, one owner, one
-- subject, forever.
create unique index if not exists entity_deletion_confirmations_operation_key_idx
  on public.entity_deletion_confirmations (user_id, operation_key);

-- Serves the supersede-on-reissue that bounds growth without a sweep.
create index if not exists entity_deletion_confirmations_open_subject_idx
  on public.entity_deletion_confirmations (user_id, entity_type, entity_id)
  where status = 'issued';

alter table public.entity_deletion_confirmations enable row level security;
alter table public.entity_deletion_confirmations force row level security;

drop policy if exists entity_deletion_confirmations_select_own
  on public.entity_deletion_confirmations;
create policy entity_deletion_confirmations_select_own
  on public.entity_deletion_confirmations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.entity_deletion_confirmations
  from public, anon, authenticated, service_role;
grant select on table public.entity_deletion_confirmations to authenticated;

comment on table public.entity_deletion_confirmations is
  'Phase 2N M3 server-issued deletion confirmations (2N-CORRECT-005, ADR-113). One row per (owner, operation key), bound to a digest the server derives from the subject and the consequences the preview enumerated, consumed exactly once inside the deleting transaction. Identifiers and hashes only: no name, title, note, content or excerpt. No role may write it — both writers are SECURITY DEFINER functions.';

-- ---------------------------------------------------------------------------
-- 2. The consequence census — ONE definition, three readers
-- ---------------------------------------------------------------------------
-- The preview, the issuance and the apply all call this. That is the whole
-- mechanism behind "the preview is consistent with the application": a second
-- copy of these counts would be a second definition, and the two would drift
-- exactly once, silently, in the direction that makes the preview a lie.
--
-- Returns NULL when the subject is not the caller's — which is how **absent,
-- foreign and unreadable collapse into one answer**. Every caller turns NULL
-- into the same `P0002`, so no branch exists that could tell them apart. This
-- is the existence-oracle defect the re-audit found live on the memory page,
-- refused here by construction.
--
-- The key set is a UNIFORM SUPERSET across the three types, so the digest is
-- comparable and a type that cannot have a consequence reports `0` rather than
-- omitting the key. An omitted key would make two different states hash alike.
--
-- `stable`, not `immutable`: it reads tables. Not `security definer`: it is
-- called only from definer functions in this file, and exposing it would let a
-- caller probe another owner's graph.

create or replace function private.entity_deletion_consequences(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_exists boolean := false;
begin
  if p_user_id is null or p_entity_id is null then return null; end if;

  if p_entity_type = 'person' then
    select true into v_exists from public.people
     where id = p_entity_id and user_id = p_user_id;
  elsif p_entity_type = 'project' then
    select true into v_exists from public.projects
     where id = p_entity_id and user_id = p_user_id;
  elsif p_entity_type = 'memory' then
    select true into v_exists from public.memories
     where id = p_entity_id and user_id = p_user_id;
  else
    return null;
  end if;

  if not coalesce(v_exists, false) then return null; end if;

  return jsonb_build_object(
    'relations', (
      select pg_catalog.count(*) from public.person_relationships r
       where p_entity_type = 'person' and r.user_id = p_user_id
         and (r.person_id = p_entity_id or r.related_person_id = p_entity_id)),
    'projectLinks', (
      select pg_catalog.count(*) from public.person_projects pp
       where pp.user_id = p_user_id
         and ((p_entity_type = 'person' and pp.person_id = p_entity_id)
           or (p_entity_type = 'project' and pp.project_id = p_entity_id))),
    'taskLinks', (
      select pg_catalog.count(*) from public.task_projects tp
       where p_entity_type = 'project' and tp.user_id = p_user_id
         and tp.project_id = p_entity_id),
    'contextLinks', (
      select pg_catalog.count(*) from public.person_contexts pc
       where p_entity_type = 'person' and pc.user_id = p_user_id
         and pc.person_id = p_entity_id),
    'taskAssignments', (
      select pg_catalog.count(*) from public.task_people tpe
       where p_entity_type = 'person' and tpe.user_id = p_user_id
         and tpe.person_id = p_entity_id),
    'tasksWaiting', (
      select pg_catalog.count(*) from public.tasks t
       where p_entity_type = 'person' and t.user_id = p_user_id
         and t.waiting_on_person_id = p_entity_id),
    'linkedMemories', (
      select pg_catalog.count(*) from public.memories m
       where m.user_id = p_user_id
         and ((p_entity_type = 'person' and m.person_id = p_entity_id)
           or (p_entity_type = 'project' and m.project_id = p_entity_id))),
    -- The four below are the ones no foreign key protects. They are counted
    -- for every type, including `memory`, whose CHECK constraints cannot admit
    -- it — so the census stays uniform and a later widening of any of those
    -- vocabularies is picked up here without a change.
    'entryMentions', (
      select pg_catalog.count(*) from public.entry_entities ee
       where ee.user_id = p_user_id and ee.entity_type = p_entity_type
         and ee.entity_id = p_entity_id),
    'aliases', (
      select pg_catalog.count(*) from public.entity_aliases ea
       where ea.user_id = p_user_id and ea.entity_type = p_entity_type
         and ea.entity_id = p_entity_id),
    'tags', (
      select pg_catalog.count(*) from public.entity_tags et
       where et.user_id = p_user_id and et.entity_type = p_entity_type
         and et.entity_id = p_entity_id),
    'linkedFiles', (
      select pg_catalog.count(*) from public.entity_attachments eat
       where eat.user_id = p_user_id and eat.entity_type = p_entity_type
         and eat.entity_id = p_entity_id)
  );
end;
$$;

revoke all on function private.entity_deletion_consequences(uuid, text, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The fingerprint
-- ---------------------------------------------------------------------------
-- Identical idiom to `public.task_command_fingerprint`, with one deliberate
-- difference: **this one is `private` and granted to nobody**.
--
-- `202607250057:49-53` records why the Phase 2E fingerprint helper cannot be
-- confirmation evidence — it is granted to `authenticated` and derivable from
-- values the caller already holds. Keeping this one unreachable makes that
-- objection structurally impossible here rather than merely answered: the
-- caller cannot compute the digest even in principle.
--
-- `immutable strict` so that issuance and application hashing the same values
-- is a guarantee rather than a convention.

create or replace function private.entity_deletion_fingerprint(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_consequences jsonb,
  p_operation_key text
)
returns text
language sql
immutable strict
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'ownerId', p_user_id,
          'entityType', p_entity_type,
          'entityId', p_entity_id,
          'consequences', p_consequences,
          'operationKey', pg_catalog.btrim(p_operation_key)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function private.entity_deletion_fingerprint(uuid, text, uuid, jsonb, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Preview
-- ---------------------------------------------------------------------------
-- `2N-CORRECT-010`: enumerate the consequences by type, and **never estimate
-- where the database can count**. It is also explicitly NOT an authorization —
-- it writes nothing and issues nothing.
--
-- `retention` is part of the response rather than copy in the UI, because
-- `2N-CORRECT-012` requires the product to say what it keeps **before** the
-- owner confirms, and a fact the server owns should not be re-asserted by a
-- client that could drift from it.

create or replace function public.preview_entity_deletion(
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_consequences jsonb;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_consequences := private.entity_deletion_consequences(v_owner, p_entity_type, p_entity_id);

  -- One answer for absent, foreign, and a type this path does not delete.
  if v_consequences is null then
    raise exception 'Subject not available' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'consequences', v_consequences,
    'undoAvailable', true,
    'retention', jsonb_build_array('audit_trail', 'telemetry', 'linked_files', 'undo_snapshot_24h')
  );
end;
$$;

revoke all on function public.preview_entity_deletion(text, uuid) from public, anon;
grant execute on function public.preview_entity_deletion(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Issuance
-- ---------------------------------------------------------------------------
-- The caller supplies no digest and receives none. The row is the evidence and
-- it never leaves the server; `apply_entity_deletion` resolves it by
-- `(auth.uid(), operation_key)` and re-derives the digest itself.
--
-- Re-issuing for the same subject supersedes the caller's own unconsumed
-- confirmations for it. That is what bounds this table without a sweep, and it
-- is also correct on its own terms: a second preview means the first one is
-- what the owner is no longer looking at.

create or replace function public.issue_entity_deletion_confirmation(
  p_entity_type text,
  p_entity_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_key text := pg_catalog.btrim(coalesce(p_operation_key, ''));
  v_consequences jsonb;
  v_fingerprint text;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if char_length(v_key) not between 8 and 240 then
    raise exception 'Operation key out of bounds' using errcode = '22023';
  end if;

  v_consequences := private.entity_deletion_consequences(v_owner, p_entity_type, p_entity_id);
  if v_consequences is null then
    raise exception 'Subject not available' using errcode = 'P0002';
  end if;

  v_fingerprint := private.entity_deletion_fingerprint(
    v_owner, p_entity_type, p_entity_id, v_consequences, v_key);

  delete from public.entity_deletion_confirmations
   where user_id = v_owner
     and entity_type = p_entity_type
     and entity_id = p_entity_id
     and status = 'issued'
     and operation_key <> v_key;

  insert into public.entity_deletion_confirmations
    (user_id, entity_type, entity_id, operation_key, request_fingerprint)
  values (v_owner, p_entity_type, p_entity_id, v_key, v_fingerprint)
  on conflict (user_id, operation_key) do nothing
  returning id into v_id;

  -- A repeated issuance with the same key is idempotent, not an error: the
  -- owner pressing the button twice has asked for one confirmation.
  if v_id is null then
    select id into v_id from public.entity_deletion_confirmations
     where user_id = v_owner and operation_key = v_key;
  end if;

  return jsonb_build_object(
    'confirmationId', v_id,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'consequences', v_consequences,
    'undoAvailable', true,
    'retention', jsonb_build_array('audit_trail', 'telemetry', 'linked_files', 'undo_snapshot_24h')
  );
end;
$$;

revoke all on function public.issue_entity_deletion_confirmation(text, uuid, text) from public, anon;
grant execute on function public.issue_entity_deletion_confirmation(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Apply — one transaction, or nothing
-- ---------------------------------------------------------------------------
-- Order matters and is deliberate:
--
--   lock the subject  ->  re-census  ->  compare digest  ->  snapshot  ->
--   delete the four polymorphic sets  ->  delete the parent  ->
--   record the undo  ->  audit  ->  consume the confirmation
--
-- The consumption is the LAST write and lives inside this same transaction, so
-- any raise after it rolls it back with everything else and the retry finds the
-- row still `issued`. The opposite arrangement — consume, then delete, in two
-- transactions — would let a lost connection cost the owner their confirmation
-- and force a second deliberate act for something they had already decided.
--
-- The staleness refusal uses `55P03`, and that choice is not free: this
-- repository recorded in `2C-UNDO-004` that `40001` makes the gateway hang, so
-- it is never used for a domain conflict.

create or replace function public.apply_entity_deletion(
  p_entity_type text,
  p_entity_id uuid,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_key text := pg_catalog.btrim(coalesce(p_operation_key, ''));
  v_confirmation public.entity_deletion_confirmations%rowtype;
  v_consequences jsonb;
  v_fingerprint text;
  v_before jsonb;
  v_undo_id uuid;
  v_action text;
  v_replay public.undo_operations%rowtype;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_entity_type not in ('person', 'project', 'memory') then
    raise exception 'Subject not available' using errcode = 'P0002';
  end if;
  v_action := 'delete_' || p_entity_type;

  -- Replay before anything else, so an exact resubmission returns the original
  -- outcome and consumes nothing (the shape `202607260058` established).
  select * into v_replay from public.undo_operations
   where user_id = v_owner and operation_key = v_key and action_type = v_action;
  if v_replay.id is not null then
    return v_replay.after_state || jsonb_build_object('replayed', true);
  end if;

  select * into v_confirmation from public.entity_deletion_confirmations
   where user_id = v_owner and operation_key = v_key
   for update;

  -- Missing, already consumed, or issued for a different subject are all the
  -- same refusal: none of them is authorization, and distinguishing them would
  -- describe another owner's confirmations to whoever guessed a key.
  if v_confirmation.id is null
     or v_confirmation.status <> 'issued'
     or v_confirmation.entity_type <> p_entity_type
     or v_confirmation.entity_id <> p_entity_id then
    raise exception 'Deletion confirmation required' using errcode = '42501';
  end if;

  -- Lock the subject, then re-census. Taking the lock first is what makes the
  -- census a precondition rather than a guess about a row that can still move.
  if p_entity_type = 'person' then
    perform 1 from public.people where id = p_entity_id and user_id = v_owner for update;
  elsif p_entity_type = 'project' then
    perform 1 from public.projects where id = p_entity_id and user_id = v_owner for update;
  else
    perform 1 from public.memories where id = p_entity_id and user_id = v_owner for update;
  end if;

  v_consequences := private.entity_deletion_consequences(v_owner, p_entity_type, p_entity_id);
  if v_consequences is null then
    raise exception 'Subject not available' using errcode = 'P0002';
  end if;

  v_fingerprint := private.entity_deletion_fingerprint(
    v_owner, p_entity_type, p_entity_id, v_consequences, v_key);

  -- Expiry by FACT, never by clock, and never by a token the client carries.
  if v_fingerprint <> v_confirmation.request_fingerprint then
    raise exception 'The consequences changed since this deletion was previewed'
      using errcode = '55P03', detail = 'DELETION_PRECONDITION_CHANGED';
  end if;

  -- -----------------------------------------------------------------------
  -- Snapshot. Whole rows via `to_jsonb`, because a true undo must return the
  -- same ids with the same relations, roles and validity — proved byte for
  -- byte by the re-audit. For the two SET NULL columns only the ids are kept:
  -- the rows survive the delete, so restoring the link needs nothing more, and
  -- keeping less is keeping less content.
  -- -----------------------------------------------------------------------
  -- EVERY VALUE IS AN ARRAY, ALWAYS. `jsonb_agg` over no rows returns SQL NULL
  -- and `jsonb_build_object` turns that into JSON `null` — which `coalesce` in
  -- the handler could never repair, because JSON `null` is not SQL NULL. The
  -- handler would then hand `null` to `jsonb_populate_recordset`. Each value is
  -- therefore collapsed to `[]` here, at the only place that can do it.
  v_before := jsonb_build_object(
    'entityType', p_entity_type,
    'people', case when p_entity_type = 'person' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.people t
        where t.id = p_entity_id and t.user_id = v_owner), '[]'::jsonb) else '[]'::jsonb end,
    'projects', case when p_entity_type = 'project' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.projects t
        where t.id = p_entity_id and t.user_id = v_owner), '[]'::jsonb) else '[]'::jsonb end,
    'memories', case when p_entity_type = 'memory' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.memories t
        where t.id = p_entity_id and t.user_id = v_owner), '[]'::jsonb) else '[]'::jsonb end,
    'person_relationships', case when p_entity_type = 'person' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.person_relationships t
        where t.user_id = v_owner
          and (t.person_id = p_entity_id or t.related_person_id = p_entity_id)), '[]'::jsonb) else '[]'::jsonb end,
    'person_projects', coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.person_projects t
        where t.user_id = v_owner
          and ((p_entity_type = 'person' and t.person_id = p_entity_id)
            or (p_entity_type = 'project' and t.project_id = p_entity_id))), '[]'::jsonb),
    'person_contexts', case when p_entity_type = 'person' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.person_contexts t
        where t.user_id = v_owner and t.person_id = p_entity_id), '[]'::jsonb) else '[]'::jsonb end,
    'task_people', case when p_entity_type = 'person' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.task_people t
        where t.user_id = v_owner and t.person_id = p_entity_id), '[]'::jsonb) else '[]'::jsonb end,
    'task_projects', case when p_entity_type = 'project' then coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.task_projects t
        where t.user_id = v_owner and t.project_id = p_entity_id), '[]'::jsonb) else '[]'::jsonb end,
    'entity_aliases', coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.entity_aliases t
        where t.user_id = v_owner and t.entity_type = p_entity_type and t.entity_id = p_entity_id), '[]'::jsonb),
    'entity_tags', coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.entity_tags t
        where t.user_id = v_owner and t.entity_type = p_entity_type and t.entity_id = p_entity_id), '[]'::jsonb),
    'entity_attachments', coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.entity_attachments t
        where t.user_id = v_owner and t.entity_type = p_entity_type and t.entity_id = p_entity_id), '[]'::jsonb),
    'entry_entities', coalesce(
      (select jsonb_agg(to_jsonb(t)) from public.entry_entities t
        where t.user_id = v_owner and t.entity_type = p_entity_type and t.entity_id = p_entity_id), '[]'::jsonb),
    'tasks_waiting', case when p_entity_type = 'person' then coalesce(
      (select jsonb_agg(jsonb_build_object('id', t.id)) from public.tasks t
        where t.user_id = v_owner and t.waiting_on_person_id = p_entity_id), '[]'::jsonb) else '[]'::jsonb end,
    'memories_person', case when p_entity_type = 'person' then coalesce(
      (select jsonb_agg(jsonb_build_object('id', t.id)) from public.memories t
        where t.user_id = v_owner and t.person_id = p_entity_id), '[]'::jsonb) else '[]'::jsonb end,
    'memories_project', case when p_entity_type = 'project' then coalesce(
      (select jsonb_agg(jsonb_build_object('id', t.id)) from public.memories t
        where t.user_id = v_owner and t.project_id = p_entity_id), '[]'::jsonb) else '[]'::jsonb end
  );

  -- -----------------------------------------------------------------------
  -- The four sets no cascade reaches. This is the whole reason M3 exists as a
  -- definer function rather than a client sequence.
  -- -----------------------------------------------------------------------
  delete from public.entry_entities
   where user_id = v_owner and entity_type = p_entity_type and entity_id = p_entity_id;
  delete from public.entity_aliases
   where user_id = v_owner and entity_type = p_entity_type and entity_id = p_entity_id;
  delete from public.entity_tags
   where user_id = v_owner and entity_type = p_entity_type and entity_id = p_entity_id;
  delete from public.entity_attachments
   where user_id = v_owner and entity_type = p_entity_type and entity_id = p_entity_id;

  -- The parent. `CASCADE` takes the relation tables and `SET NULL` severs the
  -- two links whose rows survive — measured, not assumed.
  if p_entity_type = 'person' then
    delete from public.people where id = p_entity_id and user_id = v_owner;
  elsif p_entity_type = 'project' then
    delete from public.projects where id = p_entity_id and user_id = v_owner;
  else
    delete from public.memories where id = p_entity_id and user_id = v_owner;
  end if;

  insert into public.undo_operations
    (user_id, action_type, entity_type, entity_ids, before_state, after_state,
     operation_key, request_fingerprint)
  values (
    v_owner, v_action, p_entity_type, array[p_entity_id], v_before,
    jsonb_build_object(
      'deleted', true,
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'consequences', v_consequences),
    v_key, v_fingerprint)
  returning id into v_undo_id;

  -- Counts and the resulting state, never the content: this row is permanent
  -- and content here would be retention rather than removal.
  insert into public.audit_logs
    (user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason)
  values (
    v_owner, v_action, p_entity_type, p_entity_id, 'user',
    jsonb_build_object('consequences', v_consequences),
    jsonb_build_object('deleted', true, 'undoId', v_undo_id),
    'owner_requested_deletion');

  update public.entity_deletion_confirmations
     set status = 'consumed', consumed_at = now()
   where id = v_confirmation.id and status = 'issued';

  return jsonb_build_object(
    'deleted', true,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'consequences', v_consequences,
    'undoId', v_undo_id,
    'undoExpiresAt', (select expires_at from public.undo_operations where id = v_undo_id)
  );
end;
$$;

revoke all on function public.apply_entity_deletion(text, uuid, text) from public, anon;
grant execute on function public.apply_entity_deletion(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The undo handler
-- ---------------------------------------------------------------------------
-- One handler, three registered `action_type` values — the shape
-- `undo_resolve_pending_question_v2_v3` already uses. It refuses any action it
-- does not own, so a registry mistake cannot aim it at something else.
--
-- Every restore is filtered `where r.user_id = p_user_id`. The snapshot was
-- written by `apply_entity_deletion` and `undo_operations` is unwritable by
-- `authenticated`, so a hostile `before_state` should not be reachable — but
-- the filter makes cross-tenant restoration structurally impossible rather
-- than merely unreachable, which is the difference between a guarantee and an
-- argument.
--
-- The restore order follows the foreign keys: parent, then relations, then the
-- unconstrained tables, then the two severed links. If any row cannot come
-- back — the related person was deleted meanwhile, the task is gone — the
-- whole undo raises and this transaction rolls back. **Failing whole is the
-- contract**; restoring a subset would be exactly the partial state
-- `2N-CORRECT-012` refuses.

create or replace function private.undo_delete_entity(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  snap jsonb;
  v_type text;
  v_restored int := 0;
  v_n int;
begin
  select * into operation from public.undo_operations
   where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type not in ('delete_person', 'delete_project', 'delete_memory') then
    raise exception 'Unsupported undo operation';
  end if;

  snap := operation.before_state;
  v_type := snap ->> 'entityType';
  if v_type is null then
    raise exception 'Deletion undo integrity check failed'
      using errcode = 'P0001', detail = 'UNDO_SNAPSHOT_INCOMPLETE';
  end if;

  insert into public.people select r.* from
    jsonb_populate_recordset(null::public.people, coalesce(snap -> 'people', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.projects select r.* from
    jsonb_populate_recordset(null::public.projects, coalesce(snap -> 'projects', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.memories select r.* from
    jsonb_populate_recordset(null::public.memories, coalesce(snap -> 'memories', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.person_relationships select r.* from
    jsonb_populate_recordset(null::public.person_relationships, coalesce(snap -> 'person_relationships', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.person_projects select r.* from
    jsonb_populate_recordset(null::public.person_projects, coalesce(snap -> 'person_projects', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.person_contexts select r.* from
    jsonb_populate_recordset(null::public.person_contexts, coalesce(snap -> 'person_contexts', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.task_people select r.* from
    jsonb_populate_recordset(null::public.task_people, coalesce(snap -> 'task_people', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.task_projects select r.* from
    jsonb_populate_recordset(null::public.task_projects, coalesce(snap -> 'task_projects', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.entity_aliases select r.* from
    jsonb_populate_recordset(null::public.entity_aliases, coalesce(snap -> 'entity_aliases', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.entity_tags select r.* from
    jsonb_populate_recordset(null::public.entity_tags, coalesce(snap -> 'entity_tags', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.entity_attachments select r.* from
    jsonb_populate_recordset(null::public.entity_attachments, coalesce(snap -> 'entity_attachments', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  insert into public.entry_entities select r.* from
    jsonb_populate_recordset(null::public.entry_entities, coalesce(snap -> 'entry_entities', '[]'::jsonb)) r
    where r.user_id = p_user_id;
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  update public.tasks set waiting_on_person_id = (operation.entity_ids)[1]
   where user_id = p_user_id
     and id in (select (e.value ->> 'id')::uuid
                  from jsonb_array_elements(coalesce(snap -> 'tasks_waiting', '[]'::jsonb)) e);
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  update public.memories set person_id = (operation.entity_ids)[1]
   where user_id = p_user_id
     and id in (select (e.value ->> 'id')::uuid
                  from jsonb_array_elements(coalesce(snap -> 'memories_person', '[]'::jsonb)) e);
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  update public.memories set project_id = (operation.entity_ids)[1]
   where user_id = p_user_id
     and id in (select (e.value ->> 'id')::uuid
                  from jsonb_array_elements(coalesce(snap -> 'memories_project', '[]'::jsonb)) e);
  get diagnostics v_n = row_count; v_restored := v_restored + v_n;

  update public.undo_operations
     set status = 'undone', undone_at = now()
   where id = operation.id and user_id = p_user_id;

  -- The undo is itself an act, and the trail says so rather than pretending
  -- the deletion never happened.
  insert into public.audit_logs
    (user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason)
  values (
    p_user_id, 'undo_' || operation.action_type, v_type, (operation.entity_ids)[1], 'user',
    jsonb_build_object('deleted', true),
    jsonb_build_object('restored', true, 'rows', v_restored),
    'owner_requested_undo');

  return jsonb_build_object('undone', true, 'affected', v_restored, 'entityType', v_type);
end;
$$;

revoke all on function private.undo_delete_entity(uuid, uuid)
  from public, anon, authenticated, service_role;

insert into private.undo_operation_handlers (action_type, handler_function, description) values
  ('delete_person',  'undo_delete_entity', 'Phase 2N M3 — restores a deleted person with its relations, associations, roles and severed links, under the same ids.'),
  ('delete_project', 'undo_delete_entity', 'Phase 2N M3 — restores a deleted project with its associations and severed memory links, under the same ids.'),
  ('delete_memory',  'undo_delete_entity', 'Phase 2N M3 — restores a deleted memory whole, embedding included, so retrievability returns without a provider call.')
on conflict (action_type) do update
set handler_function = excluded.handler_function,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- 8. Verification
-- ---------------------------------------------------------------------------
-- These read the function BODIES and the catalogue, never the text of this
-- file. M1 recorded why, twice in one migration: a check that greps the file
-- finds the header comment describing the defect and raises against a correct
-- migration. Each check below also has to be able to FAIL — a check that a
-- correct and an incorrect state both satisfy is decoration.

do $verify$
declare
  v_body text;
  v_scheduled bigint;
begin
  if to_regclass('public.entity_deletion_confirmations') is null then
    raise exception 'M3: the confirmation store was not created';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'entity_deletion_confirmations'
       and grantee in ('authenticated', 'anon', 'service_role')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'M3: a client role can write confirmations, which would make them forgeable';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
     where c.oid = 'public.entity_deletion_confirmations'::regclass
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'M3: RLS is not both enabled and forced on the confirmation store';
  end if;

  -- SECURITY DEFINER is not a preference here: without it the deletion cannot
  -- reach entry_entities at all, and would remove zero rows without raising.
  if not exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.proname = 'apply_entity_deletion' and p.prosecdef
       and pg_catalog.array_to_string(p.proconfig, ',') = 'search_path=""'
  ) then
    raise exception 'M3: apply_entity_deletion is not SECURITY DEFINER with an empty search_path';
  end if;

  -- The fingerprint helper must be unreachable by the caller. If it ever gains
  -- EXECUTE, a caller could derive the digest and the confirmation stops being
  -- evidence — the exact objection 202607250057 raised against Phase 2E's.
  if pg_catalog.has_function_privilege('authenticated',
       'private.entity_deletion_fingerprint(uuid, text, uuid, jsonb, text)', 'execute') then
    raise exception 'M3: authenticated can execute the fingerprint helper, which would make the confirmation client-derivable';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid) into v_body
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'apply_entity_deletion';

  -- The four tables no cascade reaches. Their absence is the defect this
  -- migration exists to prevent, so it is checked per table rather than as a
  -- single "polymorphic" mention that one missing DELETE would still satisfy.
  if v_body not like '%delete from public.entry_entities%' then
    raise exception 'M3: the deletion does not remove entry_entities, which no cascade covers';
  end if;
  if v_body not like '%delete from public.entity_aliases%' then
    raise exception 'M3: the deletion does not remove entity_aliases, which no cascade covers';
  end if;
  if v_body not like '%delete from public.entity_tags%' then
    raise exception 'M3: the deletion does not remove entity_tags, which no cascade covers';
  end if;
  if v_body not like '%delete from public.entity_attachments%' then
    raise exception 'M3: the deletion does not remove entity_attachments, which no cascade covers';
  end if;

  if v_body not like '%public.undo_operations%' then
    raise exception 'M3: the deletion records no undo reservation, so it could not be reversed';
  end if;

  if (select pg_catalog.count(*) from private.undo_operation_handlers
       where action_type in ('delete_person', 'delete_project', 'delete_memory')) <> 3 then
    raise exception 'M3: not all three deletions have a registered undo handler';
  end if;

  -- No schedule is created here. 2N-SEC-006 and the post-2H correction both
  -- record that scheduling IS authorization and belongs to an operator script.
  --
  -- `to_regclass` rather than `'cron'::regnamespace`: the cast RAISES when the
  -- schema is absent, and CI builds this database from empty, where pg_cron
  -- need not exist. A guard that errors on a clean database is not a guard.
  -- The lookup is dynamic for the same reason — plpgsql plans a statement on
  -- first execution, and this one must be reachable only when the table is.
  if to_regclass('cron.job') is not null then
    execute 'select pg_catalog.count(*) from cron.job where command like ''%entity_deletion_confirmations%'''
      into v_scheduled;
    if coalesce(v_scheduled, 0) > 0 then
      raise exception 'M3: a migration scheduled a sweep, which is authorization rather than schema';
    end if;
  end if;
end;
$verify$;
