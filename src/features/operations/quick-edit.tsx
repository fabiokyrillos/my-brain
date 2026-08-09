"use client";

/**
 * `2L-EDIT-001`/`-002` — editing a task without leaving the Work list.
 *
 * ## Why this component is almost empty, and why that is the design
 *
 * The task detail already renders every verb the taxonomy admits, derived from
 * `actionPolicy` against the row's own status, bounded by the policy's
 * `allowedTargetValues`, with the destructive verb behind a server-issued
 * confirmation. Reproducing any of that for the list would be a second copy of
 * eligibility, of value bounds, of the operation-key discipline and of the
 * outcome vocabulary — four things that would then drift.
 *
 * So quick edit is a **frame**, not a control set: a disclosure that mounts
 * `TaskDetailControls`. `2L-EDIT-007`'s "one implementation with one set of
 * controls" is then true of the list too, not only of the two viewports.
 *
 * ## Why a `<details>`
 *
 * A row that showed twelve controls at rest would bury the task under the ways
 * to change it, and on a phone it would be unusable. `<details>` gives the
 * disclosure keyboard operation, an announced expanded/collapsed state and a
 * focusable summary without a line of JavaScript — the alternative is a button
 * plus `aria-expanded` plus state, which is the same thing hand-built and one
 * attribute away from being wrong.
 *
 * The controls are **not derived here**. They arrive already computed from the
 * taxonomy by `detailControlsFor(status)` on the server, which is where the
 * row's real `status` lives — the list's `WorkItemView` carries `humanState`,
 * which is deliberately lossy and could not answer an eligibility question.
 */

import {
  TaskDetailControls,
  type TaskDetailCommandHandler,
  type TaskDetailDateBounds,
  type TaskDetailRelationOptions,
} from "@/features/task-commands/task-detail-controls";
import type { DetailControl } from "@/features/task-commands/detail-controls";
import type { TaskUndoHandler } from "./undo-affordance";
import type { Locale } from "@/lib/preferences";

import { getWorkCopy } from "./copy";

export function QuickEdit({
  action,
  controls,
  dateBounds,
  locale,
  relationOptions,
  taskId,
  title,
  undoAction,
}: {
  action: TaskDetailCommandHandler;
  controls: readonly DetailControl[];
  dateBounds: TaskDetailDateBounds;
  locale: Locale;
  relationOptions: TaskDetailRelationOptions;
  taskId: string;
  /** The rendered title. A resolution query hint only, never a gate. */
  title: string;
  /** `2L-EDIT-008`. A quick edit is reversible exactly as the detail's is. */
  undoAction?: TaskUndoHandler;
}) {
  const copy = getWorkCopy(locale).quickEdit;
  if (controls.length === 0) return null;

  return (
    <details className="work-quick-edit">
      <summary className="work-quick-edit-summary">{copy.summary}</summary>
      <TaskDetailControls
        action={action}
        controls={controls}
        dateBounds={dateBounds}
        locale={locale}
        relationOptions={relationOptions}
        taskId={taskId}
        title={title}
        undoAction={undoAction}
        variant="inline"
      />
    </details>
  );
}
