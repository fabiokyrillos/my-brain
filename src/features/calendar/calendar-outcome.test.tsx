/**
 * `2M-CAL-010` — the answer outlives the row it is about.
 *
 * The point of this component is what it does *after* the item that produced
 * the outcome has been removed from the page, which is the ordinary result of a
 * successful reschedule on a date-partitioned view. So the cases below unmount
 * nothing and mount nothing clever: they assert the region is a named landmark
 * carrying the outcome and the undo, and that it says nothing at all before
 * anything has happened — an empty announced region on a fresh calendar would
 * be a surface claiming an operation occurred.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { idleTaskDetailCommandState, type TaskDetailCommandState } from "@/features/task-commands/detail-action-state";

// `UndoAffordance` refreshes the route after a successful undo, which needs a
// mounted app router jsdom does not provide.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { CalendarOutcome } from "./calendar-outcome";

afterEach(cleanup);

function applied(overrides: Partial<TaskDetailCommandState> = {}): TaskDetailCommandState {
  return {
    ...idleTaskDetailCommandState,
    status: "applied",
    action: "reschedule_due",
    heading: "Prazo alterado",
    detail: "O prazo agora é 20 de agosto.",
    undo: { undoId: "undo-1", expiresAt: "2099-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

describe("CalendarOutcome", () => {
  it("renders nothing before anything has been applied", () => {
    const { container } = render(<CalendarOutcome locale="pt-BR" outcome={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces the outcome in the same named region the detail uses", () => {
    render(<CalendarOutcome locale="pt-BR" outcome={applied()} />);
    const region = screen.getByRole("region", { name: "Resultado da alteração" });
    expect(region).toHaveTextContent("Prazo alterado");
    expect(region).toHaveTextContent("O prazo agora é 20 de agosto.");
  });

  it("names the region in the locale it was given", () => {
    render(<CalendarOutcome locale="en" outcome={applied()} />);
    expect(screen.getByRole("region", { name: "Change result" })).toBeTruthy();
  });

  it("offers the undo here, where the operation happened", () => {
    render(<CalendarOutcome locale="pt-BR" outcome={applied()} undoAction={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Resultado da alteração" });
    expect(region.querySelector("form, button")).not.toBeNull();
  });

  it("offers no undo when the outcome carries no token to spend", () => {
    render(<CalendarOutcome locale="pt-BR" outcome={applied({ undo: null })} undoAction={vi.fn()} />);
    const region = screen.getByRole("region", { name: "Resultado da alteração" });
    expect(region).toHaveTextContent("Prazo alterado");
    expect(region.querySelector("button")).toBeNull();
  });

  it("takes focus, because the control the user was operating is gone", () => {
    render(<CalendarOutcome locale="pt-BR" outcome={applied()} />);
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Resultado da alteração" }));
  });
});
