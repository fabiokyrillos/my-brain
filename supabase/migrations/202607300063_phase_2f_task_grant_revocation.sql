-- Phase 2F Slice 2F.4 — task grant revocation (2F-REVOKE-001, 2F-REMINDER-003).
--
-- This migration closes the Phase 2F invariant at the only layer where it was
-- still open. Since Slice 2F.3 no application module issues a direct INSERT,
-- UPDATE or DELETE against `public.tasks`; the architecture gate's `tasks`
-- allowlist has been empty and compared by exact equality in both directions
-- (`src/lib/supabase/direct-write-guard.test.ts:49`). What still permitted a
-- direct write was the grant, not a caller. This removes it.
--
-- PRIVILEGE PROVENANCE — corrected, because two gates turn on it
-- -----------------------------------------------------------------------------
-- PRD Revision 4 §12 stated that no explicit `grant` on `tasks`/`reminders`
-- existed in the migration chain and that the privileges came from Supabase's
-- platform defaults. **That was wrong for `authenticated`, and PRD Revision 4.2
-- corrects it** (owner decision A1). The grants are real, versioned and issued
-- dynamically, which is why a literal search for `grant … on public.tasks`
-- finds nothing:
--
--   * `202607160003:185-196` — a `DO` loop over an array that includes 'tasks',
--     issuing `grant select, insert, update, delete on public.%I to authenticated`
--     and `revoke all on public.%I from anon`.
--   * `202607160007:155-163` — the same loop shape over an array that includes
--     'reminders'.
--
-- Three consequences, each load-bearing:
--
--   1. This revocation narrows a privilege **this repository granted**, in the
--      same style `202607170016:196-252` already uses for nine other tables. It
--      is not a departure from the chain; it is the chain's own idiom.
--   2. The re-grant rollback (`scripts/phase-2f-regrant-task-write-grants.sql`)
--      is the exact textual inverse of two known statements, not a guess at an
--      unversioned platform default.
--   3. `supabase/tests/phase_2f_task_write_grants.sql` can assert the
--      pre-revocation state non-vacuously *because* it is versioned: on a stack
--      built by `supabase db reset`, the privileges exist because migration
--      `202607160003` granted them.
--
--   For `service_role` the original claim holds: no table grant to it exists
--   anywhere in the chain, so its access is Supabase's default. Nothing here
--   touches it.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -----------------------------------------------------------------------------
-- No RLS policy is created, altered or dropped; no trigger is touched; no
-- function signature changes; no RPC is added; no grant widens anywhere; and no
-- row of production data is written or deleted. A revocation writes nothing,
-- which is why this slice is the only one in Phase 2F with no data residual.
--
-- The four owner-scoped RLS policies on each table survive intact. Two of them
-- per table (`_update_own`, `_delete_own`, plus `tasks_insert_own`) become
-- **unreachable by direct client DML**, because the grant check runs before the
-- policy is ever consulted. They are deliberately retained rather than dropped:
-- 2F-REVOKE-006 says policies are unchanged, dropping them would be a second
-- change with its own rollback, and re-granting must restore the prior posture
-- exactly. The unreachability is recorded in `DATABASE.md` and `SECURITY.md`
-- rather than silently implied (owner decision A5).
--
-- THE RETAINED REMINDER EXCEPTION
-- -----------------------------------------------------------------------------
-- `authenticated` keeps INSERT on `public.reminders`. That is the Option C
-- exception of PRD §2 item 6 (owner decision 3), whose sole production caller is
-- `createReminder` (`src/features/agent/actions.ts:125`) and which the
-- architecture gate allowlists explicitly and permanently, so the gate never
-- claims an emptiness that is false.
--
-- UPDATE and DELETE on `public.reminders` are revoked here on the 2F-REMINDER-003
-- determination (owner decision A4), written out in `SECURITY.md`. The evidence:
-- no production module issues either; every reminder UPDATE in production runs
-- inside `apply_task_command` or `run_user_heartbeat` (both SECURITY DEFINER) or
-- inside a `private.undo_*` handler reached only through the SECURITY DEFINER
-- `undo_operation` router; and **no `delete` against `public.reminders` exists
-- anywhere in the repository at all** — reminder rows are removed only by the
-- `on delete cascade` from `public.tasks`, `public.entries` and `auth.users`.
--
-- THE TRIGGER ORDERING CONSEQUENCE (2F-REVOKE-002)
-- -----------------------------------------------------------------------------
-- `public.create_due_task_reminder` is `security invoker` (`202607160007:195-199`)
-- and fires `after insert on public.tasks`. Before this migration a task INSERT
-- by `authenticated` ran that trigger as `authenticated`, which the retained
-- reminders INSERT grant permitted. After it, **no task INSERT can originate in a
-- client context at all** — every surviving one is inside a SECURITY DEFINER body
-- (`create_task_command`, `confirm_entry_task_candidates*`), so the trigger
-- executes as the function owner. The hazard closes by construction; the pgTAP
-- suite asserts it rather than assuming it.

-- ---------------------------------------------------------------------------
-- 1. The revocation
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.tasks from authenticated;

revoke update, delete on public.reminders from authenticated;

comment on table public.tasks is
  'Phase 2F Slice 2F.4: authenticated holds SELECT only. Every task INSERT and UPDATE goes through a validated SECURITY DEFINER contract (the Phase 2E apply/creation family, the Phase 2C candidate-materialization family, the registered private.undo_* handlers reached through undo_operation) or a privileged worker. No task DELETE path exists anywhere; rows are retired by transition to cancelled and removed only by the auth.users cascade.';

