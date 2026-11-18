import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MemoryProposalState } from "./edit-state";
import type { MemoryProposalAction } from "./memory-proposal-card";
import { RecordMemoryQuestion } from "./record-memory-question";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  ConversationMemoryResolved: vi.fn(() => null),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a className={className} href={href}>{children}</a>
  ),
}));

afterEach(cleanup);

const ENTRY = "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6";

function sent(action: ReturnType<typeof vi.fn<MemoryProposalAction>>, call = 0): Record<string, FormDataEntryValue> {
  return Object.fromEntries((action.mock.calls[call] as [MemoryProposalState, FormData])[1]);
}

function view(props: Partial<React.ComponentProps<typeof RecordMemoryQuestion>> = {}) {
  return render(
    <RecordMemoryQuestion
      action={vi.fn<MemoryProposalAction>(async (state) => state)}
      content="Prefiro reuniões pela manhã."
      kind="preference"
      locale="pt-BR"
      sourceEntryId={ENTRY}
      undoAction={vi.fn<MemoryProposalAction>(async (state) => state)}
      {...props}
    />,
  );
}

describe("RecordMemoryQuestion", () => {
  it("asks, says the kind, and writes nothing before a tap", () => {
    const action = vi.fn<MemoryProposalAction>(async (state) => state);
    const { container } = view({ action });

    expect(screen.getByText("Guardar isto como memória?")).toBeVisible();
    expect(screen.getByText("Tipo: Preferência")).toBeVisible();
    // The record's own text is the page's headline; the row does not repeat it.
    expect(screen.queryByText(/“Prefiro reuniões pela manhã/)).toBeNull();
    expect(screen.getByRole("textbox", { hidden: true })).not.toBeVisible();
    expect(container.querySelector(".ui-button--primary")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("keeps the memory with one tap, sending what the proposal form sent", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MemoryProposalAction>(async () => ({ status: "success", message: "Memória guardada.", memoryId: "m-1" }));
    view({ action });

    await user.click(screen.getByRole("button", { name: "Guardar memória" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(sent(action)).toEqual({
      locale: "pt-BR",
      origin: "record",
      sourceEntryId: ENTRY,
      content: "Prefiro reuniões pela manhã.",
      kind: "preference",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Memória guardada.");
    expect(screen.getByRole("link", { name: "Ver memória" })).toHaveAttribute("href", "/pt-BR/app/memories/m-1");
  });

  it("reveals the text and the kind behind Ajustar, and sends them as adjusted", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MemoryProposalAction>(async (state) => state);
    view({ action });

    const toggle = screen.getByRole("button", { name: "Ajustar" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const text = screen.getByRole("textbox", { name: "Memória" });
    await user.clear(text);
    await user.type(text, "Reuniões só de manhã.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Tipo" }), "rule");
    // The row now says what a tap would keep.
    expect(screen.getByText("“Reuniões só de manhã.” · Tipo: Regra")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Guardar memória" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(sent(action)).toMatchObject({ content: "Reuniões só de manhã.", kind: "rule", origin: "record", sourceEntryId: ENTRY });
  });

  it("cannot keep an empty memory", async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole("button", { name: "Ajustar" }));
    await user.clear(screen.getByRole("textbox", { name: "Memória" }));
    expect(screen.getByRole("button", { name: "Guardar memória" })).toBeDisabled();
  });

  it("discards locally: nothing was written, so nothing is sent", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MemoryProposalAction>(async (state) => state);
    view({ action });

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByRole("status")).toHaveTextContent("Nada foi guardado.");
    expect(screen.queryByRole("button", { name: "Guardar memória" })).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("offers an undo that archives, with the memory it created, and then the way back", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MemoryProposalAction>(async () => ({ status: "success", message: "Memória guardada.", memoryId: "m-1" }));
    const undoAction = vi.fn<MemoryProposalAction>(async () => ({ status: "success", message: "Memória arquivada.", memoryId: "m-1" }));
    view({ action, undoAction });

    await user.click(screen.getByRole("button", { name: "Guardar memória" }));
    await user.click(await screen.findByRole("button", { name: "Arquivar essa memória" }));

    await waitFor(() => expect(undoAction).toHaveBeenCalledOnce());
    expect(sent(undoAction)).toEqual({ locale: "pt-BR", memoryId: "m-1", transition: "archive" });
    expect(await screen.findByRole("status")).toHaveTextContent("Memória arquivada.");
    expect(screen.getByRole("button", { name: "Voltar a usar essa memória" })).toBeVisible();
  });

  it("offers no undo for a duplicate: this turn created nothing", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MemoryProposalAction>(async () => ({ status: "duplicate", message: "Você já tem essa memória.", memoryId: "m-0" }));
    view({ action });

    await user.click(screen.getByRole("button", { name: "Guardar memória" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Você já tem essa memória.");
    expect(screen.queryByRole("button", { name: "Arquivar essa memória" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver memória" })).toHaveAttribute("href", "/pt-BR/app/memories/m-0");
  });

  it("keeps the question and says why when keeping fails", async () => {
    const user = userEvent.setup();
    const action = vi.fn<MemoryProposalAction>(async () => ({ status: "error", message: "Não foi possível salvar agora.", memoryId: null }));
    view({ action });

    await user.click(screen.getByRole("button", { name: "Guardar memória" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar agora.");
    expect(screen.getByRole("button", { name: "Guardar memória" })).toBeEnabled();
  });

  it("speaks English", () => {
    view({ locale: "en" });
    expect(screen.getByText("Keep this as a memory?")).toBeVisible();
    expect(screen.getByText("Type: Preference")).toBeVisible();
    expect(screen.getByRole("button", { name: "Keep memory" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Adjust" })).toBeVisible();
  });
});
