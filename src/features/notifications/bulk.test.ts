import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_BULK_LIMIT,
  NOTIFICATION_BULK_UNDO_HOURS,
  bulkAuditRecord,
  bulkTransition,
  parseBulkAudit,
  undoAuditRecord,
  undoDeadline,
  undoRefusal,
} from "./bulk";

/**
 * Life Brain D.2 (T5: "deveria ter uma coisa aqui pra limpar a notificação já
 * lida"). The queue only grew. Two bulk verbs, each audited and undoable — the
 * reversible-automatic-action rule of `ENGINEERING_STANDARDS.md` §Security 3–4.
 */

const NOW = new Date("2026-11-12T15:00:00.000Z");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("the two transitions", () => {
  it("'mark all read' moves unread to read and stamps one instant", () => {
    expect(bulkTransition("mark_all_read", NOW)).toEqual({
      from: "unread",
      to: "read",
      actionType: "notifications_marked_read",
      patch: { status: "read", read_at: "2026-11-12T15:00:00.000Z" },
    });
  });

  it("'clear read' moves read to dismissed and leaves read_at alone", () => {
    expect(bulkTransition("clear_read", NOW)).toEqual({
      from: "read",
      to: "dismissed",
      actionType: "notifications_cleared",
      patch: { status: "dismissed" },
    });
  });

  it("is bounded, so one press can never rewrite an unbounded queue", () => {
    expect(NOTIFICATION_BULK_LIMIT).toBe(500);
  });
});

describe("the audit row records ids and states, never what a notice said", () => {
  const record = bulkAuditRecord({
    userId: ID(99),
    scope: "mark_all_read",
    ids: [ID(1), ID(2)],
    now: NOW,
  });

  it("is the owner's act on notices, with no single subject", () => {
    expect(record).toMatchObject({
      user_id: ID(99),
      action_type: "notifications_marked_read",
      entity_type: "notification",
      entity_id: null,
      actor: "user",
    });
  });

  it("names the rows and the states the undo needs", () => {
    expect(record.before_state).toEqual({ scope: "mark_all_read", status: "unread", ids: [ID(1), ID(2)] });
    expect(record.after_state).toEqual({ scope: "mark_all_read", status: "read", read_at: NOW.toISOString(), count: 2 });
  });

  it("carries no title, body or url (2M-NOTIFY-009)", () => {
    const serialized = JSON.stringify(record);
    expect(serialized).not.toMatch(/title|body|action_url|dedupe/);
  });
});

describe("reading an audit row back for the undo", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: ID(50),
    action_type: "notifications_cleared",
    created_at: "2026-11-12T14:00:00.000Z",
    before_state: { scope: "clear_read", status: "read", ids: [ID(1)] },
    after_state: { scope: "clear_read", status: "dismissed", count: 1 },
    ...overrides,
  });

  it("accepts the shape the action writes", () => {
    expect(parseBulkAudit(row())).toEqual({
      auditId: ID(50),
      scope: "clear_read",
      ids: [ID(1)],
      createdAt: "2026-11-12T14:00:00.000Z",
      readAt: null,
    });
  });

  it("refuses any other action type, so the undo cannot be pointed at another row", () => {
    expect(parseBulkAudit(row({ action_type: "reminder_cancelled" }))).toBeNull();
  });

  it("refuses a row whose ids are not uuids", () => {
    expect(parseBulkAudit(row({ before_state: { scope: "clear_read", status: "read", ids: ["x"] } }))).toBeNull();
  });

  it("keeps the instant a 'mark all read' stamped, which is what tells its rows apart", () => {
    const parsed = parseBulkAudit(row({
      action_type: "notifications_marked_read",
      before_state: { scope: "mark_all_read", status: "unread", ids: [ID(1)] },
      after_state: { scope: "mark_all_read", status: "read", read_at: "2026-11-12T14:00:00.000Z", count: 1 },
    }));
    expect(parsed?.readAt).toBe("2026-11-12T14:00:00.000Z");
  });
});

describe("when an undo is refused", () => {
  const created = "2026-11-12T14:00:00.000Z";

  it(`lasts ${NOTIFICATION_BULK_UNDO_HOURS} hours`, () => {
    expect(undoDeadline(created).toISOString()).toBe("2026-11-13T14:00:00.000Z");
    expect(undoRefusal({ createdAt: created, alreadyUndone: false, now: new Date("2026-11-13T13:59:59.000Z") })).toBeNull();
    expect(undoRefusal({ createdAt: created, alreadyUndone: false, now: new Date("2026-11-13T14:00:01.000Z") })).toBe("expired");
  });

  it("happens once", () => {
    expect(undoRefusal({ createdAt: created, alreadyUndone: true, now: NOW })).toBe("already_undone");
  });
});

describe("the undo's own audit row", () => {
  it("points at the row it undoes and records the states it restored", () => {
    const record = undoAuditRecord({
      userId: ID(99),
      audit: { auditId: ID(50), scope: "clear_read", ids: [ID(1), ID(2)], createdAt: NOW.toISOString(), readAt: null },
      restored: 1,
    });
    expect(record).toMatchObject({
      user_id: ID(99),
      action_type: "notifications_bulk_undone",
      entity_type: "notification",
      entity_id: null,
      actor: "user",
      before_state: { scope: "clear_read", status: "dismissed", ids: [ID(1), ID(2)] },
      after_state: { scope: "clear_read", status: "read", undoes: ID(50), count: 1 },
    });
  });
});
