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
/*
  Three actions now, not one. Slice 2P.3 gave Today the same composer the
  capture page mounts, so this Server Component hands it the attachment and
  transcription actions too -- and both of their modules import `server-only`,
  which throws the moment jsdom reaches it. Mocking the composer alone is not
  enough: the page imports the actions itself, before React ever renders.
*/
vi.mock("@/features/agent/actions", () => ({ uploadAttachment: vi.fn() }));
vi.mock("@/features/capture/transcribe-action", () => ({ transcribeRecording: vi.fn() }));
vi.mock("@/features/capture/composer", () => ({
  Composer: () => <div data-testid="capture">capture</div>,
}));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: async () => "Brain" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ supabase: {}, user: { id: "user-1" } }),
}));

const loadWorkProjection = vi.fn();
const loadHomeSupplementalProjection = vi.fn();
const loadInboxProjection = vi.fn();
const loadAttentionProjection = vi.fn();
const loadMemoryConflicts = vi.fn();
const loadHomeAgendaProjection = vi.fn();
const loadOnboardingPath = vi.fn();

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
/*
  `2N-CONFLICT-003` joined this contract in 2N.4. Hoje now composes **five**
  independent reads, and the conflict derivation is the newest — so it is the one
  most likely to be the section that takes the page down if it is not isolated
  like the other four.
*/
vi.mock("@/features/daily-cycle/conflict-projection", () => ({
  loadMemoryConflicts: (...args: unknown[]) => loadMemoryConflicts(...args),
  CONFLICT_SCAN_LIMIT: 200,
  CONFLICT_PAGE_SIZE: 20,
}));
/*
  The Papel e Console redesign adds "Adiante", so Hoje now composes **six**
  independent reads. This one is the likeliest of them all to throw in
  production: `loadCalendarProjection` raises on an unsupported profile timezone
  (`2M-TIME-003`) rather than guessing a zone, so a single bad `profiles.timezone`
  row would have taken the whole cockpit down — capture box included — if it were
  not isolated like the other five.
*/
vi.mock("@/features/daily-cycle/home-agenda", () => ({
  loadHomeAgendaProjection: (...args: unknown[]) => loadHomeAgendaProjection(...args),
  EMPTY_HOME_AGENDA: { items: [], hasMore: false, timezone: "UTC" },
  HOME_AGENDA_LIMIT: 5,
}));
/*
  `2O-ONBOARD-001` makes Hoje compose **seven** independent reads. The guided
  path is an *offer*, and an offer that could take the cockpit down with it
  would be exactly the imposition the requirement forbids — so it gets the same
  isolation as the other six.

  Mocked rather than left alone for a second reason: `onboarding-view.ts` is
  `server-only` and this suite renders `HomeDashboard` as a client module, so an
  unmocked import fails the whole **file** — zero tests, which reports as a
  failing file and not as a failing assertion. Every server module this
  dashboard reaches is mocked here for that reason.
*/
vi.mock("@/features/onboarding/onboarding-view", () => ({
  loadOnboardingPath: (...args: unknown[]) => loadOnboardingPath(...args),
}));
vi.mock("@/features/onboarding/actions", () => ({
  dismissOnboarding: vi.fn(),
  restoreOnboarding: vi.fn(),
}));

import { HomeDashboard } from "./home-dashboard";

function healthy() {
  loadWorkProjection.mockResolvedValue({ items: [], hasNext: false, timezone: "America/Sao_Paulo", editControlsByTaskId: {}, statusByTaskId: {} });
  loadHomeSupplementalProjection.mockResolvedValue({ waitingCount: 0, openQuestionPreview: null });
  loadInboxProjection.mockResolvedValue({ items: [], hasNext: false });
  loadAttentionProjection.mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  loadMemoryConflicts.mockResolvedValue({ items: [], bounded: false, limit: 20 });
  loadHomeAgendaProjection.mockResolvedValue({ items: [], hasMore: false, timezone: "America/Sao_Paulo" });
  // A finished path: the panel renders nothing, which is the healthy shape for
  // every other test in this file that is not about onboarding.
  loadOnboardingPath.mockResolvedValue({
    steps: [],
    nextStep: null,
    satisfiedCount: 0,
    total: 0,
    complete: "yes",
    credential: "satisfied",
    offered: false,
  });
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
  ["conflicts", loadMemoryConflicts],
  ["agenda", loadHomeAgendaProjection],
  ["onboarding", loadOnboardingPath],
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

  it("renders the guided path when it loads, so its absence above is a failure and not a default", async () => {
    // Without this, every assertion in the `onboarding` row of `PROJECTIONS`
    // would pass over a panel that never renders under any circumstances.
    loadOnboardingPath.mockResolvedValue({
      steps: [
        { key: "entry_captured", order: 1, state: "unsatisfied", destination: "capture", needsCredential: false },
      ],
      nextStep: { key: "entry_captured", order: 1, state: "unsatisfied", destination: "capture", needsCredential: false },
      satisfiedCount: 0,
      total: 1,
      complete: "no",
      credential: "satisfied",
      offered: true,
    });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    expect(container.querySelector('[data-onboarding="offered"]')).not.toBeNull();
    expect(screen.getByTestId("capture")).toBeInTheDocument();
  });

  it("renders no guided path when its read throws, and keeps the cockpit", async () => {
    loadOnboardingPath.mockRejectedValue(new Error("onboarding unavailable"));

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    expect(container.querySelector('[data-onboarding="offered"]')).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
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
          sensitivity: { kind: "undetermined" },
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
