"use client";

import { startTransition, useEffect, useRef, type ReactNode } from "react";
import type {
  ProductEventLocale,
  ProductEventName,
  ProductEventPropertiesByName,
  ProductEventSubject,
  ProductSurface,
} from "./contracts";
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
