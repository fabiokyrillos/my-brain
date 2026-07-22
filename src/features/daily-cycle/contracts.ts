export const productStates = [
  "saved",
  "organizing",
  "needs_attention",
  "ready",
  "could_not_organize",
] as const;

export type ProductState = (typeof productStates)[number];

export const attentionReasons = [
  "review_interpretation",
  "confirm_existing_candidates",
  "answer_existing_question",
  "retry_processing",
  "resolve_consistency",
] as const;

export type AttentionReason = (typeof attentionReasons)[number];

export const dailyCycleActions = [
  "open_entry",
  "review_interpretation",
  "confirm_existing_candidates",
  "answer_existing_question",
  "retry_processing",
  "resolve_consistency",
  "correct_interpretation",
  "undo_correction",
  "undo_task_creation",
  "open_task",
  "complete_task",
  "wait_task",
  "resume_task",
  "reopen_task",
] as const;

export type DailyCycleAction = (typeof dailyCycleActions)[number];

export const dailyCycleMessageKeys = [
  "capture_saved",
  "capture_replayed",
  "correction_saved",
  "undo_applied",
  "reprocessing_queued",
  "candidates_confirmed",
  "task_creation_undone",
  "retry_scheduled",
  "question_answered",
  "validation_failed",
  "session_expired",
  "item_not_found",
  "version_conflict",
  "action_unavailable",
  "retry_not_available",
  "action_failed",
] as const;

export type DailyCycleMessageKey = (typeof dailyCycleMessageKeys)[number];

export type SerializablePrimitive = string | number | boolean | null;
export type SerializableValue = SerializablePrimitive | readonly SerializableValue[] | SerializableRecord;
export type SerializableRecord = { readonly [key: string]: SerializableValue };

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isDailyCycleSerializable(value: unknown): value is SerializableValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isDailyCycleSerializable);
  if (typeof value !== "object" || !isPlainRecord(value)) return false;

  return Object.values(value).every(isDailyCycleSerializable);
}

export type AvailableAction = {
  readonly id: DailyCycleAction;
  readonly href?: string;
};

export type CaptureReceipt = {
  readonly entryId: string;
  readonly persisted: true;
  readonly productState: ProductState;
  readonly messageKey: DailyCycleMessageKey;
  readonly safeHref?: string;
  readonly replayed: boolean;
};

export type InboxItemView = {
  readonly entryId: string;
  readonly title: string;
  readonly originalPreview: string;
  readonly productState: ProductState;
  readonly attentionReason?: AttentionReason;
  readonly significantAt: string;
  readonly availableActions: readonly AvailableAction[];
  readonly originalPreserved: boolean;
};

export type NeedsAttentionItemView = {
  readonly key: string;
  readonly kind: AttentionReason;
  readonly entryId: string;
  readonly title: string;
  readonly explanation: string;
  readonly primaryAction: AvailableAction;
  readonly secondaryAction?: AvailableAction;
  readonly occurredAt: string;
  readonly groupKey: string;
};

export type HumanFieldView = {
  key: string;
  label: string;
  value: string | null;
  editable: boolean;
};

export type AttentionItemView = {
  key: string;
  reason: AttentionReason;
  title: string;
  explanation: string;
  availableActions: readonly AvailableAction[];
};

export type ActionableCandidateView = {
  key: string;
  title: string;
  description?: string;
  dueAt?: string;
};

export type MaterializedTaskView = {
  taskId: string;
  title: string;
  dueAt?: string;
};

export type CandidateOutcomeView = {
  key: string;
  title: string;
  outcomeLabel: string;
  resolvedAt: string;
};

export type OriginalEntryView = {
  content: string;
  occurredAt: string;
  isRetroactive: boolean;
};

export type InterpretationReviewView = {
  entryId: string;
  productState: ProductState;
  understanding: string;
  humanFields: readonly HumanFieldView[];
  attentionItems: readonly AttentionItemView[];
  actionableCandidates: readonly ActionableCandidateView[];
  materializedTasks: readonly MaterializedTaskView[];
  candidateOutcomes: readonly CandidateOutcomeView[];
  availableActions: readonly AvailableAction[];
  original: OriginalEntryView;
  hasTechnicalDetails: boolean;
};

export type InterpretationTechnicalDetailsView = {
  entryId: string;
  versions: readonly { id: string; version: number; createdAt: string }[];
  source: SerializableRecord;
  model: string | null;
  scores: SerializableRecord;
  policies: SerializableRecord;
  signals: SerializableRecord;
  evidence: SerializableRecord;
  overrides: SerializableRecord;
  comparisons: SerializableRecord;
  provenance: SerializableRecord;
};

export const workItemHumanStates = [
  "not_started",
  "in_progress",
  "waiting_on_someone",
  "blocked",
  "deferred",
  "completed",
] as const;

export type WorkItemHumanState = (typeof workItemHumanStates)[number];

export const workItemOrigins = ["you", "brain"] as const;
export type WorkItemOrigin = (typeof workItemOrigins)[number];

export const workItemPriorities = ["low", "medium", "high", "urgent"] as const;
export type WorkItemPriority = (typeof workItemPriorities)[number];

export type RelationSummary = {
  readonly id: string;
  readonly label: string;
};

export type WorkItemView = {
  readonly taskId: string;
  readonly title: string;
  readonly description?: string;
  readonly dueAt?: string;
  readonly plannedAt?: string;
  readonly priority?: WorkItemPriority;
  readonly intentionalNoDue: boolean;
  readonly noDueReason?: string;
  readonly humanState: WorkItemHumanState;
  readonly origin: WorkItemOrigin;
  readonly availableActions: readonly AvailableAction[];
  readonly projects: readonly RelationSummary[];
  readonly contexts: readonly RelationSummary[];
  readonly people: readonly RelationSummary[];
  readonly waitingOnPeople: readonly RelationSummary[];
  readonly parent?: RelationSummary;
  readonly dependsOn?: readonly RelationSummary[];
};
