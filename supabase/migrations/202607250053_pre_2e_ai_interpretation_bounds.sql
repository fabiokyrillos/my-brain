-- Pre-Phase-2E hardening: database-side bounds on AI-produced interpretations.
--
-- WHY (architecture review July 2026, finding H5)
-- The production worker persisted model output through a bare type assertion,
-- while `persist_entry_interpretation` validated only four `jsonb_typeof`
-- checks. The human-correction path in the same schema
-- (`correct_entry_interpretation`) validates lengths, ranges and enums
-- strictly, so strictness was inverted relative to trust: the least-trusted
-- writer had the loosest gate. Over-length or out-of-range output persisted
-- verbatim and surfaced later — a malformed `dueAt` as an unmapped failure at
-- task materialization, an over-length title as a `tasks_title_check`
-- violation, an over-length summary as a silently `null` interpretation in the
-- UI when the read-side Zod parse failed.
--
-- The primary fix is in the worker
-- (`supabase/functions/_shared/extraction-validation.ts`, held to
-- `src/lib/ai/extraction-schema.ts` by `src/lib/ai/extraction-parity.test.ts`).
-- This migration is the defense-in-depth layer behind it.
--
-- DELIBERATE SCOPE: BOUNDS, NOT A THIRD SCHEMA
-- The database does not learn which fields are required, which concepts exist,
-- or what the extraction shape is — encoding that here would be the same
-- triplication the review criticises elsewhere, and it would let a worker/DB
-- disagreement strand real entries in `failed`. Instead it bounds the values
-- that downstream domain objects already constrain, for whatever fields are
-- present:
--   * summary            non-blank, <= 2000  (read-side contract; blank or
--                                             over-length silently destroys the
--                                             interpretation in the UI)
--   * candidate title    non-blank, <= 240   (exactly `tasks_title_check`,
--                                             enforced before materialization
--                                             instead of after)
--   * candidate dueAt    castable to timestamptz
--   * numeric confidence within 0..1         (matches every confidence column)
--   * parentIndex        non-negative integer
--   * mention/evidence/question/reason lengths
--
-- Every check is at least as permissive as the worker validator by
-- construction: `char_length` counts characters where JavaScript `.length`
-- counts UTF-16 units, SQL `trim` removes fewer characters than JS `.trim()`,
-- and `::timestamptz` accepts more shapes than a strict ISO instant. So
-- nothing the worker accepts can be refused here.
--
-- MECHANISM: TRIGGER, NOT RE-CREATED RPCS
-- A BEFORE INSERT trigger covers `persist_entry_interpretation` and
-- `persist_reprocessed_entry_interpretation` at once without re-pasting two
-- ~150-line function bodies (the authoring pattern 202607250052 exists to
-- stop). It follows the 202607170027 precedent: a SECURITY DEFINER trigger
-- function rather than a CHECK constraint, so no role needs EXECUTE on the
-- validator.
--
-- Scoped to the two AI origins and to INSERT only, so:
--   * `user_corrected` (correction and undo compensation) is untouched — it
--     already validates itself, and undo must be able to restore a historical
--     snapshot byte-for-byte, including one written before these bounds
--     existed (ADR-018: undo restores pointers, never rewrites history);
--   * no existing row is ever re-validated.
--
-- ROLLBACK
--   `drop trigger entry_interpretations_ai_bounds on public.entry_interpretations;`
--   The validator function may stay in place unused.
--
-- DEPLOY ORDER
--   Deploy the worker change first, then this migration. Reversed, an in-flight
--   worker running the old unvalidated code could burn its retry budget on a
--   P0001 it cannot fix.

create or replace function private.enforce_ai_interpretation_bounds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate jsonb;
  question jsonb;
  mention jsonb;
  mentions jsonb;
