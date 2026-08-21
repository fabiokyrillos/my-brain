import "server-only";

/**
 * `2K-PRIVACY-004`, `2K-SRC-004` — the render-time re-read.
 *
 * ## What this replaces
 *
 * The thread used to render a stored 220-character excerpt. That copy could not
 * be kept in step with the row it quoted: reclassify the entry, archive the
 * memory, edit its text, and the excerpt was unchanged and still in the clear.
 * OD-2K-2 removed the copy, so the source has to be **read again, now**.
 *
 * ## Why the classification cannot go stale
 *
 * Because it is never stored. Every render asks the row for its current
 * `sensitivity` and hands it to the central contract through
 * `readOnlyPreviewCard`, which fails **closed** on an unreadable value. A source
 * reclassified after the answer was written is therefore masked on the next
 * view **by construction** — there is no second copy that could disagree.
 *
 * ## Bounded, and batched
 *
 * One query per source **table**, never one per source. The thread renders at
 * most 200 messages and a message carries at most 20 references, so an
 * unbatched implementation would be a fan-out the plan names as its stopping
 * condition. The fix for latency is more batching; it is never falling back to
 * the stored copy, which no longer exists.
 *
 * ## Lifecycle is part of readability
 *
 * An archived memory renders **unavailable**, not in the clear. Since Phase 2N
 * slice 2N.3 (`202608130093`, migration M1) `match_internal_knowledge` refuses
 * to *retrieve* one at all, applying the validity window ahead of its own
 * bound; this module shares `isMemoryInForce` with that SQL predicate and with
 * the badge the owner reads, so none of the three can disagree about what "in
 * force" means.
 *
 * This check is **not** redundant with that one, and it is the reason the two
 * are separate concerns rather than one. Retrieval decides what may be used to
 * answer a NEW question. This decides what a message ALREADY ANSWERED may still
 * show — and a memory archived after that answer was written was legitimately
 * retrieved at the time. Only a render-time read can catch it.
 */

import { isMemoryInForce } from "@/features/memories/lifecycle";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/preferences";

import { readOnlyPreviewCard, unavailableCard, type ConversationCard } from "@/features/conversation-cards/contracts";

import type { ParsedCitations, PersistedSourceReference, SupportKind } from "./contracts";

export type ResolvedSource = {
  readonly key: string;
  readonly support: SupportKind;
  /** Already carrying the current classification; the renderer only draws it. */
  readonly card: ConversationCard;
  /**
   * `2K-SRC-004` — when the evidence is from.
   *
   * `occurred_at` for an entry, `valid_from ?? created_at` for a memory —
   * exactly what `match_internal_knowledge` reports, so the freshness the user
   * reads is the freshness retrieval ranked on. `null` when the row does not
   * carry one, and **absent rather than fabricated**: a made-up date on a
   * source is the preview's first lie in a different costume.
   */
  readonly occurredAt: string | null;
};

function entryHref(locale: Locale, id: string) {
  return `/${locale}/app/inbox/${id}`;
}

function memoryHref(locale: Locale, id: string) {
  return `/${locale}/app/memories/${id}`;
}

/**
 * Resolves every reference on one message.
 *
 * Order is preserved: the answer cited them in an order, and re-sorting by
 * whatever the database returned would quietly change what the user reads.
 */
