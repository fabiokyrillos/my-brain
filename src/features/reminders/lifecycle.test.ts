import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  availableReminderActions,
  canApplyReminderAction,
  hasPendingDelivery,
  isSnoozePreset,
  REMINDER_ACTIONS,
  REMINDER_STATUSES,
  requiresConfirmation,
  SNOOZE_PRESET_MINUTES,
  toReminderStatus,
} from "./lifecycle";

/**
 * The client mirror of the RPC's state machine (UX-12, DEC-6, DEC-7).
 *
 * Two kinds of case here, and the second is the one that matters. The first
 * kind asserts the mirror behaves as designed. The second reads
 * `202607310064_reminder_lifecycle_command.sql` and asserts the mirror and the
 * migration agree — because a mirror that drifts from the thing it mirrors is
 * worse than no mirror: it renders a control the database will refuse, and the
 * owner learns that only after clicking.
 */

const MIGRATION = readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/202607310064_reminder_lifecycle_command.sql"),
  "utf8",
);

describe("reminder lifecycle: the vocabulary", () => {
  it("declares exactly the members of the column's CHECK constraint", () => {
    // Read from the migration that created the table, not from memory: the
    // CHECK is the authority on what a status can be.
    const table = readFileSync(
      path.resolve(process.cwd(), "supabase/migrations/202607160007_agent_operations.sql"),
      "utf8",
    );
    for (const status of REMINDER_STATUSES) {
      expect(table, `${status} is not in the reminders status CHECK`).toContain(`'${status}'`);
    }
    expect([...REMINDER_STATUSES].sort()).toEqual(
      ["cancelled", "scheduled", "sent", "snoozed"],
    );
  });

  it("narrows a database value and refuses anything else", () => {
    expect(toReminderStatus("scheduled")).toBe("scheduled");
    expect(toReminderStatus("SCHEDULED")).toBeNull();
    expect(toReminderStatus("deleted")).toBeNull();
    expect(toReminderStatus("")).toBeNull();
  });

  it("uses the same five snooze presets the migration accepts", () => {
    // The migration spells them as a literal array; drift here would render a
    // preset the RPC rejects with 22023.
    expect(MIGRATION).toContain("array[15, 60, 180, 1440, 10080]");
    expect([...SNOOZE_PRESET_MINUTES]).toEqual([15, 60, 180, 1440, 10080]);
    expect(isSnoozePreset(60)).toBe(true);
    expect(isSnoozePreset(7)).toBe(false);
    expect(isSnoozePreset(10081)).toBe(false);
  });

  it("names exactly the five commands the migration's CASE admits", () => {
    for (const action of REMINDER_ACTIONS) {
      expect(MIGRATION, `the migration has no branch for '${action}'`).toContain(
        `when '${action}' then`,
      );
    }
    expect(REMINDER_ACTIONS).toHaveLength(5);
  });
});

describe("reminder lifecycle: what each state accepts", () => {
  it("offers the four live commands on a scheduled independent reminder", () => {
    expect(availableReminderActions({ status: "scheduled", taskId: null })).toEqual([
      "snooze",
      "reschedule",
      "edit",
      "cancel",
    ]);
  });

  it("withholds edit — and only edit — from a task-linked reminder", () => {
    // `apply_task_command` derives a task-linked reminder's title from the task,
    // so an owner edit would be silently discarded by the next task command.
    // Rescheduling one is still legitimate: only the *title* is derived.
    expect(availableReminderActions({ status: "scheduled", taskId: "task-1" })).toEqual([
      "snooze",
      "reschedule",
      "cancel",
    ]);
    expect(canApplyReminderAction({ status: "scheduled", taskId: "task-1" }, "reschedule")).toBe(true);
    expect(canApplyReminderAction({ status: "scheduled", taskId: "task-1" }, "edit")).toBe(false);
  });

  it("offers restore, and nothing else, on a cancelled reminder", () => {
    expect(availableReminderActions({ status: "cancelled", taskId: null })).toEqual(["restore"]);
    expect(canApplyReminderAction({ status: "cancelled", taskId: null }, "snooze")).toBe(false);
  });

  it("treats a delivered reminder as terminal in every direction", () => {
    // Its notification dedupe key is spent, so re-arming it would produce a row
    // the heartbeat selects, fails to notify for, and immediately re-stamps
    // sent. Not "we chose not to" — it genuinely cannot fire again.
    expect(availableReminderActions({ status: "sent", taskId: null })).toEqual([]);
    for (const action of REMINDER_ACTIONS) {
      expect(canApplyReminderAction({ status: "sent", taskId: null }, action)).toBe(false);
    }
  });

  it("treats the dormant snoozed status as accepting nothing", () => {
    expect(availableReminderActions({ status: "snoozed", taskId: null })).toEqual([]);
  });

  it("never offers an action the migration does not admit from that status", () => {
    // The migration sets `eligible_statuses` per command. This walks every
    // (status, action) pair the mirror allows and requires the migration to
    // declare that status for that command — so a widened mirror fails here
    // rather than at the owner's click.
    const eligible = new Map<string, readonly string[]>([
      ["snooze", ["scheduled"]],
      ["reschedule", ["scheduled"]],
      ["cancel", ["scheduled"]],
      ["restore", ["cancelled"]],
      ["edit", ["scheduled"]],
    ]);
    for (const [action, statuses] of eligible) {
      expect(
        MIGRATION,
        `the migration's ${action} branch no longer declares ${statuses.join(", ")}`,
      ).toContain(`array[${statuses.map((status) => `'${status}'`).join(", ")}]`);
    }
    for (const status of REMINDER_STATUSES) {
      for (const action of REMINDER_ACTIONS) {
        if (!canApplyReminderAction({ status, taskId: null }, action)) continue;
        expect(
          eligible.get(action),
          `the mirror allows ${action} from ${status}, which the migration refuses`,
        ).toContain(status);
      }
    }
  });
});

