import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackedTechnicalDetails } from "@/features/product-analytics/interaction-events";
import type { InterpretationTechnicalDetailsView } from "./contracts";
import type { EntryReviewHistoryItem } from "./review-projection";
import { TechnicalDetails } from "./technical-details";

const OWNER_TIME_ZONE = "America/Sao_Paulo";

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
      <TechnicalDetails timeZone={OWNER_TIME_ZONE} entryId="entry-1" technical={null} history={[]} hasTechnicalDetails={false} locale="pt-BR" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the extracted concepts, dates, entity links, and mentions when structured content is provided", () => {
    render(
      <TechnicalDetails timeZone={OWNER_TIME_ZONE}
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
    render(<TechnicalDetails timeZone={OWNER_TIME_ZONE} entryId="entry-1" technical={technicalView()} history={[historyItem()]} hasTechnicalDetails locale="pt-BR" />);
    const summary = screen.getByText("Ver detalhes técnicos");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(TrackedTechnicalDetails).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "entry-1", locale: "pt-BR" }),
      undefined,
    );
  });

  it("degrades gracefully when technical details failed to load but the entry has a current interpretation", () => {
    render(<TechnicalDetails timeZone={OWNER_TIME_ZONE} entryId="entry-1" technical={null} history={[historyItem()]} hasTechnicalDetails locale="pt-BR" />);
    expect(screen.getByText(/Não foi possível carregar os detalhes técnicos/)).toBeInTheDocument();
    expect(screen.getByText("v1 · Interpretação inicial")).toBeInTheDocument();
  });

  it("renders trust scores and policies for each interpreted element", () => {
    render(<TechnicalDetails timeZone={OWNER_TIME_ZONE} entryId="entry-1" technical={technicalView()} history={[historyItem()]} hasTechnicalDetails locale="pt-BR" />);
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("Aplicação automática")).toBeInTheDocument();
  });

  it("renders the immutable revision timeline", () => {
    render(
      <TechnicalDetails timeZone={OWNER_TIME_ZONE}
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
    render(<TechnicalDetails timeZone={OWNER_TIME_ZONE} entryId="entry-1" technical={technicalView()} history={[historyItem()]} hasTechnicalDetails locale="en" />);
    expect(screen.getByText("View technical details")).toBeInTheDocument();
    expect(screen.getByText("Auto-apply")).toBeInTheDocument();
  });
});

/**
 * `Histórico imutável` — the layout contract, asserted where CI can see it.
 *
 * The owner reported the interpretation summary wrapping "praticamente uma
 * palavra por linha". The cause: `.revision-timeline li` declared
 * `24px minmax(0,1fr) auto`, reserving the first track for the `History` icon —
 * but that icon is `position:absolute`, so it is **not** a grid item, consumes
 * no track, and the summary block auto-placed into the 24px column meant for it.
 * The `max-width:600px` override repeated the mistake with a 20px track.
 *
 * The geometry is measured with a real layout engine in
 * `e2e/layout-contracts.spec.ts`, which is where a defect like this can actually
 * be seen — jsdom implements no grid algorithm, so every assertion below is
 * about the **declarations**, not the result. They are here because that
 * Playwright file does not run in CI (`.github/workflows/ci.yml` selects five
 * specs), and a fix guarded only by a lane nobody runs is a fix with no guard.
 */
describe("the revision timeline's grid contract", () => {
  const stylesheet = () =>
    readFileSync(join(__dirname, "..", "..", "app", "operations.css"), "utf8").replace(/\r\n/g, "\n");

  /** The declarations of one selector, from the base cascade or a named block. */
  function ruleFor(css: string, selector: string, from = 0): string {
    const at = css.indexOf(`${selector}{`, from);
    expect(at, `${selector} has no rule in operations.css`).toBeGreaterThan(-1);
    return css.slice(at + selector.length + 1, css.indexOf("}", at));
  }

  it("gives the summary block the main column explicitly", () => {
    // Explicitly, because auto-placement is what put it in the icon track.
    const rule = ruleFor(stylesheet(), ".revision-timeline .revision-entry");
    expect(rule, "the summary block does not claim a column").toContain("grid-column:1");
    // Without this a long unbreakable word sets the item's floor at min-content
    // and the column stops being able to shrink at all.
    expect(rule, "the summary block cannot shrink below its content").toContain("min-width:0");
  });

  it("reserves no track for the absolutely positioned icon", () => {
    const css = stylesheet();
    expect(ruleFor(css, ".revision-timeline li>svg"), "the icon is in flow again")
      .toContain("position:absolute");
    const row = ruleFor(css, ".revision-timeline li");
    expect(row, "the row lost its grid").toContain("grid-template-columns:minmax(0,1fr)");
    expect(row, "a fixed leading track was reserved for something out of flow")
      .not.toMatch(/grid-template-columns:\s*\d/);
  });

  it("stacks the date under the summary by default and moves it to the final column only when the container fits both", () => {
    const css = stylesheet();
    // Stacked is the base, so a browser with no container-query support — and
    // print, and any narrow embedding — gets the readable layout.
    expect(ruleFor(css, ".revision-timeline time"), "the date left the main column")
      .toContain("grid-column:1");
    expect(ruleFor(css, ".revision-timeline"), "the timeline declares no query container")
      .toMatch(/container:\s*revision-timeline\/inline-size/);

    const query = css.indexOf("@container revision-timeline (min-width:460px)");
    expect(query, "the two-column state is gone").toBeGreaterThan(-1);
    expect(ruleFor(css, ".revision-timeline li", query)).toContain("grid-template-columns:minmax(0,1fr) auto");
    const wideDate = ruleFor(css, ".revision-timeline time", query);
    expect(wideDate, "the date is not the final column when the row is wide").toContain("grid-column:2");
    // `nowrap` belongs to the two-column state only: stacked, a long timestamp
    // overflowed the 188px column and `.technical-details{overflow:hidden}`
    // truncated it with no ellipsis.
    expect(wideDate).toContain("white-space:nowrap");
  });

  it("no longer switches this layout on the viewport", () => {
    // The container is 268px wide from 1080px up and full width below it, so a
    // `max-width` query was widest exactly where the row was narrowest.
    const css = stylesheet();
    const mobile = css.slice(css.indexOf("@media(max-width:600px){.entry-status"));
    const block = mobile.slice(0, mobile.indexOf("\n"));
    expect(block, "a viewport rule still places the timeline").not.toContain(".revision-timeline");
  });

  it("emits the class those rules select", () => {
    const { container } = render(
      <TechnicalDetails timeZone={OWNER_TIME_ZONE}
        entryId="entry-1"
        technical={technicalView()}
        history={[historyItem(), historyItem({ interpretationId: "interp-2", version: 2, origin: "user_corrected", isCurrent: false })]}
        hasTechnicalDetails
        locale="pt-BR"
      />,
    );
    const rows = [...container.querySelectorAll(".revision-timeline li")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // One summary block per row, and it is the element the stylesheet places.
      expect(row.querySelectorAll(":scope > .revision-entry")).toHaveLength(1);
      expect(row.querySelector(":scope > .revision-entry p")?.textContent)
        .toBe("Ligar para a Marina sobre o contrato do Atlas");
      expect(row.querySelectorAll(":scope > time")).toHaveLength(1);
    }
  });
});
