import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * `2L-PRIVACY-001`, `-005`, `-006`, `-007` — OD-2L-1 option B on the task
 * detail.
 *
 * The detail surface had no test of its own before this slice; what it had was
 * the view test above it, which is handed a projection rather than building
 * one. The convergence requirement makes that gap load-bearing: "the list and
 * the detail resolve the same classification" cannot be asserted from a file
 * that only ever sees one of them, so this drives the detail projection over
 * the **same** fixtures `work-projection.test.ts` drives the list over, and
 * compares the answers.
 */

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "not", "neq"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.maybeSingle = vi.fn(async () => result);
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<Result>;
}

const projection = await import("./task-detail-projection");

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Ship the thing",
    description: null,
    status: "todo",
    due_at: null,
    planned_at: null,
    manual_priority: null,
    intentional_no_due: false,
    no_due_reason: null,
    created_by: "user",
    parent_task_id: null,
    source_entry_id: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    completed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function clientMock(options: {
  task?: Record<string, unknown> | null;
  entry?: Record<string, unknown> | null;
} = {}) {
  const taskQuery = queryStub({ data: options.task === undefined ? taskRow() : options.task, error: null });
  const profileQuery = queryStub({ data: { timezone: "America/Sao_Paulo" }, error: null });
  const entryQuery = queryStub({ data: options.entry ?? null, error: null });
  const emptyQuery = queryStub({ data: [], error: null });
  let taskCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === "tasks") {
      taskCalls += 1;
      // The first `tasks` read is the row itself; any later one is the relation
      // hydration reaching for parent/dependency titles.
      return taskCalls === 1 ? taskQuery : emptyQuery;
    }
    if (table === "profiles") return profileQuery;
    if (table === "entries") return entryQuery;
    return emptyQuery;
  });
  return { client: { from } as never, from, taskQuery, entryQuery };
}

const load = (client: never, taskId = "task-1") =>
  projection.loadTaskDetailProjection(client, { taskId, userId: "user-1", locale: "en" });

describe("loadTaskDetailProjection: the derived classification (OD-2L-1 option B)", () => {
  it("reads the source entry's classification alongside its content, owner-scoped", async () => {
    const { client, entryQuery } = clientMock({
      task: taskRow({ source_entry_id: "entry-a" }),
      entry: {
        id: "entry-a",
        original_content: "Something private",
        occurred_at: "2026-08-01T09:00:00.000Z",
        sensitivity: "private",
      },
    });

    const detail = await load(client);

    expect(entryQuery.select).toHaveBeenCalledWith("id,original_content,occurred_at,sensitivity");
    expect(entryQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(entryQuery.eq).toHaveBeenCalledWith("id", "entry-a");
    expect(detail?.task.sensitivity).toEqual({ kind: "derived", level: "private" });
  });

  it("resolves a manual task to `undetermined` and reads no entry at all", async () => {
    const { client, from } = clientMock({ task: taskRow({ source_entry_id: null }) });

    const detail = await load(client);

    expect(detail?.task.sensitivity).toEqual({ kind: "undetermined" });
    expect(from).not.toHaveBeenCalledWith("entries");
  });

  it("resolves a source the owner-scoped read cannot return to the most protective level", async () => {
    // The task still names an entry; the read returns nothing. Removed, foreign
    // and unreadable are one case, and this is it (`2L-PRIVACY-005`).
    const { client } = clientMock({
      task: taskRow({ source_entry_id: "entry-gone" }),
      entry: null,
    });

    const detail = await load(client);

    expect(detail?.task.sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
    // And the provenance section has nothing to show, exactly as before: the
    // classification changed, the existing "no entry" behaviour did not.
    expect(detail?.provenance).toBeNull();
  });

  it("fails closed on a source row whose stored level is unreadable", async () => {
    const { client } = clientMock({
      task: taskRow({ source_entry_id: "entry-a" }),
      entry: {
        id: "entry-a",
        original_content: "text",
        occurred_at: "2026-08-01T09:00:00.000Z",
        sensitivity: null,
      },
    });

    expect((await load(client))?.task.sensitivity)
      .toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("gives the same answer the list gives, for the same source row", async () => {
    /*
     * `2L-PRIVACY-007`, executed. Both projections call the one derivation, so
     * this compares outputs rather than implementations — the assertion that
     * would break if either surface ever grew its own rule.
     */
    const { deriveTaskSensitivity } = await import("@/features/sensitivity/task-derivation");
    for (const level of ["normal", "private", "highly_sensitive"] as const) {
      const { client } = clientMock({
        task: taskRow({ source_entry_id: "entry-a" }),
        entry: {
          id: "entry-a",
          original_content: "text",
          occurred_at: "2026-08-01T09:00:00.000Z",
          sensitivity: level,
        },
      });
      const detail = await load(client);
      const fromList = deriveTaskSensitivity("entry-a", new Map([["entry-a", level]]));
      expect(JSON.stringify(detail?.task.sensitivity)).toBe(JSON.stringify(fromList));
    }
  });

  it("still carries the provenance preview, which the surface masks rather than the projection dropping", async () => {
    // `2L-PRIVACY-003` is masking, not exclusion, and the reveal is local — so
    // the content has to reach the component that withholds it. Dropping it
    // here would make the reveal a second round trip and the section's absence
    // an existence signal of its own.
    const { client } = clientMock({
      task: taskRow({ source_entry_id: "entry-a" }),
      entry: {
        id: "entry-a",
        original_content: "The sensitive original",
        occurred_at: "2026-08-01T09:00:00.000Z",
        sensitivity: "highly_sensitive",
      },
    });

    const detail = await load(client);

    expect(detail?.provenance?.preview).toBe("The sensitive original");
    expect(detail?.task.sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });
});
