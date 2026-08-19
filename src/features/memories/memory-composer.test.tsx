import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemoryComposer } from "./memory-composer";
import { idleMemoryProposalState, type MemoryProposalState } from "./edit-state";

/**
 * `2P-MEMORY-001` … `-004` — the deliberate composer.
 *
 * The cases are the four the requirement is actually about, and each replaces
 * something the one-line field could not do:
 *
 *  1. the flow **explains what a memory is** before asking for one;
 *  2. the owner **sees the exact sentence** that will be stored, before it is;
 *  3. cancelling **writes nothing**, from either pane;
 *  4. the result carries an **undo**, and the undo archives rather than deletes.
 *
 * Plus the one it must not do: claim an origin. A memory written here has
 * `source_entry_id = null`, the list renders that `unsourced`, and a composer
 * saying "informed by you" would put the two surfaces in disagreement about the
 * same row.
 */

const MEMORY_ID = "77777777-7777-4777-8777-777777777777";

type Action = (state: MemoryProposalState, formData: FormData) => Promise<MemoryProposalState>;

function resolvesTo(state: MemoryProposalState) {
  return vi.fn<Action>(async () => state);
}

function mount(overrides: Partial<Parameters<typeof MemoryComposer>[0]> = {}) {
  const createAction = overrides.createAction ?? resolvesTo(idleMemoryProposalState);
  const undoAction = overrides.undoAction ?? resolvesTo(idleMemoryProposalState);
  render(
    <MemoryComposer
      createAction={createAction}
      locale="pt-BR"
      undoAction={undoAction}
      {...overrides}
    />,
  );
  return { createAction, undoAction };
}

/** Open the dialog and write a draft, which every case below needs. */
async function compose(text: string) {
  await userEvent.click(screen.getByRole("button", { name: /Nova memória/ }));
  await userEvent.type(screen.getByLabelText("O que deve continuar valendo"), text);
}

describe("MemoryComposer", () => {
  it("opens a dialog with a multiline field and says what a memory is", async () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Nova memória/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Its own id namespace: two dialogs open at once would otherwise point
    // `aria-labelledby` at the wrong heading.
    expect(dialog).toHaveAttribute("aria-labelledby", "memory-compose-dialog-title");
    // A textarea, not an input showing sixty of four thousand characters, and a
    // visible label rather than an `sr-only` one plus a placeholder.
    const field = screen.getByLabelText("O que deve continuar valendo");
    expect(field.tagName).toBe("TEXTAREA");
    // `2P-MEMORY-002`: durability is explained, and the one-off case is named.
    expect(screen.getByText(/continua valendo com o tempo/)).toBeInTheDocument();
    expect(screen.getByText(/aconteceu num momento só/)).toBeInTheDocument();
  });

  it("shows the exact sentence before storing it, and does not store it yet", async () => {
    const { createAction } = mount();
    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));

    // `2P-MEMORY-003`, the half that is a step rather than a message.
    expect(screen.getByText("É isto que vou guardar:")).toBeInTheDocument();
    expect(screen.getByText("Prefiro reuniões pela manhã.")).toBeInTheDocument();
    expect(createAction).not.toHaveBeenCalled();

    // And back, keeping what was written — the review pane must not be a
    // one-way door.
    await userEvent.click(screen.getByRole("button", { name: "Voltar e editar" }));
    expect(screen.getByLabelText("O que deve continuar valendo")).toHaveValue(
      "Prefiro reuniões pela manhã.",
    );
  });

  it("states that there is no source record rather than inventing one", async () => {
    mount();
    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));

    // The column is `on delete set null`, so null is ambiguous and the list
    // renders it `unsourced`. "Informed by you" here would contradict it.
    expect(screen.getByText(/Sem registro de origem/)).toBeInTheDocument();
    expect(screen.queryByText(/de um registro seu/i)).toBeNull();
  });

  it("submits the reviewed content, as a fact, from the memories page", async () => {
    const createAction = resolvesTo({ status: "success", message: "Memória guardada.", memoryId: MEMORY_ID });
    mount({ createAction });

    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar memória" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    const submitted = createAction.mock.calls[0]![1];
    expect(submitted.get("content")).toBe("Prefiro reuniões pela manhã.");
    // The kind this page has always stored, preserved rather than turned into a
    // ten-way choice (`2P-MEMORY-004`).
    expect(submitted.get("kind")).toBe("fact");
    // Reaches the audit reason and nothing else.
    expect(submitted.get("origin")).toBe("memories");
  });

  it("refuses to review an empty draft without asking the server", async () => {
    const { createAction } = mount();
    await userEvent.click(screen.getByRole("button", { name: /Nova memória/ }));
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Escreva a memória antes de revisar.");
    expect(createAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("writes nothing when cancelled from the writing pane", async () => {
    const { createAction } = mount();
    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("writes nothing when Escape closes the review pane", async () => {
    const { createAction } = mount();
    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("offers undo with the created id, and withdraws it once used", async () => {
    const createAction = resolvesTo({ status: "success", message: "Memória guardada.", memoryId: MEMORY_ID });
    const undoAction = resolvesTo({
      status: "success",
      message: "Memória arquivada. Ela saiu de uso e continua guardada no seu histórico.",
      memoryId: MEMORY_ID,
    });
    mount({ createAction, undoAction });

    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar memória" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Twice on purpose: once in the polite live region, once visibly.
    expect(screen.getAllByText("Memória guardada.")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(undoAction).toHaveBeenCalled());
    expect(undoAction.mock.calls[0]![1].get("memoryId")).toBe(MEMORY_ID);

    // OD-2K-3: it archives. The words must never say deleted, and the control
    // goes once it has been used — a second press would have nothing to reverse.
    await waitFor(() => expect(screen.getAllByText(/arquivada/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/exclu|apagad|deletad/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
  });

  it("offers no undo when the write reported a duplicate it did not create", async () => {
    // `createProposedMemory` returns the existing row's id on a duplicate. That
    // memory predates this act, and archiving it would destroy something the
    // owner did not just create — an "undo" that undoes somebody else's earlier
    // decision.
    const createAction = resolvesTo({
      status: "duplicate",
      message: "Você já tem essa memória.",
      memoryId: MEMORY_ID,
    });
    mount({ createAction });

    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar memória" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByText("Você já tem essa memória.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
  });

  it("keeps what was typed when the save is refused", async () => {
    // React resets an uncontrolled form once a Server Action completes, so a
    // refusal would otherwise erase the sentence and leave an error above an
    // edit nobody can see.
    const createAction = resolvesTo({ status: "error", message: "Não foi possível salvar.", memoryId: null });
    mount({ createAction });

    await compose("Prefiro reuniões pela manhã.");
    await userEvent.click(screen.getByRole("button", { name: "Revisar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar memória" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Não foi possível salvar.");
    await userEvent.click(screen.getByRole("button", { name: "Voltar e editar" }));
    expect(screen.getByLabelText("O que deve continuar valendo")).toHaveValue(
      "Prefiro reuniões pela manhã.",
    );
  });
});
