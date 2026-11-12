import { beforeEach, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import * as data from "./bulk-data";
import { applyNotificationBulk, undoNotificationBulk } from "./bulk-actions";
import { idleNotificationBulkState } from "./bulk-state";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ assertActiveAccount: vi.fn(async () => undefined) }));
vi.mock("./bulk-data", () => ({
  loadBulkTargets: vi.fn(),
  applyBulkTransition: vi.fn(),
  revertBulkTransition: vi.fn(),
  insertBulkAudit: vi.fn(),
  loadBulkAudit: vi.fn(),
  isBulkUndone: vi.fn(),
}));

const USER = "2f4b0001-0000-4000-8000-000000000001";
const AUDIT = "2f4b0001-0000-4000-8000-0000000000aa";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function signedIn(user: string | null = USER) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: user ? { id: user } : null }, error: null })) },
  } as never);
}

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
  vi.mocked(data.insertBulkAudit).mockResolvedValue({ id: AUDIT, createdAt: "2026-11-12T15:00:00.000Z" });
});

describe("applyNotificationBulk", () => {
  it("marks the owner's unread notices read, audits the ids, and offers the undo", async () => {
    vi.mocked(data.loadBulkTargets).mockResolvedValue({ ids: [ID(1), ID(2), ID(3)], truncated: false });
    vi.mocked(data.applyBulkTransition).mockResolvedValue(3);

    const state = await applyNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", scope: "mark_all_read" }));

    expect(data.loadBulkTargets).toHaveBeenCalledWith(expect.anything(), USER, "unread");
    const [, owner, ids, transition] = vi.mocked(data.applyBulkTransition).mock.calls[0];
    expect(owner).toBe(USER);
    expect(ids).toEqual([ID(1), ID(2), ID(3)]);
    expect(transition).toMatchObject({ from: "unread", to: "read" });

    const record = vi.mocked(data.insertBulkAudit).mock.calls[0][1];
    expect(record).toMatchObject({ user_id: USER, action_type: "notifications_marked_read", entity_type: "notification" });
    expect(record.before_state).toMatchObject({ ids: [ID(1), ID(2), ID(3)] });

    expect(state).toMatchObject({ status: "applied", count: 3, undo: { auditId: AUDIT } });
    expect(state.message).toBe("3 avisos marcados como lidos.");
  });

  it("audits only the rows that really moved", async () => {
    vi.mocked(data.loadBulkTargets).mockResolvedValue({ ids: [ID(1), ID(2)], truncated: false });
    vi.mocked(data.applyBulkTransition).mockResolvedValue(1);
    const state = await applyNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", scope: "clear_read" }));
    expect(state).toMatchObject({ status: "applied", count: 1 });
    expect(state.message).toBe("1 aviso lido saiu da lista.");
  });

  it("says when the limit cut it short", async () => {
    vi.mocked(data.loadBulkTargets).mockResolvedValue({ ids: [ID(1)], truncated: true });
    vi.mocked(data.applyBulkTransition).mockResolvedValue(1);
    const state = await applyNotificationBulk(idleNotificationBulkState, form({ locale: "en", scope: "clear_read" }));
    expect(state.message).toContain("500 most recent");
  });

  it("writes nothing when there is nothing to change", async () => {
    vi.mocked(data.loadBulkTargets).mockResolvedValue({ ids: [], truncated: false });
    const state = await applyNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", scope: "mark_all_read" }));
    expect(data.applyBulkTransition).not.toHaveBeenCalled();
    expect(data.insertBulkAudit).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: "nothing", undo: null });
  });

  it("refuses a scope outside the two, and a caller with no session, before any read", async () => {
    expect((await applyNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", scope: "delete_all" }))).status).toBe("failed");
    signedIn(null);
    expect((await applyNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", scope: "clear_read" }))).status).toBe("failed");
    expect(data.loadBulkTargets).not.toHaveBeenCalled();
  });

  it("offers no undo when the audit could not be written", async () => {
    vi.mocked(data.loadBulkTargets).mockResolvedValue({ ids: [ID(1)], truncated: false });
    vi.mocked(data.applyBulkTransition).mockResolvedValue(1);
    vi.mocked(data.insertBulkAudit).mockResolvedValue(null);
    const state = await applyNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", scope: "clear_read" }));
    expect(state.undo).toBeNull();
  });
});

describe("undoNotificationBulk", () => {
  const audit = (createdAt = "2026-11-12T15:00:00.000Z") => ({
    id: AUDIT,
    action_type: "notifications_marked_read",
    created_at: createdAt,
    before_state: { scope: "mark_all_read", status: "unread", ids: [ID(1), ID(2)] },
    after_state: { scope: "mark_all_read", status: "read", read_at: createdAt, count: 2 },
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-11-12T16:00:00.000Z"), toFake: ["Date"] });
  });

  it("puts back only what the bulk change still owns, and audits the undo", async () => {
    vi.mocked(data.loadBulkAudit).mockResolvedValue(audit());
    vi.mocked(data.isBulkUndone).mockResolvedValue(false);
    vi.mocked(data.revertBulkTransition).mockResolvedValue(2);

    const state = await undoNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", auditId: AUDIT }));

    expect(data.loadBulkAudit).toHaveBeenCalledWith(expect.anything(), USER, AUDIT);
    const [, owner, ids, transition, stamped] = vi.mocked(data.revertBulkTransition).mock.calls[0];
    expect(owner).toBe(USER);
    expect(ids).toEqual([ID(1), ID(2)]);
    expect(transition).toMatchObject({ from: "unread", to: "read" });
    expect(stamped).toBe("2026-11-12T15:00:00.000Z");
    expect(vi.mocked(data.insertBulkAudit).mock.calls[0][1]).toMatchObject({
      action_type: "notifications_bulk_undone",
      after_state: { undoes: AUDIT, count: 2 },
    });
    expect(state).toMatchObject({ status: "undone", count: 2, undo: null });
    vi.useRealTimers();
  });

  it("refuses after the window, and a second time", async () => {
    vi.mocked(data.loadBulkAudit).mockResolvedValue(audit("2026-11-10T15:00:00.000Z"));
    vi.mocked(data.isBulkUndone).mockResolvedValue(false);
    expect((await undoNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", auditId: AUDIT }))).message)
      .toBe("Já passou o prazo para desfazer isso.");

    vi.mocked(data.loadBulkAudit).mockResolvedValue(audit());
    vi.mocked(data.isBulkUndone).mockResolvedValue(true);
    expect((await undoNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", auditId: AUDIT }))).message)
      .toBe("Isso já foi desfeito.");
    expect(data.revertBulkTransition).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("refuses an audit row that is not a bulk notice change", async () => {
    vi.mocked(data.loadBulkAudit).mockResolvedValue({ ...audit(), action_type: "reminder_cancelled" });
    const state = await undoNotificationBulk(idleNotificationBulkState, form({ locale: "pt-BR", auditId: AUDIT }));
    expect(state.status).toBe("failed");
    expect(data.revertBulkTransition).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
