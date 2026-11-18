import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxItemView, NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import type { HomeAgendaItem } from "@/features/daily-cycle/home-agenda";
import type { Locale } from "@/lib/preferences";
import { getWorkCopy } from "@/features/operations/copy";
import { noticeHandlerSpies } from "@/test/notification-verb-fixtures";
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
    isRecordOnly: false,
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
    greeting: { partOfDay: "afternoon", name: null },
    status: { kind: "attention", count: 2, hasMore: false },
    priorities: [],
    attention: [attentionItem()],
    attentionHasMore: false,
    notices: [],
    noticesHaveMore: false,
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
  return render(<HomeView agentName="Brain" locale={locale} view={view} capture={<div>captura</div>} noticeHandlers={noticeHandlerSpies().handlers} />);
}

describe("HomeView", () => {
  /**
   * Life Brain B.7 replaces A.1's assertion with its inverse, deliberately.
   *
   * A.1 put "Perguntar ao {agente}" under the composer because Conversar sat
   * behind "Mais". A.2 gave Conversar its own place in the mobile bar, and the
   * owner then read the result back: *"ele me mostra o chat e embaixo ele me
   * mostra para perguntar ao Michael, que é a mesma coisa… não faz muito sentido
   * ter dois campos separados."*
   *
   * So the test does not just disappear — it keeps asserting the layout rule it
   * was written for (capture is the first thing on the page, UX-07) and adds the
   * absence, because a door that comes back should fail here rather than be
   * noticed in a recording three weeks later.
   */
  it("opens with the composer and nothing between it and the day (Life Brain B.7)", () => {
    const { container } = renderHome(viewModel());

    expect(screen.queryByRole("link", { name: /Perguntar ao/ })).toBeNull();
    expect(screen.queryByText(/Quando fui ao médico\?/)).toBeNull();
    expect(container.querySelector(".today-ask")).toBeNull();

    const order = [...container.querySelectorAll(".today-capture, .home-section")].map((node) => node.className);
    expect(order[0]).toBe("today-capture");
    expect(order[1]).not.toContain("today-ask");
  });

  /**
   * Life Brain A.2 (LB-OD-1). Registros and Trabalho left the mobile bar, so
   * Hoje must reach both on a day that has nothing to show — every other link
   * to them on this page is gated on a count. The calendar left the strip for
   * the opposite reason: it is a bar slot now.
   */
  it("reaches Registros and Trabalho from the destination strip on an empty day", () => {
    renderHome(viewModel({
      status: { kind: "saved" },
      attention: [], notices: [], today: [], priorities: [], organizing: [], agenda: [],
      waitingCount: 0, openQuestion: null,
    }));

    const strip = screen.getByRole("navigation", { name: "Ir para" });
    expect(within(strip).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Registros", "/pt-BR/app/inbox"],
      ["Tarefas", "/pt-BR/app/work"],
      ["Lembretes", "/pt-BR/app/reminders"],
      ["Revisões", "/pt-BR/app/reviews"],
    ]);
  });

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
      "Aguardando retorno",
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
   * only the absence of work.
   *
   * The **view** renders it correctly and this proves that. What no longer
   * happens is the dashboard computing a number to put here: the only timestamp
   * it had is the AI-extracted event date, so counting it produced two false
   * sentences. `home-dashboard.tsx` has the account. The link is asserted to
   * carry its view, because the default view is the queue of things that were
   * *not* organized — the opposite of what this label promises.
   */
  it("reports what was organized today inside the quiet attention state", () => {
    renderHome(viewModel({ attention: [], conflicts: { items: [], bounded: false, limit: 0 }, organizedTodayCount: 7 }));

    expect(screen.getByText("7 registros foram organizados hoje sem ambiguidade.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver o que foi organizado" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox?view=record-only",
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
  /*
    Editorial calmo (owner review of 16 November 2026). The first item used to
    expand into a proposal card, and four items filled nearly three phone
    screens. Every item is now one row and the row is the link to the decision.
  */
  it("renders every attention item as one row that links to its decision", () => {
    renderHome(
      viewModel({
        attention: [
          attentionItem({ key: "a1", title: "Preciso falar com o João sobre o orçamento." }),
          attentionItem({ key: "a2", title: "Segundo item" }),
        ],
      }),
    );

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    const first = within(attention).getByText("Preciso falar com o João sobre o orçamento.").closest("a");
    const second = within(attention).getByText("Segundo item").closest("a");
    expect(first).toHaveClass("needs-attention-row");
    expect(second).toHaveClass("needs-attention-row");
    // No expanded proposal card is left on this surface.
    expect(within(attention).queryByText(/o Brain propõe/i)).not.toBeInTheDocument();
    expect(attention.querySelector(".attention-lead")).toBeNull();
  });

  it("puts a section's link in its heading, before the rows", () => {
    renderHome(viewModel({ attention: [attentionItem({ key: "a1", title: "Primeiro item" })] }));

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    const link = within(attention).getByRole("link", { name: "Ver tudo" });
    const row = within(attention).getByText("Primeiro item");
    expect(link.closest("header")).not.toBeNull();
    // Focus order equals visual order: the link is drawn above the list.
    expect(link.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("greets in one line, without the question that used to follow", () => {
    renderHome(viewModel({}));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Boa tarde\.$/);
  });

  /*
    The greeting used to be the literal "Boa tarde." — at 23:47 in the owner's
    recording. The view has no clock: it is handed the part of the day and the
    name, and these assert it says exactly what it was handed, in both locales.
  */
  it.each([
    ["pt-BR", "morning", "Fábio", "Bom dia, Fábio."],
    ["pt-BR", "afternoon", "Fábio", "Boa tarde, Fábio."],
    ["pt-BR", "evening", "Fábio", "Boa noite, Fábio."],
    ["pt-BR", "evening", null, "Boa noite."],
    ["pt-BR", null, "Fábio", "Olá, Fábio."],
    ["pt-BR", null, null, "Olá."],
    ["en", "morning", "Fábio", "Good morning, Fábio."],
    ["en", "afternoon", null, "Good afternoon."],
    ["en", "evening", "Fábio", "Good evening, Fábio."],
    ["en", null, null, "Hello."],
  ] as const)("greets in %s for %s / %s", (locale, partOfDay, name, expected) => {
    renderHome(viewModel({ greeting: { partOfDay, name } }), locale);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(expected);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the owner's name as text, never as markup", () => {
    renderHome(viewModel({ greeting: { partOfDay: "morning", name: "<img src=x onerror=alert(1)>" } }));

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.querySelector("img")).toBeNull();
    expect(heading.textContent).toBe("Bom dia, <img src=x onerror=alert(1)>.");
  });

  it("renders the agenda in the owner's zone, not the runner's", () => {
    renderHome(viewModel({ agenda: [agendaItem({ isToday: true, at: "2026-07-30T18:00:00.000Z" })] }));

    const agenda = screen.getByRole("region", { name: "Adiante" });
    // 18:00Z is 15:00 in America/Sao_Paulo. A row formatted in UTC would say 18:00.
    expect(within(agenda).getByText("15:00")).toBeInTheDocument();
    expect(within(agenda).getByText("Orçamento com o João")).toBeInTheDocument();
  });

  /*
    `agendaHasMore` was computed by the projection, threaded through the view
    model and read by nothing — the independent review's finding. A panel showing
    five of nineteen commitments was indistinguishable from a panel showing all
    five, and the calendar link read as an alternative rather than as the rest.

    Two assertions, because one of them is the control: a bounded panel says so,
    and an unbounded one must not — a `+` that is always printed would satisfy
    the first test while telling the same lie in the other direction.
  */
  it("marks a truncated agenda so five of nineteen is not read as five", () => {
    renderHome(viewModel({ agenda: [agendaItem()], agendaHasMore: true }));

    const agenda = screen.getByRole("region", { name: "Adiante" });
    expect(within(agenda).getByText("1+")).toBeInTheDocument();
  });

  it("does not mark an agenda that holds everything the window found", () => {
    renderHome(viewModel({ agenda: [agendaItem()], agendaHasMore: false }));

    const agenda = screen.getByRole("region", { name: "Adiante" });
    expect(within(agenda).getByText("1")).toBeInTheDocument();
    expect(within(agenda).queryByText("1+")).not.toBeInTheDocument();
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
      "Waiting to hear back",
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
    expect(screen.getByRole("link", { name: "Ver todas as tarefas" })).toHaveAttribute(
      "href",
      "/pt-BR/app/work?view=today",
    );
    expect(screen.getByRole("link", { name: "Responder" })).toHaveAttribute(
      "href",
      "/pt-BR/app/questions",
    );
    // Carries its view: a bare link would land on needs-you, which is not the
    // list of what is being organized.
    expect(screen.getByRole("link", { name: "Ver todos os registros" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox?view=organizing",
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

  it("shows a highly sensitive task's title in the priority section", () => {
    // Life Brain E.8 (ADR-178): nothing the owner said is withheld from them;
    // Hoje and Work still ask one contract, which now shows every level.
    renderHome(viewModel({
      priorities: [
        { taskId: "a", title: "Contrato Aurora", reason: "overdue", dueLabel: "01 ago.", sensitivity: secret },
      ],
    }));

    expect(screen.getByText("Contrato Aurora")).toBeVisible();
    expect(screen.queryByText(getWorkCopy("pt-BR").protected.label)).toBeNull();
  });

  it("shows the reason and the due label with it", () => {
    // ADR-178.
    renderHome(viewModel({
      priorities: [
        { taskId: "a", title: "Contrato Aurora", reason: "overdue", dueLabel: "01 ago.", sensitivity: secret },
      ],
    }));

    expect(screen.getByText("Atrasada")).toBeVisible();
    expect(screen.getByText("01 ago.")).toBeVisible();
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

  it("shows a highly sensitive task in the today list too", () => {
    // ADR-178.
    renderHome(viewModel({
      priorities: [],
      today: [{ taskId: "t9", title: "Segredo", dueLabel: null, stateLabel: "Não iniciada", sensitivity: secret }],
    }));

    expect(screen.getByText("Segredo")).toBeVisible();
    expect(screen.queryByText(getWorkCopy("pt-BR").protected.label)).toBeNull();
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