describe("reminder lifecycle: what the surface says about delivery", () => {
  it("counts only scheduled as having a delivery ahead of it", () => {
    expect(hasPendingDelivery("scheduled")).toBe(true);
    expect(hasPendingDelivery("sent")).toBe(false);
    expect(hasPendingDelivery("cancelled")).toBe(false);
    expect(hasPendingDelivery("snoozed")).toBe(false);
  });

  it("requires confirmation for cancel alone", () => {
    expect(requiresConfirmation("cancel")).toBe(true);
    for (const action of REMINDER_ACTIONS.filter((candidate) => candidate !== "cancel")) {
      expect(requiresConfirmation(action)).toBe(false);
    }
  });
});

describe("DEC-7: the dormant status stays dormant", () => {
  it("never writes 'snoozed' anywhere in the command boundary", () => {
    // The same property the migration's own post-deploy block greps for. Kept
    // here too because a build-time failure is cheaper to read than a deploy
    // one, and because this file is where a future reader looks first.
    // Bounded to the function body, not to the rest of the file: the migration's
    // post-deploy block *greps for* `'snoozed'`, so an unbounded slice would
    // match the guard rather than a use — a test failing on the thing that
    // enforces it is worse than no test.
    const body = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.apply_reminder_command_v1"),
      MIGRATION.indexOf("revoke all on function public.apply_reminder_command_v1"),
    );
    expect(body).not.toContain("'snoozed'");
  });

  it("leaves snoozed_until out of the boundary entirely", () => {
    // DEC-7 item 9: do not write the dormant column merely to make it look used.
    const body = MIGRATION.slice(
      MIGRATION.indexOf("create or replace function public.apply_reminder_command_v1"),
      MIGRATION.indexOf("create or replace function private.undo_apply_reminder_command_v1"),
    );
    expect(body).not.toContain("snoozed_until");
  });
});

/**
 * `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` — the one eligibility rule that comes from
 * an index rather than from the state machine.
 *
 * Every other rule in this module mirrors a transition
 * `apply_reminder_command_v1` enforces. This one mirrors
 * `reminders_one_live_occurrence_per_series`, a partial unique index, which is
 * why it is an input rather than a status: two cancelled occurrences of the same
 * series differ only in whether a replacement currently holds the live slot.
 *
 * The migration text is read below so the mirror cannot drift from the index it
 * mirrors — the discipline the snooze-preset case in this file already uses.
 */
describe("a cancelled occurrence whose series already has a live one", () => {
  it("offers no restore", () => {
    expect(
      availableReminderActions({ status: "cancelled", taskId: null, seriesSlotTaken: true }),
    ).toEqual([]);
  });

  it("offers restore when the slot is free", () => {
    expect(
      availableReminderActions({ status: "cancelled", taskId: null, seriesSlotTaken: false }),
    ).toEqual(["restore"]);
  });

  it("is unchanged when the caller says nothing, so no existing behaviour moved", () => {
    // `2R-MODEL-004`: a reminder without a rule behaves exactly as it did.
    expect(availableReminderActions({ status: "cancelled", taskId: null })).toEqual(["restore"]);
  });

  it("does not withhold anything from a scheduled occurrence", () => {
    // The flag is about `restore` alone. A live occurrence still cancels, snoozes,
    // reschedules and edits, and withholding those would break the surface the
    // requirement is about.
    expect(
      availableReminderActions({ status: "scheduled", taskId: null, seriesSlotTaken: true }),
    ).toEqual(["snooze", "reschedule", "edit", "cancel"]);
  });

  it("mirrors an index the migration really declares", () => {
    /*
      The rule has no `raise` to grep for, because the database enforces it with
      a partial unique index and the violation arrives as a bare `23505`. So the
      thing to pin is the index itself: if its predicate ever stopped covering
      `detached_at is null`, a detached occurrence would start colliding too and
      this mirror would be withholding the wrong control.
    */
    const recurrence = readFileSync(
      path.join(process.cwd(), "supabase/migrations/202608230101_phase_2r_slice_1_reminder_recurrence.sql"),
      "utf8",
    );
    const index = recurrence.slice(
      recurrence.indexOf("reminders_one_live_occurrence_per_series"),
      recurrence.indexOf("reminders_series_sequence_key"),
    );
    expect(index).toContain("detached_at is null");
    expect(index).toContain("status = 'scheduled'");
  });
});
