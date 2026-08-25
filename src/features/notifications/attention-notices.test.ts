import { describe, expect, it, vi } from "vitest";

import { ATTENTION_NOTICE_LIMIT, loadAttentionNotices } from "./attention-notices";

// The loader is a Server Component module by construction; jsdom reaches the
// guard the moment it imports it. The established pattern in this repository.
vi.mock("server-only", () => ({}));

const TASK = "3f7c1b52-0e2a-4d61-9f83-2b6a1c9d4e70";
const OWNER = "11111111-2222-4333-8444-555555555555";
const INTRUDER = "99999999-8888-4777-8666-555555555555";

type NoticeRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  status: string;
  created_at: string;
  dedupe_key: string | null;
  user_id: string;
};

function notice(overrides: Partial<NoticeRow> & { id: string }): NoticeRow {
  return {
    type: "task_overdue",
    title: "Uma tarefa passou do prazo",
    body: "Pagar o aluguel",
    action_url: null,
    status: "unread",
    created_at: "2026-08-25T10:00:00Z",
    dedupe_key: `overdue:${TASK}:2026-08-25`,
    user_id: OWNER,
    ...overrides,
  };
}

/**
 * A fake that **applies the filters it is given** rather than answering every
 * question with the same rows.
 *
 * That distinction is the whole value of these tests. A stub that returned its
 * fixture regardless of `.eq("user_id", …)` would pass an owner-scoping test
 * against a loader that had no scoping at all — which is the failure mode this
 * repository has already paid for once, in a stub keyed by table name that
 * answered for a table the product never queried.
 *
 * Every call is recorded, so the query COUNT is assertable too: the projection
 * behind `2S-ACT-001` is only affordable if the row count does not change it.
 */
