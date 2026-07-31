import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MemoryProposalAction } from "@/features/memories/memory-proposal-card";
import { idleTaskCommandState } from "@/features/task-commands/console-state";

import { AssistantComposer, type AssistantComposerAction } from "./assistant-composer";
import { idleAssistantComposerState, type AssistantComposerState } from "./composer-state";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// Typed as the action itself, so `mock.calls[n][1]` is the `FormData` the
// composer submitted rather than `undefined` from a zero-argument inference.
function resolvesTo(state: AssistantComposerState) {
  return vi.fn<AssistantComposerAction>(async () => state);
}

/** A memory turn with nothing to propose — the opener was the whole utterance. */
const memoryProposal: AssistantComposerState = {
  route: "memory_intent",
  command: idleTaskCommandState,
  notice: {
    heading: "Isso parece algo para guardar como memória",
    detail: "Ainda não salvei nada.",
    nextStep: { href: "/pt-BR/app/memories", label: "Criar essa memória em Memórias" },
  },
  echo: "Lembre disso sempre",
  proposal: null,
  announcement: "Isso parece algo para guardar como memória. Ainda não salvei nada.",
};

/**
 * The DEC-5 turn: a proposal exists and the confirm control is reachable.
 *
 * `memoryAction` is what would write. Every assertion below that it was *not*
 * called is the invariant DEC-5 exists to protect.
 */
const memoryProposalWithContent: AssistantComposerState = {
  ...memoryProposal,
  notice: { heading: "Quer que eu guarde isto?", detail: "Nada foi salvo ainda.", nextStep: null },
  proposal: { content: "prefiro reuniões pela manhã", kind: "preference" },
};

// Typed as the action itself, so `mock.calls[n][1]` is the `FormData` the
// proposal card submitted rather than `undefined` from a zero-argument
// inference — the same reason `resolvesTo` above is typed.
function noopMemoryAction() {
  return vi.fn<MemoryProposalAction>(async () => ({
    status: "idle" as const,
    message: "",
    memoryId: null,
  }));
}

describe("AssistantComposer", () => {
  it("presents exactly one text field, which is the whole point of UX-07", () => {
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("does not ask the user to pick a mode before typing", () => {
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />);
    // No radio, no select, no toggle: the composer classifies, the user writes.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("labels the field and links the keyboard hint to it", () => {
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />);
    const field = screen.getByLabelText("O que você quer dizer ao Brain?");
    expect(field).toBeTruthy();
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("Shift+Enter");
  });

  it("submits the declared ask intent with the composed text", async () => {
    const action = resolvesTo(idleAssistantComposerState);
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={action} locale="pt-BR" />);
    await userEvent.type(screen.getByRole("textbox"), "O que combinei com Marina?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const submitted = action.mock.calls[0]![1] as FormData;
    expect(submitted.get("intent")).toBe("ask");
    expect(submitted.get("composerText")).toBe("O que combinei com Marina?");
    expect(submitted.get("locale")).toBe("pt-BR");
  });

  it("carries the conversation id inside a thread so the answer joins it", async () => {
    const action = resolvesTo(idleAssistantComposerState);
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={action} conversationId="c-1" locale="en" />);
    await userEvent.type(screen.getByRole("textbox"), "and then?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![1] as FormData).get("conversationId")).toBe("c-1");
  });

  it("sends on Enter and breaks the line on Shift+Enter", async () => {
    const action = resolvesTo(idleAssistantComposerState);
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={action} locale="pt-BR" />);
    const field = screen.getByRole("textbox");

    await userEvent.type(field, "primeira linha{Shift>}{Enter}{/Shift}segunda linha");
    expect(action).not.toHaveBeenCalled();
    expect((field as HTMLTextAreaElement).value).toBe("primeira linha\nsegunda linha");

    await userEvent.type(field, "{Enter}");
    await waitFor(() => expect(action).toHaveBeenCalled());
    // The newline the user asked for survives; the Enter that sent does not add one.
    expect((action.mock.calls[0]![1] as FormData).get("composerText")).toBe("primeira linha\nsegunda linha");
  });

  it("mounts a single form, so nothing on the surface is a rival submission", () => {
    const { container } = render(
      <AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />,
    );
    // Command controls add their own forms once a preview exists — Apply,
    // Confirm, Choose — but at rest there is exactly one, and it is the
    // composer's. Two at rest is the shape UX-07 describes.
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });

  it("distinguishes what the user wrote from what the system understood", async () => {
    const action = resolvesTo(memoryProposal);
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={action} locale="pt-BR" />);
    await userEvent.type(screen.getByRole("textbox"), "Lembre disso sempre");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("Você escreveu")).toBeTruthy());
    expect(screen.getByText("Isso parece algo para guardar como memória")).toBeTruthy();
    // This turn had nothing to propose, so the only affordance is a link out.
    // No confirm control appears, because there is no memory to confirm.
    const nextStep = screen.getByRole("link", { name: "Criar essa memória em Memórias" });
    expect(nextStep.getAttribute("href")).toBe("/pt-BR/app/memories");
    expect(screen.queryByRole("button", { name: /memória/i })).toBeNull();
  });

  it("announces the outcome once, not twice", async () => {
    const action = resolvesTo(memoryProposal);
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={action} locale="pt-BR" />);
    await userEvent.type(screen.getByRole("textbox"), "Lembre disso sempre");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    // `TaskCommandResult` is mounted with `silent`, so the composer owns the one
    // polite region. Two would read every command outcome aloud twice.
    await waitFor(() => {
      const regions = screen.getAllByRole("status");
      expect(regions).toHaveLength(1);
      expect(regions[0]!.textContent).toBe(memoryProposal.announcement);
    });
  });

  it("disables the field and the control while a turn is in flight", async () => {
    let release!: (state: AssistantComposerState) => void;
    const action = vi.fn(
      () => new Promise<AssistantComposerState>((resolve) => { release = resolve; }),
    );
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={action} locale="pt-BR" />);
    await userEvent.type(screen.getByRole("textbox"), "Marque a tarefa como feita");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Pensando…" })).toBeDisabled());
    expect(screen.getByRole("textbox")).toBeDisabled();

    // A second Enter while pending must not open a second round.
    await userEvent.keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(1);

    release(idleAssistantComposerState);
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar" })).not.toBeDisabled());
  });

  it("localizes every visible string in English", () => {
    render(<AssistantComposer memoryAction={noopMemoryAction()} agentName="Brain" action={resolvesTo(idleAssistantComposerState)} locale="en" />);
    expect(screen.getByLabelText("What do you want to tell Brain?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.getByText("Enter sends · Shift+Enter adds a line")).toBeTruthy();
  });
});

