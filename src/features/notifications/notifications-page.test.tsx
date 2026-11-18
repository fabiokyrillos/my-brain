/**
 * The Avisos page, rendered (Editorial calmo, ADR-180).
 *
 * `page-outline.test.ts` reads the route's source for what must stay mounted.
 * This file renders it, for what a reader meets and in which order: the count
 * of unanswered notices first, those notices under it, and the ones already
 * read after them — folded once there are more than a few beside something
 * still unanswered.
 *
 * The loaders are mocked at the route's own seams; the rows are projected by
 * the real verb authority through `noticeRow`.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/pt-BR/app/notifications",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/calendar/calendar-projection", () => ({
  requireProfileTimeZone: vi.fn(async () => "America/Sao_Paulo"),
}));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: vi.fn(async () => "Michael") }));
vi.mock("@/features/notifications/bulk-actions", () => ({
  applyNotificationBulk: vi.fn(),
  undoNotificationBulk: vi.fn(),
}));
vi.mock("@/features/notifications/verb-handlers", () => ({
  NOTIFICATION_VERB_HANDLERS: {
    markAction: vi.fn(),
    suppressAction: vi.fn(),
    workAction: vi.fn(),
    detailAction: vi.fn(),
    undoAction: vi.fn(),
  },
}));
vi.mock("@/features/notifications/row-projection", () => ({ projectNotificationRows: vi.fn() }));

import NotificationsPage from "@/app/[locale]/app/notifications/page";
import { requireUser } from "@/lib/auth/require-user";
import { noticeRow, noticeSource } from "@/test/notification-verb-fixtures";

import { projectNotificationRows } from "./row-projection";

afterEach(cleanup);

type Status = "unread" | "read";

function source(index: number, status: Status) {
  return noticeSource({
    id: `aaaaaaa${index}-1111-4111-8111-111111111111`,
    body: `Assunto ${index}`,
    title: "Tarefa atrasada",
    status,
    created_at: `2026-11-1${index}T12:00:00.000Z`,
  });
}

/** A client that answers the list read and the two head counts. */
function client(rows: readonly unknown[], counts: Readonly<Record<Status, number>>) {
  return {
    from: () => {
      let status = "";
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "order", "range", "neq"]) chain[method] = () => chain;
      chain.eq = (column: string, value: string) => {
        if (column === "status") status = value;
        return chain;
      };
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows, error: null, count: counts[status as Status] ?? 0 });
      return chain;
    },
  };
}

async function renderPage(statuses: readonly Status[], locale: "pt-BR" | "en" = "pt-BR") {
  const sources = statuses.map((status, index) => source(index + 1, status));
  const unread = statuses.filter((status) => status === "unread").length;
  vi.mocked(requireUser).mockResolvedValue({
    supabase: client(sources, { unread, read: statuses.length - unread }),
    user: { id: "u1" },
  } as never);
  vi.mocked(projectNotificationRows).mockResolvedValue(sources.map((item) => noticeRow({ source: item })));
  return render(
    await NotificationsPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }),
  );
}

const subjects = (root: ParentNode) =>
  [...root.querySelectorAll(".notification-item-subject")].map((node) => node.textContent);

describe("the Avisos page: what is unanswered comes first", () => {
  it("opens with the count of unread notices and the verb that answers them all", async () => {
    const { container } = await renderPage(["read", "unread", "read", "unread"]);
    const head = container.querySelector(".notification-group-head");
    expect(head).not.toBeNull();
    expect(within(head as HTMLElement).getByRole("status")).toHaveTextContent("2 avisos não lidos.");
    expect(within(head as HTMLElement).getByRole("button", { name: "Marcar todos como lidos" })).toBeInTheDocument();
    // Nothing but the way back and the title stands before it.
    const section = container.querySelector(".notification-history") as HTMLElement;
    expect(section.querySelector("p, ul, details")).toBe(within(head as HTMLElement).getByRole("status"));
  });

  it("lists the unread notices before the read ones, each group in the order it arrived", async () => {
    const { container } = await renderPage(["read", "unread", "read", "unread"]);
    expect(subjects(container)).toEqual(["Assunto 2", "Assunto 4", "Assunto 1", "Assunto 3"]);
    const read = container.querySelector("details.notification-read") as HTMLElement;
    expect(subjects(read)).toEqual(["Assunto 1", "Assunto 3"]);
    expect(within(read).getByText("Já lidos")).toBeInTheDocument();
    expect(read.querySelector(".notification-read-count")).toHaveTextContent("2");
  });

  it("leaves a few read notices in view beside unread ones", async () => {
    const { container } = await renderPage(["unread", "read", "read", "read"]);
    expect(container.querySelector("details.notification-read")).toHaveAttribute("open");
  });

  it("folds the read notices once there are many beside something unanswered", async () => {
    const { container } = await renderPage(["unread", "read", "read", "read", "read"]);
    const read = container.querySelector("details.notification-read") as HTMLElement;
    expect(read).not.toHaveAttribute("open");
    // Folded, not dropped: the rows and their count are still in the document.
    expect(subjects(read)).toHaveLength(4);
    expect(read.querySelector("summary")).toHaveTextContent("Já lidos4");
  });

  it("shows the read notices when nothing is unanswered, however many there are", async () => {
    const { container } = await renderPage(["read", "read", "read", "read", "read", "read"]);
    expect(container.querySelector("details.notification-read")).toHaveAttribute("open");
    expect(container.querySelector(".notification-unread-summary")).toHaveTextContent("Nenhum aviso não lido.");
    expect(screen.queryByRole("button", { name: "Marcar todos como lidos" })).toBeNull();
  });

  it("offers `Limpar os lidos` after the read notices, and nowhere when there are none", async () => {
    const { container } = await renderPage(["unread", "read"]);
    const read = container.querySelector("details.notification-read") as HTMLElement;
    const clear = within(read).getByRole("button", { name: "Limpar os lidos" });
    const lastRow = [...read.querySelectorAll("li")].at(-1) as HTMLElement;
    expect(lastRow.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    cleanup();
    await renderPage(["unread"]);
    expect(screen.queryByRole("button", { name: "Limpar os lidos" })).toBeNull();
    expect(document.querySelector("details.notification-read")).toBeNull();
  });

  it("keeps the one way to the preferences as the page's last link", async () => {
    const { container } = await renderPage(["unread", "read"]);
    const links = [...container.querySelectorAll("a")];
    expect(links.at(-1)).toHaveTextContent("Ajustar preferências de notificação");
    expect(links.filter((link) => link.textContent === "Ajustar preferências de notificação")).toHaveLength(1);
  });

  it("says one calm thing when there are no notices at all", async () => {
    const { container } = await renderPage([]);
    expect(container.querySelector(".notification-list")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("Tudo tranquilo")).toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("reads the same way in English", async () => {
    const { container } = await renderPage(["unread", "read"], "en");
    expect(container.querySelector(".notification-unread-summary")).toHaveTextContent("1 unread alert.");
    expect(within(container.querySelector("details") as HTMLElement).getByText("Already read")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Já lidos|não lido/);
  });
});
