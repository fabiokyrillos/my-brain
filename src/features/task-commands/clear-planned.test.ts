import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { detailControlFor, detailControlsFor } from "./detail-controls";
import type { TaskPreState } from "./matching";
import { buildCanonicalPatch } from "./preview";
import type { ValidatedTaskCommand } from "./schema";
import {
  NON_TERMINAL_STATUSES,
  TASK_COMMAND_ACTIONS,
  TASK_COMMAND_POLICY_VERSION,
  actionPolicy,
  touchesReminders,
} from "./taxonomy";
import { schedulingControlsFor } from "@/features/calendar/calendar-scheduling";

/**
 * `2M-PLAN-002` — a planned day can be **removed** through the same validated
 * command path that sets it.
 *
 * ## Why this file exists beside the taxonomy's own tests
 *
 * The asymmetry this closes was never a missing entry in a TypeScript list. It
 * was that `public.apply_task_command` carries **its own** action allowlist and
 * **its own** per-action patch rules in SQL, and `set_planned` requires
 * `plannedAt` to be a string matching `iso_instant_pattern` — so a null is
 * refused and `set_planned` cannot be made to clear (`202607270060:892-903`).
 * Adding the verb app-side alone would produce a control whose only possible
 * outcome is a `22023` from the database.
 *
 * So the cases below cross the boundary deliberately: the policy, the patch the
 * preview hashes, the control the surfaces derive, **and the text of the
 * migration that has to accept all three**. The SQL assertions are the
 * load-bearing half — the rest is a claim about a database, and a claim about a
 * database that nothing ties to the database is how the two sides drift into
 * agreeing on something false.
 */

const MIGRATION = "supabase/migrations/202608110091_phase_2m_clear_planned.sql";

