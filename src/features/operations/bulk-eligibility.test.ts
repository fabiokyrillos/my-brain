import { describe, expect, it } from "vitest";

import { detailControlFor } from "@/features/task-commands/detail-controls";
import { TASK_COMMAND_ACTIONS, actionPolicy } from "@/features/task-commands/taxonomy";
import { BULK_ELIGIBLE_ACTIONS, isBulkEligibleAction } from "./bulk-eligibility";

/**
 * `2L-BULK-004` — which operations may be applied to a set, under OD-2L-3
 * option A.
 *
 * The owner signed **non-destructive, bounded-value operations only**: status
 * change within active statuses, priority, due date, planned date and
 * authorized relation assignment. The set below must come out of the taxonomy
 * rather than be typed, because a hand-written list is a second copy of
 * eligibility knowledge and the first policy change makes it a lie.
 */

describe("2L-BULK-004: the bulk-eligible set is derived, never listed", () => {
  it("is exactly the non-destructive actions whose value the policy bounds", () => {
    // The derivation, re-run here against the taxonomy. If the module ever
    // started returning a literal, this would diverge the moment a policy moved.
    const expected = TASK_COMMAND_ACTIONS.filter((action) => {
      const control = detailControlFor(action);
      return control !== null
        && !actionPolicy(action).destructive
        && (control.kind === "choice" || control.kind === "date" || control.kind === "relation");
    });
    expect([...BULK_ELIGIBLE_ACTIONS]).toEqual(expected);
  });

  it("is exactly what OD-2L-3 option A signed", () => {
    // Stated by name as well as derived, because "the derivation happens to
    // agree with itself" is not evidence that it agrees with the decision.
    expect([...BULK_ELIGIBLE_ACTIONS].sort()).toEqual([
      "assign_context",
      "assign_person",
      "assign_project",
      "reschedule_due",
      "set_planned",
      "set_priority",
      "set_status",
      "set_waiting_on",
    ]);
  });

  it("excludes `cancel_task`, by name", () => {
    // `2L-BULK-004` requires this asserted by name and by test. It is the one
    // destructive verb in the taxonomy, and OD-2L-3 A keeps it out of bulk
    // entirely — so `2L-BULK-006`'s destructive arm is unreachable rather than
    // merely unused.
    expect(BULK_ELIGIBLE_ACTIONS).not.toContain("cancel_task");
    expect(isBulkEligibleAction("cancel_task")).toBe(false);
  });

  it("contains nothing destructive at all", () => {
    for (const action of BULK_ELIGIBLE_ACTIONS) {
      expect(actionPolicy(action).destructive, action).toBe(false);
    }
  });

  it("contains nothing that takes free text", () => {
    // `rename_task` and `append_note` are non-destructive and still excluded:
    // OD-2L-3 A says *bounded-value*, and applying one title or one note to
    // fifty tasks is not an operation anybody means.
    expect(BULK_ELIGIBLE_ACTIONS).not.toContain("rename_task");
    expect(BULK_ELIGIBLE_ACTIONS).not.toContain("append_note");
  });

  it("cannot reach `cancelled` through the status verb it does admit", () => {
    // 2F-SURFACE-012 closed that route structurally, and bulk must not reopen
    // it: `set_status`'s own `allowedTargetValues` is the gate.
    const allowed = actionPolicy("set_status").allowedTargetValues ?? [];
    expect(allowed).not.toContain("cancelled");
    expect(allowed.length).toBeGreaterThan(0);
  });

  it("refuses an unknown action rather than defaulting to eligible", () => {
    expect(isBulkEligibleAction("not_a_verb")).toBe(false);
    expect(isBulkEligibleAction("")).toBe(false);
  });
});
