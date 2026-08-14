"use server";

/**
 * `2N-CORRECT-004…005`, `009…013` — the four Server Actions that reach M3, and
 * nothing else that reaches it.
 *
 * ## There is no client write here, and there could not be
 *
 * `2N-CORRECT-008/009` forbid a direct client write and a client-side
 * multi-delete. That rule is normally an instruction; here it is a fact the
 * grants enforce. The intermediate re-audit measured that `authenticated` holds
 * **no `DELETE`** on `entry_entities` or `entity_attachments`, so a client
 * sequence could not finish this deletion even if someone wrote one — it would
 * remove the person and leave every mention and alias pointing at a dead id,
 * **raising nothing**. Every function below is a single RPC call.
 *
 * ## The three outcomes that are one outcome
 *
 * `unavailable` covers absent, foreign and unreadable. `unconfirmed` covers
 * missing, already-consumed and issued-for-another-subject. Both collapses are
 * inherited from M3 rather than invented here — the database raises one code
 * for each family, precisely so no caller can build the branch that would tell
 * a stranger's id from a made-up one.
 *
 * ## Why the preview is read again on confirm
 *
 * It is not: `2N-CORRECT-010` says the preview is **never** an authorization,
 * and this module never sends the numbers it read back to the server. The
 * server re-counts inside the applying transaction and refuses if its own
 * digest moved. What travels between the two calls is an `operationKey`, which
 * selects among the caller's own confirmations and authorizes nothing.
 */

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale, type Locale } from "@/lib/preferences";

import type { DeletableEntityType, DeletionOutcome } from "./contracts";
import { getDeletionCopy } from "./copy";
import {
  deletionConfirmationSchema,
  deletionPreviewSchema,
  deletionRequestSchema,
  deletionResultSchema,
  undoResultSchema,
  type ParsedDeletionConfirmation,
  type ParsedDeletionPreview,
} from "./schema";

export type DeletionState = {
  readonly status: "idle" | "previewed" | "confirmed" | "deleted" | "undone" | "error";
  readonly outcome: DeletionOutcome | null;
  readonly message: string | null;
  readonly preview: ParsedDeletionPreview | ParsedDeletionConfirmation | null;
  readonly undoId: string | null;
};

export const IDLE_DELETION_STATE: DeletionState = {
  status: "idle",
  outcome: null,
  message: null,
  preview: null,
  undoId: null,
};

/**
 * SQLSTATE to outcome, and nothing wider.
 *
 * The default is `failed`, which reports that **nothing was removed** — the
 * only safe thing to say about an error this map does not recognize, and true
 * because M3 is one transaction: an error anywhere in it means no row moved.
 */
function outcomeFor(error: PostgrestError): DeletionOutcome {
  if (error.code === "55P03") return "stale";
  if (error.code === "P0002") return "unavailable";
  if (error.code === "42501") return "unconfirmed";
  return "failed";
}

function errored(locale: Locale, outcome: DeletionOutcome, preview: DeletionState["preview"] = null): DeletionState {
  return {
    status: "error",
    outcome,
    message: getDeletionCopy(locale).outcomes[outcome],
    preview,
    undoId: null,
  };
}

function fields(formData: FormData) {
  return {
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    operationKey: formData.get("operationKey"),
    locale: formData.get("locale") ?? undefined,
  };
}

/**
 * Revalidates the surfaces a deletion or an undo changes.
 *
 * The list is per type and deliberately includes the **index** as well as the
 * detail route: after a deletion the detail route 404s, and a stale index that
 * still lists the row is the one place a user would reasonably conclude the
 * deletion silently failed.
 */
function revalidateFor(locale: Locale, entityType: DeletableEntityType, entityId: string): void {
  const segment = entityType === "person" ? "people" : entityType === "project" ? "projects" : "memories";
  revalidatePath(`/${locale}/app/${segment}`);
  revalidatePath(`/${locale}/app/${segment}/${entityId}`);
  // Deleting a person nulls `tasks.waiting_on_person_id`, and deleting either a
  // person or a project nulls a memory's link — surfaces that render those
  // would otherwise keep showing a name that no longer resolves.
  revalidatePath(`/${locale}/app/waiting`);
  revalidatePath(`/${locale}/app/memories`);
}

