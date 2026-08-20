import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth/require-user";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { loadHomeSupplementalProjection } from "@/features/daily-cycle/home-projection";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import type { InboxItemView, NeedsAttentionItemView, WorkItemView } from "@/features/daily-cycle/contracts";
import { HomeDashboard } from "./home-dashboard";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/daily-cycle/inbox-projection", () => ({ loadInboxProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/attention-projection", () => ({ loadAttentionProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/work-projection", () => ({ loadWorkProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/home-projection", () => ({ loadHomeSupplementalProjection: vi.fn() }));
vi.mock("@/features/capture/actions", () => ({ captureEntry: vi.fn() }));
vi.mock("@/features/product-analytics/interaction-events", () => ({
  NeedsAttentionViewed: vi.fn(() => <span data-testid="needs-attention-view-marker" />),
  recordNeedsAttentionItemOpened: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(options: {
  items?: readonly InboxItemView[];
  workItems?: readonly WorkItemView[];
  waitingCount?: number;
  openQuestionPreview?: string | null;
  attentionItems?: readonly NeedsAttentionItemView[];
  attentionHasNext?: boolean;
} = {}) {
  const {
    items = [],
    workItems = [],
    waitingCount = 0,
    openQuestionPreview = null,
    attentionItems = [],
    attentionHasNext = false,
  } = options;

  const supabase = { from: vi.fn() };
  vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
  vi.mocked(loadInboxProjection).mockResolvedValue({ items, hasNext: false });
  vi.mocked(loadAttentionProjection).mockResolvedValue({ items: attentionItems, hasNext: attentionHasNext, nextCursor: null });
  vi.mocked(loadWorkProjection).mockResolvedValue({ items: workItems, hasNext: false, timezone: "America/Sao_Paulo", editControlsByTaskId: {}, statusByTaskId: {} });
  vi.mocked(loadHomeSupplementalProjection).mockResolvedValue({ waitingCount, openQuestionPreview });
  return { supabase };
}

function item(overrides: Partial<InboxItemView> = {}): InboxItemView {
  return {
    entryId: "72f1f8af-8b90-4f1d-9916-ec6d983fd4c6",
    title: "Ligar para a Marina",
    originalPreview: "Ligar para a Marina sobre o contrato do Atlas.",
    productState: "ready",
    significantAt: "2026-07-17T12:00:00.000Z",
    availableActions: [{ id: "open_entry", href: "/pt-BR/app/inbox/72f1f8af-8b90-4f1d-9916-ec6d983fd4c6" }],
    originalPreserved: true,
    isRecordOnly: false,
    ...overrides,
  };
}

function attentionItem(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "entry-9:confirm_existing_candidates",
    kind: "confirm_existing_candidates",
    entryId: "entry-9",
    title: "Confirmar proposta do Atlas",
    explanation: "Há tarefas sugeridas prontas para sua confirmação.",
    primaryAction: { id: "confirm_existing_candidates", href: "/pt-BR/app/inbox/entry-9" },
    sensitivity: "normal" as const,
    occurredAt: "2026-07-17T12:00:00.000Z",
    groupKey: "entry-9",
    ...overrides,
  };
}

function workItem(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: "task-1",
    title: "Preparar reunião",
    dueAt: "2026-07-19T14:00:00.000Z",
    intentionalNoDue: false,
    humanState: "not_started",
    origin: "you",
    availableActions: [],
    projects: [],
    contexts: [],
    people: [],
    waitingOnPeople: [],
    sensitivity: { kind: "undetermined" },
    ...overrides,
  };
}

describe("HomeDashboard", () => {
  /**
   * The Papel e Console cockpit replaced Hoje's feed of recent records with the
   * *sendo organizado* panel (mockup 03, frame 01). The inbox projection is
   * still the source — what changed is which of its rows Hoje draws: the ones
   * the worker has not finished, not the last four of everything.
   */
  it("renders the entries still being organized, through the shared inbox projection", async () => {
    setup({
      items: [
        item({ entryId: "entry-1", title: "Ata da reunião de embarque", productState: "organizing" }),
        item({ entryId: "entry-2", title: "Ligar para a Marina", productState: "ready" }),
      ],
    });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Sendo organizado")).toBeInTheDocument();
    expect(screen.getByText("Ata da reunião de embarque")).toBeInTheDocument();
    expect(screen.getByText("Organizando")).toBeInTheDocument();
    // A finished record is not in this panel: it has nothing left to wait for.
    expect(screen.queryByText("Ligar para a Marina")).not.toBeInTheDocument();
  });

  it("never renders a raw internal product state or entry lifecycle string", async () => {
    setup({ items: [item({ productState: "could_not_organize", attentionReason: "retry_processing" })] });

    render(await HomeDashboard({ locale: "en" }));

    expect(screen.queryByText("could_not_organize")).not.toBeInTheDocument();
    expect(screen.queryByText("retry_processing")).not.toBeInTheDocument();
  });

  it("does not render the organizing panel when nothing is being organized", async () => {
    // *Painéis vazios não renderizam* — `02-arquitetura-e-rotas.md`.
    setup({ items: [] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.queryByText("Sendo organizado")).not.toBeInTheDocument();
  });

  it("shows an observable all-saved status without a review-time promise", async () => {
    setup({ items: [item({ productState: "saved" })] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Nada pendente. Tudo salvo.")).toBeInTheDocument();
    expect(screen.queryByText("Preferência de revisão")).not.toBeInTheDocument();
  });

  it("shows the real number of records being organized", async () => {
    setup({ items: [item({ entryId: "entry-1", productState: "organizing" }), item({ entryId: "entry-2", productState: "organizing" })] });

    render(await HomeDashboard({ locale: "en" }));

    expect(screen.getByText("2 records are still being organized.")).toBeInTheDocument();
  });

  it("renders priority tasks from the shared Work today projection", async () => {
    setup({ workItems: [workItem({ title: "Preparar reunião" })] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Preparar reunião")).toBeInTheDocument();
  });

  it("asks the Work projection for the authenticated owner's today/overdue tasks, not a generic query", async () => {
    setup({ workItems: [] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(loadWorkProjection).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "user-1", locale: "pt-BR", view: "today", page: 1 }),
    );
  });

  it("bounds Hoje to three priorities plus five more, and repeats nothing", async () => {
    // `2J-HOJE-004`. The composition changed in Phase 2J: the day now opens with
    // up to three priorities, and the list underneath carries what is left. The
    // assertion that matters is the LAST one -- before the promoted tasks were
    // filtered out of the list, every priority rendered twice on one screen.
    const items = Array.from({ length: 8 }, (_, index) => workItem({ taskId: `task-${index}`, title: `Tarefa ${index}` }));
    setup({ workItems: items });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    expect(container.querySelectorAll(".home-priorities li")).toHaveLength(3);
    const rendered = screen.getAllByText(/^Tarefa \d$/).map((node) => node.textContent);
    expect(rendered).toHaveLength(8);
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("leaves the list underneath bounded at five when more than eight qualify", async () => {
    const items = Array.from({ length: 20 }, (_, index) => workItem({ taskId: `task-${index}`, title: `Tarefa ${index}` }));
    setup({ workItems: items });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    expect(container.querySelectorAll(".home-priorities li")).toHaveLength(3);
    expect(container.querySelectorAll(".home-list .home-task")).toHaveLength(5);
  });

  it("links Hoje's task rows to the canonical Work today view", async () => {
    setup({ workItems: [workItem()] });

    const { container } = render(await HomeDashboard({ locale: "en" }));

    // One task, and it now qualifies as a priority -- so it renders once, in the
    // priorities list. `getByText` would be ambiguous if it ever rendered twice,
    // which is itself the regression this scoping protects.
    const rows = container.querySelectorAll(".home-priorities a.home-task");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/en/app/work?view=today");
  });

  it("shows the empty state when the Work today projection has no due/overdue tasks", async () => {
    setup({ workItems: [] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Nenhum prazo exige sua atenção hoje.")).toBeInTheDocument();
  });

  it("shows the waiting count from the home supplemental projection, not a raw table query", async () => {
    setup({ waitingCount: 3 });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("3 itens dependem de retorno.")).toBeInTheDocument();
  });

  it("shows the newest open question from the home supplemental projection", async () => {
    setup({ openQuestionPreview: "Isso é um retrabalho ou uma tarefa nova?" });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.getByText("Isso é um retrabalho ou uma tarefa nova?")).toBeInTheDocument();
  });

  it("shows the Needs Attention panel with a count and preview items", async () => {
    setup({
      attentionItems: [
        attentionItem({ entryId: "entry-9", title: "Confirmar proposta do Atlas" }),
        attentionItem({ key: "entry-8:review_interpretation", entryId: "entry-8", title: "Revisar orçamento", kind: "review_interpretation" }),
      ],
    });

    render(await HomeDashboard({ locale: "pt-BR" }));

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    expect(within(attention).getByText("Confirmar proposta do Atlas")).toBeInTheDocument();
    expect(within(attention).getByText("Revisar orçamento")).toBeInTheDocument();
    expect(within(attention).getByText("2")).toBeInTheDocument();
    expect(NeedsAttentionViewed).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 2, locale: "pt-BR", surface: "home" }),
      undefined,
    );
    // The marker's DOM proximity to a specific panel class is not the contract —
    // reporting the count that was actually rendered is, and the call above is
    // what proves it. The old assertion pinned it to `.attention-panel`, which
    // the attention-first layout no longer has.
    expect(screen.getByTestId("needs-attention-view-marker")).toBeInTheDocument();
    /*
      Queried by its sentence and then checked for the role, rather than by role
      alone.

      `getByRole("status")` was unique only while this page had exactly one live
      region, and slice 2P.8 gave the composer a persistent one — an empty
      `sr-only` polite region that has to exist *before* its text arrives, which
      is `2P-ACCESS-001`. Two polite regions on one page is correct here: they
      announce different things, the day's state and the composer's send state,
      and neither is `assertive`.

      This asserts the same two facts the old line did — the sentence is
      rendered, and it is rendered *in a status region* — without depending on
      being the only one.
    */
    const dayStatus = screen.getByText("2 itens precisam de você.");
    expect(dayStatus).toHaveAttribute("role", "status");
  });

  it("shows a `+` suffix on the count when the queue has more items than the preview page", async () => {
    setup({ attentionItems: [attentionItem()], attentionHasNext: true });

    render(await HomeDashboard({ locale: "pt-BR" }));

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    expect(within(attention).getByText("1+")).toBeInTheDocument();
  });

  it("shows an empty state and zero count when the Needs Attention queue has no items", async () => {
    setup({ attentionItems: [] });

    render(await HomeDashboard({ locale: "en" }));

    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
    // The "0" badge is deliberately gone. A count exists to tell the user how much
    // is waiting; rendering a zero next to a heading that already says nothing is
    // waiting is the repetition UX-02 was about. The empty sentence is the
    // contract, and it is asserted above.
    expect(within(screen.getByRole("region", { name: "Needs you" })).queryByText("0")).toBeNull();
  });

  it("links the Needs Attention panel to the Registros needs-you filter, preserving locale", async () => {
    setup({ attentionItems: [attentionItem()] });

    render(await HomeDashboard({ locale: "en" }));

    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/en/app/inbox?view=needs-you");
  });
});