begin
  if nullif(pg_catalog.btrim(new.summary), '') is null
    or char_length(new.summary) > 2000
  then
    raise exception 'AI interpretation summary is out of bounds'
      using errcode = 'P0001', detail = 'AI_INTERPRETATION_SUMMARY_BOUNDS';
  end if;

  if pg_catalog.jsonb_typeof(new.task_candidates) <> 'array' then
    raise exception 'AI interpretation task candidates are malformed'
      using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_SHAPE';
  end if;

  for candidate in select value from pg_catalog.jsonb_array_elements(new.task_candidates)
  loop
    if pg_catalog.jsonb_typeof(candidate) <> 'object' then
      raise exception 'AI interpretation task candidates are malformed'
        using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_SHAPE';
    end if;

    -- Exactly tasks_title_check, applied before materialization can fail.
    if candidate ? 'title' then
      if nullif(pg_catalog.btrim(coalesce(candidate ->> 'title', '')), '') is null
        or char_length(candidate ->> 'title') > 240
      then
        raise exception 'AI interpretation task candidate title is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_TITLE_BOUNDS';
      end if;
    end if;

    if candidate ? 'description' and pg_catalog.jsonb_typeof(candidate -> 'description') <> 'null' then
      if char_length(candidate ->> 'description') > 2000 then
        raise exception 'AI interpretation task candidate description is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_DESCRIPTION_BOUNDS';
      end if;
    end if;

    if candidate ? 'waitingOn' and pg_catalog.jsonb_typeof(candidate -> 'waitingOn') <> 'null' then
      if char_length(candidate ->> 'waitingOn') > 160 then
        raise exception 'AI interpretation task candidate waitingOn is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_WAITING_BOUNDS';
      end if;
    end if;

    -- The review's concrete impact: a malformed dueAt used to surface much
    -- later as an unmapped failure while materializing the task.
    if candidate ? 'dueAt' and pg_catalog.jsonb_typeof(candidate -> 'dueAt') <> 'null' then
      begin
        perform (candidate ->> 'dueAt')::timestamptz;
      exception when others then
        raise exception 'AI interpretation task candidate dueAt is not a timestamp'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_DUE_AT';
      end;
    end if;

    if candidate ? 'confidence' and pg_catalog.jsonb_typeof(candidate -> 'confidence') <> 'null' then
      if pg_catalog.jsonb_typeof(candidate -> 'confidence') <> 'number'
        or (candidate ->> 'confidence')::numeric not between 0 and 1
      then
        raise exception 'AI interpretation task candidate confidence is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_CONFIDENCE_BOUNDS';
      end if;
    end if;

    if candidate ? 'parentIndex' and pg_catalog.jsonb_typeof(candidate -> 'parentIndex') <> 'null' then
      if pg_catalog.jsonb_typeof(candidate -> 'parentIndex') <> 'number'
        or (candidate ->> 'parentIndex')::numeric < 0
        or (candidate ->> 'parentIndex')::numeric <> pg_catalog.floor((candidate ->> 'parentIndex')::numeric)
      then
        raise exception 'AI interpretation task candidate parentIndex is invalid'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_CANDIDATE_PARENT_INDEX';
      end if;
    end if;
  end loop;

  if pg_catalog.jsonb_typeof(new.pending_questions) <> 'array' then
    raise exception 'AI interpretation pending questions are malformed'
      using errcode = 'P0001', detail = 'AI_INTERPRETATION_QUESTION_SHAPE';
  end if;

  for question in select value from pg_catalog.jsonb_array_elements(new.pending_questions)
  loop
    if pg_catalog.jsonb_typeof(question) <> 'object' then
      raise exception 'AI interpretation pending questions are malformed'
        using errcode = 'P0001', detail = 'AI_INTERPRETATION_QUESTION_SHAPE';
    end if;

    -- A blank question is silently dropped by
    -- persist_interpretation_questions while the lifecycle status still counts
    -- it, which strands the entry in partially_processed with nothing to
    -- answer. Refusing it keeps state and evidence in agreement.
    if question ? 'question' then
      if nullif(pg_catalog.btrim(coalesce(question ->> 'question', '')), '') is null
        or char_length(question ->> 'question') > 500
      then
        raise exception 'AI interpretation pending question text is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_QUESTION_BOUNDS';
      end if;
    end if;

    if question ? 'reason' then
      if nullif(pg_catalog.btrim(coalesce(question ->> 'reason', '')), '') is null
        or char_length(question ->> 'reason') > 500
      then
        raise exception 'AI interpretation pending question reason is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_QUESTION_BOUNDS';
      end if;
    end if;

    if question ? 'confidence' and pg_catalog.jsonb_typeof(question -> 'confidence') <> 'null' then
      if pg_catalog.jsonb_typeof(question -> 'confidence') <> 'number'
        or (question ->> 'confidence')::numeric not between 0 and 1
      then
        raise exception 'AI interpretation pending question confidence is out of bounds'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_QUESTION_BOUNDS';
      end if;
    end if;
  end loop;

  foreach mentions in array array[
    new.extracted_contexts,
    new.extracted_organizations,
    new.extracted_projects,
    new.extracted_people
  ]
  loop
    if pg_catalog.jsonb_typeof(mentions) <> 'array' then
      raise exception 'AI interpretation entity mentions are malformed'
        using errcode = 'P0001', detail = 'AI_INTERPRETATION_MENTION_SHAPE';
    end if;

    for mention in select value from pg_catalog.jsonb_array_elements(mentions)
    loop
      if pg_catalog.jsonb_typeof(mention) <> 'object' then
        raise exception 'AI interpretation entity mentions are malformed'
          using errcode = 'P0001', detail = 'AI_INTERPRETATION_MENTION_SHAPE';
      end if;

      if mention ? 'name' then
        if nullif(pg_catalog.btrim(coalesce(mention ->> 'name', '')), '') is null
          or char_length(mention ->> 'name') > 160
        then
          raise exception 'AI interpretation entity mention name is out of bounds'
            using errcode = 'P0001', detail = 'AI_INTERPRETATION_MENTION_BOUNDS';
        end if;
      end if;

      if mention ? 'evidence' and pg_catalog.jsonb_typeof(mention -> 'evidence') <> 'null' then
        if char_length(mention ->> 'evidence') > 500 then
          raise exception 'AI interpretation entity mention evidence is out of bounds'
            using errcode = 'P0001', detail = 'AI_INTERPRETATION_MENTION_BOUNDS';
        end if;
      end if;

      if mention ? 'confidence' and pg_catalog.jsonb_typeof(mention -> 'confidence') <> 'null' then
        if pg_catalog.jsonb_typeof(mention -> 'confidence') <> 'number'
          or (mention ->> 'confidence')::numeric not between 0 and 1
        then
          raise exception 'AI interpretation entity mention confidence is out of bounds'
            using errcode = 'P0001', detail = 'AI_INTERPRETATION_MENTION_BOUNDS';
        end if;
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function private.enforce_ai_interpretation_bounds() from public, anon, authenticated, service_role;

