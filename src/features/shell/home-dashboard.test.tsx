import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth/require-user";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadWorkProjection } from "@/features/daily-cycle/work-projection";
import { loadHomeSupplementalProjection } from "@/features/daily-cycle/home-projection";
import { loadAttentionNotices } from "@/features/notifications/attention-notices";
import type { NotificationRowView } from "@/features/notifications/row-projection";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { noticeRow } from "@/test/notification-verb-fixtures";
import type { InboxItemView, NeedsAttentionItemView, WorkItemView } from "@/features/daily-cycle/contracts";
import { HomeDashboard } from "./home-dashboard";
import { loadOwnerGreetingName } from "./owner-greeting-name";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/daily-cycle/inbox-projection", () => ({ loadInboxProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/attention-projection", () => ({ loadAttentionProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/work-projection", () => ({ loadWorkProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/home-projection", () => ({ loadHomeSupplementalProjection: vi.fn() }));
vi.mock("@/features/capture/actions", () => ({ captureEntry: vi.fn() }));
/*
  The notices and the greeting's name are loaded through mocks so a test can
  plant them. Both used to reach the bare `supabase` stub and reject, which
  rendered the page without them — fine for the tests above, and no way to
  assert what the page does WITH a notice or a name.
*/
vi.mock("@/features/notifications/attention-notices", () => ({
  loadAttentionNotices: vi.fn(),
  EMPTY_ATTENTION_NOTICES: { items: [], hasMore: false },
}));
vi.mock("./owner-greeting-name", () => ({ loadOwnerGreetingName: vi.fn() }));
// The notice rows mount a client component that refreshes the route.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/features/product-analytics/interaction-events", () => ({
  NeedsAttentionViewed: vi.fn(() => <span data-testid="needs-attention-view-marker" />),
  recordNeedsAttentionItemOpened: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function setup(options: {
  items?: readonly InboxItemView[];
  workItems?: readonly WorkItemView[];
  waitingCount?: number;
  openQuestionPreview?: string | null;
  attentionItems?: readonly NeedsAttentionItemView[];
  attentionHasNext?: boolean;
  notices?: readonly NotificationRowView[];
  noticesHaveMore?: boolean;
  /** What the profile read resolves to, or the error it rejects with. */
  greetingName?: string | null | Error;
  timezone?: string;
} = {}) {
  const {
    items = [],
    workItems = [],
    waitingCount = 0,
    openQuestionPreview = null,
    attentionItems = [],
    attentionHasNext = false,
    notices = [],
    noticesHaveMore = false,
    greetingName = null,
    timezone = "America/Sao_Paulo",
  } = options;

  const supabase = { from: vi.fn() };
  vi.mocked(requireUser).mockResolvedValue({ supabase, user: { id: "user-1" } } as never);
  vi.mocked(loadInboxProjection).mockResolvedValue({ items, hasNext: false });
  vi.mocked(loadAttentionProjection).mockResolvedValue({ items: attentionItems, hasNext: attentionHasNext, nextCursor: null });
  vi.mocked(loadWorkProjection).mockResolvedValue({ items: workItems, hasNext: false, timezone, editControlsByTaskId: {}, statusByTaskId: {} });
  vi.mocked(loadHomeSupplementalProjection).mockResolvedValue({ waitingCount, openQuestionPreview });
  vi.mocked(loadAttentionNotices).mockResolvedValue({ items: notices, hasMore: noticesHaveMore });
  if (greetingName instanceof Error) vi.mocked(loadOwnerGreetingName).mockRejectedValue(greetingName);
  else vi.mocked(loadOwnerGreetingName).mockResolvedValue(greetingName);
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

/* -------------------------------------------------------------------------- *
 * The greeting knows the hour and the owner's name.
 * -------------------------------------------------------------------------- */

describe("HomeDashboard: the greeting", () => {
  /** Only `Date` is faked: the page awaits real promises and must not stall. */
  function at(instant: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
  }

  function heading(): string {
    return screen.getByRole("heading", { level: 1 }).textContent ?? "";
  }

  it("says good evening at 23:47 in the owner's zone, where the fixed string said good afternoon", async () => {
    // 02:47 UTC on the 18th is 23:47 on the 17th in America/Sao_Paulo.
    at("2026-11-18T02:47:00.000Z");
    setup({ greetingName: "Fábio" });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(heading()).toBe("Boa noite, Fábio.");
  });

  it("reads the hour in the owner's zone rather than the host's", async () => {
    // The same instant is 11:47 in Tokyo. A greeting computed in UTC, or in the
    // runner's own zone, could not produce both of these answers.
    at("2026-11-18T02:47:00.000Z");
    setup({ greetingName: "Fábio", timezone: "Asia/Tokyo" });

    render(await HomeDashboard({ locale: "en" }));

    expect(heading()).toBe("Good morning, Fábio.");
  });

  it("says good afternoon in the afternoon, in English too", async () => {
    at("2026-11-18T18:10:00.000Z"); // 15:10 in São Paulo.
    setup({ greetingName: "Fábio" });

    render(await HomeDashboard({ locale: "en" }));

    expect(heading()).toBe("Good afternoon, Fábio.");
  });

  it("greets without a name when the profile has none", async () => {
    at("2026-11-18T12:00:00.000Z"); // 09:00 in São Paulo.
    setup({ greetingName: null });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(heading()).toBe("Bom dia.");
  });

  it("degrades to the nameless greeting when the name read fails, and keeps the page", async () => {
    at("2026-11-18T12:00:00.000Z");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ greetingName: new Error("profiles unavailable"), workItems: [workItem({ title: "Preparar reunião" })] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(heading()).toBe("Bom dia.");
    expect(screen.getByText("Preparar reunião")).toBeInTheDocument();
    expect(error.mock.calls.some(([message]) => String(message).includes("greeting name"))).toBe(true);
    error.mockRestore();
  });
});

/* -------------------------------------------------------------------------- *
 * A task that is already a notice is not listed again below.
 * -------------------------------------------------------------------------- */

describe("HomeDashboard: a noticed task is on the page once", () => {
  const TASK_IDS = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ] as const;

  /** Five overdue tasks; the first is the oldest, so it would lead the priorities. */
  function overdueTasks(): WorkItemView[] {
    return TASK_IDS.map((taskId, index) =>
      workItem({ taskId, title: `Tarefa ${index + 1}`, dueAt: `2026-07-1${index}T14:00:00.000Z` }));
  }

  function overdueNotice(taskId: string, title: string, subjectStatus: string | null = "todo") {
    return noticeRow({
      source: {
        id: `aaaaaaaa-0000-4000-8000-${taskId.slice(-12)}`,
        title: "Tarefa atrasada",
        body: title,
        dedupe_key: `overdue:${taskId}:2026-11-17`,
      },
      subjectStatus,
      subjectLabel: title,
    });
  }

  it("lists it only as its notice, and refills the priorities with the next task", async () => {
    setup({ workItems: overdueTasks(), notices: [overdueNotice(TASK_IDS[0], "Tarefa 1")] });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    // Once on the whole page, and that once is in *Precisa de você*.
    expect(screen.getAllByText("Tarefa 1")).toHaveLength(1);
    const attention = screen.getByRole("region", { name: "Precisa de você" });
    expect(within(attention).getByText("Tarefa 1")).toBeInTheDocument();

    // Still three priorities: the slot went to the next task that qualifies.
    const priorities = [...container.querySelectorAll(".home-priorities li strong")].map((node) => node.textContent);
    expect(priorities).toEqual(["Tarefa 2", "Tarefa 3", "Tarefa 4"]);
    const day = screen.getByRole("region", { name: "Hoje e atrasado" });
    expect(within(day).getByText("Tarefa 5")).toBeInTheDocument();
  });

  it("counts the task once: in the attention number, not in the day's", async () => {
    setup({ workItems: overdueTasks(), notices: [overdueNotice(TASK_IDS[0], "Tarefa 1")] });

    render(await HomeDashboard({ locale: "pt-BR" }));

    const attention = screen.getByRole("region", { name: "Precisa de você" });
    const day = screen.getByRole("region", { name: "Hoje e atrasado" });
    expect(attention.querySelector("header .count")?.textContent).toBe("1");
    // Five tasks are due; four are listed here, because the fifth is above.
    expect(day.querySelector("header .count")?.textContent).toBe("4");
    // The sentence under the greeting states the attention section's number.
    expect(screen.getByText("1 item precisa de você.")).toHaveAttribute("role", "status");
  });

  it("does not say nothing is pending above a notice that is the task's only row", async () => {
    setup({
      workItems: [workItem({ taskId: TASK_IDS[0], title: "Tarefa 1" })],
      notices: [overdueNotice(TASK_IDS[0], "Tarefa 1")],
    });

    render(await HomeDashboard({ locale: "pt-BR" }));

    expect(screen.queryByText("Nada pendente. Tudo salvo.")).not.toBeInTheDocument();
    expect(screen.getByText("1 item precisa de você.")).toBeInTheDocument();
    // The day's section is honestly empty rather than repeating the task.
    expect(screen.getByText("Nenhum prazo exige sua atenção hoje.")).toBeInTheDocument();
  });

  it("keeps a task whose notice is not on the page, and marks the count as partial", async () => {
    // The loader returns only the bounded page Hoje renders — three rows. Task
    // 4 has a notice as well, past that bound: it must stay in the list.
    setup({
      workItems: overdueTasks(),
      notices: [
        overdueNotice(TASK_IDS[0], "Tarefa 1"),
        overdueNotice(TASK_IDS[1], "Tarefa 2"),
        overdueNotice(TASK_IDS[2], "Tarefa 3"),
      ],
      noticesHaveMore: true,
    });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    const priorities = [...container.querySelectorAll(".home-priorities li strong")].map((node) => node.textContent);
    expect(priorities).toEqual(["Tarefa 4", "Tarefa 5"]);
    expect(screen.getByText("3+ itens precisam de você.")).toBeInTheDocument();
  });

  it("keeps a task whose notice could not resolve its subject", async () => {
    // That row offers no task verb, so removing the task would leave nothing on
    // the page able to act on it.
    setup({ workItems: overdueTasks(), notices: [overdueNotice(TASK_IDS[0], "Tarefa 1", null)] });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    const priorities = [...container.querySelectorAll(".home-priorities li strong")].map((node) => node.textContent);
    expect(priorities).toEqual(["Tarefa 1", "Tarefa 2", "Tarefa 3"]);
  });

  it("keeps a task when the only notice near it is about a reminder", async () => {
    const reminder = noticeRow({
      source: {
        id: "bbbbbbbb-0000-4000-8000-000000000001",
        type: "reminder",
        title: "Lembrete",
        body: "Tarefa 1",
        dedupe_key: "reminder:99999999-9999-4999-8999-999999999999",
      },
      subjectStatus: "scheduled",
    });
    setup({ workItems: overdueTasks(), notices: [reminder] });

    const { container } = render(await HomeDashboard({ locale: "pt-BR" }));

    const priorities = [...container.querySelectorAll(".home-priorities li strong")].map((node) => node.textContent);
    expect(priorities).toEqual(["Tarefa 1", "Tarefa 2", "Tarefa 3"]);
  });
});
