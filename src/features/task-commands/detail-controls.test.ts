import { describe, expect, it } from "vitest";
import {
  MAX_RELATIVE_DAYS,
  buildDetailPatch,
  dateBounds,
  detailControlFor,
  detailControlsFor,
  isSubmittableDate,
  type DetailControl,
} from "./detail-controls";
import {
  NON_TERMINAL_STATUSES,
  TASK_COMMAND_ACTIONS,
  TASK_PRIORITIES,
  actionPolicy,
  isEligibleStatus,
  type TaskCommandAction,
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

  it("refuses a day that does not exist, which the lexicon would silently roll over", () => {
    // `explicit_date` builds a WallTime straight from the capture groups and
    // never asks, so 2026-02-31 resolves — as March 3rd. Rescheduling a task to
    // a day the user did not name is worse than refusing.
    expect(isSubmittableDate("2026-02-31", today)).toBe(false);
    expect(isSubmittableDate("2026-13-01", today)).toBe(false);
    expect(isSubmittableDate("2026-00-10", today)).toBe(false);
    // The leap day itself must still be accepted in a leap year.
    expect(isSubmittableDate("2028-02-29", today)).toBe(true);
    expect(isSubmittableDate("2027-02-29", today)).toBe(false);
  });
});

describe("detailControlFor", () => {
  it("answers for every taxonomy action without needing a status", () => {
    // The Server Action is handed an action name and must know which field to
    // fill before it has read any row; eligibility is decided later, against the
    // resolved row, which is the only thing that has a status.
    for (const action of TASK_COMMAND_ACTIONS) {
      const control = detailControlFor(action);
      const required = actionPolicy(action).requiredPatchFields;
      if (required.length > 1) {
        expect(control).toBeNull();
        continue;
      }
      expect(control?.field).toBe(required[0] ?? null);
    }
  });

  it("agrees with the status-scoped list on every control it also offers", () => {
    for (const status of NON_TERMINAL_STATUSES) {
      for (const control of detailControlsFor(status)) {
        expect(detailControlFor(control.action)).toEqual(control);
      }
    }
  });
});

describe("buildDetailPatch", () => {
  const today = new Date("2026-07-30T12:00:00.000Z");

  function control(action: TaskCommandAction): DetailControl {
    const value = detailControlFor(action);
    if (value === null) throw new Error(`${action} has no single-field control`);
    return value;
  }

  it("fills the single field its control declares", () => {
    expect(buildDetailPatch(control("rename_task"), "Novo título", today))
      .toEqual({ status: "ok", patch: { title: "Novo título" } });
    expect(buildDetailPatch(control("set_priority"), "high", today))
      .toEqual({ status: "ok", patch: { priority: "high" } });
    expect(buildDetailPatch(control("assign_project"), "Aurora", today))
      .toEqual({ status: "ok", patch: { projectRef: "Aurora" } });
  });

  it("sends an empty patch for a control that fills nothing, whatever the form carried", () => {
    // `clear_due` means the same thing with or without a stray value, so a value
    // arriving with it is discarded rather than refused.
    expect(buildDetailPatch(control("clear_due"), undefined, today))
      .toEqual({ status: "ok", patch: {} });
    expect(buildDetailPatch(control("clear_due"), "ignorado", today))
      .toEqual({ status: "ok", patch: {} });
    expect(buildDetailPatch(control("cancel_task"), undefined, today))
      .toEqual({ status: "ok", patch: {} });
  });

  it("refuses an empty required field with its own reason, not a schema error", () => {
    for (const value of [undefined, "", "   "]) {
      expect(buildDetailPatch(control("rename_task"), value, today))
        .toEqual({ status: "refused", reason: "missing_value" });
    }
  });

  it("trims the submitted value, since the schema trims and would then disagree", () => {
    expect(buildDetailPatch(control("rename_task"), "  Novo título  ", today))
      .toEqual({ status: "ok", patch: { title: "Novo título" } });
  });

  it("separates a malformed date from a real one outside the window", () => {
    // Two different corrections: one is "write it as a date", the other is
    // "pick a nearer day". A single reason would tell the user neither.
    expect(buildDetailPatch(control("reschedule_due"), "15/08/2026", today))
      .toEqual({ status: "refused", reason: "date_invalid" });
    expect(buildDetailPatch(control("reschedule_due"), "2026-02-31", today))
      .toEqual({ status: "refused", reason: "date_invalid" });
    expect(buildDetailPatch(control("reschedule_due"), "2026-08-15T17:00:00.000Z", today))
      .toEqual({ status: "refused", reason: "date_invalid" });
    expect(buildDetailPatch(control("set_planned"), "2035-01-01", today))
      .toEqual({ status: "refused", reason: "date_out_of_range" });
  });

  it("accepts a date inside the window on both date verbs", () => {
    expect(buildDetailPatch(control("reschedule_due"), "2026-08-15", today))
      .toEqual({ status: "ok", patch: { dueAt: "2026-08-15" } });
    expect(buildDetailPatch(control("set_planned"), "2026-08-15", today))
      .toEqual({ status: "ok", patch: { plannedAt: "2026-08-15" } });
  });

  it("refuses a choice outside the policy's own closed set", () => {
    expect(buildDetailPatch(control("set_priority"), "catastrófica", today))
      .toEqual({ status: "refused", reason: "value_not_allowed" });
    // The route this closes matters: `set_status` reaching `cancelled` would be
    // an unconfirmed path to the transition `cancel_task` exists to guard.
    expect(buildDetailPatch(control("set_status"), "cancelled", today))
      .toEqual({ status: "refused", reason: "value_not_allowed" });
  });

  it("accepts every value the policy allows, for every bounded control", () => {
    for (const action of TASK_COMMAND_ACTIONS) {
      const value = detailControlFor(action);
      if (value === null || value.choices === null) continue;
      for (const choice of value.choices) {
        expect(buildDetailPatch(value, choice, today)).toMatchObject({ status: "ok" });
      }
    }
  });

  it("does not bound a free-text or relation control against a closed set", () => {
    // A project the user just created must be usable; the bound on a relation is
    // ownership, proven in SQL, not membership of a list this process holds.
    expect(control("assign_project").choices).toBeNull();
    expect(control("rename_task").choices).toBeNull();
  });
});