comment on table public.reminders is
  'Phase 2F Slice 2F.4: authenticated holds SELECT and INSERT. INSERT is the documented Option C authoring exception (PRD §2 item 6, sole caller createReminder); UPDATE and DELETE are revoked on the 2F-REMINDER-003 determination. Reminder mutation in production is derived reconciliation inside apply_task_command and the undo handlers, or delivery mark-sent inside run_user_heartbeat. Rows are removed only by cascade.';

-- ---------------------------------------------------------------------------
-- 2. Post-deploy assertions
-- ---------------------------------------------------------------------------
--
-- Fail-closed: each raises and aborts the enclosing transaction, so a successful
-- apply *is* the proof. Written without `coalesce`/`nullif`/`greatest`/`least`
-- and without a bare `case … then` inside an `if` condition, per the Phase 2F
-- grammar-trap guard (2F-GUARD-001).

do $post_deploy$
declare
  denied text;
  retained text;
  policy_count integer;
  trigger_count integer;
  rls_enabled boolean;
  rls_forced boolean;
  invoker boolean;
begin
  -- 1. `authenticated` lost exactly the three task write privileges.
  for denied in select unnest(array['insert', 'update', 'delete']) loop
    if pg_catalog.has_table_privilege('authenticated', 'public.tasks', denied) then
      raise exception 'authenticated still holds % on public.tasks', denied;
    end if;
  end loop;

  -- 2. …and kept the one read privilege every projection in the product needs.
  --    Asserted positively, because a revocation that took SELECT with it would
  --    break every surface while every denial assertion above still passed.
  if not pg_catalog.has_table_privilege('authenticated', 'public.tasks', 'select') then
    raise exception 'authenticated lost select on public.tasks';
  end if;

  -- 3. `authenticated` lost reminder UPDATE and DELETE (2F-REMINDER-003).
  for denied in select unnest(array['update', 'delete']) loop
    if pg_catalog.has_table_privilege('authenticated', 'public.reminders', denied) then
      raise exception 'authenticated still holds % on public.reminders', denied;
    end if;
  end loop;

  -- 4. …and kept SELECT and INSERT. The INSERT half is the Option C exception:
  --    if this assertion ever fails, `createReminder` is broken in production.
  for retained in select unnest(array['select', 'insert']) loop
    if not pg_catalog.has_table_privilege('authenticated', 'public.reminders', retained) then
      raise exception 'authenticated lost % on public.reminders', retained;
    end if;
  end loop;

  -- 5. `anon` holds nothing on either table, as `202607160003:196` and
  --    `202607160007:163` established and this migration must not disturb.
  for denied in select unnest(array['select', 'insert', 'update', 'delete']) loop
    if pg_catalog.has_table_privilege('anon', 'public.tasks', denied) then
      raise exception 'anon holds % on public.tasks', denied;
    end if;
    if pg_catalog.has_table_privilege('anon', 'public.reminders', denied) then
      raise exception 'anon holds % on public.reminders', denied;
    end if;
  end loop;

  -- 6. RLS is still enabled AND forced on both tables. `force` matters
  --    independently: without it the table owner bypasses every policy.
  for retained in select unnest(array['tasks', 'reminders']) loop
    select class.relrowsecurity, class.relforcerowsecurity
    into strict rls_enabled, rls_forced
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and class.relname = retained;

    if not rls_enabled then
      raise exception 'row level security is not enabled on public.%', retained;
    end if;
    if not rls_forced then
      raise exception 'row level security is not forced on public.%', retained;
    end if;
  end loop;

  -- 7. All eight owner-scoped policies survive, including the three that this
  --    revocation makes unreachable from a client role. Retaining them is the
  --    recorded decision (A5); dropping one silently would make the re-grant
  --    script an incomplete rollback.
  select pg_catalog.count(*)
  into policy_count
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as class on class.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname in ('tasks', 'reminders')
    and policy.polname in (
      'tasks_select_own', 'tasks_insert_own', 'tasks_update_own', 'tasks_delete_own',
      'reminders_select_own', 'reminders_insert_own', 'reminders_update_own', 'reminders_delete_own'
    );
  if policy_count <> 8 then
    raise exception 'expected the 8 owner-scoped policies on tasks/reminders, found %', policy_count;
  end if;

  -- 8. All six user-defined triggers survive. `tgisinternal` excludes the
  --    foreign-key enforcement triggers, which are not this migration's subject.
  select pg_catalog.count(*)
  into trigger_count
  from pg_catalog.pg_trigger as trigger_row
  join pg_catalog.pg_class as class on class.oid = trigger_row.tgrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and not trigger_row.tgisinternal
    and trigger_row.tgname in (
      'tasks_audit_changes', 'tasks_create_due_reminder', 'tasks_updated_at',
      'tasks_guard_terminal_candidate_resolution', 'tasks_record_candidate_confirmation',
      'reminders_updated_at'
    );
  if trigger_count <> 6 then
    raise exception 'expected the 6 user triggers on tasks/reminders, found %', trigger_count;
  end if;

  -- 9. `create_due_task_reminder` is still SECURITY INVOKER (2F-REVOKE-002).
  --    Asserted, not assumed: silently promoting it to definer would hide the
  --    very ordering property this slice has to prove, by making the trigger
  --    work regardless of who inserted the task.
  select not procedure.prosecdef
  into strict invoker
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'create_due_task_reminder';
  if not invoker then
    raise exception 'public.create_due_task_reminder is no longer security invoker';
  end if;
end
$post_deploy$;
