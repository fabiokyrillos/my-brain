import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  idleTaskDetailCommandState,
  type TaskDetailCommandState,
} from "@/features/task-commands/detail-action-state";

import type { CalendarItemView, CalendarProjection } from "./calendar-contracts";
import { CalendarView } from "./calendar-view";
import { DEFAULT_CALENDAR_LANES, type CalendarQuery } from "./calendar-query";
import { schedulingControlsFor } from "./calendar-scheduling";
import { getCalendarCopy } from "./copy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * `2M-CAL-003`/`-006`/`-011`, `2M-PRIVACY-001`/`-005`/`-006`, `2M-ACCESS-002`/
 * `-005` — what the surface actually renders.
 *
 * These assert the properties a reader can check on the page rather than the
 * ones a projection returns. The distinction matters: a projection that derived
 * a classification correctly and a surface that printed the title anyway would
 * pass every test in `calendar-projection.test.ts`.
 */

const TODAY = { year: 2026, month: 8, day: 15 };

function item(overrides: Partial<CalendarItemView> = {}): CalendarItemView {
  return {
    id: "deadline:t1",
    lane: "deadline",
    commitment: "committed",
    at: "2026-08-15T18:00:00.000Z",
    date: "2026-08-15",
    title: "Entregar o relatório",
    sensitivity: { kind: "undetermined" },
    href: "/pt-BR/app/work/t1",
    elapsed: false,
    // The default fixture is a **read-only** item, so every assertion in this
    // file about masking, structure and lanes is made against a surface with no
    // command path — which is what a component test of those properties should
    // be looking at. Rescheduling has its own fixture and its own file.
    reschedule: null,
    ...overrides,
  };
}

function projection(overrides: Partial<CalendarProjection> = {}): CalendarProjection {
  const days = overrides.days ?? [{ date: "2026-08-15", isToday: true, items: [item()] }];
  return {
    days,
    timezone: "America/Sao_Paulo",
    rangeStart: TODAY,
    rangeEnd: TODAY,
    failedLanes: [],
    itemCount: days.reduce((total, day) => total + day.items.length, 0),
    ...overrides,
  };
}

function query(overrides: Partial<CalendarQuery> = {}): CalendarQuery {
  return { orientation: "day", anchor: TODAY, lanes: DEFAULT_CALENDAR_LANES, ...overrides };
}

const view = (props: { projection?: CalendarProjection; query?: CalendarQuery } = {}) =>
  render(
    <CalendarView
      locale="pt-BR"
      projection={props.projection ?? projection()}
      query={props.query ?? query()}
      today={TODAY}
    />,
  );

describe("2M-PRIVACY-001/-005: no title reaches the page unprotected", () => {
  it("prints an unclassified title, because there is nothing to withhold", () => {
    view();
    expect(screen.getByText("Entregar o relatório")).toBeTruthy();
  });

  it("withholds a highly sensitive TASK title and keeps the row", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [
        item({ sensitivity: { kind: "derived", level: "highly_sensitive" } }),
      ] }],
    }) });
    expect(screen.queryByText("Entregar o relatório")).toBeNull();
    // The row survives: the item's existence, lane and instant are still there.
    expect(document.querySelectorAll(".calendar-item")).toHaveLength(1);
    // Scoped to the item list: "Prazos" is also the lane filter's own label, and
    // an unscoped query would pass on the control while the row was missing.
    const rows = document.querySelector(".calendar-day-items") as HTMLElement;
    expect(within(rows).getByText("Prazos")).toBeTruthy();
  });

  it("withholds a highly sensitive REMINDER title by the same mechanism", () => {
    // OD-2M-1 option A, and the divergence it exists to prevent: a calendar that
    // masked the task and printed the reminder beside it.
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [
        item({
          id: "reminder:r1", lane: "reminder", commitment: "committed",
          title: "Consulta médica",
          sensitivity: { kind: "derived", level: "highly_sensitive" },
          href: "/pt-BR/app/reminders",
        }),
      ] }],
    }) });
    expect(screen.queryByText("Consulta médica")).toBeNull();
    expect(document.querySelectorAll(".calendar-item")).toHaveLength(1);
  });

  it("keeps a masked row openable, so withholding costs no function", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [
        item({ sensitivity: { kind: "derived", level: "highly_sensitive" } }),
      ] }],
    }) });
    const links = Array.from(document.querySelectorAll(".calendar-item a"))
      .map((link) => link.getAttribute("href"));
    expect(links).toContain("/pt-BR/app/work/t1");
  });

  it("counts everything, so the count is never an oracle (2M-PRIVACY-006)", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [
        item(),
        item({ id: "deadline:t2", title: "Segredo", sensitivity: { kind: "derived", level: "highly_sensitive" } }),
      ] }],
    }) });
    expect(screen.getByText("2 itens neste período")).toBeTruthy();
  });
});

