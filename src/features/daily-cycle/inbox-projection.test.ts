import { describe, expect, it, vi } from "vitest";
import { loadInboxProjection } from "./inbox-projection";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "or", "order", "range"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub;
}

type Entry = {
  id: string;
  original_content: string;
  status: string;
  occurred_at: string;
  created_at: string;
  current_interpretation_id: string | null;
};

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "entry-1",
    original_content: "Ligar para a Marina sobre o contrato do Atlas amanhã de manhã.",
    status: "completed",
    occurred_at: "2026-07-17T12:00:00.000Z",
    created_at: "2026-07-17T12:00:00.000Z",
    current_interpretation_id: null,
    ...overrides,
  };
}

type InboxTaskRow = { source_entry_id: string; source_interpretation_id?: string | null; candidate_index?: number | null };
type InboxResolutionRow = { entry_id: string; interpretation_id: string; candidate_index: number; disposition: string };

function clientMock(options: {
  entries?: Entry[];
  jobs?: Array<{ status: string; next_attempt_at: string | null; payload: unknown }>;
  interpretations?: Array<{ id: string; summary: string; task_candidates: unknown }>;
  openQuestions?: Array<{ entry_id: string }>;
  tasks?: InboxTaskRow[];
  resolutions?: InboxResolutionRow[];
} = {}) {
  const {
    entries = [entry()],
    jobs = [],
    interpretations = [],
    openQuestions = [],
    tasks = [],
    resolutions = [],
  } = options;

  const stubs: Record<string, ReturnType<typeof queryStub>> = {
    entries: queryStub({ data: entries, error: null }),
    jobs: queryStub({ data: jobs, error: null }),
    entry_interpretations: queryStub({ data: interpretations, error: null }),
    pending_questions: queryStub({ data: openQuestions, error: null }),
    tasks: queryStub({ data: tasks, error: null }),
    entry_task_candidate_resolutions: queryStub({ data: resolutions, error: null }),
  };
  const from = vi.fn((table: string) => stubs[table]);
  return { client: { from }, stubs, from };
}

