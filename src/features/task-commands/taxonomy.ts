/**
 * The Phase 2E action taxonomy, as data.
 *
 * PRD §11.2 is normative and this module is its executable form. Eligibility
 * and policy live here rather than as conditionals in the matcher, the preview
 * and the RPC, because three copies of "can this action touch this task" is
 * exactly how the review found a verb that could never match: one rule
 * excluded completed tasks from ranking, while the only action targeting them
 * was `reopen_task`.
 *
 * Pure data and pure functions — no I/O, no clock, no Supabase — so the
 * matcher's policy layer stays unit-testable without a database or a model.
 */

/** The eight literals `tasks_status_check` allows (`202607160003:111`). */
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

/** The six statuses that are neither `completed` nor `cancelled`. */
export const NON_TERMINAL_STATUSES = [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "deferred",
] as const;

/** The values `tasks_manual_priority_check` allows. */
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_COMMAND_ACTIONS = [
  "complete_task",
  "reopen_task",
  "set_status",
  "cancel_task",
  "restore_task",
  "rename_task",
  "append_note",
  "reschedule_due",
  "clear_due",
  "set_planned",
  "set_priority",
  "assign_project",
  "assign_context",
  "assign_person",
  "set_waiting_on",
] as const;

export type TaskCommandAction = (typeof TASK_COMMAND_ACTIONS)[number];

/**
 * Bumped whenever any weight, threshold, eligibility rule or allowed value in
 * this module or in the matching policy changes, so a recorded decision stays
 * attributable to the rules that produced it (PRD §10.4).
 */
export const TASK_COMMAND_POLICY_VERSION = "2026-07-25.1";

/** The patch field names a command may carry. */
export const TASK_COMMAND_PATCH_FIELDS = [
  "title",
  "note",
  "status",
  "priority",
  "dueAt",
  "plannedAt",
  "projectRef",
  "contextRef",
  "personRef",
] as const;

export type TaskCommandPatchField = (typeof TASK_COMMAND_PATCH_FIELDS)[number];

export type TaskCommandActionPolicy = {
  /** Statuses a task may hold for this action to be legal against it. */
  readonly eligibleFrom: readonly TaskStatus[];
  /**
   * The closed set this action's target value may take, or null when the value
   * is free text or the action has no enumerable target.
   *
   * Load-bearing: without it, `set_status` with a patched status of
   * `cancelled` would be a non-destructive, one-step, unconfirmed route to the
   * transition `cancel_task` exists to guard.
   */
  readonly allowedTargetValues: readonly string[] | null;
  readonly requiredPatchFields: readonly TaskCommandPatchField[];
  readonly allowedPatchFields: readonly TaskCommandPatchField[];
  readonly destructive: boolean;
  /** Whether an unambiguous match may be presented with a single Apply control. */
  readonly oneStepEligible: boolean;
  readonly requiresConfirmation: boolean;
  readonly reversible: boolean;
  /** Whether applying or undoing this action must reconcile the task's reminders. */
  readonly touchesReminders: boolean;
};

const NEVER_CANCELLED = TASK_STATUSES.filter((status) => status !== "cancelled");
const ACTIVE_ONLY = NON_TERMINAL_STATUSES;

function policy(
  overrides: Partial<TaskCommandActionPolicy> & Pick<TaskCommandActionPolicy, "eligibleFrom">,
): TaskCommandActionPolicy {
  return {
    allowedTargetValues: null,
    requiredPatchFields: [],
    allowedPatchFields: [],
    destructive: false,
    oneStepEligible: true,
    requiresConfirmation: false,
    reversible: true,
    touchesReminders: false,
    ...overrides,
  };
}

const POLICIES: Record<TaskCommandAction, TaskCommandActionPolicy> = {
  complete_task: policy({ eligibleFrom: ACTIVE_ONLY, touchesReminders: true }),
  reopen_task: policy({ eligibleFrom: ["completed"], touchesReminders: true }),
  set_status: policy({
    eligibleFrom: ACTIVE_ONLY,
    allowedTargetValues: ACTIVE_ONLY,
    requiredPatchFields: ["status"],
    allowedPatchFields: ["status"],
  }),
  cancel_task: policy({
    eligibleFrom: ACTIVE_ONLY,
    destructive: true,
    oneStepEligible: false,
    requiresConfirmation: true,
    touchesReminders: true,
  }),
  // Cancellation would otherwise be terminal once the 24h undo window closes:
  // re-confirmation of the originating candidate is gated by the
  // entry_task_candidate_resolutions ledger, not by the relaxed unique index.
  // Not one-step, because undoing a deliberate cancellation deserves the same
  // deliberateness as the cancellation.
  restore_task: policy({
    eligibleFrom: ["cancelled"],
    oneStepEligible: false,
    touchesReminders: true,
  }),
  rename_task: policy({
    eligibleFrom: NEVER_CANCELLED,
    requiredPatchFields: ["title"],
    allowedPatchFields: ["title"],
  }),
  // Recording a fact about finished work is truthful, so this is the one action
  // a completed task admits.
  append_note: policy({
    eligibleFrom: NEVER_CANCELLED,
    requiredPatchFields: ["note"],
    allowedPatchFields: ["note"],
  }),
  reschedule_due: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["dueAt"],
    allowedPatchFields: ["dueAt"],
    touchesReminders: true,
  }),
  clear_due: policy({ eligibleFrom: ACTIVE_ONLY, touchesReminders: true }),
  set_planned: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["plannedAt"],
    allowedPatchFields: ["plannedAt"],
  }),
  set_priority: policy({
    eligibleFrom: ACTIVE_ONLY,
    allowedTargetValues: TASK_PRIORITIES,
    requiredPatchFields: ["priority"],
    allowedPatchFields: ["priority"],
  }),
  assign_project: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["projectRef"],
    allowedPatchFields: ["projectRef"],
  }),
  assign_context: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["contextRef"],
    allowedPatchFields: ["contextRef"],
  }),
  assign_person: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["personRef"],
    allowedPatchFields: ["personRef"],
  }),
  set_waiting_on: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["personRef"],
    allowedPatchFields: ["personRef"],
  }),
};

export function isTaskCommandAction(value: unknown): value is TaskCommandAction {
  return typeof value === "string" && (TASK_COMMAND_ACTIONS as readonly string[]).includes(value);
}

export function actionPolicy(action: TaskCommandAction): TaskCommandActionPolicy {
  return POLICIES[action];
}

/** Whether `action` is legal against a task currently in `status`. */
export function isEligibleStatus(action: TaskCommandAction, status: string): boolean {
  return (actionPolicy(action).eligibleFrom as readonly string[]).includes(status);
}

/**
 * Whether `value` is an allowed target for `action`.
 *
 * An action with no enumerable target accepts anything here; its bounds are
 * enforced by the command schema instead.
 */
export function isAllowedTargetValue(action: TaskCommandAction, value: string): boolean {
  const allowed = actionPolicy(action).allowedTargetValues;
  return allowed === null || allowed.includes(value);
}
