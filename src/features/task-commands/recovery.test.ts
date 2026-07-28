import { describe, expect, it, vi } from "vitest";

import { CANCELLED_TASK_PAGE_SIZE, loadCancelledTaskRecovery } from "./recovery";

vi.mock("server-only", () => ({}));

const OWNER = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-28T12:00:00.000Z";

function sqlRow(overrides: Record<string, unknown> = {}) {
  return {
    task_id: "33333333-3333-4333-8333-333333333333",
    owner_id: OWNER,
    title: "gym",
    status: "cancelled",
    due_at: null,
    planned_at: null,
    manual_priority: null,
    created_at: "2026-07-01T00:00:00.000Z",
    description: null,
    completed_at: null,
    cancelled_at: "2026-07-20T10:00:00.000Z",
    intentional_no_due: false,
    no_due_reason: null,
    updated_at: "2026-07-20T10:00:00.000Z",
    project_ids: [],
    project_names: [],
    context_ids: [],
    context_names: [],
    person_ids: [],
    person_names: [],
    person_roles: [],
    observed_before: NOW,
    project_hint_matched: false,
    context_hint_matched: false,
    person_hint_matched: false,
    last_audited_at: null,
    // A hint-free listing: every row arrives unconnected with no overlap, which
    // is the reachable shape for a query that carried no title.
    prefilter_tier: 3,
    token_overlap: 0,
    query_token_count: 0,
    effective_limit: 26,
    project_ref_id: null,
    context_ref_id: null,
    person_ref_id: null,
    project_ref_name: null,
    context_ref_name: null,
    person_ref_name: null,
    scheduled_reminder_count: 0,
    next_reminder_at: null,
    ...overrides,
  };
}

function client(rows: Record<string, unknown>[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: rows, error: null };
      }),
    } as never,
  };
}

const input = { ownerId: OWNER, now: NOW, timeZone: "America/Sao_Paulo", locale: "en" as const };

describe("the cancelled-task recovery listing", () => {
  it("reads through the candidate RPC, which is where the creation-undone guard lives", async () => {
    const bench = client([sqlRow()]);
    await loadCancelledTaskRecovery(bench.client, input);

    // 2E-DESTRUCTIVE-009: every door into a creation-undone task is closed by
    // one predicate, and it lives inside this RPC. A direct
    // `select … where status = 'cancelled'` would be a second, weaker door.
    expect(bench.calls[0].fn).toBe("list_task_command_candidates");
    expect(bench.calls[0].args.p_eligible_statuses).toEqual(["cancelled"]);
  });

  it("sends no title query, because this is a listing rather than a match", async () => {
    const bench = client([sqlRow()]);
    await loadCancelledTaskRecovery(bench.client, input);
    expect(bench.calls[0].args.p_title_query).toBeUndefined();
  });

  it("renders instants in the caller's zone and locale (2E-I18N-002)", async () => {
    const bench = client([sqlRow({ due_at: "2026-08-01T15:00:00.000Z" })]);
    const recovery = await loadCancelledTaskRecovery(bench.client, input);
    expect(recovery.tasks[0].cancelledAt).toBeTruthy();
    expect(recovery.tasks[0].dueAt).toBeTruthy();

    const other = client([sqlRow({ due_at: "2026-08-01T15:00:00.000Z" })]);
    const shifted = await loadCancelledTaskRecovery(other.client, { ...input, timeZone: "Asia/Tokyo" });
    expect(shifted.tasks[0].dueAt).not.toBe(recovery.tasks[0].dueAt);
  });

  it("survives an unknown zone rather than taking the recovery surface down", async () => {
    const bench = client([sqlRow()]);
    const recovery = await loadCancelledTaskRecovery(bench.client, { ...input, timeZone: "Mars/Olympus" });
    expect(recovery.tasks).toHaveLength(1);
    expect(recovery.tasks[0].cancelledAt).toBeNull();
  });

  it("orders most recently cancelled first, then by id, deterministically", async () => {
    const bench = client([
      sqlRow({ task_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cancelled_at: "2026-07-10T00:00:00.000Z" }),
      sqlRow({ task_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", cancelled_at: "2026-07-25T00:00:00.000Z" }),
      sqlRow({ task_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", cancelled_at: "2026-07-25T00:00:00.000Z" }),
    ]);
    const recovery = await loadCancelledTaskRecovery(bench.client, input);
    expect(recovery.tasks.map((task) => task.taskId)).toEqual([
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
  });

  it("probes one row beyond the page and discloses truncation", async () => {
    const rows = Array.from({ length: CANCELLED_TASK_PAGE_SIZE + 1 }, (_unused, index) =>
      sqlRow({
        task_id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
        cancelled_at: `2026-07-${String((index % 27) + 1).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const bench = client(rows);
    const recovery = await loadCancelledTaskRecovery(bench.client, input);

    expect(bench.calls[0].args.p_limit).toBe(CANCELLED_TASK_PAGE_SIZE + 1);
    expect(recovery.tasks).toHaveLength(CANCELLED_TASK_PAGE_SIZE);
    // Silently dropping the overflow would make a surface that cannot show the
    // task the user is hunting for look like one that has nothing to show.
    expect(recovery.hasMore).toBe(true);
  });

  it("reports an empty recovery surface as empty rather than as an error", async () => {
    const bench = client([]);
    const recovery = await loadCancelledTaskRecovery(bench.client, input);
    expect(recovery).toEqual({ tasks: [], hasMore: false });
  });

  it("carries no field the caller could not already read", async () => {
    const bench = client([sqlRow({ description: "a private note nobody asked for" })]);
    const recovery = await loadCancelledTaskRecovery(bench.client, input);
    expect(Object.keys(recovery.tasks[0]).sort()).toEqual([
      "cancelledAt",
      "dueAt",
      "projectNames",
      "taskId",
      "title",
    ]);
  });
});
