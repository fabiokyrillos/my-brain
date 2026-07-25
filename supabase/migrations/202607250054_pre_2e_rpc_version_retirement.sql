-- Pre-Phase-2E hardening: first application of the RPC version retirement
-- policy (docs/DATABASE.md "Política de aposentadoria de versões de RPC",
-- ADR-037).
--
-- WHY (architecture review July 2026, finding H3)
-- Ten mutation RPC generations across two versioned families were all still
-- executable by `authenticated`, with no policy saying when that ends. Every
-- retained version is an independently reachable write path into
-- `tasks`/`undo_operations` that must stay correct forever; migration
-- 202607220040 is 2,368 lines precisely because one bug had to be fixed in
-- five function bodies. Phase 2E starts its own `_vN` family, so the lifecycle
-- has to exist before it does.
--
-- WHAT THIS MIGRATION DOES
-- Exactly one revocation, the only one a repository-wide consumer search
-- justifies: `public.confirm_entry_tasks(uuid, integer[])`.
--
-- EVIDENCE FOR THIS ONE
--   * No `.rpc("confirm_entry_tasks"` anywhere in src/, supabase/functions/,
--     scripts/ or e2e/ — it has never had an application caller.
--   * No SQL function calls it; `undo_operation` only dispatches on the
--     recorded `action_type` string, which is unaffected by a grant.
--   * pgTAP references it only through `has_function` and a `prosecdef` check,
--     both of which keep passing: the body is retained, not dropped.
--   * The Phase 2C GATE-03 retention claim
--     (docs/reports/PHASE_2C_TRACEABILITY_MATRIX.md) names the
--     `confirm_entry_task_candidates` family. This unversioned Phase-1
--     function is not part of it.
--   * 202607180028 recorded that this function had never worked for a real
--     authenticated user before that migration fixed it, and it gained no
--     consumer afterwards.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * It does not drop any function body. Bodies stay for audit reading and
--     because undo evidence still names their operations. Revoking execute is
--     always preferred to dropping (policy §4).
--   * It does not touch `resolve_pending_question_v1`/`_v2`/`_v3`. Their
--     retirement is explicitly deferred to a separately authorized step by
--     PHASE_2D_PRD.md §21 item 7, ADR-034 decision 2, and STATE.md. That
--     deferral stands.
--   * It does not touch `confirm_entry_task_candidates`/`_v2`.../`_v6`: GATE-03
--     claims they remain callable for rollback, and `_v4`/`_v6` are live.
--
-- ROLLBACK
--   `grant execute on function public.confirm_entry_tasks(uuid, integer[]) to authenticated;`
--   Nothing else is needed: the body, its grants to no other role, and its
--   undo branch are untouched.

revoke execute on function public.confirm_entry_tasks(uuid, integer[]) from authenticated;

-- ---------------------------------------------------------------------------
-- Fail-closed post-deploy assertions
-- ---------------------------------------------------------------------------
-- The policy's own guarantees, checked at deploy time: the retired function
-- keeps its body, loses only `authenticated`, and every version whose
-- retention is claimed by a governing document stays reachable.

do $$
declare
  retained text;
  still_granted text;
begin
  if to_regprocedure('public.confirm_entry_tasks(uuid, integer[])') is null then
    raise exception 'retirement dropped the function body instead of revoking execute';
  end if;

  if has_function_privilege('authenticated', 'public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'execute') then
    raise exception 'confirm_entry_tasks is still executable by authenticated';
  end if;

  -- anon/public were already revoked; assert that has not regressed.
  if has_function_privilege('anon', 'public.confirm_entry_tasks(uuid, integer[])'::regprocedure, 'execute') then
    raise exception 'confirm_entry_tasks is executable by anon';
  end if;

  -- Every version a governing document says must remain callable.
  select string_agg(candidate.signature, ', ' order by candidate.signature)
  into retained
  from (values
    ('public.confirm_entry_task_candidates(uuid, uuid, integer[], text)'),
    ('public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)'),
    ('public.confirm_entry_task_candidates_v3(uuid, uuid, integer[], jsonb, text)'),
    ('public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)'),
    ('public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)'),
    ('public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)'),
    ('public.resolve_pending_question_v1(uuid, jsonb, text)'),
    ('public.resolve_pending_question_v2(uuid, jsonb, text)'),
    ('public.resolve_pending_question_v3(uuid, jsonb, text)')
  ) as candidate(signature)
  where to_regprocedure(candidate.signature) is null
    or not has_function_privilege('authenticated', candidate.signature::regprocedure, 'execute');

  if retained is not null then
    raise exception 'retirement removed a version whose retention is still claimed: %', retained;
  end if;

  -- No retained version may have leaked to anon or public.
  select string_agg(candidate.signature, ', ' order by candidate.signature)
  into still_granted
  from (values
    ('public.confirm_entry_task_candidates(uuid, uuid, integer[], text)'),
    ('public.confirm_entry_task_candidates_v2(uuid, uuid, integer[], jsonb, text)'),
    ('public.confirm_entry_task_candidates_v3(uuid, uuid, integer[], jsonb, text)'),
    ('public.confirm_entry_task_candidates_v4(uuid, uuid, integer[], jsonb, text)'),
    ('public.confirm_entry_task_candidates_v5(uuid, uuid, jsonb, jsonb, text)'),
    ('public.confirm_entry_task_candidates_v6(uuid, uuid, jsonb, jsonb, text)'),
    ('public.resolve_pending_question_v1(uuid, jsonb, text)'),
    ('public.resolve_pending_question_v2(uuid, jsonb, text)'),
    ('public.resolve_pending_question_v3(uuid, jsonb, text)')
  ) as candidate(signature)
  where has_function_privilege('anon', candidate.signature::regprocedure, 'execute');

  if still_granted is not null then
    raise exception 'a retained mutation version is executable by anon: %', still_granted;
  end if;
end
$$;

comment on function public.confirm_entry_tasks(uuid, integer[]) is
  'RETIRED 2026-07-25 (pre-2E hardening, ADR-037). Superseded by confirm_entry_task_candidates_v6. Execute is revoked from every role; the body is retained because undo_operations rows still record its action_type and the audit trail must remain readable. Do not grant it again without a rollback review.';
