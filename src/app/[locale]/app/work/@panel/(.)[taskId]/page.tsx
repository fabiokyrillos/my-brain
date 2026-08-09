import { notFound } from "next/navigation";

import { TaskDetailSurface } from "@/features/daily-cycle/task-detail-surface";
import { isLocale } from "@/lib/preferences";

/**
 * `2L-EDIT-007` — the task detail, beside the list it was opened from.
 *
 * The interception. `(.)` matches the segment at the same level as the folder
 * holding the slot, so this answers `/app/work/[taskId]` — but **only on a
 * client-side navigation from within `/app/work`**. A shared link, a refresh or
 * any direct load falls through to `work/[taskId]/page.tsx`, which renders the
 * same surface as the whole page.
 *
 * Both routes call `TaskDetailSurface`. There is one data load, one derived
 * control set and one set of injected actions; `panel` selects a frame and a
 * back affordance and nothing else. A viewport cannot change what a user can do
 * here, because there is nothing viewport-shaped to change.
 */
export default async function InterceptedTaskDetailPage({
  params,
}: {
  params: Promise<{ locale: string; taskId: string }>;
}) {
  const { locale: candidate, taskId } = await params;
  if (!isLocale(candidate)) notFound();

  return <TaskDetailSurface locale={candidate} panel taskId={taskId} />;
}
