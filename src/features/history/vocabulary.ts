/**
 * Every value `audit_logs` can put in front of a reader, as closed typed sets.
 *
 * ## Why these are enumerated rather than prettified
 *
 * The History page used to render `action_type.replaceAll("_", " ")` beside the
 * raw `actor` and `entity_type` — the exact defect UX-21 names. Prettifying a
 * database token does not make it readable; it makes it a database token with
 * spaces in it. So the three vocabularies are closed sets here, each locale
 * gives every member a sentence in `copy.ts`, and an unrecognised value takes a
 * neutral fallback instead of being printed.
 *
 * ## Where the lists come from
 *
 * `ACTORS` is the column's own `check (actor in ('user','agent','system'))`
 * (`202607160003:134`) — genuinely closed at the database.
 *
 * `ENTITY_TYPES` and `ACTION_TYPES` are **not** constrained by the schema; both
 * columns are bare `text`. They were read off every writer that exists: 87
 * `insert into public.audit_logs` statements across the migrations, plus the
 * four TypeScript writers (`chat/actions.ts`, `entities/actions.ts` ×2,
 * `memories/actions.ts`). `vocabulary.test.ts` re-derives both from the
 * migrations on every run and fails if a writer appears that has no copy, which
 * is the same guard `task-detail-view.test.tsx` already applies to the task
 * subset — extended here to all nine entity types.
 */

/** Who caused the change. The column's own check constraint, unchanged. */
export const HISTORY_ACTORS = ["user", "agent", "system"] as const;
export type HistoryActor = (typeof HISTORY_ACTORS)[number];

/** What kind of object the change was about. */
export const HISTORY_ENTITY_TYPES = [
  "task",
  "entry",
  "entry_interpretation",
  "entry_task_candidate_resolution",
  "pending_question",
  "conversation",
  "project",
  "person",
  "memory",
  // Slice G5: `apply_reminder_command_v1` is the first writer to record
  // `entity_type = 'reminder'`. `audit_logs.entity_type` carries no CHECK
  // (`202607160003:132`), so nothing in the database gated this — the surface
  // would simply have rendered the fallback until it was listed here.
  "reminder",
] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

/**
 * Every `action_type` any shipped writer records.
 *
 * The `_v1`/`_v2`/`_v3`/`_v5`/`_v6` suffixes are real: superseded RPCs stay
 * readable because `audit_logs` is append-only, so rows written by an older
 * version are still in the table and still have to render as something.
 */
export const HISTORY_ACTION_TYPES = [
  "archive_memory",
  "chat_answered",
  "confirm_entry_task_candidates_v5",
  "confirm_entry_task_candidates_v6",
  "create_memory",
  "entry_interpretation_corrected",
  "entry_interpretation_correction_undone",
  "entry_interpretation_failed",
  "entry_interpreted",
  "entry_processing_enqueued",
  "entry_reprocessed",
  "entry_reprocessing_enqueued",
  "entry_reprocessing_failed",
  "operation_undone",
  "question_consequence_confirmed",
  // Slice G5 — the five owner-initiated reminder transitions plus the
  // compensation the registered undo handler writes. Named per command rather
  // than one `reminder_updated`, because "you cancelled it" and "you postponed
  // it" are different facts to read back a month later.
  "reminder_cancelled",
  "reminder_command_undone",
  "reminder_edited",
  "reminder_rescheduled",
  "reminder_restored",
  "reminder_snoozed",
  "resolve_pending_question_v1",
  "resolve_pending_question_v2",
  "resolve_pending_question_v3",
  "restore_memory",
  "task_command_applied",
  "task_command_created",
  "task_created",
  "task_updated",
  "tasks_confirmed",
  "update_memory",
  "update_person",
  "update_project",
] as const;
export type HistoryActionType = (typeof HISTORY_ACTION_TYPES)[number];

/**
 * The filter's coarse grouping, because 27 action types is not a usable menu.
 *
 * Each category answers "what kind of thing happened", which is the question
 * someone scanning their own history actually asks. The map below is exhaustive
 * over `HistoryActionType` by construction — adding a member to that union
 * without adding it here is a compile error.
 */
