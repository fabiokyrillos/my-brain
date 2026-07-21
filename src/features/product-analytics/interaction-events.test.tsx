import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordProductInteractionMock } = vi.hoisted(() => ({
  recordProductInteractionMock: vi.fn(async (input: unknown) => {
    void input;
    return { acknowledged: true };
  }),
}));

vi.mock("./actions", () => ({ recordProductInteraction: recordProductInteractionMock }));

type InteractionEventsModule = {
  NeedsAttentionViewed?: (props: { surface: "home" | "needs_attention"; itemCount: number; locale: "pt-BR" | "en" }) => ReactNode;
  InterpretationReviewViewed?: (props: { entryId: string; locale: "pt-BR" | "en" }) => ReactNode;
  TaskCandidatesPresented?: (props: { entryId: string; interpretationId: string; candidateCount: number; locale: "pt-BR" | "en" }) => ReactNode;
  WorkViewViewed?: (props: { view: "today" | "all" | "waiting"; locale: "pt-BR" | "en" }) => ReactNode;
  TrackedTechnicalDetails?: (props: { entryId: string; locale: "pt-BR" | "en"; className?: string; children: ReactNode }) => ReactNode;
  recordCaptureStarted?: (input: { attemptId: string; captureSource: "home" | "capture_page"; locale: "pt-BR" | "en" }) => void;
  recordNeedsAttentionItemOpened?: (input: { entryId: string; attentionReason: "review_interpretation"; surface: "home" | "needs_attention"; locale: "pt-BR" | "en" }) => void;
  recordCandidateEditStarted?: (input: { entryId: string; candidateIndex: number; locale: "pt-BR" | "en" }) => void;
  recordCandidateEditReset?: (input: { entryId: string; editedFieldCount: number; locale: "pt-BR" | "en" }) => void;
};

const eventsPath = `./${"interaction-events"}.tsx`;
const events = await vi.importActual<InteractionEventsModule>(eventsPath).catch(() => ({})) as InteractionEventsModule;

class VisibleIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "0px";
  thresholds = [0];
}

describe("closed client product interactions", () => {
  beforeEach(() => {
    recordProductInteractionMock.mockClear();
    sessionStorage.clear();
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);
  });

  it("records a needs-attention view only after client visibility and only once per session surface", async () => {
    expect(events.NeedsAttentionViewed).toBeTypeOf("function");
    const Component = events.NeedsAttentionViewed!;

    const first = render(<Component surface="needs_attention" itemCount={3} locale="pt-BR" />);
    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<Component surface="needs_attention" itemCount={3} locale="pt-BR" />);
    await Promise.resolve();

    expect(recordProductInteractionMock).toHaveBeenCalledTimes(1);
    expect(recordProductInteractionMock).toHaveBeenCalledWith(expect.objectContaining({
      name: "needs_attention_viewed",
      surface: "needs_attention",
      properties: { itemCount: 3 },
      sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    }));
  });

  it("deduplicates a logical capture intent but allows the next real attempt", async () => {
    expect(events.recordCaptureStarted).toBeTypeOf("function");

    events.recordCaptureStarted?.({ attemptId: "attempt-1", captureSource: "home", locale: "en" });
    events.recordCaptureStarted?.({ attemptId: "attempt-1", captureSource: "home", locale: "en" });
    events.recordCaptureStarted?.({ attemptId: "attempt-2", captureSource: "home", locale: "en" });
    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(2));

    expect(recordProductInteractionMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: "capture_started",
      properties: { captureSource: "home" },
    }));
  });

  it("contains a rejected browser transport so telemetry cannot surface as an unhandled action failure", async () => {
    const catchTransportFailure = vi.fn();
    recordProductInteractionMock.mockReturnValueOnce({ catch: catchTransportFailure } as never);

    events.recordCaptureStarted?.({ attemptId: "offline-attempt", captureSource: "capture_page", locale: "en" });
    await Promise.resolve();

    expect(catchTransportFailure).toHaveBeenCalledTimes(1);
  });

  it("records an item open once per session, surface, entry, and reason without content", async () => {
    expect(events.recordNeedsAttentionItemOpened).toBeTypeOf("function");
    const input = {
      entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
      attentionReason: "review_interpretation" as const,
      surface: "home" as const,
      locale: "pt-BR" as const,
    };

    events.recordNeedsAttentionItemOpened?.(input);
    events.recordNeedsAttentionItemOpened?.(input);
    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(1));

    const payload = recordProductInteractionMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: "needs_attention_item_opened",
      subject: { type: "entry", id: input.entryId },
      properties: { attentionReason: "review_interpretation" },
    });
    expect(JSON.stringify(payload)).not.toMatch(/original|summary|title|answer|prompt|error/i);
  });

  it("records candidate edit start once per entry/candidate per session, without candidate index in properties", async () => {
    expect(events.recordCandidateEditStarted).toBeTypeOf("function");
    const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

    events.recordCandidateEditStarted?.({ entryId, candidateIndex: 0, locale: "pt-BR" });
    events.recordCandidateEditStarted?.({ entryId, candidateIndex: 0, locale: "pt-BR" });
    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(1));

    expect(recordProductInteractionMock).toHaveBeenCalledWith(expect.objectContaining({
      name: "candidate_edit_started",
      subject: { type: "entry", id: entryId },
      properties: { candidateCount: 1 },
    }));

    events.recordCandidateEditStarted?.({ entryId, candidateIndex: 1, locale: "pt-BR" });
    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(2));
  });

  it("records every explicit candidate edit reset without deduplicating meaningful repeats", async () => {
    expect(events.recordCandidateEditReset).toBeTypeOf("function");
    const entryId = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

    events.recordCandidateEditReset?.({ entryId, editedFieldCount: 2, locale: "pt-BR" });
    events.recordCandidateEditReset?.({ entryId, editedFieldCount: 1, locale: "pt-BR" });
    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(2));

    expect(recordProductInteractionMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      name: "candidate_edit_reset",
      subject: { type: "entry", id: entryId },
      properties: { editedFieldCount: 2 },
    }));
    expect(recordProductInteractionMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      name: "candidate_edit_reset",
      properties: { editedFieldCount: 1 },
    }));
  });

  it("records only the outer technical disclosure when the user opens it", async () => {
    expect(events.TrackedTechnicalDetails).toBeTypeOf("function");
    const Component = events.TrackedTechnicalDetails!;
    const { container } = render(
      <Component entryId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" locale="en" className="technical-details">
        <summary>Technical details</summary>
        <p>Safe rendered content</p>
        <details data-testid="nested-details"><summary>Nested detail</summary></details>
      </Component>,
    );
    const details = container.querySelector("details")!;
    const nested = container.querySelector('[data-testid="nested-details"]') as HTMLDetailsElement;
    nested.open = true;
    nested.dispatchEvent(new Event("toggle", { bubbles: true }));
    await Promise.resolve();
    expect(recordProductInteractionMock).not.toHaveBeenCalled();

    details.open = true;
    details.dispatchEvent(new Event("toggle", { bubbles: true }));

    await waitFor(() => expect(recordProductInteractionMock).toHaveBeenCalledTimes(1));
    expect(recordProductInteractionMock).toHaveBeenCalledWith(expect.objectContaining({
      name: "technical_details_opened",
      subject: { type: "entry", id: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" },
      properties: {},
    }));
  });
});
