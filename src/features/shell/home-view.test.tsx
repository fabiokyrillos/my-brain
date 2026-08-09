import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxItemView, NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import type { Locale } from "@/lib/preferences";
import { getWorkCopy } from "@/features/operations/copy";
import { HomeView, type HomeViewModel } from "./home-view";

// The row components report interactions through a Server Action, which reaches
// the `server-only` guard the moment jsdom imports it.
vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
}));

afterEach(cleanup);

const LONG_TITLE =
  "Revisar o contrato de prestação de serviços da Aurora Participações antes da reunião de quinta";

function attentionItem(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "attention-1",
    kind: "review_interpretation",
  sensitivity: "normal",
    entryId: "11111111-1111-4111-8111-111111111111",
    title: LONG_TITLE,
    explanation: "O Brain não teve confiança suficiente para criar as tarefas sozinho.",
    primaryAction: { id: "review_interpretation", href: "/pt-BR/app/inbox/11111111" },
    occurredAt: "2026-07-29T14:32:00.000Z",
    groupKey: "g1",
    ...overrides,
  };
}

function inboxItem(overrides: Partial<InboxItemView> = {}): InboxItemView {
  return {
    entryId: "33333333-3333-4333-8333-333333333333",
    title: "Ligar para o contador",
    originalPreview: "Ligar para o contador sobre o IRPJ.",
    productState: "ready",
    significantAt: "2026-07-28T18:10:00.000Z",
    availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/33333333" }],
    originalPreserved: true,
    ...overrides,
  };
}

function viewModel(overrides: Partial<HomeViewModel> = {}): HomeViewModel {
  return {
    todayLabel: "QUINTA-FEIRA, 30 DE JULHO",
    status: { kind: "attention", count: 2, hasMore: false },
    priorities: [],
    attention: [attentionItem()],
    attentionHasMore: false,
    today: [{
      taskId: "t1",
      title: LONG_TITLE,
      dueLabel: "31 jul.",
      stateLabel: "Não iniciada",
      sensitivity: { kind: "undetermined" as const },
    }],
    todayHasMore: false,
    waitingCount: 2,
    openQuestion: "O retorno da Marina é para esta semana ou para a próxima?",
    recent: [inboxItem()],
    ...overrides,
  };
}

function renderHome(view: HomeViewModel, locale: Locale = "pt-BR") {
  return render(<HomeView agentName="Brain" locale={locale} view={view} capture={<div>captura</div>} />);
}

