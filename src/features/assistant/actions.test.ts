import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureEntry } from "@/features/capture/actions";
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
// Slice 2G.3's third collaborator, mocked on the same terms as the other two:
// `captureEntry` has its own suite, and what is untested until here is the
// decision to reach it at all. It also carries `server-only` transitively, so
// an unmocked import would fail this file at load rather than at an assertion.
vi.mock("@/features/capture/actions", () => ({ captureEntry: vi.fn() }));

const commandMock = vi.mocked(runTaskCommand);
const chatMock = vi.mocked(sendChatMessage);
const captureMock = vi.mocked(captureEntry);

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
  captureMock.mockResolvedValue({
    status: "success",
    receipt: {
      entryId: "aaaaaaaa-1111-4111-8111-111111111111",
      persisted: true,
      productState: "organizing",
      messageKey: "capture_saved",
      safeHref: "/pt-BR/app/inbox/aaaaaaaa-1111-4111-8111-111111111111",
      replayed: false,
    },
  } as Awaited<ReturnType<typeof captureEntry>>);
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

  // The opener with nothing after it. There is no memory to propose, so the
  // turn asks for one and still offers the surface that can create it by hand.
  it("asks for the content when the opener is the whole utterance", async () => {
    const result = await runAssistantTurn(idleAssistantComposerState, ask("Lembre disso sempre"));

    expect(result.proposal).toBeNull();
    expect(result.notice?.nextStep?.href).toBe("/pt-BR/app/memories");
    expect(result.notice?.detail).toContain("Diga o que eu devo lembrar");
    expect(result.echo).toBe("Lembre disso sempre");
  });

  // The DEC-5 shape: the turn carries what *would* be stored, and carrying it is
  // not storing it. The action reaches no write path at all — the confirm
  // control on the rendered proposal is the only thing that can.
  it("carries a proposal, and still writes nothing", async () => {
    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Lembre disso sempre: prefiro reuniões pela manhã"),
    );

    expect(result.route).toBe("memory_intent");
    expect(result.proposal).toEqual({ content: "prefiro reuniões pela manhã", kind: "preference" });
    // The instruction to remember is not part of the thing remembered.
    expect(result.proposal?.content).not.toContain("Lembre");
    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("localizes the proposal in English", async () => {
    const data = ask("Remember this: invoices come to me", { locale: "en" });
    const result = await runAssistantTurn(idleAssistantComposerState, data);

    expect(result.proposal?.content).toBe("invoices come to me");
    expect(result.notice?.detail).toContain("Nothing has been saved yet");
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

describe("capture routing (2G.3)", () => {
  it("files an explicit capture request and links to the entry it became", async () => {
    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Registre que preciso enviar o relatório para a Marina"),
    );

    expect(result.route).toBe("capture_intent");
    expect(result.notice?.heading).toBe("Anotei isso para você");
    /*
     * `2K-CARD-007`. The link the route used to render as a bare `nextStep` is
     * now a read-only preview card for the entry that was created. Same
     * destination; what changed is that it arrives inside the one card grammar,
     * declared `read_only` by OD-2K-B, so this acknowledgment cannot grow a
     * mutating control later without failing `phase-2k-card-guard.test.ts`.
     */
    expect(result.notice?.nextStep).toBeNull();
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toEqual({
      cardType: "entry",
      state: "previewed",
      mutability: "read_only",
      reversal: { kind: "none" },
      objectId: "aaaaaaaa-1111-4111-8111-111111111111",
      snippet: null,
      // The receipt carries no text, so nothing here was classified and the
      // default is the protective one rather than an invented `normal`.
      sensitivity: "highly_sensitive",
      href: "/pt-BR/app/inbox/aaaaaaaa-1111-4111-8111-111111111111",
    });
    // Neither the model nor the knowledge path was reached: the route is
    // decided deterministically, before anything is billed.
    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();

    const submitted = captureMock.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("captureSource")).toBe("composer");
    // `entries.source` says where the entry came from; `captureSource` says
    // which surface asked. They are different questions.
    expect(submitted.get("source")).toBe("chat");
    expect(submitted.get("content")).toContain("relatório");
    // 2G-CAPTURE-006: a server-minted key rides every routed capture.
    expect(String(submitted.get("idempotencyKey"))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("asks which object was meant instead of guessing, and writes nothing", async () => {
    // A filing imperative *and* a named task: two different objects in one
    // sentence, and the product has no way to know which was meant. Asking
    // costs a turn; guessing wrong costs a stored object of the wrong type
    // that the owner has to find and delete.
    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Registre que preciso de uma tarefa para revisar os números"),
    );

    expect(result.route).toBe("capture_ambiguous");
    expect(result.notice?.heading).toBe("Uma nota ou uma tarefa?");
    expect(captureMock).not.toHaveBeenCalled();
    expect(commandMock).not.toHaveBeenCalled();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("leaves an unambiguous task request to the model, which is where creation lives", async () => {
    // "Registre uma tarefa…" names exactly one object and matches no filing
    // opener, so it is not this module's to route: it goes to the command
    // path, where 2G.1's `create` classification handles it. The two routes
    // are structurally disjoint, and this pins that rather than assuming it.
    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Registre uma tarefa para revisar os números"),
    );

    expect(result.route).toBe("command");
    expect(captureMock).not.toHaveBeenCalled();
    expect(commandMock).toHaveBeenCalled();
  });

  it("surfaces the capture action's own honest refusal rather than a generic failure", async () => {
    // A quota ceiling and a storage fault are different facts, and
    // `captureEntry` already localizes both (SH.6). Flattening them here would
    // tell someone at today's limit that something went wrong instead.
    captureMock.mockResolvedValue({
      status: "error",
      code: "quota_exceeded",
      message: "Você atingiu o limite de entradas de hoje.",
    } as Awaited<ReturnType<typeof captureEntry>>);

    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Anote que a reunião mudou para sexta"),
    );

    expect(result.route).toBe("capture_intent");
    expect(result.notice?.heading).toBe("Não consegui guardar isso");
    expect(result.notice?.detail).toBe("Você atingiu o limite de entradas de hoje.");
    expect(result.notice?.nextStep).toBeNull();
  });

  it("leaves a question to the knowledge path, even with a filing verb in it", async () => {
    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Registre que eu pedi o relatório?"),
    );

    expect(result.route).not.toBe("capture_intent");
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("keeps memory ahead of capture, because its branch persists nothing", async () => {
    const result = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Lembre disso sempre: eu reviso faturas às sextas"),
    );

    expect(result.route).toBe("memory_intent");
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("localizes the capture acknowledgment and the ambiguity question in English", async () => {
    const filed = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Note that the invoice arrived late", { locale: "en" }),
    );
    expect(filed.route).toBe("capture_intent");
    expect(filed.notice?.heading).toBe("I noted that for you");

    const asked = await runAssistantTurn(
      idleAssistantComposerState,
      ask("Note that I need a task for the numbers", { locale: "en" }),
    );
    expect(asked.route).toBe("capture_ambiguous");
    expect(asked.notice?.heading).toBe("A note or a task?");
  });
});
