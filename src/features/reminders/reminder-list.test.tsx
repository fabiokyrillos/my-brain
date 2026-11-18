import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import type { ReminderViewModel } from "./projection";
import { ReminderFeedbackProvider } from "./feedback";
import { ReminderDetail } from "./reminder-detail";
import { ReminderSeriesProvider } from "./series-feedback";
import { ReminderEmptyState, ReminderList, ReminderViewNav } from "./reminder-list";

/**
 * What the surface shows, and — the half that matters more — what it refuses to
 * show (UX-12).
 *
 * UX-12 asks for two things that are easy to conflate: *do not render actions
 * the current state cannot accept*, and *do not render disabled placeholders for
 * unsupported operations*. A disabled "Reactivate" on a delivered reminder
 * satisfies the first and violates the second, so the cases below assert absence
 * rather than absence-or-disabled.
 *
 * ADR-180 split the surface in two: the **list** is rows with one verb each,
 * and the reminder's **page** holds its facts and every other command. The
 * cases follow the control to where it now lives; none was dropped.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The reminder's page asks the router to re-read the route after a command.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

afterEach(cleanup);

const formatInstant = (iso: string) => `[${iso}]`;
// A real `datetime-local` value, and a reminder instant that is *not* on a whole
// minute — which is what every snooze produces and what crashed the reschedule
// panel when the client formatted it.
const formatLocalInput = (iso: string) => iso.slice(0, 16);
const formatLocalTime = (iso: string) => iso.slice(11, 16);
const formatLocalDay = (iso: string) => iso.slice(0, 10);
const formatDayLabel = (iso: string) => `dia ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Friday; the default fixture fires the day after. */
const NOW = new Date("2026-12-04T12:00:00+00:00");

const ID = "44444444-4444-4444-8444-444444444444";

function reminder(overrides: Partial<ReminderViewModel> = {}): ReminderViewModel {
  return {
    id: ID,
    title: "Ligar para o contador",
    status: "scheduled",
    important: false,
    remindAt: "2026-12-05T09:00:00+00:00",
    sentAt: null,
    hasPendingDelivery: true,
    overdue: false,
    link: null,
    // Slice 2R.2. The default fixture is an ordinary reminder, which is what
    // every case below is about; the series cases build their own.
    series: null,
    actions: ["snooze", "reschedule", "edit", "cancel"],
    expectedState: {
      status: "scheduled",
      remindAt: "2026-12-05T09:00:00+00:00",
      title: "Ligar para o contador",
      important: false,
    },
    historyHref: `/pt-BR/app/history?entity=reminder&subject=${ID}`,
    ...overrides,
  };
}

const sent = (overrides: Partial<ReminderViewModel> = {}) =>
  reminder({ status: "sent", hasPendingDelivery: false, actions: [], ...overrides });
const cancelled = (overrides: Partial<ReminderViewModel> = {}) =>
  reminder({ status: "cancelled", hasPendingDelivery: false, actions: ["restore"], ...overrides });

function renderList(reminders: readonly ReminderViewModel[], locale: Locale = "pt-BR") {
  // The provider owns the action state the row controls submit to; rendering the
  // list without it is the wiring mistake `useReminderCommand` throws on.
  return render(
    <ReminderFeedbackProvider>
      <ReminderSeriesProvider>
        <ReminderList
          formatDayLabel={formatDayLabel}
          formatInstant={formatInstant}
          formatLocalDay={formatLocalDay}
          formatLocalTime={formatLocalTime}
          locale={locale}
          now={NOW}
          reminders={reminders}
        />
      </ReminderSeriesProvider>
    </ReminderFeedbackProvider>,
  );
}

function renderDetail(model: ReminderViewModel, locale: Locale = "pt-BR") {
  const instant = model.status === "sent" && model.sentAt !== null ? model.sentAt : model.remindAt;
  return render(
    <ReminderFeedbackProvider>
      <ReminderSeriesProvider>
        <ReminderDetail
          anchorTimeValue={formatLocalTime(model.remindAt)}
          locale={locale}
          remindAtLocalValue={formatLocalInput(model.remindAt)}
          reminder={model}
          whenValue={formatInstant(instant)}
        />
      </ReminderSeriesProvider>
    </ReminderFeedbackProvider>,
  );
}

