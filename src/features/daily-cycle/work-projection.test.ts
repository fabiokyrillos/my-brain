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
    editControlsByTaskId: Record<string, unknown>;
  }>;
};

const modulePath = `./${"work-projection"}.ts`;
const projection = await vi.importActual<WorkProjectionModule>(modulePath).catch(() => ({})) as WorkProjectionModule;

type Result = { data: unknown; error: unknown };

function queryStub(result: Result) {
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "lt", "order", "range", "in"]) {
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
  parent_task_id: string | null;
  source_entry_id: string | null;
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
    parent_task_id: null,
    source_entry_id: null,
    ...overrides,
  };
}

function clientMock(
  options: {
    tasks?: TaskRow[];
    timezone?: string | null;
    entries?: { id: string; sensitivity: string | null }[];
  } = {},
) {
  const profileQuery = queryStub({
    data: options.timezone === null ? null : { timezone: options.timezone ?? "America/Sao_Paulo" },
    error: null,
  });
  const tasksQuery = queryStub({ data: options.tasks ?? [task(1)], error: null });
  const entriesQuery = queryStub({ data: options.entries ?? [], error: null });
  const emptyRelationQuery = queryStub({ data: [], error: null });
  const from = vi.fn((table: string) => {
    if (table === "profiles") return profileQuery;
    if (table === "tasks") return tasksQuery;
    if (table === "entries") return entriesQuery;
    return emptyRelationQuery;
  });
  return { client: { from }, from, profileQuery, tasksQuery, entriesQuery };
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
        // `open_task` leads every list now: it was declared in contracts.ts and
        // localized from the start, but nothing produced it and no route could
        // satisfy it (UX-19). This projection is the producer.
        availableActions: [
          { id: "open_task", href: "/en/app/work/task-001" },
          { id: "complete_task" },
          { id: "resume_task" },
        ],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" },
      },
      {
        taskId: "task-002",
        title: "Task 2",
        dueAt: "2026-07-18T12:00:00.000Z",
        intentionalNoDue: false,
        humanState: "completed",
        origin: "you",
        availableActions: [
          { id: "open_task", href: "/en/app/work/task-002" },
          { id: "reopen_task" },
        ],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" },
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
        availableActions: [
          { id: "open_task", href: "/en/app/work/task-001" },
          { id: "complete_task" },
          { id: "wait_task" },
        ],
        projects: [],
        contexts: [],
        people: [],
        waitingOnPeople: [],
        sensitivity: { kind: "undetermined" },
      },
    ]);
  });

  it("hydrates owned project, context, person, and waiting-on relations (Slice 2C.3)", async () => {
    const profileQuery = queryStub({ data: { timezone: "America/Sao_Paulo" }, error: null });
    const tasksQuery = queryStub({ data: [task(1)], error: null });
    const taskProjectsQuery = queryStub({ data: [{ task_id: "task-001", project_id: "project-1" }], error: null });
    const taskContextsQuery = queryStub({ data: [{ task_id: "task-001", context_id: "context-1" }], error: null });
    const taskPeopleQuery = queryStub({
      data: [
        { task_id: "task-001", person_id: "person-1", role: "involved" },
        { task_id: "task-001", person_id: "person-2", role: "waiting_on" },
      ],
      error: null,
    });
    const projectsQuery = queryStub({ data: [{ id: "project-1", name: "Website relaunch" }], error: null });
    const contextsQuery = queryStub({ data: [{ id: "context-1", name: "Work" }], error: null });
    const peopleQuery = queryStub({
      data: [{ id: "person-1", name: "Alice" }, { id: "person-2", name: "Bob" }],
      error: null,
    });
    const taskDependenciesQuery = queryStub({ data: [], error: null });
    const tables: Record<string, ReturnType<typeof queryStub>> = {
      profiles: profileQuery,
      tasks: tasksQuery,
      task_projects: taskProjectsQuery,
      task_contexts: taskContextsQuery,
      task_people: taskPeopleQuery,
      task_dependencies: taskDependenciesQuery,
      projects: projectsQuery,
      contexts: contextsQuery,
      people: peopleQuery,
    };
    const from = vi.fn((table: string) => tables[table]);

    const page = await loadWorkProjection()({ from }, {
      userId: "user-1",
      locale: "en",
      view: "all",
      page: 1,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        taskId: "task-001",
        projects: [{ id: "project-1", label: "Website relaunch" }],
        contexts: [{ id: "context-1", label: "Work" }],
        people: [{ id: "person-1", label: "Alice" }],
        waitingOnPeople: [{ id: "person-2", label: "Bob" }],
      }),
    ]);
    expect(taskProjectsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(taskProjectsQuery.in).toHaveBeenCalledWith("task_id", ["task-001"]);
    expect(projectsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("hydrates parent and dependency task references (Slice 2C.5)", async () => {
    const profileQuery = queryStub({ data: { timezone: "America/Sao_Paulo" }, error: null });
    const pageTasksQuery = queryStub({ data: [task(1, { parent_task_id: "task-parent" })], error: null });
    const relatedTasksQuery = queryStub({
      data: [
        { id: "task-parent", title: "Plan the launch" },
        { id: "task-blocker", title: "Draft outline" },
      ],
      error: null,
    });
    const emptyQuery = queryStub({ data: [], error: null });
    const taskDependenciesQuery = queryStub({
      data: [{ task_id: "task-001", depends_on_task_id: "task-blocker" }],
      error: null,
    });
    let tasksCallCount = 0;
    const from = vi.fn((table: string) => {
      if (table === "profiles") return profileQuery;
      if (table === "tasks") {
        tasksCallCount += 1;
        return tasksCallCount === 1 ? pageTasksQuery : relatedTasksQuery;
      }
      if (table === "task_dependencies") return taskDependenciesQuery;
      return emptyQuery;
    });

    const page = await loadWorkProjection()({ from }, {
      userId: "user-1",
      locale: "en",
      view: "all",
      page: 1,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        taskId: "task-001",
        parent: { id: "task-parent", label: "Plan the launch" },
        dependsOn: [{ id: "task-blocker", label: "Draft outline" }],
      }),
    ]);
    expect(relatedTasksQuery.in).toHaveBeenCalledWith("id", expect.arrayContaining(["task-parent", "task-blocker"]));
  });

  it("skips relation queries entirely when the page has no tasks", async () => {
    const { client, from } = clientMock({ tasks: [] });

    await loadWorkProjection()(client, {
      userId: "user-1",
      locale: "en",
      view: "all",
      page: 1,
    });

    expect(from).not.toHaveBeenCalledWith("task_projects");
    expect(from).not.toHaveBeenCalledWith("task_contexts");
    expect(from).not.toHaveBeenCalledWith("task_people");
  });
});

