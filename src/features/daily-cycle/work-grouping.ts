/**
 * `2L-VIEW-006` — grouping, over what the page already loaded.
 *
 * ## The three constraints, and why grouping is where they are easy
 *
 * The requirement is precise: group **only** by attributes the page's own
 * projection already loads, add **no unbounded per-user query**, and state each
 * group's item count. Grouping satisfies all three trivially because it happens
 * *after* the page is read — it re-arranges rows that are already in memory and
 * cannot, by construction, issue a query at all. This module is pure and takes
 * a `WorkItemView[]`; there is no client to reach even if someone wanted one.
 *
 * That is also why grouping — and not ordering — is where "see the urgent ones
 * together" is answered. `manual_priority` is text, so a *database* ordering
 * over it would sort alphabetically; a grouping over it in memory can put the
 * four values in the order the taxonomy declares them.
 *
 * ## Why an item can appear in more than one group
 *
 * A task can belong to two projects. Repeating it under both is the honest
 * rendering — the alternative is picking one arbitrarily, which makes the other
 * project's group a lie about what it contains. The counts therefore describe
 * *groups*, not a partition of the page, and the surface says so by labelling
 * each group with its own count rather than printing a total.
 */

import { workItemPriorities, type WorkItemView } from "./contracts";
import type { WorkGrouping } from "./work-query";

export type WorkGroup = {
  /** Stable across renders; used as the React key and the heading's id. */
  readonly key: string;
  /** What the user reads. A relation's own label, or a priority's word. */
  readonly label: string | null;
  readonly items: readonly WorkItemView[];
};

/**
 * The page, grouped — or one unnamed group when grouping is off.
 *
 * A single group rather than a special case, so the surface has one shape to
 * render and cannot drift into two layouts that disagree about spacing, headings
 * or counts.
 */
export function groupWorkItems(
  items: readonly WorkItemView[],
  grouping: WorkGrouping,
  copy: { readonly ungrouped: string; readonly priority: Record<string, string> },
): readonly WorkGroup[] {
  if (grouping === "none") return [{ key: "all", label: null, items }];

  if (grouping === "priority") {
    // Declared order, not alphabetical and not first-seen: the taxonomy's own
    // sequence is what "by priority" means to a reader.
    const groups: WorkGroup[] = workItemPriorities.map((priority) => ({
      key: `priority:${priority}`,
      label: copy.priority[priority] ?? priority,
      items: items.filter((item) => item.priority === priority),
    }));
    const none = items.filter((item) => item.priority === undefined);
    return [...groups, { key: "priority:none", label: copy.ungrouped, items: none }]
      .filter((group) => group.items.length > 0);
  }

  const relationOf = (item: WorkItemView) =>
    grouping === "project" ? item.projects : item.contexts;

  const labels = new Map<string, string>();
  for (const item of items) {
    for (const relation of relationOf(item)) labels.set(relation.id, relation.label);
  }

  const groups: WorkGroup[] = [...labels.entries()]
    .sort(([, left], [, right]) => left.localeCompare(right))
    .map(([id, label]) => ({
      key: `${grouping}:${id}`,
      label,
      items: items.filter((item) => relationOf(item).some((relation) => relation.id === id)),
    }));

  const without = items.filter((item) => relationOf(item).length === 0);
  return [...groups, { key: `${grouping}:none`, label: copy.ungrouped, items: without }]
    .filter((group) => group.items.length > 0);
}
