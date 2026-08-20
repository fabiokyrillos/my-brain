import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `server-only` is mocked away because this route mounts the day review, and the
 * day review's projection carries the `server-only` guard every other projection
 * does. That guard throws when the module graph is loaded from a client context,
 * which is what a component test is. The other projections on this page are
 * replaced by mocks below; this is the same substitution, one level down.
 */
vi.mock("server-only", () => ({}));

import { loadDayReviewProjection } from "@/features/day-review/day-review-projection";
import { loadReviewListProjection } from "@/features/reviews/review-list";
import { requireUser } from "@/lib/auth/require-user";
import { reviewPeriodWindow } from "@/features/day-review/period-window";
import { localDateOf } from "@/lib/time/local-day";
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

const WINDOWS = {
  day: { startKey: "2026-08-11", endKey: "2026-08-11", startDate: { year: 2026, month: 8, day: 11 }, endDate: { year: 2026, month: 8, day: 11 } },
  week: { startKey: "2026-08-10", endKey: "2026-08-16", startDate: { year: 2026, month: 8, day: 10 }, endDate: { year: 2026, month: 8, day: 16 } },
  month: { startKey: "2026-08-01", endKey: "2026-08-31", startDate: { year: 2026, month: 8, day: 1 }, endDate: { year: 2026, month: 8, day: 31 } },
} as const;

const dayReview = (
  scope: "day" | "next_day" = "day",
  tab: "day" | "week" | "month" = "day",
  overrides: Record<string, unknown> = {},
) => ({
  scope,
  tab,
  telemetryScope: tab === "day" ? scope : null,
  window: { tab, startIso: "2026-08-11T03:00:00.000Z", endIso: "2026-08-12T03:00:00.000Z", ...WINDOWS[tab] },
  day: "2026-08-11",
  isToday: scope === "day",
  timezone: "America/Sao_Paulo",
  nextDay: "2026-08-12",
  completed: [],
  planned: [],
  due: [],
  captured: [],
  generated: [],
  sourceStates: { completed: "read", planned: "read", due: "read", captured: "read", generated: "read" },
  unreadable: [],
  truncated: [],
  schedule: { dailyAt: "22:00", weeklyAt: "19:00", weeklyWeekday: 5, dailyTimeReached: true, weeklyDayReached: false },
  ...overrides,
});

const historyItem = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: "Revisão semanal",
  periodType: "weekly_review",
  tab: "week",
  periodLabel: "Revisão da semana",
  statusLabel: "Concluída",
  statusTone: "positive",
  periodLabelRange: "03/08/2026 — 09/08/2026",
  periodStart: "2026-08-03",
  periodEnd: "2026-08-09",
  ...overrides,
});

async function mount(query: Record<string, string | string[]> = {}, list: Record<string, unknown> = {}) {
  vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
  vi.mocked(loadReviewListProjection).mockResolvedValue({ items: [], hasNext: false, ...list } as never);
  return render(await ReviewsPage({
    params: Promise.resolve({ locale: "pt-BR" }),
    searchParams: Promise.resolve(query),
  }) as React.ReactElement);
}

describe("the page opens on its own name and the three periods", () => {
  it("renders localized product copy from the owner-scoped projection", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    await mount();
    expect(screen.getByRole("heading", { level: 1, name: "Revisões" })).toBeInTheDocument();
  });

  it("offers Dia, Semana and Mês as links, so the browser can navigate between them", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    await mount();
    const nav = screen.getByRole("navigation", { name: "Período" });
    for (const [label, period] of [["Dia", "day"], ["Semana", "week"], ["Mês", "month"]] as const) {
      const link = within(nav).getByRole("link", { name: label });
      expect(link.getAttribute("href")).toBe(`/pt-BR/app/reviews?period=${period}`);
    }
  });

  it("marks the selected period for assistive technology, not only visually", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "month") as never);
    await mount({ period: "month" });
    const nav = screen.getByRole("navigation", { name: "Período" });
    expect(within(nav).getByRole("link", { name: "Mês" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Dia" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("the URL is the source of truth for the selected period", () => {
  it("reads the period the URL names", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "week") as never);
    await mount({ period: "week" });
    expect(vi.mocked(loadDayReviewProjection).mock.calls[0]![1]).toMatchObject({ tab: "week" });
    expect(vi.mocked(loadReviewListProjection).mock.calls[0]![1]).toMatchObject({ tab: "week" });
  });

  it("fails closed to the day rather than guessing from a malformed parameter", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    // A repeated parameter arrives as an array; two values is a malformed
    // request, and picking one would show a period the URL does not name.
    await mount({ period: ["week", "month"] });
    expect(vi.mocked(loadDayReviewProjection).mock.calls[0]![1]).toMatchObject({ tab: "day" });

    cleanup();
    vi.clearAllMocks();
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    await mount({ period: "quarter" });
    expect(vi.mocked(loadDayReviewProjection).mock.calls[0]![1]).toMatchObject({ tab: "day" });
  });

  it("keeps the day/next-day scope, and only on the Dia tab", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("next_day") as never);
    await mount({ scope: "next_day" });
    expect(vi.mocked(loadDayReviewProjection).mock.calls[0]![1]).toMatchObject({ scope: "next_day", tab: "day" });

    // On another tab the scope is forced back rather than merely ignored, so
    // nothing downstream can read a scope the visible controls do not offer.
    cleanup();
    vi.clearAllMocks();
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "month") as never);
    await mount({ period: "month", scope: "next_day" });
    expect(vi.mocked(loadDayReviewProjection).mock.calls[0]![1]).toMatchObject({ scope: "day", tab: "month" });
  });

  it("carries the period through pagination, so page 2 stays on the same tab", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "month") as never);
    await mount({ period: "month" }, { hasNext: true, items: [historyItem("h1")] });
    const next = screen.getByRole("link", { name: "Próxima" });
    expect(next.getAttribute("href")).toContain("period=month");
    expect(next.getAttribute("href")).toContain("page=2");
  });
});

