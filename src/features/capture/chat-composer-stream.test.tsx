/**
 * Life Brain E.5 part 2 (ADR-175) — the composer's streamed turn.
 *
 * A plain question goes to the streaming route instead of the action; its
 * answer is drawn as a draft while it is written; on `done` the draft is
 * cleared and the thread is refreshed to the persisted message; on `error` the
 * draft goes and the owner's text comes back. Every other turn still runs the
 * action.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { idleAssistantComposerState } from "@/features/assistant/composer-state";
import type { AssistantComposerAction } from "./chat-composer";
import type { MemoryProposalAction } from "@/features/memories/memory-proposal-card";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("@/features/product-analytics/interaction-events", () => ({ ConversationMemoryResolved: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { ChatComposer } from "./chat-composer";

const conversationId = "22222222-2222-4222-8222-222222222222";

/** A response whose NDJSON body the test writes line by line. */
function controlledStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (started) => void (controller = started) });
  return {
    response: new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } }),
    send: (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    end: () => controller.close(),
  };
}

function memoryAction() {
  return vi.fn<MemoryProposalAction>(async () => ({ status: "idle" as const, message: "", memoryId: null }));
}

function renderComposer(action = vi.fn<AssistantComposerAction>(async () => idleAssistantComposerState)) {
  render(
    <ChatComposer
      action={action}
      agentName="Brain"
      conversationId={conversationId}
      locale="pt-BR"
      memoryAction={memoryAction()}
      memoryUndoAction={memoryAction()}
    />,
  );
  return action;
}

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("a plain question streams", () => {
  it("posts to the chat route, not the action, and draws the answer as it is written", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    const action = renderComposer();

    await userEvent.type(screen.getByRole("textbox"), "O que a Ana pediu?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(action).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/pt-BR/api/chat");
    expect(JSON.parse(init.body)).toEqual({ question: "O que a Ana pediu?", locale: "pt-BR", conversationId });
    expect(init.headers["content-type"]).toBe("application/json");

    // The question joins the draft at once, the answer slot says "pensando".
    const draft = await waitFor(() => {
      const found = document.querySelector("[data-chat-draft]");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(draft.textContent).toContain("O que a Ana pediu?");
    expect(draft.textContent).toContain("Brain está pensando…");
    expect(screen.getByRole("textbox")).toBeDisabled();

    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.send({ type: "delta", text: "A Ana pediu " });
    });
    await waitFor(() => expect(draft.textContent).toContain("A Ana pediu"));
    await act(async () => stream.send({ type: "delta", text: "o contrato." }));
    await waitFor(() => expect(draft.textContent).toContain("A Ana pediu o contrato."));
    // A draft is never addressable as a persisted message.
    expect(document.querySelector('.chat-message.assistant, [data-role="assistant"]')).toBeNull();

    await act(async () => {
      stream.send({ type: "done", conversationId, href: `/pt-BR/app/chat/${conversationId}` });
      stream.end();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelector("[data-chat-draft]")).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it("drops the draft and gives the text back when the turn fails", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    renderComposer();

    await userEvent.type(screen.getByRole("textbox"), "O que a Ana pediu?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.send({ type: "delta", text: "A Ana ped" });
      stream.send({ type: "error", message: "Falha do provedor. Referência: abc.", conversationId });
      stream.end();
    });

    await waitFor(() => expect(document.querySelector("[data-chat-draft]")).toBeNull());
    expect(screen.getByRole("region")).toHaveTextContent("Falha do provedor. Referência: abc.");
    expect(screen.getByRole("textbox")).toHaveValue("O que a Ana pediu?");
    expect(document.body.textContent).not.toContain("A Ana ped");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the route's refusal sentence when it answers without a stream", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ type: "error", message: "Sua sessão expirou." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    renderComposer();

    await userEvent.type(screen.getByRole("textbox"), "O que a Ana pediu?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByRole("region")).toHaveTextContent("Sua sessão expirou."));
    expect(screen.getByRole("textbox")).toHaveValue("O que a Ana pediu?");
  });

  it("refreshes to the thread when the stream just stops, so its own pensando takes over", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    renderComposer();

    await userEvent.type(screen.getByRole("textbox"), "O que a Ana pediu?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.end();
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

describe("every other turn keeps the action", () => {
  it("sends a memory intent through runAssistantTurn, with no stream", async () => {
    const action = renderComposer();
    await userEvent.type(screen.getByRole("textbox"), "Lembre disso sempre");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a sentence tried as a command first (ADR-182)", () => {
  it("tells the action it can stream, then streams the answer the action handed back", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    const action = renderComposer(
      vi.fn<AssistantComposerAction>(async () => ({
        ...idleAssistantComposerState,
        route: "stream_answer",
        echo: "Algo sobre o Jaime e a proposta",
      })),
    );

    await userEvent.type(screen.getByRole("textbox"), "Algo sobre o Jaime e a proposta");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0]![1];
    expect(submitted.get("streamAnswer")).toBe("1");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      question: "Algo sobre o Jaime e a proposta",
      conversationId,
    });

    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.send({ type: "delta", text: "O Jaime pediu a proposta." });
    });
    expect(await screen.findByText("O Jaime pediu a proposta.")).toBeTruthy();
    await act(async () => {
      stream.send({ type: "done", conversationId, href: `/pt-BR/app/chat/${conversationId}` });
      stream.end();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