function source(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

const preState: TaskPreState = {
  title: "Revisar o orçamento",
  description: null,
  status: "todo",
  dueAt: null,
  plannedAt: "2026-08-14T12:00:00.000Z",
  manualPriority: null,
  completedAt: null,
  cancelledAt: null,
  intentionalNoDue: false,
  noDueReason: null,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
  projectIds: [],
  projectNames: [],
  contextIds: [],
  contextNames: [],
  personIds: [],
  personNames: [],
  personRoles: [],
};

const clearPlannedCommand: ValidatedTaskCommand = {
  action: "clear_planned",
  targetHints: { titleWords: ["orcamento"] },
  patch: {},
  operationKey: "clear-planned-fixture-key",
  schemaVersion: "task_command.v1",
  policyVersion: TASK_COMMAND_POLICY_VERSION,
};

describe("the taxonomy admits clear_planned as the counterpart of clear_due", () => {
  it("declares it", () => {
    expect(TASK_COMMAND_ACTIONS).toContain("clear_planned");
  });

  it("carries the same shape as clear_due, over the other column", () => {
    const clearPlanned = actionPolicy("clear_planned");
    const clearDue = actionPolicy("clear_due");

    // No patch field: the verb has no value to fill, which is what makes the
    // derived control a single button rather than an empty date input.
    expect(clearPlanned.requiredPatchFields).toEqual([]);
    expect(clearPlanned.allowedPatchFields).toEqual([]);
    expect(clearPlanned.eligibleFrom).toEqual(clearDue.eligibleFrom);
    expect(clearPlanned.eligibleFrom).toEqual([...NON_TERMINAL_STATUSES]);
    expect(clearPlanned.destructive).toBe(false);
    expect(clearPlanned.requiresConfirmation).toBe(false);
    expect(clearPlanned.reversible).toBe(true);
    expect(clearPlanned.undoStrategy).toBe("restore_fields");
    expect(clearPlanned.targetStatus).toBeNull();
    expect(clearPlanned.allowedTargetValues).toBeNull();
  });

  it("changes planned_at and nothing else — a plan is not a deadline", () => {
    expect(actionPolicy("clear_planned").changedFields).toEqual(["planned_at"]);
    // The one place the two verbs deliberately differ. `clear_due` reconciles
    // reminders because a deadline arms one; an intention never did, so
    // clearing it must not close a reminder the user still expects.
    expect(touchesReminders("clear_planned")).toBe(false);
    expect(touchesReminders("clear_due")).toBe(true);
  });
});

describe("the canonical patch says null rather than saying nothing", () => {
  it("carries plannedAt: null, which is what the RPC requires the key to hold", () => {
    // An empty patch would be refused by `required_patch_keys := array['plannedAt']`
    // *after* the preview had already offered the control — the RPC refusing a
    // payload the user was told would land, which is the shape `append_note`'s
    // ceiling defect had and this file will not repeat.
    expect(buildCanonicalPatch({ command: clearPlannedCommand, pre: preState, resolvedId: null }))
      .toEqual({ plannedAt: null });
  });

  it("clears whatever the task held, rather than echoing it back", () => {
    const patch = buildCanonicalPatch({
      command: clearPlannedCommand,
      pre: { ...preState, plannedAt: null },
      resolvedId: null,
    });
    // Even from an already-clear task the key is present and null: the patch is
    // what the fingerprint hashes, and it must not depend on the pre-state, or
    // two requests for the same operation would hash differently.
    expect(patch).toEqual({ plannedAt: null });
  });
});

describe("every surface that derives its controls gets the verb without being told", () => {
  it("derives an immediate control — one button, no value", () => {
    const control = detailControlFor("clear_planned");
    expect(control).not.toBeNull();
    expect(control?.kind).toBe("immediate");
    expect(control?.field).toBeNull();
    expect(control?.choices).toBeNull();
    expect(control?.destructive).toBe(false);
  });

  it("appears on the task detail for every status that admits it, and on none that does not", () => {
    for (const status of NON_TERMINAL_STATUSES) {
      expect(
        detailControlsFor(status).map((control) => control.action),
        `${status} must offer clear_planned`,
      ).toContain("clear_planned");
    }
    for (const status of ["completed", "cancelled"] as const) {
      expect(
        detailControlsFor(status).map((control) => control.action),
        `${status} must not offer clear_planned`,
      ).not.toContain("clear_planned");
    }
  });

  it("reaches the calendar by derivation, exactly as calendar-scheduling.ts predicted", () => {
    // `calendar-scheduling.ts` was written in slice 2M.1 with the claim that
    // `clear_planned` "will appear here the day slice 2M.2 adds it, without a
    // line changing, because its policy will necessarily declare planned_at".
    // This is that claim, executed rather than trusted.
    expect(schedulingControlsFor("todo").map((control) => control.action))
      .toContain("clear_planned");
  });
});

describe("the deployed SQL admits the verb everywhere the app assumes it does", () => {
  const migration = source(MIGRATION);

  it("re-declares the whole function rather than patching a case arm", () => {
    expect(migration).toContain("create or replace function public.apply_task_command(");
    expect(migration).toContain("$$;");
  });

  it("admits it into the closed action enum", () => {
    // The enum at step 2 is the first gate; an action absent here is refused
    // with a bare 22023 before any policy is resolved.
    expect(migration).toMatch(/'clear_due', 'set_planned', 'clear_planned'/);
  });

  it("gives it a policy arm, so it cannot fall through with null policy arrays", () => {
    expect(migration).toContain("when 'clear_planned' then");
  });

  it("requires the plannedAt key and accepts only a JSON null for it", () => {
    // The mirror of `clear_due`'s own rule. Requiring the key is what stops an
    // empty patch hashing to a different fingerprint than the preview showed;
    // accepting only null is what stops `clear_planned` becoming a second,
    // unconfirmed route to setting a date.
    expect(migration).toMatch(/if p_action = 'clear_planned' then\s+if pg_catalog\.jsonb_typeof\(p_patch -> 'plannedAt'\) <> 'null' then/);
  });

  it("computes the delta, writes the column and records the applied state for it", () => {
    // Four sites, all of which must name the action or the write is silent:
    // the delta against the claimed pre-state, the delta against the locked
    // row, the UPDATE itself, and the recorded `applied_state` the undo guard
    // reads back.
    const paired = migration.match(/p_action in \('set_planned', 'clear_planned'\)/g) ?? [];
    expect(paired.length, "the four planned_at sites must all admit the verb").toBe(4);
  });

  it("carries no second verb, no table, no column and no grant — ADR-106 funded one thing", () => {
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/alter table/i);
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).not.toMatch(/\bcreate role\b/i);
    // `create or replace function` is the whole of the schema change, and the
    // only function it may touch is this one.
    const functions = migration.match(/create or replace function ([a-z_.]+)\(/g) ?? [];
    expect(functions).toEqual(["create or replace function public.apply_task_command("]);
  });

  it("asserts its own effect at deploy time rather than trusting the text", () => {
    expect(migration).toMatch(/do \$\$/);
    expect(migration).toContain("pg_get_functiondef");
  });
});

describe("the SQL and the taxonomy cannot drift apart action by action", () => {
  /*
   * The general form of the defect this slice paid for. A sixteenth action is
   * cheap to add to `TASK_COMMAND_ACTIONS` and expensive to forget in SQL: the
   * control renders, the preview computes, the fingerprint matches, and the
   * database answers `22023` at the last moment. Asserting the whole set rather
   * than the one new member is what makes a seventeenth safe.
   */
  const migration = source(MIGRATION);

  it("names every declared action in the enum and gives every one a policy arm", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      expect(migration, `${action} is missing from the action enum`).toContain(`'${action}'`);
      expect(migration, `${action} has no policy arm`).toContain(`when '${action}' then`);
    }
  });

  it("names no action the taxonomy does not declare", () => {
    const armed = [...migration.matchAll(/when '([a-z_]+)' then\n\s+action_eligible_statuses/g)]
      .map((match) => match[1]);
    expect(new Set(armed)).toEqual(new Set(TASK_COMMAND_ACTIONS));
  });
});
