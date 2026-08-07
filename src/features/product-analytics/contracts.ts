import type {
  TaskCommandApplyRoute,
  TaskCommandOrigin,
  TaskCommandPreviewedOutcome,
  TaskCommandUndoResult,
} from "@/features/task-commands/analytics";
import type { TaskMatchEvidence, TaskMatchScoreBand } from "@/features/task-commands/match-policy";
import type { TaskCommandOutcome } from "@/features/task-commands/outcomes";

/**
 * Phase 2E's vocabularies arrive as **types**, and their runtime literals are
 * restated below.
 *
 * A type-only import is erased at build time, so the command taxonomy does not
 * follow this module into the client bundle that `interaction-events.tsx`
 * ships — while still making a value outside the declared union a compile
 * error. What a type cannot catch is an *omission*, so `contracts.test.ts`
 * asserts each restated list against the imported runtime vocabulary by exact
 * equality. Together those are the same guarantee `productTaskStatuses` gets
 * from being restated and pinned, at no bundle cost.
 */
const taskCommandOrigins: readonly TaskCommandOrigin[] = ["chat", "work"];
const taskCommandOutcomeCategories: readonly TaskCommandOutcome[] = [
  "applied",
  "no_change",
  "ambiguous",
  "ambiguous_overflow",
  "matched_requires_confirmation",
  "clarification_requested",
  "still_unmatched",
  "creation_offered",
  "unsupported",
  "rejected_stale",
  "rejected_conflict",
  "refused",
];
/**
 * The preview event's own category list: the twelve outcomes plus `previewed`.
 *
 * A preview waiting for the user has not come to rest, so `previewed` is not an
 * outcome — but it is the category a one-step-eligible match belongs to, and
 * the preview event has to be able to say so.
 */
const taskCommandPreviewedOutcomes: readonly TaskCommandPreviewedOutcome[] = [
  ...taskCommandOutcomeCategories,
  "previewed",
];
const taskCommandApplyRoutes: readonly TaskCommandApplyRoute[] = [
  "direct",
  "confirmed",
  "created",
];
const taskCommandUndoResults: readonly TaskCommandUndoResult[] = [
  "undone",
  "unavailable",
  "expired",
  "refused",
];
const taskMatchScoreBands: readonly TaskMatchScoreBand[] = ["none", "low", "medium", "high"];
const taskMatchEvidenceLabels: readonly TaskMatchEvidence[] = [
  "normalized_exact_title",
  "normalized_title_phrase",
  "normalized_token_overlap",
  "referenced_project",
  "referenced_context",
  "referenced_person",
  "status_match",
  "temporal_proximity",
  "temporal_proximity_near",
  "recent_activity",
];

