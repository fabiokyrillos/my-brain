import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ReviewSummaryView } from "./review-presentation";
import { ReviewRows } from "./review-rows";

afterEach(cleanup);

const review = (id: string, overrides: Partial<ReviewSummaryView> = {}): ReviewSummaryView => ({
  id,
  title: "Resumo diário",
  periodType: "daily",
  tab: "day",
  periodLabel: "Resumo do dia",
  statusLabel: "Concluída",
  statusTone: "positive",
  periodLabelRange: "16/11/2026 — 16/11/2026",
  periodStart: "2026-11-16",
  periodEnd: "2026-11-16",
  ...overrides,
});

function mount(reviews: readonly ReviewSummaryView[]) {
  return render(
    <ReviewRows baseHref="/pt-BR/app/reviews" className="review-history-list" openLabel="Abrir revisão" reviews={reviews} />,
  );
}

describe("a written review is a row, and the row is the link", () => {
  it("links each review to its own page", () => {
    mount([review("r1")]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/pt-BR/app/reviews/r1");
  });

  it("shows the period, the kind and the state — the three things a row is asked to carry", () => {
    mount([review("r1")]);
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("16/11/2026 — 16/11/2026")).toBeInTheDocument();
    expect(within(row).getByText("Resumo do dia")).toBeInTheDocument();
    expect(within(row).getByText("Concluída")).toBeInTheDocument();
  });

  it("has exactly one interactive element per row", () => {
    // One visible verb per row: the row itself. The full-width "Abrir revisão"
    // button and the badge beside it were two more things to read past.
    const { container } = mount([review("r1"), review("r2", { periodLabelRange: "15/11/2026 — 15/11/2026" })]);
    for (const row of container.querySelectorAll("li")) {
      expect(row.querySelectorAll("a, button, summary, input, select")).toHaveLength(1);
    }
  });

  it("names every link by its period, so two rows are told apart without sight", () => {
    mount([review("r1"), review("r2", { periodLabelRange: "15/11/2026 — 15/11/2026" })]);
    const names = screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"));
    expect(names).toEqual([
      "Abrir revisão: Resumo do dia, 16/11/2026 — 16/11/2026",
      "Abrir revisão: Resumo do dia, 15/11/2026 — 15/11/2026",
    ]);
  });

  it("does not repeat the stored title, which is the review page's own heading", () => {
    mount([review("r1", { title: "Um título que só a página da revisão mostra" })]);
    expect(screen.queryByText("Um título que só a página da revisão mostra")).toBeNull();
    // …and a row has no heading of its own, so the page outline is the page's.
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("carries the state's tone as data, and the word either way", () => {
    mount([review("r1", { statusLabel: "Pode estar desatualizada", statusTone: "warning" })]);
    const status = screen.getByText("Pode estar desatualizada");
    expect(status.getAttribute("data-tone")).toBe("warning");
  });

  it("keeps the list's own class, so each list stays addressable by name", () => {
    const { container } = mount([review("r1")]);
    expect(container.querySelector("ul.review-rows.review-history-list")).not.toBeNull();
  });

  it("renders nothing a summary's words could leak through: the view has no content field", () => {
    const smuggled = { ...review("r1"), content: "PALAVRAS-DA-REVISAO" } as ReviewSummaryView;
    const { container } = mount([smuggled]);
    expect(container.textContent).not.toContain("PALAVRAS-DA-REVISAO");
    expect(container.innerHTML).not.toContain("PALAVRAS-DA-REVISAO");
  });
});
