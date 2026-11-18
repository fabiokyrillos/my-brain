/**
 * Life Brain E.6 (ADR-176) — the Conversar surface.
 *
 * A question asked on the new-conversation screen streams into that same
 * screen: the draft is drawn in the thread (not under the field), the address
 * becomes the conversation's as soon as it exists, and on `done` the route is
 * replaced — never pushed — so the owner does not "enter" anything. The other
 * conversations are behind the menu.
 */

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { idleAssistantComposerState, type AssistantComposerState } from "@/features/assistant/composer-state";
import type { MemoryProposalAction } from "@/features/memories/memory-proposal-card";

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push, replace }) }));
vi.mock("@/features/product-analytics/interaction-events", () => ({ ConversationMemoryResolved: () => null }));
const searchConversations = vi.fn();
vi.mock("./conversation-search", () => ({ searchConversations: (...args: unknown[]) => searchConversations(...args) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { ChatComposer } from "@/features/capture/chat-composer";
import { ChatFrame } from "./chat-frame";
import { ChatDraftSlot, ChatStreamProvider } from "./chat-stream-context";
import type { ConversationGroup } from "./conversation-groups";

const conversationId = "33333333-3333-4333-8333-333333333333";

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

const memoryAction = () =>
  vi.fn<MemoryProposalAction>(async () => ({ status: "idle" as const, message: "", memoryId: null }));

function setWidth(narrow: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: narrow,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
  replace.mockReset();
  fetchMock.mockReset();
  searchConversations.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("scrollTo", vi.fn());
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/pt-BR/app/chat");
});
afterEach(() => vi.unstubAllGlobals());

describe("a new conversation becomes the conversation without being entered", () => {
  it("draws the draft in the thread, moves the address, and replaces the route on done", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    const action = vi.fn(async (): Promise<AssistantComposerState> => idleAssistantComposerState);
    render(
      <ChatStreamProvider locale="pt-BR">
        <div data-testid="thread"><ChatDraftSlot agentName="Brain" locale="pt-BR" /></div>
        <div data-testid="dock">
          <ChatComposer
            action={action}
            agentName="Brain"
            locale="pt-BR"
            memoryAction={memoryAction()}
            memoryUndoAction={memoryAction()}
          />
        </div>
      </ChatStreamProvider>,
    );

    await userEvent.type(screen.getByRole("textbox"), "Quando fui ao médico?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(action).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).conversationId).toBe("");

    // The draft is in the thread, not under the field.
    await waitFor(() => expect(within(screen.getByTestId("thread")).getByText("Quando fui ao médico?")).toBeTruthy());
    expect(screen.getByTestId("dock").querySelector("[data-chat-draft]")).toBeNull();

    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.send({ type: "delta", text: "No dentista." });
    });
    await waitFor(() => expect(window.location.pathname).toBe(`/pt-BR/app/chat/${conversationId}`));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    await act(async () => {
      stream.send({ type: "done", conversationId, href: `/pt-BR/app/chat/${conversationId}` });
      stream.end();
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/pt-BR/app/chat/${conversationId}`, { scroll: false }));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("leaves the address alone for a question asked inside an existing conversation", async () => {
    window.history.replaceState(null, "", `/pt-BR/app/chat/${conversationId}`);
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <ChatStreamProvider conversationId={conversationId} locale="pt-BR">
        <ChatDraftSlot agentName="Brain" locale="pt-BR" />
        <ChatComposer
          action={vi.fn(async () => idleAssistantComposerState)}
          agentName="Brain"
          conversationId={conversationId}
          locale="pt-BR"
          memoryAction={memoryAction()}
          memoryUndoAction={memoryAction()}
        />
      </ChatStreamProvider>,
    );
    await userEvent.type(screen.getByRole("textbox"), "E o retorno?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.send({ type: "done", conversationId, href: `/pt-BR/app/chat/${conversationId}` });
      stream.end();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(replaceState).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });
});

describe("a turn's outcome is read in the thread, not under the field (Editorial calmo)", () => {
  const remembered: AssistantComposerState = {
    ...idleAssistantComposerState,
    route: "memory_intent",
    notice: { heading: "Isso parece algo para guardar como memória", detail: "Ainda não salvei nada.", nextStep: null },
    echo: "Lembre que prefiro reuniões pela manhã",
    announcement: "Isso parece algo para guardar como memória.",
  };

  it("draws a turn that was not a streamed answer where the thread mounts it, and focuses it", async () => {
    const action = vi.fn(async (): Promise<AssistantComposerState> => remembered);
    render(
      <ChatStreamProvider locale="pt-BR">
        <div data-testid="thread"><ChatDraftSlot agentName="Brain" locale="pt-BR" /></div>
        <div data-testid="dock">
          <ChatComposer action={action} agentName="Brain" locale="pt-BR" memoryAction={memoryAction()} memoryUndoAction={memoryAction()} />
        </div>
      </ChatStreamProvider>,
    );
    // Between turns the thread's element is there and empty.
    expect(screen.getByTestId("thread").querySelector("[data-chat-outcome]")?.childElementCount).toBe(0);

    await userEvent.type(screen.getByRole("textbox"), "Lembre que prefiro reuniões pela manhã");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();

    const outcome = await within(screen.getByTestId("thread")).findByRole("region", { name: "Resposta do Brain" });
    expect(within(outcome).getByText("Isso parece algo para guardar como memória")).toBeTruthy();
    expect(within(outcome).getByText("Lembre que prefiro reuniões pela manhã")).toBeTruthy();
    expect(screen.getByTestId("dock").querySelector(".assistant-composer-notice")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(outcome));
    // The field stays where it is: one field, in the dock.
    expect(within(screen.getByTestId("dock")).getAllByRole("textbox")).toHaveLength(1);
  });

  it("keeps the outcome under the field where no thread has mounted a place for it", async () => {
    const action = vi.fn(async (): Promise<AssistantComposerState> => remembered);
    render(
      <div data-testid="dock">
        <ChatComposer action={action} agentName="Brain" locale="pt-BR" memoryAction={memoryAction()} memoryUndoAction={memoryAction()} />
      </div>,
    );
    await userEvent.type(screen.getByRole("textbox"), "Lembre que prefiro reuniões pela manhã");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await within(screen.getByTestId("dock")).findByRole("region", { name: "Resposta do Brain" })).toBeTruthy();
  });

  it("sets a streamed answer as prose: paragraphs and a list, never markup", async () => {
    const stream = controlledStream();
    fetchMock.mockResolvedValue(stream.response);
    render(
      <ChatStreamProvider conversationId={conversationId} locale="pt-BR">
        <div data-testid="thread"><ChatDraftSlot agentName="Brain" locale="pt-BR" /></div>
        <ChatComposer
          action={vi.fn(async () => idleAssistantComposerState)}
          agentName="Brain"
          conversationId={conversationId}
          locale="pt-BR"
          memoryAction={memoryAction()}
          memoryUndoAction={memoryAction()}
        />
      </ChatStreamProvider>,
    );
    await userEvent.type(screen.getByRole("textbox"), "O que falta?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await act(async () => {
      stream.send({ type: "conversation", conversationId });
      stream.send({ type: "delta", text: "Faltam duas coisas:\n\n1. Revisar\n2. <b>Enviar</b>" });
    });
    const answer = await waitFor(() => {
      const found = screen.getByTestId("thread").querySelector('[data-draft-role="assistant"] .chat-message-body');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(answer.querySelector("p")?.textContent).toBe("Faltam duas coisas:");
    expect([...answer.querySelectorAll("ol > li")].map((item) => item.textContent)).toEqual(["Revisar", "<b>Enviar</b>"]);
    expect(answer.querySelector("b")).toBeNull();
    await act(async () => {
      stream.send({ type: "done", conversationId, href: `/pt-BR/app/chat/${conversationId}` });
      stream.end();
    });
  });
});

const groups: readonly ConversationGroup[] = [
  { key: "today", label: "Hoje", items: [{ id: conversationId, title: "Quando fui ao médico?" }, { id: "a", title: "O que tenho essa semana?" }] },
  { key: "week", label: "Últimos 7 dias", items: [{ id: "b", title: "Viagem a Lisboa" }] },
];

function renderFrame(activeId: string | null = conversationId, limited: number | null = null) {
  return render(
    <ChatFrame activeId={activeId} groups={groups} limited={limited} locale="pt-BR" title="Quando fui ao médico?">
      <p>thread</p>
    </ChatFrame>,
  );
}

describe("the other conversations are behind the menu", () => {
  it("on a phone, starts closed, opens from ☰, searches, and closes with Escape back to the button", async () => {
    setWidth(true);
    renderFrame();
    const toggle = screen.getByRole("button", { name: "Mostrar conversas" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Conversas" })).toBeNull();

    await userEvent.click(toggle);
    const menu = screen.getByRole("navigation", { name: "Conversas" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getByRole("link", { name: "Quando fui ao médico?" }).getAttribute("aria-current")).toBe("page");
    expect(within(menu).getByRole("link", { name: "Nova conversa" }).getAttribute("href")).toBe("/pt-BR/app/chat");
    // Focus goes to the search, which filters titles without accents.
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getByRole("searchbox")));
    await userEvent.type(within(menu).getByRole("searchbox"), "lisboa");
    expect(within(menu).queryByText("O que tenho essa semana?")).toBeNull();
    expect(within(menu).getByText("Viagem a Lisboa")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Conversas" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("on a phone, choosing a conversation closes the menu", async () => {
    setWidth(true);
    renderFrame();
    await userEvent.click(screen.getByRole("button", { name: "Mostrar conversas" }));
    await userEvent.click(screen.getByRole("link", { name: "Viagem a Lisboa" }));
    expect(screen.queryByRole("navigation", { name: "Conversas" })).toBeNull();
  });

  it("on a wide screen, starts open beside the conversation, and closing it holds for the session", async () => {
    setWidth(false);
    const { unmount } = renderFrame(null);
    expect(screen.getByRole("navigation", { name: "Conversas" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Fechar conversas", expanded: true }));
    expect(screen.queryByRole("navigation", { name: "Conversas" })).toBeNull();
    unmount();
    renderFrame(null);
    expect(screen.queryByRole("navigation", { name: "Conversas" })).toBeNull();
  });

  it("never asks the server while the menu holds every conversation", async () => {
    setWidth(true);
    renderFrame();
    await userEvent.click(screen.getByRole("button", { name: "Mostrar conversas" }));
    await userEvent.type(screen.getByRole("searchbox"), "dentista");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchConversations).not.toHaveBeenCalled();
    expect(screen.getByText("Nenhuma conversa com esse texto.")).toBeTruthy();
  });

  it("past the limit, searches the server and lists what lies beyond under Mais antigas (ADR-177)", async () => {
    setWidth(true);
    searchConversations.mockResolvedValue([
      { id: "b", title: "Viagem a Lisboa" },
      { id: "old-1", title: "Lisboa em 2024" },
    ]);
    renderFrame(conversationId, 100);
    await userEvent.click(screen.getByRole("button", { name: "Mostrar conversas" }));
    await userEvent.type(screen.getByRole("searchbox"), "lisboa");
    const older = await screen.findByRole("region", { name: "Mais antigas" });
    expect(searchConversations).toHaveBeenLastCalledWith("pt-BR", "lisboa");
    // Only what the menu did not already hold; the loaded match stays in its own group.
    expect(within(older).getAllByRole("link").map((link) => link.textContent)).toEqual(["Lisboa em 2024"]);
    expect(within(older).getByRole("link").getAttribute("href")).toBe("/pt-BR/app/chat/old-1");
    expect(screen.getByRole("region", { name: "Últimos 7 dias" })).toBeTruthy();
  });

  it("draws each conversation as one row: the link is its title, with one caption saying when", async () => {
    setWidth(true);
    render(
      <ChatFrame
        activeId={null}
        groups={[{ key: "today", label: "Hoje", items: [
          { id: "a", title: "O que tenho essa semana?", when: { at: "2026-11-16T12:05:00Z", label: "09:05" } },
          { id: "b", title: "Sem data" },
        ] }]}
        limited={null}
        locale="pt-BR"
        title="Brain"
      >
        <p>thread</p>
      </ChatFrame>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Mostrar conversas" }));
    const rows = within(screen.getByRole("region", { name: "Hoje" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // The caption is in the row and outside the link's name.
    expect(within(rows[0]!).getByRole("link", { name: "O que tenho essa semana?" }).getAttribute("href")).toBe("/pt-BR/app/chat/a");
    const stamp = rows[0]!.querySelector("time");
    expect(stamp?.textContent).toBe("09:05");
    expect(stamp?.getAttribute("datetime")).toBe("2026-11-16T12:05:00Z");
    // A row with no readable time claims none.
    expect(rows[1]!.querySelector("time")).toBeNull();
  });

  it("names the screen with its title and offers a new conversation", () => {
    setWidth(true);
    renderFrame();
    expect(screen.getByRole("heading", { level: 1, name: "Quando fui ao médico?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nova conversa" }).getAttribute("href")).toBe("/pt-BR/app/chat");
  });
});
