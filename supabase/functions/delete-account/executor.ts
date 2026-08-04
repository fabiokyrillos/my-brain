/**
 * The account-deletion state machine (ADR-074, SH-DELETE-005..008).
 *
 * ## Why this lives outside `src/`
 *
 * Deletion needs a capability no `authenticated` role holds, and the
 * repository forbids a service-role client in `src/` (two guards pin
 * `deleteUser`'s absence there). So the capability lives in this Edge
 * Function, and the guards stay green because this file is not in their scan
 * scope. The HTTP entrypoint is `index.ts`; everything below is importable by
 * the test suite, which runs with no `--allow-*` flags — `Deno.serve` binds a
 * port at module scope, so keeping the machine out of the entrypoint is what
 * lets every branch be executed under that restriction.
 *
 * ## Resumable, and stopping rather than forcing
 *
 * The steps are ordered so that a crash between any two is re-runnable:
 *
 *   1. verify the caller's lifecycle is `deleting` (set by the user's own
 *      request through `request_account_deletion`);
 *   2. census the owned rows, for the log's per-table counts;
 *   3. enumerate and delete storage objects under exactly `<uid>/`;
 *   4. verify zero objects remain under that prefix;
 *   5. delete the `auth.users` row (the cascade the SH.0 drill proved);
 *   6. verify zero owned rows remain;
 *   7. record the de-identified log row.
 *
 * Re-running after a crash repeats a completed step harmlessly (removing an
 * already-empty prefix issues no call; the `auth.users` delete of an absent
 * user is recognised as already-gone) and never skips a verification. On
 * anything it cannot classify — an unscannable table, an object under the
 * prefix that a *different* owner's live attachment references — it **stops**:
 * the account stays `deleting` (so writes remain blocked by SH.1's
 * predicates), the reason is recorded from a closed vocabulary, and nothing
 * destructive is retried.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "user-files";
/** Storage list pages; the loop below drains until a page comes back short. */
const PAGE_SIZE = 100;
/** A bound on the drain, so a pathological prefix cannot spin forever. */
const MAX_PAGES = 200;

export type StopReason =
  | "unknown_owned_table"
  | "unclassifiable_storage_object"
  | "cross_owner_reference"
  | "storage_residue_remains"
  | "credential_not_erased"
  | "auth_delete_failed"
  | "lifecycle_not_deleting";

export type DeletionOutcome =
  | { outcome: "completed"; objectsRemoved: number; bytesRemoved: number; rowCounts: Record<string, number> }
  | { outcome: "stopped"; stopReason: StopReason; objectsRemoved: number; bytesRemoved: number; rowCounts: Record<string, number> };

type StorageObject = { name: string; metadata: { size?: number } | null };

/**
 * Lists every object under exactly `<userId>/`.
 *
 * The prefix is the whole classification (SH-DELETE-006): keys are
 * `<uid>/<uuid>-<name>` by construction, so ownership is structural, not a
 * name heuristic — the `codex.cost` misclassification is why this may never
 * match on the file's own name.
 */
export async function listOwnedObjects(
  service: SupabaseClient,
  userId: string,
): Promise<{ paths: string[]; bytes: number } | { error: "list_failed" }> {
  const paths: string[] = [];
  let bytes = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await service.storage
      .from(BUCKET)
      .list(userId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (error) return { error: "list_failed" };

    const entries = (data ?? []) as StorageObject[];
    for (const entry of entries) {
      paths.push(`${userId}/${entry.name}`);
      bytes += entry.metadata?.size ?? 0;
    }
    if (entries.length < PAGE_SIZE) break;
  }

  return { paths, bytes };
}

/**
 * SH-DELETE-006's refusal: an object under this owner's prefix that a *live
 * attachment row of a different owner* references.
 *
 * It should be impossible — `storage_path` is written as `<own uid>/…` — which
 * is exactly why it is checked rather than assumed: if it ever happens, the
 * deletion would destroy another account's file, and stopping is the only safe
 * answer.
 */
export async function findCrossOwnerReference(
  service: SupabaseClient,
  userId: string,
  paths: string[],
): Promise<{ found: boolean } | { error: "check_failed" }> {
  if (paths.length === 0) return { found: false };

  const { data, error } = await service
    .from("attachments")
    .select("storage_path,user_id")
    .in("storage_path", paths)
    .neq("user_id", userId);
  if (error) return { error: "check_failed" };

  return { found: (data ?? []).length > 0 };
}

/**
 * The state machine. Pure of HTTP so the Deno tests drive it directly.
 */
