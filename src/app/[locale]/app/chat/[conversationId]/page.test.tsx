/**
 * The thread's two sides (Editorial calmo; the owner's direction of
 * 18 November 2026): the question on the right, the answer on the left under
 * the Brain's name and mark, the sources it cites as cards in sight.
 *
 * Structure, not pixels — the geometry is measured in
 * `e2e/layout-contracts.spec.ts`.
 */

import { render, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { readOnlyPreviewCard } from "@/features/conversation-cards/contracts";
import { buildCitationsEnvelope, CHAT_REACH } from "@/features/conversation-sources/contracts";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/pt-BR/app/chat",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => { throw new Error("notFound"); },
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));

const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const MEMORY = "44444444-4444-4444-8444-444444444444";
const ENVELOPE = buildCitationsEnvelope({
  retrievedAnyQualifyingSource: true,
  reach: CHAT_REACH,
  sources: [{ id: "s1", type: "memory", sourceId: MEMORY, support: "product_state" }],
});
const MESSAGES = [
  { id: "m1", role: "user", content: "O que ficou pendente com a Ana?", citations: null, model: null, created_at: "2026-11-17T00:03:00.000Z" },
  { id: "m2", role: "assistant", content: "Com a Ana, há duas coisas em aberto.", citations: ENVELOPE, model: "gpt-5-mini", created_at: "2026-11-17T00:03:09.000Z" },
];

function query(data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "order", "limit", "or", "in"]) chain[name] = () => chain;
  chain.maybeSingle = async () => ({ data, error: null });
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return chain;
}
const supabase = {
  from: (table: string) => (table === "conversations" ? query({ id: CONVERSATION, title: "Ana" }) : query([...MESSAGES].reverse())),
};

vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn(async () => ({ supabase, user: { id: "u1" } })) }));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: vi.fn(async () => "Brain") }));
vi.mock("@/features/profile/owner-timezone", () => ({ getOwnerTimeZone: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("@/features/chat/conversation-menu", () => ({ loadConversationMenu: vi.fn(async () => ({ limited: null, groups: [] })) }));
vi.mock("@/features/chat/conversation-search", () => ({ searchConversations: vi.fn(async () => []) }));
vi.mock("@/features/conversation-cards/resume", () => ({ resumeConversationCard: vi.fn(async () => null) }));
vi.mock("@/features/conversation-sources/resolve-sources", () => ({
  resolveSources: vi.fn(async (_client: unknown, _user: unknown, citations: { sources: unknown[] }) => citations.sources.length === 0 ? [] : [{
    key: "s1",
    support: "product_state",
    card: readOnlyPreviewCard({ cardType: "memory", objectId: MEMORY, snippet: "A Ana faz aniversário em 5 de maio.", sensitivity: "normal", href: `/pt-BR/app/memories/${MEMORY}` }),
    occurredAt: "2026-10-02T12:00:00.000Z",
  }]),
}));
vi.mock("@/features/product-analytics/interaction-events", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  ConversationAnswerShown: () => null,
  ConversationMemoryResolved: () => null,
}));
vi.mock("@/features/assistant/actions", () => ({ runAssistantTurn: vi.fn() }));
vi.mock("@/features/capture/transcribe-action", () => ({ transcribeRecording: vi.fn() }));
vi.mock("@/features/memories/actions", () => ({ createProposedMemory: vi.fn(), undoProposedMemory: vi.fn() }));

import ConversationPage from "./page";

beforeAll(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
  vi.stubGlobal("MediaRecorder", class {});
});

async function thread() {
  const page = await ConversationPage({
    params: Promise.resolve({ locale: "pt-BR", conversationId: CONVERSATION }),
    searchParams: Promise.resolve({}),
  });
  return render(page);
}

describe("the thread's two sides", () => {
  it("draws the question as the owner's turn: unnamed on screen, its hour after it", async () => {
    const { container } = await thread();
    const question = container.querySelector<HTMLElement>('.chat-message[data-role="user"]')!;
    const children = [...question.children].map((node) => node.className);
    // Who, what was said, then when — the order assistive technology reads.
    expect(children).toEqual(["chat-message-meta", "chat-message-body", "chat-message-when"]);
    expect(question.querySelector(".chat-message-speaker")?.textContent).toBe("Você");
    expect(question.querySelector(".chat-message-when time")).toHaveAttribute("datetime", "2026-11-17T00:03:00.000Z");
    expect(question.querySelector(".brand-mark")).toBeNull();
    expect(question.querySelector(".message-sources")).toBeNull();
  });

  it("draws the answer as the Brain's turn: its name beside the product's mark, prose, then its sources as cards", async () => {
    const { container } = await thread();
    const answer = container.querySelector<HTMLElement>('.chat-message[data-role="assistant"]')!;
    const speaker = answer.querySelector(".chat-message-meta .chat-message-speaker")!;
    expect(speaker.textContent).toBe("BBrain");
    expect(speaker.querySelector(".brand-mark")).toHaveAttribute("aria-hidden", "true");
    expect(answer.querySelector(".chat-message-when")).toBeNull();
    // The answer's instant stays in the document.
    expect(answer.querySelector(".chat-message-meta time")).toHaveAttribute("datetime", "2026-11-17T00:03:09.000Z");
    const card = within(answer).getByRole("link", { name: /A Ana faz aniversário/ });
    expect(card).toHaveClass("conversation-source-card");
    expect(card.getAttribute("href")).toMatch(new RegExp(`^/pt-BR/app/memories/${MEMORY}\\?from=`));
    expect(card.closest("details")).toBeNull();
    // Where it looked stays a closed line, with the model inside it.
    const where = answer.querySelector("details.conversation-sources-where")!;
    expect(where).not.toHaveAttribute("open");
    expect(where.querySelector(".chat-message-model")?.textContent).toContain("gpt-5-mini");
  });

  it("marks the stage as a thread, so a short conversation starts at the top", async () => {
    const { container } = await thread();
    expect(container.querySelector(".chat-stage")).toHaveAttribute("data-thread", "");
  });
});
