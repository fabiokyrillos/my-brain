import { notFound } from "next/navigation";

import { TaskDetailSurface } from "@/features/daily-cycle/task-detail-surface";
import { isLocale } from "@/lib/preferences";

/**
 * The destination `open_task` never had.
 *
 * `contracts.ts` has declared the action and `copy.ts` has localized it since
 * Phase 2X, but no projection produced it and no route could satisfy it
 * (UX-19). Work rows were `<article>` elements with no way in, so a task was
 * something you could act on in four fixed ways and never inspect (UX-05).
 *
 * **No slice on this path adds a write path.** The status controls are the very
 * same `applyWorkItemAction` the Work list renders, and the field controls go
 * through `applyTaskDetailCommand`, which resolves through
 * `list_task_command_candidates` and applies through `apply_task_command`
 * exactly as a click on the list does. No SQL, no RPC and no migration exists
 * on either path.
 *
 * **The body moved to `TaskDetailSurface` in Phase 2L** (`2L-EDIT-007`), so
 * this route and the intercepting one beside it cannot drift into two
 * surfaces. This is the full-screen mount: a shared link, a refresh, or any
 * load that did not come from the list lands here.
 */
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale: candidate, taskId } = await params;
  if (!isLocale(candidate)) notFound();

  return <TaskDetailSurface locale={candidate} taskId={taskId} />;
}
