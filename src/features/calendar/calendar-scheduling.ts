/**
 * `2M-CAL-009` — which controls a calendar item may offer, **derived** from the
 * taxonomy rather than listed here.
 *
 * ## Why this file is four lines of logic and thirty of reasoning
 *
 * The calendar's job is rescheduling, so it must not offer the eleven other
 * verbs a task admits — a grid cell has no room for them and the requirement is
 * about moving a date, not about editing a task. The obvious implementation is a
 * list: `["reschedule_due", "clear_due", "set_planned"]`. That list would be a
 * **second copy of taxonomy knowledge**, and this repository has paid for that
 * shape more than once — `detail-controls.ts`'s own header names it, and
 * `202608080087` and `202608090089` were both a duplicated vocabulary drifting
 * out from under the thing that read it.
 *
 * So the subset is derived from a property the taxonomy already declares: an
 * action is a **scheduling** action when its policy's `changedFields` touch one
 * of the task's two scheduling columns. Nothing here names a verb.
 *
 * Two consequences worth stating, because they are the reason to prefer this:
 *
 *  - **`clear_planned` will appear here the day slice 2M.2 adds it**, without a
 *    line changing, because its policy will necessarily declare `planned_at`.
 *    Until then the calendar cannot clear a planned day, and the acceptance
 *    record says so rather than the surface pretending otherwise
 *    (`2M-PLAN-002`).
 *  - **A verb that stops touching a date stops appearing.** A list would keep
 *    offering it.
 *
 * ## Eligibility is not re-decided here
 *
 * `detailControlsFor(status)` is the authority and is called first; this only
 * narrows what it returned. A control this function lets through has already
 * been proved eligible against the task's real status by the same predicate
 * `resolveDetailCommand` re-checks before applying, so the calendar cannot
 * render a button whose only possible outcome is a refusal (2F-SURFACE-009).
 */

import {
  detailControlsFor,
  type DetailControl,
} from "@/features/task-commands/detail-controls";
import { actionPolicy, type TaskChangedField } from "@/features/task-commands/taxonomy";

/**
 * The task columns a calendar is *about*.
 *
 * `due_at` is `2M-CAL-002`'s deadline lane and `planned_at` is its intention
 * lane, which is the whole of what this surface places on a day. `reminders` is
 * deliberately absent: `reschedule_due` declares it as a linked effect, and
 * treating it as a scheduling column would pull in every verb that cancels a
 * reminder as a side effect — including `complete_task`, which is not a
 * rescheduling control by any reading.
 */
export const CALENDAR_SCHEDULING_FIELDS: readonly TaskChangedField[] = ["due_at", "planned_at"];

/** Whether this action's declared effect touches a date the calendar renders. */
export function isSchedulingAction(control: DetailControl): boolean {
  return actionPolicy(control.action).changedFields
    .some((field) => CALENDAR_SCHEDULING_FIELDS.includes(field));
}

/**
 * Every scheduling control the task's current status admits.
 *
 * Empty is an ordinary answer: a task whose status admits no scheduling verb
 * offers no control, and the item still renders and still links to its detail.
 * An empty disclosure would be a control the user can only fail to use.
 */
export function schedulingControlsFor(status: string): readonly DetailControl[] {
  return detailControlsFor(status).filter(isSchedulingAction);
}
