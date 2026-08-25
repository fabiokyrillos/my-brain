import { describe, expect, it } from "vitest";

import { projectNotificationRows, type NotificationRowSource } from "./row-projection";

const TASK_A = "3f7c1b52-0e2a-4d61-9f83-2b6a1c9d4e70";
const TASK_B = "5a2e9c81-4b6d-4f30-8a17-0c9e3d5b7f21";
const REMINDER = "9a1d4e08-77bb-4c2f-8e15-6d3f0a2b9c44";
const OWNER = "11111111-2222-4333-8444-555555555555";

function notice(overrides: Partial<NotificationRowSource> & { id: string }): NotificationRowSource {
  return {
    type: "task_overdue",
    title: "Tarefa atrasada",
    body: "Pagar o aluguel",
    action_url: `/pt-BR/app/work/${TASK_A}`,
    status: "unread",
    created_at: "2026-08-25T10:00:00Z",
    dedupe_key: `overdue:${TASK_A}:2026-08-25`,
    ...overrides,
  };
}

/**
 * A fake keyed by TABLE NAME, which is the shape that already defended a bug in
 * this repository once: a stub that answered to a table the product never
 * queried made a broken read look healthy. So this one **records every table it
 * is asked for**, and the tests assert the query count and the tables by name
 * rather than only the returned rows.
 */
