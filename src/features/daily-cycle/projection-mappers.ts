import {
  attentionReasons,
  dailyCycleActions,
  dailyCycleMessageKeys,
  productStates,
  type AttentionReason,
  type AvailableAction,
  type CaptureReceipt,
  type DailyCycleMessageKey,
  type InboxItemView,
  type NeedsAttentionItemView,
  type ProductState,
  type WorkItemHumanState,
  type WorkItemOrigin,
  type WorkItemView,
} from "./contracts";
import { resolveDailyCycleLifecycle, type DailyCycleLifecycleInput } from "./lifecycle";

export type ProjectionActionSource = {
  readonly id: string;
  readonly href?: string | null;
};

export type CaptureReceiptSource = {
  readonly entryId: string;
  readonly persisted: boolean;
  readonly productState: string;
  readonly messageKey: string;
  readonly safeHref?: string | null;
  readonly replayed: boolean;
};

export type InboxItemSource = {
  readonly entryId: string;
  readonly title: string;
  readonly originalPreview: string;
  readonly significantAt: string;
  readonly originalPreserved: boolean;
  readonly availableActions: readonly ProjectionActionSource[];
  readonly lifecycle: DailyCycleLifecycleInput;
};

export type NeedsAttentionItemSource = {
  readonly key: string;
  readonly kind: string;
  readonly entryId: string;
  readonly title: string;
  readonly explanation: string;
  readonly primaryAction: ProjectionActionSource;
  readonly secondaryAction?: ProjectionActionSource | null;
  readonly occurredAt: string;
  readonly groupKey: string;
};

export type WorkItemSource = {
  readonly taskId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly dueAt?: string | null;
  readonly status: string;
  readonly createdBy: string;
  readonly availableActions: readonly ProjectionActionSource[];
};

type UnknownRecord = Record<string, unknown>;

const workItemStatesByInternalStatus = {
  inbox: "not_started",
  todo: "not_started",
  in_progress: "in_progress",
  waiting: "waiting_on_someone",
  blocked: "blocked",
  deferred: "deferred",
  completed: "completed",
} as const satisfies Record<string, WorkItemHumanState>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafeHref(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\");
}

function isProductState(value: unknown): value is ProductState {
  return typeof value === "string" && productStates.includes(value as ProductState);
}

function isAttentionReason(value: unknown): value is AttentionReason {
  return typeof value === "string" && attentionReasons.includes(value as AttentionReason);
}

function isMessageKey(value: unknown): value is DailyCycleMessageKey {
  return typeof value === "string" && dailyCycleMessageKeys.includes(value as DailyCycleMessageKey);
}

function isProjectionActionSource(value: unknown): value is ProjectionActionSource {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.href === undefined || value.href === null || typeof value.href === "string");
}

function toAvailableAction(source: unknown): AvailableAction | null {
  if (!isProjectionActionSource(source) || !dailyCycleActions.includes(source.id as AvailableAction["id"])) {
    return null;
  }

  if (source.href !== undefined && source.href !== null && !isSafeHref(source.href)) return null;

  return Object.freeze(source.href ? { id: source.id as AvailableAction["id"], href: source.href } : { id: source.id as AvailableAction["id"] });
}

function toAvailableActions(source: unknown): readonly AvailableAction[] | null {
  if (!Array.isArray(source)) return null;

  const actions: AvailableAction[] = [];
  for (const actionSource of source) {
    const action = toAvailableAction(actionSource);
    if (!action) return null;
    actions.push(action);
  }

  return Object.freeze(actions);
}

function toLifecycleInput(source: unknown): DailyCycleLifecycleInput | null {
  if (!isRecord(source) || typeof source.entryLifecycle !== "string") return null;

  const jobSource = source.job;
  let job: DailyCycleLifecycleInput["job"];
  if (jobSource === undefined || jobSource === null) {
    job = jobSource;
  } else {
    if (!isRecord(jobSource)) return null;
    const status = jobSource.status;
    const retryAt = jobSource.retryAt;
    if (typeof status !== "string") return null;
    if (retryAt !== undefined && retryAt !== null && typeof retryAt !== "string") return null;

    job = { status, retryAt };
  }

  for (const key of [
    "hasValidTaskCandidates",
    "hasOpenQuestion",
    "recordOnly",
    "hasMaterializedTaskForCandidates",
    "hasConsistencyIssue",
  ]) {
    if (source[key] !== undefined && typeof source[key] !== "boolean") return null;
  }

  if (source.now !== undefined && typeof source.now !== "string") return null;

  return {
    entryLifecycle: source.entryLifecycle,
    job,
    hasValidTaskCandidates: source.hasValidTaskCandidates as boolean | undefined,
    hasOpenQuestion: source.hasOpenQuestion as boolean | undefined,
    recordOnly: source.recordOnly as boolean | undefined,
    hasMaterializedTaskForCandidates: source.hasMaterializedTaskForCandidates as boolean | undefined,
    hasConsistencyIssue: source.hasConsistencyIssue as boolean | undefined,
    now: source.now as string | undefined,
  };
}

function toOptionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return isNonEmptyString(value) ? value : null;
}

function toOptionalDateTime(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return isIsoDateTime(value) ? value : null;
}

function toWorkItemHumanState(value: unknown): WorkItemHumanState | null {
  if (typeof value !== "string") return null;
  return workItemStatesByInternalStatus[value as keyof typeof workItemStatesByInternalStatus] ?? null;
}

function toWorkItemOrigin(value: unknown): WorkItemOrigin | null {
  if (value === "user") return "you";
  if (value === "agent") return "brain";
  return null;
}

export function toCaptureReceipt(source: CaptureReceiptSource): CaptureReceipt | null {
  if (!isRecord(source)
    || !isNonEmptyString(source.entryId)
    || source.persisted !== true
    || !isProductState(source.productState)
    || !isMessageKey(source.messageKey)
    || typeof source.replayed !== "boolean") {
    return null;
  }

  const safeHref = source.safeHref === undefined || source.safeHref === null
    ? undefined
    : isSafeHref(source.safeHref) ? source.safeHref : null;
  if (safeHref === null) return null;

  return Object.freeze({
    entryId: source.entryId,
    persisted: true,
    productState: source.productState,
    messageKey: source.messageKey,
    ...(safeHref ? { safeHref } : {}),
    replayed: source.replayed,
  });
}

export function toInboxItemView(source: InboxItemSource): InboxItemView | null {
  if (!isRecord(source)
    || !isNonEmptyString(source.entryId)
    || !isNonEmptyString(source.title)
    || !isNonEmptyString(source.originalPreview)
    || !isIsoDateTime(source.significantAt)
    || typeof source.originalPreserved !== "boolean") {
    return null;
  }

  const lifecycle = toLifecycleInput(source.lifecycle);
  const availableActions = toAvailableActions(source.availableActions);
  if (!lifecycle || !availableActions) return null;

  const productLifecycle = resolveDailyCycleLifecycle(lifecycle);
  if (productLifecycle.fallback) return null;

  return Object.freeze({
    entryId: source.entryId,
    title: source.title,
    originalPreview: source.originalPreview,
    productState: productLifecycle.productState,
    ...(productLifecycle.attentionReason ? { attentionReason: productLifecycle.attentionReason } : {}),
    significantAt: source.significantAt,
    availableActions,
    originalPreserved: source.originalPreserved,
  });
}

export function toNeedsAttentionItemView(source: NeedsAttentionItemSource): NeedsAttentionItemView | null {
  if (!isRecord(source)
    || !isNonEmptyString(source.key)
    || !isAttentionReason(source.kind)
    || !isNonEmptyString(source.entryId)
    || !isNonEmptyString(source.title)
    || !isNonEmptyString(source.explanation)
    || !isIsoDateTime(source.occurredAt)
    || !isNonEmptyString(source.groupKey)) {
    return null;
  }

  const primaryAction = toAvailableAction(source.primaryAction);
  const secondaryAction = source.secondaryAction === undefined || source.secondaryAction === null
    ? undefined
    : toAvailableAction(source.secondaryAction);
  if (!primaryAction || secondaryAction === null) return null;

  return Object.freeze({
    key: source.key,
    kind: source.kind,
    entryId: source.entryId,
    title: source.title,
    explanation: source.explanation,
    primaryAction,
    ...(secondaryAction ? { secondaryAction } : {}),
    occurredAt: source.occurredAt,
    groupKey: source.groupKey,
  });
}

export function toWorkItemView(source: WorkItemSource): WorkItemView | null {
  if (!isRecord(source) || !isNonEmptyString(source.taskId) || !isNonEmptyString(source.title)) return null;

  const description = toOptionalText(source.description);
  const dueAt = toOptionalDateTime(source.dueAt);
  const humanState = toWorkItemHumanState(source.status);
  const origin = toWorkItemOrigin(source.createdBy);
  const availableActions = toAvailableActions(source.availableActions);
  if (description === null || dueAt === null || !humanState || !origin || !availableActions) return null;

  return Object.freeze({
    taskId: source.taskId,
    title: source.title,
    ...(description ? { description } : {}),
    ...(dueAt ? { dueAt } : {}),
    humanState,
    origin,
    availableActions,
  });
}
