/**
 * The Avisos page's notice row (Life Brain A.5, recomposed by Editorial calmo,
 * ADR-180).
 *
 * What it owes: what the notice is about as its subject, one caption (the kind
 * of notice and the time), the state as a word, and the row's verbs — exactly
 * the projected set. An unanswered notice shows its primary verb and keeps the
 * rest behind a "⋯"; a read one keeps them all there, primary first. The
 * destination link renders only for an owner-scoped path and never marks the
 * notice read on the way out (this surface does not answer on the reader's
 * behalf).
 *
 * The verbs' behaviour is `notification-row-actions.test.tsx`'s; this file
 * proves the row draws them where the design says and adds or removes none.
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

describe("NotificationHistoryRow — a subject, one caption, one visible verb", () => {
  it("is headed by what the notice is about, with its kind and time as the caption", () => {
    renderRow({ source: { title: "Tarefa atrasada", body: "Pagar a conta de luz" } });
    const item = screen.getByRole("listitem");
    expect(item.querySelector(".notification-item-subject")).toHaveTextContent("Pagar a conta de luz");
    const caption = item.querySelector(".notification-item-meta");
    expect(caption?.querySelector(".notification-item-kind")).toHaveTextContent("Tarefa atrasada");
    expect(caption?.querySelector(".notification-item-time")).toHaveTextContent("04/11, 14:00");
  });

  it("is headed by its title when it has no body, and does not say the title twice", () => {
    renderRow({ source: { title: "Resumo do dia", body: "  " } });
    const item = screen.getByRole("listitem");
    expect(item.querySelector(".notification-item-subject")).toHaveTextContent("Resumo do dia");
    expect(item.querySelector(".notification-item-kind")).toBeNull();
    expect(within(item).getAllByText("Resumo do dia")).toHaveLength(1);
  });
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

  it("shows an unanswered notice's primary verb, and keeps the rest behind the menu", async () => {
    const { row } = renderRow({ source: { status: "unread" } });
    expect(row.primaryVerb, "the fixture must have a primary verb").not.toBeNull();
    const verbCopy = getVerbCopy("pt-BR");
    const primaryName = verbCopy[row.primaryVerb!.id].accessibleName(row.subjectLabel);
    expect(screen.getByRole("button", { name: primaryName })).toBeInTheDocument();
    // One visible verb: every other button at rest is the menu's trigger.
    expect(screen.getAllByRole("button")).toHaveLength(2);

    const trigger = screen.getByRole("button", { name: getNotificationActionCopy("pt-BR").menuLabel(row.subjectLabel) });
    await userEvent.click(trigger);
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    const expected = row.menuVerbs.map((verb) => verbCopy[verb.id].accessibleName(row.subjectLabel));
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(expected);
  });

  it("draws no verb on a notice already read: the primary waits first in the menu", async () => {
    const { row } = renderRow({ source: { status: "read" } });
    expect(row.primaryVerb, "the fixture must have a primary verb").not.toBeNull();
    const verbCopy = getVerbCopy("pt-BR");
    const primaryName = verbCopy[row.primaryVerb!.id].accessibleName(row.subjectLabel);
    expect(screen.queryByRole("button", { name: primaryName })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    const trigger = screen.getByRole("button", { name: getNotificationActionCopy("pt-BR").menuLabel(row.subjectLabel) });
    await userEvent.click(trigger);
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    const expected = [row.primaryVerb!, ...row.menuVerbs].map((verb) => verbCopy[verb.id].accessibleName(row.subjectLabel));
    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual(expected);
  });

  it("puts the row's link after its verbs, so the document reads subject, verbs, open", () => {
    renderRow({ source: { status: "unread", action_url: "/pt-BR/app/tasks/abc" } });
    const item = screen.getByRole("listitem");
    const controls = [...item.querySelectorAll("button, a")];
    expect(controls.at(-1)?.tagName).toBe("A");
  });
});
