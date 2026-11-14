import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import type { NotificationBulkState } from "./bulk-state";
import { NotificationBulkBar } from "./notification-bulk-bar";

afterEach(() => {
  cleanup();
  refresh.mockReset();
});

const AUDIT = "2f4b0001-0000-4000-8000-0000000000aa";

function applied(): NotificationBulkState {
  return { status: "applied", scope: "mark_all_read", count: 3, message: "3 avisos marcados como lidos.", undo: { auditId: AUDIT, expiresAt: "2026-11-13T15:00:00.000Z" } };
}

function bar(overrides: Partial<Parameters<typeof NotificationBulkBar>[0]> = {}) {
  const applyAction = vi.fn(async () => applied());
  const undoAction = vi.fn(async (): Promise<NotificationBulkState> => ({ status: "undone", scope: "mark_all_read", count: 3, message: "Desfeito: 3 avisos voltaram como estavam.", undo: null }));
  const props = { applyAction, undoAction, locale: "pt-BR" as const, readCount: 2, unreadCount: 3, ...overrides };
  const view = render(<NotificationBulkBar {...props} />);
  return { ...view, applyAction, undoAction, props };
}

describe("NotificationBulkBar", () => {
  it("offers each verb only when it has something to act on", () => {
    bar({ unreadCount: 0, readCount: 4 });
    expect(screen.queryByRole("button", { name: "Marcar todos como lidos" })).toBeNull();
    expect(screen.getByRole("button", { name: "Limpar os lidos" })).toBeInTheDocument();
  });

  it("sends the scope, announces the outcome and offers the undo", async () => {
    const user = userEvent.setup();
    const { applyAction } = bar();
    await user.click(screen.getByRole("button", { name: "Marcar todos como lidos" }));
    await waitFor(() => expect(applyAction).toHaveBeenCalled());
    const sent = (applyAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("scope")).toBe("mark_all_read");
    expect(sent.get("locale")).toBe("pt-BR");
    expect(await screen.findByRole("status")).toHaveTextContent("3 avisos marcados como lidos.");
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("keeps the undo after the refresh empties the counts", async () => {
    const user = userEvent.setup();
    const { rerender, props, undoAction } = bar();
    await user.click(screen.getByRole("button", { name: "Marcar todos como lidos" }));
    await screen.findByRole("button", { name: "Desfazer" });

    rerender(<NotificationBulkBar {...props} readCount={5} unreadCount={0} />);
    const undo = screen.getByRole("button", { name: "Desfazer" });
    await user.click(undo);
    await waitFor(() => expect(undoAction).toHaveBeenCalled());
    const sent = (undoAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(sent.get("auditId")).toBe(AUDIT);
    expect(await screen.findByText("Desfeito: 3 avisos voltaram como estavam.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
  });

  it("keeps an empty live region in the page before anything happens", () => {
    bar({ readCount: 0, unreadCount: 0 });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
