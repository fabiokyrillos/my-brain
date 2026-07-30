import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendChatMessage } from "@/features/chat/actions";
import { runTaskCommand } from "@/features/task-commands/actions";
import {
  idleTaskCommandState,
  type TaskCommandConsoleState,
} from "@/features/task-commands/console-state";
import { MAX_COMMAND_TEXT_LENGTH } from "@/lib/ai/task-command-schema";
import { TASK_COMMAND_UNSUPPORTED_REASONS } from "@/features/task-commands/taxonomy";

import { runAssistantTurn } from "./actions";
import { idleAssistantComposerState } from "./composer-state";

/**
 * The composer's routing, proven at the seam it actually owns.
 *
 * Both collaborators are mocked on purpose: `runTaskCommand` and
 * `sendChatMessage` are covered by their own suites, and what is untested until
 * here is the decision *between* them. These cases are written around the four
 * ways that decision can be wrong and cost the user something real — a refusal
 * dressed up as an answer, an infrastructure fault hidden behind one, a
 * low-confidence command applied without being shown, and a memory written
 * without being confirmed.
 */

vi.mock("@/features/task-commands/actions", () => ({ runTaskCommand: vi.fn() }));
vi.mock("@/features/chat/actions", () => ({ sendChatMessage: vi.fn() }));

const commandMock = vi.mocked(runTaskCommand);
const chatMock = vi.mocked(sendChatMessage);

