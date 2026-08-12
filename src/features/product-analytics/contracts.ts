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

/** `2J-METRICS-003`. Mirrors `CAPTURE_MODES`. */
export const captureModeAnalytics = ["text", "attachment", "voice"] as const;
export type CaptureModeAnalytics = (typeof captureModeAnalytics)[number];

export const voiceTranscriptionOutcomes = ["succeeded", "failed"] as const;
export type VoiceTranscriptionOutcome = (typeof voiceTranscriptionOutcomes)[number];

/** The subset of attention reasons that can be resolved in place (2J-ATTN-007). */
export const trackedAttentionReasonAnalytics = ["retry_processing"] as const;
export type TrackedAttentionReasonAnalytics = (typeof trackedAttentionReasonAnalytics)[number];

export const attentionResolutionActions = ["retry", "bulk_retry"] as const;
export type AttentionResolutionAction = (typeof attentionResolutionActions)[number];

/**
 * `2J-METRICS-002`/`004`. Buckets, never durations.
 *
 * A millisecond count is a behavioural fingerprint: it says when somebody was
 * at their desk and how fast they read. Three coarse buckets answer "was this
 * quick?" and answer nothing else.
 */
export const resolutionBuckets = ["under_5s", "under_60s", "over_60s"] as const;
export type ResolutionBucket = (typeof resolutionBuckets)[number];

export function toResolutionBucket(elapsedMs: number): ResolutionBucket {
  if (elapsedMs < 5_000) return "under_5s";
  if (elapsedMs < 60_000) return "under_60s";
  return "over_60s";
}

/* -------------------------------------------------------------------------- */
/* Phase 2M slice 2M.1 — the daily-cycle vocabularies                          */
/*                                                                            */
/* Declared here as runtime literals so the producers, the validator and the   */
/* funnel reader all narrow against one list. Every one is a closed enum;       */
/* `plannedItemCount` below is the phase's only number, and it is bounded.      */
/* -------------------------------------------------------------------------- */

/** `2M-CAL-007`'s three orientations. Never the anchor date. */
export const calendarOrientations = ["day", "week", "agenda"] as const;
export type CalendarOrientation = (typeof calendarOrientations)[number];

/**
 * `2M-PLAN-002`. `cleared` exists because the phase closes the `clear_planned`
 * asymmetry, and a funnel that could not see a removal would report planning as
 * monotonic when it is not.
 */
export const planOperations = ["set", "cleared"] as const;
export type PlanOperation = (typeof planOperations)[number];

/**
 * OD-2L-4's selection ceiling, reused rather than restated as a new limit.
 * One is the single-item case; 50 is the bulk case's maximum.
 */
export const PLANNED_ITEM_COUNT_CEILING = 50 as const;

/** `2M-REVIEW-001` and `-002` are two flows, and each is asked about separately. */
export const dayReviewScopes = ["day", "next_day"] as const;
export type DayReviewScope = (typeof dayReviewScopes)[number];

/** The five operations `2M-REVIEW-003` enumerates, by the requirement's own names. */
export const dayReviewActionKinds = [
  "carry_forward",
  "reschedule",
  "plan",
  "archive",
  "follow_up",
] as const;
export type DayReviewActionKind = (typeof dayReviewActionKinds)[number];

/**
 * A closed enum of one, for the reason `rate_limit_refused.failureKind` is:
 * `push` is the name of *this* control, and widening it later would mean the
 * event had started reporting a different one. `2M-NOTIFY-005` requires the
 * governance controls proved **per channel** rather than inherited, and a
 * channel-less event could not support that reading.
 */
