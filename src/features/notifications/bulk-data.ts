import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  NOTIFICATION_BULK_LIMIT,
  NOTIFICATION_BULK_UNDO_ACTION_TYPE,
  type BulkAuditInsert,
  type BulkTransition,
} from "./bulk";

/**
 * Life Brain D.2 — every read and write the bulk notice verbs make, in one place
 * (`ENGINEERING_STANDARDS.md` Code 5). Each query names the owner explicitly as
 * well as running under RLS, and each write carries the state guard that keeps
 * it from touching a notice that moved since it was read.
 */

type Client = SupabaseClient;

/** The ids of the owner's notices in `status`, newest first, at most the limit + 1. */
export async function loadBulkTargets(
  supabase: Client,
  userId: string,
  status: BulkTransition["from"],
): Promise<{ readonly ids: readonly string[]; readonly truncated: boolean } | null> {
  const result = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_BULK_LIMIT + 1);
  if (result.error || !result.data) return null;
  const ids = (result.data as { id: string }[]).map((row) => row.id);
  return { ids: ids.slice(0, NOTIFICATION_BULK_LIMIT), truncated: ids.length > NOTIFICATION_BULK_LIMIT };
}

/** Applies the transition to `ids` that are still in `from`. Returns how many moved. */
export async function applyBulkTransition(
  supabase: Client,
  userId: string,
  ids: readonly string[],
  transition: BulkTransition,
): Promise<number | null> {
  if (ids.length === 0) return 0;
  const result = await supabase
    .from("notifications")
    .update(transition.patch)
    .eq("user_id", userId)
    .eq("status", transition.from)
    .in("id", [...ids])
    .select("id");
  if (result.error) return null;
  return (result.data ?? []).length;
}

/**
 * Puts back the rows the bulk change still owns: in `to`, and — for "mark all
 * read" — still carrying the instant it stamped, so a notice read again later
 * by hand is left alone.
 */
export async function revertBulkTransition(
  supabase: Client,
  userId: string,
  ids: readonly string[],
  transition: BulkTransition,
  stampedReadAt: string | null,
): Promise<number | null> {
  if (ids.length === 0) return 0;
  const restore = transition.from === "unread"
    ? { status: "unread" as const, read_at: null }
    : { status: transition.from };
  let query = supabase
    .from("notifications")
    .update(restore)
    .eq("user_id", userId)
    .eq("status", transition.to)
    .in("id", [...ids]);
  if (stampedReadAt !== null) query = query.eq("read_at", stampedReadAt);
  const result = await query.select("id");
  if (result.error) return null;
  return (result.data ?? []).length;
}

export async function insertBulkAudit(supabase: Client, record: BulkAuditInsert): Promise<{ readonly id: string; readonly createdAt: string } | null> {
  const result = await supabase.from("audit_logs").insert(record).select("id,created_at").single();
  if (result.error || !result.data) return null;
  const row = result.data as { id: string; created_at: string };
  return { id: row.id, createdAt: row.created_at };
}

export async function loadBulkAudit(supabase: Client, userId: string, auditId: string): Promise<unknown | null> {
  const result = await supabase
    .from("audit_logs")
    .select("id,action_type,created_at,before_state,after_state")
    .eq("user_id", userId)
    .eq("id", auditId)
    .maybeSingle();
  if (result.error) return null;
  return result.data ?? null;
}

/** Whether an undo row already points at `auditId`. `null` when it cannot be read. */
export async function isBulkUndone(supabase: Client, userId: string, auditId: string): Promise<boolean | null> {
  const result = await supabase
    .from("audit_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("action_type", NOTIFICATION_BULK_UNDO_ACTION_TYPE)
    .eq("after_state->>undoes", auditId)
    .limit(1);
  if (result.error) return null;
  return (result.data ?? []).length > 0;
}