/**
 * `2N-CORRECT-010` — the preview, produced entirely by the server.
 *
 * It writes nothing and issues nothing, so opening a dialog and closing it
 * leaves no trace and grants no authority.
 */
export async function previewDeletion(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const locale = resolveLocale(formData.get("locale"));
  const parsed = deletionRequestSchema.safeParse(fields(formData));
  if (!parsed.success) return errored(locale, "unavailable");

  const { supabase } = await requireUser(locale);
  const { data, error } = await supabase.rpc("preview_entity_deletion", {
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
  });
  if (error) return errored(locale, outcomeFor(error));

  const preview = deletionPreviewSchema.safeParse(data);
  if (!preview.success) return errored(locale, "failed");

  return { status: "previewed", outcome: null, message: null, preview: preview.data, undoId: null };
}

/**
 * `2N-CORRECT-005` — the server issues the confirmation. The client receives
 * no token it could replay, and the id it does receive authorizes nothing.
 */
export async function confirmDeletion(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const locale = resolveLocale(formData.get("locale"));
  const parsed = deletionRequestSchema.safeParse(fields(formData));
  if (!parsed.success) return errored(locale, "unavailable");

  const { supabase } = await requireUser(locale);
  const { data, error } = await supabase.rpc("issue_entity_deletion_confirmation", {
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
    p_operation_key: parsed.data.operationKey,
  });
  if (error) return errored(locale, outcomeFor(error));

  const confirmation = deletionConfirmationSchema.safeParse(data);
  if (!confirmation.success) return errored(locale, "failed");

  return {
    status: "confirmed",
    outcome: null,
    message: null,
    preview: confirmation.data,
    undoId: null,
  };
}

/**
 * `2N-CORRECT-004`, `011`, `012` — the deletion itself.
 *
 * One RPC, one transaction. A `stale` outcome means the consequences moved
 * between the preview and this call, and the correct response is to show the
 * owner the new list rather than to delete against the old one.
 */
export async function applyDeletion(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const locale = resolveLocale(formData.get("locale"));
  const parsed = deletionRequestSchema.safeParse(fields(formData));
  if (!parsed.success) return errored(locale, "unavailable");

  const { supabase } = await requireUser(locale);
  const { data, error } = await supabase.rpc("apply_entity_deletion", {
    p_entity_type: parsed.data.entityType,
    p_entity_id: parsed.data.entityId,
    p_operation_key: parsed.data.operationKey,
  });
  if (error) return errored(locale, outcomeFor(error));

  const result = deletionResultSchema.safeParse(data);
  if (!result.success) return errored(locale, "failed");

  revalidateFor(locale, parsed.data.entityType, parsed.data.entityId);

  return {
    status: "deleted",
    outcome: "deleted",
    message: getDeletionCopy(locale).outcomes.deleted,
    preview: null,
    undoId: result.data.undoId,
  };
}

/**
 * `2N-CORRECT-005`, `007` — the undo, against a recorded id.
 *
 * It targets `undoId`, never a re-resolved name, and it runs through
 * `public.undo_operation` — the registry that already ships — rather than
 * through a second path of its own.
 */
export async function undoDeletion(
  _previous: DeletionState,
  formData: FormData,
): Promise<DeletionState> {
  const locale = resolveLocale(formData.get("locale"));
  const undoId = formData.get("undoId");
  const entityType = formData.get("entityType");
  const entityId = formData.get("entityId");
  if (typeof undoId !== "string" || undoId.length === 0) return errored(locale, "failed");

  const { supabase } = await requireUser(locale);
  const { data, error } = await supabase.rpc("undo_operation", { p_undo_id: undoId });
  if (error) return errored(locale, outcomeFor(error));

  const result = undoResultSchema.safeParse(data);
  if (!result.success) return errored(locale, "failed");

  if (typeof entityType === "string" && typeof entityId === "string") {
    const request = deletionRequestSchema.safeParse({
      entityType,
      entityId,
      operationKey: "undo-revalidate",
    });
    if (request.success) revalidateFor(locale, request.data.entityType, request.data.entityId);
  }

  return {
    status: "undone",
    outcome: "undone",
    message: getDeletionCopy(locale).outcomes.undone,
    preview: null,
    undoId: null,
  };
}
