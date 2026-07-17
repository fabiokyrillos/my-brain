import {
  dailyCycleMessageKeys,
  productStates,
  type DailyCycleMessageKey,
  type ProductState,
} from "./contracts";

export const dailyCycleActionSuccessCodes = [
  "capture_persisted",
  "capture_replayed",
  "correction_saved",
  "undo_applied",
  "reprocessing_queued",
  "task_candidates_confirmed",
  "task_creation_undone",
  "retry_scheduled",
  "question_answered",
] as const;

export type DailyCycleActionSuccessCode = (typeof dailyCycleActionSuccessCodes)[number];

export const dailyCycleActionFailureCodes = [
  "validation_failed",
  "unauthenticated",
  "not_found",
  "version_conflict",
  "action_unavailable",
  "retry_not_available",
  "operation_failed",
] as const;

export type DailyCycleActionFailureCode = (typeof dailyCycleActionFailureCodes)[number];
export type DailyCycleActionCode = DailyCycleActionSuccessCode | DailyCycleActionFailureCode;

type DailyCycleActionResultFields = {
  messageKey: DailyCycleMessageKey;
  entityId?: string;
  productState?: ProductState;
  undoId?: string;
};

export type DailyCycleActionSuccess = DailyCycleActionResultFields & {
  ok: true;
  code: DailyCycleActionSuccessCode;
  retryable: false;
  replayed?: boolean;
};

export type DailyCycleActionFailure = DailyCycleActionResultFields & {
  ok: false;
  code: DailyCycleActionFailureCode;
  retryable: boolean;
  fieldErrors?: Readonly<Record<string, string>>;
};

export type DailyCycleActionResult = DailyCycleActionSuccess | DailyCycleActionFailure;

export type DailyCycleActionSuccessInput = Omit<DailyCycleActionSuccess, "ok" | "retryable">;
export type DailyCycleActionFailureInput = Omit<DailyCycleActionFailure, "ok">;

export function createDailyCycleActionSuccess(input: DailyCycleActionSuccessInput): DailyCycleActionSuccess {
  return { ok: true, retryable: false, ...input };
}

export function createDailyCycleActionFailure(input: DailyCycleActionFailureInput): DailyCycleActionFailure {
  return { ok: false, ...input };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === "string");
}

function hasStableFields(value: Record<string, unknown>) {
  const messageKey = value.messageKey;
  const productState = value.productState;
  return typeof messageKey === "string"
    && dailyCycleMessageKeys.includes(messageKey as DailyCycleMessageKey)
    && (value.entityId === undefined || typeof value.entityId === "string")
    && (productState === undefined || productStates.includes(productState as ProductState))
    && (value.undoId === undefined || typeof value.undoId === "string");
}

export function isDailyCycleActionResult(value: unknown): value is DailyCycleActionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!hasStableFields(result) || typeof result.code !== "string") return false;

  if (result.ok === true) {
    return dailyCycleActionSuccessCodes.includes(result.code as DailyCycleActionSuccessCode)
      && result.retryable === false
      && (result.replayed === undefined || typeof result.replayed === "boolean")
      && result.fieldErrors === undefined;
  }

  return result.ok === false
    && dailyCycleActionFailureCodes.includes(result.code as DailyCycleActionFailureCode)
    && typeof result.retryable === "boolean"
    && (result.fieldErrors === undefined || isStringRecord(result.fieldErrors));
}
