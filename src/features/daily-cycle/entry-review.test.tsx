import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterpretationReviewViewed } from "@/features/product-analytics/interaction-events";
import type { AttentionItemView, InterpretationReviewView, OriginalEntryView } from "./contracts";
import {
  EntryReview,
  OriginalRecord,
  ReviewAttention,
  CandidateOutcomeHistory,
  ReviewNextActions,
  ReviewUnderstanding,
} from "./entry-review";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  InterpretationReviewViewed: vi.fn(() => null),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function baseView(overrides: Partial<InterpretationReviewView> = {}): InterpretationReviewView {
  return {
    entryId: "entry-1",
    productState: "ready",
    understanding: "Ligar para a Marina sobre o contrato do Atlas",
    humanFields: [],
    attentionItems: [],
    actionableCandidates: [],
    materializedTasks: [],
    candidateOutcomes: [],
    availableActions: [],
    original: { content: "Ligar para a Marina amanhã.", occurredAt: "2026-07-18T09:00:00.000Z", isRetroactive: false },
    hasTechnicalDetails: true,
    ...overrides,
  };
}

const attentionItem: AttentionItemView = {
  key: "entry-1:retry_processing",
  reason: "retry_processing",
  title: "Tente organizar novamente",
  explanation: "O processamento não foi concluído e pode ser tentado de novo.",
  availableActions: [{ id: "retry_processing" }],
};

describe("ReviewUnderstanding", () => {
  it("shows the understanding text as the primary heading and the product state as a status badge", () => {
    render(<ReviewUnderstanding view={baseView()} locale="pt-BR" occurredAtLabel="18 de julho de 2026" />);

    expect(screen.getByRole("heading", { name: "Ligar para a Marina sobre o contrato do Atlas" })).toBeVisible();
    expect(screen.getByText("Pronto")).toBeVisible();
  });

  it("renders the projection's human fields as a compact fact list", () => {
    render(
      <ReviewUnderstanding
        view={baseView({ humanFields: [{ key: "occurredAt", label: "Data do acontecimento", value: "2026-07-18T09:00:00.000Z", editable: true }] })}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
      />,
    );
    expect(screen.getByText("Data do acontecimento")).toBeVisible();
    expect(screen.getByText("2026-07-18T09:00:00.000Z")).toBeVisible();
  });

  it("surfaces an inline organizing note only while the entry is organizing", () => {
    const { rerender } = render(<ReviewUnderstanding view={baseView({ productState: "organizing" })} locale="pt-BR" occurredAtLabel="18 de julho de 2026" />);
    expect(screen.getByText("O Brain está organizando este registro.")).toBeVisible();

    rerender(<ReviewUnderstanding view={baseView({ productState: "ready" })} locale="pt-BR" occurredAtLabel="18 de julho de 2026" />);
    expect(screen.queryByText("O Brain está organizando este registro.")).not.toBeInTheDocument();
  });
});

