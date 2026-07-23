export const productEventNames = [
  "capture_started",
  "capture_save_succeeded",
  "capture_save_failed",
  "capture_processing_enqueued",
  "capture_processing_completed",
  "capture_processing_failed",
  "needs_attention_viewed",
  "needs_attention_item_opened",
  "interpretation_review_viewed",
  "interpretation_corrected",
  "technical_details_opened",
  "task_candidates_presented",
  "candidate_edit_started",
  "candidate_edit_reset",
  "task_candidates_confirmed",
  "question_answered_basic",
  "question_resolved",
  "processing_retry_requested",
  "work_view_viewed",
  "task_status_changed",
] as const;

export type ProductEventName = (typeof productEventNames)[number];

export const productEventContractVersion = 1 as const;
export const productEventVersionByName = Object.fromEntries(
  productEventNames.map((name) => [name, productEventContractVersion]),
) as { readonly [Name in ProductEventName]: typeof productEventContractVersion };

export const productSurfaces = [
  "home",
  "capture",
  "inbox",
  "needs_attention",
  "interpretation_review",
  "technical_details",
  "work",
  "server",
] as const;

export type ProductSurface = (typeof productSurfaces)[number];

export const productEventLocales = ["pt-BR", "en"] as const;
export type ProductEventLocale = (typeof productEventLocales)[number];

export const productViewportClasses = ["mobile", "desktop", "unknown"] as const;
export type ProductViewportClass = (typeof productViewportClasses)[number];

export const productSubjectTypes = ["entry", "task", "pending_question"] as const;
export type ProductSubjectType = (typeof productSubjectTypes)[number];

export const productTaskStatuses = [
  "inbox",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "deferred",
  "completed",
  "cancelled",
] as const;

export type ProductTaskStatus = (typeof productTaskStatuses)[number];

export type ProductEventSubject = {
  type: ProductSubjectType;
  id: string;
};

type EmptyProductEventProperties = Readonly<Record<string, never>>;

export type ProductEventPropertiesByName = {
  capture_started: { captureSource: "home" | "capture_page" | "global" };
  capture_save_succeeded: { captureSource: "home" | "capture_page" | "global"; durationMs: number };
  capture_save_failed: {
    captureSource: "home" | "capture_page" | "global";
    durationMs: number;
    failureKind: "validation" | "session" | "storage" | "unknown";
  };
  capture_processing_enqueued: { processingMode: "initial" | "reprocess" };
  capture_processing_completed: {
    processingMode: "initial" | "reprocess";
    durationMs: number;
    outcome: "ready" | "needs_attention";
  };
  capture_processing_failed: {
    processingMode: "initial" | "reprocess";
    durationMs: number;
    failureKind: "retryable" | "terminal";
  };
  needs_attention_viewed: { itemCount: number };
  needs_attention_item_opened: {
    attentionReason: "review_interpretation" | "confirm_existing_candidates" | "answer_existing_question" | "retry_processing" | "resolve_consistency";
  };
  interpretation_review_viewed: EmptyProductEventProperties;
  interpretation_corrected: { fieldCount: number };
  technical_details_opened: EmptyProductEventProperties;
  task_candidates_presented: { candidateCount: number };
  candidate_edit_started: { candidateCount: 1 };
  candidate_edit_reset: { editedFieldCount: number };
  task_candidates_confirmed: {
    candidateCount: number;
    editedCandidateCount: number;
    editedFieldCount: number;
  };
  question_answered_basic: EmptyProductEventProperties;
  question_resolved: { kind: "deferred" | "dismissed" | "not_relevant" };
  processing_retry_requested: { retrySource: "user" | "worker" };
  work_view_viewed: { workView: "today" | "all" | "waiting" };
  task_status_changed: { fromStatus: ProductTaskStatus; toStatus: ProductTaskStatus };
};

type ProductEventPayloadFor<Name extends ProductEventName> = {
  name: Name;
  surface: ProductSurface;
  locale: ProductEventLocale;
  viewportClass: ProductViewportClass;
  appVersion: string;
  idempotencyKey: string;
  properties: ProductEventPropertiesByName[Name];
  sessionId?: string;
  subject?: ProductEventSubject;
  synthetic?: boolean;
};

export type ProductEventPayload = {
  [Name in ProductEventName]: ProductEventPayloadFor<Name>;
}[ProductEventName];

export type ProductEventResult =
  | { accepted: true; recorded: true; eventId: string; code: "recorded" }
  | { accepted: true; recorded: false; eventId: string; code: "deduplicated" }
  | { accepted: true; recorded: false; eventId: null; code: "telemetry_unavailable" }
  | { accepted: false; recorded: false; eventId: null; code: "invalid_payload" | "unauthenticated" | "forbidden" };

