/**
 * Life Brain A.3 part 3 (`LB-A-006`, `DESIGN_DIRECTION.md` §6.1) — a task row
 * on the list's own shape, with its actions in a sheet on a phone.
 *
 * The row keeps `<article class="list-row">` (the online journeys and the
 * accessibility mirror address it) and is reorganised into three slots: the
 * selection, the title with one meta line under it, and the state with the
 * actions. On a phone the inline actions are hidden by CSS and one "⋯" button
 * opens them in a bottom sheet — the shared `ConfirmDialog`, so focus, Escape,
 * the scroll lock and the outside tap behave as every other dialog does. There
 * is no swipe and no long press: OD-2L-5 A forbids gestures on Work surfaces.
 *
 * jsdom applies no media query, so these tests see both the inline group and
 * the trigger; which one a viewport shows is the browser lane's to assert.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkItemView } from "@/features/daily-cycle/contracts";
import { getWorkCopy } from "./copy";
import { TaskList, type WorkItemActionHandler } from "./task-list";
import { idleWorkItemActionState, type WorkItemActionState } from "./work-action-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

function workItem(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    title: "Exame de sangue",
    description: null,
    dueAt: "2026-11-06T15:00:00.000Z",
    plannedAt: null,
    priority: "high",
    intentionalNoDue: false,
    noDueReason: null,
    humanState: "not_started",
    origin: "user",
    availableActions: [
      { id: "open_task", href: "/pt-BR/app/work/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" },
      { id: "complete_task" },
      { id: "wait_task" },
    ],
    projects: [],
    contexts: [{ id: "c1", label: "Saúde" }],
    people: [],
    waitingOnPeople: [],
    parent: null,
    dependsOn: [],
    sensitivity: { kind: "undetermined" },
    ...overrides,
  } as WorkItemView;
}

const action = (async (state: WorkItemActionState) => state ?? idleWorkItemActionState) as unknown as WorkItemActionHandler;

function renderRow(task: WorkItemView, locale: "pt-BR" | "en" = "pt-BR") {
  return render(
    <TaskList action={action} agentName="Brain" emptyHint="x" locale={locale} tasks={[task]} timezone="America/Sao_Paulo" />,
  );
}

describe("a task row on the list's shape", () => {
  it("puts the dates, the priority and the relations on one meta line under the title", () => {
    const { container } = renderRow(workItem());
    const row = container.querySelector("article.list-row")!;
    const meta = row.querySelector(".list-row-main .work-row-meta")!;

    expect(meta).not.toBeNull();
    expect(within(meta as HTMLElement).getByText("Alta")).toBeInTheDocument();
    expect(within(meta as HTMLElement).getByText("Saúde")).toBeInTheDocument();
    expect(meta.textContent).toMatch(/06\/11\/2026|06\/11\/26/);
  });

  it("keeps the state in the trailing slot, beside the actions", () => {
    const { container } = renderRow(workItem());
    const trailing = container.querySelector("article.list-row > .list-meta")!;

    expect(within(trailing as HTMLElement).getByText("Não iniciada")).toHaveClass("ui-badge");
    expect(trailing.querySelector(".work-row-inline")).not.toBeNull();
  });
});

describe("the row's actions in a sheet", () => {
  it("offers one named “⋯” per row that opens a dialog with that row's actions", async () => {
    const user = userEvent.setup();
    renderRow(workItem());

    const more = screen.getByRole("button", { name: "Mais ações para Exame de sangue" });
    expect(more).toHaveClass("ui-icon-button", "work-row-more");
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(more);
    const sheet = screen.getByRole("dialog", { name: "Exame de sangue" });
    expect(sheet).toHaveClass("work-row-sheet");
    expect(within(sheet).getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Abrir tarefa" })).toHaveAttribute(
      "href",
      "/pt-BR/app/work/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    );
  });

  it("closes on Escape and returns focus to the “⋯” that opened it", async () => {
    const user = userEvent.setup();
    renderRow(workItem(), "en");

    const more = screen.getByRole("button", { name: "More actions for Exame de sangue" });
    await user.click(more);
    expect(screen.getByRole("dialog", { name: "Exame de sangue" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(more).toHaveFocus();
  });

  it("closes from its own close control", async () => {
    const user = userEvent.setup();
    renderRow(workItem());

    await user.click(screen.getByRole("button", { name: "Mais ações para Exame de sangue" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never names a withheld task — not on the button, not in the sheet", async () => {
    const user = userEvent.setup();
    const label = getWorkCopy("pt-BR").protected.label;
    renderRow(workItem({ title: "Resultado da biópsia", sensitivity: { kind: "derived", level: "highly_sensitive" } }));

    const more = screen.getByRole("button", { name: `Mais ações para ${label}` });
    await user.click(more);
    const sheet = screen.getByRole("dialog", { name: label });
    expect(sheet.textContent).not.toContain("Resultado da biópsia");
    expect(within(sheet).getByRole("button", { name: "Concluir" })).toBeInTheDocument();
  });

  it("has no “⋯” on a row with nothing to do", () => {
    renderRow(workItem({ availableActions: [] }));
    expect(screen.queryByRole("button", { name: /Mais ações/ })).toBeNull();
  });
});