function ask(text: string, overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("intent", "ask");
  data.set("locale", "pt-BR");
  data.set("composerText", text);
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function commandState(overrides: Partial<TaskCommandConsoleState> = {}): TaskCommandConsoleState {
  return { ...idleTaskCommandState, status: "resolved", heading: "h", detail: "d", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  chatMock.mockResolvedValue({ status: "error", message: "O Brain não conseguiu responder agora." });
  commandMock.mockResolvedValue(commandState());
});

describe("runAssistantTurn — the command path keeps its contracts", () => {
  it("forwards every follow-up intent to the command pipeline untouched", async () => {
    // Apply, Confirm, Choose, Clarify, Create, Undo and Restore are the steps
    // where confirmation, audit, undo and idempotency live. The composer must
    // hand them over verbatim rather than re-derive any of them.
    for (const intent of ["apply", "confirm", "select", "clarify", "create", "undo", "restore"] as const) {
      vi.clearAllMocks();
      commandMock.mockResolvedValue(commandState({ control: "apply" }));
      const data = new FormData();
      data.set("intent", intent);
      data.set("locale", "pt-BR");

      const previous = { ...idleAssistantComposerState, command: commandState({ session: "envelope" }) };
      const result = await runAssistantTurn(previous, data);

      expect(commandMock).toHaveBeenCalledWith(previous.command, data);
      expect(chatMock).not.toHaveBeenCalled();
      expect(result.route).toBe("command");
    }
  });

  it("starts a fresh command from the Brain mount, so the funnel still separates it from Work", async () => {
    await runAssistantTurn(idleAssistantComposerState, ask("Marque a tarefa do relatório como feita"));

    const [, submitted] = commandMock.mock.calls[0]!;
    expect(submitted.get("intent")).toBe("start");
    expect(submitted.get("commandText")).toBe("Marque a tarefa do relatório como feita");
    expect(submitted.get("origin")).toBe("chat");
  });

  it("shows a preview waiting for confirmation instead of answering something else", async () => {
    commandMock.mockResolvedValue(commandState({ control: "confirm" }));
    const result = await runAssistantTurn(idleAssistantComposerState, ask("Cancele a tarefa do relatório"));

    expect(result.route).toBe("command");
    expect(result.command.control).toBe("confirm");
    expect(chatMock).not.toHaveBeenCalled();
  });
});

describe("runAssistantTurn — fallthrough is classified, never caught", () => {
  it("routes to the knowledge answer only on not_a_task_command", async () => {
    commandMock.mockResolvedValue(
      commandState({ unsupportedReason: "not_a_task_command", terminal: true }),
    );
    await runAssistantTurn(idleAssistantComposerState, ask("O que combinei com Jaime?"));

    expect(chatMock).toHaveBeenCalledTimes(1);
    const [, submitted] = chatMock.mock.calls[0]!;
    expect(submitted.get("question")).toBe("O que combinei com Jaime?");
  });

  it("never converts any other refusal into a chat question", async () => {
    // Exhaustive against the taxonomy: a reason added later must default to
    // staying visible as unsupported, not to being silently answered.
    for (const reason of TASK_COMMAND_UNSUPPORTED_REASONS) {
      if (reason === "not_a_task_command") continue;
      vi.clearAllMocks();
      chatMock.mockResolvedValue({ status: "error", message: "x" });
      commandMock.mockResolvedValue(commandState({ unsupportedReason: reason, terminal: true }));

      const result = await runAssistantTurn(idleAssistantComposerState, ask("Me lembre toda segunda"));

      expect(chatMock).not.toHaveBeenCalled();
      expect(result.route).toBe("command");
      expect(result.command.unsupportedReason).toBe(reason);
    }
  });

  it("never masks a task-command infrastructure failure as a knowledge answer", async () => {
    // A lost or truncated provider response is a refusal with no unsupported
    // reason. Answering it from knowledge would hide an outage behind a
    // plausible sentence and cost the user their retry.
    commandMock.mockResolvedValue(
      commandState({ reason: "O modelo não respondeu.", retryable: true, unsupportedReason: null }),
    );
    const result = await runAssistantTurn(idleAssistantComposerState, ask("Marque como feita"));

    expect(chatMock).not.toHaveBeenCalled();
    expect(result.route).toBe("command");
    expect(result.command.retryable).toBe(true);
  });

  it("reports a failed knowledge answer as a failed answer", async () => {
    commandMock.mockResolvedValue(commandState({ unsupportedReason: "not_a_task_command" }));
    chatMock.mockResolvedValue({ status: "error", message: "Sua pergunta ficou salva." });

    const result = await runAssistantTurn(idleAssistantComposerState, ask("O que combinei com Jaime?"));

    expect(result.route).toBe("knowledge_failed");
    expect(result.notice?.detail).toBe("Sua pergunta ficou salva.");
    expect(result.echo).toBe("O que combinei com Jaime?");
  });

  it("lets the redirect a successful answer throws escape, so the user reaches the thread", async () => {
    // `sendChatMessage` finishes by redirecting; `redirect()` signals that by
    // throwing. A `try` anywhere in the composer would strand the user on the
    // composer with an answer they cannot see.
    commandMock.mockResolvedValue(commandState({ unsupportedReason: "not_a_task_command" }));
    chatMock.mockImplementation(async () => { throw new Error("NEXT_REDIRECT"); });

    await expect(runAssistantTurn(idleAssistantComposerState, ask("O que combinei com Jaime?")))
      .rejects.toThrow("NEXT_REDIRECT");
  });

  it("keeps the conversation id on the fallthrough so a thread answer joins its thread", async () => {
    commandMock.mockResolvedValue(commandState({ unsupportedReason: "not_a_task_command" }));
    await runAssistantTurn(idleAssistantComposerState, ask("E depois?", { conversationId: "c-9" }));

    expect(chatMock.mock.calls[0]![1].get("conversationId")).toBe("c-9");
  });
});

describe("runAssistantTurn — memory intent proposes and never persists (DEC-5)", () => {
  it("recognizes a memory instruction without spending a provider call", async () => {
    const result = await runAssistantTurn(idleAssistantComposerState, ask("Lembre disso sempre"));

    expect(result.route).toBe("memory_intent");
    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("offers a next step rather than a write, and says nothing was saved", async () => {
    const result = await runAssistantTurn(idleAssistantComposerState, ask("Lembre disso sempre"));

    expect(result.notice?.nextStep?.href).toBe("/pt-BR/app/memories");
    expect(result.notice?.detail).toContain("Ainda não salvei nada");
    expect(result.echo).toBe("Lembre disso sempre");
  });

  it("localizes the proposal and its destination", async () => {
    const data = ask("Remember this: invoices come to me", { locale: "en" });
    const result = await runAssistantTurn(idleAssistantComposerState, data);

    expect(result.notice?.nextStep?.href).toBe("/en/app/memories");
    expect(result.notice?.detail).toContain("Nothing has been saved");
  });
});

describe("runAssistantTurn — the bounds", () => {
  it("skips the command parse for text longer than a command can be", async () => {
    // Contractual, not heuristic: `commandTextSchema` caps a command at this
    // length, so parsing longer text buys a refusal the cap already guaranteed.
    await runAssistantTurn(idleAssistantComposerState, ask("a".repeat(MAX_COMMAND_TEXT_LENGTH + 1)));

    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("still parses text exactly at the bound", async () => {
    await runAssistantTurn(idleAssistantComposerState, ask("a".repeat(MAX_COMMAND_TEXT_LENGTH)));
    expect(commandMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty submission before reaching any collaborator", async () => {
    const result = await runAssistantTurn(idleAssistantComposerState, ask("   "));

    expect(result.route).toBe("invalid");
    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("refuses text past the chat ceiling with its own localized reason", async () => {
    const result = await runAssistantTurn(idleAssistantComposerState, ask("a".repeat(12_001)));

    expect(result.route).toBe("invalid");
    expect(result.notice?.heading).toBe("Texto longo demais");
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("refuses an intent outside the closed list rather than falling through to one", async () => {
    const data = ask("anything");
    data.set("intent", "definitely-not-an-intent");

    const result = await runAssistantTurn(idleAssistantComposerState, data);

    expect(result.route).toBe("invalid");
    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("localizes every refusal in English too", async () => {
    const result = await runAssistantTurn(idleAssistantComposerState, ask("   ", { locale: "en" }));
    expect(result.notice?.heading).toBe("Write something first");
  });
});