function fakeSupabase(tables: Record<string, { id: string; title: string; status: string }[]>) {
  const calls: { table: string; ids: string[] }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, _value: string) {
              return {
                in(_idColumn: string, ids: string[]) {
                  calls.push({ table, ids });
                  const rows = (tables[table] ?? []).filter((row) => ids.includes(row.id));
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("no N+1: the row count does not change the query count", () => {
  it("reads twenty task-backed rows with ONE task query", async () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      notice({ id: `notice-${index}`, dedupe_key: `overdue:${TASK_A}:2026-08-25` }),
    );
    const { client, calls } = fakeSupabase({ tasks: [{ id: TASK_A, title: "Pagar o aluguel", status: "todo" }] });

    const projected = await projectNotificationRows(client as never, { rows, userId: OWNER, locale: "pt-BR" });

    expect(projected).toHaveLength(20);
    expect(calls.filter((call) => call.table === "tasks")).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("deduplicates subject ids, so two notices about one task ask for it once", async () => {
    const rows = [
      notice({ id: "a", dedupe_key: `overdue:${TASK_A}:2026-08-25` }),
      notice({ id: "b", type: "task_stale", dedupe_key: `stale:${TASK_A}:2026-08-25` }),
    ];
    const { client, calls } = fakeSupabase({ tasks: [{ id: TASK_A, title: "Pagar o aluguel", status: "todo" }] });

    await projectNotificationRows(client as never, { rows, userId: OWNER, locale: "pt-BR" });

    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual([TASK_A]);
  });

  it("issues NO query at all when no row has a resolvable subject", async () => {
    /*
     * `.in("id", [])` can only return nothing, so issuing it is a round trip
     * bought for no answer. Asserted rather than assumed, because a stub that
     * happily answers an empty `in` would hide it.
     */
    const rows = [notice({ id: "a", dedupe_key: null })];
    const { client, calls } = fakeSupabase({});

    const projected = await projectNotificationRows(client as never, { rows, userId: OWNER, locale: "pt-BR" });

    expect(calls).toHaveLength(0);
    expect(projected[0].verbs.map((verb) => verb.id)).toEqual(["mark_read", "dismiss"]);
  });

  it("reads tasks and reminders in one query each, never one per row", async () => {
    const rows = [
      notice({ id: "a", dedupe_key: `overdue:${TASK_A}:2026-08-25` }),
      notice({ id: "b", dedupe_key: `overdue:${TASK_B}:2026-08-25` }),
      notice({ id: "c", type: "reminder", dedupe_key: `reminder:${REMINDER}` }),
    ];
    const { client, calls } = fakeSupabase({
      tasks: [
        { id: TASK_A, title: "A", status: "todo" },
        { id: TASK_B, title: "B", status: "todo" },
      ],
      reminders: [{ id: REMINDER, title: "R", status: "pending" }],
    });

    await projectNotificationRows(client as never, { rows, userId: OWNER, locale: "pt-BR" });

    expect(calls.map((call) => call.table).sort()).toEqual(["reminders", "tasks"]);
    expect(calls.find((call) => call.table === "tasks")?.ids.sort()).toEqual([TASK_A, TASK_B].sort());
  });
});

describe("fail-closed: an invalid link means no task action, never a wrong one", () => {
  it("offers no task verb when the subject no longer exists (2S-REACH-004)", async () => {
    // The batch read simply does not return it — a deleted task.
    const { client } = fakeSupabase({ tasks: [] });

    const [row] = await projectNotificationRows(client as never, {
      rows: [notice({ id: "a" })],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(row.subjectStatus).toBeNull();
    expect(row.verbs.map((verb) => verb.id)).toEqual(["mark_read", "dismiss"]);
    expect(row.primaryVerb?.id).toBe("mark_read");
  });

  it("offers no task verb when the key does not decode to a uuid", async () => {
    const { client } = fakeSupabase({ tasks: [{ id: TASK_A, title: "A", status: "todo" }] });

    const [row] = await projectNotificationRows(client as never, {
      rows: [notice({ id: "a", dedupe_key: "overdue:not-a-uuid:2026-08-25" })],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(row.subject).toBeNull();
    expect(row.verbs.map((verb) => verb.id)).not.toContain("complete_task");
  });

  it("offers no task verb for a forged key naming a task this owner does not have", async () => {
    /*
     * The read is owner-scoped, so a `dedupe_key` naming someone else's task
     * returns nothing and the row falls back to message verbs. This is the
     * branch that matters most: the id here came out of a string.
     */
    const { client } = fakeSupabase({ tasks: [{ id: TASK_A, title: "A", status: "todo" }] });

    const [row] = await projectNotificationRows(client as never, {
      rows: [notice({ id: "a", dedupe_key: `overdue:${TASK_B}:2026-08-25` })],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(row.subjectStatus).toBeNull();
    expect(row.verbs.map((verb) => verb.id)).not.toContain("complete_task");
  });

  it("offers no completion for a subject whose status does not admit it", async () => {
    const { client } = fakeSupabase({ tasks: [{ id: TASK_A, title: "A", status: "completed" }] });

    const [row] = await projectNotificationRows(client as never, {
      rows: [notice({ id: "a" })],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(row.subjectStatus).toBe("completed");
    expect(row.verbs.map((verb) => verb.id)).not.toContain("complete_task");
  });
});

describe("2S-ACT-001: two subjects in different states get different primaries in one list", () => {
  it("renders a task verb for the live subject and a message verb for the settled one", async () => {
    const { client } = fakeSupabase({
      tasks: [
        { id: TASK_A, title: "Live", status: "todo" },
        { id: TASK_B, title: "Settled", status: "completed" },
      ],
    });

    const projected = await projectNotificationRows(client as never, {
      rows: [
        notice({ id: "live", dedupe_key: `overdue:${TASK_A}:2026-08-25` }),
        notice({ id: "settled", dedupe_key: `overdue:${TASK_B}:2026-08-25` }),
      ],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(projected[0].primaryVerb?.id).toBe("complete_task");
    expect(projected[1].primaryVerb?.id).toBe("mark_read");
    expect(projected[0].primaryVerb?.id).not.toBe(projected[1].primaryVerb?.id);
  });

  it("carries the subject's own title for accessible names", async () => {
    const { client } = fakeSupabase({ tasks: [{ id: TASK_A, title: "Pagar o aluguel", status: "todo" }] });

    const [row] = await projectNotificationRows(client as never, {
      rows: [notice({ id: "a", body: "stale body copy" })],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(row.subjectLabel).toBe("Pagar o aluguel");
  });
});
