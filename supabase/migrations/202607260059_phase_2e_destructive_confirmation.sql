-- Phase 2E Slice 2E.5 — destructive actions and confirmation (PRD §13.6, §11.2,
-- §11.3, §12.3, §19.1 Epic 2E-E).
--
-- 2E-DESTRUCTIVE-002: "Confirmation uses a server-issued, single-use token bound
-- to one preview fingerprint, owner and operation key; a client-derivable value
-- is not confirmation evidence."
-- 2E-DESTRUCTIVE-004: "Applying a destructive action without valid, unused
-- confirmation evidence is refused by the database, not only by the UI."
-- 2E-DESTRUCTIVE-008/009: the cancel/creation-undo collision, in **both**
-- orderings, with every door into a creation-undone task closed by one guard.
--
-- This slice enables the two verbs `202607260058` deliberately refused. It does
-- so by `create or replace` on that same `public.apply_task_command`, with the
-- same seven arguments, because 2E-UPDATE-001 requires *one* RPC for every Phase
-- 2E task mutation and an eighth argument would create a second function beside
-- the first rather than replacing it. Everything the confirmation gate needs is
-- therefore derived inside the function from values it already receives.
--
-- **The token is a row, and the client never presents it.** `apply_task_command`
-- resolves the confirmation by `(auth.uid(), btrim(p_operation_key))` and then
-- requires the stored digest to equal the one it derives itself from the seven
-- arguments through `public.task_command_fingerprint`. All three bindings
-- 2E-DESTRUCTIVE-002 names are therefore enforced — owner, normalized operation
-- key, fingerprint — and none of them is a value the caller may assert. A
-- caller-supplied digest was written and rejected outright: `202607250057:49-53`
-- states that the fingerprint is granted to `authenticated` and derivable from
-- values the caller already holds, which is precisely why it cannot be evidence.
-- Accepting one as an argument would have made the "server-issued" half of the
-- requirement decorative.
--
-- **Issuance takes the same seven arguments as the apply.** That is not
-- symmetry for its own sake: it is the only way the issuing RPC can derive the
-- binding rather than be told it. `public.task_command_fingerprint` is
-- `immutable strict`, so both functions hashing the same seven values is a
-- structural guarantee that the confirmation binds the request the preview
-- showed.
--
-- **No expiry, deliberately.** §13.6 requires none, and the two mechanisms that
-- would justify one are already in place: the digest binds the observed
-- pre-state, and `apply_task_command`'s twelve-column staleness gate refuses any
-- payload whose pre-state has moved, with `55P03`. An outdated confirmation is
-- therefore unusable rather than dangerous. The decisive argument against adding
-- one anyway is 2E-UX-001: its outcome vocabulary is a *closed* list that
-- `copy.ts` and the exhaustiveness test run against, and an expired confirmation
-- has no member in it — so an expiry would have to either widen a closed
-- contract or lie by reporting itself as `refused`. Recorded as ADR-047.
--
-- **A failed apply does not burn the confirmation.** Consumption is a guarded
-- UPDATE inside the same transaction as the mutation (2E-UPDATE-004), so any
-- raise after it rolls it back with everything else and the retry finds the row
-- still `issued`. The opposite arrangement — consume, then mutate, in two
-- transactions — would let a lost `2E_TRANSITION_INTEGRITY` cost the user their
-- confirmation and force a second deliberate act for a command they had already
-- deliberated over.
--
-- **A replay never reaches the gate.** The consuming UPDATE sits after the
-- replay branch, which returns from the stored `after_state` before any lock is
-- taken (`202607260058:1064-1099`), so an exact resubmission returns the
-- original outcome marked replayed and consumes nothing (2E-UPDATE-005).
--
-- **The gate is that one statement and nothing else.** A read-only pre-check
-- before the reservation was written and removed: two halves can disagree after
-- a later edit, the read half would have had to be re-checked under the write
-- anyway, and it bought nothing — a raise rolls the reservation back with
-- everything else, so refusing before it burns no operation key either way.
--
-- **Two concurrent requests carrying one confirmation necessarily share an
-- operation key**, because the key is what resolves the confirmation. They are
-- therefore serialized by `undo_operations_operation_key_idx` well before the
-- consuming UPDATE: the loser's `on conflict do nothing` yields a null id, it
-- re-selects `for update`, blocks on the winner, and returns the winner's stored
-- result. The guarded UPDATE is the second, independent layer, and it is the one
-- that holds if that index is ever dropped.
--
-- ---------------------------------------------------------------------------
-- The creation-undo collision
-- ---------------------------------------------------------------------------
-- 2E-DESTRUCTIVE-008 defines a deleted task as one whose originating creation
-- operation has itself been undone, "detected by an `undone` `undo_operations`
-- row in the `confirm_entry_task*` family whose `entity_ids` contains the task".
-- `private.task_creation_undone` below is that sentence, and it is the only
-- copy: three doors read it.
--
-- **Why the collision is reachable at all, precisely.**
-- `private.undo_confirm_entry_tasks` compensates a creation by *cancelling* the
-- tasks, not by deleting them, and it does so with
-- `where ... and status <> 'cancelled'` (`202607250052:310-314`). On a task the
-- user has already cancelled through `cancel_task`, that UPDATE therefore
-- matches no row and changes nothing — so the ten scalars still equal the
-- `applied_state` the cancel recorded, the ten-column undo guard passes, and the
-- cancel-undo would put the task back to `todo`. That is a deleted task
-- resurrected by a control the product legitimately offers.
--
-- **And why the cancel-undo is the only field-undo that can do it.** The guard
-- compares `status` against `applied_state ->> 'status'`, which is the status
-- the forward action *left*. A creation-undo forces the row to `cancelled`. So a
-- field-undo survives the guard on a creation-undone task only when its own
-- `applied_state.status` is `cancelled` — and `cancel_task` is the sole action
-- whose target status is `cancelled` (`set_status` is bounded to the six
-- non-terminal precisely so it cannot be a second route, PRD §11.2). Every other
-- action's undo is already refused, by `2E_UNDO_RESTORE_INTEGRITY`, from the
-- guard that exists. The new guard is therefore scoped to the recorded
-- `cancel_task` rather than sprayed across the handler, and the pgTAP suite
-- proves the *reasoning* by asserting that a non-cancel field-undo on a
-- creation-undone task is refused by the ten-column guard.
--
-- **Both orderings.** Ordering A is cancel → creation-undo → cancel-undo, closed
-- by the handler guard. Ordering B is creation-undo → cancel, where the cancel
-- is already refused with `2E_INELIGIBLE_STATUS` because the creation-undo left
-- the task `cancelled` and `cancel_task` is eligible only from the six
-- non-terminal statuses; the live door in that ordering is `restore_task`, which
-- 2E-DESTRUCTIVE-009 closes with the same token. Both are asserted.
--
-- **Lock order is `undo_operations` before `public.tasks`, everywhere.**
-- `public.undo_operation` takes the operation row `for update` and only then
-- calls a handler that writes `public.tasks` (`202607250052:654-657`). So both
-- new readers of the creation family take those rows `for update` *before* the
-- task is locked. Taking them after would give `apply_task_command` the order
-- tasks → undo_operations against the router's undo_operations → tasks, which is
-- a cycle and a deadlock. The `for update` is not decoration either: without it
-- the predicate is a snapshot read, and a creation-undo committing between the
-- read and the commit would let a `restore_task` resurrect a task that was
-- deleted concurrently.
--
-- ---------------------------------------------------------------------------
-- The vocabulary
-- ---------------------------------------------------------------------------
-- `2E_ACTION_NOT_ENABLED` is **retired**. With both verbs enabled the taxonomy
-- `case` covers all fifteen members of the closed enum step 2 validates against,
-- so no reachable state raises it — and this phase's own doctrine, stated twice
-- in `202607260058` against tautological reminder guards, is that a declared
-- member of a closed error vocabulary that no reachable state can provoke is the
-- same defect as a missing raise. The `case`'s `else` survives as a fail-closed
-- terminator for an action added to the enum but not to the taxonomy, and it now
-- raises the bare `22023 'Invalid task command action'` that step 2 already
-- gives an unknown action — a refusal that *is* provokable, through step 2.
--
-- Two tokens replace it. `2E_CONFIRMATION_REQUIRED` (`P0001`) covers all three
-- ways confirmation evidence can be absent — no row, a row bound to a different
-- digest, and a row already consumed — because the remedy is identical in all
-- three and `errors.ts:83-88` already rejects a vocabulary that distinguishes
-- failures a caller cannot act on differently. `2E_CREATION_UNDONE` (`55P03`) is
-- the single token §13.6 asks for, closing the cancel-undo and `restore_task`
-- and scoping the candidate listing. The RPC's SQLSTATE set is unchanged at
-- `{22023, 42501, 55P03, P0001, P0002}`.
--
-- **A third token was written and removed before this slice was accepted.** It
-- guarded a candidate-slot collision that an adversarial review of the shipped
-- code proved unreachable: `record_entry_task_candidate_confirmation`
-- (`202607220041:299-364`) writes the `'confirmed'` resolution row that
-- `confirm_entry_task_candidates_v6`'s terminal-disposition gate reads, so the
-- duplicate that would take a cancelled task's slot cannot be created — and the
-- one path that deletes those rows is a creation-undo, which step 15b already
-- refuses. Removing it rather than keeping it as defence in depth is ADR-049
-- applied to this slice's own work. The reasoning that produced it is preserved
-- at step 18b, because the trigger it depends on is now load-bearing and a
-- future reader deserves to know why nothing guards that transition.
--
-- **`55P03` now carries a DETAIL on one path and none on the other**, which
-- `src/features/task-commands/apply.ts` must read in that order: the token
-- first, `stale_pre_state` as the fallback. The staleness raise keeps carrying
-- nothing, so `src/features/agent/actions.ts:221-224`'s convention of branching
-- on the code alone stays true for the gate it was written for.
--
-- ---------------------------------------------------------------------------
-- What this migration does not do
-- ---------------------------------------------------------------------------
-- No new undo handler and no new registry row: both verbs are `restore_fields`
-- and both touch reminders, which `private.undo_apply_task_command_fields`
-- already restores by close-and-insert. No change to `public.audit_task_change`,
-- whose Slice 2E.4 form already derives its actor from `app.audit_actor`. No
-- product event and no `ai_usage_events` change, for the reasons
-- `202607260058:263-270` records — there is still no Phase 2E surface.
-- `public.tasks` and `public.reminders` grants are untouched.
--
-- Rollback: forward-only. To retract the destructive verbs, `create or replace`
-- `public.apply_task_command` in a new migration with the two taxonomy branches
-- removed; the confirmation table may stay in place unused, and no data needs
-- migrating. To retract the recovery listing, revoke its execute grant.

-- ---------------------------------------------------------------------------
-- The confirmation ledger (2E-DESTRUCTIVE-002)
-- ---------------------------------------------------------------------------
-- Shaped on `public.entry_task_candidate_resolutions`
-- (`202607220041:20-68`), the newest owned table in this repository: composite
-- owner FKs rather than a bare `user_id`, forced RLS, and a `select`-only grant.
--
-- **No role may INSERT, UPDATE or DELETE here, including `service_role`.** Both
-- writers are `SECURITY DEFINER` functions, so a client can observe the
-- capability it already holds and can neither mint one nor burn one. That is
-- what makes "server-issued" and "single-use" properties of the schema rather
-- than of the two functions that happen to respect them: `undo_operations` gets
-- the same treatment (`202607170016:198-201`) for the same reason.
--
-- `id` is the token. A `uuid` primary key defaulted from `gen_random_uuid()` is
-- how this codebase already expresses a server-minted capability —
-- `public.undo_operation(p_undo_id uuid)` authorizes on possession of an id plus
-- ownership and nothing else — so a bespoke token format would be a second
-- mechanism for a problem that has one.
--
-- `operation_key` stores the **btrimmed caller key**, not the `'taskcmd-v1:'`
-- namespaced form `undo_operations` stores. That is the value
-- `public.task_command_fingerprint` hashes (`202607260058:1002-1019`), and the
-- binding has to be to the hashed value or the two would agree only by accident.
-- Its 8..240 bound is the caller half of `undo_operations_operation_key_check`,
-- stated here so a key this table accepts is one the apply path can also store.
--
-- The `status`/`consumed_at` equivalence CHECK is what makes "single-use"
-- checkable from the row alone: a `consumed` row with no instant, or an `issued`
-- row carrying one, is unrepresentable rather than merely unexpected.

create table if not exists public.task_command_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  action text not null,
  operation_key text not null,
  request_fingerprint text not null,
  status text not null default 'issued',
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint task_command_confirmations_action_check
    check (action in ('cancel_task')),
  constraint task_command_confirmations_operation_key_check
    check (char_length(operation_key) between 8 and 240),
  constraint task_command_confirmations_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint task_command_confirmations_status_check
    check (status in ('issued', 'consumed')),
  constraint task_command_confirmations_consumed_at_check
    check ((status = 'consumed') = (consumed_at is not null)),
  constraint task_command_confirmations_task_owner_fk
    foreign key (user_id, task_id)
    references public.tasks (user_id, id)
    on delete cascade
);

-- The uniqueness that makes issuance idempotent and re-binding impossible. Not
-- partial, unlike `undo_operations_operation_key_idx`: `operation_key` is NOT
-- NULL here, because a confirmation with no key would be bound to nothing.
create unique index if not exists task_command_confirmations_operation_key_idx
  on public.task_command_confirmations (user_id, operation_key);

create index if not exists task_command_confirmations_task_idx
  on public.task_command_confirmations (user_id, task_id, created_at desc);

alter table public.task_command_confirmations enable row level security;
alter table public.task_command_confirmations force row level security;

drop policy if exists task_command_confirmations_select_own
  on public.task_command_confirmations;
create policy task_command_confirmations_select_own
  on public.task_command_confirmations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.task_command_confirmations
  from public, anon, authenticated, service_role;
grant select on table public.task_command_confirmations
  to authenticated;

comment on table public.task_command_confirmations is
  'Phase 2E server-issued destructive-action confirmations (PRD 2E-DESTRUCTIVE-002). One row per (owner, normalized operation key), bound to the fingerprint the server derived from the same seven values the apply RPC receives, consumed exactly once inside the applying transaction. No role may write it: both writers are SECURITY DEFINER functions.';

-- ---------------------------------------------------------------------------
-- The creation-undo predicate (2E-DESTRUCTIVE-008, 2E-DESTRUCTIVE-009)
-- ---------------------------------------------------------------------------
-- One definition, three readers: `apply_task_command`'s `restore_task` branch,
-- `undo_apply_task_command_fields`' cancel-undo guard, and
-- `list_task_command_candidates`. §13.6 requires "the same guard" on every
-- door, and a predicate copied three times is three predicates.
--
-- `private`, and revoked from everything: it is read only from definer functions
-- this migration owns, and exposing it would let a caller probe whether a task
-- it does not own has a creation operation.
--
-- `stable`, not `immutable` — it reads a table — and deliberately not
-- `security definer`. It carries no `for update`: a locking read cannot live in
-- a `stable sql` function, and both call sites that need one take it themselves,
-- explicitly, where the lock order is visible.
--
-- The four `action_type` values are `private.undo_operation_handlers`' whole
-- `confirm_entry_task*` family (`202607250052:570-586`) — the unversioned key
-- that `confirm_entry_task_candidates_v2/_v3/_v4` all recorded, plus `_v5` and
-- `_v6`, plus the original `confirm_entry_tasks`. Listing them literally rather
-- than matching a prefix is deliberate: a future `confirm_entry_task_*` family
-- member must be admitted by a human who has thought about whether undoing it
-- deletes a task.

create or replace function private.task_creation_undone(
  p_user_id uuid,
  p_task_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.undo_operations as creation
    where creation.user_id = p_user_id
      and creation.status = 'undone'
      and creation.action_type = any(array[
        'confirm_entry_tasks',
        'confirm_entry_task_candidates',
        'confirm_entry_task_candidates_v5',
        'confirm_entry_task_candidates_v6'
      ])
      and p_task_id = any(creation.entity_ids)
  );
$$;

