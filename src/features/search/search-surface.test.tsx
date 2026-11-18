import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SearchResponse, SearchResult } from "./contracts";
import { SearchSurface } from "./search-surface";

const result = (
  domain: SearchResult["domain"],
  id: string,
  title: string,
  snippet: string | null = null,
  occurredAt: string | null = null,
): SearchResult => ({ domain, id, title, snippet, occurredAt, href: `/pt-BR/app/x/${id}` });

const RESULTS = [
  result("entries", "e1", "Multa", "…a multa do carro vence em 15 dias…", "2026-09-21T13:39:00.000Z"),
  result("tasks", "t1", "Renovar o seguro do carro"),
  result("entries", "e2", "Revisão do carro na sexta", "Revisão do carro na sexta"),
];

function response(results: SearchResult[], failed = false): SearchResponse {
  return {
    query: "carro",
    outcomes: failed ? [{ domain: "organizations", status: "failed" }] : [],
    results,
    totalBounded: false,
    partial: failed,
    sensitiveScope: false,
  };
}

async function searched(results: SearchResult[], failed = false) {
  const runSearch = vi.fn(async () => response(results, failed));
  const view = render(<SearchSurface locale="pt-BR" runSearch={runSearch} timeZone="America/Sao_Paulo" />);
  const input = screen.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "carro" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => {
    expect(runSearch).toHaveBeenCalled();
    expect(view.container.querySelector("[aria-busy]")).toBeNull();
    expect(view.container.querySelector("p[role=status]")).not.toBeNull();
  });
  return { ...view, runSearch };
}

describe("Busca — the field is the page", () => {
  it("shows the field, its verb and one caption before a search — and nothing else", () => {
    const { container } = render(<SearchSurface locale="pt-BR" runSearch={vi.fn()} timeZone="America/Sao_Paulo" />);
    expect(screen.getByRole("searchbox", { name: "Buscar em tudo que é seu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    expect(container.querySelector(".search-hint")?.textContent).toContain("Tarefas, registros");
    expect(container.querySelector(".search-group")).toBeNull();
    expect(container.querySelector("[data-ux-state]")).toBeNull();
  });

  it("keeps the page's name as its heading", () => {
    render(<SearchSurface locale="pt-BR" runSearch={vi.fn()} timeZone="America/Sao_Paulo" />);
    expect(screen.getByRole("heading", { level: 1, name: "Buscar" })).toBeInTheDocument();
  });

  it("folds the two filters behind one closed line, each still labelled", () => {
    const { container } = render(<SearchSurface locale="pt-BR" runSearch={vi.fn()} timeZone="America/Sao_Paulo" />);
    const fold = container.querySelector("details.search-filters-disclosure") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")?.textContent).toBe("Filtros");
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Período")).toBeInTheDocument();
  });

  it("says in the closed line what a chosen filter holds, and searches with it", async () => {
    const runSearch = vi.fn(async () => response([]));
    const { container } = render(<SearchSurface locale="pt-BR" runSearch={runSearch} timeZone="America/Sao_Paulo" />);
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "tasks" } });
    fireEvent.change(screen.getByLabelText("Período"), { target: { value: "7d" } });
    expect(container.querySelector(".search-filters-active")?.textContent).toBe("Tarefa · Últimos 7 dias");

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "carro" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(runSearch).toHaveBeenCalledTimes(1));
    expect(runSearch).toHaveBeenCalledWith({ query: "carro", locale: "pt-BR", domains: ["tasks"], period: "7d" });
  });

  it("does not search for fewer than two letters", () => {
    const runSearch = vi.fn();
    render(<SearchSurface locale="pt-BR" runSearch={runSearch} timeZone="America/Sao_Paulo" />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.submit(input.closest("form")!);
    expect(runSearch).not.toHaveBeenCalled();
  });
});

describe("Busca — results are rows under their kind", () => {
  it("groups by kind in the product's order, with a count, and loses no result", async () => {
    const { container } = await searched(RESULTS);
    const groups = [...container.querySelectorAll(".search-group")];
    expect(groups.map((group) => group.querySelector("h2")?.textContent)).toEqual(["Tarefas1", "Registros2"]);
    expect(container.querySelectorAll(".search-row")).toHaveLength(RESULTS.length);
    expect(container.querySelector(".search-count")?.textContent).toBe("3 resultados");
  });

  it("makes the whole row the link, with the title and one caption", async () => {
    const { container } = await searched(RESULTS);
    const row = container.querySelector('.search-row[href="/pt-BR/app/x/e1"]')!;
    expect(row.tagName).toBe("A");
    expect(row.querySelector(".search-row-title")?.textContent).toBe("Multa");
    expect(row.querySelector(".search-row-date")?.textContent).toBe("21 de set. de 2026");
    expect(row.querySelector(".search-row-snippet")?.textContent).toBe("…a multa do carro vence em 15 dias…");
  });

  it("marks the words that matched, in the title and in the caption", async () => {
    const { container } = await searched(RESULTS);
    const marks = [...container.querySelectorAll(".search-row mark")].map((mark) => mark.textContent);
    expect(marks).toEqual(["carro", "carro", "carro"]);
  });

  it("cuts a caption that only repeats its title", async () => {
    const { container } = await searched(RESULTS);
    const row = container.querySelector('.search-row[href="/pt-BR/app/x/e2"]')!;
    expect(row.querySelector(".search-row-caption")).toBeNull();
  });

  it("names a kind it could not search, and still shows the rest (2I-SEARCH-007)", async () => {
    const { container } = await searched(RESULTS, true);
    expect(container.querySelector(".search-partial")?.textContent).toContain("Não consegui buscar em: Organização");
    expect(container.querySelectorAll(".search-row")).toHaveLength(RESULTS.length);
  });

  it("says nothing was found in one quiet state", async () => {
    const { container } = await searched([]);
    expect(screen.getByText("Nada encontrado")).toBeInTheDocument();
    expect(container.querySelector(".ux-state-quiet")).not.toBeNull();
    expect(container.querySelector(".search-group")).toBeNull();
  });
});