describe("2M-CAL-003 / 2M-ACCESS-005: the distinction is never colour alone", () => {
  it("states the lane and the commitment in visible text", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [
        item(),
        item({ id: "intention:t2", lane: "intention", commitment: "intended", title: "Rascunho" }),
      ] }],
    }) });
    const rows = document.querySelector(".calendar-day-items") as HTMLElement;
    expect(within(rows).getByText("Prazos")).toBeTruthy();
    expect(within(rows).getByText("Compromisso")).toBeTruthy();
    expect(within(rows).getByText("Intenções")).toBeTruthy();
    expect(within(rows).getByText("Intenção")).toBeTruthy();
  });

  it("exposes the lane and commitment programmatically as well", () => {
    view();
    const row = document.querySelector(".calendar-item")!;
    expect(row.getAttribute("data-lane")).toBe("deadline");
    expect(row.getAttribute("data-commitment")).toBe("committed");
  });

  it("marks an elapsed item in words rather than only by style", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [item({ elapsed: true })] }],
    }) });
    expect(screen.getByText("Já passou")).toBeTruthy();
  });
});

describe("2M-CAL-011: every state is distinguishable from every other", () => {
  it("says a day is empty, and says so differently when a filter is on", () => {
    view({ projection: projection({ days: [{ date: "2026-08-15", isToday: true, items: [] }] }) });
    expect(screen.getByText("Nada marcado para este período.")).toBeTruthy();

    view({
      projection: projection({ days: [{ date: "2026-08-15", isToday: true, items: [] }] }),
      query: query({ lanes: ["deadline"] }),
    });
    expect(screen.getByText("Nada marcado para este período com os filtros atuais.")).toBeTruthy();
  });

  it("names the lanes that failed instead of showing a day that looks empty", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [item()] }],
      failedLanes: [{ lane: "reminder" }, { lane: "review" }],
    }) });
    const partial = screen.getByText(/Não foi possível carregar: Lembretes, Revisões/);
    expect(partial.getAttribute("role")).toBe("status");
    // And the rest is still on the page.
    expect(screen.getByText("Entregar o relatório")).toBeTruthy();
  });
});

describe("2M-CAL-006: reaching the navigation bound is a visible state", () => {
  it("says so at the latest bound rather than showing an empty grid", () => {
    view({ query: query({ anchor: { year: 2027, month: 8, day: 15 } }) });
    expect(screen.getByText("Este é o fim do período que o calendário cobre.")).toBeTruthy();
  });

  it("says so at the earliest bound too", () => {
    view({ query: query({ anchor: { year: 2025, month: 8, day: 15 } }) });
    expect(screen.getByText("Este é o começo do período que o calendário cobre.")).toBeTruthy();
  });

  it("says nothing when the user is nowhere near either end", () => {
    view();
    expect(screen.queryByText(/período que o calendário cobre/)).toBeNull();
  });
});

