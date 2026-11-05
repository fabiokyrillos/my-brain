/**
 * Life Brain A.5 — the history page's notice row.
 *
 * What it owes: two lines (title, then the state as a word with the time and
 * the body), one visible control, and the row's verbs — exactly the projected
 * set, primary first — behind a "⋯". The destination link renders only for an
 * owner-scoped path and never marks the notice read on the way out (a history
 * surface does not answer on the reader's behalf).
 *
 * The verbs' behaviour is `notification-row-actions.test.tsx`'s; this file
 * proves the row draws them where A.5 says and adds or removes none.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { noticeHandlerSpies, noticeRow } from "@/test/notification-verb-fixtures";

import { getNotificationActionCopy } from "./action-copy";
import { getNotificationSettingsCopy } from "./copy";
import { NotificationHistoryRow } from "./notification-history-row";
import { getVerbCopy } from "./verbs";

const ZONE = "America/Sao_Paulo";

afterEach(cleanup);

function renderRow(options: Parameters<typeof noticeRow>[0] = {}) {
  const row = noticeRow(options);
  const spies = noticeHandlerSpies();
  render(
    <ul>
      <NotificationHistoryRow createdAtLabel="04/11, 14:00" handlers={spies.handlers} locale="pt-BR" row={row} timeZone={ZONE} />
    </ul>,
  );
  return { row, spies };
}

describe("NotificationHistoryRow — two lines, one visible control", () => {
  it("says the state as a word, beside the time and the body", () => {
    const { row } = renderRow({ source: { status: "unread", title: "Tarefa atrasada", body: "Pagar a conta de luz" } });
    const item = screen.getByRole("listitem");
    expect(item).toHaveAttribute("data-status", "unread");
    expect(within(item).getByText("Tarefa atrasada")).toBeInTheDocument();
    expect(within(item).getByText(getNotificationSettingsCopy("pt-BR").unreadBadge)).toBeInTheDocument();
    expect(within(item).getByText("04/11, 14:00")).toBeInTheDocument();
    expect(within(item).getByText(row.notification.body)).toBeInTheDocument();
  });

  it("offers the destination as a plain link named after the row, and marks nothing", async () => {
    const { spies } = renderRow({ source: { action_url: "/pt-BR/app/tasks/abc", title: "Tarefa atrasada" } });
    const copy = getNotificationSettingsCopy("pt-BR");
    const link = screen.getByRole("link", { name: `${copy.openDestination}: Tarefa atrasada` });
    expect(link).toHaveAttribute("href", "/pt-BR/app/tasks/abc");
    await userEvent.click(link);
    expect(spies.markAction).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example/x", "//evil.example", "javascript:alert(1)", null])(
    "renders no link for a destination outside the owner's app (%s)",
    (actionUrl) => {
      renderRow({ source: { action_url: actionUrl } });
      expect(screen.queryByRole("link")).toBeNull();
    },
  );

  it("draws no verb as a visible button: the primary waits first in the menu", async () => {
    const { row } = renderRow({ source: { status: "unread" } });
    expect(row.primaryVerb, "the fixture must have a primary verb").not.toBeNull();
    const verbCopy = getVerbCopy("pt-BR");
    const primaryName = verbCopy[row.primaryVerb!.id].accessibleName(row.subjectLabel);
    expect(screen.queryByRole("button", { name: primaryName })).toBeNull();

    const trigger = screen.getByRole("button", { name: getNotificationActionCopy("pt-BR").menuLabel(row.subjectLabel) });
    await userEvent.click(trigger);
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    const expected = [row.primaryVerb!, ...row.menuVerbs].map((verb) => verbCopy[verb.id].accessibleName(row.subjectLabel));
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(expected);
  });
});
