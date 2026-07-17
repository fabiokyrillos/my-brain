-- Fix: migration 025 (Slice 2X.3) enforced the interpret_entry payload
-- shape with a table CHECK constraint that references the private helper
-- private.is_valid_entry_interpretation_job_payload(jsonb), then revoked
-- EXECUTE on that helper from every role, including authenticated and
-- service_role.
--
-- Root cause: PostgreSQL performs the function-call ACL check for a
-- FuncExpr node at executor/plan-initialization time, when the whole
-- expression tree for the CHECK constraint is built — not lazily, only for
-- the branch that ends up being evaluated at runtime. So even though
-- `type <> 'interpret_entry' OR is_valid_entry_interpretation_job_payload(payload)`
-- short-circuits its *value* for a process_attachment row, the executor
-- still needs EXECUTE on the referenced function to initialize that branch
-- of the plan at all. Because only the migration-owning role (postgres)
-- ever had that grant, any authenticated- or service-role-issued INSERT or
-- UPDATE on public.jobs — including a plain attachment job insert, which
-- has nothing to do with interpret_entry — failed with
-- "permission denied for function is_valid_entry_interpretation_job_payload".
-- This broke every real file upload (src/features/agent/actions.ts inserts
-- process_attachment jobs directly, as the authenticated user) from the
-- moment migration 025 was deployed. It was not caught earlier because
-- scripts/remote-job-reliability-smoke.mjs — the one smoke that performs a
-- direct authenticated insert into jobs — was not re-run after 025 shipped.
--
-- Fix: replace the CHECK constraint with an equivalent BEFORE INSERT OR
-- UPDATE trigger, restricted by a WHEN clause to interpret_entry rows only,
-- backed by a SECURITY DEFINER trigger function. Trigger firing is not
-- subject to the caller's function-EXECUTE ACL (only ordinary table INSERT/
-- UPDATE privilege, which authenticated/service_role already have), so the
-- private validator itself keeps its original revoke-all privacy — no
-- grant is broadened. Same enforced shape, same '23514' (check_violation)
-- error code the existing pgTAP contract expects, evaluated only for
-- interpret_entry rows exactly like the original constraint's short-circuit
-- intended.

alter table public.jobs drop constraint if exists jobs_interpret_entry_payload_check;

create or replace function private.enforce_entry_interpretation_job_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'interpret_entry' and not private.is_valid_entry_interpretation_job_payload(new.payload) then
    raise exception 'Invalid interpret_entry job payload' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_interpret_entry_payload_trigger on public.jobs;
create trigger jobs_interpret_entry_payload_trigger
  before insert or update on public.jobs
  for each row
  when (new.type = 'interpret_entry')
  execute function private.enforce_entry_interpretation_job_payload();

revoke all on function private.enforce_entry_interpretation_job_payload() from public, anon, authenticated, service_role;