describe("ReviewAttention", () => {
  it("renders nothing when there is no attention item, so it never contradicts a resolved entry", () => {
    const { container } = render(<ReviewAttention items={[]} locale="pt-BR" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the attention title, explanation, and any provided action for a pending decision", () => {
    render(
      <ReviewAttention items={[attentionItem]} locale="pt-BR">
        <button type="button">Tentar novamente</button>
      </ReviewAttention>,
    );

    expect(screen.getByText("Tente organizar novamente")).toBeVisible();
    expect(screen.getByText("O processamento não foi concluído e pode ser tentado de novo.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });

  it("reassures that the original is safe for error-shaped attention reasons", () => {
    render(<ReviewAttention items={[attentionItem]} locale="pt-BR" />);
    expect(screen.getByText("O original está seguro.")).toBeVisible();
  });

  it("does not show the safety reassurance for a plain confirmation reason", () => {
    const confirmItem: AttentionItemView = {
      key: "entry-1:confirm_existing_candidates",
      reason: "confirm_existing_candidates",
      title: "Confirme as tarefas",
      explanation: "Há tarefas sugeridas prontas para sua confirmação.",
      availableActions: [{ id: "confirm_existing_candidates" }],
    };
    render(<ReviewAttention items={[confirmItem]} locale="pt-BR" />);
    expect(screen.queryByText("O original está seguro.")).not.toBeInTheDocument();
  });

  it("shows a specific detail message when supplied", () => {
    render(<ReviewAttention items={[attentionItem]} locale="pt-BR" detail="Falha ao contatar o provedor de IA." />);
    expect(screen.getByText("Falha ao contatar o provedor de IA.")).toBeVisible();
  });
});

describe("ReviewNextActions", () => {
  it("labels the section and renders whatever action content it is given", () => {
    render(
      <ReviewNextActions locale="pt-BR">
        <p>Conteúdo da ação</p>
      </ReviewNextActions>,
    );
    expect(screen.getByRole("heading", { name: "Próximas ações" })).toBeVisible();
    expect(screen.getByText("Conteúdo da ação")).toBeVisible();
  });
});

describe("OriginalRecord", () => {
  const original: OriginalEntryView = { content: "Conteúdo original completo.", occurredAt: "2026-07-18T09:00:00.000Z", isRetroactive: false };

  it("keeps the original content collapsed by default but present in the document", () => {
    render(<OriginalRecord original={original} locale="pt-BR" />);
    const details = screen.getByText("Conteúdo original completo.").closest("details");
    expect(details).not.toHaveAttribute("open");
  });

  it("opens by default when defaultOpen is true", () => {
    render(<OriginalRecord original={original} locale="pt-BR" defaultOpen />);
    const details = screen.getByText("Conteúdo original completo.").closest("details");
    expect(details).toHaveAttribute("open");
  });
});

describe("CandidateOutcomeHistory", () => {
  it("renders localized entry-local outcomes and never exposes internal disposition values", () => {
    render(<CandidateOutcomeHistory locale="pt-BR" outcomes={[
      { key: "1", title: "Ligar para Marina", outcomeLabel: "Tarefa criada", resolvedAt: "2026-07-22T12:00:00.000Z" },
      { key: "2", title: "Revisar rascunho", outcomeLabel: "Sugestão rejeitada", resolvedAt: "2026-07-22T12:01:00.000Z" },
      { key: "3", title: "Preferência de contato", outcomeLabel: "Mantida como registro", resolvedAt: "2026-07-22T12:02:00.000Z" },
      { key: "4", title: "Lembrete duplicado", outcomeLabel: "Sugestão dispensada", resolvedAt: "2026-07-22T12:03:00.000Z" },
    ]} />);

    expect(screen.getByRole("heading", { name: "Decisões anteriores" })).toBeVisible();
    expect(screen.getByText("Tarefa criada")).toBeVisible();
    expect(screen.getByText("Sugestão rejeitada")).toBeVisible();
    expect(screen.getByText("Mantida como registro")).toBeVisible();
    expect(screen.getByText("Sugestão dispensada")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/confirmed|rejected|retained|dismissed/);
  });

  it("renders nothing when the entry has no resolved candidate history", () => {
    const { container } = render(<CandidateOutcomeHistory locale="en" outcomes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EntryReview", () => {
  it("renders the five decision-first blocks in order: understanding, attention, next actions, original, technical details", () => {
    render(
      <EntryReview
        view={baseView({ attentionItems: [attentionItem], productState: "needs_attention" })}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
        originalDefaultOpen={false}
        slots={{
          nextActions: <p data-testid="next-actions-slot">next</p>,
          technicalDetails: <div data-testid="technical-slot">technical</div>,
        }}
      />,
    );

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    const understandingIndex = headings.indexOf("Ligar para a Marina sobre o contrato do Atlas");
    const nextActionsIndex = headings.indexOf("Próximas ações");
    expect(understandingIndex).toBeGreaterThanOrEqual(0);
    expect(nextActionsIndex).toBeGreaterThan(understandingIndex);

    expect(screen.getByText("Tente organizar novamente")).toBeVisible();
    expect(screen.getByTestId("next-actions-slot")).toBeVisible();
    expect(screen.getByTestId("technical-slot")).toBeVisible();
    expect(InterpretationReviewViewed).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "entry-1", locale: "pt-BR" }),
      undefined,
    );
  });

  it("omits the technical details slot entirely when there is nothing to show", () => {
    render(
      <EntryReview
        view={baseView()}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
        originalDefaultOpen={false}
        slots={{ nextActions: <p>next</p> }}
      />,
    );
    expect(screen.queryByTestId("technical-slot")).not.toBeInTheDocument();
  });
});
