import "server-only";

/**
 * `2L-EDIT-007` — the task detail, as **one** implementation.
 *
 * ## What this file is for
 *
 * The task detail is reachable two ways: as its own route
 * (`/app/work/[taskId]`) and as a panel beside the Work list, through the
 * intercepting route in `work/@panel/(.)[taskId]`. The requirement is not that
 * the two look alike — it is that there are not two of them. So the whole
 * surface, including the data load, the derived control set, the relation
 * options and every injected action, lives here, and both routes are four lines
 * that call it.
 *
 * A viewport does not change the control set, because a viewport cannot: there
 * is one control set and it is built here. What changes is the frame, and the
 * frame is CSS.
 *
 * ## Why the relation options are still conditional
 *
 * Unchanged from the route this was extracted from: a completed task offers
 * `append_note` and nothing relational, and three list queries for a page that
 * will not use them is three round trips for nothing.
 */

import { getAgentName } from "@/features/profile/agent-identity";
import { applyWorkItemAction } from "@/features/operations/actions";
import { WorkItemActions } from "@/features/operations/work-item-actions";
import { undoWorkOperation } from "@/features/task-commands/actions";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";
import { dateBounds, detailControlsFor } from "@/features/task-commands/detail-controls";
import { TaskDetailControls } from "@/features/task-commands/task-detail-controls";
import { loadCandidateRelationOptions } from "@/features/tasks/relation-options";
import { UniversalStateView } from "@/features/experience/universal-state";
import { requireUser } from "@/lib/auth/require-user";
import type { Locale } from "@/lib/preferences";

import { getMissingTaskCopy } from "./copy";
import { resolveTaskBackTarget } from "./task-return";
import { loadTaskDetailProjection } from "./task-detail-projection";
import { TaskDetailView } from "./task-detail-view";

export async function TaskDetailSurface({
  locale,
  taskId,
  /**
   * Whether this mount is the panel beside the list.
   *
   * It selects a frame and a back affordance and nothing else — no control, no
   * query, no eligibility. If it ever selected more, the two mounts would have
   * become two surfaces again, which is precisely what `2L-EDIT-007` forbids.
   */
  panel = false,
  from,
}: {
  locale: Locale;
  taskId: string;
  panel?: boolean;
  /**
   * `2L-RETURN-001`. The serialized position the user came from, straight off
   * the URL and still untrusted — `parseWorkPosition` is the gate, and it
   * refuses anything carrying a field that could authorize.
   */
  from?: string | string[];
}) {
  const { supabase, user } = await requireUser(locale);
  const agentName = await getAgentName();

  const detail = await loadTaskDetailProjection(supabase, { taskId, userId: user.id, locale });
  // A task owned by someone else is indistinguishable from one that does not
  // exist, which is the only answer that does not confirm its existence.
  //
  // `2S-REACH-004`. This used to be `notFound()`, and the property above is the
  // reason it is not simply deleted: the replacement returns the SAME thing in
  // both cases, so nothing is disclosed that the 404 kept back. What changes is
  // that the reader is no longer at a dead end.
  //
  // It stopped being hypothetical at slice 2S.0: three `task_overdue` notices
  // in the deployed database name subjects that no longer exist. They were
  // harmless while every notice pointed at the Work list, and slice 2S.1 points
  // a notice at its subject — so the fallback ships in the same change that
  // creates the need for it rather than after it.
  if (!detail) {
    const missing = getMissingTaskCopy(locale);
    return (
      <UniversalStateView
        actionHref={`/${locale}/app/work`}
        actionLabel={missing.action}
        description={missing.description}
        locale={locale}
        state="empty"
        title={missing.title}
        titleAs={panel ? "p" : "h1"}
      />
    );
  }

  // `2M-CAL-008`. One parameter, two vocabularies, one decision — extracted so
  // it is testable without an authenticated request. See `task-return.ts`.
  const back = resolveTaskBackTarget(locale, from);

  // Derived from the taxonomy against this task's own status, so a control can
  // only be rendered for a transition the command path would also accept
  // (2F-SURFACE-009).
  const controls = detailControlsFor(detail.status);
  const relations = controls.some((control) => control.relation !== null)
    ? await loadCandidateRelationOptions(supabase, user.id)
    : { projects: [], contexts: [], people: [] };

  return (
    <TaskDetailView
      agentName={agentName}
      locale={locale}
      detail={detail}
      panel={panel}
      backHref={back.href}
      backDestination={back.destination}
      actions={
        detail.task.availableActions.length ? (
          <div className="task-detail-actions">
            <WorkItemActions
              action={applyWorkItemAction}
              locale={locale}
              task={detail.task}
              undoAction={undoWorkOperation}
            />
          </div>
        ) : null
      }
      controls={
        controls.length ? (
          <TaskDetailControls
            action={applyTaskDetailCommand}
            controls={controls}
            // Computed on the server against the request's own instant, so the
            // picker's bounds are one value rather than two that could disagree
            // across hydration.
            dateBounds={dateBounds(new Date(), detail.timezone)}
            locale={locale}
            relationOptions={{
              project: relations.projects,
              context: relations.contexts,
              person: relations.people,
            }}
            taskId={taskId}
            title={detail.task.title}
            undoAction={undoWorkOperation}
          />
        ) : null
      }
    />
  );
}
