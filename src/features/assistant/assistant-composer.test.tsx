import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

const memoryProposal: AssistantComposerState = {
  route: "memory_intent",
  command: idleTaskCommandState,
  notice: {
    heading: "Isso parece algo para guardar como memória",
    detail: "Ainda não salvei nada.",
    nextStep: { href: "/pt-BR/app/memories", label: "Criar essa memória em Memórias" },
  },
  echo: "Lembre disso sempre",
  announcement: "Isso parece algo para guardar como memória. Ainda não salvei nada.",
};

describe("AssistantComposer", () => {
  it("presents exactly one text field, which is the whole point of UX-07", () => {
    render(<AssistantComposer action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("does not ask the user to pick a mode before typing", () => {
    render(<AssistantComposer action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />);
    // No radio, no select, no toggle: the composer classifies, the user writes.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("labels the field and links the keyboard hint to it", () => {
    render(<AssistantComposer action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />);
    const field = screen.getByLabelText("O que você quer dizer ao Brain?");
    expect(field).toBeTruthy();
    const describedBy = field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("Shift+Enter");
  });

  it("submits the declared ask intent with the composed text", async () => {
    const action = resolvesTo(idleAssistantComposerState);
    render(<AssistantComposer action={action} locale="pt-BR" />);
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
    render(<AssistantComposer action={action} conversationId="c-1" locale="en" />);
    await userEvent.type(screen.getByRole("textbox"), "and then?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![1] as FormData).get("conversationId")).toBe("c-1");
  });

  it("sends on Enter and breaks the line on Shift+Enter", async () => {
    const action = resolvesTo(idleAssistantComposerState);
    render(<AssistantComposer action={action} locale="pt-BR" />);
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
      <AssistantComposer action={resolvesTo(idleAssistantComposerState)} locale="pt-BR" />,
    );
    // Command controls add their own forms once a preview exists — Apply,
    // Confirm, Choose — but at rest there is exactly one, and it is the
    // composer's. Two at rest is the shape UX-07 describes.
    expect(container.querySelectorAll("form")).toHaveLength(1);
  });

  it("distinguishes what the user wrote from what the system understood", async () => {
    const action = resolvesTo(memoryProposal);
    render(<AssistantComposer action={action} locale="pt-BR" />);
    await userEvent.type(screen.getByRole("textbox"), "Lembre disso sempre");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("Você escreveu")).toBeTruthy());
    expect(screen.getByText("Isso parece algo para guardar como memória")).toBeTruthy();
    // The proposal is a link, not a button: nothing here may persist a memory
    // until Slice G builds the confirmed-memory contract (DEC-5).
    const nextStep = screen.getByRole("link", { name: "Criar essa memória em Memórias" });
    expect(nextStep.getAttribute("href")).toBe("/pt-BR/app/memories");
    expect(screen.queryByRole("button", { name: /memória/i })).toBeNull();
  });

  it("announces the outcome once, not twice", async () => {
    const action = resolvesTo(memoryProposal);
    render(<AssistantComposer action={action} locale="pt-BR" />);
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
    render(<AssistantComposer action={action} locale="pt-BR" />);
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
    render(<AssistantComposer action={resolvesTo(idleAssistantComposerState)} locale="en" />);
    expect(screen.getByLabelText("What do you want to tell Brain?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.getByText("Enter sends · Shift+Enter adds a line")).toBeTruthy();
  });
});
