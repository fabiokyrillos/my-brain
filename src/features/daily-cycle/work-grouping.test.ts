import { describe, expect, it } from "vitest";

import type { WorkItemView } from "./contracts";
import { groupWorkItems } from "./work-grouping";

/**
 * `2L-VIEW-006` — grouping over what the page already loaded.
 *
 * The requirement's three clauses are: group only by attributes the projection
 * already loads, add no unbounded per-user query, and state each group's count.
 * The second is structural — this module is pure and takes an array, so there
 * is no client to reach even if someone wanted one — and the other two are
 * asserted below.
 */

const copy = {
  ungrouped: "Without that relationship",
  priority: { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" },
};

function task(id: string, overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: id,
    title: `Task ${id}`,
    intentionalNoDue: false,
    humanState: "not_started",
    origin: "you",
    availableActions: [],
    projects: [],
    contexts: [],
    people: [],
    waitingOnPeople: [],
    sensitivity: { kind: "undetermined" },
    ...overrides,
  } as WorkItemView;
}

describe("no grouping is one unnamed group", () => {
  it("keeps the page whole and unlabelled", () => {
    const items = [task("a"), task("b")];
    expect(groupWorkItems(items, "none", copy)).toEqual([{ key: "all", label: null, items }]);
  });

  it("gives the surface one shape to render, so two layouts cannot drift", () => {
    // A special case for "ungrouped" is how a surface ends up with two layouts
    // that disagree about spacing, headings and counts.
    const grouped = groupWorkItems([task("a")], "none", copy);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].items).toHaveLength(1);
  });
});

describe("grouping by priority uses the declared order", () => {
  it("orders the groups as the taxonomy declares them, not alphabetically", () => {
    const items = [
      task("a", { priority: "low" }),
      task("b", { priority: "urgent" }),
      task("c", { priority: "high" }),
      task("d", { priority: "medium" }),
    ];

    expect(groupWorkItems(items, "priority", copy).map((group) => group.label))
      .toEqual(["Low", "Medium", "High", "Urgent"]);
  });

  it("collects tasks with no priority under their own group, last", () => {
    const groups = groupWorkItems([task("a"), task("b", { priority: "high" })], "priority", copy);
    expect(groups.map((group) => group.label)).toEqual(["High", copy.ungrouped]);
  });

  it("drops empty groups rather than printing four headings over one task", () => {
    const groups = groupWorkItems([task("a", { priority: "high" })], "priority", copy);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.taskId)).toEqual(["a"]);
  });
});

describe("grouping by a relation repeats a task that genuinely belongs to two", () => {
  const alpha = { id: "p1", label: "Alpha" };
  const beta = { id: "p2", label: "Beta" };

  it("puts a two-project task in both groups", () => {
    // Picking one arbitrarily would make the other group a lie about what it
    // contains. The counts therefore describe *groups*, not a partition — which
    // is why the surface labels each group with its own count and prints no
    // total.
    const groups = groupWorkItems(
      [task("a", { projects: [alpha, beta] }), task("b", { projects: [beta] })],
      "project",
      copy,
    );

    expect(groups.map((group) => group.label)).toEqual(["Alpha", "Beta"]);
    expect(groups[0].items.map((item) => item.taskId)).toEqual(["a"]);
    expect(groups[1].items.map((item) => item.taskId)).toEqual(["a", "b"]);
  });

  it("orders relation groups by their own label", () => {
    const groups = groupWorkItems(
      [task("a", { projects: [beta] }), task("b", { projects: [alpha] })],
      "project",
      copy,
    );
    expect(groups.map((group) => group.label)).toEqual(["Alpha", "Beta"]);
  });

  it("collects tasks with no such relation under their own group", () => {
    const groups = groupWorkItems([task("a"), task("b", { projects: [alpha] })], "project", copy);
    expect(groups.map((group) => group.label)).toEqual(["Alpha", copy.ungrouped]);
    expect(groups[1].items.map((item) => item.taskId)).toEqual(["a"]);
  });

  it("groups contexts by the context relation, not the project one", () => {
    const groups = groupWorkItems(
      [task("a", { projects: [alpha], contexts: [{ id: "c1", label: "Deep work" }] })],
      "context",
      copy,
    );
    expect(groups.map((group) => group.label)).toEqual(["Deep work"]);
  });
});

describe("every group states its own count", () => {
  it("counts the items it holds, and never more", () => {
    const groups = groupWorkItems(
      [task("a", { priority: "high" }), task("b", { priority: "high" }), task("c")],
      "priority",
      copy,
    );
    expect(groups.map((group) => group.items.length)).toEqual([2, 1]);
  });
});
