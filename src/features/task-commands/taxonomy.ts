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
 * The reasons the model may report instead of a proposal.
 *
 * PRD 2E-COMMAND-007 requires each refusal to carry *its own* code rather than
 * a shared "unsupported": "push the two invoice tasks to next week" and "remind
 * me every Monday" are refused for different reasons, and a user told only
 * "unsupported" learns nothing about which part of the sentence to change.
 *
 * The schema makes a *second action* unrepresentable — there is exactly one
 * `action` field — so classifying is the model's only way to describe one.
 * Multiple targets are different and weaker: a two-target sentence is
 * representable as a one-target proposal, so `multiple_targets` is a reported
 * judgement rather than a structural guarantee, and the deterministic backstop
 * is the matcher's own ambiguity rule (2E-MATCH-011), not this enum.
 */
export const TASK_COMMAND_MODEL_UNSUPPORTED_REASONS = [
  /** The verb is not one of the fifteen. */
  "unsupported_action",
  /** Two or more distinct actions in one sentence. */
  "multiple_actions",
  /** More than one task addressed; Phase 2E targets exactly one (PRD §5). */
  "multiple_targets",
  /** Gmail, Calendar, Slack, WhatsApp, push — none exist (PRD §5). */
  "integration_requested",
  /** Recurrence has no model in this domain; Phase 2F (PRD 2E-NOMATCH-009). */
  "recurrence_requested",
  /** Retroactive placement or review invalidation; Phase 2F. */
  "retroactive_requested",
  /** The text asks for something that is not an operation on a task at all. */
  "not_a_task_command",
] as const;

export type TaskCommandModelUnsupportedReason =
  (typeof TASK_COMMAND_MODEL_UNSUPPORTED_REASONS)[number];

/**
 * The complete closed vocabulary, adding the one reason only the deterministic
 * validator can produce: a value that is legal for the column but not for the
 * requested action (PRD 2E-COMMAND-017).
 */
export const TASK_COMMAND_UNSUPPORTED_REASONS = [
  ...TASK_COMMAND_MODEL_UNSUPPORTED_REASONS,
  "value_not_allowed_for_action",
] as const;

export type TaskCommandUnsupportedReason = (typeof TASK_COMMAND_UNSUPPORTED_REASONS)[number];

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

/**
 * The `Changes` column of PRD §11.2, as data.
 *
 * Task columns plus the three relation tables plus `reminders`, which is a
 * linked effect rather than a column but is changed by the transition just as
 * truthfully (§11.3). The two `task_people` roles are distinct members on
 * purpose: `assign_person` and `set_waiting_on` are otherwise byte-identical
 * policies, and if the role lived only in the action's *name*, the preview and
 * the mutation RPC would each have to re-derive it — the duplicated conditional
 * this module exists to prevent.
 */
export const TASK_CHANGED_FIELDS = [
  "status",
  "completed_at",
  "cancelled_at",
  "title",
  "description",
  "due_at",
  "intentional_no_due",
  "no_due_reason",
  "planned_at",
  "manual_priority",
  "task_projects",
  "task_contexts",
  "task_people:involved",
  "task_people:waiting_on",
  "reminders",
] as const;

export type TaskChangedField = (typeof TASK_CHANGED_FIELDS)[number];

/**
 * The `Undo` column of §11.2, reduced to the two shapes it actually has.
 *
 * `restore_fields` puts the recorded pre-state back. `remove_added_relation`
 * deletes only the relation row the operation created — never one the user
 * established earlier, which is 2E-UPDATE-015 and is not expressible as
 * "restore the previous value".
 */
export type TaskCommandUndoStrategy = "restore_fields" | "remove_added_relation";

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
  /**
   * The patch field `allowedTargetValues` governs, or null when the action has
   * no enumerable target.
   *
   * Declared here rather than inferred by the validator: a hardcoded
   * `["status", "priority"]` in the validator is a second copy of taxonomy
   * knowledge, and a future action whose enumerable target sits on another
   * field would declare its allowed values and have them silently ignored.
   */
  readonly targetValueField: TaskCommandPatchField | null;
  readonly requiredPatchFields: readonly TaskCommandPatchField[];
  readonly allowedPatchFields: readonly TaskCommandPatchField[];
  /** The §11.2 `Changes` column: every field and linked effect this action writes. */
  readonly changedFields: readonly TaskChangedField[];
  readonly destructive: boolean;
  /** Whether an unambiguous match may be presented with a single Apply control. */
  readonly oneStepEligible: boolean;
  readonly requiresConfirmation: boolean;
  readonly reversible: boolean;
  readonly undoStrategy: TaskCommandUndoStrategy;
};

const NEVER_CANCELLED = TASK_STATUSES.filter((status) => status !== "cancelled");
const ACTIVE_ONLY = NON_TERMINAL_STATUSES;

