import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadReviewListProjection } from "@/features/reviews/review-list";
import { requireUser } from "@/lib/auth/require-user";
import ReviewsPage from "./page";

vi.mock("@/features/reviews/review-list", () => ({ loadReviewListProjection: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/agent/actions", () => ({ generateReview: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ReviewsPage", () => {
  it("renders localized product copy from the owner-scoped projection", async () => {
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
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
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("weekly_review")).not.toBeInTheDocument();
    expect(screen.queryByText(/gpt-/i)).not.toBeInTheDocument();
  });
});
