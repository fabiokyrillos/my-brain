import { describe, expect, it } from "vitest";

import { summariseBulk, type BulkItemOutcome } from "./bulk-result";

/**
 * `2L-BULK-008`/`-009`/`-011`/`-012` — the truth a bulk operation tells
 * afterwards.
 *
 * **This is the phase's signature failure mode.** A bulk action that reports a
 * partial as a success is the defect `2L-BULK-009` names and the plan calls a
 * release blocker, so the shape is pinned before anything renders it.
 */

const applied = (id: string, undoId = `undo-${id}`): BulkItemOutcome =>
  ({ taskId: id, outcome: "applied", undo: { undoId, expiresAt: "2099-01-01T00:00:00.000Z" } });
const noChange = (id: string): BulkItemOutcome => ({ taskId: id, outcome: "no_change" });
const refused = (id: string, reason: BulkItemOutcome["reason"] = "ineligible"): BulkItemOutcome =>
  ({ taskId: id, outcome: "refused", reason });
const failed = (id: string): BulkItemOutcome => ({ taskId: id, outcome: "failed", reason: "failed" });

describe("2L-BULK-009: a partial is a partial", () => {
  it("reports the middle item's refusal and the rest as applied", () => {
    // The canonical test the plan names: n items, item k refused, the result
    // says n-1 applied and 1 refused with its reason, and the applied items are
    // genuinely applied.
    const summary = summariseBulk([applied("a"), refused("b"), applied("c")]);

    expect(summary.kind).toBe("partial");
    expect(summary.appliedCount).toBe(2);
    expect(summary.unchangedCount).toBe(0);
    expect(summary.refusedCount).toBe(1);
    expect(summary.applied.map((item) => item.taskId)).toEqual(["a", "c"]);
    expect(summary.notApplied.map((item) => item.taskId)).toEqual(["b"]);
  });

  it("never presents a partial as a complete success", () => {
    expect(summariseBulk([applied("a"), refused("b")]).kind).not.toBe("all_applied");
  });

  it("never presents a partial as a total failure", () => {
    expect(summariseBulk([applied("a"), refused("b")]).kind).not.toBe("none_applied");
  });

  it("reports every item failing as a total failure, not as a silent success", () => {
    const summary = summariseBulk([refused("a"), failed("b")]);
    expect(summary.kind).toBe("none_applied");
    expect(summary.appliedCount).toBe(0);
    expect(summary.refusedCount).toBe(2);
  });

  it("reports an unbroken run as complete", () => {
    const summary = summariseBulk([applied("a"), applied("b")]);
    expect(summary.kind).toBe("all_applied");
    expect(summary.appliedCount).toBe(2);
  });

  it("counts a no-change apart from an applied change and from a refusal", () => {
    // Three different facts. A `no_change` wrote nothing, but nothing was
    // refused either — telling the user "1 refused" would be false, and folding
    // it into "applied" would claim a change that did not happen.
    const summary = summariseBulk([applied("a"), noChange("b"), refused("c")]);
    expect(summary.appliedCount).toBe(1);
    expect(summary.unchangedCount).toBe(1);
    expect(summary.refusedCount).toBe(1);
    expect(summary.kind).toBe("partial");
  });

  it("treats an all-no-change run as complete rather than as a failure", () => {
    // Every item already held what was asked for. Nothing was refused and
    // nothing went wrong, so calling it a failure would be a lie in the other
    // direction.
    const summary = summariseBulk([noChange("a"), noChange("b")]);
    expect(summary.kind).toBe("all_applied");
    expect(summary.appliedCount).toBe(0);
    expect(summary.unchangedCount).toBe(2);
  });

  it("says nothing at all about an empty run", () => {
    const summary = summariseBulk([]);
    expect(summary.kind).toBe("empty");
    expect(summary.appliedCount).toBe(0);
  });
});

describe("2L-BULK-011: the three unknowable causes give one outcome", () => {
  it("makes foreign, deleted and never-existed byte-identical", () => {
    // All three resolve to `unresolvable` on the command path: a row belonging
    // to someone else never comes back from the owner-scoped candidate query,
    // and neither does one that is gone. There is no branch that could tell
    // them apart, so there is none that could leak which.
    const foreign = summariseBulk([refused("x", "unresolvable")]);
    const deleted = summariseBulk([refused("y", "unresolvable")]);
    const strip = (value: unknown) => JSON.stringify(value).replace(/"x"|"y"/g, '"id"');
    expect(strip(foreign)).toBe(strip(deleted));
  });
});

describe("2L-BULK-012: undo covers the applied subset and nothing else", () => {
  it("offers undo only for items that were actually applied", () => {
    const summary = summariseBulk([applied("a"), noChange("b"), refused("c")]);
    expect(summary.undoable.map((item) => item.taskId)).toEqual(["a"]);
  });

  it("offers nothing for a run that applied nothing", () => {
    expect(summariseBulk([refused("a"), noChange("b")]).undoable).toEqual([]);
  });

  it("never claims to reverse an item the domain wrote no reversal for", () => {
    // A `no_change` writes no undo row at all (2E-UPDATE-009), so an item with
    // no offer cannot appear here even if its outcome were mislabelled.
    const summary = summariseBulk([{ taskId: "a", outcome: "applied" }]);
    expect(summary.undoable).toEqual([]);
  });
});
