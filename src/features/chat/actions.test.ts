import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import { sendChatMessage } from "./actions";

// The chat slice had no tests at all before the pre-2E hardening pass — not for
// its grounding guarantee, not for its error paths. These cover the two things
// that pass changed: every action result is now localized (they used to be
// Portuguese-only, reaching English users verbatim), and citation hydration no
// longer depends on a non-null assertion coupled to provider stripping
// behaviour across the AIProvider portability seam.

// `agent-identity` begins `import "server-only"`, which throws in this jsdom
// environment. The name it resolves is not what these cases are about.

// The BYOK gate is mocked open here: these suites exercise their own feature's
// logic, not credential resolution. The gate's real behaviour -- including that
// a closed gate makes NO provider call (matrix case 12) -- is exercised against
// the real module in src/lib/byok/gate.test.ts.
vi.mock("@/lib/byok/gate", () => ({
  openAiGate: vi.fn(async () => ({
    ok: true,
    credential: { outcome: "resolved", secret: { expose: () => "sk-test" }, provider: "openai", keyVersion: 1 },
  })),
  gateMessageKey: (reason: string) => (reason === "credential_required" ? "credentialRequired" : "credentialUnreadable"),
}));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: vi.fn(async () => "Brain") }));
// 2H-RATE-001. Admitted by default, so the cases below keep testing grounding
// and localization rather than the ceiling; the refusal case flips it.
vi.mock("@/features/rate-limits/server", () => ({
  admitRateLimitedOperation: vi.fn(async () => ({ ok: true })),
}));
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
  /** The validity windows `memoriesInForce` will read back for the matched ids. */
  memoryRows?: { id: string; valid_from: string | null; valid_until: string | null }[];
  memoryLookupFails?: boolean;
};

let insertedAssistantMessage: Record<string, unknown> | null = null;

function stubSupabase(options: { user: { id: string } | null } & ChatStub) {
  insertedAssistantMessage = null;

  const from = vi.fn((table: string) => {
    if (table === "account_lifecycle") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "active" }, error: null }) }) }),
      };
    }
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
    if (table === "memories") {
      return {
        select: () => ({
          in: async () =>
            options.memoryLookupFails
              ? { data: null, error: { message: "lookup failed" } }
              : { data: options.memoryRows ?? [], error: null },
        }),
      };
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

describe("2H-RATE-001: the AI ceiling refuses before any provider call", () => {
  it("reports the refusal in the caller's locale and reaches no network", async () => {
    // The property that matters is not the sentence, it is the ordering: the
    // admission sits after the BYOK gate and before `getAIProvider`, so a
    // refused turn costs the user's key nothing.
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ user: { id: userId }, citedSourceIds: [] }) as unknown as Awaited<
        ReturnType<typeof createClient>
      >,
    );
    vi.mocked(admitRateLimitedOperation).mockResolvedValueOnce({
      ok: false,
      refusal: "RATE_LIMIT_AI",
      message: "Ritmo de uso da IA atingido. …",
    });

    const result = await sendChatMessage(idleState, form());

    expect(result.status).toBe("error");
    expect(result.message).toContain("Ritmo de uso da IA atingido");
    expect(getAIProvider).not.toHaveBeenCalled();
  });
});

