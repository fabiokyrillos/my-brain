import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

import { ProcessingView, type ProcessingJob } from "./processing-view";

let n = 0;
const job = (type: string, status: string, attempts = 1, error: string | null = null): ProcessingJob => ({
  id: `job-${(n += 1)}`,
  type,
  status,
  attempts,
  max_attempts: 3,
  error,
  created_at: "2026-11-18T14:12:00.000Z",
});

const MIXED = [
  job("interpret_entry", "running"),
  job("process_attachment", "pending", 0),
  job("process_attachment", "failed", 3, "extraction_failed: pdf_encrypted"),
  job("interpret_entry", "completed"),
  job("interpret_entry", "failed", 3, "provider_timeout"),
  job("interpret_entry", "cancelled", 0),
];

function view(jobs: ProcessingJob[], overrides: Partial<Parameters<typeof ProcessingView>[0]> = {}) {
  return render(
    <ProcessingView formatWhen={() => "18 de nov. de 2026, 11:12"} hasNext={false} jobs={jobs} locale="pt-BR" page={1} {...overrides} />,
  );
}

describe("Processamento — the page opens with its answer", () => {
  it("says what is in flight and what failed, in one sentence, first", () => {
    const { container } = view(MIXED);
    expect(container.firstElementChild?.className).toBe("jobs-lead");
    expect(container.querySelector(".jobs-lead-sentence")?.textContent).toBe("2 itens em processamento, 2 com falha.");
  });

  it("says everything is processed when nothing failed and nothing is in flight", () => {
    const { container } = view([job("interpret_entry", "completed"), job("interpret_entry", "cancelled", 0)]);
    expect(container.querySelector(".jobs-lead-sentence")?.textContent).toBe("Tudo processado.");
    expect(container.querySelectorAll(".jobs-section")).toHaveLength(0);
  });

  it("says the sentence covers one page of rows when there are more", () => {
    expect(view(MIXED).container.querySelector(".jobs-lead-caption")).toBeNull();
    const { container } = view(MIXED, { hasNext: true });
    expect(container.querySelector(".jobs-lead-caption")?.textContent).toBe("Entre os 6 mais recentes.");
  });

  it("does not present an older page as the state of things now", () => {
    const { container } = view([job("interpret_entry", "completed")], { page: 2 });
    expect(container.querySelector(".jobs-lead-sentence")?.textContent).toBe("Página 2: itens mais antigos.");
  });

  it("renders nothing for no rows — the route owns the empty state", () => {
    expect(view([]).container.innerHTML).toBe("");
  });
});

describe("Processamento — rows in the order they matter", () => {
  it("puts failures first, then what is in flight, then the finished ones folded behind a count", () => {
    const { container } = view(MIXED);
    const blocks = [...container.querySelectorAll(".jobs-section, .jobs-fold")];
    expect(blocks.map((block) => block.querySelector("h2 > span, summary > span")?.textContent)).toEqual([
      "Com falha",
      "Em andamento",
      "Finalizados",
    ]);
    expect(blocks.map((block) => block.querySelector("h2 > small, summary > small")?.textContent)).toEqual(["2", "2", "2"]);
    const fold = container.querySelector("details.jobs-fold") as HTMLDetailsElement;
    expect(fold.open).toBe(false);
  });

  it("writes a row as the kind of work, when, and its state as a word — no pill", () => {
    const { container } = view(MIXED);
    const row = container.querySelector(".jobs-section .jobs-row")!;
    expect(row.querySelector(".jobs-row-title")?.textContent).toBe("Processar arquivo");
    expect(row.querySelector("time")?.textContent).toBe("18 de nov. de 2026, 11:12");
    expect(row.querySelector(".jobs-row-status")?.textContent).toBe("Falhou");
    expect(row.querySelector(".jobs-row-state")?.textContent).toContain("tentativa 3 de 3");
    expect(container.querySelector(".status-badge")).toBeNull();
  });

  it("leaves the attempt out of a row that has not started", () => {
    const { container } = view([job("process_attachment", "pending", 0)]);
    expect(container.querySelector(".jobs-row-state")?.textContent).toBe("Na fila");
  });

  it("keeps the worker's error and the identifier behind a closed disclosure", () => {
    const { container } = view(MIXED);
    const detail = container.querySelector(".jobs-row-detail") as HTMLDetailsElement;
    expect(detail.open).toBe(false);
    expect(detail.querySelector("summary")?.textContent).toBe("Detalhe técnico");
    expect(detail.querySelector(".jobs-row-error")?.textContent).toBe("extraction_failed: pdf_encrypted");
    expect(detail.querySelector(".jobs-row-id")?.textContent).toMatch(/^Identificador: job-\d+$/);
  });

  it("points a failed file analysis at Arquivos, where the retry lives — and nothing else", () => {
    const { container } = view(MIXED);
    const verbs = [...container.querySelectorAll(".jobs-row-verb")] as HTMLAnchorElement[];
    expect(verbs).toHaveLength(1);
    expect(verbs[0].getAttribute("href")).toBe("/pt-BR/app/files");
    expect(verbs[0].closest(".jobs-row")?.querySelector(".jobs-row-title")?.textContent).toBe("Processar arquivo");
  });

  it("shows a job type it was never taught by its own name, and an unknown status as a sentence", () => {
    const { container } = view([job("reindex_embeddings", "archived")]);
    const fold = container.querySelector(".jobs-fold")!;
    expect(fold.querySelector(".jobs-row-title")?.textContent).toBe("reindex_embeddings");
    expect(fold.querySelector(".jobs-row-status")?.textContent).toBe("Situação desconhecida");
  });
});