export const HISTORY_CATEGORIES = [
  "created",
  "changed",
  "lifecycle",
  "interpreted",
  "answered",
  "undone",
  "failed",
] as const;
export type HistoryCategory = (typeof HISTORY_CATEGORIES)[number];

export const HISTORY_ACTION_CATEGORY: Readonly<Record<HistoryActionType, HistoryCategory>> = {
  archive_memory: "lifecycle",
  chat_answered: "answered",
  confirm_entry_task_candidates_v5: "created",
  confirm_entry_task_candidates_v6: "created",
  create_memory: "created",
  entry_interpretation_corrected: "changed",
  entry_interpretation_correction_undone: "undone",
  entry_interpretation_failed: "failed",
  entry_interpreted: "interpreted",
  entry_processing_enqueued: "interpreted",
  entry_reprocessed: "interpreted",
  entry_reprocessing_enqueued: "interpreted",
  entry_reprocessing_failed: "failed",
  operation_undone: "undone",
  question_consequence_confirmed: "answered",
  // Cancel and restore end or resume a delivery, which is `lifecycle`; snooze,
  // reschedule and edit move an attribute of a reminder that stays live, which
  // is `changed`.
  reminder_cancelled: "lifecycle",
  reminder_command_undone: "undone",
  reminder_edited: "changed",
  reminder_rescheduled: "changed",
  reminder_restored: "lifecycle",
  reminder_snoozed: "changed",
  resolve_pending_question_v1: "answered",
  resolve_pending_question_v2: "answered",
  resolve_pending_question_v3: "answered",
  restore_memory: "lifecycle",
  task_command_applied: "changed",
  task_command_created: "created",
  task_created: "created",
  task_updated: "changed",
  tasks_confirmed: "created",
  update_memory: "changed",
  update_person: "changed",
  update_project: "changed",
};

/** The action types one category covers, for the `in` predicate the filter builds. */
export function actionTypesInCategory(category: HistoryCategory): readonly HistoryActionType[] {
  return HISTORY_ACTION_TYPES.filter((action) => HISTORY_ACTION_CATEGORY[action] === category);
}

/**
 * `actor` narrowed, with an unrecognised value becoming `system`.
 *
 * The check constraint makes this total in practice. It stays defensive anyway
 * because "who changed this" is the field where a leaked internal token would
 * be least acceptable, and a fallback costs nothing.
 */
export function asHistoryActor(value: unknown): HistoryActor {
  return HISTORY_ACTORS.includes(value as HistoryActor) ? (value as HistoryActor) : "system";
}

/** `entity_type` narrowed, or null when no writer in this build produces it. */
export function asHistoryEntityType(value: unknown): HistoryEntityType | null {
  return HISTORY_ENTITY_TYPES.includes(value as HistoryEntityType)
    ? (value as HistoryEntityType)
    : null;
}

/** `action_type` narrowed, or null — the caller renders the neutral sentence. */
export function asHistoryActionType(value: unknown): HistoryActionType | null {
  return HISTORY_ACTION_TYPES.includes(value as HistoryActionType)
    ? (value as HistoryActionType)
    : null;
}

/** `HistoryCategory` narrowed, for the URL parameter. */
export function asHistoryCategory(value: unknown): HistoryCategory | null {
  return HISTORY_CATEGORIES.includes(value as HistoryCategory) ? (value as HistoryCategory) : null;
}

/**
 * The task field vocabularies that appear inside `before_state`/`after_state`.
 *
 * `audit_task_change` writes `status` and `priority` as raw column values into
 * its jsonb payloads, so describing a change concretely means rendering those
 * too — and they are database enums exactly like the ones above (UX-21).
 */
export const TASK_STATUSES = [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "deferred",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * `projects.status`, which shares only `completed` with `tasks.status`.
 *
 * Both are called `status` and both arrive inside an `after_state`, so the
 * describer picks the vocabulary from the row's `entity_type` rather than from
 * the field name. Guessing would render a paused project as a task state.
 */
export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function asTaskStatus(value: unknown): TaskStatus | null {
  return TASK_STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : null;
}

export function asProjectStatus(value: unknown): ProjectStatus | null {
  return PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : null;
}

export function asTaskPriority(value: unknown): TaskPriority | null {
  return TASK_PRIORITIES.includes(value as TaskPriority) ? (value as TaskPriority) : null;
}
