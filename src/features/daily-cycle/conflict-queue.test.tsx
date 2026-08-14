import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recordNeedsAttentionItemOpened } from "@/features/product-analytics/interaction-events";
import { NeedsAttentionList } from "./needs-attention-list";
import type { Bounded } from "@/features/bounds/contracts";
import type { ConflictAttentionItemView, NeedsAttentionItemView } from "./contracts";

/**
 * `2N-CONFLICT-003`/`004`/`005`. A conflict enters **the existing queue** — the
 * same page, the same list container, the same filter row — and this file proves
 * the seven properties the slice promised: it appears when there is one, does not
 * when there is not, does not duplicate, does not appear for a foreign or absent
 * memory, never enters without an action, and never takes over the meaning of
 * `resolve_consistency`.
 */

const OWNER_TIME_ZONE = "America/Sao_Paulo";
const MEMORY_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  NeedsAttentionViewed: vi.fn(() => null),
  recordNeedsAttentionItemOpened: vi.fn(),
  recordAttentionItemResolved: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function entryItem(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "entry-1:confirm_existing_candidates",
    kind: "confirm_existing_candidates",
    entryId: "entry-1",
    title: "Ligar para a Marina",
    explanation: "Há tarefas sugeridas prontas para sua confirmação.",
    primaryAction: { id: "confirm_existing_candidates", href: "/pt-BR/app/inbox/entry-1" },
    occurredAt: "2026-07-18T12:00:00.000Z",
    groupKey: "entry-1",
    sensitivity: "normal" as const,
    ...overrides,
  };
}

function conflict(overrides: Partial<ConflictAttentionItemView> = {}): ConflictAttentionItemView {
  return {
    key: `${MEMORY_ID}:memory_validity_window`,
    reason: "resolve_validity_conflict",
    memoryId: MEMORY_ID,
    content: "Trabalho na Acme",
    sensitivity: "normal",
    validFrom: "2026-09-01T12:00:00.000Z",
    validUntil: "2026-08-01T12:00:00.000Z",
    action: { id: "resolve_validity_conflict", href: `/pt-BR/app/memories/${MEMORY_ID}` },
    ...overrides,
  };
}

function conflicts(items: ConflictAttentionItemView[], bounded = false): Bounded<ConflictAttentionItemView> {
  return { items, bounded, limit: 20 };
}

function renderQueue({
  items = [entryItem()],
  conflictList,
  locale = "pt-BR" as const,
}: {
  items?: NeedsAttentionItemView[];
  conflictList?: Bounded<ConflictAttentionItemView>;
  locale?: "pt-BR" | "en";
} = {}) {
  return render(
    <NeedsAttentionList
      agentName="Brain"
      conflicts={conflictList}
      initialCursor={null}
      initialHasNext={false}
      initialItems={items}
      loadMore={vi.fn()}
      locale={locale}
      timeZone={OWNER_TIME_ZONE}
    />,
  );
}

/**
 * The conflict rows, scoped to their own region.
 *
 * The filter chip carries the same words as the row title -- as every other chip
 * in this list already does -- so a document-wide text query would match the
 * control and the item it filters. Scoping asserts the thing under test rather
 * than weakening the assertion to a partial match.
 */
function conflictRegion() {
  return within(screen.getByRole("region", { name: /não podem estar certas|cannot both be right/ }));
}

function hasConflictRows() {
  return screen.queryByRole("region", { name: /não podem estar certas|cannot both be right/ }) !== null;
}

