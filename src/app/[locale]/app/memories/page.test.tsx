import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/entities/actions", () => ({ createOrganization: vi.fn() }));
vi.mock("@/features/memories/actions", () => ({ createProposedMemory: vi.fn(), undoProposedMemory: vi.fn() }));

import { requireUser } from "@/lib/auth/require-user";

import MemoriesPage from "./page";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/**
 * A client that answers per table and resolves on `await`, whatever chain of
 * filters precedes it. The page's own queries are asserted elsewhere; this file
 * is about what the rows look like.
 */
function client(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "order", "range", "in", "eq"]) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null });
      return chain;
    },
  };
}

const memory = (id: string, content: string, overrides: Record<string, unknown> = {}) => ({
  id,
  content,
  kind: "fact",
  important: false,
  person_id: null,
  project_id: null,
  source_entry_id: null,
  sensitivity: "normal",
  valid_from: null,
  valid_until: null,
  updated_at: "2026-11-10T13:00:00.000Z",
  ...overrides,
});

async function mount(memories: unknown[], entries: unknown[] = []) {
  vi.mocked(requireUser).mockResolvedValue({ supabase: client({ memories, entries }), user: { id: "user-1" } } as never);
  return render(await MemoriesPage({
    params: Promise.resolve({ locale: "pt-BR" }),
    searchParams: Promise.resolve({}),
  }) as React.ReactElement);
}

describe("a memory's row is its own sentence, and the sentence is the link", () => {
  it("links the sentence to the memory's page", async () => {
    await mount([memory("m1", "Prefiro consultas pela manhã.")]);
    expect(screen.getByRole("link", { name: "Prefiro consultas pela manhã." }).getAttribute("href")).toBe("/pt-BR/app/memories/m1");
  });

  it("offers one destination for the memory: no second, unnamed link beside it", async () => {
    const { container } = await mount([memory("m1", "Prefiro consultas pela manhã.")]);
    const row = container.querySelector(".memory-row")!;
    expect(row.querySelectorAll("a[href='/pt-BR/app/memories/m1']")).toHaveLength(1);
    expect(row.querySelector(".memory-row-chevron-link")).toBeNull();
  });

  it("keeps the source as its own link, named by the row's position and never by its text", async () => {
    await mount(
      [memory("m1", "Tenho alergia a dipirona.", { source_entry_id: "e1" })],
      [{ id: "e1" }],
    );
    const source = screen.getByRole("link", { name: /memória 1/i });
    expect(source.getAttribute("href")).toBe("/pt-BR/app/inbox/e1");
    expect(source.getAttribute("aria-label")).not.toContain("dipirona");
  });

  it("calls a memory unsourced when its source did not come back, and links nothing", async () => {
    const { container } = await mount([memory("m1", "Tenho alergia a dipirona.", { source_entry_id: "gone" })]);
    expect(container.querySelector(".provenance-note")!.getAttribute("data-provenance")).toBe("unsourced");
    expect(container.querySelectorAll(".memory-row a")).toHaveLength(1);
  });
});

describe("the state is said where it is the exception", () => {
  it("does not badge a memory that is in force", async () => {
    const { container } = await mount([memory("m1", "Prefiro consultas pela manhã.")]);
    expect(container.querySelector(".memory-state")).toBeNull();
    expect(screen.queryByText("Em vigor")).toBeNull();
  });

  it("names an archived memory, in words", async () => {
    await mount([memory("m1", "Usava o plano antigo.", { valid_until: "2020-01-01T00:00:00.000Z" })]);
    expect(screen.getByText("Arquivada")).toBeInTheDocument();
  });

  it("names a scheduled memory, in words", async () => {
    await mount([memory("m1", "Vou estudar espanhol.", { valid_from: "2999-01-01T00:00:00.000Z" })]);
    expect(screen.getByText("Programada")).toBeInTheDocument();
  });

  it("marks an important memory and says what kind it is", async () => {
    const { container } = await mount([memory("m1", "Tenho alergia a dipirona.", { important: true, kind: "restriction" })]);
    const row = container.querySelector<HTMLElement>(".memory-row")!;
    expect(within(row).getByText("Importante")).toBeInTheDocument();
    expect(within(row).getByText("Restrição")).toBeInTheDocument();
  });
});

describe("the page opens on the memories, not on an explanation of them", () => {
  it("groups the memories under a heading with the segment's size", async () => {
    await mount([memory("m1", "Não marco reuniões depois das 18h.", { kind: "rule" }), memory("m2", "Durmo cedo.", { kind: "habit" })]);
    const group = screen.getByRole("group", { name: "Memórias por segmento" });
    const heading = within(group).getByRole("heading", { level: 2 });
    expect(heading.textContent).toContain("2");
    expect(within(group).getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the mental-model account, collapsed, after the list", async () => {
    const { container } = await mount([memory("m1", "Prefiro consultas pela manhã.")]);
    const explainer = container.querySelector<HTMLDetailsElement>("details.memory-explainer")!;
    expect(explainer.open).toBe(false);
    // The summary is the disclosure's own first child, so the native control
    // names it; opening from the keyboard is asserted in a real browser
    // (`e2e/accessibility.spec.ts`), which jsdom cannot stand in for.
    expect(explainer.firstElementChild?.tagName).toBe("SUMMARY");
    expect(within(explainer).getByText("O que é uma memória?")).toBeInTheDocument();
    // Both sentences are still in the document, one press away.
    expect(explainer.textContent).toContain("Uma memória é um fato ou preferência sua");
    expect(explainer.textContent).toContain("Um registro conta o que aconteceu num momento");
    const list = container.querySelector(".memory-segments")!;
    expect(Boolean(list.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("still offers writing a memory from the header", async () => {
    await mount([]);
    expect(screen.getByRole("button", { name: "Nova memória" })).toBeInTheDocument();
    expect(screen.getByText("Nenhuma memória ainda")).toBeInTheDocument();
  });
});
