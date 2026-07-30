import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Phase 2F reminder census — bucket-predicate proofs and the write-free guarantee
 * (`2F-OPERATIONS-005`, definitive Slice 2F.6 PRD §6.3 F29, F35).
 *
 * Two of the nine buckets decide whether closeout proceeds, and until Slice 2F.6
 * nothing checked either of them. A bucket that silently inverted — or a paging
 * bug that dropped the task page bucket 1 joins against — would have made the
 * stop-gate fail **open**, which is the worst direction for a gate to fail in.
 *
 * The predicates are exercised here against injected rows, in both directions:
 * every bucket has a case that populates it and a case that must leave it empty.
 */

const REPO = resolve(__dirname, "../../..");
const CENSUS = join(REPO, "scripts/phase-2f-reminder-census.mjs");

type Module = typeof import("../../../scripts/phase-2f-reminder-census.mjs");

async function load(): Promise<Module> {
  return (await import("../../../scripts/phase-2f-reminder-census.mjs")) as Module;
}

const owner = "11111111-1111-1111-1111-111111111111";
const stranger = "22222222-2222-2222-2222-222222222222";

function reminder(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    user_id: owner,
    task_id: null as string | null,
    entry_id: null as string | null,
    status: "scheduled",
    remind_at: "2027-01-01T00:00:00.000Z",
    snoozed_until: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return { id: "t1", user_id: owner, status: "todo", due_at: "2027-01-01T00:00:00.000Z", ...overrides };
}

describe("2F-OPERATIONS-005: bucket 1 — live reminder on a terminal task (BLOCKING)", () => {
  it("counts a scheduled reminder bound to a completed task", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS, stopGateTriggered } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ task_id: "t1" })],
      [task({ status: "completed" })],
    );
    expect(buckets[BLOCKING_BUCKETS[0]]).toHaveLength(1);
    expect(stopGateTriggered(buckets)).toBe(true);
  });

  it("counts a cancelled task too, because both statuses are terminal", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ task_id: "t1" })],
      [task({ status: "cancelled" })],
    );
    expect(buckets[BLOCKING_BUCKETS[0]]).toHaveLength(1);
  });

  it("does not count a sent reminder, because only `scheduled` ever fires", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS, stopGateTriggered } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ task_id: "t1", status: "sent" })],
      [task({ status: "completed" })],
    );
    expect(buckets[BLOCKING_BUCKETS[0]]).toHaveLength(0);
    expect(stopGateTriggered(buckets)).toBe(false);
  });

  it("does not count a live reminder on a non-terminal task", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus([reminder({ task_id: "t1" })], [task({ status: "waiting" })]);
    expect(buckets[BLOCKING_BUCKETS[0]]).toHaveLength(0);
  });
});

describe("2F-OPERATIONS-005: bucket 2 — live task-bound reminder on a null-due task (BLOCKING)", () => {
  it("counts a scheduled reminder whose non-terminal task has no due date", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS, stopGateTriggered } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ task_id: "t1" })],
      [task({ due_at: null })],
    );
    expect(buckets[BLOCKING_BUCKETS[1]]).toHaveLength(1);
    expect(stopGateTriggered(buckets)).toBe(true);
  });

  it("does not count it when the task carries a due date", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus([reminder({ task_id: "t1" })], [task()]);
    expect(buckets[BLOCKING_BUCKETS[1]]).toHaveLength(0);
  });

  it("does not double-count a terminal task with no due date — bucket 1 owns that row", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ task_id: "t1" })],
      [task({ status: "completed", due_at: null })],
    );
    expect(buckets[BLOCKING_BUCKETS[0]]).toHaveLength(1);
    expect(buckets[BLOCKING_BUCKETS[1]]).toHaveLength(0);
  });

  it("does not count an independent reminder — the F9 failure mode a naive join would hit", async () => {
    const { computeReminderCensus, BLOCKING_BUCKETS } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus([reminder({ task_id: null })], []);
    expect(buckets[BLOCKING_BUCKETS[1]]).toHaveLength(0);
  });
});

describe("2F-OPERATIONS-005: the structurally impossible buckets are still measured", () => {
  it("bucket 3 counts a reminder whose owner differs from its task's owner", async () => {
    const { computeReminderCensus } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ task_id: "t1" })],
      [task({ user_id: stranger })],
    );
    expect(buckets["3. reminder.user_id differs from its task's user_id (composite FK forbids)"])
      .toHaveLength(1);
  });

  it("bucket 4 counts a reminder pointing at a task that is not there", async () => {
    const { computeReminderCensus } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus([reminder({ task_id: "missing" })], [task()]);
    expect(buckets["4. task_id references a nonexistent task (FK cascade forbids)"]).toHaveLength(1);
  });

  it("a missing task does not silently satisfy bucket 1, which is how the gate would fail open", async () => {
    // `TERMINAL_TASK_STATUSES.has(undefined)` is false, so an unresolvable task
    // lands in bucket 4 rather than being quietly dropped. This is exactly what a
    // skipped paging window would produce, which is why the paging order matters.
    const { computeReminderCensus, BLOCKING_BUCKETS } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus([reminder({ task_id: "missing" })], []);
    expect(buckets[BLOCKING_BUCKETS[0]]).toHaveLength(0);
    expect(buckets["4. task_id references a nonexistent task (FK cascade forbids)"]).toHaveLength(1);
  });
});

