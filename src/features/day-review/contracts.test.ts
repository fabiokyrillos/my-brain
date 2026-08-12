/**
 * `2M-REVIEW-003` and `-005` — the five verbs, and the properties they inherit.
 *
 * Every assertion here is against the **taxonomy**, not against a restatement of
 * it. A test that hard-coded "archive requires confirmation" would keep passing
 * if `cancel_task` stopped requiring one; these read the policy, so the review
 * and the command path cannot drift apart silently.
 */

import { describe, expect, it } from "vitest";

import { dayReviewActionKinds } from "@/features/product-analytics/contracts";
import { NON_TERMINAL_STATUSES, actionPolicy, isTaskCommandAction } from "@/features/task-commands/taxonomy";

import {
  DAY_REVIEW_VERBS,
  dayReviewControlFor,
  dayReviewIsReversible,
  dayReviewRequiresConfirmation,
  dayReviewVerb,
  dayReviewVerbsFor,
} from "./contracts";

describe("2M-REVIEW-003: five verbs, each an existing taxonomy action", () => {
  it("declares exactly the five the telemetry vocabulary admits, and no sixth", () => {
    // The deployed validator bounds `actionKind` to these five. A verb this
    // module invented would emit an event the database refuses, which is the
    // failure `2M-METRICS-001` orders the migration before the producer for.
    expect(DAY_REVIEW_VERBS.map((verb) => verb.kind)).toEqual([...dayReviewActionKinds]);
  });

  it("maps every verb onto a real taxonomy action", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      expect(isTaskCommandAction(verb.taxonomy), `${verb.kind} → ${verb.taxonomy}`).toBe(true);
    }
  });

  it("fills only a field its taxonomy action actually allows", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      if (verb.field === null) {
        expect(actionPolicy(verb.taxonomy).requiredPatchFields, verb.kind).toEqual([]);
        continue;
      }
      expect(actionPolicy(verb.taxonomy).allowedPatchFields, verb.kind).toContain(verb.field);
    }
  });

  it("proposes only a value the taxonomy's own closed set admits", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      if (verb.value === null) continue;
      const allowed = actionPolicy(verb.taxonomy).allowedTargetValues;
      expect(allowed, `${verb.kind} proposes a value for an unbounded action`).not.toBeNull();
      expect(allowed, verb.kind).toContain(verb.value);
    }
  });

  it("writes a task and nothing else — no verb reaches another domain", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      for (const field of actionPolicy(verb.taxonomy).changedFields) {
        expect(
          field.startsWith("task_") || field === "reminders" ? "task-scoped" : field,
          `${verb.kind} changes ${field}`,
        ).not.toMatch(/^(memories|entries|conversations|notifications)/);
      }
    }
  });

  it("keeps `plan` and `reschedule` on different columns", () => {
    // OD-2M-3 A. A review whose "plan" moved a deadline would be collapsing the
    // intention and the commitment the whole phase exists to separate.
    expect(actionPolicy(dayReviewVerb("plan").taxonomy).changedFields).toContain("planned_at");
    expect(actionPolicy(dayReviewVerb("reschedule").taxonomy).changedFields).toContain("due_at");
    expect(actionPolicy(dayReviewVerb("plan").taxonomy).changedFields).not.toContain("due_at");
  });

  it("distinguishes `carry_forward` from `plan` by the value, not by the authority", () => {
    expect(dayReviewVerb("carry_forward").taxonomy).toBe(dayReviewVerb("plan").taxonomy);
    expect(dayReviewVerb("carry_forward").patchSource).toBe("next_day");
    expect(dayReviewVerb("plan").patchSource).toBe("user_date");
  });
});

describe("2M-REVIEW-005: undo where the domain supports it, confirmation where it does not", () => {
  it("confirms exactly the verbs the taxonomy calls destructive", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      expect(dayReviewRequiresConfirmation(verb.kind), verb.kind)
        .toBe(actionPolicy(verb.taxonomy).requiresConfirmation);
    }
    // The one that is, today. Named so a taxonomy change that made archiving
    // one-click fails this line rather than shipping quietly.
    expect(dayReviewRequiresConfirmation("archive")).toBe(true);
    for (const kind of ["carry_forward", "plan", "reschedule", "follow_up"] as const) {
      expect(dayReviewRequiresConfirmation(kind), kind).toBe(false);
    }
  });

  it("claims an undo only where the policy records one", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      expect(dayReviewIsReversible(verb.kind), verb.kind).toBe(actionPolicy(verb.taxonomy).reversible);
    }
  });

  it("never offers a verb that is neither undoable nor confirmed", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      expect(
        dayReviewIsReversible(verb.kind) || dayReviewRequiresConfirmation(verb.kind),
        `${verb.kind} is irreversible and unconfirmed`,
      ).toBe(true);
    }
  });
});

describe("eligibility is the taxonomy's answer, not the review's", () => {
  it("offers every verb on an ordinary open task", () => {
    expect(dayReviewVerbsFor("todo").map((verb) => verb.kind).sort())
      .toEqual([...dayReviewActionKinds].sort());
  });

  it("offers none on a cancelled task, where every mapped action is ineligible", () => {
    expect(dayReviewVerbsFor("cancelled")).toEqual([]);
  });

  it("offers none on a completed task", () => {
    // `2F-SURFACE-009`: a button whose only possible outcome is a refusal is not
    // offered. Completed tasks appear in the review's own `completed` section, so
    // this is a shape the surface really renders.
    expect(dayReviewVerbsFor("completed")).toEqual([]);
  });

  it("offers every verb on every non-terminal status", () => {
    for (const status of NON_TERMINAL_STATUSES) {
      expect(dayReviewVerbsFor(status).length, status).toBe(dayReviewActionKinds.length);
    }
  });

  it("refuses a status outside the vocabulary rather than guessing", () => {
    expect(dayReviewVerbsFor("not_a_status")).toEqual([]);
  });
});

describe("the controls come from the task detail's own shape function", () => {
  it("gives every verb a renderable control", () => {
    for (const verb of DAY_REVIEW_VERBS) {
      const control = dayReviewControlFor(verb);
      expect(control, verb.kind).not.toBeNull();
      expect(control?.action, verb.kind).toBe(verb.taxonomy);
    }
  });

  it("renders `follow_up` as a bounded choice and not as free text", () => {
    const control = dayReviewControlFor(dayReviewVerb("follow_up"));
    expect(control?.kind).toBe("choice");
    expect(control?.choices).toContain("waiting");
    // The route to `cancelled` stays closed: `set_status`'s allowed values are
    // the active ones, so a follow-up cannot become an unconfirmed cancellation.
    expect(control?.choices).not.toContain("cancelled");
  });

  it("renders `archive` as the destructive control, which is what opens the dialog", () => {
    expect(dayReviewControlFor(dayReviewVerb("archive"))?.destructive).toBe(true);
  });

  it("renders both planning verbs as dates", () => {
    expect(dayReviewControlFor(dayReviewVerb("plan"))?.kind).toBe("date");
    expect(dayReviewControlFor(dayReviewVerb("carry_forward"))?.kind).toBe("date");
    expect(dayReviewControlFor(dayReviewVerb("reschedule"))?.kind).toBe("date");
  });
});
