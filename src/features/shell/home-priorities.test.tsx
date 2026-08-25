/**
 * `2J-HOJE-003` … `2J-HOJE-006` and `2J-PRIVACY-001`/`004`/`005`, as rendered.
 *
 * `today-priorities.test.ts` proves the selection rule. This file proves the
 * surface obeys it — which is a different claim, and the one that broke in
 * Phase 2I three times: a correct projection rendered by a component that
 * ignores it looks identical to a correct product until someone opens it.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import { noticeHandlerSpies } from "@/test/notification-verb-fixtures";
import { HomeView, type HomeViewModel } from "./home-view";

// The row components report interactions through a Server Action, which reaches
// the `server-only` guard the moment jsdom imports it.
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
}));

afterEach(cleanup);

function attentionItem(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "entry-1:confirm_existing_candidates",
    kind: "confirm_existing_candidates",
    entryId: "entry-1",
    title: "Confirmar proposta do Atlas",
    explanation: "Há tarefas sugeridas prontas para sua confirmação.",
    primaryAction: { id: "confirm_existing_candidates", href: "/pt-BR/app/inbox/entry-1" },
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

describe("2J-HOJE-004/006: the priorities section shows what qualifies, and no more", () => {
  it("renders each priority with its reason", () => {
    renderHome({
      priorities: [
        { taskId: "a", title: "Enviar o contrato", reason: "overdue", dueLabel: "01 ago." , sensitivity: { kind: "undetermined" as const }},
        { taskId: "b", title: "Ligar para a Marina", reason: "due_today", dueLabel: "08 ago." , sensitivity: { kind: "undetermined" as const }},
      ],
    });
    expect(screen.getByText("Enviar o contrato")).toBeInTheDocument();
    expect(screen.getByText("Atrasada")).toBeInTheDocument();
    expect(screen.getByText("Vence hoje")).toBeInTheDocument();
  });

  it("says so when nothing qualifies, instead of borrowing from the list below", () => {
    renderHome({
      priorities: [],
      today: [{ taskId: "t1", title: "Uma tarefa qualquer", dueLabel: null, stateLabel: "Não iniciada", sensitivity: { kind: "undetermined" as const } }],
    });
    expect(screen.getByText("Nada exige prioridade hoje.")).toBeInTheDocument();
    // The task below is still rendered -- the point is that it did NOT get
    // promoted into the priority slot to avoid an empty section.
    expect(screen.getByText("Uma tarefa qualquer")).toBeInTheDocument();
  });

  it("prints the ordering rule, so the order is explainable without the code", () => {
    renderHome({
      priorities: [{ taskId: "a", title: "Enviar o contrato", reason: "overdue", dueLabel: null , sensitivity: { kind: "undetermined" as const }}],
    });
    expect(
      screen.getByText(/Atrasadas primeiro, depois as de hoje/),
    ).toBeInTheDocument();
  });

  /**
   * The Papel e Console cockpit merges the two task sections into one — "Hoje e
   * atrasado" — with the promoted rows as its first group. The heading and the
   * cap it does not promise both survive that merge, which is what this asserts.
   *
   * Rendered with a task rather than on an entirely empty day: an empty day
   * renders the section's own quiet state and no group at all, and an absent
   * heading cannot promise three either.
   */
  it("does not promise three in its heading", () => {
    renderHome({
      priorities: [{ taskId: "a", title: "Enviar o contrato", reason: "overdue", dueLabel: null, sensitivity: { kind: "undetermined" as const } }],
    });
    expect(screen.getByText("Prioridades de hoje")).toBeInTheDocument();
    expect(screen.getByText(/No máximo três/)).toBeInTheDocument();
  });

  it("keeps the day's two groups under one heading", () => {
    renderHome({
      priorities: [{ taskId: "a", title: "Enviar o contrato", reason: "overdue", dueLabel: null, sensitivity: { kind: "undetermined" as const } }],
      today: [{ taskId: "t1", title: "Uma tarefa qualquer", dueLabel: null, stateLabel: "Não iniciada", sensitivity: { kind: "undetermined" as const } }],
    });

    const section = screen.getByRole("region", { name: "Hoje e atrasado" });
    expect(within(section).getByText("Prioridades de hoje")).toBeInTheDocument();
    expect(within(section).getByText("Para hoje")).toBeInTheDocument();
  });
});

describe("2J-HOJE-003: overdue and due today are told apart in the markup", () => {
  it("carries a distinct reason marker for each", () => {
    const { container } = renderHome({
      priorities: [
        { taskId: "a", title: "Atrasada", reason: "overdue", dueLabel: null , sensitivity: { kind: "undetermined" as const }},
        { taskId: "b", title: "Hoje", reason: "due_today", dueLabel: null , sensitivity: { kind: "undetermined" as const }},
      ],
    });
    expect(container.querySelector('[data-reason="overdue"]')).not.toBeNull();
    expect(container.querySelector('[data-reason="due_today"]')).not.toBeNull();
  });
});

describe("2J-PRIVACY-001/004/005: Hoje masks highly_sensitive attention in place", () => {
  it("renders the entry preview for normal and private", () => {
    for (const level of ["normal", "private"] as const) {
      cleanup();
      renderHome({ attention: [attentionItem({ sensitivity: level })] });
      expect(screen.getByText("Confirmar proposta do Atlas"), level).toBeInTheDocument();
    }
  });

  it("withholds the preview for highly_sensitive", () => {
    renderHome({ attention: [attentionItem({ sensitivity: "highly_sensitive" })] });
    expect(screen.queryByText("Confirmar proposta do Atlas")).toBeNull();
    expect(screen.getByText("Conteúdo muito sensível, oculto")).toBeInTheDocument();
  });

  it("keeps the count truthful, because the row is masked rather than dropped", () => {
    // `2J-PRIVACY-004`. If the sensitive item were filtered out, the header
    // count would read 1 and the user would have no way to know a second item
    // existed -- and comparing two renders would reveal it anyway.
    const { container } = renderHome({
      attention: [
        attentionItem({ key: "k1", sensitivity: "normal" }),
        attentionItem({ key: "k2", entryId: "entry-2", sensitivity: "highly_sensitive" }),
      ],
    });
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-masked="true"]')).toHaveLength(1);
  });

  it("does not announce how many were hidden", () => {
    renderHome({
      attention: [attentionItem({ sensitivity: "highly_sensitive" })],
    });
    // No "1 hidden", no "1 oculto(s)" -- a count of what was withheld is an
    // existence oracle, which OD-2J-1 forbids explicitly.
    expect(screen.queryByText(/\d+\s+(oculto|hidden|escondid)/i)).toBeNull();
  });
});
