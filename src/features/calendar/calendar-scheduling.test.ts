import { describe, expect, it } from "vitest";

import { detailControlsFor } from "@/features/task-commands/detail-controls";
import {
  TASK_COMMAND_ACTIONS,
  actionPolicy,
  isEligibleStatus,
} from "@/features/task-commands/taxonomy";

import {
  CALENDAR_SCHEDULING_FIELDS,
  isSchedulingAction,
  schedulingControlsFor,
} from "./calendar-scheduling";

/**
 * `2M-CAL-009` — the subset is **derived**, and these assertions are what makes
 * that claim falsifiable rather than a comment.
 *
 * The decisive shape: every expectation below is recomputed from `actionPolicy`
 * at test time. A test that named the three verbs would be the hand-written list
 * this module exists to avoid, in the one place nobody looks for it.
 */

const derived = (status: string) => TASK_COMMAND_ACTIONS
  .filter((action) => isEligibleStatus(action, status))
  .filter((action) => actionPolicy(action).changedFields
    .some((field) => (CALENDAR_SCHEDULING_FIELDS as readonly string[]).includes(field)));

describe("2M-CAL-009: only the verbs that move a date the calendar renders", () => {
  it("agrees with the taxonomy for every status a task can hold", () => {
    /*
     * Over every status rather than one: the eligibility half comes from
     * `detailControlsFor`, and a filter that quietly widened it would show up
     * only on a status the single-case test did not use.
     */
    const statuses = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred", "completed", "cancelled"];
    for (const status of statuses) {
      const actual = schedulingControlsFor(status).map((control) => control.action).sort();
      // `detailControlsFor` drops the three verbs the Work buttons already
      // render, so the expectation is intersected with what it returns rather
      // than taken from the taxonomy alone — otherwise this test would assert a
      // property of a function it is not calling.
      const offered = new Set(detailControlsFor(status).map((control) => control.action));
      const expected = derived(status).filter((action) => offered.has(action)).sort();
      expect(actual, `status ${status}`).toEqual(expected);
    }
  });

  it("is non-vacuous: an active task really does get controls", () => {
    // Without this, every assertion above would hold for a function that always
    // returned nothing — the shape that makes a whole suite agree with itself
    // and prove nothing.
    const actions = schedulingControlsFor("todo").map((control) => control.action);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions).toContain("reschedule_due");
    expect(actions).toContain("set_planned");
    expect(actions).toContain("clear_due");
  });

  it("excludes every verb that is not about a date", () => {
    const actions = schedulingControlsFor("todo").map((control) => control.action);
    for (const action of ["rename_task", "append_note", "set_priority", "assign_project", "assign_context", "assign_person", "set_waiting_on", "cancel_task"]) {
      expect(actions, `${action} reached the calendar`).not.toContain(action);
    }
  });

  it("offers nothing on a status that admits no scheduling verb", () => {
    // `cancelled` and `completed` are outside `ACTIVE_ONLY`, which is what every
    // scheduling policy declares. Stated rather than assumed, because the
    // surface's "unavailable" sentence depends on it.
    expect(schedulingControlsFor("cancelled")).toEqual([]);
    expect(schedulingControlsFor("completed")).toEqual([]);
  });
});

describe("2M-CAL-009: the derivation reads the policy, not a name", () => {
  it("classifies by changedFields rather than by the verb's spelling", () => {
    for (const control of detailControlsFor("todo")) {
      const touches = actionPolicy(control.action).changedFields
        .some((field) => (CALENDAR_SCHEDULING_FIELDS as readonly string[]).includes(field));
      expect(isSchedulingAction(control), `${control.action}`).toBe(touches);
    }
  });

  it("treats `reminders` as a linked effect and not as a scheduling column", () => {
    /*
     * The trap this list was written against. `reschedule_due` declares
     * `reminders` among its changed fields, and so do `complete_task`,
     * `reopen_task` and `cancel_task` — so a field list that included it would
     * put "complete" and "cancel" on the calendar as rescheduling controls.
     */
    expect(CALENDAR_SCHEDULING_FIELDS).not.toContain("reminders");
    expect([...CALENDAR_SCHEDULING_FIELDS].sort()).toEqual(["due_at", "planned_at"]);
  });

  it("carries no verb name anywhere in its own source contract", () => {
    // The property, asserted where it can be seen: this module names two
    // columns and zero actions, so a verb cannot be added or removed here.
    expect(CALENDAR_SCHEDULING_FIELDS.every((field) => field.endsWith("_at"))).toBe(true);
  });
});

describe("what the calendar cannot do yet, stated rather than hidden", () => {
  it("cannot clear a planned day, because the verb does not exist", () => {
    /*
     * `2M-PLAN-002` closes this asymmetry in slice 2M.2. Asserted as an absence
     * with its destination named, so the day `clear_planned` is added this line
     * fails and whoever adds it has to notice that the calendar starts offering
     * it — which is the correct outcome, and should be a decision rather than a
     * surprise.
     */
    expect(TASK_COMMAND_ACTIONS).not.toContain("clear_planned");
    expect(schedulingControlsFor("todo").map((control) => control.action))
      .not.toContain("clear_planned");
  });
});
