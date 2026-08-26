/**
 * `2S-ATTENTION-008` — **neither surface may hold a state the other
 * contradicts.**
 *
 * *"An action taken on `/app/notifications` is read back from the attention
 * surface, and the reverse."*
 *
 * Three surfaces now read the same table: the history page, Home, and the full
 * *Precisa de você* queue. They agree for two separate reasons, and both are
 * asserted here because either one alone would leave a way to disagree:
 *
 * 1. **They read the same rows through the same projection.** A row answered on
 *    one surface is a row the others resolve differently on their next read.
 * 2. **Every write invalidates all three routes.** Without that, "the next read"
 *    never happens: Next serves the cached page, and the owner sees a row they
 *    already answered.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadAttentionNotices } from "./attention-notices";
import { projectNotificationRows, type NotificationRowSource } from "./row-projection";

vi.mock("server-only", () => ({}));

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const OWNER = "11111111-2222-4333-8444-555555555555";
const TASK = "3f7c1b52-0e2a-4d61-9f83-2b6a1c9d4e70";

type Row = NotificationRowSource & { user_id: string };

function notice(overrides: Partial<Row> = {}): Row {
  return {
    id: "notice-1",
    type: "task_overdue",
    title: "Uma tarefa passou do prazo",
    body: "Pagar o aluguel",
    action_url: `/pt-BR/app/work/${TASK}`,
    status: "unread",
    created_at: "2026-08-25T10:00:00Z",
    dedupe_key: `overdue:${TASK}:2026-08-25`,
    user_id: OWNER,
    ...overrides,
  };
}

function fakeSupabase(seed: { notifications: Row[]; tasks?: { id: string; title: string; status: string; user_id: string }[] }) {
  function query(table: string) {
    const filters: Record<string, string> = {};
    const rows = () => {
      const all = ((table === "notifications" ? seed.notifications : seed.tasks) ?? []) as Record<string, unknown>[];
      return all.filter((row) => Object.entries(filters).every(([column, value]) => row[column] === value));
    };
    const api = {
      select: () => api,
      eq(column: string, value: string) {
        filters[column] = value;
        return api;
      },
      order: () => api,
      limit: (count: number) => Promise.resolve({ data: rows().slice(0, count), error: null }),
      in: (_column: string, ids: string[]) =>
        Promise.resolve({ data: rows().filter((row) => ids.includes(row.id as string)), error: null }),
    };
    return api;
  }
  return { from: (table: string) => query(table) };
}

describe("an action on one surface is read back from the other", () => {
  it("drops a notice from the attention surface once the history page marked it read", async () => {
    const answered = notice({ status: "read" });
    const client = fakeSupabase({
      notifications: [answered],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    // The attention surface reads the UNANSWERED ones, so the row is gone.
    const attention = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });
    expect(attention.items).toEqual([]);

    /*
     * And the history page still holds it, reading `read` — the two surfaces
     * disagree about nothing: one shows what is waiting, the other shows what
     * happened, and both read the same row.
     */
    const history = await projectNotificationRows(client as never, {
      rows: [answered],
      userId: OWNER,
      locale: "pt-BR",
    });
    expect(history[0].notification.status).toBe("read");
    // A row already read offers no *marcar como lido* on either surface.
    expect(history[0].verbs.some((verb) => verb.id === "mark_read")).toBe(false);
  });

  it("still shows an unanswered notice on both — the control that makes the above mean something", async () => {
    const waiting = notice();
    const client = fakeSupabase({
      notifications: [waiting],
      tasks: [{ id: TASK, title: "Pagar o aluguel", status: "todo", user_id: OWNER }],
    });

    const attention = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });
    const history = await projectNotificationRows(client as never, {
      rows: [waiting],
      userId: OWNER,
      locale: "pt-BR",
    });

    expect(attention.items).toHaveLength(1);
    expect(attention.items[0].notification.id).toBe(history[0].notification.id);
    // The same row resolves to the same verbs on both, because it is the same
    // projection: a difference here would be two surfaces disagreeing about
    // what the owner may do.
    expect(attention.items[0].verbs.map((verb) => verb.id))
      .toEqual(history[0].verbs.map((verb) => verb.id));
  });

  it("hides a dismissed notice from BOTH, by different clauses that must agree", async () => {
    /*
     * The attention surface filters on `status = 'unread'`; the history page
     * filters `.neq("status", "dismissed")`. Two different predicates, and a
     * dismissal has to satisfy both — this is the pairing most able to drift.
     */
    const dismissed = notice({ status: "dismissed" });
    const client = fakeSupabase({ notifications: [dismissed] });

    const attention = await loadAttentionNotices(client as never, { userId: OWNER, locale: "pt-BR" });
    expect(attention.items).toEqual([]);
    expect(read("src/app/[locale]/app/notifications/page.tsx"))
      .toContain('.neq("status", "dismissed")');
  });
});

describe("every write invalidates every surface that shows the row", () => {
  /**
   * The three routes a notice is now visible on.
   *
   * `/app/notifications` needs the ROUTE PATTERN and the `page` type: it lives
   * under a dynamic `[locale]` segment, and slice 2P.4 measured that without the
   * type the invalidation matches nothing and the row stays unread on screen
   * after the owner answers it.
   */
  const SURFACES = [
    { call: 'revalidatePath("/[locale]/app/notifications", "page")', why: "the history page" },
    { call: "/app`)", why: "Home" },
    { call: "/app/inbox`)", why: "the full needs-you queue" },
  ] as const;

  const WRITERS = [
    { file: "src/features/agent/actions.ts", fn: "markNotification" },
    { file: "src/features/notifications/actions.ts", fn: "suppressNotificationSubject" },
  ] as const;

  /**
   * One exported function's body, and the scan is scoped to it deliberately.
   *
   * A CHECK CAN PASS BY CONTAINING ITS OWN SUBJECT, and this one did: a mutation
   * control that deleted `markNotification`'s inbox invalidation left the test
   * green, because `agent/actions.ts` holds another action that already
   * revalidates `/app/inbox` for its own reasons. A file-wide `toContain` was
   * reading a neighbour.
   */
  function bodyOf(file: string, fn: string): string {
    const source = read(file);
    const start = source.indexOf(`export async function ${fn}(`);
    expect(start, `${file} does not export ${fn}`).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  }

  it("names all three inside the body of every writer a notice's controls dispatch to", () => {
    for (const writer of WRITERS) {
      const body = bodyOf(writer.file, writer.fn);
      for (const surface of SURFACES) {
        expect(body, `${writer.fn} does not invalidate ${surface.why}`).toContain(surface.call);
      }
    }
  });

  it("reads bodies that really contain a revalidation — the non-vacuity control", () => {
    // A scan over a slice of source with no `revalidatePath` at all would
    // satisfy nothing above and report nothing wrong.
    for (const writer of WRITERS) {
      const body = bodyOf(writer.file, writer.fn);
      expect(body.split("revalidatePath").length - 1, `${writer.fn} revalidates nothing`)
        .toBeGreaterThanOrEqual(SURFACES.length);
    }
  });
});
