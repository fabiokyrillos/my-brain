import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const actionApplied = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordDayReviewActionApplied: actionApplied,
}));

import { dayReviewVerbsFor } from "./contracts";
import { getDayReviewCopy } from "./copy";
import type { DayReviewProjection } from "./day-review-projection";

type ViewModule = { DayReviewView?: (props: Record<string, unknown>) => React.ReactNode };

const modulePath = `./${"day-review-view"}.tsx`;
const view = await vi.importActual<ViewModule>(modulePath).catch(() => ({})) as ViewModule;

afterEach(cleanup);

const UNDETERMINED = { kind: "undetermined" } as const;
const copy = getDayReviewCopy("en");

function item(id: string, overrides: Record<string, unknown> = {}) {
  const status = (overrides.status as string) ?? "todo";
  return {
    taskId: id,
    title: `Task ${id}`,
    status,
    dueAt: null,
    plannedAt: null,
    completedAt: null,
    sensitivity: UNDETERMINED,
    href: `/en/app/work/${id}`,
    verbs: dayReviewVerbsFor(status),
    ...overrides,
  };
}

function projection(overrides: Partial<DayReviewProjection> = {}): DayReviewProjection {
  return {
    scope: "day",
    tab: "day",
    telemetryScope: "day",
    window: {
      tab: "day",
      startIso: "2026-08-11T03:00:00.000Z",
      endIso: "2026-08-12T03:00:00.000Z",
      startKey: "2026-08-11",
      endKey: "2026-08-11",
      startDate: { year: 2026, month: 8, day: 11 },
      endDate: { year: 2026, month: 8, day: 11 },
    },
    day: "2026-08-11",
    isToday: true,
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
    schedule: {
      dailyAt: "22:00",
      weeklyAt: "19:00",
      weeklyWeekday: 5,
      dailyTimeReached: true,
      weeklyDayReached: false,
    },
    ...overrides,
  } as DayReviewProjection;
}

function mount(overrides: Partial<DayReviewProjection> = {}, props: Record<string, unknown> = {}) {
  expect(view.DayReviewView).toBeTypeOf("function");
  const DayReviewView = view.DayReviewView!;
  return render(<DayReviewView
    action={vi.fn()}
    dateBounds={{ min: "2024-08-11", max: "2028-08-11" }}
    generateControls={<button type="button">Generate this period</button>}
    locale="en"
    periodRange="Tuesday, 11 August 2026"
    projection={projection(overrides)}
    reviewsHref="/en/app/reviews"
    {...props}
  />);
}

/** The tab's empty copy, resolved the same way the view resolves it. */
const emptyCopy = copy.empty("day");

describe("2M-REVIEW-001: it says what it could not read", () => {
  it("says a source could not be read instead of rendering it empty", () => {
    mount({ sourceStates: { completed: "unavailable", planned: "read", due: "read", captured: "read", generated: "read" }, unreadable: ["completed"] });
    const section = screen.getByRole("region", { name: copy.sections.completed });
    expect(within(section).getByText(copy.unavailable(copy.sections.completed))).toBeTruthy();
    // The negative control: the empty sentence is the one thing that must NOT be
    // on screen, because it is a claim about the day rather than about the read.
    expect(within(section).queryByText(emptyCopy.completed)).toBeNull();
  });

  it("says nothing happened only when the read succeeded", () => {
    mount();
    const section = screen.getByRole("region", { name: copy.sections.completed });
    expect(within(section).getByText(emptyCopy.completed)).toBeTruthy();
    expect(within(section).queryByText(copy.unavailable(copy.sections.completed))).toBeNull();
  });

  it("announces the unreadable list, so a screen reader is told too", () => {
    // `2M-ACCESS-004`: a state a sighted user perceives is announced. "Part of
    // this page is missing" is exactly such a state.
    mount({ sourceStates: { completed: "unavailable", planned: "read", due: "read", captured: "read", generated: "read" }, unreadable: ["completed"] });
    const statuses = screen.getAllByRole("status");
    expect(statuses.some((node) => node.textContent?.includes(copy.sections.completed))).toBe(true);
  });

  it("states plainly that everything was read when it was", () => {
    mount();
    expect(screen.getByText(copy.allSourcesRead)).toBeTruthy();
  });

  it("does not render the failure section at all when nothing failed", () => {
    /*
     * The owner's instruction, and the defect behind it: this section used to
     * render on every visit with a "nothing was unreadable" empty state, so a
     * page that succeeded opened with a heading announcing what could not be
     * read.
     */
    mount();
    expect(screen.queryByRole("region", { name: copy.unreadableHeading })).toBeNull();

    // The control: it must still appear when a source really did fail, or this
    // check is passing because the section was deleted outright.
    cleanup();
    mount({
      sourceStates: { completed: "unavailable", planned: "read", due: "read", captured: "read", generated: "read" },
      unreadable: ["completed"],
    });
    expect(screen.getByRole("region", { name: copy.unreadableHeading })).toBeTruthy();
    expect(screen.queryByText(copy.allSourcesRead)).toBeNull();
  });
});

