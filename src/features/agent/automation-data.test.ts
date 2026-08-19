import { describe, expect, it, vi } from "vitest";

import { loadAutomationPolicyHistory, loadAutomationStatus } from "./automation-data";
import { permitsAutomaticWrite } from "./automation-policy";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

function statusClient(rows: Row[]) {
  return {
    rpc: vi.fn(async (name: string) => {
      expect(name).toBe("automation_category_status");
      return { data: rows, error: null };
    }),
  } as never;
}

function historyClient(rows: Row[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };
  return { from: vi.fn(() => builder) } as never;
}

function statusRow(overrides: Row = {}): Row {
  return {
    category: "task",
    state: "suggest_only",
    eligible: false,
    reason: "suggest_only_by_owner",
    reviewed: 0,
    approved: 0,
    corrected: 0,
    rejected: 0,
    undone: 0,
    precision_ratio: null,
    recent_reviewed: 0,
    newest_observed_at: null,
    recent_undo: false,
    has_producer: true,
    required_reviewed: 50,
    required_precision: 0.9,
    ...overrides,
  };
}

describe("the automation status projection", () => {
  it("carries the database's decision through unchanged", async () => {
    const [decision] = await loadAutomationStatus(
      statusClient([statusRow({ reviewed: 3, approved: 1, corrected: 1, rejected: 1, precision_ratio: 0.3333 })]),
    );

    expect(decision.category).toBe("task");
    expect(decision.reason).toBe("suggest_only_by_owner");
    expect(decision.eligible).toBe(false);
    expect(decision.calibration.reviewed).toBe(3);
    expect(decision.calibration.precision).toBeCloseTo(0.3333);
    expect(decision.requiredReviewed).toBe(50);
    expect(permitsAutomaticWrite(decision)).toBe(false);
  });

  it("passes an eligible decision through too, so the mapping is not a constant", async () => {
    const [decision] = await loadAutomationStatus(
      statusClient([
        statusRow({ state: "automatic_when_eligible", eligible: true, reason: "automatic", reviewed: 60, approved: 59, precision_ratio: 0.9833 }),
      ]),
    );

    expect(permitsAutomaticWrite(decision)).toBe(true);
  });

  it("refuses a row whose reason is outside the closed vocabulary", async () => {
    // A projection that drifted must fail loudly. Rendering an unknown reason
    // would put a sentence on the screen that no copy entry defines, and this
    // repository has already shipped a heading of `undefined` that way.
    await expect(loadAutomationStatus(statusClient([statusRow({ reason: "probably_fine" })]))).rejects.toThrow();
  });

  it("refuses a row whose state is outside the closed vocabulary", async () => {
    await expect(loadAutomationStatus(statusClient([statusRow({ state: "autonomous" })]))).rejects.toThrow();
  });

  it("refuses a precision outside 0..1", async () => {
    await expect(loadAutomationStatus(statusClient([statusRow({ precision_ratio: 1.4 })]))).rejects.toThrow();
  });
});

describe("the policy change history", () => {
  const now = "2026-08-19T12:00:00.000Z";

  it("reads the change and offers the reversal while the row is live", async () => {
    const [change] = await loadAutomationPolicyHistory(
      historyClient([
        {
          id: "11111111-1111-4111-8111-111111111111",
          status: "available",
          expires_at: "2026-08-20T12:00:00.000Z",
          created_at: "2026-08-19T11:00:00.000Z",
          before_state: { category: "task", state: null },
          after_state: { category: "task", state: "automatic_when_eligible" },
        },
      ]),
      now,
    );

    expect(change.category).toBe("task");
    expect(change.from).toBeNull();
    expect(change.to).toBe("automatic_when_eligible");
    expect(change.undoable).toBe(true);
  });

  it("stops offering the reversal once the row is spent or expired", async () => {
    const rows = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        status: "undone",
        expires_at: "2026-08-20T12:00:00.000Z",
        created_at: "2026-08-19T11:00:00.000Z",
        before_state: { category: "person", state: "suggest_only" },
        after_state: { category: "person", state: "disabled" },
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        status: "available",
        expires_at: "2026-08-18T12:00:00.000Z",
        created_at: "2026-08-17T11:00:00.000Z",
        before_state: { category: "memory", state: "suggest_only" },
        after_state: { category: "memory", state: "disabled" },
      },
    ];

    const changes = await loadAutomationPolicyHistory(historyClient(rows), now);
    expect(changes.map((change) => change.undoable)).toEqual([false, false]);
  });

  it("drops a row whose recorded state is unreadable rather than rendering it", async () => {
    const changes = await loadAutomationPolicyHistory(
      historyClient([
        {
          id: "44444444-4444-4444-8444-444444444444",
          status: "available",
          expires_at: "2026-08-20T12:00:00.000Z",
          created_at: "2026-08-19T11:00:00.000Z",
          before_state: null,
          after_state: { category: "task", state: null },
        },
      ]),
      now,
    );

    expect(changes).toEqual([]);
  });
});
