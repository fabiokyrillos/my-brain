import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { sendChatMessage } from "./actions";

// The chat slice had no tests at all before the pre-2E hardening pass — not for
// its grounding guarantee, not for its error paths. These cover the two things
// that pass changed: every action result is now localized (they used to be
// Portuguese-only, reaching English users verbatim), and citation hydration no
// longer depends on a non-null assertion coupled to provider stripping
// behaviour across the AIProvider portability seam.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai", () => ({ getAIProvider: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: vi.fn(async () => undefined) }));

const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";

const idleState = { status: "idle" as const, message: "" };

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  data.set("locale", "pt-BR");
  data.set("question", "O que ficou pendente com a Ana?");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

type ChatStub = {
  citedSourceIds: string[];
  matches?: { source_type: "entry" | "memory"; source_id: string; content: string; similarity: number; occurred_at: string }[];
};

let insertedAssistantMessage: Record<string, unknown> | null = null;

function stubSupabase(options: { user: { id: string } | null } & ChatStub) {
  insertedAssistantMessage = null;

  const from = vi.fn((table: string) => {
    if (table === "conversations") {
      return {
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: conversationId }, error: null }) }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      };
    }
    if (table === "conversation_messages") {
      return {
        insert: async (payload: Record<string, unknown>) => {
          if (payload.role === "assistant") insertedAssistantMessage = payload;
          return { data: null, error: null };
        },
      };
    }
    if (table === "agent_preferences" || table === "profiles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    }
    if (table === "audit_logs") {
      return { insert: async () => ({ data: null, error: null }) };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    auth: { getUser: async () => ({ data: { user: options.user }, error: null }) },
    from,
    rpc: vi.fn(async () => ({ data: options.matches ?? [], error: null })),
  };
}

function stubProvider(citedSourceIds: string[]) {
  return {
    id: "openai",
    embedText: async () => ({ embedding: [0.1], model: "text-embedding-3-small", inputTokens: 1, outputTokens: 0 }),
    answerFromKnowledge: async () => ({
      answer: "Resposta fundamentada.",
      citedSourceIds,
      model: "gpt-5.6-terra",
      inputTokens: 10,
      outputTokens: 5,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedAssistantMessage = null;
});

describe("sendChatMessage localized failures", () => {
  it("rejects an empty question in Portuguese", async () => {
    const result = await sendChatMessage(idleState, form({ question: "   " }));
    expect(result).toEqual({ status: "error", message: "Escreva uma pergunta válida." });
  });

  it("rejects an empty question in English", async () => {
    const result = await sendChatMessage(idleState, form({ question: "   ", locale: "en" }));
    expect(result).toEqual({ status: "error", message: "Write a valid question." });
  });

  it("localizes the validation failure even when the locale field itself is invalid", async () => {
    const result = await sendChatMessage(idleState, form({ question: "   ", locale: "en-GB" }));
    // An unrecognized locale falls back to the default, never to a mixed-locale
    // response.
    expect(result).toEqual({ status: "error", message: "Escreva uma pergunta válida." });
  });

  it("reports an expired session in the caller's locale", async () => {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ user: null, citedSourceIds: [] }) as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    await expect(sendChatMessage(idleState, form({ locale: "en" }))).resolves.toEqual({
      status: "error",
      message: "Your session expired.",
    });
    await expect(sendChatMessage(idleState, form())).resolves.toEqual({
      status: "error",
      message: "Sua sessão expirou.",
    });
  });
});

describe("sendChatMessage citation hydration", () => {
  const matches = [
    {
      source_type: "entry" as const,
      source_id: "33333333-3333-4333-8333-333333333333",
      content: "Conteúdo da entrada sobre a Ana.",
      similarity: 0.8,
      occurred_at: "2026-07-20T10:00:00Z",
    },
  ];

  async function run(citedSourceIds: string[]) {
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ user: { id: userId }, citedSourceIds, matches }) as unknown as Awaited<
        ReturnType<typeof createClient>
      >,
    );
    vi.mocked(getAIProvider).mockReturnValue(
      stubProvider(citedSourceIds) as unknown as ReturnType<typeof getAIProvider>,
    );

    // The action ends in redirect(), which the mock turns into a throw.
    await expect(sendChatMessage(idleState, form())).rejects.toThrow("NEXT_REDIRECT");
    return insertedAssistantMessage;
  }

  it("hydrates a cited source that is present", async () => {
    const message = await run(["entry:33333333-3333-4333-8333-333333333333"]);

    expect(message?.citations).toEqual([
      {
        id: "entry:33333333-3333-4333-8333-333333333333",
        type: "entry",
        sourceId: "33333333-3333-4333-8333-333333333333",
        excerpt: "Conteúdo da entrada sobre a Ana.",
      },
    ]);
  });

  it("drops a cited id with no matching source instead of throwing", async () => {
    // This is the regression the non-null assertion could not survive: if the
    // provider's deterministic stripping ever weakens, the action used to throw
    // a TypeError mid-conversation.
    const message = await run([
      "entry:33333333-3333-4333-8333-333333333333",
      "memory:99999999-9999-4999-8999-999999999999",
    ]);

    expect(message?.citations).toEqual([
      {
        id: "entry:33333333-3333-4333-8333-333333333333",
        type: "entry",
        sourceId: "33333333-3333-4333-8333-333333333333",
        excerpt: "Conteúdo da entrada sobre a Ana.",
      },
    ]);
  });

  it("drops a malformed cited id that carries no source id", async () => {
    const message = await run(["entry:33333333-3333-4333-8333-333333333333", "entry"]);

    expect(message?.citations).toHaveLength(1);
  });

  it("records the answer with no citations when every cited id is fabricated", async () => {
    const message = await run(["memory:99999999-9999-4999-8999-999999999999"]);

    expect(message?.citations).toEqual([]);
    expect(message?.content).toBe("Resposta fundamentada.");
  });
});
