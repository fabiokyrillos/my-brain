/**
 * Life Brain E.5 part 2 (ADR-175) — the streaming chat route, against the real
 * shared pipeline (`chat-turn.ts`) with only the edges stubbed.
 *
 * The properties: it refuses a cross-site or unauthenticated request before
 * anything is written; it streams only the answer's text; it records the
 * `chat` usage before the answer is persisted; it persists the VALIDATED
 * answer with foreign citation ids stripped; and a stream that aborts or fails
 * persists nothing after the question.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { BilledAnswerStreamFailure } from "@/lib/ai/answer-stream";
import { recordAIUsage } from "@/lib/ai/usage";
import { recordErrorEvent } from "@/lib/observability/error-sink";

import { buildFailedTurnEnvelope } from "./failed-turn";
import { handleChatStreamRequest } from "./stream-route";
import { chatStreamEventSchema, type ChatStreamEvent } from "./stream-protocol";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/byok/gate", () => ({
  openAiGate: vi.fn(async () => ({
    ok: true,
    credential: { outcome: "resolved", secret: { expose: () => "sk-test" }, provider: "openai", keyVersion: 1 },
  })),
  gateMessageKey: () => "credentialRequired",
}));
vi.mock("@/features/rate-limits/server", () => ({ admitRateLimitedOperation: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/auth/require-user", () => ({ assertActiveAccount: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
const afterTasks: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: vi.fn((task: Promise<unknown>) => afterTasks.push(task)) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/observability/error-sink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/observability/error-sink")>()),
  recordErrorEvent: vi.fn(async () => ({ correlationId: "33333333-3333-4333-8333-333333333333" })),
}));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn() }));

const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const entryId = "44444444-4444-4444-8444-444444444444";

/** Every write and ledger call, in the order it happened. */
let log: string[] = [];
let assistantInsert: Record<string, unknown> | null = null;
/** The earlier turns the history read returns, newest first, as the query orders them. */
let earlier: { role: string; content: string; citations?: unknown }[] = [];

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "or", "order", "limit", "is", "not", "gte", "lte", "lt", "gt"]) builder[method] = () => builder;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

function stubSupabase(user: { id: string } | null) {
  const from = vi.fn((table: string) => {
    if (table === "conversations") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: conversationId }, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: conversationId }, error: null }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      };
    }
    if (table === "conversation_messages") {
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: earlier, error: null }) }) }) }),
        insert: async (payload: Record<string, unknown>) => {
          log.push(`insert:${String(payload.role)}`);
          if (payload.role === "assistant") assistantInsert = payload;
          return { data: null, error: null };
        },
      };
    }
    if (table === "audit_logs") {
      return {
        insert: async () => {
          log.push("audit");
          return { data: null, error: null };
        },
      };
    }
    if (table === "entries") {
      return chain({ data: [{ id: entryId, sensitivity: "normal", current_interpretation_id: "i-1" }], error: null });
    }
    if (table === "agent_preferences" || table === "profiles") return chain({ data: null, error: null });
    return chain({ data: [], error: null });
  });
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from,
    rpc: vi.fn(async () => ({
      data: [{ source_type: "entry", source_id: entryId, content: "Ana pediu o contrato.", similarity: 0.9, occurred_at: "2026-11-01T10:00:00Z" }],
      error: null,
    })),
  };
}

const usage = { providerRequestId: "resp_1", transportRequestId: null, inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, reasoningTokens: 0 };

type StreamImpl = (input: unknown, options: { onAnswerDelta: (text: string) => void; signal?: AbortSignal }) => Promise<unknown>;

function stubProvider(stream: StreamImpl) {
  vi.mocked(getAIProvider).mockReturnValue({
    id: "openai",
    embedText: async () => ({ embedding: [0.1], model: "text-embedding-3-small", ...usage }),
    answerFromKnowledge: vi.fn(),
    streamAnswerFromKnowledge: vi.fn(stream),
  } as unknown as ReturnType<typeof getAIProvider>);
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://brain.example/pt-BR/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://brain.example", host: "brain.example", ...headers },
    body: JSON.stringify(body),
  });
}

