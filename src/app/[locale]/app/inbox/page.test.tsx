import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `BYOK-CAPTURE-002` on the surface, not only in the projection.
 *
 * `inbox-projection.test.ts` proves the `awaiting-ai` view returns the right
 * rows. It cannot see any of what this file is about: whether the chip that
 * reaches that view is offered at all, whether the notice on needs-you states a
 * capped count as an exact one, or whether an owner who has resolved every such
 * entry lands on a chip row in which nothing is current.
 *
 * The independent review named the gap exactly — the fix for that finding had no
 * test above the projection layer.
 */
vi.mock("server-only", () => ({}));

import { loadAttentionProjection } from "@/features/daily-cycle/attention-projection";
import { loadMemoryConflicts } from "@/features/daily-cycle/conflict-projection";
import { loadInboxProjection } from "@/features/daily-cycle/inbox-projection";
import { loadPendingEntryCount } from "@/features/byok/pending-entries";
import { requireUser } from "@/lib/auth/require-user";
import InboxPage from "./page";

vi.mock("@/features/daily-cycle/attention-projection", () => ({ loadAttentionProjection: vi.fn() }));
vi.mock("@/features/daily-cycle/conflict-projection", () => ({ loadMemoryConflicts: vi.fn() }));
vi.mock("@/features/daily-cycle/inbox-projection", async (importOriginal) => ({
  // The view vocabulary and its type guard are real — a mocked `isInboxView`
  // would let this file accept a `?view=` the product refuses.
  ...(await importOriginal<Record<string, unknown>>()),
  loadInboxProjection: vi.fn(),
}));
vi.mock("@/features/byok/pending-entries", () => ({ loadPendingEntryCount: vi.fn() }));
/*
  Slice 2S.3. The needs-you branch composes a FOURTH independent read — the
  unanswered notices — and mounts their verbs, so two more modules reach
  `server-only` before this page renders anything: the loader, and the one
  bundle of authorities every surface dispatches through (`2S-TRUST-010`).
*/
vi.mock("@/features/notifications/attention-notices", () => ({
  loadAttentionNotices: vi.fn(async () => ({ items: [], hasMore: false })),
  ATTENTION_NOTICE_QUEUE_LIMIT: 20,
}));
vi.mock("@/features/notifications/verb-handlers", () => ({
  NOTIFICATION_VERB_HANDLERS: {
    markAction: vi.fn(), suppressAction: vi.fn(), workAction: vi.fn(),
    detailAction: vi.fn(), undoAction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/profile/agent-identity", () => ({ getAgentName: vi.fn(async () => "Brain") }));
vi.mock("@/features/profile/owner-timezone", () => ({ getOwnerTimeZone: vi.fn(async () => "America/Sao_Paulo") }));
vi.mock("@/features/interpretations/actions", () => ({ reprocessEntry: vi.fn() }));
vi.mock("@/features/daily-cycle/attention-actions", () => ({ loadMoreNeedsAttention: vi.fn() }));
vi.mock("@/features/agent/conversational-questions", () => ({ ConversationalQuestions: () => null }));
vi.mock("@/features/product-analytics/interaction-events", () => ({ NeedsAttentionViewed: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function arrange({ count, atLeast = false }: { count: number; atLeast?: boolean }) {
  vi.mocked(requireUser).mockResolvedValue({ supabase: {}, user: { id: "user-1" } } as never);
  vi.mocked(loadAttentionProjection).mockResolvedValue({ items: [], hasNext: false, nextCursor: null });
  vi.mocked(loadMemoryConflicts).mockResolvedValue({ items: [], bounded: false, limit: 0 } as never);
  vi.mocked(loadInboxProjection).mockResolvedValue({ items: [], hasNext: false });
  vi.mocked(loadPendingEntryCount).mockResolvedValue({ count, atLeast });
}

const open = (view?: string) => InboxPage({
  params: Promise.resolve({ locale: "pt-BR" }),
  searchParams: Promise.resolve(view === undefined ? {} : { view }),
});

describe("Registros: the entries waiting on an AI key", () => {
  it("says so on the view the owner lands on, with both acts as links", async () => {
    arrange({ count: 3 });
    const { container } = render(await open());

    const notice = container.querySelector(".records-notice");
    expect(notice).not.toBeNull();
    expect(notice).toHaveTextContent("3 registros foram salvos sem ser interpretados");
    expect(within(notice as HTMLElement).getByRole("link", { name: "Ver esses registros" }))
      .toHaveAttribute("href", "/pt-BR/app/inbox?view=awaiting-ai");
    expect(within(notice as HTMLElement).getByRole("link", { name: "Configurar a chave" })).toBeVisible();
  });

  /*
    `loadPendingEntryCount` caps at its ceiling and returns `atLeast` beside the
    number so a capped count is never printed as an exact one. An owner with
    seven hundred stuck entries must not be told they have exactly five hundred.
  */
  it("marks a capped count instead of stating the ceiling as a fact", async () => {
    arrange({ count: 500, atLeast: true });
    const { container } = render(await open());

    expect(container.querySelector(".records-notice")).toHaveTextContent("500+ registros");
  });

  it("uses the singular only for a real one", async () => {
    arrange({ count: 1 });
    const { container } = render(await open());

    expect(container.querySelector(".records-notice")).toHaveTextContent("1 registro foi salvo");
  });

  it("says nothing at all when nothing is waiting", async () => {
    arrange({ count: 0 });
    const { container } = render(await open());

    expect(container.querySelector(".records-notice")).toBeNull();
    // And the chip is not offered either: a filter that would yield nothing is
    // a control that lies.
    expect(screen.queryByRole("link", { name: "Sem chave de IA" })).toBeNull();
  });

  it("offers the chip once there is something behind it", async () => {
    arrange({ count: 2 });
    render(await open());

    expect(screen.getByRole("link", { name: "Sem chave de IA" }))
      .toHaveAttribute("href", "/pt-BR/app/inbox?view=awaiting-ai");
  });

  /*
    The trap the conditional chip would otherwise be. A deep link to
    `?view=awaiting-ai` on an account that has since resolved every such entry
    would render a chip row in which no chip is current, and `aria-current`
    would point at nothing.
  */
  it("keeps the chip on the view you are standing on, even when it is now empty", async () => {
    arrange({ count: 0 });
    render(await open("awaiting-ai"));

    const chip = screen.getByRole("link", { name: "Sem chave de IA" });
    expect(chip).toHaveAttribute("aria-current", "page");
    // The empty copy is the view's own, never the first-use sentence.
    expect(screen.getByText("Nenhum registro esperando por uma chave de IA.")).toBeVisible();
  });

  it("does not raise the notice on the full archive", async () => {
    arrange({ count: 4 });
    const { container } = render(await open("all"));

    // Four rows among two hundred is not a banner.
    expect(container.querySelector(".records-notice")).toBeNull();
    expect(screen.getByRole("link", { name: "Sem chave de IA" })).toBeVisible();
  });
});
