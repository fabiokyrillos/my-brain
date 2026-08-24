import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Locale } from "@/lib/preferences";

import { getReminderCopy } from "./copy";
import type { ReminderViewModel } from "./projection";
import { ReminderFeedbackProvider } from "./feedback";
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
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

afterEach(cleanup);

const formatInstant = (iso: string) => `[${iso}]`;
// A real `datetime-local` value, and a reminder instant that is *not* on a whole
// minute — which is what every snooze produces and what crashed the reschedule
// panel when the client formatted it.
const formatLocalInput = (iso: string) => iso.slice(0, 16);
const formatLocalTime = (iso: string) => iso.slice(11, 16);

function reminder(overrides: Partial<ReminderViewModel> = {}): ReminderViewModel {
  return {
    id: "44444444-4444-4444-8444-444444444444",
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
    historyHref: "/pt-BR/app/history?entity=reminder&subject=44444444-4444-4444-8444-444444444444",
    ...overrides,
  };
}

function renderList(reminders: readonly ReminderViewModel[], locale: Locale = "pt-BR") {
  // The provider owns the action state the row controls submit to; rendering the
  // list without it is the wiring mistake `useReminderCommand` throws on.
  return render(
    <ReminderFeedbackProvider>
      <ReminderSeriesProvider>
        <ReminderList
          formatInstant={formatInstant}
          formatLocalInput={formatLocalInput}
          formatLocalTime={formatLocalTime}
          locale={locale}
          reminders={reminders}
        />
      </ReminderSeriesProvider>
    </ReminderFeedbackProvider>,
  );
}

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
    renderList([reminder({ status: "sent", hasPendingDelivery: false, actions: [] })]);
    expect(screen.getByText(getReminderCopy("pt-BR").statusHint.sent)).toBeInTheDocument();
  });
});

describe("the timestamp's label follows the state", () => {
  it("calls it the next reminder while one is pending", () => {
    renderList([reminder()]);
    expect(screen.getByText(/Próximo aviso/)).toBeInTheDocument();
  });

  it("calls it the delivery time once it has fired, and reads sent_at", () => {
    renderList([
      reminder({
        status: "sent",
        hasPendingDelivery: false,
        actions: [],
        sentAt: "2026-12-05T09:05:00+00:00",
      }),
    ]);
    expect(screen.getByText(/Entregue em/)).toBeInTheDocument();
    expect(screen.getByText("[2026-12-05T09:05:00+00:00]")).toBeInTheDocument();
  });

  it("says a past-due reminder will fire on the next check", () => {
    renderList([reminder({ overdue: true })]);
    expect(screen.getByText(getReminderCopy("pt-BR").overdueNote)).toBeInTheDocument();
  });

  it("says nothing about overdue for a row that will never fire", () => {
    renderList([reminder({ status: "cancelled", hasPendingDelivery: false, actions: ["restore"] })]);
    expect(screen.queryByText(getReminderCopy("pt-BR").overdueNote)).not.toBeInTheDocument();
  });
});

describe("only the actions the state accepts are rendered", () => {
  it("offers the four live commands on a scheduled independent reminder", () => {
    renderList([reminder()]);
    expect(screen.getByRole("button", { name: /Reagendar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar lembrete/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reativar/ })).not.toBeInTheDocument();
  });

  it("renders no control at all on a delivered reminder", () => {
    renderList([reminder({ status: "sent", hasPendingDelivery: false, actions: [] })]);
    // Not "renders them disabled" — absent. A disabled control advertises a
    // capability that does not exist and gives the owner nothing to do about it.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers restore, and only restore, on a cancelled one", () => {
    renderList([reminder({ status: "cancelled", hasPendingDelivery: false, actions: ["restore"] })]);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/Reativar/);
  });

  it("withholds edit from a task-linked reminder while keeping reschedule", () => {
    renderList([reminder({ actions: ["snooze", "reschedule", "cancel"] })]);
    expect(screen.getByRole("button", { name: /Reagendar/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
  });

  it("labels the snooze select so it has an accessible name", () => {
    renderList([reminder()]);
    expect(screen.getByLabelText("Adiar")).toBeInTheDocument();
  });
});

describe("the linked subject and the audit trail", () => {
  it("links a task-linked reminder to the task", () => {
    renderList([
      reminder({
        link: { kind: "task", href: "/pt-BR/app/work/task-1", label: "Fechar o balanço" },
      }),
    ]);
    const link = screen.getByRole("link", { name: /Fechar o balanço/ });
    expect(link).toHaveAttribute("href", "/pt-BR/app/work/task-1");
  });

  it("says a reminder is standalone rather than showing an empty link", () => {
    renderList([reminder()]);
    expect(screen.getByText("Lembrete avulso")).toBeInTheDocument();
  });

  it("links every reminder to its own history", () => {
    renderList([reminder()]);
    expect(screen.getByRole("link", { name: /Ver no histórico/ })).toHaveAttribute(
      "href",
      "/pt-BR/app/history?entity=reminder&subject=44444444-4444-4444-8444-444444444444",
    );
  });

  it("stamps the anchor the History subject link targets", () => {
    const { container } = renderList([reminder()]);
    expect(
      container.querySelector("#reminder-44444444-4444-4444-8444-444444444444"),
    ).not.toBeNull();
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
});

describe("the server/client boundary", () => {
  it("passes no function prop into the client component", () => {
    /*
     * The defect this exists for shipped and reached the deployed project.
     *
     * `reminder-list.tsx` is a Server Component and `reminder-actions.tsx` is a
     * Client one. Handing the former's `formatInstant` callback to the latter is
     * the natural thing to write and the one thing React refuses to serialize:
     * the page threw at request time and rendered its error boundary.
     *
     * Every test above missed it, and would again — jsdom renders both halves as
     * ordinary components with no boundary between them, so a function prop
     * works perfectly here and fails only in a real RSC render. Reading the
     * client component's own prop type is the check that does not depend on the
     * environment: if it declares no function, none can be passed.
     */
    const source = readFileSync(
      path.resolve(process.cwd(), "src/features/reminders/reminder-actions.tsx"),
      "utf8",
    );
    expect(source.startsWith('"use client"')).toBe(true);

    const props = source.slice(
      source.indexOf("export function ReminderActions({"),
      source.indexOf("}) {", source.indexOf("export function ReminderActions({")),
    );
    // A `=>` inside the prop type annotation is a function type. Comments are
    // stripped first so the explanatory prose above the props cannot trip it.
    const declarations = props
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
      .join("\n");
    expect(declarations, "a function prop crosses into the client component").not.toContain("=>");
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
    renderList([withSeries()]);
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBodySeries)).toBeTruthy();
    expect(screen.queryByText(copy.cancelConfirmBody)).toBeNull();
  });

  it("keeps the ordinary promise for a detached occurrence", async () => {
    // The trigger skips a detached row, so nothing replaces it and `restore`
    // works — proved against the deployed database.
    renderList([withSeries({ detached: true })]);
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBody)).toBeTruthy();
  });

  it("keeps the ordinary promise when the rule has ended", async () => {
    renderList([withSeries({ active: false })]);
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBody)).toBeTruthy();
  });

  it("keeps the ordinary promise for a reminder with no rule at all", async () => {
    renderList([reminder()]);
    await openCancel();
    expect(screen.getByText(copy.cancelConfirmBody)).toBeTruthy();
  });
});
