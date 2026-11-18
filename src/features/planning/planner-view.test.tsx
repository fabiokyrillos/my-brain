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
import { getAgendaHeaderCopy } from "@/features/calendar/agenda-copy";
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
    dayHrefBase="/en/app/calendar/plan"
    locale="en"
    projection={projection()}
    {...overrides}
  />);
}

const copy = getPlannerCopy("en");

/**
 * ADR-180. The account of the page — what "planned" means, that it creates
 * nothing, the capacity sentences — sits behind one closed line at its foot.
 * Every sentence is still on the page and one press away; this opens the line
 * the way a reader would, so the assertions below are about what they then see.
 */
function openAbout(label: string = copy.howItWorks): HTMLDetailsElement {
  const summary = screen.getByText(label);
  expect(summary).toBeVisible();
  const about = summary.closest("details") as HTMLDetailsElement;
  expect(about).not.toBeNull();
  about.open = true;
  return about;
}

describe("2M-PLAN-004 — it arranges what exists and creates nothing", () => {
  it("says so, where a user reading the screen can see it", () => {
    renderPlanner();
    expect(within(openAbout()).getByText(copy.createsNothing)).toBeVisible();
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
    const about = openAbout();
    expect(within(about).getByText(copy.capacity.count(5))).toBeVisible();
    expect(within(about).getByText(copy.capacity.undeclared)).toBeVisible();
    expect(screen.queryByText(copy.capacity.overloaded)).not.toBeInTheDocument();
  });

  it("always names its own assumption, so no number stands unexplained", () => {
    // Wherever the capacity is read, its assumption is in the same region.
    renderPlanner();
    const capacity = within(openAbout()).getByLabelText(copy.capacity.heading);
    expect(within(capacity).getByText(copy.capacity.count(0))).toBeVisible();
    expect(within(capacity).getByText(copy.capacity.noDuration)).toBeVisible();
  });

  it("announces an overloaded day through a status role rather than silently", () => {
    renderPlanner({ projection: projection({ capacity: {
      plannedCount: 20, availableHours: 17, availabilityDeclared: true, overloaded: true,
    } }) });
    // An overloaded day opens the account by itself: the word "more" is on
    // screen, so the hours and the assumption it rests on are too.
    expect(screen.getByText(copy.howItWorks).closest("details")).toHaveAttribute("open");
    expect(screen.getByText(copy.capacity.available(17))).toBeVisible();
    expect(screen.getByText(copy.capacity.noDuration)).toBeVisible();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(copy.capacity.overloaded);
    // Stated before the lists, not inside the closed line.
    expect(status.closest("details")).toBeNull();
    expect(status.compareDocumentPosition(screen.getByLabelText(copy.planned)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // Something to notice comes before the lists, never behind a disclosure.
    const region = screen.getByLabelText(copy.conflicts.heading);
    expect(region.closest("details")).toBeNull();
    expect(region.compareDocumentPosition(screen.getByLabelText(copy.planned)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it on the row of the task it is about, as a statement with no control", () => {
    renderPlanner({ projection: projection({
      planned: [
        item("a", { plannedAt: "2026-08-15T14:00:00.000Z", dueAt: "2026-08-14T14:00:00.000Z" }),
        item("b", { plannedAt: "2026-08-15T14:00:00.000Z" }),
      ],
      conflicts: [{ kind: "intention_after_deadline", taskIds: ["a"], day: "2026-08-15" }],
    }) });
    const rows = within(screen.getByLabelText(copy.planned)).getAllByRole("listitem")
      .filter((row) => row.classList.contains("planner-item"));
    expect(within(rows[0]).getByText(copy.conflicts.statement.intention_after_deadline)).toHaveClass("planner-item-noted");
    expect(rows[1].querySelector(".planner-item-noted")).toBeNull();
    // Still one verb on the row, and it is the list's own.
    expect(within(rows[0]).getAllByRole("button").map((button) => button.textContent)).toEqual([copy.removeHere]);
  });

  it("does not repeat above the lists what the task's own row already states", () => {
    // ADR-180. Every observation here is on a row, so the region is one quiet
    // caption — how many, and that nothing was changed — with no heading, no
    // list and no second copy of the sentence.
    renderPlanner({ projection: projection({
      planned: [item("a", { plannedAt: "2026-08-15T14:00:00.000Z", dueAt: "2026-08-14T14:00:00.000Z" })],
      conflicts: [{ kind: "intention_after_deadline", taskIds: ["a"], day: "2026-08-15" }],
    }) });
    const region = screen.getByLabelText(copy.conflicts.heading);
    expect(region).toHaveAttribute("data-on-rows", "true");
    expect(within(region).queryByRole("heading")).toBeNull();
    expect(region.querySelector("ul")).toBeNull();
    expect(within(region).getByText(copy.conflicts.count(1))).toBeVisible();
    expect(within(region).getByText(copy.conflicts.notResolved)).toBeVisible();
    expect(screen.getAllByText(copy.conflicts.statement.intention_after_deadline)).toHaveLength(1);
    // Still before the lists, never behind a disclosure.
    expect(region.closest("details")).toBeNull();
    expect(region.compareDocumentPosition(screen.getByLabelText(copy.planned)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the block for what no row carries, and lists only that", () => {
    renderPlanner({ projection: projection({
      planned: [item("a", { plannedAt: "2026-08-15T14:00:00.000Z", dueAt: "2026-08-14T14:00:00.000Z" })],
      conflicts: [
        { kind: "intention_after_deadline", taskIds: ["a"], day: "2026-08-15" },
        { kind: "double_booking", taskIds: ["x", "y"], day: "2026-08-15" },
      ],
    }) });
    const region = screen.getByLabelText(copy.conflicts.heading);
    expect(region).not.toHaveAttribute("data-on-rows");
    expect(within(region).getByRole("heading")).toHaveTextContent(copy.conflicts.heading);
    expect(within(region).getAllByRole("listitem").map((row) => row.textContent))
      .toEqual([copy.conflicts.statement.double_booking]);
    expect(within(region).getByText(copy.conflicts.count(1))).toBeVisible();
    expect(within(region).getByText(copy.conflicts.notResolved)).toBeVisible();
  });

  it("says a quiet day is quiet rather than showing an empty region", () => {
    // The region exists and says so; with nothing to notice it is part of the
    // page's account rather than a section standing before the tasks.
    renderPlanner();
    const region = within(openAbout()).getByLabelText(copy.conflicts.heading);
    expect(within(region).getByText(copy.conflicts.none)).toBeVisible();
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
  /*
    ADR-180. The planned day is the page's subject and the list's heading, so a
    row under "Planned for this day" no longer repeats it. What a row says under
    its title is what the plan is weighed against: the deadline, as a day.
  */
  it("does not repeat the planned day on a planned row", () => {
    renderPlanner({ projection: projection({
      planned: [item("a", { plannedAt: "2026-08-15T14:00:00.000Z" })],
      capacity: { plannedCount: 1, availableHours: null, availabilityDeclared: false, overloaded: false },
    }) });
    const row = within(screen.getByLabelText(copy.planned)).getAllByRole("listitem")[0];
    expect(within(row).queryByText(new RegExp(`^${getPlannedAtCopy("en").prefix}\\s`))).toBeNull();
    expect(row.querySelector(".planner-item-meta")).toBeNull();
    // `2M-PLAN-001` consequence 1 still holds: no clock component is presented.
    expect(row.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("shows a task's deadline under its title, as a day and never as a time", () => {
    renderPlanner({ projection: projection({
      available: [item("a", { dueAt: "2026-08-20T21:00:00.000Z" })],
    }) });
    const row = within(screen.getByLabelText(copy.available)).getAllByRole("listitem")[0];
    const meta = row.querySelector(".planner-item-meta") as HTMLElement;
    expect(meta.textContent).toMatch(/^Due: .*20/);
    expect(meta.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("makes the title the link to the task", () => {
    renderPlanner({ projection: projection({ available: [item("a")] }) });
    expect(screen.getByRole("link", { name: "Task a" })).toHaveAttribute("href", "/en/app/work/a");
  });

  it("counts each list in its heading", () => {
    renderPlanner({ projection: projection({
      planned: [item("p", { plannedAt: "2026-08-15T14:00:00.000Z" })],
      available: [item("a"), item("b")],
    }) });
    expect(within(screen.getByLabelText(copy.planned)).getByRole("heading").textContent).toBe(`${copy.planned}1`);
    expect(within(screen.getByLabelText(copy.available)).getByRole("heading").textContent).toBe(`${copy.available}2`);
  });

  /*
    Life Brain D.1: the pool is by definition the tasks with no planned day, so
    "No planned day" printed under each one (in monospace) said nothing the
    section did not. The section's own sentence says it once.
  */
  it("does not repeat 'no planned day' under every available item", () => {
    renderPlanner({ projection: projection({ available: [item("a"), item("b")] }) });
    expect(screen.queryByText(getPlannedAtCopy("en").none)).not.toBeInTheDocument();
    expect(within(openAbout()).getByText(copy.availableHint)).toBeVisible();
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

describe("Life Brain D.1 — Planejar says what planned means, and plans in one tap", () => {
  /*
    ADR-180. What the page asks is one line under the day — and it is the
    meaning, said as the thing to do ("what you intend to do on this day"). The
    longer sentence D.1 wrote stays, first in the page's account.
  */
  it("says what the page asks under the day, before either list", () => {
    renderPlanner();
    const lede = screen.getByText(copy.lede);
    expect(lede).toBeVisible();
    expect(lede.compareDocumentPosition(screen.getByLabelText(copy.planned)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps what 'planned' means, first in the account of the page", () => {
    renderPlanner();
    const about = openAbout();
    const meaning = within(about).getByText(copy.meaning);
    expect(meaning).toBeVisible();
    const capacity = within(about).getByLabelText(copy.capacity.heading);
    expect(meaning.compareDocumentPosition(capacity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the account closed until asked for, on a day that is not overloaded", () => {
    renderPlanner();
    expect(screen.getByText(copy.howItWorks).closest("details")).not.toHaveAttribute("open");
  });

  it("offers Today in the stepper only on a day that is not today", () => {
    renderPlanner();
    expect(document.querySelector(".agenda-stepper-today")).toBeNull();
    cleanup();
    renderPlanner({ projection: projection({ day: "2026-08-20", isToday: false }) });
    expect(document.querySelector(".agenda-stepper-today")).toHaveAttribute("href", "/en/app/calendar/plan");
  });

  it("an available task is planned for this day with one button, no date field and no Apply", async () => {
    const action = vi.fn(async () => ({ status: "idle" }));
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    renderPlanner({ action, projection: projection({ available: [item("a")] }) });
    const row = within(screen.getByLabelText(copy.available)).getAllByRole("listitem")[0];
    expect(row.querySelector('input[type="date"]')).toBeNull();
    expect(within(row).queryByRole("button", { name: /^apply$/i })).toBeNull();
    const buttons = within(row).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([copy.planHere]);

    await user.click(buttons[0]);
    expect(action).toHaveBeenCalledTimes(1);
    const sent = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("action")).toBe("set_planned");
    expect(sent.get("value")).toBe("2026-08-15");
  });

  it("a planned task leaves the day with one button", () => {
    renderPlanner({ projection: projection({
      planned: [item("p", { plannedAt: "2026-08-15T14:00:00.000Z" })],
    }) });
    const row = within(screen.getByLabelText(copy.planned)).getAllByRole("listitem")[0];
    expect(row.querySelector('input[type="date"]')).toBeNull();
    expect(within(row).getAllByRole("button").map((button) => button.textContent)).toEqual([copy.removeHere]);
  });

  it("the checkbox sits in its own 44px label, on the title's line", () => {
    renderPlanner({ projection: projection({ available: [item("a")] }) });
    const checkbox = screen.getByRole("checkbox", { name: "Task a" });
    expect(checkbox.closest("label")).not.toBeNull();
    expect(checkbox.closest("label")).toHaveClass("planner-select-label");
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
    // Life Brain A.4: the day stepper is the Agenda's, in the header.
    expect(screen.getByRole("navigation", { name: getAgendaHeaderCopy("en").stepperLabel })).toBeVisible();
  });

  it("is the Agenda's Planejar lens, under the Agenda's one header (Life Brain A.4)", () => {
    renderPlanner();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Agenda");
    const current = screen.getByRole("navigation", { name: getAgendaHeaderCopy("en").lensesLabel })
      .querySelector("[aria-current='page']");
    expect(current?.textContent).toBe("Plan");
    expect(document.querySelector(".work-modes")).toBeNull();
  });
});

describe("both locales", () => {
  it("renders the Portuguese record when asked for it", () => {
    renderPlanner({ locale: "pt-BR" });
    const ptBR = getPlannerCopy("pt-BR");
    expect(screen.getByText(ptBR.lede)).toBeVisible();
    expect(within(openAbout(ptBR.howItWorks)).getByText(ptBR.createsNothing)).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Planejar" })).toHaveAttribute("aria-current", "page");
  });
});
