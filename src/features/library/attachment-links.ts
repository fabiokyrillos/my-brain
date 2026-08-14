import "server-only";

import { boundedList, withProbe } from "@/features/bounds/contracts";
import type { createClient } from "@/lib/supabase/server";

import {
  ATTACHMENT_LINK_LIMIT,
  PAGE_LINK_LIMIT,
  toLinkOutcome,
  type AttachmentLink,
  type LinkOutcome,
  type LinkRow,
  type ReverseLinkedEntityType,
} from "./link-contracts";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * `2N-FILES-003`/`-009`, `2N-PERSON-008` — `entity_attachments` gains its
 * **first reader**, and gains no writer.
 *
 * Everything that decides something lives in `link-contracts.ts`; this file is
 * the two queries and nothing else. There is deliberately no `linkAttachment`
 * here — see that module's header on why the absence of a write path is the
 * mechanism rather than a convention.
 *
 * ## Ownership
 *
 * Row-level security scopes every query to the caller through the authenticated
 * client. Neither loader takes a `user_id`, neither accepts an owner id, and
 * there is no service-role path (`2N-SEC-002`). No redundant `user_id` predicate
 * is added, for the reason `contexts.ts` records: a leak here would be an RLS
 * failure, and a redundant predicate would hide it rather than prevent it.
 */

const LINK_COLUMNS = "attachment_id,entity_type,entity_id";

/**
 * The links for one page of files — the file → subject direction.
 *
 * Bounded at `PAGE_LINK_LIMIT` with a probe row, so "there are more" is measured
 * rather than guessed.
 */
export async function loadLinksForAttachments(
  supabase: SupabaseClient,
  attachmentIds: readonly string[],
): Promise<LinkOutcome<AttachmentLink>> {
  if (attachmentIds.length === 0) {
    return { status: "ok", list: boundedList([], PAGE_LINK_LIMIT) };
  }
  const { data, error } = await supabase
    .from("entity_attachments")
    .select(LINK_COLUMNS)
    .in("attachment_id", attachmentIds as string[])
    // Ordered so the probe row is the last one by a stable key rather than by
    // whatever the planner returned — an unordered limit makes "the row we did
    // not show" a different row on every request.
    .order("attachment_id", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(withProbe(PAGE_LINK_LIMIT));

  return toLinkOutcome(data as LinkRow[] | null, error, PAGE_LINK_LIMIT);
}

/**
 * The files linked to one person or project — `2N-FILES-009`'s reverse
 * direction and `2N-PERSON-008`.
 *
 * One subject, so the bound is the per-subject one and needs no grouping.
 */
export async function loadLinksForEntity(
  supabase: SupabaseClient,
  entityType: ReverseLinkedEntityType,
  entityId: string,
): Promise<LinkOutcome<AttachmentLink>> {
  const { data, error } = await supabase
    .from("entity_attachments")
    .select(LINK_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(withProbe(ATTACHMENT_LINK_LIMIT));

  return toLinkOutcome(data as LinkRow[] | null, error, ATTACHMENT_LINK_LIMIT);
}
