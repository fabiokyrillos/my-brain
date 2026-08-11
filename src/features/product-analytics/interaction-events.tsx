"use client";

import { startTransition, useEffect, useRef, type ReactNode } from "react";
import type {
  AttentionResolutionAction,
  CalendarOrientation,
  CaptureModeAnalytics,
  ProductEventLocale,
  ProductEventName,
  ProductEventPropertiesByName,
  ProductEventSubject,
  ProductSurface,
  TrackedAttentionReasonAnalytics,
  VoiceTranscriptionOutcome,
} from "./contracts";
import { toResolutionBucket } from "./contracts";
import { recordProductInteraction } from "./actions";

type AttentionReason = ProductEventPropertiesByName["needs_attention_item_opened"]["attentionReason"];
type CaptureSource = ProductEventPropertiesByName["capture_started"]["captureSource"];

const sessionIdKey = "brain.product-analytics.session-id";
const dedupePrefix = "brain.product-analytics.once.";

function randomUuid(): string {
  return crypto.randomUUID();
}

function getSessionId(): string {
  const existing = sessionStorage.getItem(sessionIdKey);
  if (existing) return existing;
  const created = randomUuid();
  sessionStorage.setItem(sessionIdKey, created);
  return created;
}

function viewportClass(): "mobile" | "desktop" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  return window.matchMedia?.("(max-width: 767px)").matches ? "mobile" : "desktop";
}

function sendInteraction<Name extends ProductEventName>(input: {
  name: Name;
  surface: ProductSurface;
  locale: ProductEventLocale;
  properties: ProductEventPropertiesByName[Name];
  subject?: ProductEventSubject;
}) {
  const idempotencyKey = randomUuid();
  const sessionId = getSessionId();
  startTransition(() => {
    void recordProductInteraction({
      name: input.name,
      surface: input.surface,
      locale: input.locale,
      viewportClass: viewportClass(),
      appVersion: "client",
      idempotencyKey,
      sessionId,
      properties: input.properties,
      ...(input.subject ? { subject: input.subject } : {}),
    }).catch(() => {});
  });
}

