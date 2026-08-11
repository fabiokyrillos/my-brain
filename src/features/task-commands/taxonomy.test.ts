import { describe, expect, it } from "vitest";

import {
  TASK_COMMAND_ACTIONS,
  TASK_COMMAND_POLICY_VERSION,
  actionPolicy,
  isTaskCommandAction,
  touchesReminders,
  NON_TERMINAL_STATUSES,
  TASK_STATUSES,
} from "./taxonomy";

// The taxonomy is the normative source for both eligibility and policy
// (PRD §11.2). It exists as data rather than as conditionals scattered through
// the matcher, the preview and the RPC, because those three would otherwise
// each carry their own copy of "can this action touch this task", and the
// review found exactly that class of divergence: a verb that could never match
// because one rule excluded the only tasks another rule targeted.

describe("task status vocabulary", () => {
  it("matches the eight literals the tasks CHECK constraint allows", () => {
    // supabase/migrations/202607160003_intelligent_capture.sql:111
    expect([...TASK_STATUSES]).toEqual([
      "inbox",
      "todo",
      "in_progress",
      "waiting",
      "blocked",
      "deferred",
      "completed",
      "cancelled",
    ]);
  });

  it("treats exactly the six non-terminal statuses as non-terminal", () => {
    expect([...NON_TERMINAL_STATUSES]).toEqual([
      "inbox",
      "todo",
      "in_progress",
      "waiting",
      "blocked",
      "deferred",
    ]);
  });
});

describe("action taxonomy", () => {
  it("declares exactly the sixteen actions the PRDs name", () => {
    expect([...TASK_COMMAND_ACTIONS]).toEqual([
      "complete_task",
      "reopen_task",
      "set_status",
      "cancel_task",
      "restore_task",
      "rename_task",
      "append_note",
      "reschedule_due",
      "clear_due",
      "set_planned",
      // Phase 2M slice 2M.2 (`2M-PLAN-002`, funded by ADR-106). Listed here in
      // its taxonomy position rather than appended, because this assertion is
      // about the declared order — the remote smoke's taxonomy reader compares
      // against it element for element.
      "clear_planned",
      "set_priority",
      "assign_project",
      "assign_context",
      "assign_person",
      "set_waiting_on",
    ]);
  });

  it("rejects an unknown action rather than defaulting to one", () => {
    expect(isTaskCommandAction("delete_task")).toBe(false);
    expect(isTaskCommandAction("")).toBe(false);
    expect(isTaskCommandAction(null)).toBe(false);
    expect(isTaskCommandAction("complete_task")).toBe(true);
  });

  it("gives every action a policy entry", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      expect(actionPolicy(action), action).toBeDefined();
    }
  });

  it("carries a policy version that changes when the policy changes", () => {
    expect(TASK_COMMAND_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe("destructive classification", () => {
  it("classifies cancellation as the only destructive action", () => {
    const destructive = TASK_COMMAND_ACTIONS.filter((action) => actionPolicy(action).destructive);
    expect(destructive).toEqual(["cancel_task"]);
  });

  it("never allows a destructive action to apply in one step", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      if (policy.destructive) expect(policy.oneStepEligible, action).toBe(false);
    }
  });

  it("requires confirmation for every destructive action", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      if (policy.destructive) expect(policy.requiresConfirmation, action).toBe(true);
    }
  });

  it("does not make restoring a deliberately cancelled task a one-step action", () => {
    expect(actionPolicy("restore_task").oneStepEligible).toBe(false);
  });
});