describe("2M-ACCESS-001/-002: structure and operation without a pointer", () => {
  it("renders a week as a table, so a grid is a grid", () => {
    const days = Array.from({ length: 7 }, (_unused, index) => ({
      date: `2026-08-${String(10 + index).padStart(2, "0")}`,
      isToday: index === 5,
      items: [] as CalendarItemView[],
    }));
    view({ projection: projection({ days }), query: query({ orientation: "week" }) });
    const table = document.querySelector("table.calendar-week")!;
    expect(table).toBeTruthy();
    expect(within(table as HTMLElement).getAllByRole("columnheader")).toHaveLength(7);
  });

  it("renders a day and an agenda as lists, because that is the shape they are", () => {
    view();
    expect(document.querySelector("table.calendar-week")).toBeNull();
    expect(document.querySelector("ol.calendar-days")).toBeTruthy();
  });

  it("makes every control a link, so the keyboard reaches all of them", () => {
    // OD-2M-6 A. No gesture, and no button-with-a-handler either: the control
    // IS the URL, which is what makes `2M-CAL-004` true rather than aspirational.
    view();
    const controls = Array.from(document.querySelectorAll("nav a"));
    expect(controls.length).toBeGreaterThanOrEqual(3 + 5 + 3);
    for (const control of controls) {
      expect(control.getAttribute("href")).toMatch(/^\/pt-BR\/app\/calendar\?/);
      expect((control.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(document.querySelector("nav [role='button']")).toBeNull();
  });

  it("marks the current orientation, so 'where am I' is answerable without colour", () => {
    view({ query: query({ orientation: "week" }) });
    const current = Array.from(document.querySelectorAll(".calendar-orientation a"))
      .filter((link) => link.getAttribute("aria-current") === "true")
      .map((link) => link.textContent);
    expect(current).toEqual(["Semana"]);
  });

  it("announces the range and the count", () => {
    view();
    const live = Array.from(document.querySelectorAll("[aria-live='polite']"))
      .map((node) => node.className);
    expect(live).toContain("calendar-range");
    expect(live).toContain("calendar-summary");
  });

  it("labels today in words as well as by position", () => {
    view();
    expect(screen.getAllByText("Hoje").length).toBeGreaterThan(0);
  });
});

describe("2M-CAL-002: the two lanes with no user text say what they are", () => {
  it("renders a review and a suggestion by their description, never by content", () => {
    view({ projection: projection({
      days: [{ date: "2026-08-15", isToday: true, items: [
        item({ id: "review:s1", lane: "review", commitment: "recorded", title: null, href: "/pt-BR/app/reviews" }),
        item({ id: "suggestion:e1", lane: "suggestion", commitment: "suggested", title: null, href: "/pt-BR/app/inbox/e1" }),
      ] }],
    }) });
    expect(screen.getByText("Períodos que você já revisou.")).toBeTruthy();
    expect(screen.getByText("Datas que o Brain identificou e você ainda não confirmou.")).toBeTruthy();
    // `null` means there is nothing to render, never that something is hidden --
    // so no mask affordance appears for either.
    expect(document.querySelectorAll("[data-masked='true']")).toHaveLength(0);
  });
});

/**
 * `2M-CAL-010` — the answer outlives the item that produced it.
 *
 * This is the case the deployment journey had to find first, and it is written
 * the way the journey demonstrated the defect: apply, then re-render the
 * calendar **without** the task, which is precisely what the revalidated
 * projection does after a successful reschedule. Anything holding the outcome
 * inside the item fails here; the recorder in `CalendarView` does not.
 */
describe("2M-CAL-010: the outcome survives the task leaving the day", () => {
  const applied: TaskDetailCommandState = {
    ...idleTaskDetailCommandState,
    status: "applied",
    action: "reschedule_due",
    heading: "Prazo alterado",
    detail: "O prazo agora é 20 de agosto.",
  };

  /** The one fixture in this file that carries a command path. */
  const reschedulable = () =>
    item({ reschedule: { taskId: "t1", controls: schedulingControlsFor("todo") } });

  function rescheduling(days: CalendarProjection["days"]) {
    const action = vi.fn(async () => applied);
    const result = render(
      <CalendarView
        dateBounds={{ min: "2024-08-15", max: "2028-08-15" }}
        locale="pt-BR"
        projection={projection({ days })}
        query={query()}
        rescheduleAction={action}
        today={TODAY}
      />,
    );
    return { ...result, action };
  }

  it("announces the outcome on the calendar after the day has emptied", async () => {
    const user = userEvent.setup();
    const { rerender, action } = rescheduling([
      { date: "2026-08-15", isToday: true, items: [reschedulable()] },
    ]);

    await user.click(screen.getByText(getCalendarCopy("pt-BR").reschedule.summary));
    await user.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(action).toHaveBeenCalled());

    // The revalidated projection: the task is on another day now, so this day
    // has nothing at all — the exact state the journey observed.
    rerender(
      <CalendarView
        dateBounds={{ min: "2024-08-15", max: "2028-08-15" }}
        locale="pt-BR"
        projection={projection({ days: [{ date: "2026-08-15", isToday: true, items: [] }] })}
        query={query()}
        rescheduleAction={action}
        today={TODAY}
      />,
    );

    expect(screen.queryByText("Entregar o relatório")).toBeNull();
    const region = screen.getByRole("region", { name: "Resultado da alteração" });
    expect(region).toHaveTextContent("Prazo alterado");
  });

  it("says nothing before anything has been applied", () => {
    rescheduling([{ date: "2026-08-15", isToday: true, items: [reschedulable()] }]);
    expect(screen.queryByRole("region", { name: "Resultado da alteração" })).toBeNull();
  });
});
