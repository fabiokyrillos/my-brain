import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EventCandidateForm } from "./event-candidate-form";
import { idleEventActionState, type EventAction, type EventActionState } from "./state";

afterEach(cleanup);

const ENTRY = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const INTERPRETATION = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";
const KEY = "6118fb25-2f80-432a-aa96-0e76d924862e";

const idle = vi.fn(async () => idleEventActionState);

function succeeding(undoId: string | null = "undo-1") {
  return vi.fn<EventAction>(async () => ({ status: "success", message: "1 evento na agenda.", undoId }));
}

function sent(action: ReturnType<typeof vi.fn<EventAction>>, call = 0): Record<string, FormDataEntryValue> {
  return Object.fromEntries((action.mock.calls[call] as [EventActionState, FormData])[1]);
}

function view(props: Partial<React.ComponentProps<typeof EventCandidateForm>> = {}) {
  return render(
    <EventCandidateForm
      action={idle}
      cancelAction={idle}
      entryId={ENTRY}
      interpretationId={INTERPRETATION}
      locale="pt-BR"
      onAgenda={[]}
      operationKey={KEY}
      pending={[
        { candidateIndex: 0, title: "Dentista", startsAt: "2026-12-12T18:00:00.000Z", endsAt: null, allDay: false, location: null },
        { candidateIndex: 1, title: "Viagem a Lisboa", startsAt: "2026-12-03T03:00:00.000Z", endsAt: "2026-12-11T02:59:59.000Z", allDay: true, location: "Lisboa" },
      ]}
      timezone="America/Sao_Paulo"
      undoAction={idle}
      {...props}
    />,
  );
}

const row = (title: string) => screen.getByRole("group", { name: `Evento sugerido: ${title}` });

describe("EventCandidateForm", () => {
  it("asks about each event by name, with its period and place, and writes nothing on its own", () => {
    const action = succeeding();
    view({ action });

    expect(within(row("Dentista")).getByText("Pôr “Dentista” na agenda?")).toBeVisible();
    expect(within(row("Viagem a Lisboa")).getByText(/ · Lisboa$/).textContent).toContain("até");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("puts ONE event on the agenda per tap, with the request the form used to send", async () => {
    const user = userEvent.setup();
    const action = succeeding();
    view({ action });

    await user.click(within(row("Viagem a Lisboa")).getByRole("button", { name: "Pôr na agenda" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(sent(action)).toEqual({
      entryId: ENTRY,
      interpretationId: INTERPRETATION,
      operationKey: KEY,
      locale: "pt-BR",
      candidateIndexes: "[1]",
    });
    // The answered question leaves; the other one is still asked.
    await waitFor(() => expect(screen.queryByRole("group", { name: "Evento sugerido: Viagem a Lisboa" })).toBeNull());
    expect(row("Dentista")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 evento na agenda.");
  });

  it("uses a new operation key for the next event, because the database binds a key to its indexes", async () => {
    const user = userEvent.setup();
    const action = succeeding();
    view({ action });

    await user.click(within(row("Dentista")).getByRole("button", { name: "Pôr na agenda" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await user.click(within(row("Viagem a Lisboa")).getByRole("button", { name: "Pôr na agenda" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    expect(sent(action, 0).operationKey).toBe(KEY);
    expect(sent(action, 1).operationKey).not.toBe(KEY);
    expect(sent(action, 1).candidateIndexes).toBe("[1]");
  });

  it("replays the same key when the same event is retried after a failure, and renews it for a different one", async () => {
    const user = userEvent.setup();
    const action = vi.fn<EventAction>(async () => ({ status: "error", message: "Não foi possível salvar agora.", undoId: null }));
    view({ action });

    await user.click(within(row("Dentista")).getByRole("button", { name: "Pôr na agenda" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar agora.");
    await user.click(within(row("Dentista")).getByRole("button", { name: "Pôr na agenda" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await user.click(within(row("Viagem a Lisboa")).getByRole("button", { name: "Pôr na agenda" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(3));

    expect(sent(action, 1).operationKey).toBe(KEY);
    expect(sent(action, 2).operationKey).not.toBe(KEY);
    // A refused event is still asked about.
    expect(row("Dentista")).toBeVisible();
  });

  it("sets a suggestion aside without writing anything", async () => {
    const user = userEvent.setup();
    const action = succeeding();
    view({ action });

    await user.click(within(row("Dentista")).getByRole("button", { name: "Agora não" }));

    expect(screen.queryByRole("group", { name: "Evento sugerido: Dentista" })).toBeNull();
    expect(row("Viagem a Lisboa")).toBeVisible();
    expect(action).not.toHaveBeenCalled();
  });

  it("offers the undo for the confirmation just made, and asks again once it is undone", async () => {
    const user = userEvent.setup();
    const action = succeeding("undo-9");
    const undoAction = vi.fn<EventAction>(async () => ({ status: "success", message: "Eventos tirados da agenda.", undoId: null }));
    view({ action, undoAction });

    await user.click(within(row("Dentista")).getByRole("button", { name: "Pôr na agenda" }));
    await user.click(await screen.findByRole("button", { name: "Desfazer" }));

    await waitFor(() => expect(undoAction).toHaveBeenCalledOnce());
    expect(sent(undoAction)).toEqual({ undoId: "undo-9", entryId: ENTRY, locale: "pt-BR" });
    expect(await screen.findByText("Eventos tirados da agenda.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
    expect(row("Dentista")).toBeVisible();
  });

  it("has no primary button: a record can ask several things", () => {
    const { container } = view();
    expect(container.querySelector(".ui-button--primary")).toBeNull();
  });

  it("lists what is already on the agenda with a named cancel that sends the event", async () => {
    const user = userEvent.setup();
    const cancelAction = vi.fn<EventAction>(async () => idleEventActionState);
    view({
      cancelAction,
      pending: [],
      onAgenda: [
        { id: "ev1", title: "Dentista", startsAt: "2026-12-12T18:00:00.000Z", endsAt: null, allDay: false, status: "confirmed" },
        { id: "ev2", title: "Almoço", startsAt: "2026-12-13T15:00:00.000Z", endsAt: null, allDay: false, status: "cancelled" },
      ],
    });

    expect(screen.getByText("“Dentista” está na agenda.")).toBeVisible();
    expect(screen.queryByText(/Almoço/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancelar Dentista" }));
    await waitFor(() => expect(cancelAction).toHaveBeenCalledOnce());
    expect(sent(cancelAction)).toEqual({ entryId: ENTRY, eventId: "ev1", locale: "pt-BR" });
  });

  it("renders nothing when there is nothing, and speaks English", () => {
    const empty = view({ pending: [], onAgenda: [] });
    expect(empty.container.innerHTML).toBe("");
    empty.unmount();

    view({ locale: "en" });
    expect(screen.getByText("Put “Dentista” on the agenda?")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Put on the agenda" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Not now" })).toHaveLength(2);
  });
});
