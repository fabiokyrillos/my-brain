import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InterpretationReviewViewed } from "@/features/product-analytics/interaction-events";
import type { AttentionItemView, EntryOutcomeView, InterpretationReviewView, OriginalEntryView } from "./contracts";
import {
  EntryOutcomes,
  EntryReview,
  OriginalRecord,
  ReviewAttention,
  CandidateOutcomeHistory,
  ReviewNextActions,
  ReviewUnderstanding,
} from "./entry-review";

const OWNER_TIME_ZONE = "America/Sao_Paulo";

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
    render(<ReviewUnderstanding agentName="Brain" view={baseView()} locale="pt-BR" occurredAtLabel="18 de julho de 2026" />);

    expect(screen.getByRole("heading", { name: "Ligar para a Marina sobre o contrato do Atlas" })).toBeVisible();
    expect(screen.getByText("Pronto")).toBeVisible();
  });

  it("renders the projection's human fields as a compact fact list", () => {
    render(
      <ReviewUnderstanding
        agentName="Brain"
        view={baseView({ humanFields: [{ key: "occurredAt", label: "Data do acontecimento", value: "2026-07-18T09:00:00.000Z", editable: true }] })}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
      />,
    );
    expect(screen.getByText("Data do acontecimento")).toBeVisible();
    expect(screen.getByText("2026-07-18T09:00:00.000Z")).toBeVisible();
  });

  it("surfaces an inline organizing note only while the entry is organizing", () => {
    const { rerender } = render(<ReviewUnderstanding agentName="Brain" view={baseView({ productState: "organizing" })} locale="pt-BR" occurredAtLabel="18 de julho de 2026" />);
    expect(screen.getByText("O Brain está organizando este registro.")).toBeVisible();

    rerender(<ReviewUnderstanding agentName="Brain" view={baseView({ productState: "ready" })} locale="pt-BR" occurredAtLabel="18 de julho de 2026" />);
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

/**
 * These two tests used to assert the finding rather than the fix: that the
 * owner's own words stayed collapsed unless the interpretation had failed —
 * shown by default only when there was nothing else to show. UX-04 is that the
 * page could not answer "what did I write?" without a click. They now assert
 * that it can, and that there is no disclosure left to close it.
 */
describe("OriginalRecord", () => {
  const original: OriginalEntryView = { content: "Conteúdo original completo.", occurredAt: "2026-07-18T09:00:00.000Z", isRetroactive: false };

  it("shows the original content without a click, and offers no way to collapse it", () => {
    render(<OriginalRecord original={original} locale="pt-BR" />);

    expect(screen.getByText("Conteúdo original completo.")).toBeVisible();
    expect(screen.getByText("Conteúdo original completo.").closest("details")).toBeNull();
  });

  it("names the section for what it holds, in both locales", () => {
    render(<OriginalRecord original={original} locale="pt-BR" />);
    expect(screen.getByRole("heading", { name: "O que você escreveu" })).toBeVisible();

    cleanup();

    render(<OriginalRecord original={original} locale="en" />);
    expect(screen.getByRole("heading", { name: "What you wrote" })).toBeVisible();
  });

  it("preserves the owner's own line breaks", () => {
    render(<OriginalRecord original={{ ...original, content: "linha um\nlinha dois" }} locale="pt-BR" />);

    const paragraph = screen.getByText(/linha um/);
    expect(paragraph.className).toContain("review-original-content");
    expect(paragraph.textContent).toBe("linha um\nlinha dois");
  });
});

describe("EntryOutcomes", () => {
  const group = (items: EntryOutcomeView["groups"][number]["items"]): EntryOutcomeView => ({
    entryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    groups: [{ family: "task", heading: "Tarefas criadas", items }],
    isEmpty: false,
  });

  it("answers the question even when the answer is nothing", () => {
    render(
      <EntryOutcomes
        locale="pt-BR"
        outcomes={{ entryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", groups: [], isEmpty: true }}
      />,
    );

    expect(screen.getByRole("heading", { name: "O que passou a existir" })).toBeVisible();
    expect(screen.getByText(/Nada foi criado a partir deste registro/)).toBeVisible();
  });

  it("renders an item with a destination as a link the owner can follow", () => {
    render(
      <EntryOutcomes
        locale="pt-BR"
        outcomes={group([
          { key: "task:1", family: "task", title: "Ligar para a Marina", detail: "A fazer", href: "/pt-BR/app/work/1" },
        ])}
      />,
    );

    const link = screen.getByRole("link", { name: "Ligar para a Marina" });
    expect(link).toHaveAttribute("href", "/pt-BR/app/work/1");
    expect(screen.getByText("A fazer")).toBeVisible();
  });

  /** UX-20: what looks actionable must be actionable, so what cannot be opened is not a link. */
  it("renders an item with no destination as plain text, not as a dead link", () => {
    render(
      <EntryOutcomes
        locale="pt-BR"
        outcomes={group([{ key: "entity:1", family: "entity", title: "Trabalho", detail: "Contexto", href: null }])}
      />,
    );

    expect(screen.queryByRole("link", { name: "Trabalho" })).toBeNull();
    expect(screen.getByText("Trabalho")).toBeVisible();
  });

  it("omits the detail line rather than rendering an empty one", () => {
    render(
      <EntryOutcomes
        locale="pt-BR"
        outcomes={group([{ key: "task:1", family: "task", title: "Tarefa", detail: null, href: null }])}
      />,
    );

    expect(screen.getByText("Tarefa").parentElement?.querySelectorAll(".entry-outcome-detail")).toHaveLength(0);
  });

  it("localizes its own framing in English", () => {
    render(
      <EntryOutcomes
        locale="en"
        outcomes={{ entryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", groups: [], isEmpty: true }}
      />,
    );

    expect(screen.getByRole("heading", { name: "What now exists" })).toBeVisible();
    expect(screen.getByText(/Nothing was created from this record/)).toBeVisible();
  });
});

describe("CandidateOutcomeHistory", () => {
  it("renders localized entry-local outcomes and never exposes internal disposition values", () => {
    render(<CandidateOutcomeHistory timeZone={OWNER_TIME_ZONE} locale="pt-BR" outcomes={[
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
    const { container } = render(<CandidateOutcomeHistory timeZone={OWNER_TIME_ZONE} locale="en" outcomes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EntryReview", () => {
  const outcomes: EntryOutcomeView = {
    entryId: "entry-1",
    groups: [
      {
        family: "task",
        heading: "Tarefas criadas",
        items: [{ key: "task:1", family: "task", title: "Ligar para a Marina", detail: "A fazer", href: "/pt-BR/app/work/1" }],
      },
    ],
    isEmpty: false,
  };

  /**
   * UX-04 is an ordering finding, so this asserts the order. The sequence is the
   * owner's questions: what did I write → what needs me → what can I do → what
   * now exists → what happened before → how it was decided.
   */
  it("runs the blocks in the order the owner's questions are asked", () => {
    render(
      <EntryReview timeZone={OWNER_TIME_ZONE}
      agentName="Brain"
        view={baseView({ attentionItems: [attentionItem], productState: "needs_attention" })}
        outcomes={outcomes}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
        slots={{
          nextActions: <p data-testid="next-actions-slot">next</p>,
          technicalDetails: <div data-testid="technical-slot">technical</div>,
        }}
      />,
    );

    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
    const at = (name: string) => headings.indexOf(name);

    expect(at("Ligar para a Marina sobre o contrato do Atlas")).toBe(0);
    expect(at("O que você escreveu")).toBeGreaterThan(at("Ligar para a Marina sobre o contrato do Atlas"));
    expect(at("Próximas ações")).toBeGreaterThan(at("O que você escreveu"));
    expect(at("O que passou a existir")).toBeGreaterThan(at("Próximas ações"));

    expect(screen.getByText("Tente organizar novamente")).toBeVisible();
    expect(screen.getByTestId("next-actions-slot")).toBeVisible();
    expect(screen.getByTestId("technical-slot")).toBeVisible();
    expect(InterpretationReviewViewed).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "entry-1", locale: "pt-BR" }),
      undefined,
    );
  });

  it("shows what was created, linked, without the owner having to confirm anything again", () => {
    render(
      <EntryReview timeZone={OWNER_TIME_ZONE}
      agentName="Brain"
        view={baseView()}
        outcomes={outcomes}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
        slots={{ nextActions: <p>next</p> }}
      />,
    );

    expect(screen.getByRole("link", { name: "Ligar para a Marina" })).toHaveAttribute("href", "/pt-BR/app/work/1");
  });

  it("omits the technical details slot entirely when there is nothing to show", () => {
    render(
      <EntryReview timeZone={OWNER_TIME_ZONE}
      agentName="Brain"
        view={baseView()}
        outcomes={outcomes}
        locale="pt-BR"
        occurredAtLabel="18 de julho de 2026"
        slots={{ nextActions: <p>next</p> }}
      />,
    );
    expect(screen.queryByTestId("technical-slot")).not.toBeInTheDocument();
  });
});