describe("eligible source statuses", () => {
  it("lets reopen_task target completed tasks, which is the only thing it can act on", () => {
    // The review caught this as unreachable: eligibility was expressed as a
    // cross-reference that excluded completed tasks from ranking for the one
    // action whose entire population is completed tasks.
    expect(actionPolicy("reopen_task").eligibleFrom).toEqual(["completed"]);
  });

  it("lets restore_task target cancelled tasks, and no other action target them", () => {
    expect(actionPolicy("restore_task").eligibleFrom).toEqual(["cancelled"]);
    for (const action of TASK_COMMAND_ACTIONS) {
      if (action === "restore_task") continue;
      expect(actionPolicy(action).eligibleFrom, action).not.toContain("cancelled");
    }
  });

  it("narrows cancel_task to the six non-terminal statuses", () => {
    // Admitting `completed` would require cancel_task to clear completed_at and
    // restore_task to know which status to return to.
    expect(actionPolicy("cancel_task").eligibleFrom).toEqual([...NON_TERMINAL_STATUSES]);
  });

  it("lets append_note target a completed task, because recording a fact about finished work is truthful", () => {
    expect(actionPolicy("append_note").eligibleFrom).toContain("completed");
  });

  it("keeps rescheduling away from completed tasks, because rescheduling finished work is not truthful", () => {
    for (const action of ["reschedule_due", "clear_due", "set_planned", "set_priority"] as const) {
      expect(actionPolicy(action).eligibleFrom, action).not.toContain("completed");
    }
  });

  it("never lists a status outside the eight literals", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      for (const status of actionPolicy(action).eligibleFrom) {
        expect(TASK_STATUSES, `${action}:${status}`).toContain(status);
      }
    }
  });
});

describe("allowed target values", () => {
  it("stops set_status from reaching cancelled or completed", () => {
    // Without this, `{action: set_status, patch: {status: "cancelled"}}` would
    // be a non-destructive, one-step, unconfirmed route to the exact transition
    // cancel_task exists to guard.
    const allowed = actionPolicy("set_status").allowedTargetValues;
    expect(allowed).toEqual([...NON_TERMINAL_STATUSES]);
    expect(allowed).not.toContain("cancelled");
    expect(allowed).not.toContain("completed");
  });

  it("bounds set_priority to the manual_priority CHECK values", () => {
    expect(actionPolicy("set_priority").allowedTargetValues).toEqual(["low", "medium", "high", "urgent"]);
  });

  it("leaves allowedTargetValues null for actions with no enumerable target", () => {
    expect(actionPolicy("rename_task").allowedTargetValues).toBeNull();
    expect(actionPolicy("complete_task").allowedTargetValues).toBeNull();
  });
});

describe("patch field contracts", () => {
  it("declares no patch fields for the actions whose effect is entirely positional", () => {
    for (const action of ["complete_task", "reopen_task", "clear_due", "restore_task"] as const) {
      expect(actionPolicy(action).requiredPatchFields, action).toEqual([]);
    }
  });

  it("requires exactly the field each single-field action changes", () => {
    expect(actionPolicy("rename_task").requiredPatchFields).toEqual(["title"]);
    expect(actionPolicy("append_note").requiredPatchFields).toEqual(["note"]);
    expect(actionPolicy("set_status").requiredPatchFields).toEqual(["status"]);
    expect(actionPolicy("set_priority").requiredPatchFields).toEqual(["priority"]);
    expect(actionPolicy("reschedule_due").requiredPatchFields).toEqual(["dueAt"]);
    expect(actionPolicy("set_planned").requiredPatchFields).toEqual(["plannedAt"]);
  });

  it("names the relation each assignment action targets", () => {
    expect(actionPolicy("assign_project").requiredPatchFields).toEqual(["projectRef"]);
    expect(actionPolicy("assign_context").requiredPatchFields).toEqual(["contextRef"]);
    expect(actionPolicy("assign_person").requiredPatchFields).toEqual(["personRef"]);
    expect(actionPolicy("set_waiting_on").requiredPatchFields).toEqual(["personRef"]);
  });

  it("never lets an action require a field it does not also permit", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const policy = actionPolicy(action);
      for (const field of policy.requiredPatchFields) {
        expect(policy.allowedPatchFields, `${action}:${field}`).toContain(field);
      }
    }
  });
});

describe("reminder consequences", () => {
  it("marks every transition that invalidates or revives a reminder", () => {
    // PRD §11.3. Getting this wrong leaves a reminder firing for a cancelled
    // task, or hands back a restored task that can never remind.
    const touching = TASK_COMMAND_ACTIONS.filter((action) => touchesReminders(action));
    expect(touching.sort()).toEqual(
      ["cancel_task", "clear_due", "complete_task", "reopen_task", "reschedule_due", "restore_task"].sort(),
    );
  });
});

describe("undo strategy", () => {
  it("advertises every action as reversible, since none exceeds what a handler can restore", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      expect(actionPolicy(action).reversible, action).toBe(true);
    }
  });
});