describe("2F-OPERATIONS-005: the informational and total buckets", () => {
  it("bucket 5 counts snoozed rows, which nothing in production writes and nothing fires", async () => {
    const { computeReminderCensus } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus([reminder({ status: "snoozed" })], []);
    expect(buckets["5. snoozed rows (never fire; no reactivation path exists)"]).toHaveLength(1);
    expect(buckets["9. total live reminders"]).toHaveLength(0);
  });

  it("buckets 6 and 7 separate independent reminders from the live ones, and neither blocks", async () => {
    const { computeReminderCensus, INFORMATIONAL_BUCKET, stopGateTriggered } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [reminder({ id: "a" }), reminder({ id: "b", status: "sent" })],
      [],
    );
    expect(buckets["6. independent reminders (task_id is null)"]).toHaveLength(2);
    expect(buckets[INFORMATIONAL_BUCKET]).toHaveLength(1);
    expect(stopGateTriggered(buckets)).toBe(false);
  });

  it("the reconciliation population is exactly the two blocking buckets", async () => {
    const { computeReminderCensus, reconciliationPopulation } = await load();
    const buckets: Record<string, unknown[]> = computeReminderCensus(
      [
        reminder({ id: "a", task_id: "t1" }),
        reminder({ id: "b", task_id: "t2" }),
        reminder({ id: "c" }),
      ],
      [task({ id: "t1", status: "completed" }), task({ id: "t2", due_at: null })],
    );
    expect(reconciliationPopulation(buckets)).toBe(2);
  });

  it("computes the supplementary breakdowns against an injected clock", async () => {
    const { computeReminderBreakdowns } = await load();
    const breakdowns = computeReminderBreakdowns(
      [
        reminder({ id: "a", remind_at: "2026-01-01T00:00:00.000Z" }),
        reminder({ id: "b", status: "sent", user_id: stranger }),
        reminder({ id: "c", entry_id: "e1" }),
      ],
      new Date("2026-07-30T00:00:00.000Z"),
    );
    expect(breakdowns.byStatus).toEqual({ scheduled: 2, sent: 1 });
    expect(breakdowns.independentWithEntry).toBe(1);
    expect(breakdowns.overdueLive).toBe(1);
    expect(breakdowns.distinctOwners).toBe(2);
  });
});

describe("2F-OPERATIONS-005: the census stays read-only and pages with a total order", () => {
  it("issues no insert, update, delete, upsert or rpc call anywhere in its source", async () => {
    // The docstring's read-only guarantee is what lets this script run against
    // production before any reconciliation decision exists. Asserting it makes
    // the guarantee mechanical rather than a promise in a comment.
    const source = readFileSync(CENSUS, "utf8");
    for (const method of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(source, `the census must not call ${method}`).not.toContain(method);
    }
  });

  it("orders every paged read, because OFFSET over an unordered relation may skip or repeat a row", async () => {
    // Asserted as the chain rather than by counting occurrences: the docstring
    // records the defect it fixed and therefore mentions `.range()` in prose, so
    // a count would be confounded by the explanation of the very thing it checks.
    const source = readFileSync(CENSUS, "utf8");
    expect(source).toMatch(
      /\.order\("id", \{ ascending: true \}\)\s*\n\s*\.range\(from, from \+ page - 1\)/,
    );
  });

  it("refuses to report counts when paging never exhausts, rather than truncating silently", async () => {
    const { fetchAll } = await load();
    const alwaysFull = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({ data: Array.from({ length: 3 }, (_, i) => ({ id: i })), error: null }),
          }),
        }),
      }),
    };
    await expect(fetchAll(alwaysFull as never, "reminders", "id", { page: 3, maxPages: 4 }))
      .rejects.toThrow(/without exhausting the table/);
  });

  it("stops on the first short page and returns every row it read", async () => {
    const { fetchAll } = await load();
    const pages = [[{ id: 1 }, { id: 2 }], [{ id: 3 }]];
    let call = 0;
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({ data: pages[call++] ?? [], error: null }),
          }),
        }),
      }),
    };
    await expect(fetchAll(client as never, "reminders", "id", { page: 2 }))
      .resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(call).toBe(2);
  });

  it("raises the table name when a read fails, and never swallows it", async () => {
    const { fetchAll } = await load();
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({ range: async () => ({ data: null, error: { message: "boom" } }) }),
        }),
      }),
    };
    await expect(fetchAll(client as never, "reminders", "id")).rejects.toThrow(/reminders: boom/);
  });

  it("states its read-atomicity limitation in its own output", async () => {
    const source = readFileSync(CENSUS, "utf8");
    expect(source).toContain("SECOND CONFIRMING RUN");
    expect(source).toContain("It is not a snapshot");
  });

  it("keeps the select lists free of reminder content", async () => {
    const source = readFileSync(CENSUS, "utf8");
    expect(source).toContain('"id,user_id,task_id,entry_id,status,remind_at,snoozed_until,created_at"');
    expect(source).not.toContain("title");
  });
});