export type ProductAnalyticsSerializable =
  | string
  | number
  | boolean
  | null
  | readonly ProductAnalyticsSerializable[]
  | { readonly [key: string]: ProductAnalyticsSerializable };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const appVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const productPayloadKeys = [
  "name",
  "surface",
  "locale",
  "viewportClass",
  "appVersion",
  "idempotencyKey",
  "properties",
  "sessionId",
  "subject",
  "synthetic",
] as const;

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isOneOf<Value extends string>(value: unknown, allowed: readonly Value[]): value is Value {
  return typeof value === "string" && allowed.includes(value as Value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasOnlyKeys(value, keys) && keys.every((key) => Object.hasOwn(value, key));
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isBoundedDuration(value: unknown): value is number {
  return isBoundedInteger(value, 0, 86_400_000);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isProductEventSubject(value: unknown): value is ProductEventSubject {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) return false;
  return hasExactKeys(value, ["type", "id"])
    && isOneOf(value.type, productSubjectTypes)
    && isUuid(value.id);
}

function arePropertiesValid<Name extends ProductEventName>(
  name: Name,
  value: unknown,
): value is ProductEventPropertiesByName[Name] {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) return false;

  switch (name) {
    case "capture_started":
      return hasExactKeys(value, ["captureSource"])
        && isOneOf(value.captureSource, ["home", "capture_page", "global"]);
    case "capture_save_succeeded":
      return hasExactKeys(value, ["captureSource", "durationMs"])
        && isOneOf(value.captureSource, ["home", "capture_page", "global"])
        && isBoundedDuration(value.durationMs);
    case "capture_save_failed":
      return hasExactKeys(value, ["captureSource", "durationMs", "failureKind"])
        && isOneOf(value.captureSource, ["home", "capture_page", "global"])
        && isBoundedDuration(value.durationMs)
        && isOneOf(value.failureKind, ["validation", "session", "storage", "unknown"]);
    case "capture_processing_enqueued":
      return hasExactKeys(value, ["processingMode"])
        && isOneOf(value.processingMode, ["initial", "reprocess"]);
    case "capture_processing_completed":
      return hasExactKeys(value, ["processingMode", "durationMs", "outcome"])
        && isOneOf(value.processingMode, ["initial", "reprocess"])
        && isBoundedDuration(value.durationMs)
        && isOneOf(value.outcome, ["ready", "needs_attention"]);
    case "capture_processing_failed":
      return hasExactKeys(value, ["processingMode", "durationMs", "failureKind"])
        && isOneOf(value.processingMode, ["initial", "reprocess"])
        && isBoundedDuration(value.durationMs)
        && isOneOf(value.failureKind, ["retryable", "terminal"]);
    case "needs_attention_viewed":
      return hasExactKeys(value, ["itemCount"]) && isBoundedInteger(value.itemCount, 0, 1_000);
    case "needs_attention_item_opened":
      return hasExactKeys(value, ["attentionReason"])
        && isOneOf(value.attentionReason, [
          "review_interpretation",
          "confirm_existing_candidates",
          "answer_existing_question",
          "retry_processing",
          "resolve_consistency",
        ]);
    case "interpretation_review_viewed":
    case "technical_details_opened":
    case "question_answered_basic":
      return hasExactKeys(value, []);
    case "question_resolved":
      return hasExactKeys(value, ["kind"])
        && isOneOf(value.kind, ["deferred", "dismissed", "not_relevant"]);
    case "interpretation_corrected":
      return hasExactKeys(value, ["fieldCount"]) && isBoundedInteger(value.fieldCount, 1, 30);
    case "task_candidates_presented":
      return hasExactKeys(value, ["candidateCount"]) && isBoundedInteger(value.candidateCount, 0, 100);
    case "candidate_edit_started":
      return hasExactKeys(value, ["candidateCount"]) && value.candidateCount === 1;
    case "candidate_edit_reset":
      return hasExactKeys(value, ["editedFieldCount"]) && isBoundedInteger(value.editedFieldCount, 0, 300);
    case "task_candidates_confirmed":
      return hasExactKeys(value, ["candidateCount", "editedCandidateCount", "editedFieldCount"])
        && isBoundedInteger(value.candidateCount, 1, 100)
        && isBoundedInteger(value.editedCandidateCount, 0, 100)
        && isBoundedInteger(value.editedFieldCount, 0, 300);
    case "processing_retry_requested":
      return hasExactKeys(value, ["retrySource"]) && isOneOf(value.retrySource, ["user", "worker"]);
    case "work_view_viewed":
      return hasExactKeys(value, ["workView"]) && isOneOf(value.workView, ["today", "all", "waiting"]);
    case "task_status_changed":
      return hasExactKeys(value, ["fromStatus", "toStatus"])
        && isOneOf(value.fromStatus, productTaskStatuses)
        && isOneOf(value.toStatus, productTaskStatuses);
  }
}

export function isProductAnalyticsSerializable(value: unknown): value is ProductAnalyticsSerializable {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isProductAnalyticsSerializable);
  if (!value || typeof value !== "object" || !isPlainRecord(value)) return false;

  return Object.values(value).every(isProductAnalyticsSerializable);
}

export function parseProductEventPayload(value: unknown): ProductEventPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) return null;
  if (!hasOnlyKeys(value, productPayloadKeys)) return null;
  if (!isOneOf(value.name, productEventNames)
    || !isOneOf(value.surface, productSurfaces)
    || !isOneOf(value.locale, productEventLocales)
    || !isOneOf(value.viewportClass, productViewportClasses)
    || typeof value.appVersion !== "string"
    || !appVersionPattern.test(value.appVersion)
    || !isUuid(value.idempotencyKey)
    || !arePropertiesValid(value.name, value.properties)
    || (value.sessionId !== undefined && !isUuid(value.sessionId))
    || (value.subject !== undefined && !isProductEventSubject(value.subject))
    || (value.synthetic !== undefined && typeof value.synthetic !== "boolean")) {
    return null;
  }

  return {
    name: value.name,
    surface: value.surface,
    locale: value.locale,
    viewportClass: value.viewportClass,
    appVersion: value.appVersion,
    idempotencyKey: value.idempotencyKey,
    properties: value.properties,
    ...(value.sessionId === undefined ? {} : { sessionId: value.sessionId }),
    ...(value.subject === undefined ? {} : { subject: value.subject }),
    ...(value.synthetic === undefined ? {} : { synthetic: value.synthetic }),
  } as ProductEventPayload;
}