function fakeSupabase(seed: {
  notifications?: NoticeRow[];
  tasks?: { id: string; title: string; status: string; user_id: string }[];
  reminders?: { id: string; title: string; status: string; user_id: string }[];
}) {
  const calls: { table: string; filters: Record<string, string>; limit?: number; ids?: string[] }[] = [];

  function query(table: string) {
    const filters: Record<string, string> = {};
    const rows = () => {
      const all = (seed[table as keyof typeof seed] ?? []) as Record<string, unknown>[];
      return all.filter((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
    };
    const api = {
      select: () => api,
      eq(column: string, value: string) {
        filters[column] = value;
        return api;
      },
      order() {
        return api;
      },
      limit(count: number) {
        calls.push({ table, filters: { ...filters }, limit: count });
        return Promise.resolve({ data: rows().slice(0, count), error: null });
      },
      in(_column: string, ids: string[]) {
        calls.push({ table, filters: { ...filters }, ids });
        return Promise.resolve({ data: rows().filter((row) => ids.includes(row.id as string)), error: null });
      },
    };
    return api;
  }

  return { client: { from: (table: string) => query(table) }, calls };
}

describe("the attention surface reads the UNANSWERED notices", () => {
  it("asks for the unread status and for this owner, both explicitly", async () => {
    const { client, calls } = fakeSupabase({
      notifications: [notice({ id: "a" })],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    const read = calls.find((call) => call.table === "notifications");
    expect(read?.filters).toEqual({ user_id: OWNER, status: "unread" });
  });

  it("does not return a notice the owner already answered", async () => {
    /*
     * `notifications.status` has exactly three members. Read and dismissed are
     * both answers the owner gave; unread is the absence of one, and the
     * attention surface is where things still waiting on the owner live.
     *
     * A control that planted only unread rows would pass against a loader with
     * no status filter at all, so both answered states are planted here and the
     * assertion is that neither comes back.
     */
    const { client } = fakeSupabase({
      notifications: [
        notice({ id: "answered-read", status: "read" }),
        notice({ id: "answered-dismissed", status: "dismissed" }),
        notice({ id: "waiting" }),
      ],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items.map((row) => row.notification.id)).toEqual(["waiting"]);
  });

  it("returns nothing for an owner who has none, even when another owner has some", async () => {
    const { client } = fakeSupabase({
      notifications: [notice({ id: "not-yours", user_id: INTRUDER })],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: INTRUDER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});

describe("the bound is real, and hasMore is answered without a second round trip", () => {
  it("returns the limit and reports more when a further row exists", async () => {
    const { client, calls } = fakeSupabase({
      notifications: Array.from({ length: ATTENTION_NOTICE_LIMIT + 4 }, (_, index) =>
        notice({ id: `n-${index}` }),
      ),
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items).toHaveLength(ATTENTION_NOTICE_LIMIT);
    expect(page.hasMore).toBe(true);
    // One read of `notifications`, and it asked for exactly one row more than
    // the bound — the extra row IS the answer to `hasMore`.
    const reads = calls.filter((call) => call.table === "notifications");
    expect(reads).toHaveLength(1);
    expect(reads[0].limit).toBe(ATTENTION_NOTICE_LIMIT + 1);
  });

  it("reports no more when the page is exactly the bound", async () => {
    const { client } = fakeSupabase({
      notifications: Array.from({ length: ATTENTION_NOTICE_LIMIT }, (_, index) => notice({ id: `n-${index}` })),
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items).toHaveLength(ATTENTION_NOTICE_LIMIT);
    expect(page.hasMore).toBe(false);
  });
});

describe("no N+1, and no query bought for no answer", () => {
  it("resolves every subject on the page with ONE query per kind", async () => {
    const { client, calls } = fakeSupabase({
      notifications: [
        notice({ id: "a" }),
        notice({ id: "b", type: "task_stale", dedupe_key: `stale:${TASK}:2026-08-25` }),
      ],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(calls.filter((call) => call.table === "tasks")).toHaveLength(1);
    expect(calls.filter((call) => call.table === "reminders")).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });

  it("issues no subject query at all when the page is empty", async () => {
    const { client, calls } = fakeSupabase({ notifications: [] });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe("the verbs come from the one authority, not from this loader", () => {
  it("offers the task verbs when the subject resolves and admits them", async () => {
    const { client } = fakeSupabase({
      notifications: [notice({ id: "a" })],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items[0].primaryVerb?.id).toBe("complete_task");
    expect(page.items[0].subjectLabel).toBe("Pagar o aluguel");
  });

  it("offers NO task verb when the subject belongs to someone else", async () => {
    /*
     * `2S-REACH-004` seen from the surface: a forged or stale key naming
     * another owner's task resolves to nothing under the owner-scoped read, so
     * the row keeps its message verbs and dispatches no task command against an
     * id that decoded to something it does not own.
     *
     * The intruder's task is PLANTED, so a loader that dropped the owner scope
     * would resolve it and this test would fail — a control asserting an absence
     * against an empty table would prove nothing.
     */
    const { client } = fakeSupabase({
      notifications: [notice({ id: "a" })],
      tasks: [{ id: TASK, title: "A tarefa de outra pessoa", status: "todo", user_id: INTRUDER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items[0].subjectStatus).toBeNull();
    expect(page.items[0].verbs.every((verb) => verb.scope !== "task")).toBe(true);
    // And it does not leak the foreign title either.
    expect(page.items[0].subjectLabel).not.toContain("outra pessoa");
  });

  it("offers NO task verb when the subject no longer exists", async () => {
    const { client } = fakeSupabase({
      notifications: [notice({ id: "a" })],
      tasks: [],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items[0].subjectStatus).toBeNull();
    expect(page.items[0].verbs.every((verb) => verb.scope !== "task")).toBe(true);
  });

  it("offers NO task verb when the key is unreadable", async () => {
    const { client } = fakeSupabase({
      notifications: [notice({ id: "a", dedupe_key: "overdue:not-a-uuid:2026-08-25" })],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    const page = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });

    expect(page.items[0].subject).toBeNull();
    expect(page.items[0].verbs.every((verb) => verb.scope !== "task")).toBe(true);
  });
});