function recordOnce<Name extends ProductEventName>(input: {
  logicalKey: string;
  name: Name;
  surface: ProductSurface;
  locale: ProductEventLocale;
  properties: ProductEventPropertiesByName[Name];
  subject?: ProductEventSubject;
}) {
  try {
    const key = `${dedupePrefix}${input.logicalKey}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    sendInteraction(input);
  } catch {
    // Analytics must remain fail-open when browser storage or transport is unavailable.
  }
}

function recordRepeatable<Name extends ProductEventName>(input: {
  name: Name;
  surface: ProductSurface;
  locale: ProductEventLocale;
  properties: ProductEventPropertiesByName[Name];
  subject?: ProductEventSubject;
}) {
  try {
    sendInteraction(input);
  } catch {
    // Analytics must remain fail-open when browser storage or transport is unavailable.
  }
}

function VisibilityEvent({ onVisible }: { onVisible: () => void }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const callbackRef = useRef(onVisible);

  useEffect(() => {
    callbackRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      callbackRef.current();
      observer.disconnect();
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  return <span ref={markerRef} aria-hidden="true" className="product-event-marker" />;
}

export function NeedsAttentionViewed({ surface, itemCount, locale }: {
  surface: "home" | "needs_attention";
  itemCount: number;
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `needs-attention-viewed:${surface}`,
    name: "needs_attention_viewed",
    surface,
    locale,
    properties: { itemCount },
  })} />;
}

// Phase 2D Slice 2D.5 — the conversational pending-question panel became
// visible on a pull/proactive surface (Chat or the "Precisa de você" queue).
// Content-free: reuses the existing `needs_attention_viewed` event with the
// allowlisted `questions` surface and carries only a bounded item count —
// never any question or answer text. Session-deduplicated and fail-open.
export function ConversationalQuestionsViewed({ itemCount, locale }: {
  itemCount: number;
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `conversational-questions-viewed:${itemCount}`,
    name: "needs_attention_viewed",
    surface: "questions",
    locale,
    properties: { itemCount },
  })} />;
}

export function InterpretationReviewViewed({ entryId, locale }: {
  entryId: string;
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `interpretation-review-viewed:${entryId}`,
    name: "interpretation_review_viewed",
    surface: "interpretation_review",
    locale,
    subject: { type: "entry", id: entryId },
    properties: {},
  })} />;
}

export function TaskCandidatesPresented({ entryId, interpretationId, candidateCount, locale }: {
  entryId: string;
  interpretationId: string;
  candidateCount: number;
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `task-candidates-presented:${entryId}:${interpretationId}`,
    name: "task_candidates_presented",
    surface: "interpretation_review",
    locale,
    subject: { type: "entry", id: entryId },
    properties: { candidateCount },
  })} />;
}

/*
 * Phase 2K slice 2K.8 -- the three Conversar producers.
 *
 * Every one carries a closed enum or a boolean and NOTHING else: no question,
 * no answer, no source excerpt, no person's or project's name. That is
 * `2K-METRICS-002` enforced by the payload's shape, and it is checked twice
 * more before a row exists -- by `arePropertiesValid` in the application and by
 * `private.validate_product_event_properties` in the database.
 *
 * All three are session-deduplicated and fail-open, like every producer above:
 * a measurement that could break the surface it measures is not worth having.
 */

/**
 * `2K-METRICS-002`. Did the answer have personal evidence behind it?
 *
 * Keyed by message id so one answer counts once per session, not once per
 * scroll past it -- the thread renders up to 200 messages and an un-keyed
 * event would report reading as answering.
 */
export function ConversationAnswerShown({ evidence, explained, messageId, locale }: {
  evidence: ProductEventPropertiesByName["conversation_answer_shown"]["evidence"];
  explained: boolean;
  messageId: string;
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `conversation-answer-shown:${messageId}`,
    name: "conversation_answer_shown",
    surface: "conversation",
    locale,
    properties: { evidence, explained },
  })} />;
}

/**
 * `2K-METRICS-002`. What became of a memory card.
 *
 * Scoped to memory deliberately: task commands already have four events of
 * their own, and a second name covering them would double-count one act.
 * `undone` is the ARCHIVAL undo -- the row survives, and the vocabulary says so.
 */
export function ConversationMemoryResolved({ outcome, locale }: {
  outcome: ProductEventPropertiesByName["conversation_memory_resolved"]["outcome"];
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordRepeatable({
    name: "conversation_memory_resolved",
    surface: "conversation",
    locale,
    properties: { outcome },
  })} />;
}

/**
 * `2K-SUGG-005` / `2K-METRICS-002`. That a suggestion was shown, and of which
 * kind.
 *
 * **The category and nothing else.** OD-2K-4 permits a suggestion to name a
 * person or project on screen and forbids that name from ever reaching
 * telemetry; the caller passes categories, never suggestions, so there is no
 * name in scope here to leak.
 *
 * Deduplicated by category rather than by suggestion: three suggestions of the
 * same kind are one fact about the surface, and keying by id would put an
 * identifier into the dedupe key for no gain.
 */
export function ConversationSuggestionsShown({ categories, locale }: {
  categories: readonly ProductEventPropertiesByName["conversation_suggestion_shown"]["category"][];
  locale: ProductEventLocale;
}) {
  const distinct = [...new Set(categories)];
  return (
    <>
      {distinct.map((category) => (
        <VisibilityEvent
          key={category}
          onVisible={() => recordOnce({
            logicalKey: `conversation-suggestion-shown:${category}`,
            name: "conversation_suggestion_shown",
            surface: "conversation",
            locale,
            properties: { category },
          })}
        />
      ))}
    </>
  );
}

export function WorkViewViewed({ view, locale }: {
  view: "today" | "all" | "waiting";
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `work-view-viewed:${view}`,
    name: "work_view_viewed",
    surface: "work",
    locale,
    properties: { workView: view },
  })} />;
}

/**
 * `2M-CAL-001` / Q1 — *is the calendar reached at all, and in which
 * orientation?*
 *
 * The first producer of the vocabulary migration `202608110090` admitted, and it
 * ships **after** that migration was merged, deployed and parity-verified, which
 * is what `2M-METRICS-001` makes a rule.
 *
 * It carries the orientation and nothing else. Not the anchor date: a calendar's
 * anchor is the single most fingerprinting value this phase could record — it
 * says which days somebody works and which they protect — and it answers no
 * declared question. `2M-METRICS-004` refuses the key, the parser refuses the
 * payload, and the deployed validator refuses it again.
 *
 * `recordOnce` keys on the orientation, so paging through a week does not emit a
 * second event for the same shape while switching to the agenda does.
 */
export function CalendarViewed({ orientation, locale }: {
  orientation: CalendarOrientation;
  locale: ProductEventLocale;
}) {
  return <VisibilityEvent onVisible={() => recordOnce({
    logicalKey: `calendar-viewed:${orientation}`,
    name: "calendar_viewed",
    surface: "calendar",
    locale,
    properties: { orientation },
  })} />;
}

export function TrackedTechnicalDetails({ entryId, locale, className, children }: {
  entryId: string;
  locale: ProductEventLocale;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!event.currentTarget.open) return;
        recordOnce({
          logicalKey: `technical-details-opened:${entryId}`,
          name: "technical_details_opened",
          surface: "technical_details",
          locale,
          subject: { type: "entry", id: entryId },
          properties: {},
        });
      }}
    >
      {children}
    </details>
  );
}

// Phase 2D Slice 2D.3 — the owner opened a read-only source or predicted-effect
// disclosure for a pending question. Opening a panel performs no domain write;
// this observation is property-free, session-deduplicated per question (both
// panels share one logical key), and fail-open.
export function TrackedQuestionPreview({ questionId, locale, className, children }: {
  questionId: string;
  locale: ProductEventLocale;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={className}
      onToggle={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!event.currentTarget.open) return;
        recordOnce({
          logicalKey: `question-effect-previewed:${questionId}`,
          name: "question_effect_previewed",
          surface: "questions",
          locale,
          subject: { type: "pending_question", id: questionId },
          properties: {},
        });
      }}
    >
      {children}
    </details>
  );
}

export function recordCaptureStarted(input: {
  attemptId: string;
  captureSource: CaptureSource;
  locale: ProductEventLocale;
}) {
  recordOnce({
    logicalKey: `capture-started:${input.attemptId}`,
    name: "capture_started",
    surface: input.captureSource === "home" ? "home" : "capture",
    locale: input.locale,
    properties: { captureSource: input.captureSource },
  });
}

export function recordNeedsAttentionItemOpened(input: {
  entryId: string;
  attentionReason: AttentionReason;
  surface: "home" | "needs_attention";
  locale: ProductEventLocale;
}) {
  recordOnce({
    logicalKey: `needs-attention-item-opened:${input.surface}:${input.entryId}:${input.attentionReason}`,
    name: "needs_attention_item_opened",
    surface: input.surface,
    locale: input.locale,
    subject: { type: "entry", id: input.entryId },
    properties: { attentionReason: input.attentionReason },
  });
}

export function recordCandidateEditStarted(input: {
  entryId: string;
  candidateIndex: number;
  locale: ProductEventLocale;
}) {
  recordOnce({
    logicalKey: `candidate-edit-started:${input.entryId}:${input.candidateIndex}`,
    name: "candidate_edit_started",
    surface: "interpretation_review",
    locale: input.locale,
    subject: { type: "entry", id: input.entryId },
    properties: { candidateCount: 1 },
  });
}

export function recordCandidateEditReset(input: {
  entryId: string;
  editedFieldCount: number;
  locale: ProductEventLocale;
}) {
  recordRepeatable({
    name: "candidate_edit_reset",
    surface: "interpretation_review",
    locale: input.locale,
    subject: { type: "entry", id: input.entryId },
    properties: { editedFieldCount: input.editedFieldCount },
  });
}

/* ------------------------------------------------------------------ *
 * Phase 2J slice 2J.7. Three emitters, one per declared event.
 *
 * Each takes only bounded values -- there is no parameter that could carry a
 * transcript, a filename or a title, which is the same property the database's
 * key whitelist enforces one layer down (`2J-METRICS-006`).
 * ------------------------------------------------------------------ */

/** `2J-METRICS-003`. Which modality the user chose, and nothing about what. */
export function recordCaptureModeSelected(input: {
  attemptId: string;
  captureMode: CaptureModeAnalytics;
  locale: ProductEventLocale;
}) {
  recordOnce({
    // Keyed by attempt AND mode, so switching back and forth records each
    // choice once rather than collapsing into a single event per visit.
    logicalKey: `capture-mode:${input.attemptId}:${input.captureMode}`,
    name: "capture_mode_selected",
    surface: "capture",
    locale: input.locale,
    properties: { captureMode: input.captureMode },
  });
}

/** `2J-METRICS-004`. Outcome plus two booleans about the draft. */
export function recordVoiceTranscriptionFinished(input: {
  attemptId: string;
  outcome: VoiceTranscriptionOutcome;
  draftEdited: boolean;
  additionalSegment: boolean;
  locale: ProductEventLocale;
}) {
  recordOnce({
    logicalKey: `voice-transcription:${input.attemptId}`,
    name: "voice_transcription_finished",
    surface: "capture",
    locale: input.locale,
    properties: {
      outcome: input.outcome,
      draftEdited: input.draftEdited,
      additionalSegment: input.additionalSegment,
    },
  });
}

/** `2J-METRICS-002`. Reason class, action taken, and a bucket -- never a duration. */
export function recordAttentionItemResolved(input: {
  entryId: string;
  attentionReason: TrackedAttentionReasonAnalytics;
  resolutionAction: AttentionResolutionAction;
  elapsedMs: number;
  locale: ProductEventLocale;
}) {
  recordOnce({
    logicalKey: `attention-resolved:${input.entryId}:${input.resolutionAction}`,
    name: "attention_item_resolved",
    surface: "needs_attention",
    locale: input.locale,
    properties: {
      attentionReason: input.attentionReason,
      resolutionAction: input.resolutionAction,
      // Bucketed at the boundary, so no caller can pass a raw duration through.
      resolutionBucket: toResolutionBucket(input.elapsedMs),
    },
  });
}


/**
 * `2M-METRICS-005` Q2 — *how often is a plan made, and is it ever unmade?*
 *
 * The producer for `day_planned`, whose vocabulary was deployed in migration 1
 * (`202608110090`) **before this or any other producer existed**, which is
 * `2M-METRICS-001` and is the discipline `202608080087` and `202608090089` were
 * both bought by.
 *
 * Two properties and no third. `operation` distinguishes a plan being made from
 * one being removed — the value `cleared` was admitted by that migration in
 * anticipation of `2M-PLAN-002`, and a funnel that could not see a removal would
 * report planning as monotonic when it is not. `itemCount` is bounded 1..50 by
 * the deployed validator, which is OD-2L-4's selection ceiling: one for a single
 * row, up to fifty for a bulk apply.
 *
 * **The day is deliberately absent**, exactly as the calendar's anchor is. Which
 * days somebody plans is the most fingerprinting value this phase could record
 * and it answers no declared question; `2M-METRICS-004` refuses the key and the
 * deployed validator refuses the payload.
 *
 * Not `recordOnce`-keyed on a task: planning three tasks in three actions is
 * three plans, and a logical key that collapsed them would under-count the
 * question this event exists to answer. The key varies by operation and count so
 * a re-render cannot double-count one action.
 */
export function recordDayPlanned(input: {
  operation: "set" | "cleared";
  itemCount: number;
  locale: ProductEventLocale;
}) {
  recordOnce({
    logicalKey: `day-planned:${input.operation}:${input.itemCount}:${Date.now()}`,
    name: "day_planned",
    surface: "calendar",
    locale: input.locale,
    properties: { operation: input.operation, itemCount: input.itemCount },
  });
}