revoke all on function private.task_creation_undone(uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function private.task_creation_undone(uuid, uuid) is
  'Phase 2E: is this task deleted, in the sense PRD 2E-DESTRUCTIVE-008 defines - an undone confirm_entry_task* operation whose entity_ids contain it. The single definition the cancel-undo guard, restore_task and the candidate listing all read.';

-- ---------------------------------------------------------------------------
-- Issuance (2E-DESTRUCTIVE-002, 2E-DESTRUCTIVE-003)
-- ---------------------------------------------------------------------------
-- The same seven arguments as `public.apply_task_command`, in the same order,
-- for the reason the header gives: the binding must be *derived* here, not
-- asserted by the caller.
--
-- **This function decides nothing about eligibility.** It does not check that
-- the task's status admits the action, and that is not an oversight: the
-- taxonomy lives in one place and `apply_task_command` is where it is enforced,
-- so a second copy here could disagree with it after a future edit — the exact
-- defect `taxonomy.ts:210-219` records against inferring policy in a validator.
-- A confirmation minted for an ineligible task is harmless: the apply refuses it
-- with `2E_INELIGIBLE_STATUS` and the row is never consumed.
--
-- What it does validate is what it *binds*: the caller, the owner of the task,
-- the shape of the values that reach the digest, and that the action is one that
-- requires confirmation at all. Every refusal is a bare `22023` — the
-- `invalid_payload` family — except the two that already have declared meanings.
--
-- Idempotent on `(user_id, operation_key)` through the unique index, with the
-- same conflict semantics `apply_task_command` gives a replay: a second issuance
-- for the same digest returns the same row marked replayed, and one for a
-- *different* digest is `2E_IDEMPOTENCY_MISMATCH` rather than a silent re-bind.
-- 2E-DESTRUCTIVE-003's "a changed proposal requires a new token" is that
-- refusal: the new proposal is a new request and carries its own key.

create or replace function public.issue_task_command_confirmation(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_policy_version text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  iso_instant_pattern constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$';

  current_user_id uuid := auth.uid();
  normalized_key text;
  canonical_fingerprint text;
  confirmation_id uuid;
  existing_confirmation public.task_command_confirmations%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- The closed set of actions that require confirmation, which is PRD §11.2's
  -- Confirmation column. `restore_task` is deliberately absent: §11.2 marks it
  -- "Confirmation: no" and non-destructive, and its deliberateness is expressed
  -- by `oneStepEligible: false` at the match layer, not by a token.
  if p_action is null or p_action not in ('cancel_task') then
    raise exception 'Task command action does not require confirmation'
      using errcode = '22023';
  end if;

  -- The same bounds and the same normalization the apply path applies, so a key
  -- this function accepts is one that function can also hash and store. `btrim`
  -- for the reason `202607260058:594-600` gives.
  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;

  if p_policy_version is null
    or pg_catalog.char_length(pg_catalog.btrim(p_policy_version)) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  if p_observed_before is null or p_observed_before !~ iso_instant_pattern then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end if;
  begin
    perform p_observed_before::timestamptz;
  exception when others then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end;

  -- `task_command_fingerprint` is `strict`, so a null argument would yield a
  -- null digest and the column's CHECK would surface as a raw `23514` that no
  -- mapper case covers. The object test is what keeps that unreachable; the
  -- nineteen-key validation the apply path performs is deliberately not repeated,
  -- because a malformed pre-state produces a digest no apply can ever match and
  -- the apply refuses the payload long before the confirmation gate.
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Task command patch must be an object' using errcode = '22023';
  end if;
  if p_pre_state is null or pg_catalog.jsonb_typeof(p_pre_state) <> 'object' then
    raise exception 'Task command pre-state must be an object' using errcode = '22023';
  end if;

  -- 2E-OWNERSHIP-002: another owner's task and a nonexistent one are the same
  -- answer. The composite owner FK would refuse the insert anyway, with a
  -- `23503` that discloses the constraint name; this refuses first, with the
  -- message the apply path uses.
  if not exists (
    select 1
    from public.tasks as owned_task
    where owned_task.id = p_task_id
      and owned_task.user_id = current_user_id
  ) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- Derived here, never accepted. The seven inputs are exactly the seven
  -- `apply_task_command` hashes, with the owner taken from `auth.uid()` and the
  -- key btrimmed, so the two functions agree by construction.
  canonical_fingerprint := public.task_command_fingerprint(
    current_user_id,
    p_task_id,
    p_observed_before,
    p_pre_state,
    p_patch,
    p_policy_version,
    normalized_key
  );

  insert into public.task_command_confirmations (
    user_id, task_id, action, operation_key, request_fingerprint
  ) values (
    current_user_id, p_task_id, p_action, normalized_key, canonical_fingerprint
  )
  on conflict (user_id, operation_key) do nothing
  returning id into confirmation_id;

  if confirmation_id is not null then
    return pg_catalog.jsonb_build_object(
      'confirmation_id', confirmation_id,
      'task_id', p_task_id,
      'action', p_action,
      'request_fingerprint', canonical_fingerprint,
      'status', 'issued',
      'replayed', false
    );
  end if;

  -- The key was already reserved. `for update` so two concurrent issuances of
  -- the same request cannot both read a pre-conflict row; the loser blocks and
  -- then sees the winner's.
  select confirmation_row.*
  into existing_confirmation
  from public.task_command_confirmations as confirmation_row
  where confirmation_row.user_id = current_user_id
    and confirmation_row.operation_key = normalized_key
  for update;

  -- 2E-DESTRUCTIVE-003. Re-binding the row to the new digest was the other
  -- candidate and is rejected: it would let a client mutate an outstanding
  -- confirmation into evidence for a payload the user never saw, which is the
  -- whole property this table exists to hold. A changed proposal is a new
  -- request; it carries a new key.
  if existing_confirmation.id is null
    or existing_confirmation.request_fingerprint is distinct from canonical_fingerprint
    or existing_confirmation.task_id is distinct from p_task_id
    or existing_confirmation.action is distinct from p_action
  then
    raise exception 'Operation key payload mismatch'
      using errcode = 'P0001', detail = '2E_IDEMPOTENCY_MISMATCH';
  end if;

  return pg_catalog.jsonb_build_object(
    'confirmation_id', existing_confirmation.id,
    'task_id', existing_confirmation.task_id,
    'action', existing_confirmation.action,
    'request_fingerprint', existing_confirmation.request_fingerprint,
    'status', existing_confirmation.status,
    'replayed', true
  );
end;
$$;

revoke all on function public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)
  from public, anon;
grant execute on function public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)
  to authenticated;

comment on function public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text) is
  'Phase 2E destructive-action confirmation issuance (PRD 2E-DESTRUCTIVE-002, 2E-DESTRUCTIVE-003). Takes the same seven values as apply_task_command and derives the binding digest itself through public.task_command_fingerprint, so the confirmation is bound to the request the preview showed rather than to a digest the caller asserted. Idempotent on (user_id, operation_key); a different payload under the same key is 2E_IDEMPOTENCY_MISMATCH, never a silent re-bind.';

-- ---------------------------------------------------------------------------
-- The mutation RPC
-- ---------------------------------------------------------------------------

