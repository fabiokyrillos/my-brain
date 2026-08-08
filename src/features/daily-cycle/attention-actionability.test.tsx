/**
 * `2J-ATTN-005`, `2J-ATTN-007`, `2J-ATTN-008`, `2J-ATTN-010`, `2J-ATTN-012`
 * and `2J-PRIVACY-001`/`004`/`005`, on the surface that already existed.
 *
 * `/app/inbox?view=needs-you` shipped before Phase 2J with tabs, the list and
 * keyset pagination — so `2J-ATTN-001` is **baseline**, not built. What this
 * slice adds is actionability: filters, in-place retry, bulk retry for the one
 * set that qualifies, and the sensitivity contract.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NeedsAttentionItemView, TrackedAttentionReason } from "./contracts";
import {
  NeedsAttentionList,
  type AttentionActionState,
  type RetryProcessingAction,
} from "./needs-attention-list";

/**
 * Typed through the generic rather than through named-but-unused parameters, so
 * `mock.calls[n][1]` is a `FormData` and the lint stays clean.
 */
const retryMock = () =>
  vi.fn<RetryProcessingAction>(async (): Promise<AttentionActionState> => ({
    status: "success",
    message: "",
  }));
const failingRetryMock = () =>
  vi.fn<RetryProcessingAction>(async (): Promise<AttentionActionState> => ({
    status: "error",
    message: "",
  }));

vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
  recordAttentionItemResolved: vi.fn(),
  NeedsAttentionViewed: () => null,
}));

afterEach(cleanup);

function item(
  kind: TrackedAttentionReason,
  overrides: Partial<NeedsAttentionItemView> = {},
): NeedsAttentionItemView {
  return {
    key: `${overrides.entryId ?? "entry-1"}:${kind}`,
    kind,
    entryId: overrides.entryId ?? "entry-1",
    title: `Título ${kind}`,
    explanation: "Explicação.",
    primaryAction: { id: kind, href: "/pt-BR/app/inbox/entry-1" },
    occurredAt: "2026-08-08T12:00:00.000Z",
    groupKey: overrides.entryId ?? "entry-1",
    sensitivity: "normal",
    ...overrides,
  };
}

const noLoadMore = vi.fn(async () => ({ ok: true as const, page: { items: [], hasNext: false, nextCursor: null } }));

function renderList(items: NeedsAttentionItemView[], retryAction?: RetryProcessingAction) {
  return render(
    <NeedsAttentionList
      initialItems={items}
      initialCursor={null}
      initialHasNext={false}
      locale="pt-BR"
      agentName="Brain"
      loadMore={noLoadMore}
      retryAction={retryAction}
    />,
  );
}

