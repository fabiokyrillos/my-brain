"use client";

/**
 * `2M-CAL-009`/`-010` — rescheduling **from** the calendar, without leaving it.
 *
 * ## Why this component is almost empty, and why that is the whole point
 *
 * `2M-CAL-009` says the reuse in its own words: *"no Server Action, RPC, table or
 * column is added for it, and a guard fails the build if a second task-mutation
 * write path appears"*. So this file adds none of those. It is a **frame**:
 *
 *  - the controls arrive already derived, from `schedulingControlsFor(status)`
 *    over `detailControlsFor(status)` over `actionPolicy` — the calendar decides
 *    nothing about eligibility;
 *  - the submit path is `applyTaskDetailCommand`, the Server Action the task
 *    detail and the Work list already use, which resolves through
 *    `list_task_command_candidates` and applies through `apply_task_command`;
 *  - the operation key, the request fingerprint, the twelve-column staleness
 *    gate, the server-issued confirmation, the audit row and the registered undo
 *    are all inherited, because they live below that action and this component
 *    cannot reach past it;
 *  - undo is `undoWorkOperation`, offered **where the operation happened**
 *    (`2M-CAL-010`, `2M-MOBILE-004`) — on the calendar, rather than on a surface
 *    the user would have to navigate to. Not inside *this* disclosure, though it
 *    was at first: the deployment journey showed that a successful reschedule
 *    moves the task off the day being viewed, so the revalidated calendar
 *    unmounts this component and takes the undo with it at the exact moment
 *    there is something to undo. The outcome is therefore reported upward and
 *    rendered by `CalendarOutcome`, which the day's contents cannot unmount.
 *
 * This is `quick-edit.tsx` one surface over, deliberately identical in shape:
 * `2L-EDIT-007`'s *"one implementation with one set of controls"* becomes true of
 * the calendar too, rather than nearly true.
 *
 * ## Why a `<details>`
 *
 * A calendar cell that showed three date controls at rest would bury the item
 * under the ways to move it, and on a 375 px column it would be unusable.
 * `<details>` gives keyboard operation, an announced expanded/collapsed state and
 * a focusable summary with no JavaScript — and it is a **visible, labelled
 * control**, which is what OD-2M-6 A signed and `2M-MOBILE-003` guards. There is
 * no gesture here and none can be added: the no-gesture guard names this file.
 *
 * ## What it gained without being edited
 *
 * **Clearing a planned day.** This paragraph used to record an absence:
 * `clear_planned` did not exist, `set_planned` had no counterpart, the
 * derivation found nothing to render and the surface offered nothing — with the
 * note that "when it lands this component gains the control without a line
 * changing". Slice 2M.2 landed it (`2M-PLAN-002`, funded by ADR-106), and **not
 * a line of this file changed**. The control is here because
 * `schedulingControlsFor` asks the taxonomy which actions declare a scheduling
 * column, and the new verb declares `planned_at`. A hand-written list of three
 * verbs would have needed an edit, and would not have got one.
 */

import {
  TaskDetailControls,
  type TaskDetailCommandHandler,
  type TaskDetailDateBounds,
  type TaskDetailRelationOptions,
} from "@/features/task-commands/task-detail-controls";
import type { Locale } from "@/lib/preferences";

import type { CalendarRescheduleTarget } from "./calendar-contracts";
import { getCalendarCopy } from "./copy";

/**
 * No relation control can reach this surface, so there is nothing to populate.
 *
 * Not an omission and not a stub: `schedulingControlsFor` admits only actions
 * whose declared effect touches `due_at` or `planned_at`, and no such action
 * carries a `projectRef`, `contextRef` or `personRef`. Passing empty arrays is
 * therefore the *accurate* value, and the three list queries the task detail
 * makes are three round trips this surface genuinely does not need.
 *
 * Frozen so a future edit cannot fill it in and quietly widen what the calendar
 * can change.
 */
const NO_RELATIONS: TaskDetailRelationOptions = Object.freeze({
  project: Object.freeze([]),
  context: Object.freeze([]),
  person: Object.freeze([]),
});

export function CalendarReschedule({
  action,
  dateBounds,
  locale,
  target,
  title,
}: {
  action: TaskDetailCommandHandler;
  dateBounds: TaskDetailDateBounds;
  locale: Locale;
  target: CalendarRescheduleTarget;
  /**
   * The task's title, forwarded to the command path as a resolution query hint
   * exactly as the detail and the Work list forward it — **never a gate**, and
   * never rendered by this component. A masked item's title is withheld from the
   * *reader* by `ProtectedContent`; the server already knows it, so sending it
   * discloses nothing that the caller's own session does not already own.
   */
  title: string;
}) {
  const copy = getCalendarCopy(locale).reschedule;

  // A status admitting no scheduling verb yields `null` upstream, so this is the
  // belt to that braces — and it is stated rather than rendered as an empty
  // disclosure the user can only open onto nothing.
  if (target.controls.length === 0) {
    return <p className="calendar-reschedule-unavailable">{copy.unavailable}</p>;
  }

  return (
    <details className="calendar-reschedule">
      <summary className="calendar-reschedule-summary">{copy.summary}</summary>
      <p className="quiet-state calendar-reschedule-hint">{copy.hint}</p>
      <TaskDetailControls
        action={action}
        controls={target.controls}
        dateBounds={dateBounds}
        locale={locale}
        relationOptions={NO_RELATIONS}
        renderResult={false}
        taskId={target.taskId}
        title={title}
        variant="inline"
      />
    </details>
  );
}
