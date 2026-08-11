"use client";

/**
 * `2M-CAL-010` — where the outcome and the undo live on a date-partitioned view.
 *
 * ## The defect this exists because of
 *
 * Slice 2M.1 put the outcome and the undo *inside* the item's disclosure, which
 * is exactly where the requirement asks for them: "offered **where the
 * operation happened**". On a task detail that is enough, because the task is
 * still on the page after it changes. On a calendar it is self-defeating — the
 * successful case is precisely the one where the item **leaves the day being
 * looked at**:
 *
 *   1. the user reschedules 13 Aug → 16 Aug from the 13 Aug column;
 *   2. `applyTaskDetailCommand` revalidates the route;
 *   3. the 13 Aug projection no longer contains the task (nor its derived
 *      reminder, which `apply_task_command` moves with it);
 *   4. the item unmounts, and with it the disclosure, the outcome region and
 *      the undo button — at the instant there is finally something to undo.
 *
 * `e2e/online-calendar.spec.ts` measured this against the deployment: after a
 * successful apply the page read "0 itens neste período" and the named region
 * was nowhere. **No jsdom test could have found it**, because the disappearance
 * is caused by the server re-running its query, which a component test does not
 * do. *An affordance anchored to a row cannot survive an operation that moves
 * the row.*
 *
 * ## The rule
 *
 * The announcement is hoisted to the surface the operation was performed *on* —
 * the calendar — which does not unmount when a day's contents change. The item
 * keeps the controls; it stops keeping the answer. `TaskDetailControls` renders
 * no region of its own here (`renderResult={false}`), so nothing is announced
 * twice, and this component is the only reader of the reported state.
 *
 * The undo affordance is the same `UndoAffordance` the detail and the Work list
 * mount, holding the same `state.undo` token: no second undo path, no second
 * vocabulary, and a token that has already been spent still refuses here for the
 * same reason it refuses there.
 */

import { useEffect, useRef } from "react";

import { UndoAffordance, type TaskUndoHandler } from "@/features/operations/undo-affordance";
import type { TaskDetailCommandState } from "@/features/task-commands/detail-action-state";
import { getTaskDetailControlsCopy } from "@/features/task-commands/detail-controls-copy";
import type { Locale } from "@/lib/preferences";

export function CalendarOutcome({
  locale,
  outcome,
  undoAction,
}: {
  locale: Locale;
  /** The last settled outcome, or null while nothing has been applied. */
  outcome: TaskDetailCommandState | null;
  undoAction?: TaskUndoHandler;
}) {
  const copy = getTaskDetailControlsCopy(locale);
  const region = useRef<HTMLDivElement | null>(null);

  // The same focus move `TaskDetailControls` makes for its own region: a
  // keyboard or screen-reader user is taken to what happened. It matters more
  // here — the control they were operating has just been removed from the page,
  // so focus would otherwise fall back to the document.
  useEffect(() => {
    if (outcome) region.current?.focus();
  }, [outcome]);

  if (!outcome) return null;

  return (
    <div
      aria-label={copy.resultRegionLabel}
      className="work-action-result calendar-outcome"
      ref={region}
      role="region"
      tabIndex={-1}
    >
      <strong>{outcome.heading}</strong>
      <p>{outcome.detail}</p>
      {outcome.reason === null ? null : <p className="task-control-reason">{outcome.reason}</p>}
      {undoAction ? <UndoAffordance action={undoAction} locale={locale} undo={outcome.undo} /> : null}
    </div>
  );
}
