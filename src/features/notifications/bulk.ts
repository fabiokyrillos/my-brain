import { z } from "zod";

/**
 * Life Brain D.2 — emptying the notice queue in one press, audited and undoable.
 *
 * The owner's queue only grew (T5, V2 2:55: "deveria ter uma coisa aqui pra
 * limpar a notificação já lida"; 19 unread on the recording). Two verbs:
 *
 * - **mark all read** — every `unread` notice becomes `read`, stamped with one
 *   instant;
 * - **clear read** — every `read` notice becomes `dismissed`, which is what the
 *   single-row "Descartar" already writes, so it leaves the list the same way.
 *
 * ## Why no migration
 *
 * Both write the columns the single-row `markNotification` already writes under
 * the owner's RLS (`notifications.status`, `read_at`). The audit is an
 * `audit_logs` row, which `authenticated` may insert for itself — the shape the
 * person and project editors already use. `undo_operations` was not used: it
 * takes writes only through a registered compensation handler, and adding one is
 * a migration. The undo here is the audit row read back: it names the rows and
 * the states, and the undo restores **only rows still in the state the bulk
 * left them in**, so a notice the owner touched since is never overwritten.
 *
 * ## What the audit row never carries
 *
 * A notice's title, body or url (`2M-NOTIFY-009`): ids and states only.
 *
 * This module is pure. `bulk-data.ts` reads and writes; `bulk-actions.ts` is the
 * Server Action boundary.
 */

export const NOTIFICATION_BULK_SCOPES = ["mark_all_read", "clear_read"] as const;
export type NotificationBulkScope = (typeof NOTIFICATION_BULK_SCOPES)[number];

/** One press touches at most this many notices; the action says when it hit it. */
export const NOTIFICATION_BULK_LIMIT = 500;

/** How long an undo is offered and honoured. */
export const NOTIFICATION_BULK_UNDO_HOURS = 24;

export const NOTIFICATION_BULK_ACTION_TYPES = {
  mark_all_read: "notifications_marked_read",
  clear_read: "notifications_cleared",
} as const satisfies Record<NotificationBulkScope, string>;

export const NOTIFICATION_BULK_UNDO_ACTION_TYPE = "notifications_bulk_undone";

type NoticeStatus = "unread" | "read" | "dismissed";

export type BulkTransition = {
  readonly from: NoticeStatus;
  readonly to: NoticeStatus;
  readonly actionType: (typeof NOTIFICATION_BULK_ACTION_TYPES)[NotificationBulkScope];
  readonly patch: { readonly status: NoticeStatus; readonly read_at?: string };
};

export function bulkTransition(scope: NotificationBulkScope, now: Date): BulkTransition {
  if (scope === "mark_all_read") {
    return {
      from: "unread",
      to: "read",
      actionType: NOTIFICATION_BULK_ACTION_TYPES.mark_all_read,
      patch: { status: "read", read_at: now.toISOString() },
    };
  }
  return {
    from: "read",
    to: "dismissed",
    actionType: NOTIFICATION_BULK_ACTION_TYPES.clear_read,
    patch: { status: "dismissed" },
  };
}

export type BulkAuditInsert = {
  readonly user_id: string;
  readonly action_type: string;
  readonly entity_type: "notification";
  readonly entity_id: null;
  readonly actor: "user";
  readonly before_state: Record<string, unknown>;
  readonly after_state: Record<string, unknown>;
  readonly reason: string;
};

export function bulkAuditRecord({
  userId,
  scope,
  ids,
  now,
}: {
  readonly userId: string;
  readonly scope: NotificationBulkScope;
  readonly ids: readonly string[];
  readonly now: Date;
}): BulkAuditInsert {
  const transition = bulkTransition(scope, now);
  return {
    user_id: userId,
    action_type: transition.actionType,
    entity_type: "notification",
    entity_id: null,
    actor: "user",
    before_state: { scope, status: transition.from, ids: [...ids] },
    after_state: {
      scope,
      status: transition.to,
      ...(transition.patch.read_at ? { read_at: transition.patch.read_at } : {}),
      count: ids.length,
    },
    reason: scope === "mark_all_read"
      ? "Owner marked every unread notice as read from Notificações"
      : "Owner cleared every read notice from Notificações",
  };
}

const uuid = z.string().uuid();
const auditRowSchema = z.object({
  id: uuid,
  action_type: z.enum([NOTIFICATION_BULK_ACTION_TYPES.mark_all_read, NOTIFICATION_BULK_ACTION_TYPES.clear_read]),
  created_at: z.string().min(1),
  before_state: z.object({
    scope: z.enum(NOTIFICATION_BULK_SCOPES),
    ids: z.array(uuid).max(NOTIFICATION_BULK_LIMIT),
  }).passthrough(),
  after_state: z.object({ read_at: z.string().optional() }).passthrough(),
});

export type ParsedBulkAudit = {
  readonly auditId: string;
  readonly scope: NotificationBulkScope;
  readonly ids: readonly string[];
  readonly createdAt: string;
  /** The instant a "mark all read" stamped; `null` for "clear read". */
  readonly readAt: string | null;
};

/** An audit row read back, or `null` when it is not one of the two bulk rows. */
export function parseBulkAudit(row: unknown): ParsedBulkAudit | null {
  const parsed = auditRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const { id, action_type: actionType, created_at: createdAt, before_state: before, after_state: after } = parsed.data;
  if (NOTIFICATION_BULK_ACTION_TYPES[before.scope] !== actionType) return null;
  return {
    auditId: id,
    scope: before.scope,
    ids: before.ids,
    createdAt,
    readAt: before.scope === "mark_all_read" ? after.read_at ?? null : null,
  };
}

export function undoDeadline(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + NOTIFICATION_BULK_UNDO_HOURS * 60 * 60 * 1000);
}

export type UndoRefusal = "expired" | "already_undone";

export function undoRefusal({
  createdAt,
  alreadyUndone,
  now,
}: {
  readonly createdAt: string;
  readonly alreadyUndone: boolean;
  readonly now: Date;
}): UndoRefusal | null {
  if (alreadyUndone) return "already_undone";
  if (now.getTime() > undoDeadline(createdAt).getTime()) return "expired";
  return null;
}

export function undoAuditRecord({
  userId,
  audit,
  restored,
}: {
  readonly userId: string;
  readonly audit: ParsedBulkAudit;
  readonly restored: number;
}): BulkAuditInsert {
  const transition = bulkTransition(audit.scope, new Date(audit.createdAt));
  return {
    user_id: userId,
    action_type: NOTIFICATION_BULK_UNDO_ACTION_TYPE,
    entity_type: "notification",
    entity_id: null,
    actor: "user",
    before_state: { scope: audit.scope, status: transition.to, ids: [...audit.ids] },
    after_state: { scope: audit.scope, status: transition.from, undoes: audit.auditId, count: restored },
    reason: "Owner undid a bulk change to their notices",
  };
}