/* -------------------------------------------------------------------------- *
 * `2L-EDIT-001` — the editable field set, derived rather than listed.
 * -------------------------------------------------------------------------- */

describe("loadWorkProjection: the quick-edit control set", () => {
  it("derives each row's controls from the taxonomy against its real status", async () => {
    const { detailControlsFor } = await import("@/features/task-commands/detail-controls");
    const { client } = clientMock({
      tasks: [task(1, { status: "todo" }), task(2, { status: "completed" })],
    });

    const page = await loadWorkProjection()(client, {
      userId: "user-1", locale: "en", view: "all", page: 1,
    });

    // Compared against the derivation rather than against a literal set: a
    // taxonomy change moves both together, and a hand-written list here would
    // be the second copy `2L-EDIT-001` forbids.
    const controls = page.editControlsByTaskId;
    expect(controls["task-001"]).toEqual(detailControlsFor("todo"));
    expect(controls["task-002"]).toEqual(detailControlsFor("completed"));
    // Non-vacuous: the two statuses genuinely admit different verbs, so a
    // projection that returned one set for everything would fail.
    expect(controls["task-001"]).not.toEqual(controls["task-002"]);
  });

  it("uses the row's real status, which the rendered view deliberately cannot supply", async () => {
    // `inbox` and `todo` both project to `not_started`; the taxonomy does not
    // treat them identically. Deriving from `humanState` would guess exactly
    // here, so the projection is the only place this can be answered.
    const { detailControlsFor } = await import("@/features/task-commands/detail-controls");
    const { client } = clientMock({ tasks: [task(1, { status: "inbox" })] });

    const page = await loadWorkProjection()(client, {
      userId: "user-1", locale: "en", view: "all", page: 1,
    });

    const controls = page.editControlsByTaskId;
    expect(controls["task-001"]).toEqual(detailControlsFor("inbox"));
  });
});

/* -------------------------------------------------------------------------- *
 * `2L-PRIVACY-001`, `-002`, `-004`, `-005`, `-006` — OD-2L-1 option B on the
 * Work list.
 * -------------------------------------------------------------------------- */

