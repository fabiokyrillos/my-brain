/**
 * The subject a notice is about — recovered from `dedupe_key`, in one place.
 *
 * ## Why this is not a schema change
 *
 * `public.notifications` has eleven columns and none of them names the subject.
 * Slice 2S.2 needs it, because `2S-ACT-001` requires the primary action to be
 * derived from the subject's own state rather than fixed in the component.
 *
 * A column would be a second migration, and Phase 2S's budget is spent — that
 * is the stop condition `ADR-138` exists to make visible. It is not reached,
 * because the link is already there and the database already reads it this way:
 * `run_user_heartbeat` recovers the subject with
 * `split_part(candidate.dedupe_key, ':', 2)` when it counts prior notices about
 * a subject (migration `202608240102`). **This module is that convention read
 * once, not a new one invented here.**
 *
 * ## Shapes, verbatim from the deployed function
 *
 * - `overdue:{task_id}:{local_date}` → `task_overdue`
 * - `stale:{task_id}:{local_date}` → `task_stale`
 * - `reminder:{reminder_id}` → `reminder` (no date: a reminder key is
 *   permanently once-only, which is layer (A) in the acceptance record's table)
 *
 * ## It refuses rather than guesses
 *
 * Every branch that cannot prove what it decoded returns `null`, and a row with
 * no derived subject renders its message verbs and **no task verbs**. That is
 * the safe direction: the alternative is dispatching *Concluir* against an id
 * parsed out of a string that meant something else.
 */

/** The notice types the heartbeat produces, as `notifications.type` spells them. */
export type NoticeType = "task_overdue" | "task_stale" | "reminder";

/** The subject kinds `public.entity_is_owned` already resolves. */
export type SubjectType = "task" | "reminder";

export type NotificationSubject = {
  readonly noticeType: NoticeType;
  readonly subjectType: SubjectType;
  readonly subjectId: string;
};

/**
 * The key prefix each notice type uses, and the segment count its shape has.
 *
 * Held as a table rather than as a chain of `if`s so that the disagreement
 * check below is a lookup: a row whose `type` and whose key prefix describe
 * different notices is refused, because one of the two is wrong and nothing
 * here can tell which.
 */
const SHAPES: Readonly<Record<NoticeType, { readonly prefix: string; readonly segments: number; readonly subjectType: SubjectType }>> = {
  task_overdue: { prefix: "overdue", segments: 3, subjectType: "task" },
  task_stale: { prefix: "stale", segments: 3, subjectType: "task" },
  reminder: { prefix: "reminder", segments: 2, subjectType: "reminder" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNoticeType(value: string): value is NoticeType {
  return value === "task_overdue" || value === "task_stale" || value === "reminder";
}

export function deriveNotificationSubject(
  row: { readonly type: string; readonly dedupe_key: string | null },
): NotificationSubject | null {
  // Nullable by schema. A row without a key has no recoverable subject, which
  // is an absence rather than a defect.
  if (!row.dedupe_key) return null;
  if (!isNoticeType(row.type)) return null;

  const shape = SHAPES[row.type];
  const parts = row.dedupe_key.split(":");
  // Exact, not "at least": a longer key is a shape this module was not told
  // about, and the middle segment of an unknown shape means nothing.
  if (parts.length !== shape.segments) return null;
  if (parts[0] !== shape.prefix) return null;

  const subjectId = parts[1];
  // The whole risk of reading a subject out of a string is acting on what it
  // decodes to, so the decoded value has to look like what it claims to be.
  if (!UUID.test(subjectId)) return null;

  return { noticeType: row.type, subjectType: shape.subjectType, subjectId };
}
