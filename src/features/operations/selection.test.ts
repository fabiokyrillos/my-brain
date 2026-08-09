import { describe, expect, it } from "vitest";

import { WORK_PAGE_SIZE } from "@/features/daily-cycle/work-page-size";
import {
  SELECTION_CEILING,
  EMPTY_SELECTION,
  clearSelection,
  selectAllShown,
  selectionCount,
  toggleSelected,
  isSelected,
} from "./selection";

/**
 * `2L-BULK-001…003` — the selection model.
 *
 * Pure, because everything interesting about a selection is a rule rather than
 * a rendering: what may enter it, what the bound is, and what happens at the
 * bound. A model that lived in a component would have those rules asserted only
 * through clicks.
 */

const ids = (n: number) => Array.from({ length: n }, (_, index) => `task-${index}`);

describe("2L-BULK-003: the ceiling is 50, and it is the page size", () => {
  it("is the signed value, and it is not a second copy of it", () => {
    // OD-2L-4 signed **50, matching `WORK_PAGE_SIZE`**. Deriving it from the
    // page size is what stops the two drifting: a page that showed 60 rows with
    // a ceiling of 50 would refuse a "select all shown" the user just performed.
    expect(SELECTION_CEILING).toBe(WORK_PAGE_SIZE);
    expect(SELECTION_CEILING).toBe(50);
  });
});

describe("2L-BULK-001/002: selection is explicit, visible and dismissible", () => {
  it("starts empty and counts what it holds", () => {
    expect(selectionCount(EMPTY_SELECTION)).toBe(0);
    expect(isSelected(EMPTY_SELECTION, "task-1")).toBe(false);
  });

  it("adds and removes one item at a time", () => {
    const one = toggleSelected(EMPTY_SELECTION, "task-1");
    expect(one.status).toBe("ok");
    expect(selectionCount(one.selection)).toBe(1);
    expect(isSelected(one.selection, "task-1")).toBe(true);

    const none = toggleSelected(one.selection, "task-1");
    expect(selectionCount(none.selection)).toBe(0);
  });

  it("is dismissible without applying anything", () => {
    const two = toggleSelected(toggleSelected(EMPTY_SELECTION, "a").selection, "b");
    expect(selectionCount(clearSelection())).toBe(0);
    expect(selectionCount(two.selection)).toBe(2);
  });

  it("selects only what was shown, never a set the user did not see", () => {
    // `2L-BULK-002`. "Select all shown" takes the page's own ids as its
    // argument; there is no arm that could mean "everything matching".
    const page = ids(7);
    const all = selectAllShown(EMPTY_SELECTION, page);
    expect(all.status).toBe("ok");
    expect(selectionCount(all.selection)).toBe(7);
    for (const id of page) expect(isSelected(all.selection, id)).toBe(true);
  });

  it("does not double-count an id already selected", () => {
    const one = toggleSelected(EMPTY_SELECTION, "task-0");
    const all = selectAllShown(one.selection, ids(3));
    expect(selectionCount(all.selection)).toBe(3);
  });
});

describe("2L-BULK-003: the bound refuses, and never truncates", () => {
  function full() {
    let selection = EMPTY_SELECTION;
    for (const id of ids(SELECTION_CEILING)) {
      selection = toggleSelected(selection, id).selection;
    }
    return selection;
  }

  it("accepts exactly the ceiling", () => {
    expect(selectionCount(full())).toBe(SELECTION_CEILING);
  });

  it("refuses the item past the ceiling with a stated reason, and changes nothing", () => {
    // The failure this is written against is a silent truncation: a user selects
    // 51, the surface keeps 50, and the result reports on a set they never
    // chose. The refusal returns the *unchanged* selection.
    const at = full();
    const over = toggleSelected(at, "one-too-many");
    expect(over.status).toBe("refused");
    if (over.status !== "refused") throw new Error("unreachable");
    expect(over.reason).toBe("ceiling_reached");
    expect(selectionCount(over.selection)).toBe(SELECTION_CEILING);
    expect(isSelected(over.selection, "one-too-many")).toBe(false);
  });

  it("refuses a `select all shown` that would exceed the ceiling, whole", () => {
    // Whole, not partially: taking the first n of a page the user asked for in
    // one gesture is the same silent truncation wearing a different hat.
    const partial = toggleSelected(EMPTY_SELECTION, "already").selection;
    const over = selectAllShown(partial, ids(SELECTION_CEILING));
    expect(over.status).toBe("refused");
    if (over.status !== "refused") throw new Error("unreachable");
    expect(over.reason).toBe("ceiling_reached");
    expect(selectionCount(over.selection)).toBe(1);
  });

  it("still allows deselecting at the ceiling", () => {
    // A bound that also blocked removal would strand the user: they would have
    // to dismiss the whole selection to change one item.
    const at = full();
    const removed = toggleSelected(at, "task-0");
    expect(removed.status).toBe("ok");
    expect(selectionCount(removed.selection)).toBe(SELECTION_CEILING - 1);
  });

  it("does not mutate the selection it is given", () => {
    const one = toggleSelected(EMPTY_SELECTION, "a").selection;
    toggleSelected(one, "b");
    expect(selectionCount(one)).toBe(1);
  });
});
