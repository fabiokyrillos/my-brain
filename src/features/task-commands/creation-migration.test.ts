import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/202607270060_phase_2e_no_match_task_creation.sql";
const PGTAP = "supabase/tests/phase_2e_task_command_creation.sql";

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

function functionBody(sql: string, signature: string): string {
  const functionName = signature.slice(0, signature.indexOf("("));
  const start = sql.indexOf(`create or replace function ${functionName}(`);
  if (start < 0) throw new Error(`${signature} is not declared by ${MIGRATION}`);
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("\n$$;", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) throw new Error(`${signature} has no parseable body`);
  return sql.slice(bodyStart, bodyEnd);
}

function functionDeclaration(sql: string, signature: string): string {
  const functionName = signature.slice(0, signature.indexOf("("));
  const start = sql.indexOf(`create or replace function ${functionName}(`);
  if (start < 0) throw new Error(`${signature} is not declared by ${MIGRATION}`);
  const bodyStart = sql.indexOf("as $$", start);
  if (bodyStart < 0) throw new Error(`${signature} has no parseable declaration`);
  return sql.slice(start, bodyStart);
}

describe("Slice 2E.6 forward migration contract", () => {
  const sql = source(MIGRATION);

  it("ships one first-generation unversioned preview, issuer and creation RPC", () => {
    expect(sql.match(/create or replace function public\.preview_task_command_creation\(/g))
      .toHaveLength(1);
    expect(sql.match(/create or replace function public\.issue_task_command_creation_confirmation\(/g))
      .toHaveLength(1);
    expect(sql.match(/create or replace function public\.create_task_command\(/g))
      .toHaveLength(1);
    expect(sql).not.toMatch(/(preview|issue|create)_task_command_creation_v2|create_task_command_v2/);
  });

  it("widens one confirmation ledger while keeping creation subjectless", () => {
    expect(sql).toContain("alter column task_id drop not null");
    expect(sql).toContain("action in ('cancel_task', 'create_task')");
    expect(sql).toContain("action = 'cancel_task' and task_id is not null");
    expect(sql).toContain("action = 'create_task' and task_id is null");
  });

  it("centralizes the creation-undo action family and admits standalone creation", () => {
    const family = functionBody(sql, "private.is_task_creation_action(text)");
    expect(family).toContain("'create_task_command'");
    for (const action of [
      "confirm_entry_tasks",
      "confirm_entry_task_candidates",
      "confirm_entry_task_candidates_v5",
      "confirm_entry_task_candidates_v6",
    ]) {
      expect(family).toContain(`'${action}'`);
    }

    const predicate = functionBody(sql, "private.task_creation_undone(uuid, uuid)");
    const apply = functionBody(
      sql,
      "public.apply_task_command(uuid, text, jsonb, jsonb, text, text, text)",
    );
    const undo = functionBody(sql, "private.undo_apply_task_command_fields(uuid, uuid)");
    expect(predicate).toContain("private.is_task_creation_action(creation.action_type)");
    expect(apply).toContain("private.is_task_creation_action(creation.action_type)");
    expect(undo).toContain("private.is_task_creation_action(creation.action_type)");
  });

  it("reserves the undo key before consuming confirmation and inserting the task", () => {
    const create = functionBody(
      sql,
      "public.create_task_command(text, text[], jsonb, text, text, text)",
    );
    const reserve = create.indexOf("insert into public.undo_operations");
    const replay = create.indexOf("if undo_id is null");
    const consume = create.indexOf("update public.task_command_confirmations");
    const insertTask = create.indexOf("insert into public.tasks");

    expect(reserve).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(reserve);
    expect(consume).toBeGreaterThan(replay);
    expect(insertTask).toBeGreaterThan(consume);
  });

  it("returns an exact replay after undo without consuming confirmation or recreating", () => {
    const create = functionBody(
      sql,
      "public.create_task_command(text, text[], jsonb, text, text, text)",
    );
    const replay = create.slice(create.indexOf("if undo_id is null"), create.indexOf("-- Confirmation"));
    expect(replay).toContain("'idempotent', true");
    expect(replay).toContain("'creation_undone', existing_operation.status = 'undone'");
    expect(replay).toContain("existing_operation.after_state -> 'task_id'");
    expect(replay).not.toContain("insert into public.tasks");
    expect(replay).not.toContain("update public.task_command_confirmations");
  });

  it("creates standalone inbox provenance and only the action's positive value", () => {
    const create = functionBody(
      sql,
      "public.create_task_command(text, text[], jsonb, text, text, text)",
    );
    expect(create).toContain("'inbox'");
    expect(create).toContain("'agent'");
    expect(create).toMatch(/source_entry_id[\s\S]*source_interpretation_id[\s\S]*candidate_index/);
    expect(create).toMatch(/null,[\s\S]*null,[\s\S]*null,/);
    expect(create).toContain("canonical_payload ->> 'dueAt'");
    expect(create).toContain("canonical_payload ->> 'plannedAt'");
    expect(create).toContain("canonical_payload ->> 'manualPriority'");
  });

  it("reuses the task INSERT reminder trigger and adds no second reminder writer", () => {
    const create = functionBody(
      sql,
      "public.create_task_command(text, text[], jsonb, text, text, text)",
    );
    expect(create).not.toContain("insert into public.reminders");
    expect(create).toContain("from public.reminders");
    expect(sql).not.toContain("create trigger tasks_create_due_reminder");
    expect(sql).toContain("create_due_task_reminder");
  });

  it("uses only the already-declared reachable 2E detail vocabulary", () => {
    const found = [...sql.matchAll(/detail = '([A-Z0-9_]+)'/g)]
      .map((match) => match[1])
      .filter((value, index, all) => all.indexOf(value) === index)
      .sort();
    expect(found).toEqual([
      "2E_CONFIRMATION_REQUIRED",
      "2E_CREATION_UNDONE",
      "2E_DUE_CONSISTENCY",
      "2E_IDEMPOTENCY_MISMATCH",
      "2E_INELIGIBLE_STATUS",
      "2E_INVALID_RELATION",
      "2E_REMINDER_INTEGRITY",
      "2E_TRANSITION_INTEGRITY",
      "2E_UNDO_REMINDER_INTEGRITY",
      "2E_UNDO_RESTORE_INTEGRITY",
    ]);
  });

  it("keeps every public RPC definer-only, empty-path and owner-derived", () => {
    for (const signature of [
      "public.preview_task_command_creation(text, text[], jsonb, text, text, text)",
      "public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)",
      "public.create_task_command(text, text[], jsonb, text, text, text)",
    ]) {
      const body = functionBody(sql, signature);
      const declaration = functionDeclaration(sql, signature);
      expect(body).toContain("auth.uid()");
      expect(declaration).toContain("security definer\nset search_path = ''");
    }
  });

  it("post-deploy guards inspect the exact functions and aliases that ship", () => {
    const guard = sql.slice(sql.lastIndexOf("do $$"));
    for (const signature of [
      "public.preview_task_command_creation(text, text[], jsonb, text, text, text)",
      "public.issue_task_command_creation_confirmation(text, text[], jsonb, text, text, text)",
      "public.create_task_command(text, text[], jsonb, text, text, text)",
      "private.undo_create_task_command(uuid, uuid)",
      "private.task_creation_undone(uuid, uuid)",
      "private.is_task_creation_action(text)",
    ]) {
      expect(guard).toContain(`'${signature}'::regprocedure`);
    }
    expect(guard).toContain("preview_body");
    expect(guard).toContain("issuer_body");
    expect(guard).toContain("create_body");
    expect(guard).toContain("undo_body");
  });

  it("keeps the pgTAP plan equal to its top-level assertion count", () => {
    const pgtap = source(PGTAP);
    const plan = Number(pgtap.match(/^select plan\((\d+)\);$/m)?.[1]);
    const assertions =
      pgtap.match(/^select (?:has_function|is|ok|has_trigger|col_is_null|results_eq)\(/gm) ?? [];

    expect(plan).toBe(117);
    expect(assertions).toHaveLength(plan);
  });
});
