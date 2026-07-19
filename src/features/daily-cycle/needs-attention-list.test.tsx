import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { NeedsAttentionList, type LoadMoreNeedsAttention } from "./needs-attention-list";
import type { NeedsAttentionItemView } from "./contracts";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  NeedsAttentionViewed: vi.fn(() => null),
  recordNeedsAttentionItemOpened: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function item(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: overrides.key ?? "entry-1:confirm_existing_candidates",
    kind: "confirm_existing_candidates",
    entryId: "entry-1",
    title: "Ligar para a Marina",
    explanation: "Há tarefas sugeridas prontas para sua confirmação.",
    primaryAction: { id: "confirm_existing_candidates", href: "/pt-BR/app/inbox/entry-1" },
    occurredAt: "2026-07-18T12:00:00.000Z",
    groupKey: "entry-1",
    ...overrides,
  };
}

describe("NeedsAttentionList", () => {
  it("renders every initial item", () => {
    render(
      <NeedsAttentionList
        initialItems={[item(), item({ key: "entry-2:review_interpretation", entryId: "entry-2", title: "Revisar orçamento" })]}
        initialCursor={null}
        initialHasNext={false}
        locale="pt-BR"
        loadMore={vi.fn()}
      />,
    );

    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(screen.getByText("Revisar orçamento")).toBeInTheDocument();
    expect(NeedsAttentionViewed).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 2, locale: "pt-BR", surface: "needs_attention" }),
      undefined,
    );
  });

  it("does not render a load-more control when there is no next page", () => {
    render(
      <NeedsAttentionList initialItems={[item()]} initialCursor={null} initialHasNext={false} locale="pt-BR" loadMore={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
  });

  it("appends the returned page to the existing items and forwards the current cursor", async () => {
    const user = userEvent.setup();
    const cursor = { occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" };
    const nextItem = item({ key: "entry-2:review_interpretation", entryId: "entry-2", title: "Revisar orçamento" });
    const loadMore: LoadMoreNeedsAttention = vi.fn(async (): Promise<Awaited<ReturnType<LoadMoreNeedsAttention>>> => ({
      ok: true,
      page: { items: [nextItem], hasNext: false, nextCursor: null },
    }));

    render(
      <NeedsAttentionList initialItems={[item()]} initialCursor={cursor} initialHasNext={true} locale="pt-BR" loadMore={loadMore} />,
    );

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(loadMore).toHaveBeenCalledWith(cursor, "pt-BR");
    expect(await screen.findByText("Revisar orçamento")).toBeInTheDocument();
    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
  });

  it("preserves already-loaded items and shows an error when a subsequent page fails, without auto-retrying", async () => {
    const user = userEvent.setup();
    const cursor = { occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" };
    const loadMore: LoadMoreNeedsAttention = vi.fn(async (): Promise<Awaited<ReturnType<LoadMoreNeedsAttention>>> => ({ ok: false, code: "action_failed" }));

    render(
      <NeedsAttentionList initialItems={[item()]} initialCursor={cursor} initialHasNext={true} locale="pt-BR" loadMore={loadMore} />,
    );

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar mais itens agora.");
    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeEnabled();
  });

  it("disables the load-more button while a request is in flight to prevent duplicate calls", async () => {
    const user = userEvent.setup();
    const cursor = { occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" };
    let resolvePage: (value: Awaited<ReturnType<LoadMoreNeedsAttention>>) => void = () => {};
    const loadMore: LoadMoreNeedsAttention = vi.fn(
      () => new Promise<Awaited<ReturnType<LoadMoreNeedsAttention>>>((resolve) => { resolvePage = resolve; }),
    );

    render(
      <NeedsAttentionList initialItems={[item()]} initialCursor={cursor} initialHasNext={true} locale="pt-BR" loadMore={loadMore} />,
    );

    const button = screen.getByRole("button", { name: /Carregar mais/ });
    await user.click(button);
    expect(button).toBeDisabled();

    await act(async () => {
      resolvePage({ ok: true, page: { items: [], hasNext: false, nextCursor: null } });
    });
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("localizes the load-more label and error message in English", async () => {
    const user = userEvent.setup();
    const cursor = { occurredAt: "2026-07-18T12:00:00.000Z", entryId: "entry-1" };
    const loadMore: LoadMoreNeedsAttention = vi.fn(async (): Promise<Awaited<ReturnType<LoadMoreNeedsAttention>>> => ({ ok: false, code: "session_expired" }));

    render(
      <NeedsAttentionList initialItems={[item()]} initialCursor={cursor} initialHasNext={true} locale="en" loadMore={loadMore} />,
    );

    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your session expired. Sign in again.");
  });
});
