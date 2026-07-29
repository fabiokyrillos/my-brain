-- Phase 2F Slice 2F.4 — the committed re-grant rollback (2F-REVOKE-003).
--
-- **This is a rollback script, not a migration.** It lives in `scripts/` on
-- purpose: it must never be applied by `supabase db push`, never enter the
-- migration chain, and never run as part of a deploy. It exists to be executed
-- deliberately, by a human, in a deployment session where the revocation in
-- `202607300063_phase_2f_task_grant_revocation.sql` has to be undone — and to be
-- rehearsed automatically in CI so that "we can roll this back" is an executed
-- claim rather than an intention.
--
-- WHAT IT IS
-- -----------------------------------------------------------------------------
-- The exact operational inverse of that migration's two `revoke` statements, and
-- nothing else. It restores the privileges `202607160003:195` and
-- `202607160007:162` originally granted — which is why it can be exact rather
-- than reconstructed: the pre-revocation posture is versioned in this repository,
-- not inherited from an unversioned platform default (PRD Revision 4.2 §12,
-- owner decision A1).
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
-- -----------------------------------------------------------------------------
--   * `select` on either table — never revoked, so never restored.
--   * `insert` on `public.reminders` — the retained Option C exception. It was
--     never revoked; re-granting it here would be a no-op that misleads a reader
--     into thinking it had been.
--   * RLS policies, triggers, functions, signatures, grants to any other role.
--   * Data. This script writes and deletes nothing.
--
-- WHAT ITS CI REHEARSAL PROVES — stated exactly, and no wider
-- -----------------------------------------------------------------------------
-- The `database` job applies this script after the full chain and the normal
-- pgTAP suite have already run under the post-revocation posture, then proves by
-- pgTAP that the previously-revoked writes function again.
--
--   PROVES: this committed SQL applies without error against a stack carrying
--   the whole migration chain, and restores the versioned migration-chain
--   privileges it names — INSERT/UPDATE/DELETE on `public.tasks` and
--   UPDATE/DELETE on `public.reminders` for `authenticated` — such that a write
--   previously refused now succeeds.
--
--   DOES NOT PROVE, and may never be cited as proving:
--     * live PostgREST schema-cache convergence. PostgREST caches the schema and
--       its privileges; how quickly a hosted instance observes a grant change is
--       not observable on this stack at all.
--     * in-flight session behaviour — what happens to requests already open when
--       the privilege changes.
--     * an operational rollback against production, which involves both of the
--       above plus a live user population.
--
-- Those three are verified, if at all, in the 2F.4 deployment session itself,
-- where they are actually observable. The phrase "rehearsed in CI" is only
-- truthful with this scope attached.
--
-- USAGE
-- -----------------------------------------------------------------------------
--   Local / CI:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/phase-2f-regrant-task-write-grants.sql
--   Linked:      supabase db query --linked -f scripts/phase-2f-regrant-task-write-grants.sql
--
-- It is idempotent: re-running it against an already-re-granted database is a
-- no-op that still passes its own assertions.

begin;

-- ---------------------------------------------------------------------------
-- 1. Restore exactly what the revocation removed
-- ---------------------------------------------------------------------------

grant insert, update, delete on public.tasks to authenticated;

grant update, delete on public.reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fail-closed verification of the restore
-- ---------------------------------------------------------------------------
--
-- A rollback script that silently half-applied would be worse than none: the
-- operator would believe the surface was restored. Each assertion raises and
-- aborts the transaction, so a committed run *is* the proof.

do $regrant$
declare
  restored text;
begin
  for restored in select unnest(array['insert', 'update', 'delete']) loop
    if not pg_catalog.has_table_privilege('authenticated', 'public.tasks', restored) then
      raise exception 're-grant failed: authenticated still lacks % on public.tasks', restored;
    end if;
  end loop;

  for restored in select unnest(array['update', 'delete']) loop
    if not pg_catalog.has_table_privilege('authenticated', 'public.reminders', restored) then
      raise exception 're-grant failed: authenticated still lacks % on public.reminders', restored;
    end if;
  end loop;

  -- The two privileges this script must NOT have disturbed. Asserted because a
  -- careless edit that widened the grant list would otherwise pass unnoticed —
  -- these were true before and must be true after, unchanged.
  if not pg_catalog.has_table_privilege('authenticated', 'public.tasks', 'select') then
    raise exception 're-grant disturbed select on public.tasks';
  end if;
  if not pg_catalog.has_table_privilege('authenticated', 'public.reminders', 'insert') then
    raise exception 're-grant disturbed insert on public.reminders';
  end if;

  -- `anon` must remain empty-handed. A rollback is not an occasion to widen.
  for restored in select unnest(array['select', 'insert', 'update', 'delete']) loop
    if pg_catalog.has_table_privilege('anon', 'public.tasks', restored) then
      raise exception 're-grant leaked % on public.tasks to anon', restored;
    end if;
    if pg_catalog.has_table_privilege('anon', 'public.reminders', restored) then
      raise exception 're-grant leaked % on public.reminders to anon', restored;
    end if;
  end loop;
end
$regrant$;

commit;