/**
 * DEC-5: a recognised memory request proposes, and only an explicit confirmation
 * writes. These assertions are the contract, not the styling.
 */
describe("AssistantComposer memory proposal (DEC-5)", () => {
  async function submitMemoryTurn(locale: "pt-BR" | "en" = "pt-BR") {
    const memoryAction = noopMemoryAction();
    render(
      <AssistantComposer
        action={resolvesTo(memoryProposalWithContent)}
        agentName="Brain"
        locale={locale}
        memoryAction={memoryAction}
      />,
    );
    await userEvent.type(screen.getByRole("textbox"), "Lembre disso sempre: prefiro reuniões pela manhã");
    await userEvent.click(screen.getByRole("button", { name: locale === "en" ? "Send" : "Enviar" }));
    await waitFor(() => expect(screen.getByText("Quer que eu guarde isto?")).toBeTruthy());
    return memoryAction;
  }

  it("shows the proposed memory without writing anything", async () => {
    const memoryAction = await submitMemoryTurn();

    // The proposed text is present and editable — a proposal the owner cannot
    // correct is a confirmation in name only.
    const proposed = screen.getByDisplayValue("prefiro reuniões pela manhã");
    expect((proposed as HTMLTextAreaElement).disabled).toBe(false);
    // And nothing has been persisted merely by rendering it.
    expect(memoryAction).not.toHaveBeenCalled();
  });

  it("preselects the proposed kind as a suggestion the owner can change", async () => {
    await submitMemoryTurn();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("preference");
  });

  it("writes only when the owner confirms, and sends what is on screen", async () => {
    const memoryAction = await submitMemoryTurn();

    const proposed = screen.getByDisplayValue("prefiro reuniões pela manhã");
    await userEvent.clear(proposed);
    await userEvent.type(proposed, "prefiro reuniões às 9h");
    await userEvent.click(screen.getByRole("button", { name: "Guardar memória" }));

    await waitFor(() => expect(memoryAction).toHaveBeenCalled());
    const submitted = memoryAction.mock.calls[0]![1] as FormData;
    // The corrected text is what is stored, not the originally proposed one.
    expect(submitted.get("content")).toBe("prefiro reuniões às 9h");
    expect(submitted.get("kind")).toBe("preference");
    expect(submitted.get("locale")).toBe("pt-BR");
  });

  it("discards without any server round-trip, because nothing was written", async () => {
    const memoryAction = await submitMemoryTurn();

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(screen.getByText("Nada foi guardado.")).toBeTruthy());
    expect(memoryAction).not.toHaveBeenCalled();
    // The confirm control is gone, so a discarded proposal cannot be revived by
    // a stray second click.
    expect(screen.queryByRole("button", { name: "Guardar memória" })).toBeNull();
  });

  it("localizes the proposal in English", async () => {
    await submitMemoryTurn("en");
    expect(screen.getByRole("button", { name: "Keep memory" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });
});
