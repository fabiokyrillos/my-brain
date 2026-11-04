import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EventCandidateForm } from "./event-candidate-form";
import { idleEventActionState } from "./state";

const action = vi.fn(async () => idleEventActionState);

function view(props: Partial<React.ComponentProps<typeof EventCandidateForm>> = {}) {
  return render(
    <EventCandidateForm
      action={action}
      cancelAction={action}
      entryId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6"
      interpretationId="94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f"
      locale="pt-BR"
      onAgenda={[]}
      operationKey="6118fb25-2f80-432a-aa96-0e76d924862e"
      pending={[
        { candidateIndex: 0, title: "Dentista", startsAt: "2026-12-12T18:00:00.000Z", endsAt: null, allDay: false, location: null },
        { candidateIndex: 1, title: "Viagem a Lisboa", startsAt: "2026-12-03T03:00:00.000Z", endsAt: "2026-12-11T02:59:59.000Z", allDay: true, location: "Lisboa" },
      ]}
      timezone="America/Sao_Paulo"
      undoAction={action}
      {...props}
    />,
  );
}

describe("EventCandidateForm", () => {
  it("offers every candidate checked, with its period and place", () => {
    view();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText(/ · Lisboa$/).textContent).toContain("até");
    expect(document.querySelector("input[name='candidateIndexes']")?.getAttribute("value")).toBe("[0,1]");
  });

  it("sends only what stays checked, and cannot send nothing", async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getAllByRole("checkbox")[0]!);
    expect(document.querySelector("input[name='candidateIndexes']")?.getAttribute("value")).toBe("[1]");
    await user.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByRole("button", { name: "Pôr na agenda" })).toBeDisabled();
  });

  it("lists what is already on the agenda with a named cancel, and renders nothing when there is nothing", () => {
    const { unmount } = view({
      pending: [],
      onAgenda: [{ id: "ev1", title: "Dentista", startsAt: "2026-12-12T18:00:00.000Z", endsAt: null, allDay: false, status: "confirmed" }],
    });
    expect(screen.getByRole("button", { name: "Cancelar Dentista" })).toBeTruthy();
    unmount();
    const empty = view({ pending: [], onAgenda: [] });
    expect(empty.container.innerHTML).toBe("");
  });
});