export const notificationChannels = ["push"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

/** `2M-NOTIFY-010`'s five distinguishable states, exactly. */
export const notificationConsentStates = [
  "granted",
  "denied",
  "revoked",
  "unsupported",
  "expired",
] as const;
export type NotificationConsentState = (typeof notificationConsentStates)[number];

/**
 * The six controls that can decide not to send.
 *
 * "Silenced" is not one number: a user who set quiet hours and a user who hit
 * the daily cap have said different things, and `2M-NOTIFY-004`'s claim that
 * every control has a consumer is only checkable if the ledger can tell them
 * apart. `expired` is deliberately absent — an expired subscription is a
 * consent-state transition, recorded once by `notification_consent_changed`.
 */
export const notificationSuppressionReasons = [
  "quiet_hours",
  "daily_cap",
  "cooldown",
  "duplicate",
  "not_consented",
  "type_muted",
] as const;
export type NotificationSuppressionReason = (typeof notificationSuppressionReasons)[number];

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
  /*
   * Phase 2J slice 2J.7. Three events, and the count is the point.
   *
   * `2J-METRICS-007` requires a **consumer** before close, because SH.6 shipped
   * a producer with none and its quota refusals recorded nothing for weeks
   * while the code read as though they did. So this vocabulary is exactly what
   * `scripts/phase-2j-experience-funnel-reader.mjs` reads -- not the larger set
   * the PRD sketched, which would have declared names nothing would ever ask a
   * question of.
   *
   * Every property below is a closed enum or a boolean. There is no key that
   * can hold a transcript, a filename, a task title or an entry -- which is the
   * mechanism `2J-METRICS-006` asks for, rather than a promise that writers
   * behave. Migration `202608080086` carries the same three literals into the
   * table CHECK and into `validate_product_event_properties`.
   */
  "capture_mode_selected",
  "voice_transcription_finished",
  "attention_item_resolved",
  /*
   * Phase 2K slice 2K.8. Three events, and the count is the point again.
   *
   * `2K-METRICS-007` requires a **consumer** before close. So this vocabulary
   * is exactly what `scripts/phase-2k-conversation-funnel-reader.mjs` asks
   * questions of, and no wider: does an answer have personal evidence behind
   * it, does a memory card reach a resolution, and does a suggestion ever get
   * shown. A fourth name nothing reads would be the SH.6 failure with a
   * different label.
   *
   * Every property is a closed enum or a boolean. **There is no key that can
   * hold a question, an answer, a source excerpt, a person or a project name**
   * -- which is `2K-METRICS-002` enforced by the shape rather than by writers
   * behaving. `conversation_suggestion_shown` in particular carries the
   * suggestion CATEGORY and never its text, which OD-2K-4 requires by name.
   *
   * Migration `202608090088` carries the same three literals into the table
   * CHECK and into `private.validate_product_event_properties`. Both live
   * gates, audited together -- the failure `202608080087` had to correct was a
   * third copy nobody knew existed.
   */
  "conversation_answer_shown",
  "conversation_memory_resolved",
  "conversation_suggestion_shown",
  /*
   * Phase 2M slice 2M.1. Six events, four questions, one reader.
   *
   * The questions were written down before any name was chosen, which is what
   * `2M-METRICS-005` asks for:
   *
   *   Q1 is the calendar reached at all, and in which orientation?
   *   Q2 how often is a plan made -- set or cleared, one item or many?
   *   Q3 how often does a review produce an action, and which action?
   *   Q4 how often is a notification silenced, and by which control? And do
   *      people opt in and then revoke?
   *
   * Their consumer is `scripts/phase-2m-daily-cycle-funnel.mjs`. A seventh name
   * nothing reads would be SH.6's failure wearing this phase's label.
   *
   * **There is no date and no time on any of them.** A calendar phase is
   * exactly where an `anchorDate` or a `plannedDate` property would feel
   * harmless, and it is the shape `2M-METRICS-004` names explicitly: a
   * behavioural fingerprint that says which days somebody works and which they
   * protect. `day_planned` records that a plan was made and how many items it
   * touched, never which day.
   *
   * Migration `202608110090` carries the same six literals into the table
   * CHECK and into `private.validate_product_event_properties`, and lands
   * BEFORE any producer exists.
   */
  "calendar_viewed",
  "day_planned",
  "day_review_opened",
  "day_review_action_applied",
  "notification_consent_changed",
  "notification_suppressed",
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
  /*
   * Phase 2K slice 2K.8. Conversar had **no surface at all**, so the phase
   * could have shipped every requirement and been unable to answer "did
   * anyone use it?".
   *
   * Named `conversation` rather than `chat` to match the tables the events
   * describe -- `conversations`, `conversation_messages` -- so an analyst
   * reading the funnel and an operator reading the database are talking about
   * the same thing. It is distinct from `task_command`, which stays the
   * surface for the command console wherever it mounts.
   */
  "conversation",
  /*
   * Phase 2M slice 2M.1, OD-2M-2. Its own surface rather than a fold into
   * `work`.
   *
   * OD-2L-2 A keeps Work at exactly three views, so attributing the calendar to
   * `work` would both make "did anyone open the calendar" unanswerable from the
   * ledger and describe it as a Work view -- which is the thing that decision
   * refused. The daily planner is a sub-route of `/app/calendar` and attributes
   * here.
   *
   * **The day review attributes here too, and it mounts on `/app/reviews`.**
   * Slice 2M.3 put it there because that is the surface reviews already had, and
   * a second review destination would be one the user has to learn about. The
   * attribution did not move with it: `surface` is the product area an event
   * belongs to, not the route it was emitted from — `task_command` has attributed
   * to its own area from `/app/chat` and `/app/work` since Phase 2E. A `reviews`
   * value the deployed CHECK does not admit would have been a fourth migration in
   * a phase whose three are allocated by name, which is a stop condition rather
   * than a routing detail.
   *
   * The notification events carry `server` instead: they are emitted by the
   * Server Action that writes a consent row and by the sender that decides not
   * to send, neither of which happens on a browser surface. Inventing a
   * `notifications` surface for them would be a vocabulary entry that lies
   * about where the event happened.
   *
   * Migration `202608110090` carries this literal into
   * `product_events_surface_check`, which has been the ONLY declaration of the
   * surface vocabulary since `202608090089` deleted the writer's copy.
   */
  "calendar",
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
  /** `2J-METRICS-003`. Which modality, and nothing about what was captured. */
  capture_mode_selected: {
    captureMode: CaptureModeAnalytics;
  };
  /**
   * `2J-METRICS-004`. Outcome and two booleans.
   *
   * `draftEdited` answers whether the transcript was good enough to use as-is;
   * `additionalSegment` answers whether one recording was enough. Neither
   * carries a character of what was said.
   */
  voice_transcription_finished: {
    outcome: VoiceTranscriptionOutcome;
    draftEdited: boolean;
    additionalSegment: boolean;
  };
  /** `2J-METRICS-002`. Reason class, action taken, and a BUCKET -- never a duration. */
  attention_item_resolved: {
    attentionReason: TrackedAttentionReasonAnalytics;
    resolutionAction: AttentionResolutionAction;
    resolutionBucket: ResolutionBucket;
  };
  /**
   * `2K-METRICS-002`. Did the answer have personal evidence behind it, and
   * did it have anything to explain?
   *
   * `evidence` is the envelope's own three-value state, not a count and not
   * derived from `citations.length` -- slice 2K.0 measured that an empty
   * citation array is produced both by "nothing was retrieved" and by
   * "retrieved and the model cited none", so a count here would report the
   * wrong fact half the time.
   *
   * `explained` is a **boolean by existence**: whether anything was excluded
   * at all. It is deliberately not "how much" -- T-2K-04 records that a rate
   * is a count over repeated queries, so the disclosure that reaches a user
   * and the one that reaches the ledger are bounded the same way.
   */
  conversation_answer_shown: {
    evidence: "evidenced" | "no_qualifying_evidence" | "unknown";
    explained: boolean;
  };
  /**
   * `2K-METRICS-002`. What became of a memory card.
   *
   * Scoped to **memory** deliberately: task commands already have four
   * events of their own, and a second name covering them would double-count
   * the same act. The memory card is the one this phase created and the one
   * nothing measures.
   *
   * `undone` is the archival undo (OD-2K-3). The vocabulary says `undone`
   * and never `deleted`, for the same reason the copy does: the row survives.
   */
  conversation_memory_resolved: {
    outcome: "accepted" | "no_change" | "failed" | "undone";
  };
  /**
   * `2K-SUGG-005` / `2K-METRICS-002`. That a suggestion was shown, and of
   * which kind.
   *
   * **The category and nothing else.** OD-2K-4 permits a suggestion to name
   * a person or project on screen and forbids that name from ever entering
   * telemetry; `suggestionTelemetryCategory` narrows to exactly this shape,
   * whose type has no field a name could occupy.
   */
  conversation_suggestion_shown: {
    category: "person" | "project";
  };
  /**
   * Q1. `2M-CAL-007`'s three orientations, and nothing else.
   *
   * Not the anchor date, not the visible lanes, not the item count. A
   * calendar's anchor date is the single most fingerprinting value this phase
   * could record, and it answers no declared question.
   */
  calendar_viewed: {
    orientation: CalendarOrientation;
  };
  /**
   * Q2. Whether an intention was set or removed, and how many items one action
   * touched.
   *
   * `itemCount` is this phase's only number. It is a count of *affected items*,
   * bounded by OD-2L-4's ceiling of 50 — never a date, never a duration, and it
   * identifies nothing.
   */
  day_planned: {
    operation: PlanOperation;
    itemCount: number;
  };
  /** Q3, denominator. */
  day_review_opened: {
    scope: DayReviewScope;
  };
  /** Q3, numerator. */
  day_review_action_applied: {
    scope: DayReviewScope;
    actionKind: DayReviewActionKind;
  };
  /**
   * Q4. `expired` lives here rather than among the suppression reasons: a
   * subscription that expired is a consent-state transition, and recording it
   * in both places would make the funnel's numerator and denominator disagree.
   */
  notification_consent_changed: {
    channel: NotificationChannel;
    state: NotificationConsentState;
  };
  /** Q4. Which control decided not to send — never what was not sent. */
  notification_suppressed: {
    channel: NotificationChannel;
    reason: NotificationSuppressionReason;
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
    // Phase 2J slice 2J.7. `hasExactKeys` is what makes `2J-METRICS-006`
    // mechanical rather than aspirational: an extra key -- a transcript, a
    // filename, a title -- fails here before the payload ever reaches the RPC,
    // and fails again in the database if it somehow did.
    case "capture_mode_selected":
      return hasExactKeys(value, ["captureMode"])
        && isOneOf(value.captureMode, captureModeAnalytics);
    case "voice_transcription_finished":
      return hasExactKeys(value, ["outcome", "draftEdited", "additionalSegment"])
        && isOneOf(value.outcome, voiceTranscriptionOutcomes)
        && typeof value.draftEdited === "boolean"
        && typeof value.additionalSegment === "boolean";
    case "attention_item_resolved":
      return hasExactKeys(value, ["attentionReason", "resolutionAction", "resolutionBucket"])
        && isOneOf(value.attentionReason, trackedAttentionReasonAnalytics)
        && isOneOf(value.resolutionAction, attentionResolutionActions)
        && isOneOf(value.resolutionBucket, resolutionBuckets);
    /*
     * Phase 2K slice 2K.8. `hasExactKeys` is what makes `2K-METRICS-002`
     * structural: an extra key -- a question, a source excerpt, a person's
     * name -- is refused here as well as by the database validator, so a
     * writer cannot smuggle one past the application on its way to a gate
     * that would also have refused it.
     */
    case "conversation_answer_shown":
      return hasExactKeys(value, ["evidence", "explained"])
        && isOneOf(value.evidence, ["evidenced", "no_qualifying_evidence", "unknown"])
        && typeof value.explained === "boolean";
    case "conversation_memory_resolved":
      return hasExactKeys(value, ["outcome"])
        && isOneOf(value.outcome, ["accepted", "no_change", "failed", "undone"]);
    case "conversation_suggestion_shown":
      return hasExactKeys(value, ["category"])
        && isOneOf(value.category, ["person", "project"]);
    /*
     * Phase 2M slice 2M.1. `hasExactKeys` is what makes `2M-METRICS-004`
     * structural rather than aspirational: an extra key — a task title, a
     * reminder title, review text, or the date the user chose — is refused here
     * before the payload reaches the RPC, and refused again in the database if
     * it somehow did.
     */
    case "calendar_viewed":
      return hasExactKeys(value, ["orientation"])
        && isOneOf(value.orientation, calendarOrientations);
    case "day_planned":
      return hasExactKeys(value, ["operation", "itemCount"])
        && isOneOf(value.operation, planOperations)
        && isBoundedInteger(value.itemCount, 1, PLANNED_ITEM_COUNT_CEILING);
    case "day_review_opened":
      return hasExactKeys(value, ["scope"]) && isOneOf(value.scope, dayReviewScopes);
    case "day_review_action_applied":
      return hasExactKeys(value, ["scope", "actionKind"])
        && isOneOf(value.scope, dayReviewScopes)
        && isOneOf(value.actionKind, dayReviewActionKinds);
    case "notification_consent_changed":
      return hasExactKeys(value, ["channel", "state"])
        && isOneOf(value.channel, notificationChannels)
        && isOneOf(value.state, notificationConsentStates);
    case "notification_suppressed":
      return hasExactKeys(value, ["channel", "reason"])
        && isOneOf(value.channel, notificationChannels)
        && isOneOf(value.reason, notificationSuppressionReasons);
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
