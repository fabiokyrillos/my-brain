import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { InboxItemView } from "./contracts";
import { RecordsQueue } from "./records-queue";

afterEach(cleanup);

function item(overrides: Partial<InboxItemView> = {}): InboxItemView {
  return {
    entryId: "entry-1",
    title: "Falar com o João sobre o orçamento",
    originalPreview: "Preciso falar com o João sobre o orçamento da temporada na terça.",
    productState: "needs_attention",
    attentionReason: "review_interpretation",
    significantAt: "2026-08-14T12:04:00.000Z",
    availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/entry-1" }],
    originalPreserved: true,
    isRecordOnly: false,
    ...overrides,
  };
}

function renderQueue(items: readonly InboxItemView[], locale: "pt-BR" | "en" = "pt-BR") {
  return render(
    <RecordsQueue agentName="Brain" items={items} locale={locale} timeZone="America/Sao_Paulo" />,
  );
}

describe("Registros as a decision queue", () => {
  /**
   * The third column is the redesign. A queue that only says "needs you" makes
   * the user open every row to find out what is at stake; this says it first.
   */
  it("says what is at stake before the row is opened", () => {
    renderQueue([
      item({ entryId: "a", attentionReason: "answer_existing_question" }),
      item({ entryId: "b", attentionReason: "confirm_existing_candidates" }),
      item({ entryId: "c", productState: "organizing", attentionReason: undefined }),
      item({ entryId: "d", productState: "could_not_organize", attentionReason: "retry_processing" }),
    ]);

    expect(screen.getByText("1 pergunta pendente")).toBeInTheDocument();
    expect(screen.getByText("sugestões aguardando sua decisão")).toBeInTheDocument();
    expect(screen.getByText("lendo agora")).toBeInTheDocument();
    expect(screen.getByText(/não foi possível organizar/)).toBeInTheDocument();
  });

  it("never leaves the proposal cell blank", () => {
    // An empty cell reads as missing information. Every state has an answer,
    // including "nothing to do".
    const { container } = renderQueue([
      item({ entryId: "a", productState: "saved", attentionReason: undefined }),
      item({ entryId: "b", productState: "ready", attentionReason: undefined, isRecordOnly: true }),
      item({ entryId: "c", productState: "ready", attentionReason: undefined }),
    ]);

    for (const cell of container.querySelectorAll(".records-proposal")) {
      expect(cell.textContent?.trim()).not.toBe("");
    }
  });

  it("quotes the owner's own words, not the interpretation summary", () => {
    renderQueue([item({ title: "Um resumo gerado", originalPreview: "O que eu escrevi" })]);

    expect(screen.getByText("O que eu escrevi")).toBeInTheDocument();
    expect(screen.queryByText("Um resumo gerado")).not.toBeInTheDocument();
  });

  /**
   * `04-estados.md`: cor + palavra + forma, never colour alone. The word is
   * asserted here; the dot and the left rule are the other two, and both are
   * driven by `data-state`/`data-attention` rather than by a class the row picks.
   */
  it("names every state in words, and marks attention rows structurally", () => {
    const { container } = renderQueue([
      item({ entryId: "a" }),
      item({ entryId: "b", productState: "ready", attentionReason: undefined, isRecordOnly: true }),
    ]);

    expect(screen.getByText("Precisa de você")).toBeInTheDocument();
    expect(screen.getByText("Só registro")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-attention="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-state="needs_attention"]')).not.toBeNull();
  });

  it("distinguishes record-only from a record that produced something", () => {
    renderQueue([
      item({ entryId: "a", productState: "ready", attentionReason: undefined, isRecordOnly: true }),
      item({ entryId: "b", productState: "ready", attentionReason: undefined, isRecordOnly: false }),
    ]);

    expect(screen.getByText("nada a fazer")).toBeInTheDocument();
    expect(screen.getByText("organizado")).toBeInTheDocument();
  });

  it("stamps the row in the owner's zone, not the runner's", () => {
    renderQueue([item({ significantAt: "2026-08-14T12:04:00.000Z" })]);

    // 12:04Z is 09:04 in America/Sao_Paulo — the mockup's own timestamp.
    expect(screen.getByText(/09:04/)).toBeInTheDocument();
  });

  it("opens the record it names", () => {
    renderQueue([item({ availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/entry-1" }] })]);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/pt-BR/app/inbox/entry-1");
  });

  it("renders in English without leaking Portuguese", () => {
    renderQueue([item({ attentionReason: "answer_existing_question" })], "en");

    expect(screen.getByText("1 pending question")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pergunta|registro/i);
  });

  it("keeps the column headers out of the accessible tree", () => {
    // They are an alignment aid. Announced, they would precede all twenty rows
    // with three words that each row already carries in its own cells.
    const { container } = renderQueue([item()]);
    const head = container.querySelector(".records-head");

    expect(head).not.toBeNull();
    expect(head).toHaveAttribute("aria-hidden", "true");
    expect(within(screen.getByRole("listitem")).getByText(/quando/i)).toBeInTheDocument();
  });
});