/** Exported for the exact-equality drift gate in `contracts.test.ts` only. */
export const taskCommandAnalyticsVocabularies = {
  origins: taskCommandOrigins,
  outcomeCategories: taskCommandOutcomeCategories,
  previewedOutcomes: taskCommandPreviewedOutcomes,
  applyRoutes: taskCommandApplyRoutes,
  undoResults: taskCommandUndoResults,
  scoreBands: taskMatchScoreBands,
  evidence: taskMatchEvidenceLabels,
} as const;

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
  "question_effect_previewed",
  "question_reinterpret_applied",
  "processing_retry_requested",
  "work_view_viewed",
  "task_status_changed",
  // Phase 2E Slice 2E.7. Chosen against PRD §18's questions rather than against
  // the code that happens to exist: how often did a command match in one step,
  // how often did the user pick something other than the top candidate, how
  // often did a preview go stale or produce no change, and how often was an
  // applied change reversed. Migration `202607280061` carries the same four
  // literals into the table CHECK and the `record_product_event` guard.
  "task_command_previewed",
  "task_command_disambiguated",
  "task_command_applied",
  "task_command_undone",
  // Phase 2H Slice 2H.3 (2H-RATE-003). Its own event rather than a `failureKind`
  // folded onto an existing one, because no existing event covers "an operation
  // was refused before it started" — `capture_save_failed` is about a save that
  // was attempted, and a rate refusal means nothing was attempted at all.
  // Migration `202608070081` carries the same literal into the table CHECK and
  // into `validate_product_event_properties`.
  "rate_limit_refused",
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
  "questions",
  "server",
  // Phase 2E Slice 2E.7 (2E-ANALYTICS-005). Its own surface rather than a fold
  // into `work`: the command console mounts on both Chat and the task surface,
  // and attributing it to either would make "where do commands come from"
  // unanswerable. Which mount a command was driven from travels as the
  // `commandOrigin` *property*, which is a bounded category.
  "task_command",
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
  capture_started: { captureSource: "home" | "capture_page" | "global" | "composer" };
  capture_save_succeeded: { captureSource: "home" | "capture_page" | "global" | "composer"; durationMs: number };
  capture_save_failed: {
    captureSource: "home" | "capture_page" | "global" | "composer";
    durationMs: number;
    failureKind: "validation" | "session" | "storage" | "unknown" | "quota";
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
  /**
   * 2H-RATE-003. `operation` names the bucket exactly as
   * `rate_limit_events.bucket` names it, so the operator reading the ledger and
   * the analyst reading the funnel are talking about the same thing.
   *
   * `failureKind` is a closed vocabulary of one on purpose. `rate_limited` is
   * the name of *this* control, and it stays distinct from SH.5's auth throttle,
   * SH.6's `quota`, the lifecycle refusals, CAPTCHA, storage and provider
   * failures — a reader must be able to tell which control refused. Widening it
   * later would mean this event had started reporting a different control.
   */
  rate_limit_refused: {
    operation: "ai" | "upload";
    failureKind: "rate_limited";
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
  // Slice 2D.3 provenance: a bounded two-value enum recording *that* the
  // answer came from a presented deterministic suggestion. It never carries
  // the suggestion's id, value, label, or any question/answer text.
  question_answered_basic: { origin: "typed" | "suggested" };
  question_resolved: { kind: "deferred" | "dismissed" | "not_relevant" };
  question_effect_previewed: EmptyProductEventProperties;
  // Slice 2D.4 — boolean-by-existence: emitted only when an answer applied
  // the bounded reinterpretation consequence. It carries no properties, so it
  // reveals nothing beyond that a reinterpretation was confirmed.
  question_reinterpret_applied: EmptyProductEventProperties;
  processing_retry_requested: { retrySource: "user" | "worker" };
  work_view_viewed: { workView: "today" | "all" | "waiting" };
  task_status_changed: { fromStatus: ProductTaskStatus; toStatus: ProductTaskStatus };
  // Phase 2E Slice 2E.7 — the seven categories 2E-ANALYTICS-001 allows, and
  // nothing else. Every member below is a bounded category, a bounded integer,
  // a boolean, or the policy version; there is no free-text property on any of
  // the four, so 2E-ANALYTICS-003 holds structurally.
  task_command_previewed: {
    commandOrigin: TaskCommandOrigin;
    outcomeCategory: TaskCommandPreviewedOutcome;
    candidateCount: number;
    scoreBand: TaskMatchScoreBand;
    marginBand: TaskMatchScoreBand;
    signalCategories: readonly TaskMatchEvidence[];
    oneStep: boolean;
    requiresConfirmation: boolean;
    policyVersion: string;
  };
  task_command_disambiguated: {
    commandOrigin: TaskCommandOrigin;
    candidateCount: number;
    selectedRank: number;
    policyVersion: string;
  };
  task_command_applied: {
    commandOrigin: TaskCommandOrigin;
    outcomeCategory: TaskCommandOutcome;
    applyRoute: TaskCommandApplyRoute;
    replayed: boolean;
    policyVersion: string;
  };
  task_command_undone: {
    commandOrigin: TaskCommandOrigin;
    undoResult: TaskCommandUndoResult;
    policyVersion: string;
  };
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

/**
 * A set drawn from a closed enum: every member allowed, no repeats, no more
 * members than the enum has.
 *
 * The repeat check matters as much as the membership check. `signalCategories`
 * is produced as a deduplicated subset in the declared order, so a repeated
 * label means the payload did not come from the builder — and an array that can
 * repeat is an array whose length carries information the category vocabulary
 * was supposed to bound. Mirrors `private.require_product_event_enum_array`.
 */
function isBoundedEnumSet<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
): value is readonly Value[] {
  if (!Array.isArray(value) || value.length > allowed.length) return false;
  if (!value.every((member) => isOneOf(member, allowed))) return false;
  return new Set(value).size === value.length;
}

/**
 * The policy version, checked as a shape rather than against today's literal.
 *
 * PRD §10.4 requires the version to be bumped whenever a weight, threshold,
 * margin or lexicon entry changes, so pinning the current value here would make
 * every legitimate bump a breaking change to the analytics contract. Mirrors
 * `private.require_product_event_policy_version`.
 */
const policyVersionPattern = /^\d{4}-\d{2}-\d{2}\.\d{1,3}$/;

function isPolicyVersion(value: unknown): value is string {
  return typeof value === "string" && policyVersionPattern.test(value);
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
        && isOneOf(value.captureSource, ["home", "capture_page", "global", "composer"]);
    case "capture_save_succeeded":
      return hasExactKeys(value, ["captureSource", "durationMs"])
        && isOneOf(value.captureSource, ["home", "capture_page", "global", "composer"])
        && isBoundedDuration(value.durationMs);
    case "capture_save_failed":
      return hasExactKeys(value, ["captureSource", "durationMs", "failureKind"])
        && isOneOf(value.captureSource, ["home", "capture_page", "global", "composer"])
        && isBoundedDuration(value.durationMs)
        && isOneOf(value.failureKind, ["validation", "session", "storage", "unknown", "quota"]);
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
    case "rate_limit_refused":
      return hasExactKeys(value, ["operation", "failureKind"])
        && isOneOf(value.operation, ["ai", "upload"])
        && isOneOf(value.failureKind, ["rate_limited"]);
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
    case "question_effect_previewed":
    case "question_reinterpret_applied":
      return hasExactKeys(value, []);
    case "question_answered_basic":
      return hasExactKeys(value, ["origin"]) && isOneOf(value.origin, ["typed", "suggested"]);
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
    case "task_command_previewed":
      return hasExactKeys(value, [
        "commandOrigin", "outcomeCategory", "candidateCount", "scoreBand",
        "marginBand", "signalCategories", "oneStep", "requiresConfirmation",
        "policyVersion",
      ])
        && isOneOf(value.commandOrigin, taskCommandOrigins)
        && isOneOf(value.outcomeCategory, taskCommandPreviewedOutcomes)
        && isBoundedInteger(value.candidateCount, 0, 100)
        && isOneOf(value.scoreBand, taskMatchScoreBands)
        && isOneOf(value.marginBand, taskMatchScoreBands)
        && isBoundedEnumSet(value.signalCategories, taskMatchEvidenceLabels)
        && typeof value.oneStep === "boolean"
        && typeof value.requiresConfirmation === "boolean"
        && isPolicyVersion(value.policyVersion);
    case "task_command_disambiguated":
      return hasExactKeys(value, ["commandOrigin", "candidateCount", "selectedRank", "policyVersion"])
        && isOneOf(value.commandOrigin, taskCommandOrigins)
        && isBoundedInteger(value.candidateCount, 0, 100)
        // Zero is a real rank: the pick was not in the list this process ranked,
        // which happens when a candidate went ineligible between listing and
        // selection (2E-DISAMBIG-005).
        && isBoundedInteger(value.selectedRank, 0, 100)
        && isPolicyVersion(value.policyVersion);
    case "task_command_applied":
      return hasExactKeys(value, ["commandOrigin", "outcomeCategory", "applyRoute", "replayed", "policyVersion"])
        && isOneOf(value.commandOrigin, taskCommandOrigins)
        && isOneOf(value.outcomeCategory, taskCommandOutcomeCategories)
        && isOneOf(value.applyRoute, taskCommandApplyRoutes)
        && typeof value.replayed === "boolean"
        && isPolicyVersion(value.policyVersion);
    case "task_command_undone":
      return hasExactKeys(value, ["commandOrigin", "undoResult", "policyVersion"])
        && isOneOf(value.commandOrigin, taskCommandOrigins)
        && isOneOf(value.undoResult, taskCommandUndoResults)
        && isPolicyVersion(value.policyVersion);
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
