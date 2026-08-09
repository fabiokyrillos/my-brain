/**
 * `2L-BULK-001…003` — the selection, as a value rather than as component state.
 *
 * ## Why the ceiling is derived from the page size
 *
 * OD-2L-4 signed **50, matching `WORK_PAGE_SIZE`**, and the match is the point:
 * a page that showed sixty rows under a ceiling of fifty would refuse a "select
 * all shown" the user had just performed, which is a bound that contradicts the
 * surface it bounds. Deriving it means the two cannot drift.
 *
 * ## Why a refusal returns the unchanged selection
 *
 * The failure this model exists to prevent is a **silent truncation**: the user
 * selects fifty-one, the surface quietly keeps fifty, and the result reports on
 * a set they never chose. So every operation answers with a status, and a
 * refusal carries the selection exactly as it was — there is no path that
 * partially applies a gesture.
 *
 * `selectAllShown` refuses **whole** for the same reason: taking the first n of
 * a page the user asked for in one gesture is the same truncation wearing a
 * different hat.
 *
 * ## Why deselection is never bounded
 *
 * A ceiling that also blocked removal would strand a user at the bound: their
 * only way to change one item would be to dismiss the whole selection. The
 * bound is on what may enter, never on what may leave.
 */

import { WORK_PAGE_SIZE } from "@/features/daily-cycle/work-page-size";

/** OD-2L-4, derived rather than restated. */
export const SELECTION_CEILING = WORK_PAGE_SIZE;

export type Selection = { readonly ids: ReadonlySet<string> };

export const EMPTY_SELECTION: Selection = { ids: new Set<string>() };

/** Why a selection change was refused. A closed set, each with its own sentence. */
export type SelectionRefusal = "ceiling_reached";

export type SelectionChange =
  | { readonly status: "ok"; readonly selection: Selection }
  | {
      readonly status: "refused";
      readonly reason: SelectionRefusal;
      /** The selection **unchanged**, so a refusal cannot half-apply. */
      readonly selection: Selection;
    };

export function selectionCount(selection: Selection): number {
  return selection.ids.size;
}

export function isSelected(selection: Selection, id: string): boolean {
  return selection.ids.has(id);
}

export function clearSelection(): Selection {
  return EMPTY_SELECTION;
}

export function toggleSelected(selection: Selection, id: string): SelectionChange {
  if (selection.ids.has(id)) {
    const next = new Set(selection.ids);
    next.delete(id);
    return { status: "ok", selection: { ids: next } };
  }
  if (selection.ids.size >= SELECTION_CEILING) {
    return { status: "refused", reason: "ceiling_reached", selection };
  }
  return { status: "ok", selection: { ids: new Set(selection.ids).add(id) } };
}

/**
 * Adds every id the page is currently showing.
 *
 * `2L-BULK-002`: the argument is the page's own ids, so there is no arm of this
 * function that could mean "everything matching the filter" — a set the user
 * did not see cannot be reached from here.
 */
export function selectAllShown(selection: Selection, shown: readonly string[]): SelectionChange {
  const next = new Set(selection.ids);
  for (const id of shown) next.add(id);
  if (next.size > SELECTION_CEILING) {
    return { status: "refused", reason: "ceiling_reached", selection };
  }
  return { status: "ok", selection: { ids: next } };
}
