import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxItemView, NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import type { HomeAgendaItem } from "@/features/daily-cycle/home-agenda";
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

function agendaItem(overrides: Partial<HomeAgendaItem> = {}): HomeAgendaItem {
  return {
    key: "deadline:t9",
    lane: "deadline",
    commitment: "committed",
    at: "2026-07-30T18:00:00.000Z",
    date: "2026-07-30",
    isToday: true,
    title: "Orçamento com o João",
    sensitivity: { kind: "undetermined" as const },
    href: "/pt-BR/app/work/t9",
    ...overrides,
  };
}

function viewModel(overrides: Partial<HomeViewModel> = {}): HomeViewModel {
  return {
    timeZone: "America/Sao_Paulo",
    todayLabel: "QUINTA-FEIRA, 30 DE JULHO",
    status: { kind: "attention", count: 2, hasMore: false },
    priorities: [],
    attention: [attentionItem()],
    attentionHasMore: false,
    conflicts: { items: [], bounded: false, limit: 0 },
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
    organizing: [inboxItem({ productState: "organizing" })],
    organizedTodayCount: 0,
    agenda: [agendaItem()],
    agendaHasMore: false,
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

  /**
   * The cockpit's fixed reading order (`02-arquitetura-e-rotas.md`): captura →
   * precisa de você → hoje/atrasado → adiante → sendo organizado → fechar o dia.
   *
   * Asserted as DOM order rather than as visual order on purpose. Wide viewports
   * split this list into two columns by grid placement, so the DOM order **is**
   * the focus order in both layouts — which is what `07-acessibilidade.md`
   * requires and what a CSS `order` would have quietly broken.
   */
  it("orders the sections into the handoff's fixed daily order", () => {
    renderHome(viewModel());

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Precisa de você",
      "Hoje e atrasado",
      "Aguardando outras pessoas",
      "Pergunta em aberto",
      "Adiante",
      "Sendo organizado",
      "Encerrar o dia",
    ]);
  });

  it("drops the sections that have nothing to say instead of reserving space", () => {
    // Waiting and the open question are the two that used to render as panels
    // holding a single sentence, or nothing at all, at a 188px floor. Adiante and
    // Sendo organizado join them: *painéis vazios não renderizam*.
    renderHome(viewModel({ waitingCount: 0, openQuestion: null, agenda: [], organizing: [] }));

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Precisa de você",
      "Hoje e atrasado",
      "Encerrar o dia",
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
        organizing: [],
        agenda: [],
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Nada pendente. Tudo salvo.");
    expect(screen.getByText("Nada precisa de você agora.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum prazo exige sua atenção hoje.")).toBeInTheDocument();
    // Nothing to view, so no link that leads to an empty list.
    expect(screen.queryByRole("link", { name: "Ver tudo" })).not.toBeInTheDocument();
  });

  /**
   * `04-estados.md`, Hoje **V**: the quiet state owes an account of the day, not
   * only the absence of work. Without it "nada precisa de você" reads as
   * "nothing happened".
   */
  it("reports what was organized today inside the quiet attention state", () => {
    renderHome(viewModel({ attention: [], conflicts: { items: [], bounded: false, limit: 0 }, organizedTodayCount: 7 }));

    expect(screen.getByText("7 registros foram organizados hoje sem ambiguidade.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver o que foi organizado" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox",
    );
  });

  it("says nothing about the day's account when there is nothing to report", () => {
    renderHome(viewModel({ attention: [], conflicts: { items: [], bounded: false, limit: 0 }, organizedTodayCount: 0 }));

    // A zero would turn reassurance into "nothing worked".
    expect(screen.queryByRole("link", { name: "Ver o que foi organizado" })).not.toBeInTheDocument();
  });

  /**
   * The lead expands and the rest collapse — mockup 03, frame 01.
   *
   * The proposal is legible before the record is opened, which is what the
   * collapsed row could not do. The decision itself stays on the record
   * (`06-interacoes.md` §4/§5), so this asserts the card renders the proposal and
   * routes there, not that it writes.
   */
  it("expands the first attention item and collapses the rest", () => {
    renderHome(
      viewModel({
        attention: [
          attentionItem({ key: "a1", title: "Preciso falar com o João sobre o orçamento." }),
          attentionItem({ key: "a2", title: "Segundo item" }),
        ],
      }),
    );

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    // The lead carries the owner's own words and the proposal's own heading.
    expect(within(attention).getByText("Preciso falar com o João sobre o orçamento.")).toBeInTheDocument();
    expect(within(attention).getByText("Revise a interpretação")).toBeInTheDocument();
    // Nothing has been created, and the card says so.
    expect(within(attention).getByText("Nada foi criado ainda.")).toBeInTheDocument();
    // The second is a row, not a second card: it has no proposal eyebrow.
    expect(within(attention).getAllByText(/o Brain propõe/i)).toHaveLength(1);
  });

  it("renders the agenda in the owner's zone, not the runner's", () => {
    renderHome(viewModel({ agenda: [agendaItem({ isToday: true, at: "2026-07-30T18:00:00.000Z" })] }));

    const agenda = screen.getByRole("region", { name: "Adiante" });
    // 18:00Z is 15:00 in America/Sao_Paulo. A row formatted in UTC would say 18:00.
    expect(within(agenda).getByText("15:00")).toBeInTheDocument();
    expect(within(agenda).getByText("Orçamento com o João")).toBeInTheDocument();
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
      "Today and overdue",
      "Waiting on other people",
      "Open question",
      "Ahead",
      "Being organized",
      "Close the day",
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
