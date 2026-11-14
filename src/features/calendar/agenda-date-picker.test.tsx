import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { AGENDA_DATE_TOKEN, AgendaDatePicker, datePickerMonth } from "./agenda-date-picker";

/**
 * Life Brain D.1 — the period label opens a date picker (`FEEDBACK_DONO_2026-11-05.md`
 * T2: "se eu clicar aqui nesse quinta-feira, 5 de novembro, deveria aparecer um
 * calendário para mim … Eu não posso ficar passando de um em um").
 */

afterEach(cleanup);

const HREF = `/pt-BR/app/calendar?orientation=week&date=${AGENDA_DATE_TOKEN}`;

function picker(overrides: Partial<Parameters<typeof AgendaDatePicker>[0]> = {}) {
  return render(
    <AgendaDatePicker
      hrefTemplate={HREF}
      label="seg., 09 de nov. – dom., 15 de nov."
      locale="pt-BR"
      max="2026-12-31"
      min="2026-10-01"
      selected="2026-11-12"
      today="2026-11-12"
      {...overrides}
    />,
  );
}

describe("datePickerMonth", () => {
  it("lays November 2026 out Monday-first: it opens on a Sunday, so six blank cells lead", () => {
    const weeks = datePickerMonth({ view: "2026-11-12", selected: "2026-11-12", today: "2026-11-12", min: "2026-10-01", max: "2026-12-31" });
    expect(weeks).toHaveLength(6);
    expect(weeks[0].slice(0, 6).every((cell) => cell === null)).toBe(true);
    expect(weeks[0][6]).toMatchObject({ date: "2026-11-01", day: 1 });
    expect(weeks.flat().filter((cell) => cell !== null)).toHaveLength(30);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("marks the selected day, today, and refuses days outside the bound", () => {
    const cells = datePickerMonth({ view: "2026-11-01", selected: "2026-11-05", today: "2026-11-12", min: "2026-11-03", max: "2026-11-20" })
      .flat()
      .filter((cell) => cell !== null);
    const byDay = new Map(cells.map((cell) => [cell.day, cell]));
    expect(byDay.get(5)).toMatchObject({ selected: true, selectable: true });
    expect(byDay.get(12)).toMatchObject({ today: true, selected: false });
    expect(byDay.get(2)?.selectable).toBe(false);
    expect(byDay.get(21)?.selectable).toBe(false);
    expect(byDay.get(3)?.selectable).toBe(true);
    expect(byDay.get(20)?.selectable).toBe(true);
  });
});

describe("AgendaDatePicker", () => {
  it("is a control, not a paragraph: the period label opens the picker", async () => {
    const user = userEvent.setup();
    const { container } = picker();
    expect(container.querySelector("p.agenda-stepper-range")).toBeNull();

    const trigger = container.querySelector("summary");
    expect(trigger).toHaveTextContent("seg., 09 de nov. – dom., 15 de nov.");
    expect(trigger).toHaveAccessibleName(/escolher uma data/i);

    const details = trigger!.closest("details")!;
    expect(details.open).toBe(false);
    await user.click(trigger!);
    expect(details.open).toBe(true);
  });

  it("every day is a link to that day, so the URL is still the state", () => {
    picker();
    const grid = screen.getByRole("table", { name: /novembro de 2026/i });
    const day20 = within(grid).getByRole("link", { name: /20 de novembro/i });
    expect(day20).toHaveAttribute("href", "/pt-BR/app/calendar?orientation=week&date=2026-11-20");
    const selected = within(grid).getByRole("link", { name: /12 de novembro/i });
    expect(selected).toHaveAttribute("aria-current", "date");
  });

  it("a day outside the bound is said and not linked", () => {
    picker({ min: "2026-11-10", selected: "2026-11-12" });
    const grid = screen.getByRole("table", { name: /novembro de 2026/i });
    expect(within(grid).queryByRole("link", { name: /^9 de novembro/i })).toBeNull();
    expect(within(grid).getByText("9")).toHaveAttribute("aria-disabled", "true");
  });

  it("moves between months inside the picker without navigating, and stops at the bound", async () => {
    const user = userEvent.setup();
    picker();
    await user.click(screen.getByRole("button", { name: "Próximo mês" }));
    expect(screen.getByRole("table", { name: /dezembro de 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximo mês" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    await user.click(screen.getByRole("button", { name: "Mês anterior" }));
    expect(screen.getByRole("table", { name: /outubro de 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
  });

  it("keeps announcing where the stepper landed", () => {
    const { container } = picker();
    const live = container.querySelector("[aria-live='polite']");
    expect(live).toHaveTextContent("seg., 09 de nov. – dom., 15 de nov.");
  });

  it("speaks English in English", () => {
    picker({ locale: "en", hrefTemplate: `/en/app/calendar?date=${AGENDA_DATE_TOKEN}` });
    expect(screen.getByRole("table", { name: /november 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /november 20/i })).toHaveAttribute("href", "/en/app/calendar?date=2026-11-20");
  });
});
