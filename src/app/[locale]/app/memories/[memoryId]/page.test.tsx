import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/memories/actions", () => ({ setMemoryLifecycle: vi.fn(), updateMemory: vi.fn() }));
vi.mock("@/features/deletion/actions", () => ({
  applyDeletion: vi.fn(),
  confirmDeletion: vi.fn(),
  previewDeletion: vi.fn(),
  undoDeletion: vi.fn(),
}));
vi.mock("@/features/profile/owner-timezone", () => ({ getOwnerTimeZone: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: vi.fn(async () => "Brain") }));

import { requireUser } from "@/lib/auth/require-user";

import MemoryDetailPage from "./page";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/**
 * Answers per table: a list on `await`, one row on `maybeSingle`. What the page
 * asks the database is covered by the guards that read its source; this file is
 * about what it draws with the answer.
 */
function client(lists: Record<string, unknown[]>, singles: Record<string, unknown>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit", "eq"]) chain[method] = () => chain;
      chain.maybeSingle = async () => ({ data: singles[table] ?? null, error: null });
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: lists[table] ?? [], error: null });
      return chain;
    },
  };
}

const MEMORY = {
  id: "m1",
  content: "A Ana faz aniversário em 5 de maio.",
  kind: "relationship",
  sensitivity: "normal",
  important: false,
  person_id: null,
  project_id: null,
  source_entry_id: null,
  valid_from: null,
  valid_until: null,
  created_at: "2026-10-02T13:00:00.000Z",
  updated_at: "2026-11-10T13:00:00.000Z",
};

const ENTRY = {
  id: "e1",
  original_content: "Ana faz aniversário em 5 de maio. Me lembra de comprar um presente.",
  occurred_at: "2026-10-02T12:55:00.000Z",
  sensitivity: "normal",
};

async function mount(memory: Record<string, unknown> = MEMORY, singles: Record<string, unknown> = {}, lists: Record<string, unknown[]> = {}) {
  vi.mocked(requireUser).mockResolvedValue({
    supabase: client(lists, { memories: memory, ...singles }),
    user: { id: "user-1" },
  } as never);
  return render(await MemoryDetailPage({
    params: Promise.resolve({ locale: "pt-BR", memoryId: "m1" }),
    searchParams: Promise.resolve({}),
  }) as React.ReactElement);
}

describe("the memory's own sentence is the page's subject", () => {
  it("is the page's one level-one heading", async () => {
    await mount();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("A Ana faz aniversário em 5 de maio.");
  });

  it("steps a long memory down to the reading size instead of setting a paragraph as a title", async () => {
    const { container } = await mount({ ...MEMORY, content: "Uma frase comprida. ".repeat(12) });
    expect(container.querySelector(".memory-content-heading")!.getAttribute("data-length")).toBe("long");
    cleanup();
    const short = await mount();
    expect(short.container.querySelector(".memory-content-heading")!.hasAttribute("data-length")).toBe(false);
  });

  it("says whether the assistant is using it, in words, on one line", async () => {
    const { container } = await mount();
    const line = container.querySelector(".memory-retrieval-line")!;
    expect(line.textContent).toBe("Em vigor: pode ser usada nas respostas agora.");
    expect(line.getAttribute("data-memory-state")).toBe("active");
  });

  it("says an archived memory is no longer used", async () => {
    const { container } = await mount({ ...MEMORY, valid_until: "2020-01-01T00:00:00.000Z" });
    expect(container.querySelector(".memory-retrieval-line")!.textContent).toBe("Arquivada: não é mais usada nas respostas.");
  });

  it("keeps a sensible outline under the sentence", async () => {
    await mount();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Detalhes",
      "Origem",
      "O que mudou recentemente",
    ]);
  });
});

