import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  idleTaskDetailCommandState,
  type TaskDetailCommandState,
} from "@/features/task-commands/detail-action-state";

import { addLocalDays, formatLocalDate } from "@/lib/time/local-day";

import type { CalendarDayView, CalendarItemView, CalendarProjection } from "./calendar-contracts";
import { CalendarView, MONTH_CELL_ITEM_LIMIT } from "./calendar-view";
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
    // Slice 2R.3. The default fixture is a deadline, which never repeats.
    repeats: null,
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

/**
 * A day fixture, with `inPeriod` defaulted.
 *
 * Slice 2P.7 added `inPeriod` to `CalendarDayView`. Every fixture below predates
 * it and describes a day, week or agenda, where the grid *is* the period and the
 * flag is always true — so defaulting it here keeps fifteen call sites saying
 * what they were written to say, and the month tests pass it explicitly because
 * for them it is the thing under test.
 */
type DayFixture = Omit<CalendarDayView, "inPeriod"> & { inPeriod?: boolean };

function projection(
  overrides: Partial<Omit<CalendarProjection, "days">> & { days?: readonly DayFixture[] } = {},
): CalendarProjection {
  const source = overrides.days ?? [{ date: "2026-08-15", isToday: true, items: [item()] }];
  const days: readonly CalendarDayView[] = source.map((day) => ({ inPeriod: true, ...day }));
  return {
    timezone: "America/Sao_Paulo",
    rangeStart: TODAY,
    rangeEnd: TODAY,
    failedLanes: [],
    ...overrides,
    days,
    itemCount: days.reduce((total, day) => total + day.items.length, 0),
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
    // The three orientations, five lanes, three navigation controls — and, since
    // the Papel e Console recomposition, the three mode tabs.
    expect(controls.length).toBeGreaterThanOrEqual(3 + 5 + 3 + 3);
    for (const control of controls) {
      expect((control.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(document.querySelector("nav [role='button']")).toBeNull();
  });

  /**
   * The href-shape assertion, kept but scoped.
   *
   * It used to run over every `nav a` on the page and required each one to be a
   * `/app/calendar?…` URL. That was a proxy for "the control IS the URL", and it
   * stopped being true of the whole page when Calendário became a *mode* of
   * Trabalho: the tab strip's three links point at `/app/work`,
   * `/app/calendar` and `/app/calendar/plan` by design, which is the whole point
   * of the consolidation preserving the routes.
   *
   * Narrowed rather than weakened: the calendar's own controls are still held to
   * carrying the query, and the tabs get their own two-sided check below.
   *
   * **The reminders link is excluded by name, and only that one.** It is the
   * product's one unconditional path to `/app/reminders` and it deliberately
   * leaves the calendar rather than narrowing it, so holding it to the query
   * shape would be holding a destination to a filter's contract. Excluding it by
   * class rather than by loosening the pattern keeps the rule intact for every
   * other control in the band — a regex widened to `\/app\/` would have admitted
   * anything.
   */
  it("keeps the calendar's own controls addressed by query", () => {
    view();
    const owned = Array.from(document.querySelectorAll(
      ".calendar-orientation a, .calendar-lanes a, .calendar-navigation a:not(.calendar-reminders-link)",
    ));
    // The control on the control: if a refactor renamed these regions, an empty
    // list would satisfy every assertion in the loop below.
    expect(owned.length).toBeGreaterThanOrEqual(3 + 5 + 2);
    for (const control of owned) {
      expect(control.getAttribute("href")).toMatch(/^\/pt-BR\/app\/calendar\?/);
    }
  });

  /**
   * The excluded link, asserted rather than merely excluded.
   *
   * An exclusion with no positive counterpart is how a control disappears and a
   * test keeps passing. This is the only path to Lembretes that does not require
   * a reminder to already exist, so its absence is a route becoming unreachable.
   */
  it("offers Lembretes unconditionally, below the band rather than inside it", () => {
    /*
      Retargeted after the owner's device findings of 2026-08-20, and **not
      weakened**: the link is still asserted to exist, to be unconditional, to
      carry the same href and the same words. What changed is where it may sit.

      It used to be the last child of `.calendar-navigation`, which put a link to
      another page in the row with *previous period*, *today* and *next period*,
      wearing the same pill. That is half of what the owner reported as
      *"filtros estranhos e pouco claros"*, and the assertion below now requires
      the opposite arrangement — inside `.calendar-destinations`, and provably
      **not** inside the control band.

      This is no longer the product's only path to Lembretes either; Hoje offers
      it directly. The sentence above that called this "the only path" was true
      when it was written and is recorded here as superseded rather than deleted.
    */
    view();
    const link = document.querySelector(".calendar-destinations .calendar-reminders-link");
    expect(link, "the unconditional reminders link is gone").not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/pt-BR/app/reminders");
    expect(link!.textContent).toBe("Todos os lembretes");
    // The other direction, so a revert cannot pass this test silently.
    expect(
      document.querySelector(".calendar-toolbar .calendar-reminders-link"),
      "a destination is back inside the control band",
    ).toBeNull();
  });

  it("relates the calendar to Trabalho without moving its route", () => {
    view();
    const tabs = Array.from(document.querySelectorAll(".work-modes a"));

    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/pt-BR/app/work",
      "/pt-BR/app/calendar",
      "/pt-BR/app/calendar/plan",
    ]);
    // "Where am I" is answerable without colour, on the mode strip too.
    expect(tabs.filter((tab) => tab.getAttribute("aria-current") === "page")).toHaveLength(1);
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

  function rescheduling(days: readonly DayFixture[]) {
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


/**
 * `2P-CALENDAR-001` — the month, as the owner confirmed it.
 *
 * The requirement's text was **not** amended: Agenda may not be renamed as Mês,
 * and a plain list may not be declared a month. So these assertions are about
 * the properties that make the difference — a real grid, today marked by more
 * than a colour, the neighbouring days distinguished, cells that stop growing,
 * an overflow that is still reachable, and a textual route to the same days.
 */
describe("2P-CALENDAR-001: the month is a grid, not a renamed list", () => {
  const AUGUST = { year: 2026, month: 8, day: 15 };

  /**
   * A 42-cell August 2026 grid: it starts on Saturday 1 August, so the grid
   * opens on Monday 27 July and closes on Sunday 6 September.
   */
  function monthDays(items: Record<string, CalendarItemView[]> = {}): readonly DayFixture[] {
    const first = { year: 2026, month: 7, day: 27 };
    return Array.from({ length: 42 }, (_unused, index) => {
      const date = addLocalDays(first, index);
      const key = formatLocalDate(date);
      return {
        date: key,
        isToday: key === "2026-08-15",
        inPeriod: date.month === 8,
        items: items[key] ?? [],
      };
    });
  }

  const monthView = (days: readonly DayFixture[] = monthDays()) =>
    view({
      projection: projection({ days }),
      query: query({ orientation: "month", anchor: AUGUST }),
    });

  it("renders a real table with the seven weekdays as column headers", () => {
    monthView();
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent))
      .toEqual([...getCalendarCopy("pt-BR").month.weekdays]);
  });

  it("lays the month out in whole weeks of seven", () => {
    monthView();
    const grid = screen.getByRole("table", { name: /Grade do mês/ });
    const bodyRows = within(grid).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(6);
    for (const row of bodyRows) expect(within(row).getAllByRole("cell")).toHaveLength(7);
  });

  /**
   * `2P-CALENDAR-001` forbids marking today with colour alone. The word is the
   * carrier; the `data-today` attribute is what CSS hangs a tint on, and the
   * assertion below would still pass with every colour removed.
   */
  it("marks today with a word rather than with a fill", () => {
    monthView();
    const today = screen.getAllByText(getCalendarCopy("pt-BR").todayLabel);
    expect(today.length).toBeGreaterThan(0);
  });

  it("distinguishes the days that are only there to finish a week", () => {
    const { container } = monthView();
    const outside = container.querySelectorAll("td[data-outside='true']");
    // 27–31 July is five days, and 1–6 September is six.
    expect(outside).toHaveLength(11);
    expect(container.querySelectorAll(".calendar-month td")).toHaveLength(42);
  });

  it("says so to a screen reader as well, not only to the eye", () => {
    monthView();
    const outsideNotes = screen.getAllByText(`(${getCalendarCopy("pt-BR").month.outside})`);
    expect(outsideNotes).toHaveLength(11);
  });

  it("opens a day from its number, carrying the lanes rather than resetting them", () => {
    view({
      projection: projection({ days: monthDays() }),
      query: query({ orientation: "month", anchor: AUGUST, lanes: ["deadline", "reminder"] }),
    });
    const link = screen.getByRole("link", { name: "15" });
    expect(link.getAttribute("href")).toContain("date=2026-08-15");
    expect(link.getAttribute("href")).toContain("lanes=deadline%2Creminder");
    // The day view is the default orientation, so it is omitted from the URL
    // rather than spelled — the same rule every other calendar link follows.
    expect(link.getAttribute("href")).not.toContain("orientation=");
  });

  it("bounds a busy cell and keeps the rest reachable rather than merely counted", () => {
    const busy = Array.from({ length: MONTH_CELL_ITEM_LIMIT + 4 }, (_unused, index) =>
      item({ id: `item-${index}`, title: `Compromisso ${index}` }));
    const { container } = monthView(monthDays({ "2026-08-15": busy }));

    /*
      Scoped to the grid. Both representations are in the DOM — see the
      mutual-exclusion test below — so an unscoped query would find the list's
      copy and this assertion could never fail.
    */
    const grid = container.querySelector(".calendar-month") as HTMLElement;
    for (let index = 0; index < MONTH_CELL_ITEM_LIMIT; index += 1) {
      expect(within(grid).getByText(`Compromisso ${index}`)).toBeTruthy();
    }
    expect(within(grid).queryByText(`Compromisso ${MONTH_CELL_ITEM_LIMIT}`)).toBeNull();

    const overflow = within(grid).getByRole("link", {
      name: getCalendarCopy("pt-BR").month.more(4),
    });
    expect(overflow.getAttribute("href")).toContain("date=2026-08-15");

    // The list is where the bound does not apply: the overflow is reachable
    // through the day link above, and through every item here.
    const list = container.querySelector(".calendar-month-list") as HTMLElement;
    expect(within(list).getAllByText(/^Compromisso \d$/)).toHaveLength(busy.length);
  });

  it("shows no overflow link when everything fits", () => {
    monthView(monthDays({ "2026-08-15": [item()] }));
    expect(screen.queryByText(/^mais \d+$/)).toBeNull();
  });

  /**
   * The requirement asks for a text alternative and forbids the drawing being
   * the only way in. It is a real heading and a real list — not `sr-only`,
   * because an accessible route that is worse than the visual one is the failure
   * this repository has already shipped once.
   */
  it("carries a textual route to the same days, visible to everyone", () => {
    const { container } = monthView(monthDays({ "2026-08-15": [item()] }));
    const list = container.querySelector(".calendar-month-list");
    expect(list).toBeTruthy();
    expect(list?.className).not.toContain("sr-only");
    expect(list?.className).not.toContain("visually-hidden");
    expect(screen.getByText(getCalendarCopy("pt-BR").month.listHeading)).toBeTruthy();
  });

  it("lists only the days of the month itself, and only the ones with something in them", () => {
    const { container } = monthView(monthDays({
      "2026-08-15": [item({ id: "in", title: "Dentro do mês" })],
      // 30 July is in the grid but not in August: it renders in the cell and
      // must not appear in the month's own list.
      "2026-07-30": [item({ id: "out", title: "Fora do mês" })],
    }));
    const list = container.querySelector(".calendar-month-list") as HTMLElement;
    // One day heading, and the item inside it — `getAllByRole("listitem")` would
    // also count the item rows, which are `<li>` too.
    expect(within(list).getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(within(list).getByText("Dentro do mês")).toBeTruthy();
    expect(within(list).queryByText("Fora do mês")).toBeNull();
    // And the July item is still rendered in the grid, because it is the
    // owner's item and the cell it belongs to is on screen.
    const grid = container.querySelector(".calendar-month") as HTMLElement;
    expect(within(grid).getByText("Fora do mês")).toBeTruthy();
  });

  /**
   * The duplication is deliberate and must stay harmless.
   *
   * Both representations are in the DOM so the choice can be made by CSS rather
   * than by a viewport test that the server cannot run. That is only correct if
   * exactly one of them is `display:none` at any width — `display:none` removes
   * a subtree from the accessibility tree, so a screen reader hears one month,
   * not two. jsdom applies no stylesheet and therefore cannot check that; this
   * asserts the structure the rule hangs on, and
   * `online-phase-2p-planning.spec.ts` proves the exclusivity in a real browser
   * at both widths.
   */
  it("renders the grid and the list as two separately targetable subtrees", () => {
    const { container } = monthView(monthDays({ "2026-08-15": [item()] }));
    expect(container.querySelectorAll(".calendar-month-scroll")).toHaveLength(1);
    expect(container.querySelectorAll(".calendar-month-list")).toHaveLength(1);
    // Neither contains the other: nesting them would make hiding one hide both.
    const scroll = container.querySelector(".calendar-month-scroll") as HTMLElement;
    expect(scroll.querySelector(".calendar-month-list")).toBeNull();
  });

  it("says the month is empty rather than rendering an empty list", () => {
    const { container } = monthView();
    const list = container.querySelector(".calendar-month-list");
    expect(within(list as HTMLElement).queryAllByRole("listitem")).toHaveLength(0);
    expect(within(list as HTMLElement).getByText(getCalendarCopy("pt-BR").states.empty)).toBeTruthy();
  });

  it("names the period as its month, not as the grid's two edges", () => {
    monthView();
    expect(screen.getByText("agosto de 2026")).toBeTruthy();
  });

  it("offers the month as a fourth orientation control", () => {
    monthView();
    const link = screen.getByRole("link", { name: getCalendarCopy("pt-BR").orientation.options.month });
    expect(link.getAttribute("aria-current")).toBe("true");
  });
});

/**
 * `2R-SURFACE-003` on the rendered calendar — slice 2R.3.
 *
 * The projection test proves the sentence is produced. This proves it reaches
 * the page, which is the distinction that file's own header draws: a projection
 * that derived something correctly and a surface that dropped it would pass
 * every assertion over there.
 */
describe("2R-SURFACE-003: a recurring occurrence says so on the calendar", () => {
  it("renders the sentence beside the item's other metadata", () => {
    render(
      <CalendarView
        locale="pt-BR"
        projection={projection({
          days: [{
            date: "2026-08-15",
            isToday: true,
            items: [item({
              id: "reminder:r1", lane: "reminder", title: "Tomar o remédio", repeats: "Todo dia",
            })],
          }],
        })}
        query={query()}
        today={TODAY}
      />,
    );
    expect(screen.getByText("Todo dia")).toBeTruthy();
  });

  it("renders nothing extra for an item that does not repeat", () => {
    const { container } = render(
      <CalendarView
        locale="pt-BR"
        projection={projection({
          days: [{
            date: "2026-08-15",
            isToday: true,
            items: [item({ id: "reminder:r1", lane: "reminder", repeats: null })],
          }],
        })}
        query={query()}
        today={TODAY}
      />,
    );
    // Absent, not empty: an element rendered with no text is still an element a
    // screen reader walks past.
    expect(container.querySelector(".calendar-item-repeats")).toBeNull();
  });
});
