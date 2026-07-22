import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type WorkProjectionModule = {
  WORK_PAGE_SIZE?: number;
  parseWorkView?: (value: string | string[] | undefined) => "today" | "all" | "waiting";
  loadWorkProjection?: (
    supabase: unknown,
    input: {
      userId: string;
      locale: "pt-BR" | "en";
      view: "today" | "all" | "waiting";
      page: number;
      now?: Date;
    },
  ) => Promise<{
    items: readonly unknown[];
    hasNext: boolean;
    timezone: string;
  }>;
};

const modulePath = `./${"work-projection"}.ts`;
const projection = await vi.importActual<WorkProjectionModule>(modulePath).catch(() => ({})) as WorkProjectionModule;

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "lt", "order", "range"]) {
    stub[method] = vi.fn(() => stub);
  }
  stub.maybeSingle = vi.fn(async () => result);
  stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return stub as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<Result>;
}

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  created_by: string;
  updated_at: string;
  planned_at: string | null;
  manual_priority: string | null;
  intentional_no_due: boolean;
  no_due_reason: string | null;
};

function task(index: number, overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: `task-${index.toString().padStart(3, "0")}`,
    user_id: "user-1",
    title: `Task ${index}`,
    description: null,
    status: "todo",
    due_at: "2026-07-18T12:00:00.000Z",
    created_by: "user",
    updated_at: "2026-07-18T12:00:00.000Z",
    planned_at: null,
    manual_priority: null,
    intentional_no_due: false,
    no_due_reason: null,
    ...overrides,
  };
}

function clientMock(options: { tasks?: TaskRow[]; timezone?: string | null } = {}) {
  const profileQuery = queryStub({
    data: options.timezone === null ? null : { timezone: options.timezone ?? "America/Sao_Paulo" },
    error: null,
  });
  const tasksQuery = queryStub({ data: options.tasks ?? [task(1)], error: null });
  const from = vi.fn((table: string) => table === "profiles" ? profileQuery : tasksQuery);
  return { client: { from }, from, profileQuery, tasksQuery };
}

function loadWorkProjection() {
  expect(projection.loadWorkProjection).toBeTypeOf("function");
  return projection.loadWorkProjection!;
}

describe("loadWorkProjection", () => {
  it("defaults malformed or repeated view parameters to Today", () => {
    expect(projection.parseWorkView).toBeTypeOf("function");
    expect(projection.parseWorkView?.("waiting")).toBe("waiting");
    expect(projection.parseWorkView?.("future-view")).toBe("today");
    expect(projection.parseWorkView?.(["all", "waiting"])).toBe("today");
  });

  it("loads All with explicit owner scope, stable updated/id ordering, and page-based lookahead", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => task(index));
    const { client, profileQuery, tasksQuery } = clientMock({ tasks: rows });

    const page = await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "en",
      view: "all",
      page: 2,
    });

    expect(profileQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(tasksQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(tasksQuery.neq).toHaveBeenCalledWith("status", "cancelled");
    expect(tasksQuery.order).toHaveBeenNthCalledWith(1, "updated_at", { ascending: false });
    expect(tasksQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(tasksQuery.range).toHaveBeenCalledWith(50, 100);
    expect(page.items).toHaveLength(50);
    expect(page.hasNext).toBe(true);
  });

  it("uses the profile timezone to query overdue plus locally-due-today open tasks", async () => {
    const { client, tasksQuery } = clientMock({ timezone: "America/Sao_Paulo" });

    const page = await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "pt-BR",
      view: "today",
      page: 1,
      now: new Date("2026-07-18T01:30:00.000Z"),
    });

    expect(page.timezone).toBe("America/Sao_Paulo");
    expect(tasksQuery.not).toHaveBeenCalledWith("due_at", "is", null);
    expect(tasksQuery.lt).toHaveBeenCalledWith("due_at", "2026-07-18T03:00:00.000Z");
    expect(tasksQuery.not).toHaveBeenCalledWith("status", "in", "(completed,cancelled)");
    expect(tasksQuery.order).toHaveBeenNthCalledWith(1, "due_at", { ascending: true });
    expect(tasksQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("falls back safely when the stored timezone is missing or invalid", async () => {
    const { client, tasksQuery } = clientMock({ timezone: "Mars/Olympus" });

    const page = await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "en",
      view: "today",
      page: 1,
      now: new Date("2026-07-18T01:30:00.000Z"),
    });

    expect(page.timezone).toBe("America/Sao_Paulo");
    expect(tasksQuery.lt).toHaveBeenCalledWith("due_at", "2026-07-18T03:00:00.000Z");
  });

  it("loads Waiting with owner scope and stable most-recently-updated ordering", async () => {
    const { client, tasksQuery } = clientMock({ tasks: [task(1, { status: "waiting" })] });

    await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "en",
      view: "waiting",
      page: 1,
    });

    expect(tasksQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(tasksQuery.eq).toHaveBeenCalledWith("status", "waiting");
    expect(tasksQuery.order).toHaveBeenNthCalledWith(1, "updated_at", { ascending: false });
    expect(tasksQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("maps lifecycle, origin, and allowed actions through WorkItemView and drops invalid rows", async () => {
    const { client } = clientMock({
      tasks: [
        task(1, { status: "waiting", created_by: "agent", description: "Ask Marina", due_at: null }),
        task(2, { status: "completed", created_by: "user" }),
        task(3, { status: "future_internal_state" }),
        task(4, { title: "   " }),
      ],
    });

    const page = await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "en",
      view: "all",
      page: 1,
    });

    expect(page.items).toEqual([
      {
        taskId: "task-001",
        title: "Task 1",
        description: "Ask Marina",
        intentionalNoDue: false,
        humanState: "waiting_on_someone",
        origin: "brain",
        availableActions: [{ id: "complete_task" }, { id: "resume_task" }],
      },
      {
        taskId: "task-002",
        title: "Task 2",
        dueAt: "2026-07-18T12:00:00.000Z",
        intentionalNoDue: false,
        humanState: "completed",
        origin: "you",
        availableActions: [{ id: "reopen_task" }],
      },
    ]);
  });

  it("maps planned date, priority, and intentional no-due reason through WorkItemView (Slice 2C.2)", async () => {
    const { client } = clientMock({
      tasks: [
        task(1, {
          due_at: null,
          planned_at: "2026-07-25T14:00:00.000Z",
          manual_priority: "urgent",
          intentional_no_due: true,
          no_due_reason: "Someday, not now",
        }),
      ],
    });

    const page = await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "en",
      view: "all",
      page: 1,
    });

    expect(page.items).toEqual([
      {
        taskId: "task-001",
        title: "Task 1",
        plannedAt: "2026-07-25T14:00:00.000Z",
        priority: "urgent",
        intentionalNoDue: true,
        noDueReason: "Someday, not now",
        humanState: "not_started",
        origin: "you",
        availableActions: [{ id: "complete_task" }, { id: "wait_task" }],
      },
    ]);
  });
});
