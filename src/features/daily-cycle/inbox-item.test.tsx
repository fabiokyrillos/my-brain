import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InboxItemRow } from "./inbox-item";
import type { InboxItemView } from "./contracts";

function item(overrides: Partial<InboxItemView> = {}): InboxItemView {
  return {
    entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    title: "Ligar para a Marina",
    originalPreview: "Ligar para a Marina sobre o contrato do Atlas amanhã de manhã.",
    productState: "ready",
    significantAt: "2026-07-17T12:00:00.000Z",
    availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" }],
    originalPreserved: true,
    ...overrides,
  };
}

describe("InboxItemRow", () => {
  it("renders the human title, original preview, and a localized product-state label", () => {
    render(<InboxItemRow item={item()} locale="pt-BR" />);

    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(screen.getByText(/Ligar para a Marina sobre o contrato do Atlas/)).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
  });

  it("never renders the internal product state string as UI text", () => {
    render(<InboxItemRow item={item({ productState: "could_not_organize" })} locale="en" />);

    expect(screen.queryByText("could_not_organize")).not.toBeInTheDocument();
    expect(screen.getByText("Could not organize")).toBeInTheDocument();
  });

  it("links to the entry's open_entry action href", () => {
    render(<InboxItemRow item={item()} locale="pt-BR" />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6");
  });

  it("surfaces the attention reason as an accessible hint when one is present", () => {
    render(<InboxItemRow item={item({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" })} locale="en" />);

    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getByText("Resolve the suggestions")).toBeInTheDocument();
  });
});
