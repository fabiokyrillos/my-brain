import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `server-only` is mocked away because slice 2M.3 mounts the day review on this
 * route, and the day review's projection carries the `server-only` guard every
 * other projection does. That guard throws when the module graph is loaded from
 * a client context, which is what a component test is. The other projections on
 * this page are replaced by mocks below; this is the same substitution, one
 * level down.
 */
vi.mock("server-only", () => ({}));

import { loadDayReviewProjection } from "@/features/day-review/day-review-projection";
import { loadReviewListProjection } from "@/features/reviews/review-list";
import { requireUser } from "@/lib/auth/require-user";
import ReviewsPage from "./page";

vi.mock("@/features/reviews/review-list", () => ({ loadReviewListProjection: vi.fn() }));
vi.mock("@/features/day-review/day-review-projection", () => ({ loadDayReviewProjection: vi.fn() }));
vi.mock("@/features/calendar/calendar-projection", () => ({ requireProfileTimeZone: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/agent/actions", () => ({ generateReview: vi.fn() }));
vi.mock("@/features/task-commands/detail-actions", () => ({ applyTaskDetailCommand: vi.fn() }));
vi.mock("@/features/task-commands/actions", () => ({ undoWorkOperation: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), notFound: () => { throw new Error("notFound"); } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const dayReview = (scope: "day" | "next_day" = "day") => ({
  scope,
  day: "2026-08-11",
  isToday: scope === "day",
  timezone: "America/Sao_Paulo",
  nextDay: "2026-08-12",
  completed: [],
  planned: [],
  due: [],
  captured: [],
  generated: null,
  sourceStates: { completed: "read", planned: "read", due: "read", captured: "read", generated: "read" },
  unreadable: [],
  truncated: [],
  schedule: { dailyAt: "22:00", weeklyAt: "19:00", weeklyWeekday: 5, dailyTimeReached: true, weeklyDayReached: false },
});

describe("ReviewsPage", () => {
  it("renders localized product copy from the owner-scoped projection", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    vi.mocked(loadReviewListProjection).mockResolvedValue({ items: [{
      id: "review-1",
      title: "Weekly focus",
      content: "Keep the Atlas proposal moving.",
      periodLabel: "Weekly review",
      statusLabel: "Completed",
      statusTone: "positive",
      periodLabelRange: "07/13/2026 — 07/19/2026",
    }], hasNext: false });

    render(await ReviewsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));

    expect(loadReviewListProjection).toHaveBeenCalledWith({}, { userId: "user-1", locale: "en", page: 1 });
    expect(screen.getByText("Weekly review", { selector: ".review-card span" })).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByText("weekly_review")).not.toBeInTheDocument();
    expect(screen.queryByText(/gpt-/i)).not.toBeInTheDocument();
  });

  it("mounts the day review on the surface reviews already had", async () => {
    // `2M-REVIEW-001`. The generated list keeps its place below; the composed
    // review is above it, on the same route, rather than on a second one.
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    vi.mocked(loadReviewListProjection).mockResolvedValue({ items: [], hasNext: false });

    render(await ReviewsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Day review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviews" })).toBeInTheDocument();
    // `2M-REVIEW-007`: the promise is still made, in the locale being rendered.
    expect(screen.getAllByText(/nothing runs from a configured schedule/i).length).toBeGreaterThan(0);
  });

  /*
    The independent review's fourth finding. The first repair demoted the day
    review's `<h1>` to an `<h2>`, which made the *count* right and left the
    *order* wrong: the page still opened at level two, several screens above its
    own name.

    Asserted as a level sequence rather than as "there is one h1", because the
    count is exactly what the previous repair already satisfied.
  */
  it("opens on its own name and nests the review under it", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    vi.mocked(loadReviewListProjection).mockResolvedValue({ items: [], hasNext: false });

    const { container } = render(
      await ReviewsPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }),
    );

    const headings = Array.from(container.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    expect(headings[0]?.tagName).toBe("H1");
    expect(headings[0]).toHaveTextContent("Reviews");
    expect(headings.filter((heading) => heading.tagName === "H1")).toHaveLength(1);
    // No level is skipped, in either direction — the failure a heading demotion
    // trades one violation for is a jump from h2 straight to h4.
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
    for (const [index, level] of levels.entries()) {
      if (index === 0) continue;
      expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
    }
  });

  it("fails closed to the day scope rather than guessing from a malformed parameter", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    vi.mocked(loadReviewListProjection).mockResolvedValue({ items: [], hasNext: false });

    render(await ReviewsPage({
      params: Promise.resolve({ locale: "en" }),
      // A repeated parameter arrives as an array; an invented one is not a scope.
      searchParams: Promise.resolve({ scope: ["day", "next_day"] as unknown as string }),
    }));

    expect(vi.mocked(loadDayReviewProjection).mock.calls[0][1]).toMatchObject({ scope: "day" });
  });

  it("reads the next-day scope when it is asked for", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("next_day") as never);
    vi.mocked(loadReviewListProjection).mockResolvedValue({ items: [], hasNext: false });

    render(await ReviewsPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ scope: "next_day" }),
    }));

    expect(vi.mocked(loadDayReviewProjection).mock.calls[0][1]).toMatchObject({ scope: "next_day" });
    expect(screen.getByRole("heading", { name: "Next-day review" })).toBeInTheDocument();
  });
});