const busiest = () => reminder({
  link: { kind: "task", href: "/pt-BR/app/work/task-1", label: "Fechar o balanço" },
  series: {
    id: "77777777-7777-4777-8777-777777777777",
    active: true,
    detached: false,
    sequence: 4,
    description: "Todo dia 5 de junho",
  },
});

describe("the status is a sentence, not a column value", () => {
  it("renders the localized label in pt-BR", () => {
    renderList([reminder()]);
    expect(screen.getByText("Agendado")).toBeInTheDocument();
    expect(screen.queryByText("scheduled")).not.toBeInTheDocument();
  });

  it("renders the localized label in English", () => {
    renderList([reminder()], "en");
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.queryByText("scheduled")).not.toBeInTheDocument();
  });

  it("explains what the status means for delivery", () => {
    renderList([sent()]);
    expect(screen.getByText(getReminderCopy("pt-BR").statusHint.sent)).toBeInTheDocument();
  });

  it("says it on the reminder's own page too", () => {
    renderDetail(sent());
    expect(screen.getByText("Entregue")).toBeInTheDocument();
    expect(screen.getByText(getReminderCopy("pt-BR").statusHint.sent)).toBeInTheDocument();
  });
});

describe("the timestamp's label follows the state", () => {
  it("calls it the next reminder while one is pending", () => {
    renderList([reminder()]);
    expect(screen.getByText(/Próximo aviso/)).toBeInTheDocument();
  });

  it("calls it the delivery time once it has fired, and reads sent_at", () => {
    renderList([sent({ sentAt: "2026-12-05T09:05:00+00:00" })]);
    expect(screen.getByText(/Entregue em/)).toBeInTheDocument();
    expect(screen.getByText("[2026-12-05T09:05:00+00:00]")).toBeInTheDocument();
  });

  it("labels the fact the same way on the reminder's page", () => {
    const pending = renderDetail(reminder());
    expect(screen.getByText("Próximo aviso")).toBeInTheDocument();
    pending.unmount();

    renderDetail(sent({ sentAt: "2026-12-05T09:05:00+00:00" }));
    expect(screen.getByText("Entregue em")).toBeInTheDocument();
    expect(screen.getByText("[2026-12-05T09:05:00+00:00]")).toBeInTheDocument();
  });

  it("says a past-due reminder will fire on the next check", () => {
    renderList([reminder({ overdue: true })]);
    expect(screen.getByText(getReminderCopy("pt-BR").overdueNote)).toBeInTheDocument();
  });

  it("says it once for the section, not once per row", () => {
    renderList([
      reminder({ overdue: true }),
      reminder({ id: "55555555-5555-4555-8555-555555555555", overdue: true }),
    ]);
    expect(screen.getAllByText(getReminderCopy("pt-BR").overdueNote)).toHaveLength(1);
  });

  it("says nothing about overdue for a row that will never fire", () => {
    renderList([cancelled()]);
    expect(screen.queryByText(getReminderCopy("pt-BR").overdueNote)).not.toBeInTheDocument();
  });
});

/*
 * ADR-180 — the list is the Agenda's third lens and reads in its grammar:
 * sections by when, and a row that is when · what · one caption · one verb.
 */