describe("HomeView", () => {
  it("leads with what needs the user and states the day in one line", () => {
    renderHome(viewModel());

    const sections = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"));
    expect(sections[0]).toBe("Precisa de você");
    expect(screen.getByRole("status")).toHaveTextContent("2 itens precisam de você.");
  });

  it("orders the sections to answer needs-me, today, blocked, open question, recent", () => {
    renderHome(viewModel());

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Precisa de você",
      "Prioridades de hoje",
      "Para hoje",
      "Aguardando outras pessoas",
      "Pergunta em aberto",
      "Encerrar o dia",
      "Registrado recentemente",
    ]);
  });

  it("drops the sections that have nothing to say instead of reserving space", () => {
    // Waiting and the open question are the two that used to render as panels
    // holding a single sentence, or nothing at all, at a 188px floor.
    renderHome(viewModel({ waitingCount: 0, openQuestion: null }));

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Precisa de você",
      "Prioridades de hoje",
      "Para hoje",
      "Encerrar o dia",
      "Registrado recentemente",
    ]);
  });

  it("keeps its shape when everything is empty and says so plainly", () => {
    renderHome(
      viewModel({
        status: { kind: "saved" },
        priorities: [],
        attention: [],
        today: [],
        waitingCount: 0,
        openQuestion: null,
        recent: [],
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Nada pendente. Tudo salvo.");
    expect(screen.getByText("Nada precisa de você agora.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum prazo exige sua atenção hoje.")).toBeInTheDocument();
    expect(screen.getByText("Nada por aqui ainda. Capture algo para começar.")).toBeInTheDocument();
    // Nothing to view, so no link that leads to an empty list.
    expect(screen.queryByRole("link", { name: "Ver tudo" })).not.toBeInTheDocument();
  });

  it("reports an organizing state without claiming anything needs the user", () => {
    renderHome(viewModel({ status: { kind: "organizing", count: 3 }, attention: [] }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "3 registros ainda estão sendo organizados.",
    );
  });

  it("marks a truncated attention count so the number is never read as complete", () => {
    renderHome(
      viewModel({
        status: { kind: "attention", count: 3, hasMore: true },
        attention: [attentionItem(), attentionItem({ key: "a2" }), attentionItem({ key: "a3" })],
        attentionHasMore: true,
      }),
    );

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    expect(within(attention).getByText("3+")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3+ itens precisam de você.");
  });

  it("renders every section heading in English without leaking Portuguese", () => {
    renderHome(viewModel(), "en");

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Needs you",
      "Today's priorities",
      "For today",
      "Waiting on other people",
      "Open question",
      "Close the day",
      "Recently captured",
    ]);
    // The ordinal kickers were hardcoded Portuguese literals, so an English user
    // read "PRECISA DE VOCÊ" on their own Home (UX-18).
    expect(document.body.textContent).not.toMatch(/PRECISA DE VOCÊ|AGORA|CLAREZA|RECENTE/);
    expect(screen.getByRole("status")).toHaveTextContent("2 items need you.");
  });

  it("gives every section a destination when it has content", () => {
    renderHome(viewModel());

    expect(screen.getByRole("link", { name: "Ver tudo" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox?view=needs-you",
    );
    expect(screen.getByRole("link", { name: "Ver todo o trabalho" })).toHaveAttribute(
      "href",
      "/pt-BR/app/work?view=today",
    );
    expect(screen.getByRole("link", { name: "Responder" })).toHaveAttribute(
      "href",
      "/pt-BR/app/questions",
    );
    expect(screen.getByRole("link", { name: "Ver todos os registros" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox",
    );
  });

  it("renders the injected capture form", () => {
    renderHome(viewModel());
    expect(screen.getByText("captura")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- *
 * `2L-PRIVACY-001`/`-007` — Hoje renders task titles, so Hoje asks the same
 * contract Work asks.
 * -------------------------------------------------------------------------- */

describe("HomeView: withheld task content (OD-2L-1 option B)", () => {
  const secret = { kind: "derived", level: "highly_sensitive" } as const;

  it("withholds a protected task's title in the priority section", () => {
    // Before this slice there was nothing to diverge from: `tasks` carried no
    // classification at all. The moment Work began withholding one, a task
    // masked on /app/work and printed in full on /app would be the exact defect
    // the central contract was written to prevent.
    renderHome(viewModel({
      priorities: [
        { taskId: "a", title: "Contrato Aurora", reason: "overdue", dueLabel: "01 ago.", sensitivity: secret },
      ],
    }));

    expect(screen.queryByText("Contrato Aurora")).toBeNull();
    expect(screen.getByText(getWorkCopy("pt-BR").protected.label)).toBeVisible();
  });

  it("withholds the reason and the due label with it", () => {
    // A masked title beside "Atrasada" is a mask that leaks the interesting
    // half: both are facts about a task the owner asked to be protected.
    renderHome(viewModel({
      priorities: [
        { taskId: "a", title: "Contrato Aurora", reason: "overdue", dueLabel: "01 ago.", sensitivity: secret },
      ],
    }));

    expect(screen.queryByText("Atrasada")).toBeNull();
    expect(screen.queryByText("01 ago.")).toBeNull();
  });

  it("keeps the masked row, so the count and the ordering stay truthful", () => {
    renderHome(viewModel({
      priorities: [
        { taskId: "a", title: "Contrato Aurora", reason: "overdue", dueLabel: null, sensitivity: secret },
        { taskId: "b", title: "Ligar para a Marina", reason: "due_today", dueLabel: null, sensitivity: { kind: "undetermined" as const } },
      ],
    }));

    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Ligar para a Marina")).toBeVisible();
  });

  it("withholds a protected task in the today list too", () => {
    renderHome(viewModel({
      priorities: [],
      today: [{ taskId: "t9", title: "Segredo", dueLabel: null, stateLabel: "Não iniciada", sensitivity: secret }],
    }));

    expect(screen.queryByText("Segredo")).toBeNull();
    expect(screen.getByText(getWorkCopy("pt-BR").protected.label)).toBeVisible();
  });

  it("leaves a manual task untouched", () => {
    renderHome(viewModel({
      priorities: [],
      today: [{
        taskId: "t9",
        title: "Uma tarefa qualquer",
        dueLabel: null,
        stateLabel: "Não iniciada",
        sensitivity: { kind: "undetermined" as const },
      }],
    }));

    expect(screen.getByText("Uma tarefa qualquer")).toBeVisible();
  });
});