describe("the facts are a quiet list, and only facts the memory has", () => {
  it("shows the three freshness facts, each under its own label", async () => {
    const { container } = await mount();
    const facts = container.querySelector<HTMLElement>("dl.memory-facts")!;
    expect([...facts.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Vale desde", "Vale até", "Registrada em"]);
    expect(within(facts).getByText("Sem data de início")).toBeInTheDocument();
    expect(within(facts).getByText("Sem prazo")).toBeInTheDocument();
  });

  it("does not print a relation the memory does not have", async () => {
    const { container } = await mount();
    expect(container.querySelector("dl.memory-facts")!.textContent).not.toContain("Nenhum");
  });

  it("links the person and the project when the memory has them", async () => {
    const { container } = await mount(
      { ...MEMORY, person_id: "p1", project_id: "pr1" },
      { people: { id: "p1", name: "Ana Kyrillos" }, projects: { id: "pr1", name: "Reforma" } },
    );
    const facts = container.querySelector<HTMLElement>("dl.memory-facts")!;
    expect(within(facts).getByRole("link", { name: "Ana Kyrillos" }).getAttribute("href")).toBe("/pt-BR/app/people/p1");
    expect(within(facts).getByRole("link", { name: "Reforma" }).getAttribute("href")).toBe("/pt-BR/app/projects/pr1");
  });

  it("keeps editing and archiving in reach, right under the facts", async () => {
    await mount();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    const archive = screen.getByRole("button", { name: "Arquivar" });
    expect(archive.getAttribute("data-memory-lifecycle")).toBe("archive");
    // The sentence that says archiving is not deleting stays beside the control.
    expect(screen.getByText(/Nada é apagado/)).toBeInTheDocument();
  });
});

describe("where it came from is said once, with one link", () => {
  it("quotes the source record and links to it once", async () => {
    const { container } = await mount({ ...MEMORY, source_entry_id: "e1" }, { entries: ENTRY });
    const origin = screen.getByRole("region", { name: "Origem" });
    expect(within(origin).getByText(ENTRY.original_content)).toBeInTheDocument();
    const links = within(origin).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/pt-BR/app/inbox/e1");
    // Named by position, never by the memory's text.
    expect(links[0]!.getAttribute("aria-label")).not.toContain("Ana");
    expect(container.querySelector(".memory-origin .provenance-note")!.getAttribute("data-provenance")).toBe("sourced");
  });

  it("calls the memory unsourced, with no quotation and no link, when the source did not come back", async () => {
    const { container } = await mount({ ...MEMORY, source_entry_id: "gone" });
    const origin = screen.getByRole("region", { name: "Origem" });
    expect(within(origin).queryByRole("link")).toBeNull();
    expect(origin.querySelector("blockquote")).toBeNull();
    expect(container.querySelector(".memory-origin .provenance-note")!.getAttribute("data-provenance")).toBe("unsourced");
  });
});

describe("a contradiction is the one thing the page raises", () => {
  it("shows both dates above the facts, and neither as the winner", async () => {
    const { container } = await mount({ ...MEMORY, valid_from: "2027-03-31T03:00:00.000Z", valid_until: "2026-03-31T03:00:00.000Z" });
    const block = container.querySelector<HTMLElement>("[data-memory-conflict='true']")!;
    expect(block.querySelectorAll("dd")).toHaveLength(2);
    const facts = container.querySelector("dl.memory-facts")!;
    expect(Boolean(block.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("raises nothing on a memory whose dates agree", async () => {
    const { container } = await mount();
    expect(container.querySelector("[data-memory-conflict]")).toBeNull();
  });
});

describe("what changed and the way to delete are quiet, at the foot", () => {
  it("keeps the trail of changes collapsed, with every change still inside it", async () => {
    const { container } = await mount(MEMORY, {}, {
      audit_logs: [{
        id: "a1",
        action_type: "create_memory",
        entity_type: "memory",
        entity_id: "m1",
        actor: "user",
        before_state: null,
        after_state: { content: MEMORY.content },
        created_at: "2026-10-02T13:00:00.000Z",
      }],
    });
    const trail = container.querySelector<HTMLDetailsElement>("#changes details")!;
    expect(trail.open).toBe(false);
    expect(trail.firstElementChild?.tagName).toBe("SUMMARY");
    expect(trail.textContent).toContain("criou a memória");
  });

  it("says so inside the disclosure when nothing has changed yet", async () => {
    const { container } = await mount();
    expect(container.querySelector("#changes details")!.textContent).toContain("Nenhuma alteração registrada nesta memória ainda.");
  });

  it("offers deletion last, after the reversible archive", async () => {
    await mount();
    const remove = screen.getByRole("button", { name: /excluir/i });
    const archive = screen.getByRole("button", { name: "Arquivar" });
    expect(Boolean(archive.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