describe("loadInboxProjection", () => {
  it("maps a completed entry with no open decisions to the ready state", async () => {
    const { client } = clientMock({ entries: [entry({ status: "completed" })] });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ entryId: "entry-1", productState: "ready" });
    expect(page.items[0].attentionReason).toBeUndefined();
  });

  it("maps a saved entry with a pending interpret_entry job to the organizing state", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "saved" })],
      jobs: [{ status: "pending", next_attempt_at: null, payload: { entry_id: "entry-1", mode: "initial" } }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0].productState).toBe("organizing");
  });

  it("maps an entry with unconfirmed task candidates to needs_attention/confirm_existing_candidates", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Ligar para a Marina", task_candidates: [{ title: "Ligar para a Marina" }] }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({
      productState: "needs_attention",
      attentionReason: "confirm_existing_candidates",
      title: "Ligar para a Marina",
    });
  });

  it("treats a candidate that already materialized into a task as ready, not pending confirmation", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Ligar para a Marina", task_candidates: [{ title: "Ligar para a Marina" }] }],
      tasks: [{ source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 0 }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0].productState).toBe("ready");
  });

  it("keeps needs_attention/confirm_existing_candidates when only one of two current-interpretation candidates is confirmed (F1 regression)", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-1" })],
      interpretations: [{
        id: "interp-1",
        summary: "Ligar para a Marina",
        task_candidates: [{ title: "Ligar para a Marina" }, { title: "Enviar contrato" }],
      }],
      tasks: [{ source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 0 }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" });
  });

  it("resolves to ready once both current-interpretation candidates are confirmed", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-1" })],
      interpretations: [{
        id: "interp-1",
        summary: "Ligar para a Marina",
        task_candidates: [{ title: "Ligar para a Marina" }, { title: "Enviar contrato" }],
      }],
      tasks: [
        { source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 0 },
        { source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 1 },
      ],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0].productState).toBe("ready");
  });

  it("keeps attention when only some candidates have terminal dispositions", async () => {
    const { client } = clientMock({
      entries: [entry({ current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Plano", task_candidates: [{ title: "A" }, { title: "B" }] }],
      resolutions: [{ entry_id: "entry-1", interpretation_id: "interp-1", candidate_index: 0, disposition: "retained" }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" });
  });

  it("clears candidate attention when all candidates have terminal dispositions", async () => {
    const { client } = clientMock({
      entries: [entry({ current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Plano", task_candidates: [{ title: "A" }, { title: "B" }] }],
      resolutions: [
        { entry_id: "entry-1", interpretation_id: "interp-1", candidate_index: 0, disposition: "rejected" },
        { entry_id: "entry-1", interpretation_id: "interp-1", candidate_index: 1, disposition: "dismissed" },
      ],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "ready" });
  });

  it("does not let an older interpretation's disposition cover the current candidate", async () => {
    const { client } = clientMock({
      entries: [entry({ current_interpretation_id: "interp-2" })],
      interpretations: [{ id: "interp-2", summary: "Plano atual", task_candidates: [{ title: "A" }] }],
      resolutions: [{ entry_id: "entry-1", interpretation_id: "interp-1", candidate_index: 0, disposition: "retained" }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" });
  });

  it("keeps an open question blocking even after all candidates are resolved", async () => {
    const { client } = clientMock({
      entries: [entry({ current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Plano", task_candidates: [{ title: "A" }] }],
      resolutions: [{ entry_id: "entry-1", interpretation_id: "interp-1", candidate_index: 0, disposition: "retained" }],
      openQuestions: [{ entry_id: "entry-1" }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "answer_existing_question" });
  });

  it("does not let a task from an older interpretation mark the current candidate as handled", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-2" })],
      interpretations: [{ id: "interp-2", summary: "Ligar para a Marina", task_candidates: [{ title: "Ligar para a Marina" }] }],
      tasks: [{ source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 0 }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" });
  });

  it("does not let a task for a mismatched candidate index mark the remaining candidate as handled", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-1" })],
      interpretations: [{
        id: "interp-1",
        summary: "Ligar para a Marina",
        task_candidates: [{ title: "Ligar para a Marina" }, { title: "Enviar contrato" }],
      }],
      // Both materialized tasks point at candidate_index 0 — index 1 remains uncovered.
      tasks: [
        { source_entry_id: "entry-1", source_interpretation_id: "interp-1", candidate_index: 0 },
      ],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "confirm_existing_candidates" });
  });

  it("maps an entry with an open pending question to needs_attention/answer_existing_question", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "completed", current_interpretation_id: "interp-1" })],
      interpretations: [{ id: "interp-1", summary: "Ligar para a Marina", task_candidates: [] }],
      openQuestions: [{ entry_id: "entry-1" }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "needs_attention", attentionReason: "answer_existing_question" });
  });

  it("maps an exhausted interpretation job to could_not_organize/retry_processing", async () => {
    const { client } = clientMock({
      entries: [entry({ status: "recoverable_error" })],
      jobs: [{ status: "exhausted", next_attempt_at: null, payload: { entry_id: "entry-1", mode: "initial" } }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0]).toMatchObject({ productState: "could_not_organize", attentionReason: "retry_processing" });
  });

  it("falls back to a fail-closed could_not_organize item instead of dropping an entry with an unrecognized internal state", async () => {
    const { client } = clientMock({ entries: [entry({ status: "legacy_migrated_state" })] });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      entryId: "entry-1",
      productState: "could_not_organize",
      attentionReason: "resolve_consistency",
      originalPreserved: true,
    });
  });

  it("never drops the original preview even for the fail-closed fallback", async () => {
    const { client } = clientMock({ entries: [entry({ status: "unknown_future_state", original_content: "Texto original preservado." })] });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0].originalPreview).toContain("Texto original preservado.");
  });

  it("builds a locale-scoped safe href to open the entry", async () => {
    const { client } = clientMock({ entries: [entry({ status: "completed" })] });

    const page = await loadInboxProjection(client as never, { locale: "en", page: 1 });

    expect(page.items[0].availableActions).toEqual([{ id: "open_entry", href: "/en/app/inbox/entry-1" }]);
  });

  it("falls back the title to the original preview when no interpretation exists yet", async () => {
    const { client } = clientMock({ entries: [entry({ status: "saved", original_content: "Registro cru sem interpretação ainda." })] });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items[0].title).toBe("Registro cru sem interpretação ainda.");
  });

  it("returns an empty page and skips dependent queries when there are no entries", async () => {
    const { client, from } = clientMock({ entries: [] });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page).toEqual({ items: [], hasNext: false });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("entries");
  });

  it("reports hasNext when more rows exist than the page size", async () => {
    const oversized = Array.from({ length: 51 }, (_, index) => entry({ id: `entry-${index}`, status: "completed" }));
    const { client } = clientMock({ entries: oversized });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items).toHaveLength(50);
    expect(page.hasNext).toBe(true);
  });
});