describe("a conflict in the existing queue", () => {
  it("appears when there is one", () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    expect(conflictRegion().getByText("Duas datas que não podem estar certas")).toBeInTheDocument();
    // And the entry rows are still there — one queue, not two.
    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
  });

  it("does not appear when there is none", () => {
    renderQueue({ conflictList: conflicts([]) });
    expect(hasConflictRows()).toBe(false);
  });

  /**
   * A caller that never ran the derivation — a preview, or a surface from before
   * this slice — renders no conflict and no bound notice, rather than a notice
   * claiming more exist.
   */
  it("does not appear when the caller passes nothing at all", () => {
    renderQueue({});
    expect(hasConflictRows()).toBe(false);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("does not appear for a memory that is absent or foreign — both arrive as an empty list", () => {
    // Under RLS a foreign memory and a deleted one are the same read: no row. The
    // queue's behaviour for both is therefore identical by construction.
    renderQueue({ conflictList: conflicts([]) });
    expect(screen.queryByRole("link", { name: /Acme/ })).not.toBeInTheDocument();
  });

  it("does not duplicate the same problem", () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    expect(conflictRegion().getAllByText("Duas datas que não podem estar certas")).toHaveLength(1);
  });

  it("shows two different memories as two items", () => {
    const other = conflict({
      key: "22222222-2222-4222-8222-222222222222:memory_validity_window",
      memoryId: "22222222-2222-4222-8222-222222222222",
      content: "Moro em Lisboa",
      action: { id: "resolve_validity_conflict", href: "/pt-BR/app/memories/22222222-2222-4222-8222-222222222222" },
    });
    renderQueue({ conflictList: conflicts([conflict(), other]) });
    expect(conflictRegion().getAllByText("Duas datas que não podem estar certas")).toHaveLength(2);
    expect(screen.getByText("Trabalho na Acme")).toBeInTheDocument();
    expect(screen.getByText("Moro em Lisboa")).toBeInTheDocument();
  });

  /** `2N-CONFLICT-005`. Every conflict row carries a reachable action. */
  it("never renders a conflict without an action", () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    const link = screen.getByRole("link", { name: /Duas datas/ });
    expect(link).toHaveAttribute("href", `/pt-BR/app/memories/${MEMORY_ID}`);
  });

  /**
   * The regression this slice exists not to cause. `resolve_consistency` still
   * means *one entry the assistant could not organize*, and its sentence must not
   * have moved onto the conflict row.
   */
  it("leaves resolve_consistency's meaning untouched", () => {
    renderQueue({
      items: [entryItem({
        key: "entry-9:resolve_consistency",
        kind: "resolve_consistency",
        entryId: "entry-9",
        title: "Registro preservado",
        explanation: "Encontramos uma inconsistência e preservamos o registro para sua revisão.",
        primaryAction: { id: "resolve_consistency", href: "/pt-BR/app/inbox/entry-9" },
      })],
      conflictList: conflicts([conflict()]),
    });

    expect(screen.getByText("Encontramos uma inconsistência e preservamos o registro para sua revisão.")).toBeInTheDocument();
    expect(screen.getByText(/começa depois da data em que deveria terminar/)).toBeInTheDocument();
    // Two rows, two sentences, two links: the entry's and the memory's.
    expect(screen.getByRole("link", { name: /Registro preservado/ })).toHaveAttribute("href", "/pt-BR/app/inbox/entry-9");
    expect(screen.getByRole("link", { name: /Duas datas/ })).toHaveAttribute("href", `/pt-BR/app/memories/${MEMORY_ID}`);
  });

  /**
   * `needs_attention_item_opened` validates its reason against a five-member enum
   * inside Postgres. A conflict row that fired it would raise `22023` in
   * production while every test here passed.
   */
  it("records no analytics event when the conflict is opened", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    await userEvent.click(screen.getByRole("link", { name: /Duas datas/ }));
    expect(recordNeedsAttentionItemOpened).not.toHaveBeenCalled();
  });

  it("still records the event for an entry row beside it", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    await userEvent.click(screen.getByRole("link", { name: /Ligar para a Marina/ }));
    expect(recordNeedsAttentionItemOpened).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordNeedsAttentionItemOpened).mock.calls[0][0].attentionReason).toBe("confirm_existing_candidates");
  });

  it("reports the bound when the derivation was truncated", () => {
    renderQueue({ conflictList: conflicts([conflict()], true) });
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("reports no bound when it was not", () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("the filter, widened by exactly one", () => {
  it("offers a conflict chip when there is a conflict and another type", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    expect(screen.getByRole("button", { name: "Duas datas que não podem estar certas" })).toBeInTheDocument();
  });

  it("offers no chip row when a conflict is the only type present", () => {
    renderQueue({ items: [], conflictList: conflicts([conflict()]) });
    expect(screen.queryByRole("button", { name: "Duas datas que não podem estar certas" })).not.toBeInTheDocument();
    // The row itself is still there — the chip is a filter, not the item.
    expect(conflictRegion().getByText("Duas datas que não podem estar certas")).toBeInTheDocument();
  });

  it("narrows to conflicts only, hiding the entry rows", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    await userEvent.click(screen.getByRole("button", { name: "Duas datas que não podem estar certas" }));
    expect(screen.getByText("Trabalho na Acme")).toBeInTheDocument();
    expect(screen.queryByText("Ligar para a Marina")).not.toBeInTheDocument();
  });

  /**
   * Conflicts obey the filter like everything else. Leaving them always visible
   * would make "filter by type" mean "filter the entry rows", a control that lies
   * about its own scope.
   */
  it("hides conflicts when another type is selected", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    await userEvent.click(screen.getByRole("button", { name: "Decida sobre as sugestões" }));
    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(hasConflictRows()).toBe(false);
  });

  it("does not print the empty-filtered sentence above a visible conflict", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    await userEvent.click(screen.getByRole("button", { name: "Duas datas que não podem estar certas" }));
    expect(screen.queryByText("Nenhum item deste tipo entre os carregados.")).not.toBeInTheDocument();
  });

  it("returns everything when 'all' is selected again", async () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    await userEvent.click(screen.getByRole("button", { name: "Duas datas que não podem estar certas" }));
    await userEvent.click(screen.getByRole("button", { name: "Tudo" }));
    expect(screen.getByText("Ligar para a Marina")).toBeInTheDocument();
    expect(conflictRegion().getByText("Duas datas que não podem estar certas")).toBeInTheDocument();
  });
});

describe("in English", () => {
  it("renders the whole conflict row in en", () => {
    renderQueue({
      conflictList: conflicts([conflict()]),
      locale: "en",
    });
    expect(conflictRegion().getByText("Two dates that cannot both be right")).toBeInTheDocument();
    expect(screen.getByText("Starts on")).toBeInTheDocument();
    expect(screen.getByText("Open memory and fix")).toBeInTheDocument();
  });

  it("labels the conflict group in en", () => {
    renderQueue({ conflictList: conflicts([conflict()]), locale: "en" });
    expect(screen.getByRole("region", { name: "Facts that cannot both be right" })).toBeInTheDocument();
  });

  it("labels the conflict group in pt-BR", () => {
    renderQueue({ conflictList: conflicts([conflict()]) });
    expect(screen.getByRole("region", { name: "Informações que não podem estar certas ao mesmo tempo" })).toBeInTheDocument();
  });
});
