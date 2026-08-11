import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlannedAtCopy } from "@/features/planning/planned-at";
import type { WorkItemView } from "./contracts";

vi.mock("server-only", () => ({}));
// `TaskList` became a Client Component in Slice 2F.2 (2F-SURFACE-010) and reaches
// `useRouter` for the refusal path's refresh affordance. There is no app router
// mounted under `render`, so the hook is stubbed here — the affordance's own
// behaviour is asserted in `operations/task-list.test.tsx`.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const workViewViewed = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/features/product-analytics/interaction-events", () => ({
  WorkViewViewed: workViewViewed,
}));

type WorkViewModule = {
  WorkView?: (props: {
    agentName: string;
    locale: "pt-BR" | "en";
    timezone: string;
    view: "today" | "all" | "waiting";
    page: number;
    items: readonly WorkItemView[];
    hasNext: boolean;
    query?: Record<string, unknown>;
    positionAdjusted?: boolean;
  }) => React.ReactNode;
};

const modulePath = `./${"work-view"}.tsx`;
const workViewModule = await vi.importActual<WorkViewModule>(modulePath).catch(() => ({})) as WorkViewModule;

afterEach(cleanup);

function renderWork(overrides: Partial<Parameters<NonNullable<WorkViewModule["WorkView"]>>[0]> = {}) {
  expect(workViewModule.WorkView).toBeTypeOf("function");
  const WorkView = workViewModule.WorkView!;
  return render(<WorkView
    agentName="Brain"
    locale="en"
    timezone="America/Sao_Paulo"
    view="all"
    page={1}
    items={[]}
    hasNext={false}
    {...overrides}
  />);
}