export async function executeDeletion(
  service: SupabaseClient,
  userId: string,
  requestedAt: string,
  requesterSessionHash: string | null,
): Promise<DeletionOutcome> {
  const stop = async (
    stopReason: StopReason,
    objectsRemoved: number,
    bytesRemoved: number,
    rowCounts: Record<string, number>,
    storageStartedAt: string | null,
    storageCompletedAt: string | null,
  ): Promise<DeletionOutcome> => {
    await service.rpc("record_account_deletion", {
      p_requested_at: requestedAt,
      p_storage_started_at: storageStartedAt,
      p_storage_completed_at: storageCompletedAt,
      p_account_deleted_at: null,
      p_outcome: "stopped",
      p_stop_reason: stopReason,
      p_storage_objects_removed: objectsRemoved,
      p_storage_bytes_removed: bytesRemoved,
      p_table_row_counts: rowCounts,
      p_requester_session_hash: requesterSessionHash,
    });
    return { outcome: "stopped", stopReason, objectsRemoved, bytesRemoved, rowCounts };
  };

  // Step 1 — the lifecycle gate. The user's own request set this; an account
  // that is not `deleting` has not asked, and this function will not decide
  // for them.
  const lifecycle = await service
    .from("account_lifecycle")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (lifecycle.error || lifecycle.data?.status !== "deleting") {
    return await stop("lifecycle_not_deleting", 0, 0, {}, null, null);
  }

  // Step 2 — the census, from the catalog at run time. A table it could not
  // scan comes back as -1 and is unknown residue: stop.
  const census = await service.rpc("account_owned_row_counts", { p_user_id: userId });
  if (census.error) {
    return await stop("unknown_owned_table", 0, 0, {}, null, null);
  }
  const rowCounts = (census.data ?? {}) as Record<string, number>;
  if (Object.values(rowCounts).some((count) => count < 0)) {
    return await stop("unknown_owned_table", 0, 0, rowCounts, null, null);
  }

  // Step 3 — storage, by exact prefix.
  const storageStartedAt = new Date().toISOString();
  const listed = await listOwnedObjects(service, userId);
  if ("error" in listed) {
    return await stop("unclassifiable_storage_object", 0, 0, rowCounts, storageStartedAt, null);
  }

  const crossOwner = await findCrossOwnerReference(service, userId, listed.paths);
  if ("error" in crossOwner) {
    return await stop("unclassifiable_storage_object", 0, 0, rowCounts, storageStartedAt, null);
  }
  if (crossOwner.found) {
    // Nothing has been deleted at this point, and nothing will be.
    return await stop("cross_owner_reference", 0, 0, rowCounts, storageStartedAt, null);
  }

  let objectsRemoved = 0;
  if (listed.paths.length > 0) {
    const removal = await service.storage.from(BUCKET).remove(listed.paths);
    if (removal.error) {
      return await stop("storage_residue_remains", 0, 0, rowCounts, storageStartedAt, null);
    }
    objectsRemoved = listed.paths.length;
  }

  // Step 4 — verify the prefix is empty. A removal that reported success while
  // leaving bytes is exactly the residue this initiative exists to disprove.
  const remaining = await listOwnedObjects(service, userId);
  if ("error" in remaining || remaining.paths.length > 0) {
    return await stop(
      "storage_residue_remains",
      objectsRemoved,
      listed.bytes,
      rowCounts,
      storageStartedAt,
      null,
    );
  }
  const storageCompletedAt = new Date().toISOString();

  // Step 5 — the credential, verified erased rather than read. `removed` rows
  // carry no ciphertext by CHECK; an `active` row still holding material is a
  // stop, because the cascade in step 6 is what erases it and a stop here
  // means something is wrong before that point.
  const credential = await service
    .from("user_ai_credentials")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (credential.error) {
    return await stop(
      "credential_not_erased",
      objectsRemoved,
      listed.bytes,
      rowCounts,
      storageStartedAt,
      storageCompletedAt,
    );
  }

  // Step 6 — the account itself. The cascade the SH.0 drill proved does the
  // rest of the rows.
  const deleted = await service.auth.admin.deleteUser(userId);
  if (deleted.error) {
    const stillThere = await service
      .from("account_lifecycle")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    // A re-run after a crash that already deleted the user finds nothing and
    // proceeds; a genuine failure leaves the row and stops.
    if (stillThere.data) {
      return await stop(
        "auth_delete_failed",
        objectsRemoved,
        listed.bytes,
        rowCounts,
        storageStartedAt,
        storageCompletedAt,
      );
    }
  }
  const accountDeletedAt = new Date().toISOString();

  // Step 7 — zero residue, asserted rather than assumed.
  const after = await service.rpc("account_owned_row_counts", { p_user_id: userId });
  if (after.error || Object.keys((after.data ?? {}) as Record<string, number>).length > 0) {
    return await stop(
      "unknown_owned_table",
      objectsRemoved,
      listed.bytes,
      rowCounts,
      storageStartedAt,
      storageCompletedAt,
    );
  }

  await service.rpc("record_account_deletion", {
    p_requested_at: requestedAt,
    p_storage_started_at: storageStartedAt,
    p_storage_completed_at: storageCompletedAt,
    p_account_deleted_at: accountDeletedAt,
    p_outcome: "completed",
    p_stop_reason: null,
    p_storage_objects_removed: objectsRemoved,
    p_storage_bytes_removed: listed.bytes,
    p_table_row_counts: rowCounts,
    p_requester_session_hash: requesterSessionHash,
  });

  return { outcome: "completed", objectsRemoved, bytesRemoved: listed.bytes, rowCounts };
}
