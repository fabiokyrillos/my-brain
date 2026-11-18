/**
 * A task that is already a notice on Hoje is not listed again below it.
 *
 * ## What the owner saw
 *
 * One task, three times on one screen: as an overdue notice in *Precisa de
 * você*, as a reminder notice, and again under *Hoje e atrasado*. `2J-HOJE-004`
 * already removes from the day's list whatever the priority group shows, for
 * the reason it gives — a second copy carries less information than the first.
 * This is the same rule one level up: the notice row is the copy that carries
 * the verb (*Concluir tarefa*), so it is the one that stays.
 *
 * ## What counts as "already a notice"
 *
 * Only a notice whose subject **is a task and resolved**:
 *
 * - `subject.subjectType === "task"` — a reminder notice is about a reminder,
 *   which is a different row with a different id, even when the reminder was
 *   set for that task. Nothing here tries to join the two; merging notices is
 *   `oneRowPerSubject`'s business, upstream, and it keys on the same subject.
 * - `subjectStatus !== null` — `projectNotificationRows` leaves the status
 *   `null` when the id parsed out of `dedupe_key` matched no task of this
 *   owner's. Such a row renders no task verb, so hiding a task on its word
 *   would remove the task from the page and leave nothing that can act on it.
 *
 * And only the notices the caller passes. Hoje shows a bounded number of them;
 * a notice that exists but is not on the page hides nothing.
 */

import type { NotificationRowView } from "@/features/notifications/row-projection";

type NoticeSubjectView = Pick<NotificationRowView, "subject" | "subjectStatus">;

/** The ids of the tasks the given notice rows are about. */
export function noticedTaskIds(notices: readonly NoticeSubjectView[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const notice of notices) {
    if (notice.subject?.subjectType !== "task") continue;
    if (notice.subjectStatus === null) continue;
    ids.add(notice.subject.subjectId);
  }
  return ids;
}

/**
 * `tasks` without the ones a rendered notice is already about, order preserved.
 *
 * Applied to the day's projection **before** `selectTodayPriorities` takes its
 * top three, so a promoted slot a noticed task would have held goes to the next
 * task that qualifies instead of staying empty.
 */
export function withoutNoticedTasks<T extends { readonly taskId: string }>(
  tasks: readonly T[],
  notices: readonly NoticeSubjectView[],
): readonly T[] {
  const noticed = noticedTaskIds(notices);
  if (noticed.size === 0) return tasks;
  return tasks.filter((task) => !noticed.has(task.taskId));
}