describe("WorkView", () => {
  it("records the visible work view with its canonical filter", () => {
    renderWork({ locale: "en", view: "waiting" });

    expect(workViewViewed).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", view: "waiting" }),
      undefined,
    );
  });

  it("localizes the accessible view control and marks the active view", () => {
    renderWork({ locale: "pt-BR", view: "today" });

    const navigation = screen.getByRole("navigation", { name: "Visões de Trabalho" });
    expect(within(navigation).getByRole("link", { name: "Hoje" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Todas" })).not.toHaveAttribute("aria-current");
    expect(within(navigation).getByRole("link", { name: "Aguardando" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Prazos de hoje e atrasos que ainda estão abertos.")).toBeVisible();
  });

  it("preserves manual task creation on the canonical surface", () => {
    renderWork({ locale: "en", view: "all" });

    expect(screen.getByLabelText("New task")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add new task" })).toBeVisible();
  });

  it("renders localized human state, origin, due date, and existing mutation actions without raw enums", () => {
    renderWork({
      locale: "en",
      timezone: "America/New_York",
      items: [{
        taskId: "task-1",
        title: "Send proposal",
        dueAt: "2026-07-19T01:00:00.000Z",
        intentionalNoDue: false,
        humanState: "waiting_on_someone",
        origin: "brain",
        availableActions: [{ id: "complete_task" }, { id: "resume_task" }],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" } as const,
      }],
    });

    expect(screen.getByText("Waiting on someone")).toBeVisible();
    expect(screen.getByText("Suggested by Brain")).toBeVisible();
    expect(screen.getByText("7/18/26, 9:00 PM")).toBeVisible();
    expect(screen.queryByText("waiting_on_someone")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume" })).toBeVisible();
    // **Inverted by Slice 2F.2, deliberately.** This used to assert that a
    // server-rendered `operationKey` hidden input carried a uuid. 2F-SURFACE-006
    // forbids exactly that: the key is now minted client-side once per
    // (row, action) and set on the FormData at submit time, because a
    // client-minted value in the markup would hydration-mismatch against the SSR
    // value on every row. Its lifecycle is asserted in
    // `operations/task-list.test.tsx`.
    expect(document.querySelector('input[name="operationKey"]')).toBeNull();
    // The rendered title travels instead — as the resolution *query hint*, never
    // as a gate (2F-SURFACE-004).
    expect(document.querySelector('input[name="title"]')).toHaveValue("Send proposal");
  });

  it("renders planned date, priority, and an intentional no-due indicator (Slice 2C.2)", () => {
    renderWork({
      locale: "en",
      timezone: "America/New_York",
      items: [{
        taskId: "task-1",
        title: "Send proposal",
        plannedAt: "2026-07-25T14:00:00.000Z",
        priority: "urgent",
        intentionalNoDue: true,
        noDueReason: "Someday, not now",
        humanState: "not_started",
        origin: "you",
        availableActions: [],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" } as const,
      }],
    });

    // `2M-PLAN-001`: the prefix is the declared one now, and the value is a
    // date with no clock component — a day the user chose, not a time they
    // reserved.
    expect(screen.getByText(new RegExp(getPlannedAtCopy("en").prefix))).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(screen.getByText("No due date")).toBeVisible();
    expect(screen.getByText("Someday, not now")).toBeVisible();
  });

  it("omits planning/priority/no-due indicators for a task that never set them", () => {
    renderWork({
      locale: "en",
      items: [{
        taskId: "task-1",
        title: "Send proposal",
        dueAt: "2026-07-19T01:00:00.000Z",
        intentionalNoDue: false,
        humanState: "not_started",
        origin: "you",
        availableActions: [],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" } as const,
      }],
    });

    expect(screen.queryByText(new RegExp(getPlannedAtCopy("en").prefix))).not.toBeInTheDocument();
    expect(screen.queryByText("No due date")).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Low|Medium|High|Urgent)$/)).not.toBeInTheDocument();
  });

  it("renders owned project, context, person, and waiting-on relations (Slice 2C.3)", () => {
    renderWork({
      locale: "en",
      items: [{
        taskId: "task-1",
        title: "Send proposal",
        intentionalNoDue: false,
        humanState: "not_started",
        origin: "you",
        availableActions: [],
        projects: [{ id: "project-1", label: "Website relaunch" }],
        contexts: [{ id: "context-1", label: "Deep Work" }],
        people: [{ id: "person-1", label: "Alice" }],
        waitingOnPeople: [{ id: "person-2", label: "Bob" }],
        sensitivity: { kind: "undetermined" } as const,
      }],
    });

    expect(screen.getByText("Website relaunch")).toBeVisible();
    expect(screen.getByText("Deep Work")).toBeVisible();
    expect(screen.getByText("Alice")).toBeVisible();
    expect(screen.getByText("Waiting on: Bob")).toBeVisible();
  });

  it("renders no relation badges for a task with no owned relations", () => {
    renderWork({
      locale: "en",
      items: [{
        taskId: "task-1",
        title: "Send proposal",
        intentionalNoDue: false,
        humanState: "not_started",
        origin: "you",
        availableActions: [],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" } as const,
      }],
    });

    expect(screen.queryByText(/Waiting on:/)).not.toBeInTheDocument();
  });

  it("explains the intentionally limited Waiting view without presenting a fake follow-up control", () => {
    renderWork({ locale: "en", view: "waiting" });

    expect(screen.getByText("Person context and complete follow-up will arrive in a later phase.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /follow-up/i })).not.toBeInTheDocument();
  });

  it("preserves the active view in page-based pagination URLs", () => {
    renderWork({ locale: "en", view: "waiting", page: 2, hasNext: true });

    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/en/app/work?view=waiting&page=1",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/en/app/work?view=waiting&page=3",
    );
  });
});

/* -------------------------------------------------------------------------- *
 * `2L-VIEW-004`/`-005`/`-006`/`-007`/`-009` and `2L-RETURN-005` — the URL is
 * the state, on screen.
 * -------------------------------------------------------------------------- */

describe("WorkView: narrowing, grouping and the position", () => {
  const query = {
    view: "all" as const,
    state: "open" as const,
    due: "any" as const,
    priority: "any" as const,
    origin: "any" as const,
    projectId: null,
    contextId: null,
    order: "default" as const,
    group: "none" as const,
    page: 1,
  };

  function item(id: string, overrides: Record<string, unknown> = {}) {
    return {
      taskId: id,
      title: `Task ${id}`,
      intentionalNoDue: false,
      humanState: "not_started",
      origin: "you",
      availableActions: [],
      projects: [],
      contexts: [],
      people: [],
      waitingOnPeople: [],
      sensitivity: { kind: "undetermined" } as const,
      ...overrides,
    } as unknown as WorkItemView;
  }

  it("renders a control per declared value of every filter, and marks the active one", () => {
    renderWork({ locale: "en", view: "all", query: { ...query, priority: "high" } });

    const group = screen.getByRole("group", { name: "Priority" });
    expect(within(group).getByRole("link", { name: "High" })).toHaveAttribute("aria-current", "page");
    expect(within(group).getByRole("link", { name: "Any" })).not.toHaveAttribute("aria-current");
  });

  it("carries the whole query on every control, so the parts compose", () => {
    renderWork({ locale: "en", view: "all", query: { ...query, priority: "high", order: "due_asc" } });

    // Changing the ordering must not drop the filter.
    const order = screen.getByRole("group", { name: "Order" });
    const link = within(order).getByRole("link", { name: "Latest due first" });
    expect(link.getAttribute("href")).toContain("priority=high");
    expect(link.getAttribute("href")).toContain("order=due_desc");
  });

  it("resets the page when a filter changes, and keeps it when the ordering does", () => {
    renderWork({ locale: "en", view: "all", page: 3, query: { ...query, page: 3 } });

    const priority = within(screen.getByRole("group", { name: "Priority" }))
      .getByRole("link", { name: "High" });
    expect(priority.getAttribute("href")).not.toContain("page=");

    const order = within(screen.getByRole("group", { name: "Order" }))
      .getByRole("link", { name: "Soonest due first" });
    expect(order.getAttribute("href")).toContain("page=3");
  });

  it("keeps the narrowing when the view changes, but returns to the first page", () => {
    renderWork({ locale: "en", view: "all", page: 4, query: { ...query, priority: "high", page: 4 } });

    const tab = within(screen.getByRole("navigation", { name: "Work views" }))
      .getByRole("link", { name: "Waiting" });
    expect(tab.getAttribute("href")).toContain("priority=high");
    expect(tab.getAttribute("href")).not.toContain("page=");
  });

  it("groups by the chosen attribute and states each group's count", () => {
    renderWork({
      locale: "en",
      view: "all",
      query: { ...query, group: "priority" },
      items: [item("a", { priority: "high" }), item("b", { priority: "high" }), item("c")],
    });

    const high = screen.getByRole("region", { name: "High" });
    expect(within(high).getByText("2 tasks")).toBeVisible();
    expect(screen.getByRole("region", { name: "Without that relationship" })).toBeVisible();
  });

  it("distinguishes a filtered-empty result from a genuinely empty view", () => {
    renderWork({ locale: "en", view: "all", items: [], query: { ...query, priority: "urgent" } });
    expect(screen.getByText(/No task matches these filters/)).toBeVisible();

    cleanup();
    renderWork({ locale: "en", view: "all", items: [], query });
    expect(screen.getByText("Add a task above or capture an intention.")).toBeVisible();
  });

  it("says so when the position it restored is not the one that was asked for", () => {
    renderWork({ locale: "en", view: "all", query, positionAdjusted: true });
    expect(screen.getByText(/The page you had open is no longer here/)).toBeVisible();
  });

  it("carries the whole query on the pagination links", () => {
    renderWork({
      locale: "en",
      view: "all",
      page: 1,
      hasNext: true,
      query: { ...query, priority: "high", group: "project" },
    });

    const next = within(screen.getByRole("navigation", { name: "Pagination" }))
      .getByRole("link", { name: "Next" });
    expect(next.getAttribute("href")).toContain("priority=high");
    expect(next.getAttribute("href")).toContain("group=project");
    expect(next.getAttribute("href")).toContain("page=2");
  });
});