drop trigger if exists entry_interpretations_ai_bounds on public.entry_interpretations;
create trigger entry_interpretations_ai_bounds
before insert on public.entry_interpretations
for each row
when (new.origin in ('ai_generated', 'ai_reprocessed'))
execute function private.enforce_ai_interpretation_bounds();

comment on function private.enforce_ai_interpretation_bounds() is
  'Defense in depth for AI-produced interpretations: bounds the values downstream domain objects already constrain, for whatever fields are present. Deliberately not a second extraction schema — completeness and enum membership belong to the worker validator and the provider response schema.';

-- Fail-closed post-deploy assertion: the trigger must exist, fire only on the
-- AI origins, and never on UPDATE (interpretations are immutable and undo must
-- be able to restore a pre-bounds snapshot).
do $$
declare
  trigger_row pg_catalog.pg_trigger%rowtype;
begin
  select * into trigger_row
  from pg_catalog.pg_trigger
  where tgrelid = 'public.entry_interpretations'::pg_catalog.regclass
    and tgname = 'entry_interpretations_ai_bounds';

  if trigger_row.oid is null then
    raise exception 'the AI interpretation bounds trigger was not installed';
  end if;

  -- 4 = ROW INSERT
  if trigger_row.tgtype::integer & 4 = 0 then
    raise exception 'the AI interpretation bounds trigger does not fire on insert';
  end if;
  -- 16 = ROW UPDATE, 8 = ROW DELETE
  if trigger_row.tgtype::integer & 16 <> 0 or trigger_row.tgtype::integer & 8 <> 0 then
    raise exception 'the AI interpretation bounds trigger must not fire on update or delete';
  end if;

  if pg_catalog.pg_get_triggerdef(trigger_row.oid) not like '%ai_generated%'
    or pg_catalog.pg_get_triggerdef(trigger_row.oid) not like '%ai_reprocessed%'
    or pg_catalog.pg_get_triggerdef(trigger_row.oid) like '%user_corrected%'
  then
    raise exception 'the AI interpretation bounds trigger is not scoped to the AI origins';
  end if;
end
$$;
