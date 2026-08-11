import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const dayPlanned = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordDayPlanned: dayPlanned,
}));

import { getPlannerCopy } from "./copy";
import { getPlannedAtCopy } from "./planned-at";
import type { PlannerProjection } from "./planner-projection";

type ViewModule = {
  PlannerView?: (props: Record<string, unknown>) => React.ReactNode;
};

const modulePath = `./${"planner-view"}.tsx`;
const view = await vi.importActual<ViewModule>(modulePath).catch(() => ({})) as ViewModule;

afterEach(cleanup);

const UNDETERMINED = { kind: "undetermined" } as const;

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    taskId: id,
    title: `Task ${id}`,
    status: "todo",
    dueAt: null,
    plannedAt: null,
    sensitivity: UNDETERMINED,
    href: `/en/app/work/${id}`,
    ...overrides,
  };
}

function projection(overrides: Partial<PlannerProjection> = {}): PlannerProjection {
  return {
    day: "2026-08-15",
    isToday: true,
    timezone: "America/Sao_Paulo",
    planned: [],
    available: [],
    availableTruncated: false,
    capacity: {
      plannedCount: 0,
      availableHours: null,
      availabilityDeclared: false,
      overloaded: false,
    },
    conflicts: [],
    ...overrides,
  } as PlannerProjection;
}

function renderPlanner(overrides: Record<string, unknown> = {}) {
  expect(view.PlannerView).toBeTypeOf("function");
  const PlannerView = view.PlannerView!;
  return render(<PlannerView
    action={vi.fn()}
    bulkAction={vi.fn()}
    dateBounds={{ min: "2024-08-15", max: "2028-08-15" }}
    dayHref={(day: string) => `/en/app/calendar/plan?date=${day}`}
    locale="en"
    projection={projection()}
    {...overrides}
  />);
}

const copy = getPlannerCopy("en");

describe("2M-PLAN-004 — it arranges what exists and creates nothing", () => {
  it("says so, where a user reading the screen can see it", () => {
    renderPlanner();
    expect(screen.getByText(copy.createsNothing)).toBeVisible();
  });

  it("offers no way to create a task", () => {
    renderPlanner({ projection: projection({ available: [item("a")] }) });
    // A composer would be the obvious thing to add to a planner, and it is
    // exactly what the requirement refuses. Asserted on roles rather than on
    // copy, so a differently-worded composer would still fail.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new task|nova tarefa/i })).not.toBeInTheDocument();
  });

  it("states an empty pool rather than inviting the user to invent work", () => {
    renderPlanner();
    expect(screen.getByText(copy.availableEmpty)).toBeVisible();
    expect(screen.getByText(copy.plannedEmpty)).toBeVisible();
  });
});

describe("2M-PLAN-006 — overload, without an invented estimate", () => {
  it("reports the count and says there is nothing to compare against", () => {
    renderPlanner({ projection: projection({ capacity: {
      plannedCount: 5, availableHours: null, availabilityDeclared: false, overloaded: false,
    } }) });
    expect(screen.getByText(copy.capacity.count(5))).toBeVisible();
    expect(screen.getByText(copy.capacity.undeclared)).toBeVisible();
    expect(screen.queryByText(copy.capacity.overloaded)).not.toBeInTheDocument();
  });

  it("always names its own assumption, so no number stands unexplained", () => {
    renderPlanner();
    expect(screen.getByText(copy.capacity.noDuration)).toBeVisible();
  });

  it("announces an overloaded day through a status role rather than silently", () => {
    renderPlanner({ projection: projection({ capacity: {
      plannedCount: 20, availableHours: 17, availabilityDeclared: true, overloaded: true,
    } }) });
    expect(screen.getByText(copy.capacity.available(17))).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(copy.capacity.overloaded);
  });
});

describe("2M-PLAN-007/-008 — conflicts are stated and never resolved", () => {
  it("names each one and says nothing was changed", () => {
    renderPlanner({ projection: projection({ conflicts: [
      { kind: "intention_in_the_past", taskIds: ["a"], day: "2026-08-10" },
      { kind: "double_booking", taskIds: ["b", "c"], day: "2026-08-15" },
    ] }) });
    expect(screen.getByText(copy.conflicts.statement.intention_in_the_past)).toBeVisible();
    expect(screen.getByText(copy.conflicts.statement.double_booking)).toBeVisible();
    expect(screen.getByText(copy.conflicts.notResolved)).toBeVisible();
    expect(screen.getByText(copy.conflicts.count(2))).toBeVisible();
  });

  it("says a quiet day is quiet rather than showing an empty region", () => {
    renderPlanner();
    expect(screen.getByText(copy.conflicts.none)).toBeVisible();
  });

  it("offers no control that would resolve one", () => {
    renderPlanner({ projection: projection({ conflicts: [
      { kind: "intention_after_deadline", taskIds: ["a"], day: "2026-08-20" },
    ] }) });
    const region = screen.getByLabelText(copy.conflicts.heading);
    // The statement carries no affordance at all: resolving is done through the
    // ordinary controls on the row, which are confirmed, audited and undoable.
    expect(region.querySelectorAll("button")).toHaveLength(0);
    expect(region.querySelectorAll("form")).toHaveLength(0);
  });
});

describe("the lists", () => {
  it("shows a planned item with its day, formatted as a day", () => {
    renderPlanner({ projection: projection({
      planned: [item("a", { plannedAt: "2026-08-15T14:00:00.000Z" })],
      capacity: { plannedCount: 1, availableHours: null, availabilityDeclared: false, overloaded: false },
    }) });
    // Scoped to the row: the section heading is "Planned for this day", which a
    // bare text query matches too — a locator that ignores the structure the
    // surface is organized by finds the surface working and calls it broken.
    // The first list item in the section is the row; `TaskDetailControls`
    // renders its own list inside it, which is why this is scoped rather than
    // queried globally.
    const row = within(screen.getByLabelText(copy.planned)).getAllByRole("listitem")[0];
    const meta = within(row).getByText(new RegExp(`^${getPlannedAtCopy("en").prefix}\\s`));
    expect(meta).toBeVisible();
    // `2M-PLAN-001` consequence 1: a day the user chose, never a time.
    expect(meta.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("says an available item has no planned day at all", () => {
    renderPlanner({ projection: projection({ available: [item("a")] }) });
    expect(screen.getByText(getPlannedAtCopy("en").none)).toBeVisible();
  });

  it("offers selection only on the pool, because bulk planning sets a day", () => {
    renderPlanner({ projection: projection({
      planned: [item("p", { plannedAt: "2026-08-15T14:00:00.000Z" })],
      available: [item("a")],
    }) });
    // One checkbox, on the available row. Selecting planned rows would suggest a
    // bulk clear, which `clear_planned` is not eligible for: it carries no
    // value, so it is not one of the bounded verbs OD-2L-3 A admits.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });
});

describe("2M-ACCESS-004 — every region a user perceives is addressable", () => {
  it("labels the capacity, the conflicts and both lists", () => {
    renderPlanner();
    for (const label of [copy.capacity.heading, copy.conflicts.heading, copy.planned, copy.available]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("gives the day navigation an accessible name", () => {
    renderPlanner();
    expect(screen.getByRole("navigation", { name: copy.dayLabel })).toBeVisible();
  });
});

describe("both locales", () => {
  it("renders the Portuguese record when asked for it", () => {
    renderPlanner({ locale: "pt-BR" });
    const ptBR = getPlannerCopy("pt-BR");
    expect(screen.getByText(ptBR.createsNothing)).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: ptBR.title })).toBeVisible();
  });
});
