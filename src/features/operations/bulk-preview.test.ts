import { describe, expect, it } from "vitest";

import { isEligibleStatus } from "@/features/task-commands/taxonomy";
import { BULK_ELIGIBLE_ACTIONS } from "./bulk-eligibility";
import { previewBulk } from "./bulk-preview";

/**
 * `2L-BULK-005`/`-006` — what a bulk operation would do, before it does it.
 *
 * The preview's one load-bearing property is that its partition is **the same
 * decision the apply path takes**, not a second implementation of it. Both ask
 * `isEligibleStatus`, and the test below drives both over the same fixtures
 * rather than comparing one hand-written expectation against another.
 */

const item = (id: string, status: string) => ({ taskId: id, status });

describe("2L-BULK-005: the preview partitions by the rule the apply path uses", () => {
  it("agrees with `isEligibleStatus`, item by item, for every bulk-eligible action", () => {
    const items = [
      item("a", "todo"),
      item("b", "in_progress"),
      item("c", "waiting"),
      item("d", "completed"),
      item("e", "blocked"),
      item("f", "deferred"),
      item("g", "inbox"),
    ];

    for (const action of BULK_ELIGIBLE_ACTIONS) {
      const preview = previewBulk(action, items);
      // Not "the counts look right" — the exact partition, derived from the
      // same predicate the RPC's `p_eligible_statuses` is built from.
      expect(preview.eligible.map((entry) => entry.taskId), action)
        .toEqual(items.filter((entry) => isEligibleStatus(action, entry.status)).map((entry) => entry.taskId));
      expect(preview.refused.map((entry) => entry.taskId), action)
        .toEqual(items.filter((entry) => !isEligibleStatus(action, entry.status)).map((entry) => entry.taskId));
    }
  });

  it("states the operation, the count it would change and the count it would refuse", () => {
    const preview = previewBulk("set_priority", [item("a", "todo"), item("b", "completed")]);
    expect(preview.action).toBe("set_priority");
    expect(preview.eligibleCount).toBe(1);
    expect(preview.refusedCount).toBe(1);
    expect(preview.eligibleCount + preview.refusedCount).toBe(2);
  });

  it("gives each refusal a reason class rather than a bare count", () => {
    const preview = previewBulk("set_priority", [item("b", "completed")]);
    expect(preview.refused).toEqual([{ taskId: "b", reason: "ineligible_status" }]);
  });

  it("reports a set that would change nothing as exactly that", () => {
    // Not as an error and not as a success: `2L-BULK-009`'s "never a total
    // failure presented as a partial" has a mirror — a preview that would apply
    // to nothing has to say so before the user commits to it.
    const preview = previewBulk("set_priority", [item("a", "completed"), item("b", "completed")]);
    expect(preview.eligibleCount).toBe(0);
    expect(preview.refusedCount).toBe(2);
    expect(preview.wouldChangeNothing).toBe(true);
  });

  it("is empty for an empty selection, and says nothing would change", () => {
    const preview = previewBulk("set_priority", []);
    expect(preview.eligibleCount).toBe(0);
    expect(preview.wouldChangeNothing).toBe(true);
  });
});

describe("2L-BULK-006: the destructive arm is unreachable, not merely unused", () => {
  it("refuses to preview an action the bulk set does not contain", () => {
    // Whether an operation needs confirmation is derived from the policy, never
    // from the control that was clicked. Under OD-2L-3 A no destructive
    // operation is bulk-eligible at all, so the preview refuses `cancel_task`
    // outright rather than partitioning it and then declining to apply.
    const preview = previewBulk("cancel_task", [item("a", "todo")]);
    expect(preview.status).toBe("not_bulk_eligible");
    expect(preview.eligible).toEqual([]);
    expect(preview.refused).toEqual([]);
  });

  it("refuses an unknown action the same way", () => {
    const preview = previewBulk("not_a_verb", [item("a", "todo")]);
    expect(preview.status).toBe("not_bulk_eligible");
  });

  it("requires no confirmation for anything it can preview", () => {
    // Derived, not asserted: every previewable action is non-destructive by
    // construction, so `requiresConfirmation` is false for all of them and the
    // confirmation branch has no input that reaches it.
    for (const action of BULK_ELIGIBLE_ACTIONS) {
      expect(previewBulk(action, [item("a", "todo")]).requiresConfirmation, action).toBe(false);
    }
  });
});