describe("2M-REVIEW-003: the five verbs, on rows that admit them", () => {
  it("offers every verb on an open task", () => {
    mount({ planned: [item("t1")] });
    const region = screen.getByRole("region", { name: copy.sections.planned });
    for (const kind of ["carry_forward", "reschedule", "plan", "archive", "follow_up"] as const) {
      expect(
        region.querySelector(`[data-verb="${kind}"]`),
        `the review does not offer ${kind}`,
      ).not.toBeNull();
    }
  });

  it("offers none on a completed row, because the taxonomy admits none", () => {
    mount({ completed: [item("t2", { status: "completed" })] });
    const region = screen.getByRole("region", { name: copy.sections.completed });
    expect(region.querySelectorAll("[data-verb]")).toHaveLength(0);
  });

  it("proposes the next day for carry-forward, and proposes nothing for plan", () => {
    mount({ planned: [item("t1")] });
    const carry = document.querySelector('[data-verb="carry_forward"] input[type="date"]') as HTMLInputElement;
    const plan = document.querySelector('[data-verb="plan"] input[type="date"]') as HTMLInputElement;
    expect(carry.value).toBe("2026-08-12");
    // `2M-REVIEW-002`: nothing is proposed the user did not ask for. `plan` is
    // the verb where the day is the user's choice, and an empty input is what
    // says so.
    expect(plan.value).toBe("");
  });

  it("preselects `waiting` for follow-up, from the taxonomy's own closed set", () => {
    mount({ planned: [item("t1")] });
    const select = document.querySelector('[data-verb="follow_up"] select') as HTMLSelectElement;
    expect(select.value).toBe("waiting");
    expect([...select.options].map((option) => option.value)).not.toContain("cancelled");
  });

  it("says archiving asks for confirmation, and says it before it happens", () => {
    mount({ planned: [item("t1")] });
    const archive = document.querySelector('[data-verb="archive"]')!;
    expect(archive.textContent).toContain(copy.irreversible);
    for (const kind of ["carry_forward", "plan", "reschedule", "follow_up"] as const) {
      expect(document.querySelector(`[data-verb="${kind}"]`)!.textContent).not.toContain(copy.irreversible);
    }
  });
});

describe("2M-REVIEW-004: no write path lives here", () => {
  it("mounts with no action injected and still renders", () => {
    // The component cannot reach a Server Action of its own, so a render with
    // the injected one absent is a render with no write path at all.
    expect(() => mount({ planned: [item("t1")] }, { action: undefined })).not.toThrow();
  });
});

describe("2M-REVIEW-006 and -007: the preferences are said back, and nothing is scheduled", () => {
  it("repeats the promise that nothing runs from a configured schedule", () => {
    mount();
    expect(screen.getByText(copy.nothingScheduled)).toBeTruthy();
  });

  it("reads the daily review time back to the user", () => {
    mount();
    expect(screen.getByText(copy.schedule.dailyAfter("22:00"))).toBeTruthy();
  });

  it("says the time has not arrived when it has not", () => {
    mount({ schedule: { dailyAt: "22:00", weeklyAt: "19:00", weeklyWeekday: 5, dailyTimeReached: false, weeklyDayReached: false } });
    expect(screen.getByText(copy.schedule.dailyBefore("22:00"))).toBeTruthy();
  });

  it("says nothing rather than something wrong when the preference is unreadable", () => {
    mount({ schedule: { dailyAt: null, weeklyAt: null, weeklyWeekday: null, dailyTimeReached: false, weeklyDayReached: false } });
    expect(screen.getByText(copy.schedule.dailyUnknown)).toBeTruthy();
    expect(screen.getByText(copy.schedule.weeklyUnknown)).toBeTruthy();
  });
});

