import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONVERSATION_SEARCH_LIMIT,
  CONVERSATION_SEARCH_SCAN_LIMIT,
  filterGroups,
  type ConversationGroup,
} from "./conversation-groups";

type Row = { id: string; title: string };

const calls: { method: string; args: unknown[] }[] = [];
let rows: Row[] = [];

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
  rows = [];
  requireUser.mockClear();
});

describe("searchConversations (ADR-177, ADR-179)", () => {
  it("finds a title whatever its accents: 'medico' finds 'Médico amanhã'", async () => {
    rows = [
      { id: "c1", title: "Médico amanhã" },
      { id: "c2", title: "Mercado" },
    ];
    await expect(searchConversations("pt-BR", "medico")).resolves.toEqual([{ id: "c1", title: "Médico amanhã" }]);
    expect(requireUser).toHaveBeenCalledWith("pt-BR");
  });

  it("finds it whatever the case of the text: 'MÉDICO' and '  Medico ' too", async () => {
    rows = [{ id: "c1", title: "Médico amanhã" }];
    await expect(searchConversations("pt-BR", "MÉDICO")).resolves.toEqual([{ id: "c1", title: "Médico amanhã" }]);
    await expect(searchConversations("en", "  Medico ")).resolves.toEqual([{ id: "c1", title: "Médico amanhã" }]);
    await expect(searchConversations("pt-BR", "amanha")).resolves.toEqual([{ id: "c1", title: "Médico amanhã" }]);
  });

  it("reads the owner's titles newest first, bounded by the scan ceiling, with no pattern in SQL", async () => {
    await searchConversations("pt-BR", "férias");
    expect(calls).toEqual([
      { method: "from", args: ["conversations"] },
      { method: "select", args: ["id,title"] },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "limit", args: [CONVERSATION_SEARCH_SCAN_LIMIT] },
    ]);
    expect(CONVERSATION_SEARCH_SCAN_LIMIT).toBe(1000);
  });

  it("keeps the database's order and returns at most the search limit", async () => {
    rows = Array.from({ length: 45 }, (_, index) => ({ id: `c${index}`, title: index % 3 === 0 ? `Consulta ${index}` : `Outra ${index}` }));
    const found = await searchConversations("pt-BR", "CONSULTA");
    const expected = rows.filter((row) => row.title.startsWith("Consulta"));
    expect(expected.length).toBe(15);
    expect(found).toEqual(expected);

    rows = Array.from({ length: 80 }, (_, index) => ({ id: `c${index}`, title: `Médico ${index}` }));
    const many = await searchConversations("pt-BR", "medico");
    expect(CONVERSATION_SEARCH_LIMIT).toBe(30);
    expect(many).toHaveLength(CONVERSATION_SEARCH_LIMIT);
    expect(many.map((item) => item.id)).toEqual(rows.slice(0, 30).map((row) => row.id));
  });

  it("treats % and _ as literal characters, never wildcards", async () => {
    rows = [
      { id: "c1", title: "100% férias_2024" },
      { id: "c2", title: "100 ferias 2024" },
    ];
    await expect(searchConversations("en", "100% ferias_")).resolves.toEqual([{ id: "c1", title: "100% férias_2024" }]);
  });

  it("refuses a short text, a long one or an unknown locale without reading anything", async () => {
    await expect(searchConversations("pt-BR", " a ")).resolves.toEqual([]);
    await expect(searchConversations("fr", "lisboa")).resolves.toEqual([]);
    await expect(searchConversations("pt-BR", "x".repeat(101))).resolves.toEqual([]);
    expect(requireUser).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe("the server search and the menu's filter are one rule", () => {
  const titles = [
    "Médico amanhã",
    "MEDICO",
    "Ação de graças",
    "acao",
    "Coração",
    "São Paulo",
    "sao paulo",
    "Über cool",
    "naïve plan",
    "Crème brûlée",
    "100% férias_2024",
    "Façade",
    "Ñandú",
    "é decomposed",
  ];
  const queries = ["medico", "MÉDICO", "acao", "AÇÃO", "sao", "über", "uber", "naive", "brulee", "férias_", "fac", "nandu", "é dec", "zz"];

  it("answers every text with exactly the titles the local filter keeps", async () => {
    rows = titles.map((title, index) => ({ id: `c${index}`, title }));
    const groups: ConversationGroup[] = [{ key: "today", label: "Hoje", items: rows }];
    for (const query of queries) {
      const local = filterGroups(groups, query).flatMap((group) => group.items.map((item) => item.id));
      const server = (await searchConversations("pt-BR", query)).map((item) => item.id);
      expect({ query, server }).toEqual({ query, server: local });
    }
  });

  it("calls the matcher the menu's filter uses, and normalizes nothing itself", () => {
    const server = readFileSync(join(__dirname, "conversation-search.ts"), "utf8");
    const groups = readFileSync(join(__dirname, "conversation-groups.ts"), "utf8");
    expect(server).toMatch(/import \{[^}]*\bmatchesConversationSearch\b[^}]*\} from "\.\/conversation-groups"/);
    expect(server).toMatch(/matchesConversationSearch\(/);
    expect(server).not.toMatch(/\.normalize\(|Diacritic|toLocaleLowerCase|toLowerCase|\.ilike\(/);
    expect(groups).toMatch(/export function filterGroups[\s\S]*matchesConversationSearch\(/);
  });
});
