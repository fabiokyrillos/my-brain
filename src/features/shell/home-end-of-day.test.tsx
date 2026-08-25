/**
 * `2J-DAY-002` … `2J-DAY-006` — closing the day from Hoje.
 *
 * The load-bearing assertions here are the ones about what does **not** happen.
 * `2J-DAY-004` forbids any automatic mutation at end of day, and the way that
 * requirement dies is not with a bang — it dies when somebody adds a helpful
 * "carry these forward" button that quietly writes.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import { noticeHandlerSpies } from "@/test/notification-verb-fixtures";
import { HomeView, type HomeViewModel } from "./home-view";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
}));

afterEach(cleanup);

function attentionItem(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "entry-1:review_interpretation",
    kind: "review_interpretation",
    entryId: "entry-1",
    title: "Revisar interpretação",
    explanation: "Explicação.",
    primaryAction: { id: "review_interpretation", href: "/pt-BR/app/inbox/entry-1" },
    occurredAt: "2026-08-08T12:00:00.000Z",
    groupKey: "entry-1",
    sensitivity: "normal",
    ...overrides,
  };
}

function viewModel(overrides: Partial<HomeViewModel> = {}): HomeViewModel {
  return {
    timeZone: "America/Sao_Paulo",
    todayLabel: "SÁBADO, 8 DE AGOSTO",
    status: { kind: "saved" },
    priorities: [],
    attention: [],
    attentionHasMore: false,
    notices: [],
    noticesHaveMore: false,
    conflicts: { items: [], bounded: false, limit: 0 },
    today: [],
    todayHasMore: false,
    waitingCount: 0,
    openQuestion: null,
    organizing: [],
    organizedTodayCount: 0,
    agenda: [],
    agendaHasMore: false,
    ...overrides,
  };
}

function renderHome(overrides: Partial<HomeViewModel> = {}) {
  return render(
    <HomeView locale="pt-BR" view={viewModel(overrides)} capture={<div />} agentName="Brain" noticeHandlers={noticeHandlerSpies().handlers} />,
  );
}

function endOfDaySection() {
  return screen.getByRole("region", { name: "Encerrar o dia" });
}

describe("2J-DAY-002: the review is reachable from Hoje", () => {
  it("links to the existing review surface", () => {
    renderHome();
    const link = within(endOfDaySection()).getByRole("link", { name: "Abrir revisões" });
    expect(link).toHaveAttribute("href", "/pt-BR/app/reviews");
  });

  it("does not build a second review system", () => {
    // `2J-DAY-001`/`006`. No period buttons, no generate control, no summary
    // rendered here -- Hoje is a door to the review domain, not a copy of it.
    renderHome();
    const section = endOfDaySection();
    expect(within(section).queryByRole("button")).toBeNull();
    for (const label of [/semana/i, /mensal/i, /gerar/i]) {
      expect(within(section).queryByText(label)).toBeNull();
    }
  });
});

describe("2J-DAY-003: what is still open is summarized from what is already loaded", () => {
  it("counts priorities, attention and waiting", () => {
    renderHome({
      priorities: [{ taskId: "a", title: "Enviar", reason: "overdue", dueLabel: null , sensitivity: { kind: "undetermined" as const }}],
      attention: [attentionItem()],
      waitingCount: 2,
    });
    const section = endOfDaySection();
    expect(within(section).getByText(/Prioridades de hoje: 1/)).toBeInTheDocument();
    expect(within(section).getByText(/Precisa de você: 1/)).toBeInTheDocument();
    expect(within(section).getByText(/Aguardando outras pessoas: 2/)).toBeInTheDocument();
  });

  it("says the day is clear when nothing is open", () => {
    renderHome();
    expect(within(endOfDaySection()).getByText("Nada ficou em aberto hoje.")).toBeInTheDocument();
  });

  it("omits a line for a category with nothing in it, rather than showing a zero", () => {
    renderHome({ waitingCount: 3 });
    const section = endOfDaySection();
    expect(within(section).getByText(/Aguardando outras pessoas: 3/)).toBeInTheDocument();
    expect(within(section).queryByText(/Precisa de você: 0/)).toBeNull();
    expect(within(section).queryByText(/Prioridades de hoje: 0/)).toBeNull();
  });

  it("reflects that more attention exists without pretending to know how much", () => {
    renderHome({ attention: [attentionItem()], attentionHasMore: true });
    expect(within(endOfDaySection()).getByText(/Precisa de você: 1\+/)).toBeInTheDocument();
  });
});

describe("2J-DAY-004: ending the day changes nothing by itself", () => {
  it("offers no control that could mutate anything", () => {
    // A reading, not a transaction. No "close", no "carry forward", no
    // "complete all" -- anything that follows from the review goes through the
    // write path that already owns it, with its own confirmation.
    renderHome({
      priorities: [{ taskId: "a", title: "Enviar", reason: "overdue", dueLabel: null , sensitivity: { kind: "undetermined" as const }}],
      attention: [attentionItem()],
      waitingCount: 2,
    });
    const section = endOfDaySection();
    expect(within(section).queryByRole("button")).toBeNull();
    // Exactly one interactive element, and it is a navigation link.
    expect(within(section).getAllByRole("link")).toHaveLength(1);
  });

  it("contains no form, so there is nothing to submit from here", () => {
    const { container } = renderHome({ waitingCount: 1 });
    const section = container.querySelector('[aria-label="Encerrar o dia"]');
    expect(section?.querySelector("form")).toBeNull();
  });
});