export async function resolveSources(
  supabase: SupabaseClient<Database>,
  userId: string,
  citations: ParsedCitations,
  locale: Locale,
  now: Date = new Date(),
): Promise<readonly ResolvedSource[]> {
  const references = citations.sources;
  if (references.length === 0) return [];

  const entryIds = references.filter((r) => r.type === "entry").map((r) => r.sourceId);
  const memoryIds = references.filter((r) => r.type === "memory").map((r) => r.sourceId);

  const [entries, memories] = await Promise.all([
    entryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("entries")
        .select("id,original_content,sensitivity,occurred_at")
        .eq("user_id", userId)
        .in("id", entryIds),
    memoryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("memories")
        .select("id,content,sensitivity,valid_from,valid_until,created_at")
        .eq("user_id", userId)
        .in("id", memoryIds),
  ]);

  type EntryRow = { id: string; original_content: string; sensitivity: string | null; occurred_at: string | null };
  type MemoryRow = {
    id: string;
    content: string;
    sensitivity: string | null;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string | null;
  };

  // A failed read is **not** an empty read. Both produce `unavailable`, which is
  // the honest outcome: the surface cannot say anything about a row it could
  // not look at, and it must not distinguish "gone" from "unreadable".
  const entryById = new Map<string, EntryRow>(
    entries.error ? [] : ((entries.data ?? []) as EntryRow[]).map((row) => [row.id, row]),
  );
  const memoryById = new Map<string, MemoryRow>(
    memories.error ? [] : ((memories.data ?? []) as MemoryRow[]).map((row) => [row.id, row]),
  );

  return references.map((reference) => resolveOne(reference, locale, now, entryById, memoryById));
}

function resolveOne(
  reference: PersistedSourceReference,
  locale: Locale,
  now: Date,
  entryById: Map<string, { id: string; original_content: string; sensitivity: string | null; occurred_at: string | null }>,
  memoryById: Map<string, {
    id: string;
    content: string;
    sensitivity: string | null;
    valid_from: string | null;
    valid_until: string | null;
    created_at: string | null;
  }>,
): ResolvedSource {
  const base = { key: reference.id, support: reference.support };

  if (reference.type === "entry") {
    const row = entryById.get(reference.sourceId);
    if (!row) return { ...base, card: unavailableCard("entry"), occurredAt: null };
    return {
      ...base,
      card: readOnlyPreviewCard({
        cardType: "entry",
        objectId: row.id,
        snippet: row.original_content,
        sensitivity: row.sensitivity,
        href: entryHref(locale, row.id),
      }),
      occurredAt: row.occurred_at,
    };
  }

  /*
   * `OD-2Q-1` widened the vocabulary to `entry | memory | task`, and this branch
   * is what stops that widening from breaking this resolver **silently**.
   *
   * Before Phase 2Q the code below was reached by anything that was not an
   * entry, so a `task` reference would have been looked up in `memories`,
   * missed, and returned as `unavailable` — the exact defect
   * `2Q-FOUNDATION-003` records, moved one level up rather than fixed.
   *
   * **A task is refused here rather than resolved, and that is the correct
   * outcome, not a gap.** This module is chat's, and chat does not retrieve
   * tasks (`OD-2Q-2`, signed option A), so no chat envelope can contain one.
   * A review's envelope can — and a review must **not** be resolved through
   * this path: `readOnlyPreviewCard` requires a `snippet` and a `sensitivity`,
   * which for a task would mean putting its title on the surface and deriving
   * its classification from `source_entry_id`. `OD-2Q-5` is signed as **option
   * C**: the sources area shows no content at all, and ADR-127 Decision 5.1
   * records that a source list carrying no governed content never resolves a
   * classification in the first place. The review page therefore has its own
   * content-free resolver.
   *
   * So this returns the same `unavailable` shape a deleted or foreign record
   * gets — refusing, never inventing — and the type system makes the branch
   * unmissable rather than implicit.
   */
  if (reference.type === "task") {
    return { ...base, card: unavailableCard("task"), occurredAt: null };
  }

  const row = memoryById.get(reference.sourceId);
  if (!row) return { ...base, card: unavailableCard("memory"), occurredAt: null };
  // An archived memory is unreadable *as a source*, and says so with the same
  // shape a deleted one uses. Anything else would let a memory the owner
  // withdrew keep appearing under an answer that used it.
  if (!isMemoryInForce({ valid_from: row.valid_from, valid_until: row.valid_until }, now)) {
    return { ...base, card: unavailableCard("memory"), occurredAt: null };
  }
  return {
    ...base,
    card: readOnlyPreviewCard({
      cardType: "memory",
      objectId: row.id,
      snippet: row.content,
      sensitivity: row.sensitivity,
      href: memoryHref(locale, row.id),
    }),
    occurredAt: row.valid_from ?? row.created_at,
  };
}
