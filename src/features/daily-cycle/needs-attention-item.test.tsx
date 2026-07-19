import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordNeedsAttentionItemOpened } from "@/features/product-analytics/interaction-events";
import { NeedsAttentionItemRow } from "./needs-attention-item";
import type { NeedsAttentionItemView } from "./contracts";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
}));

function item(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "entry-1:confirm_existing_candidates",
    kind: "confirm_existing_candidates",
    entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    title: "Ligar para a Marina",
    explanation: "Há tarefas sugeridas prontas para sua confirmação.",
    primaryAction: { id: "confirm_existing_candidates", href: "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" },
    occurredAt: "2026-07-18T12:00:00.000Z",
    groupKey: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    ...overrides,
  };
}

describe("NeedsAttentionItemRow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the human title and explanation", () => {
    render(<NeedsAttentionItemRow item={item()} locale="pt-BR" surface="home" />);

    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(screen.getByText("Há tarefas sugeridas prontas para sua confirmação.")).toBeInTheDocument();
  });

  it("renders a localized action hint for the primary action id", () => {
    render(<NeedsAttentionItemRow item={item({ primaryAction: { id: "retry_processing", href: "/en/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" } })} locale="en" surface="needs_attention" />);

    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("links to the primary action href", () => {
    render(<NeedsAttentionItemRow item={item()} locale="pt-BR" surface="home" />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6");
  });

  it("never renders the internal reason string as UI text", () => {
    render(<NeedsAttentionItemRow item={item({ kind: "resolve_consistency", primaryAction: { id: "resolve_consistency", href: "/en/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" } })} locale="en" surface="needs_attention" />);

    expect(screen.queryByText("resolve_consistency")).not.toBeInTheDocument();
    expect(screen.getByText("Review record")).toBeInTheDocument();
  });

  it("records the meaningful open interaction without raw entry content", async () => {
    const user = userEvent.setup();
    render(<NeedsAttentionItemRow item={item()} locale="pt-BR" surface="home" />);

    await user.click(screen.getByRole("link"));

    expect(recordNeedsAttentionItemOpened).toHaveBeenCalledWith({
      attentionReason: "confirm_existing_candidates",
      entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
      locale: "pt-BR",
      surface: "home",
    });
  });
});