describe("ADR-180: the list is sections of rows", () => {
  const at = (id: string, remindAt: string, extra: Partial<ReminderViewModel> = {}) =>
    reminder({ id, remindAt, title: `Lembrete ${id}`, ...extra });

  it("groups by when, in the order a day is read", () => {
    const { container } = renderList([
      at("a", "2026-12-04T08:00:00+00:00", { overdue: true }),
      at("b", "2026-12-04T18:00:00+00:00"),
      at("c", "2026-12-05T09:00:00+00:00"),
      at("d", "2026-12-08T09:00:00+00:00"),
      at("e", "2027-03-01T09:00:00+00:00"),
    ]);
    expect(Array.from(container.querySelectorAll("section")).map((section) => section.dataset.group))
      .toEqual(["late", "today", "tomorrow", "week", "later"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
      .toEqual(["Passou do horário1", "Hoje1", "Amanhã1", "Nos próximos dias1", "Mais adiante1"]);
  });

  it("gives what will not fire again a section named by its state", () => {
    const { container } = renderList([
      at("a", "2026-12-05T09:00:00+00:00"),
      sent({ id: "b" }),
      cancelled({ id: "c" }),
    ]);
    expect(Array.from(container.querySelectorAll("section")).map((section) => section.dataset.group))
      .toEqual(["tomorrow", "delivered", "cancelled"]);
  });

  it("shows the hour alone in a one-day section, and the day with it elsewhere", () => {
    const { container } = renderList([
      at("c", "2026-12-05T09:00:00+00:00"),
      at("d", "2026-12-08T10:30:00+00:00"),
    ]);
    const [tomorrow, week] = Array.from(container.querySelectorAll<HTMLElement>("li"));
    expect(tomorrow.querySelector(".reminder-row-time")?.textContent).toBe("09:00");
    expect(tomorrow.querySelector(".reminder-row-day")).toBeNull();
    expect(week.querySelector(".reminder-row-day")?.textContent).toBe("dia 08/12");
    expect(week.querySelector(".reminder-row-time")?.textContent).toBe("10:30");
  });

  it("makes the row's title the link to the reminder's own page", () => {
    renderList([reminder()]);
    expect(screen.getByRole("link", { name: "Ligar para o contador" }))
      .toHaveAttribute("href", `/pt-BR/app/reminders/${ID}`);
  });

  it("draws no card, pill or boxed button on a row", () => {
    const { container } = renderList([busiest()]);
    expect(container.querySelector(".list-row, .status-badge, .reminder-button, details")).toBeNull();
  });
});

describe("only the actions the state accepts are rendered", () => {
  it("offers the four live commands on a scheduled independent reminder", () => {
    renderDetail(reminder());
    expect(screen.getByRole("button", { name: /Reagendar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar lembrete/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adiar 1h" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reativar/ })).not.toBeInTheDocument();
  });

  it("renders no control at all on a delivered reminder", () => {
    // Not "renders them disabled" — absent. A disabled control advertises a
    // capability that does not exist and gives the owner nothing to do about it.
    const list = renderList([sent()]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    list.unmount();

    renderDetail(sent());
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers restore, and only restore, on a cancelled one", () => {
    const list = renderList([cancelled()]);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Reativar"]);
    list.unmount();

    renderDetail(cancelled());
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/Reativar/);
  });

  it("withholds edit from a task-linked reminder while keeping reschedule", () => {
    renderDetail(reminder({ actions: ["snooze", "reschedule", "cancel"] }));
    expect(screen.getByRole("button", { name: /Reagendar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
  });

  it("labels the snooze select so it has an accessible name", async () => {
    renderDetail(reminder());
    await userEvent.setup().click(screen.getByRole("button", { name: "Reagendar" }));
    expect(screen.getByLabelText("Adiar por")).toBeInTheDocument();
  });
});

/*
 * Life Brain D.1 (T2, V1 3:30: "está tão grande esse cartão. Deveria ser bem
 * melhor … bem mais minimalista"). A card counted up to ~18 controls between
 * `reminder-actions.tsx` and `series-controls.tsx`; D.1 cut it to three and a
 * menu. ADR-180 makes it a row: **the link and one verb**. Everything else is
 * still one tap away — on the reminder's page, which the row opens, instead of
 * behind "Mais".
 */
describe("Life Brain D.1: a reminder shows at most three controls", () => {
  /** Interactive elements a sighted owner sees without opening anything. */
  function visibleControls(card: HTMLElement): HTMLElement[] {
    const all = Array.from(card.querySelectorAll<HTMLElement>(
      "a[href], button, select, textarea, input:not([type='hidden']), summary",
    ));
    return all.filter((node) => {
      const closed = node.closest("details:not([open])");
      // A closed `<details>` shows its summary and nothing else.
      return closed === null || node.tagName === "SUMMARY" && node.parentElement === closed;
    });
  }

  it("the busiest row — scheduled, linked, repeating, every action — shows two", () => {
    const { container } = renderList([busiest()]);
    const row = container.querySelector("li") as HTMLElement;
    const shown = visibleControls(row);
    expect(shown.length).toBeLessThanOrEqual(3);
    expect(shown.map((node) => node.textContent?.trim())).toEqual(["Ligar para o contador", "Adiar 1h"]);
  });

  it("keeps everything else one tap away, on the reminder's page", async () => {
    const user = userEvent.setup();
    renderDetail(reminder({ series: busiest().series }));
    expect(screen.getByRole("button", { name: /Editar$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar lembrete" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver no histórico/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alterar repetição/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Encerrar repetição/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reagendar" }));
    expect(screen.getByLabelText("Adiar por")).toBeInTheDocument();
    expect(screen.getByLabelText("Novo horário")).toBeInTheDocument();
  });

  it("opens one editor at a time, under the fact it changes", async () => {
    const user = userEvent.setup();
    const { container } = renderDetail(reminder());
    await user.click(screen.getByRole("button", { name: "Reagendar" }));
    const when = screen.getByText("Próximo aviso").closest(".reminder-fact") as HTMLElement;
    expect(within(when).getByLabelText("Novo horário")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.queryByLabelText("Novo horário")).toBeNull();
    expect(screen.getByLabelText("Título do lembrete")).toBeInTheDocument();
    expect(container.querySelectorAll("form.reminder-panel")).toHaveLength(1);
  });

  it("still says, without opening anything, when it fires, that it repeats and what it is tied to", () => {
    const { container } = renderList([busiest()]);
    const row = container.querySelector("li") as HTMLElement;
    expect(within(row).getByText("09:00")).toBeInTheDocument();
    expect(within(row).getByText("Todo dia 5 de junho")).toBeInTheDocument();
    expect(within(row).getByText(/Fechar o balanço/)).toBeInTheDocument();
    // And it does not repeat itself: "vai disparar no horário" is the hour beside it.
    expect(within(row).queryByText(getReminderCopy("pt-BR").statusHint.scheduled)).toBeNull();
  });

  it("snoozes for an hour in one tap", () => {
    // Asserted on the form it submits, not by pressing it: pressing would run
    // the real Server Action against a mocked session.
    renderList([reminder()]);
    const quick = screen.getByRole("button", { name: "Adiar 1h" });
    const form = quick.closest("form") as HTMLFormElement;
    expect(quick).toHaveAttribute("type", "submit");
    expect(new FormData(form).get("snoozeMinutes")).toBe("60");
    expect(new FormData(form).get("action")).toBe("snooze");
  });

  it("a cancelled reminder shows the link and its one verb", () => {
    const { container } = renderList([cancelled()]);
    const shown = visibleControls(container.querySelector("li") as HTMLElement);
    expect(shown.map((node) => node.textContent?.trim())).toEqual(["Ligar para o contador", "Reativar"]);
  });
});

describe("the linked subject and the audit trail", () => {
  it("links a task-linked reminder to the task, from its page", () => {
    renderDetail(reminder({
      link: { kind: "task", href: "/pt-BR/app/work/task-1", label: "Fechar o balanço" },
    }));
    const link = screen.getByRole("link", { name: /Fechar o balanço/ });
    expect(link).toHaveAttribute("href", "/pt-BR/app/work/task-1");
  });

  it("names the subject on the row without a second link beside the row's own", () => {
    renderList([reminder({
      link: { kind: "task", href: "/pt-BR/app/work/task-1", label: "Fechar o balanço" },
    })]);
    expect(screen.getByText("Tarefa: Fechar o balanço")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says which absence it means rather than showing an empty link", () => {
    renderDetail(reminder());
    expect(screen.getByText("Sem vínculo")).toBeInTheDocument();
    expect(screen.getByText("Não repete")).toBeInTheDocument();
  });

  it("says nothing on the row about an absence", () => {
    const { container } = renderList([reminder()]);
    expect(screen.queryByText("Sem vínculo")).toBeNull();
    expect(container.querySelector(".reminder-row-caption")?.textContent).toBe("Agendado");
  });

  /**
   * Life Brain B.7, defect 5 of 5 November 2026.
   *
   * The owner's card said "Lembrete avulso" and, two lines down, "REPETE — Todo
   * dia 5 de junho". The label is chosen by `link === null`, so it was reporting
   * the absence of a **subject**; *avulso* reads in Portuguese as the absence of
   * **recurrence**, which the next line then contradicted. The data was right
   * and the word was wrong, so this asserts the one case that exposed it.
   */
  it("does not call a recurring reminder standalone (defect 5)", () => {
    const model = reminder({ link: null, series: busiest().series });
    renderDetail(model);

    expect(screen.getByText("Sem vínculo")).toBeInTheDocument();
    expect(screen.getByText("Todo dia 5 de junho")).toBeInTheDocument();
    // The two facts are rows of one list, each under its own label, so the one
    // that reports "no subject" may not read as "no repetition".
    expect(screen.queryByText("Não repete")).toBeNull();
    expect(screen.queryByText(/avulso/i)).toBeNull();
    cleanup();

    renderList([model]);
    expect(screen.getByText("Todo dia 5 de junho")).toBeInTheDocument();
    expect(screen.queryByText(/avulso/i)).toBeNull();
  });

  it("links every reminder to its own history", () => {
    renderDetail(reminder());
    expect(screen.getByRole("link", { name: /Ver no histórico/ })).toHaveAttribute(
      "href",
      `/pt-BR/app/history?entity=reminder&subject=${ID}`,
    );
  });

  it("stamps the anchor the History subject link targets, on both surfaces", () => {
    const list = renderList([reminder()]);
    expect(list.container.querySelector(`#reminder-${ID}`)).not.toBeNull();
    list.unmount();
    expect(renderDetail(reminder()).container.querySelector(`#reminder-${ID}`)).not.toBeNull();
  });
});

describe("the reminder's page is the reminder", () => {
  it("sets its text as the page's one heading", () => {
    renderDetail(reminder());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ligar para o contador");
  });

  it("gives someone who arrived from a notification the way back to the list", () => {
    renderDetail(reminder(), "en");
    expect(screen.getByRole("link", { name: "Reminders" })).toHaveAttribute("href", "/en/app/reminders");
  });

  it("keeps what ends something last, after the facts", () => {
    const { container } = renderDetail(reminder({ series: busiest().series }));
    const order = Array.from(container.querySelectorAll("button, a")).map((node) => node.textContent?.trim());
    expect(order.slice(-3)).toEqual(["Ver no histórico", "Encerrar repetição", "Cancelar lembrete"]);
  });
});

describe("the reminder's page re-reads itself after a command", () => {
  it("asks for nothing while nothing has been applied", () => {
    refresh.mockClear();
    renderDetail(reminder());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is wired to the outcome of this reminder, by state identity", () => {
    // The actions revalidate the list's path, not this page's, so without the
    // refresh a snooze here would leave the old hour and a stale expected state.
    // Asserted on the source: pressing a control would run the real Server
    // Action against a mocked session.
    const source = readFileSync(path.resolve(process.cwd(), "src/features/reminders/reminder-detail.tsx"), "utf8");
    expect(source).toContain('if (state.status === "success" && state.reminderId === reminder.id) router.refresh();');
    expect(source).toContain('if (seriesOutcome.status === "success") router.refresh();');
    expect(source).toContain('if (undoOutcome.status === "success") router.refresh();');
  });
});

describe("the view selector", () => {
  it("marks the current view for a screen reader, not only with a class", () => {
    render(
      <ReminderViewNav
        current="cancelled"
        labels={getReminderCopy("pt-BR").viewLabel}
        locale="pt-BR"
      />,
    );
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Cancelados" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Pendentes" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps every view reachable as its own URL", () => {
    render(
      <ReminderViewNav current="pending" labels={getReminderCopy("en").viewLabel} locale="en" />,
    );
    expect(screen.getByRole("link", { name: "Delivered" })).toHaveAttribute(
      "href",
      "/en/app/reminders?view=delivered",
    );
  });

  it("is named by its own word when it is given one", () => {
    render(
      <ReminderViewNav current="pending" label="Mostrar" labels={getReminderCopy("pt-BR").viewLabel} locale="pt-BR" />,
    );
    expect(screen.getByRole("navigation", { name: "Mostrar" })).toBeInTheDocument();
  });
});

describe("the empty state", () => {
  it("names the configured assistant, never a hardcoded one", () => {
    render(<ReminderEmptyState agentName="Íris" locale="pt-BR" view="pending" />);
    expect(screen.getByText(/Íris/)).toBeInTheDocument();
    expect(screen.queryByText(/Brain/)).not.toBeInTheDocument();
  });

  it("says something different when a filtered view is empty", () => {
    render(<ReminderEmptyState agentName="Íris" locale="pt-BR" view="cancelled" />);
    // "Create one above" would be wrong advice for an empty cancelled view.
    expect(screen.queryByText(/Íris/)).not.toBeInTheDocument();
  });

  it("is still a state of the shared vocabulary, at line density", () => {
    const { container } = render(<ReminderEmptyState agentName="Íris" locale="pt-BR" view="pending" />);
    expect(container.querySelector('[data-ux-state="empty"][data-ux-density="line"]')).not.toBeNull();
  });
});

describe("the server/client boundary", () => {
  it("passes no function prop into the client components", () => {
    /*
     * The defect this exists for shipped and reached the deployed project.
     *
     * `reminder-list.tsx` and the reminder's page are Server Components;
     * `reminder-actions.tsx` and `reminder-detail.tsx` are Client ones. Handing
     * a server formatter callback to a client component is the natural thing
     * to write and the one thing React refuses to serialize: the page threw at
     * request time and rendered its error boundary.
     *
     * Every test above missed it, and would again — jsdom renders both halves as
     * ordinary components with no boundary between them, so a function prop
     * works perfectly here and fails only in a real RSC render. Reading the
     * client component's own prop type is the check that does not depend on the
     * environment: if it declares no function, none can be passed.
     */
    for (const [file, exported] of [
      ["src/features/reminders/reminder-actions.tsx", "ReminderRowVerb"],
      ["src/features/reminders/reminder-actions.tsx", "ReminderInlineFeedback"],
      ["src/features/reminders/reminder-detail.tsx", "ReminderDetail"],
    ] as const) {
      const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source.startsWith('"use client"')).toBe(true);

      const start = source.indexOf(`export function ${exported}({`);
      expect(start, `${exported} is not exported from ${file}`).toBeGreaterThan(-1);
      const props = source.slice(start, source.indexOf("}) {", start));
      // A `=>` inside the prop type annotation is a function type. Comments are
      // stripped first so the explanatory prose above the props cannot trip it.
      const declarations = props
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
        .join("\n");
      expect(declarations, `a function prop crosses into ${exported}`).not.toContain("=>");
    }
  });
});

describe("a long title does not break the row", () => {
  it("renders in full and lets CSS handle the overflow", () => {
    const title = "Ligar para o contador ".repeat(20).trim();
    renderList([reminder({ title, expectedState: { ...reminder().expectedState, title } })]);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});

/**
 * `2R-SERIES-008` — the confirmation names what it is about to do, slice 2R.2.
 *
 * Cancelling an attached occurrence of an active rule materialises the
 * replacement, the replacement takes the one live slot the database permits, and
 * the cancelled row can no longer be reactivated. The standing body promises
 * reactivation, so for this shape it is a false promise — and a promise that is
 * true half the time is worse than two bodies, because nothing on screen tells
 * the owner which half they are in.
 */
describe("cancelling an occurrence that carries a rule", () => {
  const SERIES_ID = "77777777-7777-4777-8777-777777777777";
  const copy = getReminderCopy("pt-BR");

  const withSeries = (overrides: Partial<ReminderViewModel["series"]> = {}) =>
    reminder({
      series: { id: SERIES_ID, active: true, detached: false, sequence: 2, description: "Todo dia", ...overrides },
    });

  const openCancel = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: copy.actionLabel.cancel }));
  };

  it("warns that this occurrence cannot be reactivated", async () => {
    renderDetail(withSeries());
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBodySeries)).toBeTruthy();
    expect(screen.queryByText(copy.cancelConfirmBody)).toBeNull();
  });

  it("keeps the ordinary promise for a detached occurrence", async () => {
    // The trigger skips a detached row, so nothing replaces it and `restore`
    // works — proved against the deployed database.
    renderDetail(withSeries({ detached: true }));
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBody)).toBeTruthy();
  });

  it("keeps the ordinary promise when the rule has ended", async () => {
    renderDetail(withSeries({ active: false }));
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBody)).toBeTruthy();
  });

  it("keeps the ordinary promise for a reminder with no rule at all", async () => {
    renderDetail(reminder());
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBody)).toBeTruthy();
  });

  it("asks before it cancels: the first press submits nothing", async () => {
    renderDetail(reminder());
    await openCancel();
    const accept = screen.getByRole("button", { name: copy.cancelConfirmAccept });
    expect(new FormData(accept.closest("form") as HTMLFormElement).get("action")).toBe("cancel");
    expect(screen.getByRole("button", { name: copy.cancelConfirmDismiss })).toBeInTheDocument();
  });
});
