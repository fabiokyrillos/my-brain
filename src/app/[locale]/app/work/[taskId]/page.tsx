import { notFound } from "next/navigation";
import { loadTaskDetailProjection } from "@/features/daily-cycle/task-detail-projection";
import { TaskDetailView } from "@/features/daily-cycle/task-detail-view";
import { applyWorkItemAction } from "@/features/operations/actions";
import { WorkItemActions } from "@/features/operations/work-item-actions";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";
import { dateBounds, detailControlsFor } from "@/features/task-commands/detail-controls";
import { TaskDetailControls } from "@/features/task-commands/task-detail-controls";
import { loadCandidateRelationOptions } from "@/features/tasks/relation-options";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { getAgentName } from "@/features/profile/agent-identity";

/**
 * The destination `open_task` never had.
 *
 * `contracts.ts` has declared the action and `copy.ts` has localized it since
 * Phase 2X, but no projection produced it and no route could satisfy it
 * (UX-19). Work rows were `<article>` elements with no way in, so a task was
 * something you could act on in four fixed ways and never inspect (UX-05).
 *
 * **Neither slice adds a write path.** The status controls are the very same
 * `applyWorkItemAction` and `TaskList` the Work list already renders, and the
 * field controls Slice D2 added go through `applyTaskDetailCommand`, which
 * resolves through `list_task_command_candidates` and applies through
 * `apply_task_command` exactly as a click on the list does. No SQL, no RPC and
 * no migration exists on either path.
 *
 * Slice D2 closed the second half of UX-05: eleven of the taxonomy's fifteen
 * verbs were reachable only by typing a sentence into the console, and are now
 * controls whose values the action policy bounds.
 */
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale: candidate, taskId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const { supabase, user } = await requireUser(locale);

  const agentName = await getAgentName();

  const detail = await loadTaskDetailProjection(supabase, { taskId, userId: user.id, locale });
  // A task owned by someone else is indistinguishable from one that does not
  // exist, which is the only answer that does not confirm its existence.
  if (!detail) notFound();

  // Derived from the taxonomy against this task's own status, so a control can
  // only be rendered for a transition the command path would also accept
  // (2F-SURFACE-009).
  const controls = detailControlsFor(detail.status);
  // Loaded only when a rendered control actually needs one — a completed task
  // offers `append_note` and nothing relational, and three list queries for a
  // page that will not use them is three round trips for nothing.
  const relations = controls.some((control) => control.relation !== null)
    ? await loadCandidateRelationOptions(supabase, user.id)
    : { projects: [], contexts: [], people: [] };

  return (
    <TaskDetailView agentName={agentName}
      locale={locale}
      detail={detail}
      actions={
        detail.task.availableActions.length ? (
          <div className="task-detail-actions">
            <WorkItemActions action={applyWorkItemAction} locale={locale} task={detail.task} />
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
            dateBounds={dateBounds(new Date())}
            locale={locale}
            relationOptions={{
              project: relations.projects,
              context: relations.contexts,
              person: relations.people,
            }}
            taskId={taskId}
            title={detail.task.title}
          />
        ) : null
      }
    />
  );
}
