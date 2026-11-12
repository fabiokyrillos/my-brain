import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { bulkTransition } from "./bulk";
import { applyBulkTransition, isBulkUndone, loadBulkTargets, revertBulkTransition } from "./bulk-data";

/**
 * The queries themselves: which table, which filters, which patch. A recording
 * fake rather than a stub keyed by table name — every call in the chain is kept,
 * so a missing owner filter or state guard fails here.
 */
function recorder(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "select", "update", "eq", "in", "order", "limit", "maybeSingle", "single", "insert"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return chain;
    };
  }
  (chain as { then: unknown }).then = (resolve: (value: unknown) => void) => resolve(result);
  return { client: chain as never, calls };
}

const USER = "2f4b0001-0000-4000-8000-000000000001";
const A = "00000000-0000-4000-8000-000000000001";

describe("loadBulkTargets", () => {
  it("reads the owner's notices in one status, newest first, one past the limit", async () => {
    const { client, calls } = recorder({ data: [{ id: A }], error: null });
    expect(await loadBulkTargets(client, USER, "unread")).toEqual({ ids: [A], truncated: false });
    expect(calls).toEqual(expect.arrayContaining([
      ["from", ["notifications"]],
      ["eq", ["user_id", USER]],
      ["eq", ["status", "unread"]],
      ["limit", [501]],
    ]));
  });
});

describe("applyBulkTransition", () => {
  it("guards on the owner, the starting status and the ids", async () => {
    const { client, calls } = recorder({ data: [{ id: A }], error: null });
    const transition = bulkTransition("clear_read", new Date("2026-11-12T15:00:00.000Z"));
    expect(await applyBulkTransition(client, USER, [A], transition)).toBe(1);
    expect(calls).toEqual(expect.arrayContaining([
      ["update", [{ status: "dismissed" }]],
      ["eq", ["user_id", USER]],
      ["eq", ["status", "read"]],
      ["in", ["id", [A]]],
    ]));
  });

  it("writes nothing for no ids", async () => {
    const { client, calls } = recorder({ data: [], error: null });
    expect(await applyBulkTransition(client, USER, [], bulkTransition("clear_read", new Date()))).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("revertBulkTransition", () => {
  it("restores unread only on rows still read at the instant the bulk stamped", async () => {
    const { client, calls } = recorder({ data: [{ id: A }], error: null });
    const transition = bulkTransition("mark_all_read", new Date("2026-11-12T15:00:00.000Z"));
    expect(await revertBulkTransition(client, USER, [A], transition, "2026-11-12T15:00:00.000Z")).toBe(1);
    expect(calls).toEqual(expect.arrayContaining([
      ["update", [{ status: "unread", read_at: null }]],
      ["eq", ["status", "read"]],
      ["eq", ["read_at", "2026-11-12T15:00:00.000Z"]],
    ]));
  });

  it("restores read, and leaves read_at alone, after a clear", async () => {
    const { client, calls } = recorder({ data: [], error: null });
    await revertBulkTransition(client, USER, [A], bulkTransition("clear_read", new Date()), null);
    expect(calls).toEqual(expect.arrayContaining([["update", [{ status: "read" }]], ["eq", ["status", "dismissed"]]]));
    expect(calls.some(([name, args]) => name === "eq" && args[0] === "read_at")).toBe(false);
  });
});

describe("isBulkUndone", () => {
  it("looks for an undo row that points at this audit row", async () => {
    const { client, calls } = recorder({ data: [{ id: "x" }], error: null });
    expect(await isBulkUndone(client, USER, A)).toBe(true);
    expect(calls).toEqual(expect.arrayContaining([
      ["from", ["audit_logs"]],
      ["eq", ["action_type", "notifications_bulk_undone"]],
      ["eq", ["after_state->>undoes", A]],
    ]));
  });
});
