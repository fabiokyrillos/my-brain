import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmationPanel, type ConfirmationAction, type ConfirmationActionState } from "./confirmation-panel";

afterEach(cleanup);

const ENTRY = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";
const INTERPRETATION = "94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f";

function sent(action: ReturnType<typeof vi.fn<ConfirmationAction>>, call = 0): Record<string, FormDataEntryValue> {
  return Object.fromEntries((action.mock.calls[call] as [ConfirmationActionState, FormData])[1]);
}

function view(props: Partial<React.ComponentProps<typeof ConfirmationPanel>> = {}) {
  return render(
    <ConfirmationPanel
      confirmAction={vi.fn<ConfirmationAction>(async (state) => state)}
      entryId={ENTRY}
      interpretationId={INTERPRETATION}
      locale="pt-BR"
      undoAction={vi.fn<ConfirmationAction>(async (state) => state)}
      {...props}
    />,
  );
}

describe("ConfirmationPanel", () => {
  it("asks one question with one answer, and writes nothing before a tap", () => {
    const confirmAction = vi.fn<ConfirmationAction>(async (state) => state);
    const { container } = view({ confirmAction });

    expect(screen.getByText("A leitura está certa?")).toBeVisible();
    expect(screen.getByText("Confirmar tira este registro da fila.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirmar leitura" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".ui-button--primary")).toBeNull();
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it("sends the entry, the interpretation and a key that is stable for that pair", async () => {
    const confirmAction = vi.fn<ConfirmationAction>(async () => ({ status: "error", message: "Ainda há uma decisão aberta." }));
    view({ confirmAction });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar leitura" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda há uma decisão aberta.");
    // The refusal is shown and the question stays; a second tap replays the key.
    fireEvent.click(screen.getByRole("button", { name: "Confirmar leitura" }));
    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(2));

    const expected = {
      entryId: ENTRY,
      interpretationId: INTERPRETATION,
      operationKey: `confirm-interpretation:${ENTRY}:${INTERPRETATION}`,
      locale: "pt-BR",
    };
    expect(sent(confirmAction, 0)).toEqual(expected);
    expect(sent(confirmAction, 1)).toEqual(expected);
  });

  it("replaces the question with the result, its undo and the way back; undoing asks again", async () => {
    const confirmAction = vi.fn<ConfirmationAction>(async () => ({ status: "success", message: "Leitura confirmada.", undoId: "undo-3" }));
    const undoAction = vi.fn<ConfirmationAction>(async () => ({ status: "success", message: "Confirmação desfeita." }));
    view({ confirmAction, undoAction });

    fireEvent.click(screen.getByRole("button", { name: "Confirmar leitura" }));
    expect(await screen.findByText("Leitura confirmada.")).toBeVisible();
    expect(screen.queryByText("A leitura está certa?")).toBeNull();
    expect(screen.getByRole("link", { name: "Voltar para a fila" })).toHaveAttribute("href", "/pt-BR/app/inbox");

    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(await screen.findByText("Confirmação desfeita.")).toBeVisible();
    expect(sent(undoAction)).toEqual({ entryId: ENTRY, undoId: "undo-3", locale: "pt-BR" });
    expect(screen.getByText("A leitura está certa?")).toBeVisible();
  });

  it("speaks English", () => {
    view({ locale: "en" });
    expect(screen.getByText("Is the reading right?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm reading" })).toBeVisible();
  });
});