const question = { question: "O que a Ana pediu?", locale: "pt-BR" };

async function events(response: Response): Promise<ChatStreamEvent[]> {
  const text = await response.text();
  return text.split("\n").filter(Boolean).map((line) => chatStreamEventSchema.parse(JSON.parse(line)));
}

beforeEach(() => {
  vi.clearAllMocks();
  log = [];
  assistantInsert = null;
  earlier = [];
  afterTasks.length = 0;
  vi.mocked(recordAIUsage).mockImplementation(async (_client, event) => {
    log.push(`usage:${event.operation}`);
    return true;
  });
  vi.mocked(createClient).mockResolvedValue(stubSupabase({ id: userId }) as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("the route refuses before anything is written", () => {
  it("refuses a cross-site request without reading the session", async () => {
    const response = await handleChatStreamRequest(request(question, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses a request that is not JSON", async () => {
    const response = await handleChatStreamRequest(request(question, { "content-type": "application/x-www-form-urlencoded" }));
    expect(response.status).toBe(415);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("answers an expired session with 401 and the localized sentence, and calls no provider", async () => {
    vi.mocked(createClient).mockResolvedValue(stubSupabase(null) as unknown as Awaited<ReturnType<typeof createClient>>);
    const response = await handleChatStreamRequest(request({ ...question, locale: "en" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ type: "error", message: "Your session expired." });
    expect(getAIProvider).not.toHaveBeenCalled();
    expect(log).toEqual([]);
  });

  it("answers an invalid question with 400", async () => {
    const response = await handleChatStreamRequest(request({ question: "  ", locale: "pt-BR" }));
    expect(response.status).toBe(400);
    expect(log).toEqual([]);
  });
});

describe("a streamed answer", () => {
  it("streams the text, records the bill before persisting, and persists the validated answer", async () => {
    stubProvider(async (_input, { onAnswerDelta }) => {
      onAnswerDelta("A Ana pediu ");
      onAnswerDelta("o contrato.");
      return { ...usage, model: "gpt-5.6-terra", output: { answer: "A Ana pediu o contrato.", citedSourceIds: [`entry:${entryId}`, "entry:fabricated"] } };
    });

    const response = await handleChatStreamRequest(request(question));
    expect(response.headers.get("content-type")).toMatch(/application\/x-ndjson/);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    const received = await events(response);

    expect(received[0]).toEqual({ type: "conversation", conversationId });
    expect(received.filter((event) => event.type === "delta").map((event) => (event as { text: string }).text).join("")).toBe("A Ana pediu o contrato.");
    expect(received.at(-1)).toEqual({ type: "done", conversationId, href: `/pt-BR/app/chat/${conversationId}` });

    expect(log).toEqual(["insert:user", "usage:semantic_search", "usage:chat", "insert:assistant", "audit"]);
    expect(assistantInsert).toMatchObject({ role: "assistant", content: "A Ana pediu o contrato.", model: "gpt-5.6-terra" });
    const citations = assistantInsert!.citations as { sources: { id: string }[] };
    expect(citations.sources.map((source) => source.id)).toEqual([`entry:${entryId}`]);
    expect(recordErrorEvent).not.toHaveBeenCalled();
  });

  it("writes only the failure mark after the question when the provider stream aborts mid-answer (ADR-183)", async () => {
    stubProvider(async (_input, { onAnswerDelta }) => {
      onAnswerDelta("A Ana ped");
      throw Object.assign(new Error("Request was aborted."), { name: "AbortError" });
    });

    const received = await events(await handleChatStreamRequest(request(question)));

    expect(received.at(-1)).toMatchObject({ type: "error", conversationId });
    expect(log).toEqual(["insert:user", "usage:semantic_search", "insert:assistant"]);
    expect(assistantInsert).toMatchObject({ role: "assistant", model: null, citations: { turn: "failed", reference: "33333333-3333-4333-8333-333333333333" } });
    expect(String(assistantInsert!.content)).not.toContain("A Ana ped");
    expect(recordErrorEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ surface: "route_handler", operation: "chat_answer" }));
  });

  it("records the bill of a failed provider response that reports one, before failing the turn", async () => {
    stubProvider(async (_input, { onAnswerDelta }) => {
      onAnswerDelta("A Ana ped");
      throw new BilledAnswerStreamFailure({ ...usage, model: "gpt-5.6-terra" });
    });

    const received = await events(await handleChatStreamRequest(request(question)));

    expect(received.at(-1)).toMatchObject({ type: "error", conversationId });
    expect(log).toEqual(["insert:user", "usage:semantic_search", "usage:chat", "insert:assistant"]);
    expect(vi.mocked(recordAIUsage).mock.calls.at(-1)?.[1]).toMatchObject({
      operation: "chat",
      model: "gpt-5.6-terra",
      usage: { outputTokens: usage.outputTokens },
      sourceType: "conversation",
      sourceId: conversationId,
    });
    expect(assistantInsert).toMatchObject({ citations: { turn: "failed" } });
  });

  it("records the bill and writes only the failure mark when the complete output fails validation", async () => {
    stubProvider(async (_input, { onAnswerDelta }) => {
      onAnswerDelta("Começo");
      return { ...usage, model: "gpt-5.6-terra", output: null };
    });

    const received = await events(await handleChatStreamRequest(request(question)));

    expect(received.at(-1)).toMatchObject({ type: "error" });
    expect(log).toEqual(["insert:user", "usage:semantic_search", "usage:chat", "insert:assistant"]);
    expect(assistantInsert).toMatchObject({ citations: { turn: "failed" } });
    expect(String(assistantInsert!.content)).not.toContain("Começo");
  });

  it("keeps a failure mark out of the history the model reads (ADR-183)", async () => {
    earlier = [
      { role: "assistant", content: "Não foi possível responder agora.", citations: buildFailedTurnEnvelope({ failure: "provider", reference: null }) },
      { role: "user", content: "O que a Ana pediu?" },
      { role: "assistant", content: "Ela pediu o contrato.", citations: { v: "2026-08-09.1", evidence: "evidenced", reach: ["entry"], sources: [] } },
      { role: "user", content: "Quem é a Ana?" },
    ];
    let seen: { history?: { role: string; content: string }[] } = {};
    stubProvider(async (input) => {
      seen = input as typeof seen;
      return { ...usage, model: "gpt-5.6-terra", output: { answer: "Sim.", citedSourceIds: [] } };
    });

    await events(await handleChatStreamRequest(request({ ...question, conversationId })));

    expect(seen.history).toEqual([
      { role: "user", content: "Quem é a Ana?" },
      { role: "assistant", content: "Ela pediu o contrato." },
      { role: "user", content: "O que a Ana pediu?" },
    ]);
  });

  it("keeps the turn running when the owner leaves, and persists only the complete answer", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubProvider(async (_input, { onAnswerDelta }) => {
      onAnswerDelta("A Ana ");
      await released;
      onAnswerDelta("pediu o contrato.");
      return { ...usage, model: "gpt-5.6-terra", output: { answer: "A Ana pediu o contrato.", citedSourceIds: [] } };
    });

    const response = await handleChatStreamRequest(request(question));
    const reader = response.body!.getReader();
    await reader.read();
    // The owner closes the tab: the response is cancelled mid-answer.
    await reader.cancel();
    release();
    await Promise.all(afterTasks);

    expect(assistantInsert).toMatchObject({ content: "A Ana pediu o contrato." });
    expect(log).toEqual(["insert:user", "usage:semantic_search", "usage:chat", "insert:assistant", "audit"]);
  });
});
