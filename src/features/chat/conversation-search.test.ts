import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; args: unknown[] }[] = [];
const rows = [{ id: "c1", title: "100% férias_2024" }];

function builder() {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["from", "select", "ilike", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve({ data: rows, error: null });
  };
  return chain;
}

const requireUser = vi.fn<(locale: string) => Promise<{ supabase: ReturnType<typeof builder>; user: { id: string } }>>(
  async () => ({ supabase: builder(), user: { id: "u1" } }),
);
vi.mock("@/lib/auth/require-user", () => ({ requireUser: (locale: string) => requireUser(locale) }));

import { searchConversations } from "./conversation-search";

beforeEach(() => {
  calls.length = 0;
  requireUser.mockClear();
});

describe("searchConversations (ADR-177)", () => {
  it("reads titles containing the text, newest first, bounded", async () => {
    await expect(searchConversations("pt-BR", "  férias ")).resolves.toEqual([{ id: "c1", title: "100% férias_2024" }]);
    expect(requireUser).toHaveBeenCalledWith("pt-BR");
    expect(calls).toEqual([
      { method: "from", args: ["conversations"] },
      { method: "select", args: ["id,title"] },
      { method: "ilike", args: ["title", "%férias%"] },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "limit", args: [30] },
    ]);
  });

  it("treats % and _ as literal characters, never wildcards", async () => {
    await searchConversations("en", "100%_x\\");
    expect(calls.find((call) => call.method === "ilike")?.args).toEqual(["title", "%100\\%\\_x\\\\%"]);
  });

  it("refuses a short text or an unknown locale without reading anything", async () => {
    await expect(searchConversations("pt-BR", " a ")).resolves.toEqual([]);
    await expect(searchConversations("fr", "lisboa")).resolves.toEqual([]);
    await expect(searchConversations("pt-BR", "x".repeat(101))).resolves.toEqual([]);
    expect(requireUser).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