function policy(
  overrides: Partial<TaskCommandActionPolicy> & Pick<TaskCommandActionPolicy, "eligibleFrom" | "changedFields">,
): TaskCommandActionPolicy {
  return {
    allowedTargetValues: null,
    targetValueField: null,
    requiredPatchFields: [],
    allowedPatchFields: [],
    destructive: false,
    oneStepEligible: true,
    requiresConfirmation: false,
    reversible: true,
    undoStrategy: "restore_fields",
    ...overrides,
  };
}

/** One `policy(...)` per row of PRD §11.2, in the order the table lists them. */
const POLICIES: Record<TaskCommandAction, TaskCommandActionPolicy> = {
  complete_task: policy({
    eligibleFrom: ACTIVE_ONLY,
    changedFields: ["status", "completed_at", "reminders"],
  }),
  reopen_task: policy({
    eligibleFrom: ["completed"],
    changedFields: ["status", "completed_at", "reminders"],
  }),
  set_status: policy({
    eligibleFrom: ACTIVE_ONLY,
    allowedTargetValues: ACTIVE_ONLY,
    targetValueField: "status",
    requiredPatchFields: ["status"],
    allowedPatchFields: ["status"],
    changedFields: ["status"],
  }),
  cancel_task: policy({
    eligibleFrom: ACTIVE_ONLY,
    changedFields: ["status", "cancelled_at", "reminders"],
    destructive: true,
    oneStepEligible: false,
    requiresConfirmation: true,
  }),
  // Cancellation would otherwise be terminal once the 24h undo window closes:
  // re-confirmation of the originating candidate is gated by the
  // entry_task_candidate_resolutions ledger, not by the relaxed unique index.
  // Not one-step, because undoing a deliberate cancellation deserves the same
  // deliberateness as the cancellation.
  restore_task: policy({
    eligibleFrom: ["cancelled"],
    changedFields: ["status", "cancelled_at", "reminders"],
    oneStepEligible: false,
  }),
  rename_task: policy({
    eligibleFrom: NEVER_CANCELLED,
    requiredPatchFields: ["title"],
    allowedPatchFields: ["title"],
    changedFields: ["title"],
  }),
  // Recording a fact about finished work is truthful, so this is the one action
  // a completed task admits.
  append_note: policy({
    eligibleFrom: NEVER_CANCELLED,
    requiredPatchFields: ["note"],
    allowedPatchFields: ["note"],
    changedFields: ["description"],
  }),
  reschedule_due: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["dueAt"],
    allowedPatchFields: ["dueAt"],
    // `tasks_no_due_consistency_check` forbids a due date on an intentionally
    // undated task, so the two flags move with it or the write raises a raw
    // 23514 (2E-UPDATE-012).
    changedFields: ["due_at", "intentional_no_due", "no_due_reason", "reminders"],
  }),
  clear_due: policy({
    eligibleFrom: ACTIVE_ONLY,
    changedFields: ["due_at", "reminders"],
  }),
  set_planned: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["plannedAt"],
    allowedPatchFields: ["plannedAt"],
    changedFields: ["planned_at"],
  }),
  set_priority: policy({
    eligibleFrom: ACTIVE_ONLY,
    allowedTargetValues: TASK_PRIORITIES,
    targetValueField: "priority",
    requiredPatchFields: ["priority"],
    allowedPatchFields: ["priority"],
    changedFields: ["manual_priority"],
  }),
  assign_project: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["projectRef"],
    allowedPatchFields: ["projectRef"],
    changedFields: ["task_projects"],
    undoStrategy: "remove_added_relation",
  }),
  assign_context: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["contextRef"],
    allowedPatchFields: ["contextRef"],
    changedFields: ["task_contexts"],
    undoStrategy: "remove_added_relation",
  }),
  assign_person: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["personRef"],
    allowedPatchFields: ["personRef"],
    changedFields: ["task_people:involved"],
    undoStrategy: "remove_added_relation",
  }),
  set_waiting_on: policy({
    eligibleFrom: ACTIVE_ONLY,
    requiredPatchFields: ["personRef"],
    allowedPatchFields: ["personRef"],
    changedFields: ["task_people:waiting_on"],
    undoStrategy: "remove_added_relation",
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
 * enforced by the command schema instead. Callers must therefore reach this
 * only for `actionPolicy(action).targetValueField`, which is null exactly when
 * `allowedTargetValues` is — an invariant a test pins, because a fail-open
 * default guarding the route to `cancelled` is only safe while that holds.
 */
export function isAllowedTargetValue(action: TaskCommandAction, value: string): boolean {
  const allowed = actionPolicy(action).allowedTargetValues;
  return allowed === null || allowed.includes(value);
}

/**
 * Whether applying or undoing `action` must reconcile the task's reminders.
 *
 * Derived from `changedFields` rather than stored beside it: two independent
 * declarations of the same fact are exactly how a transition ends up cancelling
 * a reminder on the way out and not restoring it on the way back (§11.3).
 */
export function touchesReminders(action: TaskCommandAction): boolean {
  return actionPolicy(action).changedFields.includes("reminders");
}
