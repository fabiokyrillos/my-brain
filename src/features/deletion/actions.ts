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

import type { PostgrestError } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale, type Locale } from "@/lib/preferences";

import type { DeletionOutcome } from "./contracts";
import { getDeletionCopy } from "./copy";
import {
  deletionConfirmationSchema,
  deletionPreviewSchema,
  deletionRequestSchema,
  deletionResultSchema,
  undoResultSchema,
} from "./schema";
import type { DeletionState } from "./state";

/**
 * The state type and the idle value live in `./state`, NOT here.
 *
 * A `"use server"` module may export async functions and nothing else. A
 * constant exported beside these four would pass typecheck and fail at the RSC
 * boundary — in a production build or on first render, which is the most
 * expensive place to learn it.
 */

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
 * NOTHING HERE CALLS `revalidatePath`, AND THAT IS THE FIX FOR A REAL DEFECT.
 *
 * The first version of this module revalidated the index and the detail route
 * from inside `applyDeletion`. The hosted journey then failed in a way no unit
 * test could have shown: after a successful deletion the status region was
 * still reading `confirmed` with no outcome, because the dialog had been
 * **destroyed and remounted**, taking the deletion result — and the undo
 * control — with it.
 *
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * revalidatePath.md` states it plainly: *"Server Functions: Updates the UI
 * immediately (if viewing the affected path)."* The affected path is the page
 * the dialog is on, so revalidating from the action is a instruction to throw
 * away the component that is about to offer the undo. **A deletion whose undo
 * button vanishes before it can be pressed is worse than one with no undo at
 * all**, because the product promised the undo in the preview.
 *
 * Cache correctness does not depend on this call. Every surface involved reads
 * Supabase through the request's cookies, so it renders dynamically and a
 * navigation always re-fetches. What `revalidatePath` would have bought is the
 * **client router cache**, and the client is the right place to clear that — at
 * the moment the dialog closes, which `delete-entity-control.tsx` does with
 * `router.refresh()` and, when the subject is gone, a navigation away from a
 * route that no longer has a subject.
 */

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
  if (typeof undoId !== "string" || undoId.length === 0) return errored(locale, "failed");

  const { supabase } = await requireUser(locale);
  const { data, error } = await supabase.rpc("undo_operation", { p_undo_id: undoId });
  if (error) return errored(locale, outcomeFor(error));

  const result = undoResultSchema.safeParse(data);
  if (!result.success) return errored(locale, "failed");

  // No revalidation here either, and for the mirror of the reason above: the
  // owner has just been told the restore succeeded, and refreshing the route
  // out from under that sentence would replace it with a page that says
  // nothing at all about what just happened.
  return {
    status: "undone",
    outcome: "undone",
    message: getDeletionCopy(locale).outcomes.undone,
    preview: null,
    undoId: null,
  };
}