const storedReview = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: "Resumo",
  periodType: "daily" as const,
  tab: "day" as const,
  periodLabel: "Daily summary",
  statusLabel: "Completed",
  statusTone: "positive" as const,
  periodLabelRange: "11/08/2026 — 11/08/2026",
  periodStart: "2026-08-11",
  periodEnd: "2026-08-11",
  ...overrides,
});

describe("2M-REVIEW-008: a stored review renders through the contract's own fields", () => {
  it("renders the contract's labels and no formatting of its own", () => {
    mount({ generated: [storedReview("r1")] });
    const region = screen.getByRole("region", { name: copy.generatedHeading("day") });
    expect(within(region).getByText("Daily summary")).toBeTruthy();
    expect(within(region).getByText("11/08/2026 — 11/08/2026")).toBeTruthy();
  });

  it("links each review to its own page instead of back to this one", () => {
    // The surface used to end with an anchor to `/app/reviews` — the page it was
    // already on — and the words were disclosed inside the list below.
    mount({ generated: [storedReview("r1")] });
    const region = screen.getByRole("region", { name: copy.generatedHeading("day") });
    const link = within(region).getByRole("link", { name: new RegExp(copy.openReview) });
    expect(link.getAttribute("href")).toBe("/en/app/reviews/r1");
    expect(within(region).queryByRole("link", { name: /see every review/i })).toBeNull();
    // The name says WHICH review, not just that there is one — several of
    // these stand on a week's tab, and identical names make the list
    // untraversable by a screen reader.
    expect(link.getAttribute("aria-label")).toContain("Daily summary");
    expect(link.getAttribute("aria-label")).toContain("11/08/2026 — 11/08/2026");
  });

  it("renders every snapshot of the period, not just the newest", () => {
    mount({
      generated: [
        storedReview("newer"),
        storedReview("older", { periodEnd: "2026-08-10", periodLabelRange: "10/08/2026 — 10/08/2026" }),
      ],
    });
    const region = screen.getByRole("region", { name: copy.generatedHeading("day") });
    const links = within(region).getAllByRole("link", { name: new RegExp(copy.openReview) });
    expect(links).toHaveLength(2);
    // …and the two are distinguishable by name, which is the whole point of
    // rendering both rather than only the newest.
    const names = links.map((link) => link.getAttribute("aria-label"));
    expect(new Set(names).size, `two links share one accessible name: ${names.join(" | ")}`).toBe(2);
  });

  it("mounts the generate controls inside the period's own section", () => {
    // They used to sit in an undifferentiated row of four below the history,
    // describing no period at all.
    mount();
    const region = screen.getByRole("region", { name: copy.generatedHeading("day") });
    expect(within(region).getByRole("button", { name: "Generate this period" })).toBeTruthy();
  });
});

describe("2M-ACCESS-004 and 2M-MOBILE-004: one announcement, above every list", () => {
  it("mounts exactly one outcome region, outside the lists", () => {
    mount({ planned: [item("t1")], due: [item("t2")] });
    // The lesson slices 2M.1 and 2M.2 paid for: an affordance anchored to a row
    // cannot survive an operation that moves the row. There is one region, and
    // it is not inside either list.
    const lists = screen.getAllByRole("region").filter((node) => node.className.includes("day-review-section"));
    for (const list of lists) {
      expect(list.querySelector(".calendar-outcome"), "an outcome region is nested inside a list").toBeNull();
    }
  });

  it("labels every region, so the page has an outline a screen reader can use", () => {
    mount();
    for (const name of [copy.schedule.heading, copy.sections.completed, copy.sections.planned, copy.sections.due, copy.sections.captured, copy.generatedHeading("day")]) {
      expect(screen.getByRole("region", { name }), `${name} is not a labelled region`).toBeTruthy();
    }
  });

  it("marks the current scope for assistive technology, not only visually", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: copy.scopeLabel });
    const current = within(nav).getByText(copy.scopes.day);
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByText(copy.scopes.next_day).getAttribute("aria-current")).toBeNull();
  });
});

describe("2M-PRIVACY: no title reaches the DOM unprotected", () => {
  it("routes a classified title through the protection component", () => {
    mount({ planned: [item("t1", { sensitivity: { kind: "derived", level: "highly_sensitive" } })] });
    // The masked case is the honest assertion: a classified title must not be
    // readable as text on the page.
    expect(screen.queryByText("Task t1")).toBeNull();
  });

  it("renders an undetermined title, so the masking is not vacuous", () => {
    mount({ planned: [item("t1")] });
    expect(screen.getByText("Task t1")).toBeTruthy();
  });
});
