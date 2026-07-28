import { describe, expect, it, vi } from "vitest";

import {
  TASK_COMMAND_UNDO_ACTION_TYPES,
  classifyTaskCommandUndo,
  loadTaskCommandUndoOperation,
  loadTaskCommandUndoOperations,
} from "./undo-listing";
import { TASK_COMMAND_UNDO_STATES } from "./outcomes";

vi.mock("server-only", () => ({}));

const UNDO_ID = "66666666-6666-4666-8666-666666666666";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-07-28T12:00:00.000Z";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: UNDO_ID,
    action_type: "apply_task_command",
    entity_ids: [TASK_ID],
    created_at: "2026-07-28T11:00:00.000Z",
    expires_at: "2026-07-29T11:00:00.000Z",
    status: "available",
    ...overrides,
  };
}

function singleClient(data: unknown) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return {
    from: vi.fn(() => query),
  } as never;
}

function listClient(data: unknown) {
  const calls: Record<string, unknown[]> = { in: [], overlaps: [], order: [], limit: [] };
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.in = vi.fn((...args: unknown[]) => { calls.in.push(args); return query; });
  query.overlaps = vi.fn((...args: unknown[]) => { calls.overlaps.push(args); return query; });
  query.order = vi.fn((...args: unknown[]) => { calls.order.push(args); return query; });
  query.limit = vi.fn(async (...args: unknown[]) => { calls.limit.push(args); return { data, error: null }; });
  return { client: { from: vi.fn(() => query) } as never, calls };
}

describe("classification", () => {
  it("uses only the declared vocabulary", () => {
    const produced = [
      classifyTaskCommandUndo({ status: "available", expiresAt: "2099-01-01T00:00:00Z" }, NOW),
      classifyTaskCommandUndo({ status: "available", expiresAt: "2000-01-01T00:00:00Z" }, NOW),
      classifyTaskCommandUndo({ status: "undone", expiresAt: "2099-01-01T00:00:00Z" }, NOW),
    ];
    for (const state of produced) expect(TASK_COMMAND_UNDO_STATES).toContain(state);
  });

  it("separates expired from no-longer-available (2E-UNDO-007)", () => {
    expect(classifyTaskCommandUndo({ status: "available", expiresAt: "2026-07-29T00:00:00Z" }, NOW))
      .toBe("available");
    expect(classifyTaskCommandUndo({ status: "available", expiresAt: "2026-07-27T00:00:00Z" }, NOW))
      .toBe("expired");
    expect(classifyTaskCommandUndo({ status: "undone", expiresAt: "2099-01-01T00:00:00Z" }, NOW))
      .toBe("unavailable");
  });

  it("calls a spent-and-expired operation unavailable, which is the truer sentence", () => {
    expect(classifyTaskCommandUndo({ status: "undone", expiresAt: "2000-01-01T00:00:00Z" }, NOW))
      .toBe("unavailable");
  });

  it("treats the exact expiry instant as expired rather than as a last chance", () => {
    expect(classifyTaskCommandUndo({ status: "available", expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("fails closed on an unreadable expiry", () => {
    expect(classifyTaskCommandUndo({ status: "available", expiresAt: "not a date" }, NOW))
      .toBe("expired");
  });

  it("reads the clock it is given, never the ambient one", () => {
    const future = classifyTaskCommandUndo(
      { status: "available", expiresAt: "2026-07-29T00:00:00Z" },
      "2030-01-01T00:00:00Z",
    );
    expect(future).toBe("expired");
  });
});

describe("loading one operation", () => {
  it("returns null for an operation that is not Phase 2E's", async () => {
    // An entry-scoped `confirm_entry_task_candidates_v6` row also carries
    // `entity_type = 'task'`; without the action-type filter it would be
    // offered here as an undo this surface did not produce.
    const client = singleClient(row({ action_type: "confirm_entry_task_candidates" }));
    expect(await loadTaskCommandUndoOperation(client, { undoId: UNDO_ID, now: NOW })).toBeNull();
  });

  it("returns null when RLS produced no row at all", async () => {
    const client = singleClient(null);
    expect(await loadTaskCommandUndoOperation(client, { undoId: UNDO_ID, now: NOW })).toBeNull();
  });

  it("carries the task the operation touched", async () => {
    const client = singleClient(row());
    const operation = await loadTaskCommandUndoOperation(client, { undoId: UNDO_ID, now: NOW });
    expect(operation).toMatchObject({ undoId: UNDO_ID, taskId: TASK_ID, state: "available" });
  });

  it("tolerates a creation whose undo already emptied its entity list", async () => {
    const client = singleClient(row({ action_type: "create_task_command", entity_ids: [] }));
    const operation = await loadTaskCommandUndoOperation(client, { undoId: UNDO_ID, now: NOW });
    expect(operation?.taskId).toBeNull();
  });

  it("accepts every action type Phase 2E registers, and nothing else", async () => {
    for (const actionType of TASK_COMMAND_UNDO_ACTION_TYPES) {
      const client = singleClient(row({ action_type: actionType }));
      expect(await loadTaskCommandUndoOperation(client, { undoId: UNDO_ID, now: NOW })).not.toBeNull();
    }
  });
});

describe("listing by task", () => {
  it("asks for nothing when there is no task to ask about", async () => {
    const { client, calls } = listClient([]);
    expect(await loadTaskCommandUndoOperations(client, { taskIds: [], now: NOW })).toEqual([]);
    expect(calls.limit).toHaveLength(0);
  });

  it("filters to Phase 2E action types and the given tasks, newest first", async () => {
    const { client, calls } = listClient([row(), row({ id: "x", action_type: "unrelated" })]);
    const operations = await loadTaskCommandUndoOperations(client, {
      taskIds: [TASK_ID],
      now: NOW,
    });

    expect(calls.in[0]).toEqual(["action_type", [...TASK_COMMAND_UNDO_ACTION_TYPES]]);
    expect(calls.overlaps[0]).toEqual(["entity_ids", [TASK_ID]]);
    expect(calls.order[0]).toEqual(["created_at", { ascending: false }]);
    // The unrelated row is dropped rather than mapped to a half-built operation.
    expect(operations).toHaveLength(1);
  });
});
