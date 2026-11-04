"use server";

/**
 * Life Brain C.3 (ADR-152) — putting a record's events on the agenda, and
 * cancelling one. Both go through their audited RPCs; nothing here writes
 * `events` directly (authenticated holds SELECT only).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { getEventCopy } from "./copy";
import type { EventActionState } from "./state";

const localeSchema = z.enum(["pt-BR", "en"]);
const confirmSchema = z.object({
  entryId: z.string().uuid(),
  interpretationId: z.string().uuid(),
  operationKey: z.string().uuid(),
  candidateIndexes: z.array(z.number().int().min(0).max(49)).min(1).max(20),
});
const cancelSchema = z.object({ entryId: z.string().uuid(), eventId: z.string().uuid() });

function readLocale(formData: FormData) {
  const parsed = localeSchema.safeParse(formData.get("locale") ?? "pt-BR");
  return parsed.success ? parsed.data : "pt-BR";
}

function refresh(entryId: string) {
  for (const locale of ["pt-BR", "en"] as const) {
    revalidatePath(`/${locale}/app/inbox/${entryId}`);
    revalidatePath(`/${locale}/app/calendar`);
    revalidatePath(`/${locale}/app`);
  }
}

export async function confirmEventCandidates(_state: EventActionState, formData: FormData): Promise<EventActionState> {
  const locale = readLocale(formData);
  const copy = getEventCopy(locale);
  let candidateIndexes: unknown = null;
  try {
    candidateIndexes = JSON.parse(String(formData.get("candidateIndexes") ?? ""));
  } catch {
    candidateIndexes = null;
  }
  const parsed = confirmSchema.safeParse({
    entryId: formData.get("entryId"),
    interpretationId: formData.get("interpretationId"),
    operationKey: formData.get("operationKey"),
    candidateIndexes,
  });
  if (!parsed.success) return { status: "error", message: copy.nothingSelected, undoId: null };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.unauthenticated, undoId: null };
  await assertActiveAccount(supabase, user.id, locale);

  const { data, error } = await supabase.rpc("confirm_entry_event_candidates", {
    p_entry_id: parsed.data.entryId,
    p_expected_interpretation_id: parsed.data.interpretationId,
    p_candidate_indexes: parsed.data.candidateIndexes,
    p_operation_key: parsed.data.operationKey,
  });
  if (error) {
    const stale = error.code === "55P03" || /STALE_INTERPRETATION|ALREADY_CONFIRMED/.test(error.details ?? "");
    return { status: "error", message: stale ? copy.stale : copy.failed, undoId: null };
  }
  const result = (data ?? {}) as { undoId?: unknown; eventIds?: unknown };
  const count = Array.isArray(result.eventIds) ? result.eventIds.length : parsed.data.candidateIndexes.length;
  refresh(parsed.data.entryId);
  return {
    status: "success",
    message: copy.confirmed(count),
    undoId: typeof result.undoId === "string" ? result.undoId : null,
  };
}

export async function cancelEvent(_state: EventActionState, formData: FormData): Promise<EventActionState> {
  const locale = readLocale(formData);
  const copy = getEventCopy(locale);
  const parsed = cancelSchema.safeParse({ entryId: formData.get("entryId"), eventId: formData.get("eventId") });
  if (!parsed.success) return { status: "error", message: copy.failed, undoId: null };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.unauthenticated, undoId: null };
  await assertActiveAccount(supabase, user.id, locale);

  const { error } = await supabase.rpc("cancel_event", { p_event_id: parsed.data.eventId });
  if (error) return { status: "error", message: copy.failed, undoId: null };
  refresh(parsed.data.entryId);
  return { status: "success", message: copy.cancelled, undoId: null };
}

const undoSchema = z.object({ entryId: z.string().uuid(), undoId: z.string().uuid() });

/** Takes back the events a confirmation put on the agenda, through the undo router. */
export async function undoEventCandidates(_state: EventActionState, formData: FormData): Promise<EventActionState> {
  const locale = readLocale(formData);
  const copy = getEventCopy(locale);
  const parsed = undoSchema.safeParse({ entryId: formData.get("entryId"), undoId: formData.get("undoId") });
  if (!parsed.success) return { status: "error", message: copy.failed, undoId: null };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.unauthenticated, undoId: null };
  await assertActiveAccount(supabase, user.id, locale);

  const { error } = await supabase.rpc("undo_operation", { p_undo_id: parsed.data.undoId });
  if (error) return { status: "error", message: copy.failed, undoId: null };
  refresh(parsed.data.entryId);
  return { status: "success", message: copy.undone, undoId: null };
}