create or replace function public.apply_task_command(
  p_task_id uuid,
  p_action text,
  p_patch jsonb,
  p_pre_state jsonb,
  p_observed_before text,
  p_policy_version text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- One regex for every instant this function validates. `202607220044:367-399`
  -- repeats the literal at each site; a single constant cannot drift between the
  -- pre-state gate and the patch bounds, which have to agree or a value accepted
  -- by one is refused by the other.
  iso_instant_pattern constant text :=
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$';
  non_terminal_statuses constant text[] :=
    array['inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred'];

  -- The actions served by the one shared status UPDATE at step 21, declared once
  -- because five separate places have to agree about the same list: the delta
  -- against the claimed pre-state (step 11), the delta against the locked row
  -- (step 19), the write itself (step 21), and the two terminal-timestamp
  -- expressions of the recorded `applied_state` (step 23).
  --
  -- Slice 2E.4 wrote that list out at each of those five sites and its own
  -- comment named the hazard: "each branch mirrors the matching branch of step 21
  -- term for term, so adding an action there means adding it here". Slice 2E.5
  -- adds two actions, and getting any one of the five wrong is silent and severe
  -- — a missed step 21 sends `cancel_task` into the relation branch, and a missed
  -- step 23 records a `cancelled_at` the row does not hold, which makes the
  -- ten-column undo guard refuse every cancel-undo forever. One constant, five
  -- readers, no drift.
  status_writing_actions constant text[] := array[
    'complete_task', 'reopen_task', 'set_status', 'cancel_task', 'restore_task'
  ];

  current_user_id uuid := auth.uid();
  normalized_key text;
  internal_operation_key text;
  canonical_fingerprint text;

  -- The §11.2 taxonomy for this action, resolved once. `taxonomy.ts` is the
  -- executable form of that table in TypeScript; these five values are the part
  -- of it the write path needs, and they are set in one place so no branch below
  -- re-derives "can this action touch this task".
  action_eligible_statuses text[];
  allowed_patch_keys text[];
  required_patch_keys text[];
  allowed_status_values text[];
  action_target_status text;
  action_touches_reminders boolean := false;
  -- PRD §11.2's Confirmation column, resolved from the taxonomy like every other
  -- policy value rather than by naming the action at the gate. `cancel_task` is
  -- the only row that carries it today.
  --
  -- Setting this is **necessary but not sufficient** for a second destructive
  -- action: `public.task_command_confirmations`' `action` CHECK and
  -- `public.issue_task_command_confirmation`'s own closed action list both name
  -- `cancel_task` literally, so an action that set this without widening those
  -- two would be permanently unappliable — gated here, and refused a
  -- confirmation there. Both are deliberate: the CHECK is the structural floor
  -- and the issuance list is what stops a caller minting a row no apply can
  -- consume. A second destructive action is a three-place change, and this is
  -- the place that is easy to find.
  action_requires_confirmation boolean := false;
  action_undo_strategy text;
  action_undo_action_type text;

  claimed_title text;
  claimed_description text;
  claimed_status text;
  claimed_due_at timestamptz;
  claimed_planned_at timestamptz;
  claimed_manual_priority text;
  claimed_completed_at timestamptz;
  claimed_cancelled_at timestamptz;
  claimed_intentional_no_due boolean;
  claimed_no_due_reason text;
  claimed_created_at timestamptz;
  claimed_updated_at timestamptz;

  patch_status text;
  patch_title text;
  patch_description text;
  patch_due_at timestamptz;
  patch_planned_at timestamptz;
  patch_manual_priority text;
  patch_intentional_no_due boolean;
  patch_no_due_reason text;
  patch_project_id uuid;
  patch_context_id uuid;
  patch_person_id uuid;
  patch_person_role text;

  has_delta boolean := false;
  locked_task public.tasks%rowtype;
  existing_operation public.undo_operations%rowtype;
  undo_id uuid;
  undo_expires_at timestamptz;
  undo_before_state jsonb;
  undo_after_state jsonb;
  -- The ten scalar columns as step 21 left them, which is what the undo handler
  -- guards its compensating UPDATE on. Built at step 23 rather than declared with
  -- a value, because every input to it is only known once the row is locked.
  undo_applied_state jsonb;

  effective_status text;
  effective_title text;
  effective_due_at timestamptz;

  reminders_cancelled_count integer := 0;
  reminders_cancelled_json jsonb := '[]'::jsonb;
  reminder_created_id uuid;

  -- The confirmation this call consumed, recorded on the undo row and the audit
  -- row so an applied destructive command carries the identity of the evidence
  -- that authorized it. Null for every action the taxonomy does not gate.
  consumed_confirmation_id uuid;
  confirmation_consumed integer := 0;

  relation_table text;
  relation_target_id uuid;
  relation_role text;
  affected integer := 0;
begin
  -- 1. Caller ------------------------------------------------------------------
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 2. Action ------------------------------------------------------------------
  -- The closed enum first (2E-COMMAND-002), then the taxonomy. Slice 2E.5 added
  -- the two branches Slice 2E.4 left as a refusal, so the `case` below now covers
  -- all fifteen members of the enum and its `else` is unreachable while the two
  -- lists agree. It is kept as the fail-closed terminator for the state where
  -- they do not — an action admitted to the enum with no policy behind it — and
  -- it raises the same bare `22023` this step already gives an unknown action.
  -- The token that used to sit there is retired, and is deliberately not named
  -- anywhere inside this body: the post-deploy block greps the shipped function
  -- definitions for it, so a mention in prose would fail the deployment that
  -- retires it. A declared token no reachable state can raise is the defect this
  -- file rejects twice elsewhere.
  if p_action is null or p_action not in (
    'complete_task', 'reopen_task', 'set_status', 'cancel_task', 'restore_task',
    'rename_task', 'append_note', 'reschedule_due', 'clear_due', 'set_planned',
    'set_priority', 'assign_project', 'assign_context', 'assign_person',
    'set_waiting_on'
  ) then
    raise exception 'Invalid task command action' using errcode = '22023';
  end if;

  -- `complete_task`, `reopen_task`, `cancel_task` and `restore_task` carry
  -- `status` in their patch even though the destination is read from the taxonomy
  -- and never from the patch, and it is required rather than merely allowed. Two
  -- independent reasons, both load-bearing:
  --
  --   * The canonical patch is what `task_command_fingerprint` hashed at preview
  --     time, and `buildCanonicalPatch`
  --     (`src/features/task-commands/preview.ts:413-426`) writes
  --     `draft.status = policy.targetStatus` whenever the taxonomy declares one.
  --     Refusing the key would make the fingerprint the preview computed
  --     unreachable and both actions unappliable; accepting a patch *without* it
  --     would hash a different object and never match a stored replay.
  --   * `applied_patch` is the only record of what the caller *asked for*, as
  --     against `applied_state`, which records what the row ended up holding. An
  --     absent `status` would leave the first silent about a transition that
  --     demonstrably happened, and the two are read for different questions in
  --     Slice 2E.5's destructive-confirmation audit. (This bullet used to say the
  --     undo handler guards on `applied_patch ->> 'status'`; it does not any more.
  --     A one-column guard over a ten-column restore discarded a newer change in
  --     silence, so the guard now reads all ten columns out of `applied_state`.)
  --
  -- The key is admitted with a single allowed value — the taxonomy's own
  -- destination, resolved below — so it cannot become a second route to a
  -- transition another action guards. `set_status` is the only action whose
  -- destination is genuinely taken from the patch, and its allowed values are the
  -- six non-terminal, so `cancelled` and `completed` stay reachable only through
  -- the actions that declare them.
  case p_action
    when 'complete_task' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'completed';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'reopen_task' then
      action_eligible_statuses := array['completed'];
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'todo';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'set_status' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_undo_strategy := 'restore_fields';
    -- The two destructive verbs, in PRD §11.2's own order. Both are shaped
    -- exactly like `complete_task`/`reopen_task`: the destination comes from the
    -- taxonomy, the patch may only restate it, and the shared status UPDATE at
    -- step 21 already writes `cancelled_at` when and only when entering
    -- `cancelled` and clears it when leaving — which is why neither needs a write
    -- path of its own. `202607260058:1232-1234` reserved exactly this.
    --
    -- `cancel_task` is eligible only from the six non-terminal statuses, so
    -- cancelling an already-completed task is not offered: admitting it would
    -- force this action to clear `completed_at` and force `restore_task` to guess
    -- which status to return to (PRD §11.2).
    when 'cancel_task' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'cancelled';
      action_touches_reminders := true;
      -- The only row of §11.2 whose Confirmation column says "required".
      action_requires_confirmation := true;
      action_undo_strategy := 'restore_fields';
    -- `restore_task` requires no confirmation: §11.2 marks it non-destructive
    -- with "Confirmation: no". Its deliberateness is `oneStepEligible: false`,
    -- which is a match-layer property (`matching.ts:620-625`) and not something
    -- this function can observe — an RPC cannot tell how many controls the user
    -- pressed. What it can enforce, and does below, is that a task whose creation
    -- was undone never comes back through it (2E-DESTRUCTIVE-009).
    when 'restore_task' then
      action_eligible_statuses := array['cancelled'];
      allowed_patch_keys := array['status'];
      required_patch_keys := array['status'];
      action_target_status := 'todo';
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'rename_task' then
      action_eligible_statuses := array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed'
      ];
      allowed_patch_keys := array['title'];
      required_patch_keys := array['title'];
      action_undo_strategy := 'restore_fields';
    when 'append_note' then
      action_eligible_statuses := array[
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred', 'completed'
      ];
      allowed_patch_keys := array['description'];
      required_patch_keys := array['description'];
      action_undo_strategy := 'restore_fields';
    when 'reschedule_due' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['dueAt', 'intentionalNoDue', 'noDueReason'];
      required_patch_keys := array['dueAt'];
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'clear_due' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['dueAt'];
      required_patch_keys := array['dueAt'];
      action_touches_reminders := true;
      action_undo_strategy := 'restore_fields';
    when 'set_planned' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['plannedAt'];
      required_patch_keys := array['plannedAt'];
      action_undo_strategy := 'restore_fields';
    when 'set_priority' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['manualPriority'];
      required_patch_keys := array['manualPriority'];
      action_undo_strategy := 'restore_fields';
    when 'assign_project' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['projectId'];
      required_patch_keys := array['projectId'];
      action_undo_strategy := 'remove_added_relation';
    when 'assign_context' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['contextId'];
      required_patch_keys := array['contextId'];
      action_undo_strategy := 'remove_added_relation';
    when 'assign_person' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['personId', 'personRole'];
      required_patch_keys := array['personId', 'personRole'];
      patch_person_role := 'involved';
      action_undo_strategy := 'remove_added_relation';
    when 'set_waiting_on' then
      action_eligible_statuses := non_terminal_statuses;
      allowed_patch_keys := array['personId', 'personRole'];
      required_patch_keys := array['personId', 'personRole'];
      patch_person_role := 'waiting_on';
      action_undo_strategy := 'remove_added_relation';
    else
      -- Unreachable while the enum above and this `case` list the same fifteen
      -- actions, which `supabase/tests/phase_2e_task_command_apply.sql` asserts
      -- by reading both out of the catalog. Kept as the terminator anyway:
      -- without it, an action added to the enum and forgotten here would fall
      -- through with null policy arrays and be validated against nothing.
      raise exception 'Invalid task command action' using errcode = '22023';
  end case;

  if action_target_status is not null then
    allowed_status_values := array[action_target_status];
  else
    allowed_status_values := non_terminal_statuses;
  end if;

  action_undo_action_type := case
    when action_undo_strategy = 'remove_added_relation' then 'apply_task_command_relation'
    else 'apply_task_command'
  end;

  -- 3. Operation key -----------------------------------------------------------
  -- `undo_operations_operation_key_check` bounds the stored key at 8..260
  -- (`202607170020:81-82`), and the prefix is 11 characters, so the caller bound
  -- is 240 exactly as `202607220044:182-190` reserves the difference for
  -- `'confirm-v6:'`. `btrim` is correct here and only here: the POSIX form
  -- `202607230047:85-90` forward-fixed is for free text, and an operation key is
  -- not free text.
  normalized_key := pg_catalog.btrim(p_operation_key);
  if normalized_key is null or pg_catalog.char_length(normalized_key) not between 8 and 240 then
    raise exception 'Invalid operation key' using errcode = '22023';
  end if;
  internal_operation_key := 'taskcmd-v1:' || normalized_key;

  -- 4. Policy version ----------------------------------------------------------
  -- Validated through `btrim` but hashed raw: `buildFingerprintPayload`
  -- (`src/features/task-commands/fingerprint.ts:79-154`) sends
  -- `preview.policyVersion` verbatim, and normalizing it here would make the
  -- value this function hashes differ from the value the preview hashed.
  if p_policy_version is null
    or pg_catalog.char_length(pg_catalog.btrim(p_policy_version)) not between 1 and 64
  then
    raise exception 'Invalid task command policy version' using errcode = '22023';
  end if;

  -- 5. Observed-before ---------------------------------------------------------
  -- Regex first, then a guarded cast, following `202607220044:367-399`. The cast
  -- is *validation only* — the text is what reaches the fingerprint, verbatim.
  -- Casting it back to `timestamptz` for hashing would make two callers in two
  -- zones derive two identities for one request and every replay look new, which
  -- is precisely the latent bug `202607250057:34-39` declines to copy.
  if p_observed_before is null or p_observed_before !~ iso_instant_pattern then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end if;
  begin
    perform p_observed_before::timestamptz;
  exception when others then
    raise exception 'Invalid observed-before instant' using errcode = '22023';
  end;

  -- 6. Pre-state ---------------------------------------------------------------
  -- Closed-object validation in the `202607220044:206-220` shape: an object, an
  -- exact key count, and an EXISTS for any key outside the allow-list. Unknown
  -- keys are rejected, never ignored — the nineteen keys are `TaskPreState`
  -- (`src/features/task-commands/matching.ts:61-81`), which is what the preview
  -- observed and what the fingerprint hashed.
  if p_pre_state is null or pg_catalog.jsonb_typeof(p_pre_state) <> 'object' then
    raise exception 'Task command pre-state must be an object' using errcode = '22023';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_pre_state)) <> 19
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_pre_state) as pre_state_key(key_name)
      where not (pre_state_key.key_name = any(array[
        'title', 'description', 'status', 'dueAt', 'plannedAt', 'manualPriority',
        'completedAt', 'cancelledAt', 'intentionalNoDue', 'noDueReason',
        'createdAt', 'updatedAt', 'projectIds', 'projectNames', 'contextIds',
        'contextNames', 'personIds', 'personNames', 'personRoles'
      ]))
    )
  then
    raise exception 'Task command pre-state must carry exactly the observed fields'
      using errcode = '22023';
  end if;

  -- Every cast is guarded, so a malformed claim is a validation failure rather
  -- than a `22P02` escaping to a client whose mapper has no case for it.
  begin
    claimed_title := p_pre_state ->> 'title';
    claimed_description := p_pre_state ->> 'description';
    claimed_status := p_pre_state ->> 'status';
    claimed_due_at := (p_pre_state ->> 'dueAt')::timestamptz;
    claimed_planned_at := (p_pre_state ->> 'plannedAt')::timestamptz;
    claimed_manual_priority := p_pre_state ->> 'manualPriority';
    claimed_completed_at := (p_pre_state ->> 'completedAt')::timestamptz;
    claimed_cancelled_at := (p_pre_state ->> 'cancelledAt')::timestamptz;
    claimed_intentional_no_due := (p_pre_state ->> 'intentionalNoDue')::boolean;
    claimed_no_due_reason := p_pre_state ->> 'noDueReason';
    claimed_created_at := (p_pre_state ->> 'createdAt')::timestamptz;
    claimed_updated_at := (p_pre_state ->> 'updatedAt')::timestamptz;
  exception when others then
    raise exception 'Task command pre-state carries a value of the wrong type'
      using errcode = '22023';
  end;

  if claimed_title is null
    or claimed_status is null
    or claimed_intentional_no_due is null
    or claimed_created_at is null
    or claimed_updated_at is null
  then
    raise exception 'Task command pre-state is missing a required value'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_pre_state -> 'projectIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'contextIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'personIds') <> 'array'
    or pg_catalog.jsonb_typeof(p_pre_state -> 'personRoles') <> 'array'
    or pg_catalog.jsonb_array_length(p_pre_state -> 'personIds')
       <> pg_catalog.jsonb_array_length(p_pre_state -> 'personRoles')
  then
    raise exception 'Task command pre-state relation arrays are malformed'
      using errcode = '22023';
  end if;

  -- 7. Patch key set -----------------------------------------------------------
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Task command patch must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) as patch_key(key_name)
    where not (patch_key.key_name = any(allowed_patch_keys))
  ) then
    raise exception 'Task command patch carries a field this action does not allow'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(required_patch_keys) as required_key(key_name)
    where not (p_patch ? required_key.key_name)
  ) then
    raise exception 'Task command patch is missing a required field'
      using errcode = '22023';
  end if;

  -- 8. Patch values, against the ACTION's own allowed targets -------------------
  -- 2E-COMMAND-008 validates against the action's declared set, not the
  -- table-wide domain. The table CHECKs are the floor, not the contract.
  if p_patch ? 'status' then
    patch_status := p_patch ->> 'status';
    if pg_catalog.jsonb_typeof(p_patch -> 'status') <> 'string'
      or not (patch_status = any(allowed_status_values))
    then
      raise exception 'Invalid task command status' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'title' then
    patch_title := p_patch ->> 'title';
    if pg_catalog.jsonb_typeof(p_patch -> 'title') <> 'string'
      or pg_catalog.char_length(patch_title) not between 1 and 240
    then
      raise exception 'Invalid task command title' using errcode = '22023';
    end if;
  end if;

  -- `append_note` writes this verbatim. The concatenation is computed by
  -- `buildTaskCommandPreview`, which is what the user saw and what the
  -- fingerprint hashed, so re-deriving it here would be a second copy of a
  -- domain rule that could disagree with the preview.
  --
  -- **100000, not the note's 2000.** This value is not a note — it is
  -- `pre.description || E'\n\n' || note`, built by `buildCanonicalPatch`
  -- (`src/features/task-commands/preview.ts:429-437`). 2E-COMMAND-008's
  -- "description ≤ 2000" governs the fragment the model may emit, and
  -- `MAX_NOTE_LENGTH` (`src/features/task-commands/schema.ts:34`) already refuses a
  -- longer one at the parse boundary. Bounding the *result* at 2000 was written and
  -- is the defect this replaces: it made a task whose notes already totalled 2000
  -- characters unable to take another legal note ever again, and it did so after
  -- the preview had already offered a one-step apply — the RPC then refused a
  -- payload the user was told would land. The alternative fix, refusing the append
  -- in the preview with a new declared refusal, was rejected: silently making a
  -- legal note unappliable on a long task is a worse product outcome than an
  -- unbounded description.
  --
  -- And it is genuinely unbounded: `tasks.description` is bare `text` with no CHECK
  -- (`202607160003:110`), unlike `title`, so this is the only ceiling that exists on
  -- the column and repeated appends accumulate without one. 100000 is kept finite
  -- only so a definer function cannot be turned into a way to write megabyte rows —
  -- it is about fifty maximum-length notes, past any plausible note history, and the
  -- request already carries this text twice, here and inside `p_pre_state`.
  if p_patch ? 'description' then
    patch_description := p_patch ->> 'description';
    if pg_catalog.jsonb_typeof(p_patch -> 'description') <> 'string'
      or pg_catalog.char_length(patch_description) > 100000
    then
      raise exception 'Invalid task command description' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'dueAt' then
    if p_action = 'clear_due' then
      if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'null' then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end if;
    else
      if pg_catalog.jsonb_typeof(p_patch -> 'dueAt') <> 'string'
        or (p_patch ->> 'dueAt') !~ iso_instant_pattern
      then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end if;
      begin
        patch_due_at := (p_patch ->> 'dueAt')::timestamptz;
      exception when others then
        raise exception 'Invalid task command due date' using errcode = '22023';
      end;
    end if;
  end if;

  if p_patch ? 'plannedAt' then
    if pg_catalog.jsonb_typeof(p_patch -> 'plannedAt') <> 'string'
      or (p_patch ->> 'plannedAt') !~ iso_instant_pattern
    then
      raise exception 'Invalid task command planned date' using errcode = '22023';
    end if;
    begin
      patch_planned_at := (p_patch ->> 'plannedAt')::timestamptz;
    exception when others then
      raise exception 'Invalid task command planned date' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'manualPriority' then
    patch_manual_priority := p_patch ->> 'manualPriority';
    if pg_catalog.jsonb_typeof(p_patch -> 'manualPriority') <> 'string'
      or not (patch_manual_priority = any(array['low', 'medium', 'high', 'urgent']))
    then
      raise exception 'Invalid task command priority' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'intentionalNoDue' then
    if pg_catalog.jsonb_typeof(p_patch -> 'intentionalNoDue') <> 'boolean' then
      raise exception 'Invalid task command no-due flag' using errcode = '22023';
    end if;
    patch_intentional_no_due := (p_patch ->> 'intentionalNoDue')::boolean;
  end if;

  if p_patch ? 'noDueReason' then
    if pg_catalog.jsonb_typeof(p_patch -> 'noDueReason') not in ('null', 'string') then
      raise exception 'Invalid task command no-due reason' using errcode = '22023';
    end if;
    patch_no_due_reason := p_patch ->> 'noDueReason';
  end if;

  -- 2E-UPDATE-012, first half: the canonical patch must be internally consistent
  -- before it ever reaches `tasks_no_due_consistency_check`
  -- (`202607210036:36-41`), so the user gets a declared reason code rather than a
  -- raw `23514` they cannot act on.
  if (patch_due_at is not null and coalesce(patch_intentional_no_due, false))
    or (patch_no_due_reason is not null and not coalesce(patch_intentional_no_due, false))
  then
    raise exception 'Due date conflicts with the intentional no-due flag'
      using errcode = '22023', detail = '2E_DUE_CONSISTENCY';
  end if;

  if p_patch ? 'projectId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'projectId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_project_id := (p_patch ->> 'projectId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'contextId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'contextId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_context_id := (p_patch ->> 'contextId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  if p_patch ? 'personId' then
    if pg_catalog.jsonb_typeof(p_patch -> 'personId') <> 'string' then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end if;
    begin
      patch_person_id := (p_patch ->> 'personId')::uuid;
    exception when others then
      raise exception 'Invalid task command relation reference' using errcode = '22023';
    end;
  end if;

  -- The role is not the caller's to choose: `assign_person` and `set_waiting_on`
  -- are otherwise byte-identical policies, and the role is the only thing that
  -- distinguishes them. It was set from the taxonomy above; the patch may only
  -- restate it.
  if p_patch ? 'personRole' then
    if (p_patch ->> 'personRole') is distinct from patch_person_role then
      raise exception 'Invalid task command person role' using errcode = '22023';
    end if;
  end if;

  -- 9. Unlocked ownership probe -------------------------------------------------
  -- Before the reservation and before any lock, so `no_change` and a
  -- cross-owner payload both resolve without burning an operation key.
  -- 2E-OWNERSHIP-002: a command naming another owner's task is indistinguishable
  -- from one naming a nonexistent task, so both land on this single message.
  if not exists (
    select 1
    from public.tasks as owned_task
    where owned_task.id = p_task_id
      and owned_task.user_id = current_user_id
  ) then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- 10. Relation-reference ownership -------------------------------------------
  -- `202607220044:919-1001` proves ownership of every referenced entity with an
  -- EXISTS probe rather than trusting the caller or relying on the composite FK's
  -- error, and it does so *before* the reservation: a payload naming another
  -- owner's project must not burn an operation key. The composite owner FKs
  -- (`task_projects_project_owner_fk` and siblings, `202607170016:90-101`) remain
  -- the structural backstop that satisfies 2E-UPDATE-016 by construction.
  if patch_project_id is not null and not exists (
    select 1
    from public.projects as owned_project
    where owned_project.id = patch_project_id
      and owned_project.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;
  if patch_context_id is not null and not exists (
    select 1
    from public.contexts as owned_context
    where owned_context.id = patch_context_id
      and owned_context.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;
  if patch_person_id is not null and not exists (
    select 1
    from public.people as owned_person
    where owned_person.id = patch_person_id
      and owned_person.user_id = current_user_id
  ) then
    raise exception 'Invalid or cross-owner relation reference'
      using errcode = '22023', detail = '2E_INVALID_RELATION';
  end if;

  -- 11. Canonical delta against the CLAIMED pre-state --------------------------
  -- 2E-UPDATE-009 requires `no_change` to write nothing at all, and the
  -- reservation is the first write, so this decision has to happen here — before
  -- it, and before any lock. The claim is unverified at this point; the outcome
  -- writes nothing, so the worst case is a mis-informed answer to a caller whose
  -- own preview already decided `no_change` authoritatively.
  effective_status := coalesce(action_target_status, patch_status, claimed_status);
  effective_due_at := case when p_patch ? 'dueAt' then patch_due_at else claimed_due_at end;

  case
    when p_action = any(status_writing_actions) then
      has_delta := claimed_status is distinct from effective_status;
    when p_action = 'rename_task' then
      has_delta := claimed_title is distinct from patch_title;
    when p_action = 'append_note' then
      has_delta := claimed_description is distinct from patch_description;
    when p_action in ('reschedule_due', 'clear_due') then
      has_delta := claimed_due_at is distinct from effective_due_at
        or (p_patch ? 'intentionalNoDue'
            and claimed_intentional_no_due is distinct from patch_intentional_no_due)
        or (p_patch ? 'noDueReason'
            and claimed_no_due_reason is distinct from patch_no_due_reason);
    when p_action = 'set_planned' then
      has_delta := claimed_planned_at is distinct from patch_planned_at;
    when p_action = 'set_priority' then
      has_delta := claimed_manual_priority is distinct from patch_manual_priority;
    when p_action = 'assign_project' then
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'projectIds') as held(project_id)
        where held.project_id = patch_project_id::text
      ) into has_delta;
    when p_action = 'assign_context' then
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'contextIds') as held(context_id)
        where held.context_id = patch_context_id::text
      ) into has_delta;
    else
      -- `assign_person` and `set_waiting_on`. The pre-state carries `personIds`
      -- and `personRoles` as parallel arrays, so "already held" is a positional
      -- join, not a membership test: the same person may be linked twice under
      -- two different roles.
      select not exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(p_pre_state -> 'personIds')
          with ordinality as held(person_id, held_position)
        join pg_catalog.jsonb_array_elements_text(p_pre_state -> 'personRoles')
          with ordinality as held_role(person_role, role_position)
          on held_role.role_position = held.held_position
        where held.person_id = patch_person_id::text
          and held_role.person_role = patch_person_role
      ) into has_delta;
  end case;

  if not has_delta then
    return pg_catalog.jsonb_build_object(
      'outcome', 'no_change',
      'task_id', p_task_id,
      'action', p_action,
      'undo_id', null,
      'idempotent', false,
      'request_fingerprint', null,
      'reminders_cancelled', 0,
      'reminder_created_id', null,
      'undo_expires_at', null
    );
  end if;

  -- 12. Fingerprint ------------------------------------------------------------
  -- Never hand-rolled here: `public.task_command_fingerprint`
  -- (`202607250057:59-94`) is the one canonicalizer, and TypeScript never hashes.
  -- The seven arguments must be exactly what `buildFingerprintPayload` sent, or
  -- replay detection breaks. Two of them are traps: `p_owner_id` is *not* a
  -- caller argument and comes from `auth.uid()`, and the last argument is the
  -- BTRIMMED caller key — not `internal_operation_key`. TypeScript hashes its own
  -- `operationKey`, so this function must hash the same value it received, and
  -- the `'taskcmd-v1:'` prefix exists only to namespace the stored row.
  canonical_fingerprint := public.task_command_fingerprint(
    current_user_id,
    p_task_id,
    p_observed_before,
    p_pre_state,
    p_patch,
    p_policy_version,
    normalized_key
  );

  -- 13. Reservation — the FIRST write ------------------------------------------
  -- `after_state` is a placeholder in its final shape, patched by the mandatory
  -- UPDATE at step 23 once the task has been locked and the write has happened.
  -- `before_state`, `expires_at`, `status` and the `source_*` columns are left to
  -- the table defaults, exactly as `202607220044:1108-1138` leaves them.
  insert into public.undo_operations (
    user_id,
    action_type,
    entity_type,
    entity_ids,
    after_state,
    operation_key,
    request_fingerprint
  ) values (
    current_user_id,
    action_undo_action_type,
    'task',
    array[p_task_id],
    pg_catalog.jsonb_build_object(
      'task_id', p_task_id,
      'action', p_action,
      'undo_strategy', action_undo_strategy,
      'policy_version', p_policy_version,
      'request_fingerprint', canonical_fingerprint,
      'applied_patch', p_patch,
      'reminders_cancelled_count', 0,
      'reminders_reconciled', action_touches_reminders,
      'reminder_created_id', null,
      -- Placeholder, like the rest of this object. The real value is known only
      -- after step 14b consumes the row, which cannot happen before this
      -- reservation exists — the reservation is what proves this call is not a
      -- replay, and a replay must consume nothing.
      'confirmation_id', null,
      -- The one key that cannot carry even a placeholder value: it describes the
      -- ten columns after step 21, and the row is not locked yet. Recorded null so
      -- the reservation keeps the same key set as the patched row, and so a row
      -- that somehow reached a handler unpatched fails that handler's closed
      -- evidence gate instead of being restored against a state nobody observed.
      'applied_state', null,
      'relation', null
    ),
    internal_operation_key,
    canonical_fingerprint
  )
  on conflict (user_id, operation_key) where operation_key is not null
  do nothing
  returning id, expires_at into undo_id, undo_expires_at;

  -- 14. Replay -----------------------------------------------------------------
  -- Reconstructed entirely from the stored `after_state`: re-reading the task
  -- would return post-hoc state and make the replay untruthful, which is why
  -- every field the success return needs was persisted up front. Returns before
  -- any task lock, so a replay neither serializes against a concurrent command
  -- nor re-evaluates the staleness gate. Vanished-row and fingerprint-mismatch
  -- collapse into one error on purpose (`202607220044:1140-1158`): the caller
  -- learns that this key does not describe this payload, and nothing more.
  if undo_id is null then
    select operation_row.*
    into existing_operation
    from public.undo_operations as operation_row
    where operation_row.user_id = current_user_id
      and operation_row.operation_key = internal_operation_key
    for update;
    if existing_operation.id is null
      or existing_operation.request_fingerprint is distinct from canonical_fingerprint
    then
      raise exception 'Operation key payload mismatch'
        using errcode = 'P0001', detail = '2E_IDEMPOTENCY_MISMATCH';
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'applied',
      'task_id', existing_operation.after_state -> 'task_id',
      'action', existing_operation.after_state -> 'action',
      'undo_id', existing_operation.id,
      'idempotent', true,
      'request_fingerprint', existing_operation.after_state -> 'request_fingerprint',
      'reminders_cancelled', existing_operation.after_state -> 'reminders_cancelled_count',
      'reminder_created_id', existing_operation.after_state -> 'reminder_created_id',
      'undo_expires_at', pg_catalog.to_char(
        existing_operation.expires_at,
        'YYYY-MM-DD"T"HH24:MI:SS.USOF'
      )
    );
  end if;

  -- 14b. Confirmation (2E-DESTRUCTIVE-002, -003, -004) --------------------------
  -- One statement is the whole gate, and that is the design rather than a
  -- shortcut. A read-then-write pair was written first and rejected: two halves
  -- can disagree after a later edit, and the read half would have had to be
  -- re-checked under a lock anyway. Here every binding 2E-DESTRUCTIVE-002 names
  -- is a predicate of the same UPDATE that consumes the row, so "valid" and
  -- "unused" are established atomically and a caller cannot be told its evidence
  -- was accepted by one half and rejected by the other.
  --
  --   * `user_id` is `auth.uid()`, never an argument. Another owner's
  --     confirmation is simply not matched, which makes it indistinguishable
  --     from none at all (2E-OWNERSHIP-002).
  --   * `operation_key` is the *btrimmed caller key*, which is what the digest
  --     was computed over on both sides.
  --   * `request_fingerprint` is the value THIS function derived at step 12 from
  --     the seven arguments. It is never read from the request. A confirmation
  --     issued for a different payload therefore does not match, which is
  --     2E-DESTRUCTIVE-003 — "a changed proposal invalidates prior confirmation".
  --   * `status = 'issued'` is the single-use property, and it is what makes the
  --     UPDATE its own concurrency control: a second consumer blocks on the row
  --     lock, re-evaluates after the first commits, matches nothing, and is
  --     refused.
  --   * `task_id` and `action` are re-asserted even though the digest already
  --     covers them, so the row cannot be pointed at a different subject by any
  --     future edit that loosens the digest.
  --
  -- **Placed after the replay branch, deliberately.** An exact resubmission
  -- returns from the stored `after_state` above and never arrives here, so a
  -- replay consumes nothing and 2E-UPDATE-005 holds. Placing this before the
  -- reservation — where the ownership and relation probes sit — would refuse the
  -- second delivery of a request that had already succeeded, because its
  -- confirmation is by then legitimately spent.
  --
  -- **And inside the same transaction as the mutation** (2E-UPDATE-004). Every
  -- raise below this line rolls the consumption back with everything else, so a
  -- `2E_TRANSITION_INTEGRITY` loss does not cost the user the confirmation they
  -- already gave; the retry finds the row still `issued`. Consuming in a separate
  -- transaction was the alternative and would have made a lost race indefinitely
  -- expensive to a user, for no security gain.
  if action_requires_confirmation then
    update public.task_command_confirmations as confirmation
    set status = 'consumed', consumed_at = pg_catalog.now()
    where confirmation.user_id = current_user_id
      and confirmation.operation_key = normalized_key
      and confirmation.status = 'issued'
      and confirmation.request_fingerprint = canonical_fingerprint
      and confirmation.task_id = p_task_id
      and confirmation.action = p_action
    returning confirmation.id into consumed_confirmation_id;
    get diagnostics confirmation_consumed = row_count;

    if confirmation_consumed <> 1 then
      raise exception 'Destructive action requires server-issued confirmation'
        using errcode = 'P0001', detail = '2E_CONFIRMATION_REQUIRED';
    end if;
  end if;

  -- 15. Audit actor ------------------------------------------------------------
  -- Set before the task write so `audit_task_change` reads it when it co-fires.
  -- `'user'` is truthful for every apply: PRD §23.7 records that "one-step apply"
  -- is the least-friction outcome, not an unattended write. Set explicitly
  -- rather than relying on the trigger's default, so this function's intent is
  -- legible and a test can pin it. `is_local => true` keeps it from leaking
  -- across a pooled connection into an unrelated later transaction.
  perform pg_catalog.set_config('app.audit_actor', 'user', true);

  -- 15b. The creation-undo collision, restore_task's door (2E-DESTRUCTIVE-009) --
  -- A task whose originating creation operation has itself been undone is
  -- deleted, and `restore_task` is one of the three doors §13.6 requires the same
  -- guard to close. Without this, the escape hatch cancellation ships with
  -- becomes a resurrection hatch for a task the user deleted by undoing its
  -- creation.
  --
  -- **The `for update` is load-bearing and its position is load-bearing.**
  -- Without it the predicate is a snapshot read, and `private.undo_confirm_entry_tasks`
  -- committing between it and this transaction's commit would let the restore
  -- land on a task that was deleted concurrently. With it, this transaction
  -- blocks on `public.undo_operation`'s own `for update` of the same row
  -- (`202607250052:654-657`) and re-reads the committed `undone` status.
  --
  -- It runs **before** step 16 locks the task, and that ordering is not
  -- cosmetic: `public.undo_operation` takes `undo_operations` and then writes
  -- `public.tasks`, so acquiring the task first here would give the two paths
  -- opposite orders and a deadlock. Every reader of the creation family in this
  -- phase locks it before the task, for that reason.
  --
  -- The lock covers the family regardless of `status`, while the refusal reads
  -- only `undone` rows through the shared predicate: locking only the `undone`
  -- ones would leave an `available` row free to become `undone` underneath.
  if p_action = 'restore_task' then
    perform 1
    from public.undo_operations as creation
    where creation.user_id = current_user_id
      and creation.action_type = any(array[
        'confirm_entry_tasks',
        'confirm_entry_task_candidates',
        'confirm_entry_task_candidates_v5',
        'confirm_entry_task_candidates_v6'
      ])
      and p_task_id = any(creation.entity_ids)
    for update;

    if private.task_creation_undone(current_user_id, p_task_id) then
      raise exception 'Task creation was undone'
        using errcode = '55P03', detail = '2E_CREATION_UNDONE';
    end if;
  end if;

  -- 16. Lock -------------------------------------------------------------------
  select task_row.*
  into locked_task
  from public.tasks as task_row
  where task_row.id = p_task_id
    and task_row.user_id = current_user_id
  for update;
  if locked_task.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  -- 17. Typed staleness gate (2E-UPDATE-003) -----------------------------------
  if locked_task.title is distinct from claimed_title
    or locked_task.description is distinct from claimed_description
    or locked_task.status is distinct from claimed_status
    or locked_task.due_at is distinct from claimed_due_at
    or locked_task.planned_at is distinct from claimed_planned_at
    or locked_task.manual_priority is distinct from claimed_manual_priority
    or locked_task.completed_at is distinct from claimed_completed_at
    or locked_task.cancelled_at is distinct from claimed_cancelled_at
    or locked_task.intentional_no_due is distinct from claimed_intentional_no_due
    or locked_task.no_due_reason is distinct from claimed_no_due_reason
    or locked_task.created_at is distinct from claimed_created_at
    or locked_task.updated_at is distinct from claimed_updated_at
  then
    raise exception 'Task changed since the preview' using errcode = '55P03';
  end if;

  -- 18. Eligibility against the LOCKED status ----------------------------------
  if not (locked_task.status = any(action_eligible_statuses)) then
    raise exception 'Action is not allowed from the current status'
      using errcode = 'P0001', detail = '2E_INELIGIBLE_STATUS';
  end if;

  -- No candidate-slot guard here, and the absence is deliberate --------------
  -- `202607220040:13-19` made candidate identity unique only over non-cancelled
  -- rows, so a cancelled task releases its slot and returning it to an active
  -- status looks like it could collide with a task that took the slot meanwhile.
  -- It cannot, and the reason is a trigger rather than an RPC:
  -- `public.record_entry_task_candidate_confirmation`
  -- (`202607220041:299-364`) fires `after insert or update` on `public.tasks`
  -- and writes a `'confirmed'` row into `public.entry_task_candidate_resolutions`
  -- for every active task carrying valid candidate provenance. That row is keyed
  -- `unique (user_id, interpretation_id, candidate_index)`
  -- (`202607220041:29-30`), it survives the task's cancellation — nothing deletes
  -- it but `private.undo_confirm_entry_tasks` — and
  -- `confirm_entry_task_candidates_v6`'s terminal-disposition gate
  -- (`202607220044:1179-1189`) reads it. So re-confirming the candidate of a
  -- task this RPC cancelled is refused with `2C_TERMINAL_DISPOSITION`, and the
  -- duplicate that would take the slot can never exist.
  --
  -- The one path that *does* free the slot is a creation-undo, because that is
  -- what deletes the resolution rows (`202607250052:317-325`) — and that is
  -- precisely the path step 15b already refuses with `2E_CREATION_UNDONE`, before
  -- the row is even locked. The slot check would therefore have been subsumed by
  -- a guard that runs earlier, and a declared token no reachable state can raise
  -- is the defect this phase rejects twice elsewhere and codifies in ADR-049.
  --
  -- An earlier revision of this slice shipped that guard, a second private
  -- predicate, a `unique_violation` trap on both status writes and a declared
  -- `2E_CANDIDATE_REMATERIALIZED`, on the strength of a reading of
  -- `202607220044:1357-1358` — "records a resolution row only for a disposition
  -- other than `'confirmed'`" — which is true of the RPC and false of the system,
  -- because the trigger writes the confirmed rows the RPC does not. An
  -- adversarial review of the shipped code found it. All of it is removed rather
  -- than kept as defence in depth.

  -- 19. Delta against the locked row -------------------------------------------
  -- Defence in depth for the scalar actions: step 17 has proven claimed ==
  -- locked, so this cannot differ. It is *not* redundant for the four relation
  -- actions, whose state is not on `public.tasks` and is therefore absent from
  -- the gate by design; for them this is the authoritative locked re-check, and a
  -- relation that appeared since the observation is a conflict rather than a
  -- silent success.
  effective_status := coalesce(action_target_status, patch_status, locked_task.status);
  effective_title := coalesce(patch_title, locked_task.title);
  effective_due_at := case when p_patch ? 'dueAt' then patch_due_at else locked_task.due_at end;

  case
    when p_action = any(status_writing_actions) then
      has_delta := locked_task.status is distinct from effective_status;
    when p_action = 'rename_task' then
      has_delta := locked_task.title is distinct from patch_title;
    when p_action = 'append_note' then
      has_delta := locked_task.description is distinct from patch_description;
    when p_action in ('reschedule_due', 'clear_due') then
      has_delta := locked_task.due_at is distinct from effective_due_at
        or (p_patch ? 'intentionalNoDue'
            and locked_task.intentional_no_due is distinct from patch_intentional_no_due)
        or (p_patch ? 'noDueReason'
            and locked_task.no_due_reason is distinct from patch_no_due_reason);
    when p_action = 'set_planned' then
      has_delta := locked_task.planned_at is distinct from patch_planned_at;
    when p_action = 'set_priority' then
      has_delta := locked_task.manual_priority is distinct from patch_manual_priority;
    when p_action = 'assign_project' then
      select not exists (
        select 1
        from public.task_projects as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.project_id = patch_project_id
      ) into has_delta;
    when p_action = 'assign_context' then
      select not exists (
        select 1
        from public.task_contexts as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.context_id = patch_context_id
      ) into has_delta;
    else
      -- `assign_person` and `set_waiting_on`, the only two branches step 2's
      -- exhaustive taxonomy `case` can still leave here.
      select not exists (
        select 1
        from public.task_people as held
        where held.user_id = current_user_id
          and held.task_id = p_task_id
          and held.person_id = patch_person_id
          and held.role = patch_person_role
      ) into has_delta;
  end case;

  if not has_delta then
    raise exception 'Task command transition failed'
      using errcode = 'P0001', detail = '2E_TRANSITION_INTEGRITY';
  end if;

  -- 20. Due consistency against the LOCKED row (2E-UPDATE-012) -----------------
  -- The patch was already proven internally consistent at step 8. What is left
  -- is the row's own flag: a due date landing on an intentionally-undated task
  -- requires the canonical patch to clear both flags atomically, and if it does
  -- not, the caller gets a declared code instead of `tasks_no_due_consistency_check`
  -- surfacing as a raw `23514`.
  if effective_due_at is not null
    and locked_task.intentional_no_due
    and not (
      p_patch ? 'intentionalNoDue'
      and patch_intentional_no_due = false
      and p_patch ? 'noDueReason'
      and pg_catalog.jsonb_typeof(p_patch -> 'noDueReason') = 'null'
    )
  then
    raise exception 'Due date conflicts with the intentional no-due flag'
      using errcode = '22023', detail = '2E_DUE_CONSISTENCY';
  end if;

  -- 21. The domain write --------------------------------------------------------
  -- Every column UPDATE is guarded on the status the evidence recorded, and the
  -- affected count is escalated rather than ignored — the `202607230047:209-221`
  -- optimistic-guard shape. `completed_at` and `cancelled_at` are written on
  -- every status transition, set when and only when entering that status and
  -- cleared when leaving it, mirroring `persistTaskStatus`
  -- (`src/features/operations/actions.ts:148-152`) so the two paths cannot
  -- disagree. One statement serves `complete_task`, `reopen_task` and
  -- `set_status`, which is also how Slice 2E.5 admits `cancel_task` and
  -- `restore_task` without adding a write path.
  if p_action = any(status_writing_actions) then
    update public.tasks
    set
      status = effective_status,
      completed_at = case when effective_status = 'completed' then pg_catalog.now() else null end,
      cancelled_at = case when effective_status = 'cancelled' then pg_catalog.now() else null end
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'rename_task' then
    update public.tasks
    set title = patch_title
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'append_note' then
    update public.tasks
    set description = patch_description
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action in ('reschedule_due', 'clear_due') then
    update public.tasks
    set
      due_at = effective_due_at,
      intentional_no_due = case
        when p_patch ? 'intentionalNoDue' then patch_intentional_no_due
        else locked_task.intentional_no_due
      end,
      no_due_reason = case
        when p_patch ? 'noDueReason' then patch_no_due_reason
        else locked_task.no_due_reason
      end
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'set_planned' then
    update public.tasks
    set planned_at = patch_planned_at
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  elsif p_action = 'set_priority' then
    update public.tasks
    set manual_priority = patch_manual_priority
    where id = p_task_id
      and user_id = current_user_id
      and status = locked_task.status;
    get diagnostics affected = row_count;
  else
    -- The relation actions. `user_id` is written on the row and the composite
    -- owner FKs make a cross-owner relation unrepresentable, so 2E-UPDATE-016
    -- holds by construction rather than by this predicate. The
    -- `on conflict do nothing` is the second idempotency layer
    -- (`202607220044:1249-1257`) and its silent miss is escalated: the
    -- already-linked case is `no_change`, decided at step 11 and re-proven at
    -- step 19, so reaching a conflict here means a row appeared between them.
    if p_action = 'assign_project' then
      relation_table := 'task_projects';
      relation_role := null;
      insert into public.task_projects (task_id, project_id, user_id)
      values (p_task_id, patch_project_id, current_user_id)
      on conflict (task_id, project_id) do nothing
      returning project_id into relation_target_id;
    elsif p_action = 'assign_context' then
      relation_table := 'task_contexts';
      relation_role := null;
      insert into public.task_contexts (task_id, context_id, user_id)
      values (p_task_id, patch_context_id, current_user_id)
      on conflict (task_id, context_id) do nothing
      returning context_id into relation_target_id;
    else
      relation_table := 'task_people';
      relation_role := patch_person_role;
      insert into public.task_people (task_id, person_id, user_id, role)
      values (p_task_id, patch_person_id, current_user_id, patch_person_role)
      on conflict (task_id, person_id, role) do nothing
      returning person_id into relation_target_id;
    end if;
    affected := case when relation_target_id is null then 0 else 1 end;
  end if;

  if affected <> 1 then
    raise exception 'Task command transition failed'
      using errcode = 'P0001', detail = '2E_TRANSITION_INTEGRITY';
  end if;

  -- 22. Reminder reconciliation (§11.3, 2E-UPDATE-011) --------------------------
  if action_touches_reminders then
    -- Close EVERY scheduled row, not one. `reminders` has no unique constraint on
    -- `task_id`, so several scheduled rows are legal, and Slice 2E.3 verified
    -- that a task written before Phase 2E may already hold a live one — which is
    -- why the close half runs first for `reopen_task` too, or reopening could
    -- leave two live reminders. `remind_at` is recorded as an explicitly
    -- formatted string rather than `to_jsonb(timestamptz)`, which renders through
    -- the session `TimeZone` GUC that `set search_path = ''` does not pin.
    with closed as (
      update public.reminders
      set status = 'cancelled'
      where task_id = p_task_id
        and user_id = current_user_id
        and status = 'scheduled'
      returning id, title, remind_at, important
    )
    select
      pg_catalog.count(*)::integer,
      coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', closed.id,
            'title', closed.title,
            'remind_at', pg_catalog.to_char(closed.remind_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
            'important', closed.important
          )
          order by closed.id
        ),
        '[]'::jsonb
      )
    into reminders_cancelled_count, reminders_cancelled_json
    from closed;

    -- Insert exactly one fresh row when a future due date survives the patch.
    -- The condition is only that the due date is in the future: a full hour of
    -- lead is deliberately NOT required, because "move it to 5pm" typed at
    -- 4:30pm must still produce a reminder, at `now()`. The title is the
    -- *effective* one, so a rename cannot leave the reminder text contradicting
    -- the task; `reminders.title` allows 1..500 against `tasks.title`'s 240, so
    -- copying is always safe. `case when a >= b then a else b end` reproduces
    -- `create_due_task_reminder`'s `greatest(...)` — that special form cannot be
    -- resolved as a `pg_catalog` function under an empty search_path.
    if effective_due_at is not null
      and effective_due_at > pg_catalog.now()
      and effective_status not in ('completed', 'cancelled')
    then
      insert into public.reminders (user_id, task_id, title, remind_at)
      values (
        current_user_id,
        p_task_id,
        effective_title,
        case
          when pg_catalog.now() >= effective_due_at - interval '1 hour'
            then pg_catalog.now()
          else effective_due_at - interval '1 hour'
        end
      )
      returning id into reminder_created_id;
    end if;

    -- One postcondition read back from the table, rather than two comparisons of
    -- a value against itself. Both earlier forms were written and rejected as
    -- structurally unprovokable, which for a declared member of a closed error
    -- vocabulary is the same defect as a missing raise: `jsonb_agg` emits exactly
    -- one element per input row, so `jsonb_array_length(...) <> count(*)` over
    -- that single `closed` CTE could never differ, and `returning id into` on a
    -- plain INSERT against a `gen_random_uuid()` primary key
    -- (`202607160007:33-48`) could never yield NULL.
    --
    -- This has independent provenance on each side: after reconciliation the task
    -- must hold exactly the one reminder this command created, or none when it
    -- created none. The reachable cause is a direct client write —
    -- `authenticated` still holds INSERT and UPDATE on `public.reminders`
    -- (`202607160007:152-166`), which PRD §14 permits and §16.4 records as
    -- residual risk — committing between the close and here, which would leave
    -- the task holding a live reminder this command never disclosed closing.
    -- `rejected_conflict`, retryable, is the truthful answer to that: a retry
    -- closes the newcomer too.
    -- The `case` is parenthesized because plpgsql reads an `if` condition by
    -- scanning for the first `then` at paren-depth zero
    -- (`read_sql_expression(K_THEN)`), so a bare `case … when … then … end` in
    -- this position ends the condition at the `case`'s own `then`. The rest of
    -- the expression is then parsed as statements and the function fails to
    -- create with `42601 syntax error at end of input` — which is exactly how
    -- this line first reached CI. The parentheses put the inner `then` at
    -- depth one, where the scanner ignores it.
    if (
      select pg_catalog.count(*)::integer
      from public.reminders as live_reminder
      where live_reminder.task_id = p_task_id
        and live_reminder.user_id = current_user_id
        and live_reminder.status = 'scheduled'
    ) <> (case when reminder_created_id is null then 0 else 1 end) then
      raise exception 'Task command reminder reconciliation failed'
        using errcode = 'P0001', detail = '2E_REMINDER_INTEGRITY';
    end if;
  end if;

  -- 23. Patch the reservation — mandatory ---------------------------------------
  -- The reservation carried placeholders because the task had not been locked
  -- yet. Forget this UPDATE and undo restores nothing while the recorded
  -- `after_state` claims otherwise. Whatever is recorded here becomes a hard
  -- contract the handlers enforce (`202607220045:85-96` is the precedent), so
  -- under-recording makes undo unconditionally fail. The WHERE clause re-asserts
  -- `user_id`: inside a definer function it is the only tenant boundary.
  undo_before_state := pg_catalog.jsonb_build_object(
    'task_id', p_task_id,
    'action', p_action,
    'status', locked_task.status,
    'title', locked_task.title,
    'description', locked_task.description,
    'due_at', pg_catalog.to_char(locked_task.due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'planned_at', pg_catalog.to_char(locked_task.planned_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'manual_priority', locked_task.manual_priority,
    'completed_at', pg_catalog.to_char(locked_task.completed_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'cancelled_at', pg_catalog.to_char(locked_task.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'intentional_no_due', locked_task.intentional_no_due,
    'no_due_reason', locked_task.no_due_reason,
    'reminders_cancelled', reminders_cancelled_json
  );

  -- The post-forward scalar state, which is the evidence the undo guard needs and
  -- the one thing `before_state` cannot supply. Every value here is what step 21
  -- actually wrote, re-derived from the same inputs rather than read back with a
  -- second SELECT: a re-read would also pick up a concurrent committed write and
  -- record it as this command's own effect, which is the opposite of what the guard
  -- is for. Each branch mirrors the matching branch of step 21 term for term, and
  -- the two terminal timestamps now read `status_writing_actions` rather than a
  -- fourth hand-copy of that list — `completed_at` is the trap: a `rename_task` on
  -- a completed task leaves `effective_status = 'completed'` while the timestamp is
  -- untouched, so the guard is the action, not the status.
  --
  -- `pg_catalog.now()` is `transaction_timestamp()`, fixed for the whole
  -- transaction, so re-evaluating it here yields the identical instant step 21
  -- stored. Instants are formatted exactly as `before_state` formats them and never
  -- with `to_jsonb(timestamptz)`, which renders through the session `TimeZone` GUC
  -- that `set search_path = ''` does not pin; `timestamptz` is microsecond-resolution
  -- and `US` renders all six digits, so the text round-trips back to the stored value
  -- bit for bit and the handler can compare it against a typed column.
  --
  -- Recorded for the relation actions too, where every key falls through to
  -- `locked_task` because their patch touches no column of `public.tasks`. That is
  -- truthful — the relation handler restores no scalar and never reads this — and it
  -- keeps step 23 free of a branch that would have to be kept in step with step 21.
  undo_applied_state := pg_catalog.jsonb_build_object(
    'status', effective_status,
    'title', effective_title,
    'description', case
      when p_action = 'append_note' then patch_description
      else locked_task.description
    end,
    'due_at', pg_catalog.to_char(effective_due_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    'planned_at', pg_catalog.to_char(
      case when p_action = 'set_planned' then patch_planned_at else locked_task.planned_at end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'manual_priority', case
      when p_action = 'set_priority' then patch_manual_priority
      else locked_task.manual_priority
    end,
    'completed_at', pg_catalog.to_char(
      case
        when not (p_action = any(status_writing_actions))
          then locked_task.completed_at
        when effective_status = 'completed' then pg_catalog.now()
        else null::timestamptz
      end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    'cancelled_at', pg_catalog.to_char(
      case
        when not (p_action = any(status_writing_actions))
          then locked_task.cancelled_at
        when effective_status = 'cancelled' then pg_catalog.now()
        else null::timestamptz
      end,
      'YYYY-MM-DD"T"HH24:MI:SS.USOF'
    ),
    -- These two repeat step 21's own expressions verbatim, keyed on the patch and
    -- not on the action, because that is how step 21 writes them and only
    -- `reschedule_due` may carry either key.
    'intentional_no_due', case
      when p_patch ? 'intentionalNoDue' then patch_intentional_no_due
      else locked_task.intentional_no_due
    end,
    'no_due_reason', case
      when p_patch ? 'noDueReason' then patch_no_due_reason
      else locked_task.no_due_reason
    end
  );

  undo_after_state := pg_catalog.jsonb_build_object(
    'task_id', p_task_id,
    'action', p_action,
    'undo_strategy', action_undo_strategy,
    -- 2E-PROVENANCE-001: the policy version that governed this decision, durably
    -- recorded rather than only hashed into the fingerprint. It reaches
    -- `audit_logs.after_state` through the same object at step 24.
    'policy_version', p_policy_version,
    'request_fingerprint', canonical_fingerprint,
    'applied_patch', p_patch,
    'reminders_cancelled_count', reminders_cancelled_count,
    -- Whether step 22 ran at all, which is what scopes the undo's reminder
    -- post-condition. Derived from the taxonomy here so the handler does not have to
    -- carry a second copy of "which actions touch reminders".
    'reminders_reconciled', action_touches_reminders,
    'reminder_created_id', reminder_created_id,
    -- 2E-DESTRUCTIVE-007's other half. The audit trigger says *who* performed the
    -- write; this says *what authorized it*. A `task_command_applied` row for
    -- `cancel_task` carrying a confirmation id is evidence the database issued
    -- and consumed confirmation for exactly this payload, and it reaches
    -- `audit_logs.after_state` through the same object at step 24. Null for the
    -- thirteen actions the taxonomy does not gate, which is truthful rather than
    -- absent.
    'confirmation_id', consumed_confirmation_id,
    'applied_state', undo_applied_state,
    'relation', case
      when relation_table is null then null::jsonb
      else pg_catalog.jsonb_build_object(
        'table', relation_table,
        'id', relation_target_id,
        'role', relation_role
      )
    end
  );

  update public.undo_operations
  set
    before_state = undo_before_state,
    after_state = undo_after_state
  where id = undo_id and user_id = current_user_id;

  -- 24. audit_logs — the last write ---------------------------------------------
  -- `audit_task_change` co-fires on step 21's UPDATE and writes its own
  -- `task_updated` row with the actor set at step 15, so an applied column
  -- command leaves two rows: this one, which names the operation and carries the
  -- whole before/after payload, and the trigger's, which is what every other
  -- writer of `public.tasks` already produces. That is exactly the pair
  -- `confirm_entry_task_candidates_v6` produces with its trigger `task_created`
  -- row. `reason` is NOT NULL and `source_entry_id` is genuinely absent: a
  -- Phase 2E command has no originating entry (2E-UNDO-005).
  insert into public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    actor,
    before_state,
    after_state,
    reason,
    source_entry_id
  ) values (
    current_user_id,
    'task_command_applied',
    'task',
    p_task_id,
    'user',
    undo_before_state,
    undo_after_state,
    'User applied a natural-language task command',
    null
  );

  -- 25. Return -----------------------------------------------------------------
  return pg_catalog.jsonb_build_object(
    'outcome', 'applied',
    'task_id', p_task_id,
    'action', p_action,
    'undo_id', undo_id,
    'idempotent', false,
    'request_fingerprint', canonical_fingerprint,
    'reminders_cancelled', reminders_cancelled_count,
    'reminder_created_id', reminder_created_id,
    'undo_expires_at', pg_catalog.to_char(undo_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo handler: the nine column actions (2E-UPDATE-014, 2E-UNDO-001)
-- ---------------------------------------------------------------------------
-- The calling convention is exact and not negotiable: the router does
-- `execute format('select private.%I($1, $2)', resolved_handler) using
-- current_user_id, operation.id` (`202607250052:689-691`), and four pgTAP files
-- plus this migration's own assertion resolve handlers through
-- `to_regprocedure('private.' || quote_ident(handler_function) || '(uuid, uuid)')`.
-- Anything else resolves NULL and hard-fails deployment.
--
-- SECURITY INVOKER, by omitting the clause. Reached only through the definer
-- router it runs with the router's privileges, so behaviour is identical; but if
-- a future migration ever granted it by mistake, an authenticated caller would
-- still be refused by the table grants it lacks instead of gaining a
-- cross-tenant write. `undo_operation_routing.sql:119-131` asserts
-- `prosecdef = false` for every registered handler.
--
-- The re-select is deliberately NOT `for update`: the router already holds the
-- row lock. The action_type gate is not redundant with the registry either —
-- `undo_operation_routing.sql:215-225` calls a handler directly on a foreign row
-- to prove a registry mistake can never make one operation compensate another.
-- Marking the operation `'undone'` and writing `audit_logs` are the handler's
-- job: the router does neither, and omitting the first leaves the row
-- `'available'` and the undo silently replayable.

create or replace function private.undo_apply_task_command_fields(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  -- Never named `task_id`: `public.reminders` and the three relation tables all
  -- carry a column of that name, and plpgsql's default `variable_conflict =
  -- error` turns such a reference into a runtime ambiguity failure rather than
  -- silently preferring one meaning.
  target_task_id uuid;
  -- The ten scalar columns as the forward UPDATE left them, recorded at the RPC's
  -- step 23. This is the evidence the compensating UPDATE is guarded on; there is no
  -- `expected_status` any more, because guarding one column while writing ten let a
  -- second command's effect be discarded in silence.
  applied_state jsonb;
  recorded_reminders jsonb;
  reminders_restored integer := 0;
  live_reminders integer := 0;
  affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then
    raise exception 'Undo operation not found' using errcode = 'P0002';
  end if;
  if operation.action_type <> 'apply_task_command' then
    raise exception 'Unsupported undo operation' using errcode = 'P0001';
  end if;

  -- Fail closed on the recorded evidence before touching a row. Everything below
  -- restores *from* `before_state` and guards *on* `after_state -> 'applied_state'`,
  -- so an absent or non-object either one means the forward operation's step-23
  -- patch never ran and there is nothing truthful to restore — refusing is the only
  -- honest answer (`202607220045:85-96`).
  --
  -- Every term is `is distinct from`, never `<>`. `jsonb_typeof` is strict and `->`
  -- on an absent key is SQL NULL, so `jsonb_typeof(x -> 'k') <> 'array'` evaluates
  -- to NULL for precisely the shape it is written to refuse; one NULL term makes the
  -- whole `or`-chain NULL unless some other term is already true, and plpgsql treats
  -- a NULL `if` condition as false. That is how this gate first shipped fail-open
  -- for a null `before_state` and for a missing `reminders_cancelled` — the two
  -- shapes the paragraph above claims it refuses — while the element-shape gate
  -- further down already used the correct idiom for the identical reason.
  -- `cardinality(NULL)` is NULL as well, so that term needs it too.
  --
  -- `applied_state` and `reminders_reconciled` are *required*, not defaulted. An
  -- operation recorded before they existed can be neither guarded nor reconciled
  -- truthfully, and refusing it is strictly better than silently falling back to a
  -- status-only guard over a ten-column write. No such row exists anywhere: this
  -- migration has never been applied to the linked project, so this is a contract
  -- statement rather than a compatibility shim.
  if pg_catalog.jsonb_typeof(operation.before_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state) is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.before_state -> 'reminders_cancelled')
       is distinct from 'array'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'applied_state')
       is distinct from 'object'
    or pg_catalog.jsonb_typeof(operation.after_state -> 'reminders_reconciled')
       is distinct from 'boolean'
    -- Slice 2E.5. The recorded action decides whether the creation-undo guard
    -- below applies, so an operation that does not carry one cannot be
    -- compensated safely: `->>` on an absent key is SQL NULL, and a NULL
    -- action would silently take the un-guarded path for a row that might well
    -- be a cancel. Required, not defaulted, for the same reason `applied_state`
    -- and `reminders_reconciled` are.
    or pg_catalog.jsonb_typeof(operation.after_state -> 'action')
       is distinct from 'string'
    or pg_catalog.cardinality(operation.entity_ids) is distinct from 1
  then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  target_task_id := operation.entity_ids[1];
  applied_state := operation.after_state -> 'applied_state';
  recorded_reminders := operation.before_state -> 'reminders_cancelled';

  -- 2E-DESTRUCTIVE-008: the cancel/creation-undo collision -------------------
  -- "A task whose originating creation operation has itself been undone ... is
  -- treated as deleted: a cancel-undo targeting it refuses with `55P03` and a
  -- declared detail code."
  --
  -- **Why the cancel-undo is the one field-undo that needs this, exhaustively.**
  -- `private.undo_confirm_entry_tasks` compensates a creation by cancelling,
  -- with `and status <> 'cancelled'` (`202607250052:310-314`), so on a task the
  -- user had already cancelled it changes nothing at all. The ten scalars
  -- therefore still equal the `applied_state` the cancel recorded, the guard
  -- below passes, and the restore would write `status = 'todo'` — a deleted task
  -- resurrected by a control the product legitimately offers. Every *other*
  -- action's undo is already refused by that same guard, because a creation-undo
  -- forces the row to `cancelled` while their `applied_state.status` is
  -- something else, and `cancel_task` is the only action in PRD §11.2 whose
  -- target status is `cancelled` — `set_status` is bounded to the six
  -- non-terminal precisely so it cannot be a second route. The pgTAP suite
  -- asserts that reasoning rather than trusting it, by proving a non-cancel
  -- field-undo on a creation-undone task is refused by the ten-column guard.
  --
  -- **The `for update` and its position.** Without the lock this is a snapshot
  -- read and a concurrent creation-undo committing afterwards would let the
  -- restore land anyway. With it, this blocks on `public.undo_operation`'s own
  -- `for update` of that row (`202607250052:654-657`) and then sees `undone`. It
  -- runs before the compensating UPDATE touches `public.tasks`, so this handler
  -- takes `undo_operations` before `public.tasks` exactly as its own router
  -- does; the reverse order against a concurrent creation-undo is a deadlock.
  -- The lock covers the family regardless of status while the refusal reads only
  -- `undone` rows, because locking only the `undone` ones would leave an
  -- `available` row free to become one underneath.
  if operation.after_state ->> 'action' is not distinct from 'cancel_task' then
    perform 1
    from public.undo_operations as creation
    where creation.user_id = p_user_id
      and creation.action_type = any(array[
        'confirm_entry_tasks',
        'confirm_entry_task_candidates',
        'confirm_entry_task_candidates_v5',
        'confirm_entry_task_candidates_v6'
      ])
      and target_task_id = any(creation.entity_ids)
    for update;

    if private.task_creation_undone(p_user_id, target_task_id) then
      raise exception 'Task creation was undone'
        using errcode = '55P03', detail = '2E_CREATION_UNDONE';
    end if;
  end if;

  -- There is no candidate-slot guard here either, for the reason the forward
  -- path records at step 18b: `public.record_entry_task_candidate_confirmation`
  -- writes a `'confirmed'` resolution row for every active candidate task, that
  -- row survives cancellation, and `2C_TERMINAL_DISPOSITION` therefore refuses
  -- the re-confirmation that would take the slot. The only path that frees it is
  -- a creation-undo, which the guard directly above already refuses.

  -- The compensating column write is performed by the system executing a stored
  -- operation, which is what the trigger row describes; the `operation_undone`
  -- row below describes who *asked* for it (`actor = 'user'`). Together they make
  -- user-driven and undo-driven transitions distinguishable in audit at the
  -- trigger layer, which is what 2E-DESTRUCTIVE-007 needs in Slice 2E.5 without
  -- reopening `audit_task_change` again.
  perform pg_catalog.set_config('app.audit_actor', 'system', true);

  -- Guarded on all ten columns this SET list writes, against the state the forward
  -- operation *produced* — not on `status` alone. Undo must refuse when a newer
  -- change would be silently discarded (2E-UPDATE-014, 2E-UNDO-004), and a
  -- status-only guard did not: two commands on one task (a rename, then a
  -- `reschedule_due`) followed by an undo of the *first* left the status untouched,
  -- so the guard matched, the restore wrote `due_at = null` on top of the second
  -- command, and the reminder that command armed stayed `scheduled` on a task with
  -- no due date — reported as `{"undone": true}`.
  --
  -- This is the forward path's twelve-column staleness gate (step 17) in the
  -- compensating direction, and the same shape for the same reason: every term is
  -- `is not distinct from`, because nine of the ten columns are nullable and `=`
  -- would make a NULL column never match and refuse every undo of a task that has
  -- one. `created_at` and `updated_at` are the two the forward gate has and this one
  -- does not: neither is restored here, and `updated_at` moves for any write to any
  -- column outside these ten (`tasks_updated_at`, `202607160003:180`), so guarding
  -- on it would refuse undos that would discard nothing at all.
  --
  -- Narrowing the SET list to the columns the recorded action touches is the other
  -- way to close the same hole, and it is rejected: withdrawn decision D17 makes the
  -- forward status branch write `completed_at` and `cancelled_at` unconditionally,
  -- so a narrowed restore would strand a `completed_at` the forward path cleared.
  update public.tasks
  set
    status = operation.before_state ->> 'status',
    title = operation.before_state ->> 'title',
    description = operation.before_state ->> 'description',
    due_at = (operation.before_state ->> 'due_at')::timestamptz,
    planned_at = (operation.before_state ->> 'planned_at')::timestamptz,
    manual_priority = operation.before_state ->> 'manual_priority',
    completed_at = (operation.before_state ->> 'completed_at')::timestamptz,
    cancelled_at = (operation.before_state ->> 'cancelled_at')::timestamptz,
    intentional_no_due = coalesce(
      (operation.before_state ->> 'intentional_no_due')::boolean,
      false
    ),
    no_due_reason = operation.before_state ->> 'no_due_reason'
  where user_id = p_user_id
    and id = target_task_id
    and status is not distinct from applied_state ->> 'status'
    and title is not distinct from applied_state ->> 'title'
    and description is not distinct from applied_state ->> 'description'
    and due_at is not distinct from (applied_state ->> 'due_at')::timestamptz
    and planned_at is not distinct from (applied_state ->> 'planned_at')::timestamptz
    and manual_priority is not distinct from applied_state ->> 'manual_priority'
    and completed_at is not distinct from (applied_state ->> 'completed_at')::timestamptz
    and cancelled_at is not distinct from (applied_state ->> 'cancelled_at')::timestamptz
    and intentional_no_due
        is not distinct from (applied_state ->> 'intentional_no_due')::boolean
    and no_due_reason is not distinct from applied_state ->> 'no_due_reason';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Task command undo integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_RESTORE_INTEGRITY';
  end if;

  -- Reminders are restored by the same close-and-insert mechanism the forward
  -- path used (2E-UPDATE-014). Un-cancelling the recorded ids would be safe only
  -- while the heartbeat keeps selecting `status = 'scheduled'`; inserting fresh
  -- rows is safe under every ordering, because a notification keyed
  -- `'reminder:' || id` makes an id that has already fired unable to fire again.
  -- The recorded `remind_at` is restored verbatim even when it is now past: a
  -- past-due scheduled reminder firing on the next tick is the state that
  -- existed. The cost is dead rows, and that is accepted.
  if operation.after_state ->> 'reminder_created_id' is not null then
    update public.reminders
    set status = 'cancelled'
    where user_id = p_user_id
      and id = (operation.after_state ->> 'reminder_created_id')::uuid
      and status in ('scheduled', 'snoozed');
    -- Deliberately no count check: the heartbeat may already have sent this row,
    -- and a sent reminder is history that undo does not rewrite (ADR-018).
  end if;

  -- Fail closed on the recorded element *shape* before inserting. This is not the
  -- reminder post-condition — that one is below, read back from the table — and the
  -- two are kept apart because they refuse different things. `jsonb_array_elements`
  -- yields exactly one row per element and the evidence gate above already proved
  -- the value is an array, so `reminders_restored <> jsonb_array_length(recorded_reminders)`
  -- compared the array's length against itself: it was written, and rejected as
  -- structurally unprovokable, which for a declared member of the closed `2E_*`
  -- vocabulary is the same defect as no raise at all.
  --
  -- What is genuinely reachable is a recorded element that does not carry the four
  -- fields the forward path writes. `->>` yields NULL for a non-object and for an
  -- absent key, so `public.reminders` would surface a raw `23502` — or a `22007`
  -- out of the instant cast — that no mapper case covers, instead of this slice's
  -- declared code. Whatever the forward path records becomes a hard contract the
  -- undo enforces (`202607220045:85-96`); this states that contract where it can
  -- still refuse cheaply. `is distinct from` on every term, for the reason the
  -- evidence gate above now spells out at length: `jsonb_typeof` of an absent key is
  -- SQL NULL and `NULL <> 'string'` is NULL, so `<>` would let exactly the malformed
  -- element this exists to catch pass straight through. This gate had that idiom
  -- right from the first commit, which is how the evidence gate above — written with
  -- `<>` and documented as fail-closed — was found not to be.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(recorded_reminders) as recorded(value)
    where pg_catalog.jsonb_typeof(recorded.value) is distinct from 'object'
      or pg_catalog.jsonb_typeof(recorded.value -> 'title') is distinct from 'string'
      or pg_catalog.jsonb_typeof(recorded.value -> 'remind_at') is distinct from 'string'
      or pg_catalog.jsonb_typeof(recorded.value -> 'important') is distinct from 'boolean'
  ) then
    raise exception 'Task command undo reminder integrity check failed'
      using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
  end if;

  insert into public.reminders (user_id, task_id, title, remind_at, important)
  select
    p_user_id,
    target_task_id,
    recorded.value ->> 'title',
    (recorded.value ->> 'remind_at')::timestamptz,
    coalesce((recorded.value ->> 'important')::boolean, false)
  from pg_catalog.jsonb_array_elements(recorded_reminders) as recorded(value);
  get diagnostics reminders_restored = row_count;

  -- The reminder post-condition, read back from the table — the forward path's own
  -- shape (its step 22), which this handler was missing. The element gate above
  -- refuses malformed *evidence*, and the forward path cannot write malformed
  -- evidence, so on its own it left `2E_UNDO_REMINDER_INTEGRITY` unraisable from any
  -- state a real operation can reach. That is the identical objection step 22 uses
  -- to reject its own tautological count form, so the file was inconsistent with
  -- itself: a declared member of a closed error vocabulary that no reachable state
  -- can provoke is the same defect as a missing raise.
  --
  -- The expected count is exact, not approximate. The forward reconciliation closed
  -- EVERY `scheduled` row and recorded each one, this handler cancelled the single
  -- row that reconciliation created and re-inserted exactly the recorded ones, and
  -- nothing else in the product inserts a reminder for an existing task —
  -- `create_due_task_reminder` is `after insert on public.tasks` only
  -- (`202607160007:209`), so neither UPDATE above can have added one. What is
  -- reachable on the other side is the direct client write `authenticated` can still
  -- perform, because it keeps INSERT and UPDATE on `public.reminders`
  -- (`202607160007:152-166`, permitted by PRD §14 and recorded as residual risk in
  -- §16.4), committing between the forward close and here: that leaves the task
  -- holding a live reminder no operation in this chain ever disclosed, on top of a
  -- pre-state the undo has just restored. Refusing is retryable and truthful.
  --
  -- Scoped to operations that actually reconciled reminders, from the recorded
  -- `reminders_reconciled` rather than from a second copy of the taxonomy. Run
  -- unconditionally it would refuse the undo of a `rename_task` or an `append_note`
  -- on a task legitimately holding a live reminder neither ever touched: those
  -- actions record an empty array, so the comparison would be against zero.
  if (operation.after_state ->> 'reminders_reconciled')::boolean then
    select pg_catalog.count(*)::integer
    into live_reminders
    from public.reminders as live_reminder
    where live_reminder.task_id = target_task_id
      and live_reminder.user_id = p_user_id
      and live_reminder.status = 'scheduled';
    if live_reminders
      is distinct from pg_catalog.jsonb_array_length(recorded_reminders)
    then
      raise exception 'Task command undo reminder integrity check failed'
        using errcode = 'P0001', detail = '2E_UNDO_REMINDER_INTEGRITY';
    end if;
  end if;

  update public.undo_operations
  set status = 'undone', undone_at = pg_catalog.now()
  where id = operation.id;

  insert into public.audit_logs (
    user_id, action_type, entity_type, entity_id, actor, before_state, after_state, reason, source_entry_id
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    target_task_id,
    'user',
    operation.after_state,
    pg_catalog.jsonb_build_object(
      'task_id', target_task_id,
      'restored_status', operation.before_state ->> 'status',
      'reminders_restored', reminders_restored
    ),
    'User executed the stored compensating operation',
    operation.source_entry_id
  );

  return pg_catalog.jsonb_build_object(
    'undone', true,
    'affected', affected,
    'reminders_restored', reminders_restored,
    'idempotent', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The creation-undo handler, re-pasted for its audit actor (2E-DESTRUCTIVE-007)
-- ---------------------------------------------------------------------------
-- Body copied verbatim from `202607250052:282-376` with exactly one change: it
-- now sets `app.audit_actor` to `'system'` before the `public.tasks` UPDATE,
-- the way `private.undo_apply_task_command_fields` already does
-- (`202607260058:1703`).
--
-- **Why this is in scope for a destructive-actions slice.**
-- 2E-DESTRUCTIVE-007 requires user cancellation and undo-driven cancellation to
-- be distinguishable in audit, and there are three routes to a cancelled task,
-- not two: `cancel_task` (this slice), the undo of a `restore_task`, and this
-- handler, which compensates a creation by cancelling. Without this line the
-- third one writes `actor = 'user'` through `public.audit_task_change`'s
-- default — a system-executed compensating write recorded as a user act, which
-- is exactly the mis-attribution PRD §20 names as a risk and §13.6 as a
-- requirement. `202607260058:246-251` claimed this slice would make the property
-- "provable at the trigger layer"; for that claim to be true rather than
-- narrowly true of Phase 2E's own writes, this route has to speak the same
-- mechanism.
--
-- **It is the same mechanism, not a second one.** No new setting, no new column,
-- no new trigger: one `set_config` call on the GUC ADR-046 already defines, read
-- by the trigger that already reads it, with the same meaning the Phase 2E
-- handlers give it — the trigger row describes who performed the column write
-- (the system, executing a stored operation), while this handler's own
-- `operation_undone` row keeps `actor = 'user'` because that describes who asked
-- for it. The pair is strictly more informative than either alone.
--
-- **Blast radius, checked rather than assumed.** `audit_logs.actor` is read in
-- exactly one place in the product — `src/app/[locale]/app/history/page.tsx:17`
-- selects it and renders it as text — and is branched on nowhere. The change is
-- therefore visible only as a more truthful word in the change history. It is
-- `is_local => true`, so it cannot outlive the transaction on a pooled
-- connection.

create or replace function private.undo_confirm_entry_tasks(
  p_user_id uuid,
  p_undo_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  operation public.undo_operations%rowtype;
  affected integer := 0;
  resolution_affected integer := 0;
  expected_resolution_count integer := 0;
  result_affected integer := 0;
begin
  select * into operation
  from public.undo_operations
  where id = p_undo_id and user_id = p_user_id;
  if operation.id is null then raise exception 'Undo operation not found' using errcode = 'P0002'; end if;
  if operation.action_type not in (
    'confirm_entry_tasks',
    'confirm_entry_task_candidates',
    'confirm_entry_task_candidates_v5',
    'confirm_entry_task_candidates_v6'
  ) then
    raise exception 'Unsupported undo operation';
  end if;

  -- 2E-DESTRUCTIVE-007. The one line this re-paste adds. It must precede the
  -- UPDATE below, because that is what makes `public.audit_task_change` co-fire
  -- and read the setting.
  perform pg_catalog.set_config('app.audit_actor', 'system', true);

  update public.tasks
  set status = 'cancelled', cancelled_at = now()
  where user_id = p_user_id
    and id = any(operation.entity_ids)
    and status <> 'cancelled';
  get diagnostics affected = row_count;

  delete from public.entry_task_candidate_resolutions as resolution_row
  where resolution_row.user_id = p_user_id
    and (
      resolution_row.undo_operation_id = operation.id
      or (
        pg_catalog.cardinality(operation.entity_ids) > 0
        and resolution_row.task_id = any(operation.entity_ids)
      )
  );
  get diagnostics resolution_affected = row_count;

  if operation.action_type in (
    'confirm_entry_task_candidates_v5',
    'confirm_entry_task_candidates_v6'
  ) then
    if pg_catalog.jsonb_typeof(operation.after_state -> 'resolutions') is distinct from 'array' then
      raise exception 'Candidate resolution undo integrity check failed'
        using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
    end if;
    expected_resolution_count := pg_catalog.jsonb_array_length(
      operation.after_state -> 'resolutions'
    );
    if resolution_affected <> expected_resolution_count then
      raise exception 'Candidate resolution undo integrity check failed'
        using errcode = 'P0001', detail = '2C_UNDO_RESOLUTION_INTEGRITY';
    end if;
  end if;

  result_affected := case
    when operation.action_type in (
      'confirm_entry_task_candidates_v5',
      'confirm_entry_task_candidates_v6'
    )
      then case
        when affected >= resolution_affected then affected
        else resolution_affected
      end
    else affected
  end;

  update public.undo_operations
  set status = 'undone', undone_at = now()
  where id = operation.id;
  insert into public.audit_logs (
    user_id, action_type, entity_type, actor, before_state, after_state, reason
  ) values (
    p_user_id,
    'operation_undone',
    operation.entity_type,
    'user',
    operation.after_state,
    jsonb_build_object(
      'cancelled_entity_ids', to_jsonb(operation.entity_ids),
      'removed_candidate_resolution_count', resolution_affected
    ),
    'User executed the stored compensating operation'
  );
  return jsonb_build_object('undone', true, 'affected', result_affected, 'idempotent', false);
end;
$$;

revoke all on function private.undo_confirm_entry_tasks(uuid, uuid) from public, anon, authenticated, service_role;
-- ---------------------------------------------------------------------------
-- The recovery affordance (2E-DESTRUCTIVE-006, 2E-DESTRUCTIVE-009)
-- ---------------------------------------------------------------------------
-- PRD §23.4: "A confirmed destructive action whose result silently disappears
-- is not acceptable, and neither is one the user can never exit; `restore_task`
-- and the cancelled-task affordance ship with the slice that introduces
-- user-facing cancellation." Epic 2E-E names the affordance as the third door
-- 2E-DESTRUCTIVE-009's guard must close.
--
-- **A second listing RPC was written for this and thrown away.** The affordance
-- already exists: `public.list_task_command_candidates` takes
-- `p_eligible_statuses` as its only non-defaulted argument, admits every
-- eligible row when the command carried no hint (`202607250056:459-462,475-478`),
-- orders totally before truncating (`:481-487`), and projects `cancelled_at`
-- alongside the rest. Called with `array['cancelled']` and no hints it *is* the
-- owner-scoped cancelled-task listing, and Slice 2E.7 renders it.
--
-- Shipping a parallel one would have been worse than redundant. The exclusion
-- 2E-DESTRUCTIVE-009 demands would then have lived on the *new* function only,
-- leaving this one free to rank a creation-undone task for `restore_task` — so
-- the matching path would keep offering the user a task the RPC refuses, which
-- §12.6 and 2E-DISAMBIG-005 treat as a defect rather than as a refusal. Putting
-- the predicate here instead closes the recovery affordance, the `restore_task`
-- match and every other action's candidate set in one place, which is literally
-- what "the same guard covers every other door" asks for.
--
-- **Body re-pasted whole from `202607250056:119-628` with one added predicate**,
-- in the `scanned` CTE beside the existing eligible-status filter. The result
-- columns and the argument list are untouched, which is what `create or replace`
-- requires of this function in particular: its amendment window is closed by
-- exhaustion and any change to either would cost a `_v2` (`42P13`). A body-only
-- change costs nothing.
--
-- **The candidate-slot conflict is deliberately NOT excluded here**, and the
-- asymmetry is the point. A creation-undone task is *deleted* — permanently, by
-- the user's own act — so offering it would be offering a resurrection the
-- database will always refuse. A task whose candidate slot has been taken is
-- merely *blocked*, by a duplicate the user can still cancel, so hiding it would
-- hide the only row from which the situation is legible. It stays listed and
-- `restore_task` refuses it with a declared, localized reason.

create or replace function public.list_task_command_candidates(
  p_eligible_statuses text[],
  p_title_query text default null,
  p_project_hint text default null,
  p_context_hint text default null,
  p_person_hint text default null,
  p_observed_before timestamptz default null,
  p_limit integer default 25,
  -- Appended, and every one defaulted. Position matters: `proargnames` is
  -- pinned as an ordered array by the pgTAP contract, and `pronargdefaults`
  -- encodes that `p_eligible_statuses` is the only required argument. Adding a
  -- non-defaulted argument, or inserting one mid-list, breaks both.
  --
  -- These are the *patch's* references — what the command wants to assign — and
  -- are unrelated to `p_project_hint`/`p_context_hint`/`p_person_hint`, which
  -- describe which task the user meant. "add the invoice task to Acme" carries
  -- a title hint of "invoice" and a project *ref* of "Acme", and conflating the
  -- two would make the task that is already in Acme outrank the one the user
  -- named.
  p_project_ref text default null,
  p_context_ref text default null,
  p_person_ref text default null
)
returns table (
  task_id uuid,
  owner_id uuid,
  title text,
  description text,
  status text,
  due_at timestamptz,
  planned_at timestamptz,
  manual_priority text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  intentional_no_due boolean,
  no_due_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  project_ids uuid[],
  project_names text[],
  context_ids uuid[],
  context_names text[],
  person_ids uuid[],
  person_names text[],
  person_roles text[],
  project_hint_matched boolean,
  context_hint_matched boolean,
  person_hint_matched boolean,
  last_audited_at timestamptz,
  observed_before timestamptz,
  prefilter_tier integer,
  token_overlap integer,
  query_token_count integer,
  effective_limit integer,
  -- Query-scalar, like `observed_before` and `effective_limit`: resolved once
  -- and cross-joined onto every row, so a result set whose rows disagree is a
  -- broken contract rather than an unusual query, and `candidates.ts` refuses it
  -- on exactly that ground.
  --
  -- Null means "no owned entity of that name at `observed_before`, or more than
  -- one" — the two failures `resolve_owned_entity_exact` deliberately collapses.
  -- The preview does not pretend to tell them apart: both mean it cannot name
  -- the thing the user asked for, and both produce the same truthful copy.
  project_ref_id uuid,
  context_ref_id uuid,
  person_ref_id uuid,
  -- The resolved entity's stored name, so 2E-PREVIEW-002 can render the
  -- proposed value of a relation the task does not hold yet. Null exactly when
  -- its id is null.
  project_ref_name text,
  context_ref_name text,
  person_ref_name text,
  -- Per-row, unlike the three above: reminders belong to the candidate.
  -- `scheduled` only — the heartbeat selects no other status, so a `snoozed`,
  -- `sent` or `cancelled` row can never fire and cancelling it would be a
  -- disclosed effect that does not exist.
  scheduled_reminder_count integer,
  next_reminder_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select (select auth.uid()) as id
  ),
  bounds as (
    select
      least(greatest(coalesce(p_limit, 25), 1), 100) as lim,
      -- The recency signal of 2E-MATCH-006 must exclude rows written by the
      -- current command. Matching runs before any write, so the truthful and
      -- testable way to say that is "audit rows strictly older than the
      -- instant this command was resolved against" — which also makes the
      -- signal a pure function of the clock the caller injected, as
      -- 2E-MATCH-017 requires. `now()` is only the fallback for direct SQL and
      -- pgTAP; the application always passes its injected instant, and the
      -- instant actually used is echoed back so the pre-state a later slice
      -- gates on is one this function vouched for.
      coalesce(p_observed_before, now()) as observed_before
  ),
  ref_ids as (
    select
      cl.id as owner_id,
      public.resolve_owned_entity_exact(
        cl.id, 'project', left(coalesce(p_project_ref, ''), 160), b.observed_before
      ) as project_ref_id,
      public.resolve_owned_entity_exact(
        cl.id, 'context', left(coalesce(p_context_ref, ''), 120), b.observed_before
      ) as context_ref_id,
      public.resolve_owned_entity_exact(
        cl.id, 'person', left(coalesce(p_person_ref, ''), 160), b.observed_before
      ) as person_ref_id
    from caller cl
    cross join bounds b
  ),
  refs as (
    -- The patch's relation references, resolved once per query.
    --
    -- `resolve_owned_entity_exact` is the resolver the rest of the product uses
    -- (`202607170020:322`): owner-scoped, normalized through the same
    -- authoritative function every lexical decision below uses, alias-aware
    -- within the alias's validity window, and returning a row only when exactly
    -- one owned entity matches. Reusing it rather than restating its query is
    -- the point — ADR-021 records entity-resolution duplication as a source of
    -- silent divergence, and this would have been the second copy.
    --
    -- Equality on the normalized name, never the hint predicate's
    -- equality-or-word-containment: the hints are asking "which task did you
    -- mean", where a partial match is evidence, while these are asking "is this
    -- exactly the project you named", where a partial match is wrong. A ref of
    -- "Acme" must not report that a task linked to "Acme Corp" already holds it.
    --
    -- Bounded like every hint, and for the same reason: PostgREST exposes this
    -- function directly, and the lengths match the columns each is resolved
    -- against — `projects.name` and `people.name` 160, `contexts.name` 120.
    -- `resolve_owned_entity_exact` returns null for the empty string, so an
    -- absent reference costs one null comparison and nothing else.
    --
    -- Resolved at `observed_before`, not at `now()`, so the alias window is the
    -- same instant the pre-state was read at.
    select
      ri.project_ref_id,
      ri.context_ref_id,
      ri.person_ref_id,
      -- The resolved entity's *stored* name, which the id alone cannot supply.
      --
      -- Added after a review proved the preview could never name the thing it
      -- was about to add: it was looking the resolved id up in the arrays of
      -- relations the task *already holds*, so the name resolved only in the
      -- `no_change` case — the one case where it is not needed — and the real
      -- addition rendered a bare "+1". 2E-PREVIEW-002 asks for the proposed
      -- value, and "+1" is not a value.
      --
      -- The stored name rather than the user's own words, because the preview
      -- is a statement about the user's data: `normalize_entity_alias` folds
      -- case, accents and punctuation, so a ref of "acme corp" legitimately
      -- resolves a project stored as "ACME Corp." and echoing the typing back
      -- would confirm something the database does not hold.
      --
      -- Owner-scoped again here, even though the id came from an owner-scoped
      -- resolver. The predicate costs nothing on a primary-key lookup and this
      -- is a `security definer` function where the predicate is the only
      -- ownership control there is.
      (
        select p.name from public.projects p
        where p.id = ri.project_ref_id and p.user_id = ri.owner_id
      ) as project_ref_name,
      (
        select c.name from public.contexts c
        where c.id = ri.context_ref_id and c.user_id = ri.owner_id
      ) as context_ref_name,
      (
        select pe.name from public.people pe
        where pe.id = ri.person_ref_id and pe.user_id = ri.owner_id
      ) as person_ref_name
    from ref_ids ri
  ),
  statuses as (
    -- Eligibility is owned by the TypeScript taxonomy (PRD §11.2 as data), so
    -- it arrives as a parameter rather than being restated here — one taxonomy
    -- is an Epic 2E-H convergence requirement. What this CTE does is fail
    -- closed: an element outside the eight `tasks_status_check` literals is
    -- dropped rather than widening candidacy, and an empty or wholly invalid
    -- array yields no candidates at all.
    --
    -- This list is the third copy of those literals (the CHECK and
    -- `TASK_STATUSES` are the others) and it fails *silently*, so
    -- `status-vocabulary-parity.test.ts` reads this file and reds if it ever
    -- stops matching the taxonomy.
    -- Bounded like every other argument, and for the same reason the hints are
    -- (see below): PostgREST exposes this function directly, and this was the
    -- one input a caller could make arbitrarily large. The bound is on the
    -- *input* rather than the output, because `distinct` over a million-element
    -- array does the work whatever the result size.
    --
    -- 32 against a vocabulary of 8: a legitimate caller sends at most the eight
    -- literals, so the slice cannot drop a value the membership filter would
    -- have kept, and the margin leaves room for duplicates without inventing a
    -- reason for a well-formed command to fail.
    select array(
      select distinct s
      from unnest((coalesce(p_eligible_statuses, '{}'::text[]))[1:32]) as s
      where s in (
        'inbox', 'todo', 'in_progress', 'waiting', 'blocked', 'deferred',
        'completed', 'cancelled'
      )
    ) as eligible
  ),
  hints as (
    -- `normalize_entity_alias` is `strict`, so a null argument returns null;
    -- the coalesce around the argument keeps every hint a string.
    --
    -- Bounded here and not only in TypeScript. The 2E-COMMAND-005 caps live in
    -- the command schema, but PostgREST exposes this function directly to any
    -- authenticated caller, and an unbounded hint turns the token lateral below
    -- into an unbounded number of `LIKE` comparisons per candidate. The lengths
    -- match the columns each hint is compared against: `tasks.title` is capped
    -- at 240, `projects.name` and `people.name` at 160, `contexts.name` at 120.
    --
    -- Normalization also closes a LIKE-metacharacter hole for free: the
    -- function's own `[^a-z0-9]+` replacement means no `%`, `_` or backslash
    -- can survive into the containment tests below, so the model-supplied hint
    -- cannot widen its own pattern.
    select
      public.normalize_entity_alias(left(coalesce(p_title_query, ''), 240)) as q,
      public.normalize_entity_alias(left(coalesce(p_project_hint, ''), 160)) as project_q,
      public.normalize_entity_alias(left(coalesce(p_context_hint, ''), 120)) as context_q,
      public.normalize_entity_alias(left(coalesce(p_person_hint, ''), 160)) as person_q
  ),
  hint_query as (
    select
      h.q,
      h.project_q,
      h.context_q,
      h.person_q,
      -- Ordered before it is bounded, for the same reason the candidate query
      -- is: an arbitrary sixteen of a caller's tokens would make scoring depend
      -- on something no fixture can pin. Sixteen is above MAX_TITLE_WORDS (12),
      -- so a well-formed command never reaches it.
      array(
        select distinct tok
        from unnest(string_to_array(h.q, ' ')) as tok
        where tok <> ''
        order by tok
        limit 16
      ) as tokens
    from hints h
  ),
  scanned as (
    select
      t.id,
      t.user_id,
      t.title,
      t.description,
      t.status,
      t.due_at,
      t.planned_at,
      t.manual_priority,
      t.completed_at,
      t.cancelled_at,
      t.intentional_no_due,
      t.no_due_reason,
      t.created_at,
      t.updated_at,
      public.normalize_entity_alias(t.title) as nt,
      -- A relation hint qualifies a candidate as well as scoring it. Without
      -- that, "mark the Acme task as done" could never reach a task titled
      -- "Send invoice" that lives in project Acme, because no lexical signal
      -- connects the hint to the title.
      (
        q.project_q <> '' and exists (
          select 1
          from public.task_projects tp
          join public.projects p
            on p.id = tp.project_id and p.user_id = tp.user_id
          where tp.task_id = t.id
            and tp.user_id = t.user_id
            and (
              public.normalize_entity_alias(p.name) = q.project_q
              or ' ' || public.normalize_entity_alias(p.name) || ' '
                 like '% ' || q.project_q || ' %'
            )
        )
      ) as project_hit,
      (
        q.context_q <> '' and exists (
          select 1
          from public.task_contexts tc
          join public.contexts c
            on c.id = tc.context_id and c.user_id = tc.user_id
          where tc.task_id = t.id
            and tc.user_id = t.user_id
            and (
              public.normalize_entity_alias(c.name) = q.context_q
              or ' ' || public.normalize_entity_alias(c.name) || ' '
                 like '% ' || q.context_q || ' %'
            )
        )
      ) as context_hit,
      (
        q.person_q <> '' and exists (
          select 1
          from public.task_people tpe
          join public.people pe
            on pe.id = tpe.person_id and pe.user_id = tpe.user_id
          where tpe.task_id = t.id
            and tpe.user_id = t.user_id
            and (
              public.normalize_entity_alias(pe.name) = q.person_q
              or ' ' || public.normalize_entity_alias(pe.name) || ' '
                 like '% ' || q.person_q || ' %'
            )
        )
      ) as person_hit
    from public.tasks t
    cross join caller cl
    cross join hint_query q
    cross join statuses st
    where cl.id is not null
      and t.user_id = cl.id
      and t.status = any (st.eligible)
      -- Slice 2E.5, 2E-DESTRUCTIVE-009. A task whose originating creation
      -- operation has itself been undone is deleted, so it is not a candidate
      -- for anything: not for `restore_task`, which would resurrect it and be
      -- refused with `2E_CREATION_UNDONE`; not for the cancelled-task recovery
      -- affordance, which is this function called with `array['cancelled']` and
      -- no hints; and not for the other thirteen actions either, which is
      -- stricter than §13.6 asks and is the correct reading of "treated as
      -- deleted" — a deleted task is not renameable or reschedulable either.
      --
      -- The same `private.task_creation_undone` the two raising doors read, so
      -- the three cannot drift apart. It is a `stable sql` EXISTS over an
      -- owner-scoped, `status`-filtered scan of `public.undo_operations`, run
      -- once per surviving row rather than over the whole table.
      and not private.task_creation_undone(cl.id, t.id)
  ),
  tiered as (
    select
      s.*,
      o.overlap,
      cardinality(q.tokens) as query_tokens,
      case
        -- 0: the normalized title *is* the normalized hint.
        when q.q <> '' and s.nt = q.q then 0
        -- 1: the whole hint appears in the title as complete words. Bounded
        -- below three characters, because a one- or two-letter fragment
        -- containing itself in half the user's tasks is noise, not a signal.
        when q.q <> ''
          and length(q.q) >= 3
          and ' ' || s.nt || ' ' like '% ' || q.q || ' %' then 1
        -- 2: some lexical or relational connection exists.
        when (q.q <> '' and o.overlap > 0)
          or s.project_hit or s.context_hit or s.person_hit then 2
        -- 3: no connection. Only reachable when the command carried no hint at
        -- all, in which case every eligible task is a candidate and the
        -- overflow flag is what tells the caller the truncation was arbitrary.
        else 3
      end as tier
    from scanned s
    cross join hint_query q
    cross join lateral (
      select count(*)::integer as overlap
      from unnest(q.tokens) as tok
      where ' ' || s.nt || ' ' like '% ' || tok || ' %'
    ) o
  ),
  ranked as (
    select tr.*
    from tiered tr
    cross join hint_query q
    where
      (q.q = '' and q.project_q = '' and q.context_q = '' and q.person_q = '')
      or tr.tier <= 2
    -- 2E-MATCH-003: total and deterministic, keyed on the hint-correlated tier
    -- and ending in `id`, which is unique — so no two orderings of the same
    -- rows are possible and truncation is never arbitrary.
    order by
      tr.tier,
      tr.overlap desc,
      (tr.project_hit::integer + tr.context_hit::integer + tr.person_hit::integer) desc,
      tr.created_at desc,
      tr.id
    -- 2E-MATCH-004: one row beyond the limit, so the caller can tell a full
    -- page from a truncated one.
    limit (select b.lim + 1 from bounds b)
  )
  select
    r.id,
    r.user_id,
    r.title,
    r.description,
    r.status,
    r.due_at,
    r.planned_at,
    r.manual_priority,
    r.completed_at,
    r.cancelled_at,
    r.intentional_no_due,
    r.no_due_reason,
    r.created_at,
    r.updated_at,
    coalesce(pn.ids, '{}'::uuid[]),
    coalesce(pn.names, '{}'::text[]),
    coalesce(cn.ids, '{}'::uuid[]),
    coalesce(cn.names, '{}'::text[]),
    coalesce(sn.ids, '{}'::uuid[]),
    coalesce(sn.names, '{}'::text[]),
    coalesce(sn.roles, '{}'::text[]),
    r.project_hit,
    r.context_hit,
    r.person_hit,
    al.last_audited_at,
    b.observed_before,
    r.tier,
    r.overlap,
    r.query_tokens,
    b.lim,
    rf.project_ref_id,
    rf.context_ref_id,
    rf.person_ref_id,
    rf.project_ref_name,
    rf.context_ref_name,
    rf.person_ref_name,
    -- `count(*)` over an empty set is 0, not null, and an aggregate subquery
    -- with no GROUP BY always returns exactly one row — so the `left join` can
    -- never null this and no coalesce is needed. A review flagged the one that
    -- was here as unreachable, and an unreachable guard reads as a claim the
    -- data cannot make.
    rm.scheduled_count,
    rm.next_remind_at
  from ranked r
  cross join bounds b
  cross join refs rf
  -- Relations and recency are resolved *after* truncation, over at most
  -- `lim + 1` rows. Neither decides candidacy, so neither is worth paying for
  -- across the whole eligible population.
  --
  -- Ids travel with the names, and every array in a group shares one ORDER BY,
  -- so position `n` of `person_ids`, `person_names` and `person_roles` describes
  -- one row. 2E-PREVIEW-005 has to detect "assigning a relation the task
  -- already has", and comparing names in TypeScript would mean re-normalizing
  -- them there — exactly what 2E-MATCH-007 forbids. The role travels for the
  -- same reason: `assign_person` and `set_waiting_on` write different roles, and
  -- a name alone cannot tell them apart.
  left join lateral (
    select
      array_agg(p.id order by p.name, p.id) as ids,
      array_agg(p.name order by p.name, p.id) as names
    from public.task_projects tp
    join public.projects p on p.id = tp.project_id and p.user_id = tp.user_id
    where tp.task_id = r.id and tp.user_id = r.user_id
  ) pn on true
  left join lateral (
    select
      array_agg(c.id order by c.name, c.id) as ids,
      array_agg(c.name order by c.name, c.id) as names
    from public.task_contexts tc
    join public.contexts c on c.id = tc.context_id and c.user_id = tc.user_id
    where tc.task_id = r.id and tc.user_id = r.user_id
  ) cn on true
  left join lateral (
    -- No DISTINCT here, unlike a name-only projection: `task_people` is keyed
    -- (task_id, person_id, role), so one person legitimately appears twice
    -- under two roles and collapsing them would lose the role that matters.
    select
      array_agg(pe.id order by pe.name, pe.id, tpe.role) as ids,
      array_agg(pe.name order by pe.name, pe.id, tpe.role) as names,
      array_agg(tpe.role order by pe.name, pe.id, tpe.role) as roles
    from public.task_people tpe
    join public.people pe on pe.id = tpe.person_id and pe.user_id = tpe.user_id
    where tpe.task_id = r.id and tpe.user_id = r.user_id
  ) sn on true
  left join lateral (
    -- 2E-MATCH-006. `audit_logs_user_entity_idx (user_id, entity_type,
    -- entity_id)` is the access path. The blind spot is declared rather than
    -- hidden: `audit_task_change` watches only status, due_at, manual_priority,
    -- planned_at and parent_task_id, so a rename or an appended note leaves no
    -- historical row. Slice 2E.4 extends the trigger's watched columns to
    -- title and description (2E-UPDATE-010), after which Phase 2E's own writes
    -- are fully covered.
    --
    -- `tasks.updated_at` is deliberately not the source: it records mutation
    -- time, ties exactly in the canonical two-identical-titles ambiguity case,
    -- and is bumped by Phase 2E's own writes. It is projected above for
    -- staleness detection (2E-PREVIEW-006), which is a different question.
    select max(a.created_at) as last_audited_at
    from public.audit_logs a
    where a.user_id = r.user_id
      and a.entity_type = 'task'
      and a.entity_id = r.id
      and a.created_at < b.observed_before
  ) al on true
  -- 2E-PREVIEW-003. `status = 'scheduled'` is the whole live population: every
  -- heartbeat path selects that status and no other (`202607160007:274`,
  -- `202607160013:31`, `202607170016:510`), so a `snoozed` row is inert, a
  -- `sent` one has already fired and §11.3 leaves it alone, and a `cancelled`
  -- one is already where the transition would put it.
  --
  -- No `remind_at` predicate. A reminder whose instant has passed but which the
  -- heartbeat has not yet marked `sent` is still scheduled, and would still
  -- notify on the next hourly tick; filtering it out would under-report the
  -- effect on precisely the rows most likely to fire next.
  --
  -- `reminders_user_due_idx (user_id, status, remind_at)` is the access path,
  -- and like the relation laterals this runs over at most `lim + 1` rows.
  left join lateral (
    select
      count(*)::integer as scheduled_count,
      min(rem.remind_at) as next_remind_at
    from public.reminders rem
    where rem.task_id = r.id
      and rem.user_id = r.user_id
      and rem.status = 'scheduled'
  ) rm on true
  -- Repeated because a CTE's ordering is not guaranteed to survive the joins
  -- above. Identical keys, so the truncated set and the returned set agree.
  order by
    r.tier,
    r.overlap desc,
    (r.project_hit::integer + r.context_hit::integer + r.person_hit::integer) desc,
    r.created_at desc,
    r.id;
$$;

comment on function public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text) is
  'Phase 2E deterministic task candidate generation (PRD 2E-MATCH-001..007). Read-only, owner-scoped, ordered before truncation, returns one row beyond p_limit so overflow is detectable, and projects the full observed pre-state, the patch''s resolved relation references and the task''s scheduled reminders so a preview never has to re-read the task.';

grant execute on function public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text) to authenticated;
revoke all on function public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text) from public, anon;


comment on function public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text) is
  'Phase 2E task command apply (PRD 2E-UPDATE-001..017, 2E-DESTRUCTIVE-001..009). The single mutation path for all fifteen actions of PRD 11.2: owner-scoped, idempotent on (user_id, operation_key), replay-safe from the stored after_state, gated on a typed twelve-column pre-state comparison that raises 55P03, reconciling reminders by close-and-insert, audited with a transaction-local actor, recording the governing policy version (2E-PROVENANCE-001) and the post-write scalar state on the undo row so the compensating write is guarded on all ten columns it restores (2E-UNDO-004), and undoable through a registered private handler. cancel_task additionally requires a server-issued, single-use confirmation bound to the owner, the normalized operation key and the fingerprint this function derives itself, consumed in the same transaction as the mutation; restore_task refuses a task whose creation operation has been undone, with 55P03 and 2E_CREATION_UNDONE.';

-- ---------------------------------------------------------------------------
-- Fail-closed post-deploy assertions
-- ---------------------------------------------------------------------------
-- The `202607260058:2090-2202` posture, carried forward and extended. Every one
-- of these re-proves an invariant that `create or replace` is free to break
-- silently, against the catalog rather than against the text above.

do $$
declare
  bundle text;
  apply_body text;
  handler_body text;
  is_definer boolean;
  definer_config text;
  definer_name text;
  missing text;
  writable text;
begin
  apply_body := pg_get_functiondef(
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure
  );
  handler_body := pg_get_functiondef(
    'private.undo_apply_task_command_fields(uuid, uuid)'::regprocedure
  );
  bundle := concat_ws(
    E'\n',
    apply_body,
    handler_body,
    pg_get_functiondef('private.undo_apply_task_command_relation(uuid, uuid)'::regprocedure),
    pg_get_functiondef('private.undo_confirm_entry_tasks(uuid, uuid)'::regprocedure),
    pg_get_functiondef('public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)'::regprocedure),
    pg_get_functiondef('private.task_creation_undone(uuid, uuid)'::regprocedure),
    pg_get_functiondef('public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure),
    pg_get_functiondef('public.audit_task_change()'::regprocedure)
  );

  -- Every registered handler still resolves at the one signature the router
  -- routes through. This migration replaced two of them.
  select string_agg(handlers.handler_function, ', ' order by handlers.handler_function)
  into missing
  from (select distinct handler_function from private.undo_operation_handlers) as handlers
  where to_regprocedure('private.' || quote_ident(handlers.handler_function) || '(uuid, uuid)') is null;

  if missing is not null then
    raise exception 'undo_operation registry points at missing handler(s): %', missing
      using errcode = 'P0001';
  end if;

  -- 2C-UNDO-004 (ADR-026), unchanged.
  if position('errcode = ''40001''' in bundle) > 0 then
    raise exception 'a Phase 2E body raises the gateway-hanging SQLSTATE that ADR-026 retired'
      using errcode = 'P0001';
  end if;

  -- The `202607220042/044/045` recurrence guard, over the widened bundle.
  if position('pg_catalog.coalesce(' in lower(bundle)) > 0
    or position('pg_catalog.nullif(' in lower(bundle)) > 0
    or position('pg_catalog.greatest(' in lower(bundle)) > 0
    or position('pg_catalog.least(' in lower(bundle)) > 0 then
    raise exception 'a Phase 2E body schema-qualified a SQL special form (coalesce/nullif/greatest/least), which cannot resolve under an empty search_path'
      using errcode = 'P0001';
  end if;

  -- Slice 2E.4's two evidence keys, still recorded.
  if position('''applied_state'', undo_applied_state' in apply_body) = 0
    or position('''policy_version'', p_policy_version' in apply_body) = 0
  then
    raise exception 'apply_task_command no longer records the applied_state its undo handler guards on, or the policy version 2E-PROVENANCE-001 requires'
      using errcode = 'P0001';
  end if;

  -- Both destructive verbs are enabled through the taxonomy, not through a
  -- branch beside it. Without these, a later `create or replace` could drop one
  -- back to the `else` terminator and the only symptom would be a refusal a user
  -- reports as a bug.
  if position('when ''cancel_task'' then' in apply_body) = 0
    or position('when ''restore_task'' then' in apply_body) = 0
  then
    raise exception 'apply_task_command no longer resolves both destructive actions from the taxonomy'
      using errcode = 'P0001';
  end if;

  -- The retirement is real. A body still raising the retired token would mean a
  -- declared vocabulary member no reachable state can provoke, which this phase
  -- treats as the same defect as a missing raise.
  if position('2E_ACTION_NOT_ENABLED' in bundle) > 0 then
    raise exception 'a Phase 2E body still raises 2E_ACTION_NOT_ENABLED, which Slice 2E.5 retired when it enabled both destructive actions'
      using errcode = 'P0001';
  end if;

  -- 2E-DESTRUCTIVE-004: the gate and its consuming write both survive. The
  -- guarded UPDATE is checked by its `status = 'issued'` predicate, which is the
  -- single-use property; an unguarded UPDATE would consume a row twice.
  if position('2E_CONFIRMATION_REQUIRED' in apply_body) = 0
    or position('public.task_command_confirmations' in apply_body) = 0
    or position('and confirmation.status = ''issued''' in apply_body) = 0
  then
    raise exception 'apply_task_command no longer enforces the single-use confirmation 2E-DESTRUCTIVE-002 and -004 require'
      using errcode = 'P0001';
  end if;

  -- 2E-DESTRUCTIVE-008 and -009: the collision token is raised on both raising
  -- doors, and both read the one shared predicate.
  if position('2E_CREATION_UNDONE' in apply_body) = 0
    or position('2E_CREATION_UNDONE' in handler_body) = 0
  then
    raise exception 'the creation-undo collision is no longer closed on both of its raising doors'
      using errcode = 'P0001';
  end if;
  if position('private.task_creation_undone' in apply_body) = 0
    or position('private.task_creation_undone' in handler_body) = 0
    or position('private.task_creation_undone' in pg_get_functiondef(
         'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'::regprocedure)) = 0
  then
    raise exception 'a door into a creation-undone task stopped reading the shared predicate 2E-DESTRUCTIVE-009 requires them to share'
      using errcode = 'P0001';
  end if;

  -- The trigger that makes a candidate-slot guard unnecessary must still be the
  -- trigger this slice reasoned about. `record_entry_task_candidate_confirmation`
  -- is what writes the `'confirmed'` resolution row that survives a cancellation
  -- and lets `2C_TERMINAL_DISPOSITION` refuse the re-confirmation which would
  -- otherwise take the freed slot. Drop it, or narrow it to INSERT, and the
  -- collision this slice argued is unreachable becomes reachable again — and
  -- nothing else in the repository would notice, because the guard that would
  -- have caught it is deliberately absent.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.tasks'::regclass
      and tgname = 'tasks_record_candidate_confirmation'
      and not tgisinternal
  ) then
    raise exception 'tasks_record_candidate_confirmation is gone, so a cancelled task no longer holds its candidate slot through the resolution ledger and restore_task can collide with a re-confirmed duplicate'
      using errcode = 'P0001';
  end if;

  -- 2E-DESTRUCTIVE-007: the third cancellation route speaks the shared actor.
  if position('set_config(''app.audit_actor'', ''system'', true)' in
       pg_get_functiondef('private.undo_confirm_entry_tasks(uuid, uuid)'::regprocedure)) = 0
  then
    raise exception 'undo_confirm_entry_tasks no longer attributes its compensating cancellation to the system actor'
      using errcode = 'P0001';
  end if;

  -- 2E-UPDATE-001's security posture, re-read for every definer this migration
  -- created or replaced.
  foreach definer_name in array array[
    'public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)',
    'public.issue_task_command_confirmation(uuid, text, jsonb, jsonb, text, text, text)',
    'public.list_task_command_candidates(text[], text, text, text, text, timestamptz, integer, text, text, text)'
  ]
  loop
    select procedure.prosecdef, array_to_string(procedure.proconfig, ',')
    into is_definer, definer_config
    from pg_proc procedure
    where procedure.oid = definer_name::regprocedure;

    if not is_definer then
      raise exception '% is not SECURITY DEFINER, so its ownership predicates run as the caller', definer_name
        using errcode = 'P0001';
    end if;
    if definer_config is distinct from 'search_path=""' then
      raise exception '% does not pin an empty search_path: %', definer_name, coalesce(definer_config, '<null>')
        using errcode = 'P0001';
    end if;
  end loop;

  -- The confirmation ledger is unwritable by every role (2E-DESTRUCTIVE-002).
  -- "Server-issued" and "single-use" are properties of the grants, not of the
  -- two functions that happen to respect them.
  select string_agg(
    client_role.role_name || ':' || write_privilege.privilege,
    ', '
    order by client_role.role_name, write_privilege.privilege
  )
  into writable
  from unnest(array['anon', 'authenticated', 'service_role']) as client_role(role_name)
  cross join unnest(array['insert', 'update', 'delete']) as write_privilege(privilege)
  where has_table_privilege(
    client_role.role_name,
    'public.task_command_confirmations',
    write_privilege.privilege
  );

  if writable is not null then
    raise exception 'public.task_command_confirmations is writable by a client role, so a confirmation could be minted or burned outside the RPCs: %', writable
      using errcode = 'P0001';
  end if;

  if has_table_privilege('anon', 'public.task_command_confirmations', 'select') then
    raise exception 'anon can read public.task_command_confirmations (2E-OWNERSHIP-003)'
      using errcode = 'P0001';
  end if;

  if not (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.task_command_confirmations'::regclass
  ) then
    raise exception 'public.task_command_confirmations does not force row level security'
      using errcode = 'P0001';
  end if;
end
$$;