describe("sendChatMessage memory lifecycle filtering", () => {
  const memoryId = "44444444-4444-4444-8444-444444444444";
  const entryIdMatch = "33333333-3333-4333-8333-333333333333";
  const matches = [
    {
      source_type: "memory" as const,
      source_id: memoryId,
      content: "Prefiro reuniões pela manhã.",
      similarity: 0.9,
      occurred_at: "2026-07-20T10:00:00Z",
    },
    {
      source_type: "entry" as const,
      source_id: entryIdMatch,
      content: "Conteúdo da entrada sobre a Ana.",
      similarity: 0.8,
      occurred_at: "2026-07-20T10:00:00Z",
    },
  ];

  async function run(stub: Partial<ChatStub>) {
    const citedSourceIds = [`memory:${memoryId}`, `entry:${entryIdMatch}`];
    vi.mocked(createClient).mockResolvedValue(
      stubSupabase({ user: { id: userId }, citedSourceIds, matches, ...stub }) as unknown as Awaited<
        ReturnType<typeof createClient>
      >,
    );
    vi.mocked(getAIProvider).mockReturnValue(
      stubProvider(citedSourceIds) as unknown as ReturnType<typeof getAIProvider>,
    );
    await expect(sendChatMessage(idleState, form())).rejects.toThrow("NEXT_REDIRECT");
    return insertedAssistantMessage;
  }

  /**
   * Reads the envelope slice 2K.4 introduced.
   *
   * `citations` stopped being an array of `{…, excerpt}` and became a versioned
   * object carrying references, the reach, and what **retrieval** found —
   * because an empty array could not distinguish "nothing was retrieved" from
   * "sources were retrieved and the model cited none" (measured in 2K.0).
   */
  function citedTypes(message: Record<string, unknown> | null): string[] {
    const envelope = message?.citations as { sources?: { type: string }[] } | undefined;
    return envelope?.sources?.map((item) => item.type) ?? [];
  }

  it("keeps a memory that is still in force", async () => {
    const message = await run({
      memoryRows: [{ id: memoryId, valid_from: null, valid_until: null }],
    });

    expect(citedTypes(message)).toEqual(["memory", "entry"]);
  });

  // This is the assertion that makes "Archive" mean something. Without the
  // filter the RPC returns the row on `embedding is not null` alone, and the
  // assistant would keep quoting a fact the owner explicitly retired.
  it("excludes a memory the owner archived", async () => {
    const message = await run({
      memoryRows: [{ id: memoryId, valid_from: null, valid_until: "2026-01-01T00:00:00Z" }],
    });

    expect(citedTypes(message)).toEqual(["entry"]);
  });

  it("excludes a memory whose validity has not started yet", async () => {
    const message = await run({
      memoryRows: [{ id: memoryId, valid_from: "2099-01-01T00:00:00Z", valid_until: null }],
    });

    expect(citedTypes(message)).toEqual(["entry"]);
  });

  // Failing closed: citing a fact that may have been retracted is the worse
  // error, and an entry match is unaffected because entries have no window.
  it("excludes memories when the validity lookup fails, and keeps entries", async () => {
    const message = await run({ memoryLookupFails: true });

    expect(citedTypes(message)).toEqual(["entry"]);
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

    expect(message?.citations).toEqual({
      v: "2026-08-09.1",
      evidence: "evidenced",
      reach: ["entry", "memory"],
      sources: [
        {
          id: "entry:33333333-3333-4333-8333-333333333333",
          type: "entry",
          sourceId: "33333333-3333-4333-8333-333333333333",
          support: "direct_record",
        },
      ],
    });
    // `2K-PRIVACY-003`: no copy of the content is persisted any more.
    expect(JSON.stringify(message?.citations)).not.toContain("Conteúdo da entrada");
  });

  it("drops a cited id with no matching source instead of throwing", async () => {
    // This is the regression the non-null assertion could not survive: if the
    // provider's deterministic stripping ever weakens, the action used to throw
    // a TypeError mid-conversation.
    const message = await run([
      "entry:33333333-3333-4333-8333-333333333333",
      "memory:99999999-9999-4999-8999-999999999999",
    ]);

    expect(message?.citations).toEqual({
      v: "2026-08-09.1",
      evidence: "evidenced",
      reach: ["entry", "memory"],
      sources: [
        {
          id: "entry:33333333-3333-4333-8333-333333333333",
          type: "entry",
          sourceId: "33333333-3333-4333-8333-333333333333",
          support: "direct_record",
        },
      ],
    });
    // `2K-PRIVACY-003`: no copy of the content is persisted any more.
    expect(JSON.stringify(message?.citations)).not.toContain("Conteúdo da entrada");
  });

  it("drops a malformed cited id that carries no source id", async () => {
    const message = await run(["entry:33333333-3333-4333-8333-333333333333", "entry"]);

    expect((message?.citations as { sources: unknown[] }).sources).toHaveLength(1);
  });

  it("records the answer with no citations when every cited id is fabricated", async () => {
    const message = await run(["memory:99999999-9999-4999-8999-999999999999"]);

    const envelope = message?.citations as { sources: unknown[]; evidence: string };
    expect(envelope.sources).toEqual([]);
    /*
     * `2K-SRC-005`, and the reason the envelope exists.
     *
     * Every cited id was fabricated, so no reference survives — but retrieval
     * DID find a qualifying source. Deriving insufficiency from the empty array
     * would report "I had nothing", which is the opposite of what happened.
     */
    expect(envelope.evidence).toBe("evidenced");
    expect(message?.content).toBe("Resposta fundamentada.");
  });
});
