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
  id: DailyCycleAction;
  href?: string;
};

export type CaptureReceipt = {
  entryId: string;
  persisted: true;
  productState: ProductState;
  messageKey: DailyCycleMessageKey;
  safeHref?: string;
  replayed: boolean;
};

export type InboxItemView = {
  entryId: string;
  title: string;
  originalPreview: string;
  productState: ProductState;
  attentionReason?: AttentionReason;
  significantAt: string;
  availableActions: readonly AvailableAction[];
  originalPreserved: boolean;
};

export type NeedsAttentionItemView = {
  key: string;
  kind: AttentionReason;
  entryId: string;
  title: string;
  explanation: string;
  primaryAction: AvailableAction;
  secondaryAction?: AvailableAction;
  occurredAt: string;
  groupKey: string;
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

export type WorkItemView = {
  taskId: string;
  title: string;
  description?: string;
  dueAt?: string;
  humanState: WorkItemHumanState;
  origin: WorkItemOrigin;
  availableActions: readonly AvailableAction[];
};
