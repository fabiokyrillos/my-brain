import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackedTechnicalDetails } from "@/features/product-analytics/interaction-events";
import type { InterpretationTechnicalDetailsView } from "./contracts";
import type { EntryReviewHistoryItem } from "./review-projection";
import { TechnicalDetails } from "./technical-details";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  TrackedTechnicalDetails: vi.fn(({ children }: { children: ReactNode }) => <details>{children}</details>),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function technicalView(overrides: Partial<InterpretationTechnicalDetailsView> = {}): InterpretationTechnicalDetailsView {
  return {
    entryId: "entry-1",
    versions: [{ id: "interp-1", version: 1, createdAt: "2026-07-18T09:00:00.000Z" }],
    source: {},
    model: "gpt-test",
    scores: { summary: 0.9 },
    policies: { summary: "auto_apply" },
    signals: { summary: { normalizedExactName: 1 } },
    evidence: { summary: ["explicit_user_confirmation"] },
    overrides: { summary: [] },
    comparisons: {},
    provenance: {},
    ...overrides,
  };
}

function historyItem(overrides: Partial<EntryReviewHistoryItem> = {}): EntryReviewHistoryItem {
  return {
    interpretationId: "interp-1",
    version: 1,
    origin: "ai_generated",
    summary: "Ligar para a Marina sobre o contrato do Atlas",
    correctionReason: null,
    createdAt: "2026-07-18T09:00:00.000Z",
    isCurrent: true,
    ...overrides,
  };
}

describe("TechnicalDetails", () => {
  it("renders nothing when the entry has no technical details to show", () => {
    const { container } = render(
      <TechnicalDetails entryId="entry-1" technical={null} history={[]} hasTechnicalDetails={false} locale="pt-BR" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the extracted concepts, dates, entity links, and mentions when structured content is provided", () => {
    render(
      <TechnicalDetails
        entryId="entry-1"
        technical={null}
        history={[]}
        hasTechnicalDetails
        locale="pt-BR"
        structured={{
          concepts: ["task"],
          extractedDates: [{ value: "2026-07-21", label: "prazo" }],
          entityLinks: [{ entityType: "person", entityId: "person-1", name: "Marina Silva", mention: "Marina", confidence: 0.9 }],
          extractedMentions: [{ name: "Atlas", evidence: "menção direta", confidence: 0.8 }],
        }}
      />,
    );

    expect(screen.getByText("2026-07-21")).toBeInTheDocument();
    expect(screen.getByText("Marina Silva")).toBeInTheDocument();
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });

  it("stays collapsed by default behind a details/summary disclosure", () => {
    render(<TechnicalDetails entryId="entry-1" technical={technicalView()} history={[historyItem()]} hasTechnicalDetails locale="pt-BR" />);
    const summary = screen.getByText("Ver detalhes técnicos");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(TrackedTechnicalDetails).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "entry-1", locale: "pt-BR" }),
      undefined,
    );
  });

  it("degrades gracefully when technical details failed to load but the entry has a current interpretation", () => {
    render(<TechnicalDetails entryId="entry-1" technical={null} history={[historyItem()]} hasTechnicalDetails locale="pt-BR" />);
    expect(screen.getByText(/Não foi possível carregar os detalhes técnicos/)).toBeInTheDocument();
    expect(screen.getByText("v1 · Interpretação inicial")).toBeInTheDocument();
  });

  it("renders trust scores and policies for each interpreted element", () => {
    render(<TechnicalDetails entryId="entry-1" technical={technicalView()} history={[historyItem()]} hasTechnicalDetails locale="pt-BR" />);
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Aplicação automática")).toBeInTheDocument();
  });

  it("renders the immutable revision timeline", () => {
    render(
      <TechnicalDetails
        entryId="entry-1"
        technical={technicalView()}
        history={[historyItem(), historyItem({ interpretationId: "interp-2", version: 2, origin: "user_corrected", isCurrent: false })]}
        hasTechnicalDetails
        locale="pt-BR"
      />,
    );
    expect(screen.getByText("v1 · Interpretação inicial")).toBeInTheDocument();
    expect(screen.getByText("v2 · Correção do usuário")).toBeInTheDocument();
  });

  it("localizes labels in English", () => {
    render(<TechnicalDetails entryId="entry-1" technical={technicalView()} history={[historyItem()]} hasTechnicalDetails locale="en" />);
    expect(screen.getByText("View technical details")).toBeInTheDocument();
    expect(screen.getByText("Auto-apply")).toBeInTheDocument();
  });
});