describe("2J-ATTN-007: only retry_processing resolves in place", () => {
  it("offers an inline retry for a failed entry", () => {
    renderList([item("retry_processing")], vi.fn());
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("offers no inline action for reasons that need the entry's context", () => {
    // Each of these is a decision, not a click. A one-tap version would either
    // guess for the user or drop them mid-flow -- so the row stays a link.
    for (const kind of [
      "review_interpretation",
      "confirm_existing_candidates",
      "answer_existing_question",
      "resolve_consistency",
    ] as const) {
      cleanup();
      renderList([item(kind)], vi.fn());
      expect(screen.queryByRole("button", { name: "Tentar de novo" }), kind).toBeNull();
      // ...and it is still reachable: navigating is the fallback, not a dead end.
      expect(screen.getByRole("link"), kind).toHaveAttribute("href", "/pt-BR/app/inbox/entry-1");
    }
  });

  it("calls the injected action with the entry and a locale, and nothing else", async () => {
    const action = retryMock();
    renderList([item("retry_processing")], action);

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const form = action.mock.calls[0]![1];
    expect(form.get("entryId")).toBe("entry-1");
    expect(form.get("locale")).toBe("pt-BR");
    expect(String(form.get("operationKey"))).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("does not offer retry at all when no action is injected", () => {
    // The surface cannot manufacture a write for itself. Without the action the
    // page owns, there is nothing to click.
    renderList([item("retry_processing")]);
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("stops offering retry for an item it already retried", async () => {
    const action = retryMock();
    renderList([item("retry_processing")], action);

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure without claiming the original was lost", async () => {
    const action = failingRetryMock();
    renderList([item("retry_processing")], action);

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent).toMatch(/original foi preservado/);
  });
});

describe("2J-ATTN-010: bulk is offered only for the set that qualifies", () => {
  it("offers bulk retry when more than one entry failed", () => {
    renderList(
      [
        item("retry_processing", { entryId: "e1" }),
        item("retry_processing", { entryId: "e2" }),
      ],
      vi.fn(),
    );
    expect(screen.getByRole("button", { name: /Tentar de novo tudo/ })).toBeInTheDocument();
  });

  it("does not offer bulk for a single item", () => {
    renderList([item("retry_processing")], vi.fn());
    expect(screen.queryByRole("button", { name: /Tentar de novo tudo/ })).toBeNull();
  });

  it("does not offer bulk across reasons that are not equivalent", () => {
    renderList(
      [
        item("review_interpretation", { entryId: "e1" }),
        item("answer_existing_question", { entryId: "e2" }),
      ],
      vi.fn(),
    );
    expect(screen.queryByRole("button", { name: /Tentar de novo tudo/ })).toBeNull();
  });

  it("retries each item independently, one call per entry", async () => {
    const action = retryMock();
    renderList(
      [
        item("retry_processing", { entryId: "e1" }),
        item("retry_processing", { entryId: "e2" }),
      ],
      action,
    );

    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo tudo/ }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const entryIds = action.mock.calls.map((call) => call[1].get("entryId"));
    expect(entryIds.sort()).toEqual(["e1", "e2"]);
    // Independently safe means separate operation keys, not one shared key.
    const keys = action.mock.calls.map((call) => call[1].get("operationKey"));
    expect(new Set(keys).size).toBe(2);
  });
});

describe("2J-ATTN-005: filtering narrows what is loaded, without a second query", () => {
  it("offers a chip only for reasons actually present", () => {
    renderList([item("retry_processing"), item("review_interpretation", { entryId: "e2" })], vi.fn());
    expect(screen.getByRole("button", { name: "Tudo" })).toBeInTheDocument();
    // `answer_existing_question` is absent from the data, so no chip advertises it.
    expect(screen.queryByRole("button", { name: /Responder/ })).toBeNull();
  });

  it("offers no filter control at all when one reason is present", () => {
    renderList([item("retry_processing"), item("retry_processing", { entryId: "e2" })], vi.fn());
    expect(screen.queryByRole("button", { name: "Tudo" })).toBeNull();
  });

  it("narrows the list and reports when the narrowing empties it", () => {
    renderList([item("retry_processing"), item("review_interpretation", { entryId: "e2" })], vi.fn());
    const chips = screen.getAllByRole("button", { pressed: false });
    const reviewChip = chips.find((chip) => chip.textContent && !/Tudo|Tentar/.test(chip.textContent));
    expect(reviewChip).toBeDefined();
    fireEvent.click(reviewChip!);
    expect(screen.queryByText("Título retry_processing")).toBeNull();
    expect(screen.getByText("Título review_interpretation")).toBeInTheDocument();
  });
});

describe("2J-PRIVACY-001/004/005: the attention surface masks in place", () => {
  it("withholds the preview for highly_sensitive and keeps the row", () => {
    const { container } = renderList(
      [
        item("review_interpretation", { entryId: "e1" }),
        item("review_interpretation", { entryId: "e2", sensitivity: "highly_sensitive" }),
      ],
      vi.fn(),
    );
    expect(container.querySelectorAll('[data-masked="true"]')).toHaveLength(1);
    expect(screen.getAllByText("Título review_interpretation")).toHaveLength(1);
  });

  it("shows normal and private unchanged", () => {
    for (const level of ["normal", "private"] as const) {
      cleanup();
      const { container } = renderList([item("review_interpretation", { sensitivity: level })], vi.fn());
      expect(container.querySelectorAll('[data-masked="true"]'), level).toHaveLength(0);
    }
  });

  it("does not offer inline retry on a masked row", () => {
    // Acting on content you cannot see is not resolution -- and the button
    // would confirm what the mask exists to withhold.
    renderList([item("retry_processing", { sensitivity: "highly_sensitive" })], vi.fn());
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });
});

describe("2J-ATTN-008: dismissal is not offered", () => {
  it("exposes no dismiss control anywhere on the surface", () => {
    // An attention-only dismissal would record "resolved" while the entry still
    // says otherwise. Without source-state mutation it is out of this phase.
    renderList(
      [item("retry_processing"), item("review_interpretation", { entryId: "e2" })],
      vi.fn(),
    );
    for (const label of [/dispensar/i, /dismiss/i, /ignorar/i, /adiar/i, /snooze/i]) {
      expect(screen.queryByRole("button", { name: label }), String(label)).toBeNull();
    }
  });
});
