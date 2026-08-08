/**
 * `2J-HOJE-010` — one broken projection must not cost the user their day.
 *
 * Hoje composes four independent reads. Before this slice they were awaited with
 * `Promise.all`, so a timeout on the waiting count or a schema-cache miss on the
 * attention RPC threw, the route's error boundary caught it, and the whole
 * surface disappeared — including the capture box, which is the one thing the
 * user came for and the one read that had not failed.
 *
 * These tests fail each projection in turn and assert the rest still renders.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
  NeedsAttentionViewed: () => null,
}));
vi.mock("@/features/capture/actions", () => ({ captureEntry: vi.fn() }));
vi.mock("@/features/capture/quick-capture-form", () => ({
  QuickCaptureForm: () => <div data-testid="capture">capture</div>,
}));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: async () => "Brain" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ supabase: {}, user: { id: "user-1" } }),
}));

const loadWorkProjection = vi.fn();
const loadHomeSupplementalProjection = vi.fn();
const loadInboxProjection = vi.fn();
const loadAttentionProjection = vi.fn();

vi.mock("@/features/daily-cycle/work-projection", () => ({
  loadWorkProjection: (...args: unknown[]) => loadWorkProjection(...args),
}));
vi.mock("@/features/daily-cycle/home-projection", () => ({
  loadHomeSupplementalProjection: (...args: unknown[]) => loadHomeSupplementalProjection(...args),
}));
vi.mock("@/features/daily-cycle/inbox-projection", () => ({
  loadInboxProjection: (...args: unknown[]) => loadInboxProjection(...args),
}));
vi.mock("@/features/daily-cycle/attention-projection", () => ({
  loadAttentionProjection: (...args: unknown[]) => loadAttentionProjection(...args),
  ATTENTION_PAGE_SIZE: 20,
}));

import { HomeDashboard } from "./home-dashboard";

function healthy() {
  loadWorkProjection.mockResolvedValue({ items: [], hasNext: false, timezone: "America/Sao_Paulo" });
  loadHomeSupplementalProjection.mockResolvedValue({ waitingCount: 0, openQuestionPreview: null });
  loadInboxProjection.mockResolvedValue({ items: [], hasNext: false });
  loadAttentionProjection.mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  healthy();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PROJECTIONS = [
  ["work", loadWorkProjection],
  ["supplemental", loadHomeSupplementalProjection],
  ["inbox", loadInboxProjection],
  ["attention", loadAttentionProjection],
] as const;

describe("2J-HOJE-010: a failing section degrades that section only", () => {
  it.each(PROJECTIONS)("still renders Hoje when the %s projection throws", async (_name, mock) => {
    mock.mockRejectedValue(new Error("projection unavailable"));

    render(await HomeDashboard({ locale: "pt-BR" }));

    // The greeting is the page. If this is present, Hoje rendered.
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    // And the thing the user came for is still there.
    expect(screen.getByTestId("capture")).toBeInTheDocument();
  });

  it("keeps the surviving sections' content when one fails", async () => {
    loadAttentionProjection.mockRejectedValue(new Error("attention rpc unavailable"));
    loadWorkProjection.mockResolvedValue({
      items: [
        {
          taskId: "t1",
          title: "Enviar o contrato",
          dueAt: "2020-01-01T00:00:00.000Z",
          intentionalNoDue: false,
          humanState: "not_started",
          origin: "you",
          availableActions: [],
          projects: [],
          contexts: [],
          people: [],
          waitingOnPeople: [],
        },
      ],
      hasNext: false,
      timezone: "America/Sao_Paulo",
    });

    render(await HomeDashboard({ locale: "pt-BR" }));

    // Work survived and is rendered; attention degraded to its quiet state.
    expect(screen.getByText("Enviar o contrato")).toBeInTheDocument();
    expect(screen.getByText("Nada precisa de você agora.")).toBeInTheDocument();
  });

  it("says which projection failed, so an empty section is findable", async () => {
    // Degrading silently would trade a visible outage for an invisible one: a
    // section empty for a week because something is broken must be findable.
    const error = vi.spyOn(console, "error");
    loadInboxProjection.mockRejectedValue(new Error("inbox unavailable"));

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]?.[0])).toContain("inbox");
  });

  it("renders normally when every projection succeeds", async () => {
    render(await HomeDashboard({ locale: "pt-BR" }));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(console.error).not.toHaveBeenCalled();
  });
});
