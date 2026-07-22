import { describe, expect, it, vi } from "vitest";
import { ATTENTION_PAGE_SIZE, loadAttentionProjection } from "./attention-projection";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "in"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub;
}

type AttentionRow = {
  entry_id: string;
  reason: string;
  occurred_at: string;
  current_interpretation_id: string | null;
  job_id: string | null;
  open_question_id: string | null;
};

function row(overrides: Partial<AttentionRow> = {}): AttentionRow {
  return {
    entry_id: "entry-1",
    reason: "review_interpretation",
    occurred_at: "2026-07-18T12:00:00.000Z",
    current_interpretation_id: null,
    job_id: null,
    open_question_id: null,
    ...overrides,
  };
}

function clientMock(options: {
  rpcRows?: AttentionRow[];
  entries?: Array<{ id: string; original_content: string }>;
  interpretations?: Array<{ id: string; summary: string }>;
} = {}) {
  const {
    rpcRows = [row()],
    entries = [{ id: "entry-1", original_content: "Ligar para a Marina sobre o contrato do Atlas amanhã de manhã." }],
    interpretations = [],
  } = options;

  const rpc = vi.fn(async () => ({ data: rpcRows, error: null }));
  const stubs: Record<string, ReturnType<typeof queryStub>> = {
    entries: queryStub({ data: entries, error: null }),
    entry_interpretations: queryStub({ data: interpretations, error: null }),
  };
  const from = vi.fn((table: string) => stubs[table]);
  return { client: { from, rpc }, stubs, from, rpc };
}

describe("loadAttentionProjection", () => {
  it("maps an RPC row to a NeedsAttentionItemView using the current interpretation's summary as the title", async () => {
    const { client } = clientMock({
      rpcRows: [row({ current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Ligar para a Marina" }],
    });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      entryId: "entry-1",
      kind: "review_interpretation",
      title: "Ligar para a Marina",
      groupKey: "entry-1",
    });
  });

  it("falls back to the original content preview when there is no interpretation summary", async () => {
    const { client } = clientMock({ rpcRows: [row({ current_interpretation_id: null })] });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR" });

    expect(page.items[0].title).toContain("Ligar para a Marina sobre o contrato do Atlas");
  });

  it("builds the explanation from the reason's localized copy, in both locales", async () => {
    const { client: ptClient } = clientMock({ rpcRows: [row({ reason: "confirm_existing_candidates" })] });
    const { client: enClient } = clientMock({ rpcRows: [row({ reason: "confirm_existing_candidates" })] });

    const ptPage = await loadAttentionProjection(ptClient as never, { locale: "pt-BR" });
    const enPage = await loadAttentionProjection(enClient as never, { locale: "en" });

    expect(ptPage.items[0].explanation).toBe("Escolha o destino de cada sugestão pendente.");
    expect(enPage.items[0].explanation).toBe("Choose what should happen to each pending suggestion.");
  });

  it("builds a locale-scoped primary action that links to the canonical entry review route", async () => {
    const { client } = clientMock({ rpcRows: [row({ reason: "answer_existing_question" })] });

    const page = await loadAttentionProjection(client as never, { locale: "en" });

    expect(page.items[0].primaryAction).toEqual({
      id: "answer_existing_question",
      href: "/en/app/inbox/entry-1",
    });
  });

  it.each([
    ["review_interpretation", "correct_interpretation"],
    ["confirm_existing_candidates", "confirm_existing_candidates"],
    ["answer_existing_question", "answer_existing_question"],
    ["retry_processing", "retry_processing"],
    ["resolve_consistency", "resolve_consistency"],
  ] as const)("maps reason %s to the same actionable id the entry-review page already uses (%s)", async (reason, actionId) => {
    const { client } = clientMock({ rpcRows: [row({ reason })] });

    const page = await loadAttentionProjection(client as never, { locale: "en" });

    expect(page.items[0].primaryAction.id).toBe(actionId);
  });

  it("requests one extra row to determine hasNext and strips it from the page", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => row({ entry_id: `entry-${index}`, occurred_at: `2026-07-18T12:0${index}:00.000Z` }));
    const { client, rpc } = clientMock({
      rpcRows: rows,
      entries: rows.map((entry) => ({ id: entry.entry_id, original_content: "Fixture" })),
    });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR", limit: 2 });

    expect(rpc).toHaveBeenCalledWith("list_needs_attention", expect.objectContaining({ p_limit: 3 }));
    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(true);
  });

  it("returns hasNext=false and a null cursor when the page is not full", async () => {
    const { client } = clientMock({ rpcRows: [row()] });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR", limit: 20 });

    expect(page.hasNext).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("derives nextCursor from the last item actually shown, not the lookahead row", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => row({ entry_id: `entry-${index}`, occurred_at: `2026-07-18T12:0${index}:00.000Z` }));
    const { client } = clientMock({
      rpcRows: rows,
      entries: rows.map((entry) => ({ id: entry.entry_id, original_content: "Fixture" })),
    });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR", limit: 2 });

    expect(page.nextCursor).toEqual({ occurredAt: "2026-07-18T12:01:00.000Z", entryId: "entry-1" });
  });

  it("forwards a supplied cursor to the RPC call", async () => {
    const { client, rpc } = clientMock({ rpcRows: [] });

    await loadAttentionProjection(client as never, {
      locale: "pt-BR",
      cursor: { occurredAt: "2026-07-18T11:00:00.000Z", entryId: "entry-9" },
    });

    expect(rpc).toHaveBeenCalledWith("list_needs_attention", expect.objectContaining({
      p_cursor_occurred_at: "2026-07-18T11:00:00.000Z",
      p_cursor_entry_id: "entry-9",
    }));
  });

  it("uses the default page size when no limit is supplied", async () => {
    const { client, rpc } = clientMock({ rpcRows: [] });

    await loadAttentionProjection(client as never, { locale: "pt-BR" });

    expect(rpc).toHaveBeenCalledWith("list_needs_attention", expect.objectContaining({ p_limit: ATTENTION_PAGE_SIZE + 1 }));
  });

  it("drops a row whose entry cannot be hydrated instead of fabricating a title (fail-closed)", async () => {
    const { client } = clientMock({ rpcRows: [row({ entry_id: "vanished" })], entries: [] });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR" });

    expect(page.items).toHaveLength(0);
  });

  it("drops a row with a reason the current contracts do not recognize instead of guessing (fail-closed)", async () => {
    const { client } = clientMock({ rpcRows: [row({ reason: "some_future_reason" })] });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR" });

    expect(page.items).toHaveLength(0);
  });

  it("returns an empty page and skips hydration queries when the RPC returns no rows", async () => {
    const { client, from } = clientMock({ rpcRows: [] });

    const page = await loadAttentionProjection(client as never, { locale: "pt-BR" });

    expect(page).toEqual({ items: [], hasNext: false, nextCursor: null });
    expect(from).not.toHaveBeenCalled();
  });
});