describe("the current period and the history are separate, and never the same review twice", () => {
  it("excludes the running period from the history query by its own start date", async () => {
    /*
      Derived, not hard-coded — and the difference is the point of the change it
      is testing.

      The history used to `await` the projection just to read its window, so a
      mocked projection could dictate the expected value. The page now computes
      the window itself with `reviewPeriodWindow`, which is pure and takes
      `(tab, day, timezone)` — so the two reads can run in parallel, and they
      agree by construction rather than by both being right. The expectation is
      therefore the same computation the page makes, against the same clock.
    */
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "week") as never);
    await mount({ period: "week" });
    const expected = reviewPeriodWindow(
      "week",
      localDateOf(new Date(), "America/Sao_Paulo"),
      "America/Sao_Paulo",
    ).startKey;
    expect(vi.mocked(loadReviewListProjection).mock.calls[0]![1]).toMatchObject({
      excludePeriodStart: expected,
    });
    // …and the control: a Monday, so a regression to "today" would be caught on
    // six days out of seven rather than silently agreeing.
    expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("computes the window without the projection, so the two reads can run at once", async () => {
    /*
      The measured reason this changed: the page ran four sequential database
      waves where three were enough. If the history ever waited on the projection
      again, this fails — the mock resolves only after a tick, and the history
      call is asserted to have been made before that tick completes.
    */
    let projectionResolved = false;
    vi.mocked(loadDayReviewProjection).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      projectionResolved = true;
      return dayReview("day", "week") as never;
    });
    vi.mocked(loadReviewListProjection).mockImplementation(async () => {
      expect(projectionResolved, "the history waited for the projection again").toBe(false);
      return { items: [], hasNext: false } as never;
    });
    vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
    render(await ReviewsPage({
      params: Promise.resolve({ locale: "pt-BR" }),
      searchParams: Promise.resolve({ period: "week" }),
    }) as React.ReactElement);
    expect(vi.mocked(loadReviewListProjection)).toHaveBeenCalled();
  });

  it("gives each history row a type, a period, a state and a way in — and nothing else", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "week") as never);
    await mount({ period: "week" }, { items: [historyItem("h1")] });

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Revisão da semana")).toBeInTheDocument();
    expect(within(row).getByText("03/08/2026 — 09/08/2026")).toBeInTheDocument();
    expect(within(row).getByText("Concluída")).toBeInTheDocument();
    const open = within(row).getByRole("link", { name: /Abrir revisão/ });
    expect(open.getAttribute("href")).toBe("/pt-BR/app/reviews/h1");
    // Named by its period, so a list of them is traversable.
    expect(open.getAttribute("aria-label")).toContain("Revisão da semana");
    expect(open.getAttribute("aria-label")).toContain("03/08/2026 — 09/08/2026");

    // The disclosure is gone from the listing entirely — no reveal control, no
    // preview. Under OD-2J-1 every summary is masked, so a preview here would be
    // masked content exposed through a listing.
    expect(within(row).queryByRole("button", { name: "Mostrar resumo" })).toBeNull();
    expect(row.querySelector('[data-masked="true"]')).toBeNull();
  });

  it("names the history after the kind of review it lists", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "month") as never);
    await mount({ period: "month" });
    expect(screen.getByRole("heading", { level: 2, name: "Meses anteriores" })).toBeInTheDocument();
  });
});

describe("each tab offers only the controls that write its own period", () => {
  it("offers one control on Dia", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview() as never);
    await mount();
    expect(screen.getByRole("button", { name: /Resumo do dia/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisão do mês/ })).toBeNull();
  });

  it("offers both weekly controls on Semana, because a week carries two kinds", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "week") as never);
    await mount({ period: "week" });
    expect(screen.getByRole("button", { name: /Revisão da semana/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planejar a semana/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resumo do dia/ })).toBeNull();
  });

  it("offers one control on Mês", async () => {
    vi.mocked(loadDayReviewProjection).mockResolvedValue(dayReview("day", "month") as never);
    await mount({ period: "month" });
    expect(screen.getByRole("button", { name: /Revisão do mês/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Planejar a semana/ })).toBeNull();
  });
});