describe("loadWorkProjection: the derived classification (OD-2L-1 option B)", () => {
  it("reads the source classifications once per page, owner-scoped and bounded to the page's ids", async () => {
    const { client, from, entriesQuery } = clientMock({
      tasks: [
        task(1, { source_entry_id: "entry-a" }),
        task(2, { source_entry_id: "entry-b" }),
        // The same source twice: the read must not grow with the number of rows.
        task(3, { source_entry_id: "entry-a" }),
        task(4, { source_entry_id: null }),
      ],
      entries: [
        { id: "entry-a", sensitivity: "normal" },
        { id: "entry-b", sensitivity: "highly_sensitive" },
      ],
    });

    await loadWorkProjection()(client, { userId: "user-1", locale: "en", view: "all", page: 1 });

    // `2L-PRIVACY-006`: owner scope is stated in the query, not left to RLS
    // alone, and the `in` list is the page's own ids — never a per-user scan
    // and never one query per task.
    expect(entriesQuery.select).toHaveBeenCalledWith("id,sensitivity");
    expect(entriesQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(entriesQuery.in).toHaveBeenCalledWith("id", ["entry-a", "entry-b"]);
    expect(from.mock.calls.filter(([table]) => table === "entries")).toHaveLength(1);
  });

  it("does not read entries at all when no task on the page came from one", async () => {
    const { client, from } = clientMock({ tasks: [task(1), task(2)] });

    await loadWorkProjection()(client, { userId: "user-1", locale: "en", view: "all", page: 1 });

    expect(from).not.toHaveBeenCalledWith("entries");
  });

  it("derives each row's level from its own source", async () => {
    const { client } = clientMock({
      tasks: [
        task(1, { source_entry_id: "entry-normal" }),
        task(2, { source_entry_id: "entry-private" }),
        task(3, { source_entry_id: "entry-secret" }),
      ],
      entries: [
        { id: "entry-normal", sensitivity: "normal" },
        { id: "entry-private", sensitivity: "private" },
        { id: "entry-secret", sensitivity: "highly_sensitive" },
      ],
    });

    const page = await loadWorkProjection()(client, {
      userId: "user-1", locale: "en", view: "all", page: 1,
    });

    expect(page.items.map((item) => (item as { sensitivity: unknown }).sensitivity)).toEqual([
      { kind: "derived", level: "normal" },
      { kind: "derived", level: "private" },
      { kind: "derived", level: "highly_sensitive" },
    ]);
  });

  it("resolves a manual task to `undetermined`, never to `normal`", async () => {
    const { client } = clientMock({ tasks: [task(1, { source_entry_id: null })] });

    const page = await loadWorkProjection()(client, {
      userId: "user-1", locale: "en", view: "all", page: 1,
    });

    expect((page.items[0] as { sensitivity: unknown }).sensitivity).toEqual({ kind: "undetermined" });
  });

  it("resolves a source absent from the owner-scoped read to the most protective level", async () => {
    // Removed, foreign and simply unreadable are the same fact here: the id is
    // not in the map. `2L-PRIVACY-005` requires all three to be indistinguishable.
    const { client } = clientMock({
      tasks: [
        task(1, { source_entry_id: "entry-removed" }),
        task(2, { source_entry_id: "entry-foreign" }),
      ],
      entries: [],
    });

    const page = await loadWorkProjection()(client, {
      userId: "user-1", locale: "en", view: "all", page: 1,
    });

    const [first, second] = page.items.map((item) => (item as { sensitivity: unknown }).sensitivity);
    expect(first).toEqual({ kind: "derived", level: "highly_sensitive" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("keeps the masked row in the page, so the count and the pagination stay truthful", async () => {
    // `2L-PRIVACY-003`. Excluding the row would make `hasNext`, the rendered
    // count and any future selection describe a set the user does not own.
    const { client } = clientMock({
      tasks: [task(1, { source_entry_id: "entry-secret" }), task(2)],
      entries: [{ id: "entry-secret", sensitivity: "highly_sensitive" }],
    });

    const page = await loadWorkProjection()(client, {
      userId: "user-1", locale: "en", view: "all", page: 1,
    });

    expect(page.items).toHaveLength(2);
  });

  it("persists nothing: the classification is read and never written back", async () => {
    // `2L-PRIVACY-002`. The projection is a read; the assertion is that the
    // only table it touches beyond its existing reads is `entries`, and that no
    // write verb is reachable from the stubs it was given.
    const { client, from, tasksQuery, entriesQuery } = clientMock({
      tasks: [task(1, { source_entry_id: "entry-a" })],
      entries: [{ id: "entry-a", sensitivity: "private" }],
    });

    await loadWorkProjection()(client, { userId: "user-1", locale: "en", view: "all", page: 1 });

    for (const stub of [tasksQuery, entriesQuery]) {
      expect(stub.update).toBeUndefined();
      expect(stub.insert).toBeUndefined();
      expect(stub.upsert).toBeUndefined();
    }
    expect(from).not.toHaveBeenCalledWith("undo_operations");
  });
});
