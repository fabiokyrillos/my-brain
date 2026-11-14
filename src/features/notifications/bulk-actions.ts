"use server";

import { z } from "zod";

import { assertActiveAccount } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

import {
  NOTIFICATION_BULK_LIMIT,
  NOTIFICATION_BULK_SCOPES,
  bulkAuditRecord,
  bulkTransition,
  parseBulkAudit,
  undoAuditRecord,
  undoDeadline,
  undoRefusal,
} from "./bulk";
import {
  applyBulkTransition,
  insertBulkAudit,
  isBulkUndone,
  loadBulkAudit,
  loadBulkTargets,
  revertBulkTransition,
} from "./bulk-data";
import type { NotificationBulkState } from "./bulk-state";
import { getNotificationSettingsCopy } from "./copy";

/**
 * Life Brain D.2 — the two bulk notice verbs and their undo (ADR-166).
 *
 * The locale is resolved first, before anything is validated
 * (`ENGINEERING_STANDARDS.md` Interface 5). Authentication and the account's
 * lifecycle are checked here, independently of the UI.
 *
 * **No `revalidatePath`.** The undo lives in the component that submitted, and
 * revalidating the page from inside the action re-renders it inside the action's
 * own transition — the shape that froze a dialog and destroyed an undo in this
 * repository before. The component refreshes the route itself once the action
 * has settled.
 */

const applySchema = z.object({ scope: z.enum(NOTIFICATION_BULK_SCOPES) });
const undoSchema = z.object({ auditId: z.string().uuid() });

async function owner(locale: ReturnType<typeof resolveLocale>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  await assertActiveAccount(supabase, data.user.id, locale);
  return { supabase, userId: data.user.id };
}

function failed(message: string): NotificationBulkState {
  return { status: "failed", scope: null, count: 0, message, undo: null };
}

export async function applyNotificationBulk(
  _state: NotificationBulkState,
  formData: FormData,
): Promise<NotificationBulkState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getNotificationSettingsCopy(locale).bulk;
  const parsed = applySchema.safeParse({ scope: formData.get("scope") });
  if (!parsed.success) return failed(copy.failed);
  const session = await owner(locale);
  if (!session) return failed(copy.failed);

  const now = new Date();
  const { scope } = parsed.data;
  const transition = bulkTransition(scope, now);
  const targets = await loadBulkTargets(session.supabase, session.userId, transition.from);
  if (!targets) return failed(copy.failed);
  if (targets.ids.length === 0) {
    return { status: "nothing", scope, count: 0, message: copy.nothing, undo: null };
  }

  const moved = await applyBulkTransition(session.supabase, session.userId, targets.ids, transition);
  if (moved === null) return failed(copy.failed);
  if (moved === 0) return { status: "nothing", scope, count: 0, message: copy.nothing, undo: null };

  // The audit names every id the write was aimed at; the undo's state guard is
  // what keeps it from touching one that did not move.
  const audit = await insertBulkAudit(
    session.supabase,
    bulkAuditRecord({ userId: session.userId, scope, ids: targets.ids, now }),
  );
  const done = scope === "mark_all_read" ? copy.marked(moved) : copy.cleared(moved);
  return {
    status: "applied",
    scope,
    count: moved,
    message: targets.truncated ? `${done} ${copy.truncated(NOTIFICATION_BULK_LIMIT)}` : done,
    undo: audit ? { auditId: audit.id, expiresAt: undoDeadline(audit.createdAt).toISOString() } : null,
  };
}

export async function undoNotificationBulk(
  _state: NotificationBulkState,
  formData: FormData,
): Promise<NotificationBulkState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getNotificationSettingsCopy(locale).bulk;
  const parsed = undoSchema.safeParse({ auditId: formData.get("auditId") });
  if (!parsed.success) return failed(copy.undoFailed);
  const session = await owner(locale);
  if (!session) return failed(copy.undoFailed);

  const audit = parseBulkAudit(await loadBulkAudit(session.supabase, session.userId, parsed.data.auditId));
  if (!audit) return failed(copy.undoFailed);

  const undone = await isBulkUndone(session.supabase, session.userId, audit.auditId);
  if (undone === null) return failed(copy.undoFailed);
  const refusal = undoRefusal({ createdAt: audit.createdAt, alreadyUndone: undone, now: new Date() });
  if (refusal) return failed(refusal === "expired" ? copy.undoExpired : copy.undoAlready);

  const transition = bulkTransition(audit.scope, new Date(audit.createdAt));
  const restored = await revertBulkTransition(session.supabase, session.userId, audit.ids, transition, audit.readAt);
  if (restored === null) return failed(copy.undoFailed);
  await insertBulkAudit(session.supabase, undoAuditRecord({ userId: session.userId, audit, restored }));
  return { status: "undone", scope: audit.scope, count: restored, message: copy.undone(restored), undo: null };
}