/**
 * The queue's views (`02-arquitetura-e-rotas.md`: `?view=`).
 *
 * The product state is decided by `resolveDailyCycleLifecycle` from the entry
 * status, the job, the open questions and the candidates *together*, so no SQL
 * predicate can select a view exactly. The status filter is a superset and the
 * derived state is what decides — these prove the second half actually runs,
 * because a superset that nothing narrowed would look like a working filter on
 * any fixture where the two happen to agree.
 */
describe("loadInboxProjection: views", () => {
  it("keeps only what is really organizing, not everything the status admits", async () => {
    const { client } = clientMock({
      entries: [
        entry({ id: "reading", status: "interpreting" }),
        // Same status set, and deliberately not organizing: no job, so the
        // lifecycle resolves it to `saved`. A status-only filter would keep it.
        entry({ id: "just-saved", status: "saved" }),
      ],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1, view: "organizing" });

    expect(page.items.map((item) => item.entryId)).toEqual(["reading"]);
  });

  it("keeps only what could not be organized", async () => {
    const { client } = clientMock({
      entries: [
        entry({ id: "broken", status: "terminal_error" }),
        entry({ id: "fine", status: "completed" }),
      ],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1, view: "failed" });

    expect(page.items.map((item) => item.entryId)).toEqual(["broken"]);
  });

  it("separates a record that proposed nothing from one that produced tasks", async () => {
    const { client } = clientMock({
      entries: [
        entry({ id: "nothing", status: "completed" }),
        entry({ id: "produced", status: "completed", current_interpretation_id: "i1" }),
      ],
      interpretations: [{ id: "i1", summary: "Ligar para a Marina", task_candidates: [{ title: "Ligar" }] }],
      tasks: [{ source_entry_id: "produced", source_interpretation_id: "i1", candidate_index: 0 }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1, view: "record-only" });

    expect(page.items.map((item) => item.entryId)).toEqual(["nothing"]);
    expect(page.items[0]?.isRecordOnly).toBe(true);
  });

  it("returns everything when no view is asked for", async () => {
    const { client } = clientMock({
      entries: [entry({ id: "a", status: "completed" }), entry({ id: "b", status: "terminal_error" })],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1 });

    expect(page.items).toHaveLength(2);
  });

  /*
    The independent review's finding, as two tests over the *status prefilter*
    rather than over the lifecycle resolver.

    The resolver was always right about both of these — `lifecycle.test.ts` proves
    it. What was wrong is the SQL superset each view narrows to before the
    resolver ever runs, which is a filter the existing view tests could not see
    because every one of them used a status the superset happened to admit.
  */
  it("keeps an entry retried on a live schedule in the organizing view", async () => {
    const { client, stubs } = clientMock({
      entries: [entry({ id: "retrying", status: "recoverable_error" })],
      // `fail_entry_interpretation` on a non-terminal failure: the entry moves to
      // `recoverable_error` and the job keeps a future attempt.
      jobs: [{ status: "failed", next_attempt_at: "2999-01-01T00:00:00.000Z", payload: { entry_id: "retrying" } }],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1, view: "organizing" });

    expect(page.items.map((item) => item.entryId)).toEqual(["retrying"]);
    expect(page.items[0]?.productState).toBe("organizing");
    // The control: the status has to be in the query's own superset, or the row
    // never reaches the post-filter and this test would pass on an empty page.
    expect(stubs.entries.in).toHaveBeenCalledWith("status", expect.arrayContaining(["recoverable_error"]));
  });

  it("gives an entry with no AI credential a view of its own", async () => {
    const { client, stubs } = clientMock({
      entries: [
        entry({ id: "no-key", status: "awaiting_ai_configuration" }),
        entry({ id: "fine", status: "completed" }),
      ],
    });

    const page = await loadInboxProjection(client as never, { locale: "pt-BR", page: 1, view: "awaiting-ai" });

    expect(page.items.map((item) => item.entryId)).toEqual(["no-key"]);
    expect(page.items[0]).toMatchObject({
      productState: "needs_attention",
      attentionReason: "configure_ai_credential",
    });
    // `BYOK-CAPTURE-002` — the row carries the action that actually resolves it.
    expect(page.items[0]?.availableActions.map((action) => action.id)).toContain("configure_ai_credential");
    expect(stubs.entries.in).toHaveBeenCalledWith("status", ["awaiting_ai_configuration"]);
  });
});
