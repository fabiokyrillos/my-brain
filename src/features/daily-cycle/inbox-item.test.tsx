import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InboxItemRow } from "./inbox-item";
import type { InboxItemView } from "./contracts";

/**
 * The instant that makes the zone visible: 02:00 UTC is **the previous day** in
 * São Paulo and the same day in Auckland. The old fixture used noon UTC, which
 * is the same calendar day in every zone this product supports — so it could not
 * have failed however wrong the rendering was.
 */
const BOUNDARY_INSTANT = "2026-07-17T02:00:00.000Z";
const SAO_PAULO = "America/Sao_Paulo";
const AUCKLAND = "Pacific/Auckland";

function item(overrides: Partial<InboxItemView> = {}): InboxItemView {
  return {
    entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    title: "Ligar para a Marina",
    originalPreview: "Ligar para a Marina sobre o contrato do Atlas amanhã de manhã.",
    productState: "ready",
    significantAt: BOUNDARY_INSTANT,
    availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" }],
    originalPreserved: true,
    ...overrides,
  };
}

describe("InboxItemRow", () => {
  it("renders the human title, original preview, and a localized product-state label", () => {
    render(<InboxItemRow agentName="Brain" item={item()} locale="pt-BR" timeZone={SAO_PAULO} />);

    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(screen.getByText(/Ligar para a Marina sobre o contrato do Atlas/)).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
  });

  it("never renders the internal product state string as UI text", () => {
    render(<InboxItemRow agentName="Brain" item={item({ productState: "could_not_organize" })} locale="en" timeZone={SAO_PAULO} />);

    expect(screen.queryByText("could_not_organize")).not.toBeInTheDocument();
    expect(screen.getByText("Could not organize")).toBeInTheDocument();
  });

  it("links to the entry's open_entry action href", () => {
    render(<InboxItemRow agentName="Brain" item={item()} locale="pt-BR" timeZone={SAO_PAULO} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6");
  });

  it("surfaces the attention reason as an accessible hint when one is present", () => {
    render(<InboxItemRow agentName="Brain" item={item({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" })} locale="en" timeZone={SAO_PAULO} />);

    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getByText("Resolve the suggestions")).toBeInTheDocument();
  });

  it("`LDC-DAILY-001`: stamps the row in the owner's zone, not the host's", () => {
    /*
     * The defect this row carried past Phase 2M's close, stated as a test. On a
     * server the host is UTC, so the old rendering said 17 July to a São Paulo
     * owner for whom it was still the 16th at 23:00.
     */
    const { unmount } = render(
      <InboxItemRow agentName="Brain" item={item()} locale="pt-BR" timeZone={SAO_PAULO} />,
    );
    expect(screen.getByText(/16 de jul\. de 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/17 de jul\. de 2026/)).not.toBeInTheDocument();
    unmount();

    render(<InboxItemRow agentName="Brain" item={item()} locale="pt-BR" timeZone={AUCKLAND} />);
    expect(screen.getByText(/17 de jul\. de 2026/)).toBeInTheDocument();
  });

  it("`LDC-CONTRACT-002`: the locale changes the words, never the day", () => {
    const { unmount } = render(
      <InboxItemRow agentName="Brain" item={item()} locale="pt-BR" timeZone={SAO_PAULO} />,
    );
    expect(screen.getByText(/16 de jul\. de 2026/)).toBeInTheDocument();
    unmount();

    render(<InboxItemRow agentName="Brain" item={item()} locale="en" timeZone={SAO_PAULO} />);
    // Different words, same day — the property the initiative had to fix before
    // touching seventeen call sites that all passed a locale and no zone.
    expect(screen.getByText(/Jul 16, 2026/)).toBeInTheDocument();
  });
});
