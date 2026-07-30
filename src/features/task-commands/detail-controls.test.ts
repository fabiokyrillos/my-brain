import { describe, expect, it } from "vitest";
import {
  MAX_RELATIVE_DAYS,
  dateBounds,
  detailControlsFor,
  isSubmittableDate,
} from "./detail-controls";
import {
  NON_TERMINAL_STATUSES,
  TASK_PRIORITIES,
  actionPolicy,
  isEligibleStatus,
} from "./taxonomy";

describe("detailControlsFor", () => {
  it("never offers a control the task's current status does not admit", () => {
    // The property that matters: a rendered control whose action the taxonomy
    // would refuse is a button whose only possible outcome is a refusal
    // (2F-SURFACE-009).
    for (const status of ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred", "completed", "cancelled"]) {
      for (const control of detailControlsFor(status)) {
        expect(
          isEligibleStatus(control.action, status),
          `${control.action} was offered for a task in status ${status}`,
        ).toBe(true);
      }
    }
  });

  it("bounds every choice control to exactly the values its policy allows", () => {
    for (const status of NON_TERMINAL_STATUSES) {
      for (const control of detailControlsFor(status)) {
        if (control.kind !== "choice") continue;
        expect(control.choices).toEqual(actionPolicy(control.action).allowedTargetValues);
        expect(control.choices?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("renders set_priority as a closed choice over the four priorities", () => {
    const control = detailControlsFor("todo").find((item) => item.action === "set_priority");
    expect(control?.kind).toBe("choice");
    expect(control?.field).toBe("priority");
    expect(control?.choices).toEqual(TASK_PRIORITIES);
  });

  it("renders the date verbs as date controls carrying their own field", () => {
    const controls = detailControlsFor("todo");
    expect(controls.find((item) => item.action === "reschedule_due")).toMatchObject({ kind: "date", field: "dueAt" });
    expect(controls.find((item) => item.action === "set_planned")).toMatchObject({ kind: "date", field: "plannedAt" });
    // `clear_due` carries no value at all, so it is a single button.
    expect(controls.find((item) => item.action === "clear_due")).toMatchObject({ kind: "immediate", field: null });
  });

  it("renders the relation verbs as owned-entity pickers, not free text", () => {
    const controls = detailControlsFor("todo");
    expect(controls.find((item) => item.action === "assign_project")).toMatchObject({ kind: "relation", relation: "project" });
    expect(controls.find((item) => item.action === "assign_context")).toMatchObject({ kind: "relation", relation: "context" });
    expect(controls.find((item) => item.action === "assign_person")).toMatchObject({ kind: "relation", relation: "person" });
    expect(controls.find((item) => item.action === "set_waiting_on")).toMatchObject({ kind: "relation", relation: "person" });
  });

  it("marks cancel_task destructive and leaves every other control direct", () => {
    const controls = detailControlsFor("todo");
    const destructive = controls.filter((item) => item.destructive).map((item) => item.action);
    expect(destructive).toEqual(["cancel_task"]);
  });

  it("does not offer the status verbs the shared Work controls already render", () => {
    // Two routes to one transition on one screen is the duplication this avoids.
    for (const status of NON_TERMINAL_STATUSES) {
      const actions = detailControlsFor(status).map((control) => control.action);
      expect(actions).not.toContain("complete_task");
      expect(actions).not.toContain("reopen_task");
      expect(actions).not.toContain("set_status");
    }
  });

  it("offers only restoration on a cancelled task", () => {
    expect(detailControlsFor("cancelled").map((control) => control.action)).toEqual(["restore_task"]);
  });

  it("gives every control exactly one field to fill, or none", () => {
    for (const status of NON_TERMINAL_STATUSES) {
      for (const control of detailControlsFor(status)) {
        const required = actionPolicy(control.action).requiredPatchFields;
        expect(required.length).toBeLessThanOrEqual(1);
        expect(control.field).toBe(required[0] ?? null);
      }
    }
  });
});

describe("date bounds", () => {
  const today = new Date("2026-07-30T12:00:00.000Z");

  it("mirrors the temporal lexicon's ±730-day window", () => {
    expect(MAX_RELATIVE_DAYS).toBe(730);
    const bounds = dateBounds(today);
    // 730 days back crosses no leap day (Feb 2025 and Feb 2026 are common
    // years); 730 forward crosses Feb 2028, which is why the window is not
    // symmetric on the calendar even though it is symmetric in days.
    expect(bounds.min).toBe("2024-07-30");
    expect(bounds.max).toBe("2028-07-29");
  });

  it("accepts the calendar-date shape the lexicon resolves", () => {
    expect(isSubmittableDate("2026-08-15", today)).toBe(true);
  });

  it("refuses a complete ISO instant, which the lexicon deliberately will not resolve", () => {
    // `resolveTemporalPhrase` refuses a full instant on purpose: the instant is
    // never client-supplied, or a browser offset could pin the user to another
    // timezone. The control must therefore never submit one.
    expect(isSubmittableDate("2026-08-15T17:00:00.000Z", today)).toBe(false);
  });

  it("refuses a date outside the window instead of silently clamping it", () => {
    expect(isSubmittableDate("2030-01-01", today)).toBe(false);
    expect(isSubmittableDate("2020-01-01", today)).toBe(false);
  });
});
