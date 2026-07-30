import { notFound } from "next/navigation";
import { loadTaskDetailProjection } from "@/features/daily-cycle/task-detail-projection";
import { TaskDetailView } from "@/features/daily-cycle/task-detail-view";
import { applyWorkItemAction } from "@/features/operations/actions";
import { WorkItemActions } from "@/features/operations/work-item-actions";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";

/**
 * The destination `open_task` never had.
 *
 * `contracts.ts` has declared the action and `copy.ts` has localized it since
 * Phase 2X, but no projection produced it and no route could satisfy it
 * (UX-19). Work rows were `<article>` elements with no way in, so a task was
 * something you could act on in four fixed ways and never inspect (UX-05).
 *
 * **This slice adds no write path.** The status controls are the very same
 * `applyWorkItemAction` and `TaskList` the Work list already renders, so the
 * single row here resolves through `list_task_command_candidates` and applies
 * through `apply_task_command` exactly as a click on the list does. The
 * remaining eleven command verbs stay reachable only through the console until
 * Slice D2 generalises the composer.
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

  const detail = await loadTaskDetailProjection(supabase, { taskId, userId: user.id, locale });
  // A task owned by someone else is indistinguishable from one that does not
  // exist, which is the only answer that does not confirm its existence.
  if (!detail) notFound();

  return (
    <TaskDetailView
      locale={locale}
      detail={detail}
      actions={
        detail.task.availableActions.length ? (
          <div className="task-detail-actions">
            <WorkItemActions action={applyWorkItemAction} locale={locale} task={detail.task} />
          </div>
        ) : null
      }
    />
  );
}
