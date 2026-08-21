import "server-only";

/**
 * `2Q-LINK-006/008`, `2Q-TRUST-001` — a review's sources, **identified and
 * linked, carrying no content at all.**
 *
 * ## Why this is not `conversation-sources/resolve-sources.ts`
 *
 * That module is chat's, and it builds every resolved source through
 * `readOnlyPreviewCard`, which **requires** a `snippet` and a `sensitivity`. For
 * a cited task those two are the task's **title** and a classification derived
 * from `source_entry_id` — exactly the two things `OD-2Q-5`, signed as **option
 * C**, removes from this surface.
 *
 * ADR-127 Decision 5.1 states the consequence in the owner's own terms: *"a
 * source list carrying no governed content never calls `resolveContent` at
 * all."* `sensitivity-convergence.test.ts` has asserted since ADR-124 that no
 * reviews surface may contain `resolveContent(` or the literal
 * `highly_sensitive`, and that guard stays **unweakened, with its file list
 * unchanged**. Reusing chat's resolver here would have made that impossible.
 *
 * So this module exists, and its shape is the control: **there is nowhere in
 * `ReviewSourceRow` to put a title, an excerpt or a snippet.** Not a convention
 * — a type.
 *
 * ## The stored envelope is a claim, never a proof
 *
 * `2Q-TRUST-001`. Every citation is re-read **now**, under the reader's own
 * session, scoped by `user_id`. A row that has since been deleted, or that never
 * belonged to this account, simply does not come back. Persistence records what
 * was cited; it is not evidence the record still exists.
 *
 * ## Removed, unreadable and foreign are ONE outcome
 *
 * A failed read is not an empty read, and the surface must not be usable as a
 * probe for whether another account's id is real. Both produce the identical
 * `available: false` row — same shape, same words, no href. Slice 2Q.3 asserts
 * that as an **equality** between the three cases rather than as three
 * separately passing expectations, which is how this class of defect survives.
 *
 * ## The row does not vary with the classification
 *
 * `2Q-TRUST-006`. A list that identified ordinary records and withheld
 * identification for sensitive ones would disclose the classification **by its
 * shape** — a leak created by the protection rather than by the exposure. The
 * row carries a kind, a date and an href, and it carries them the same way for
 * every citation. It never reads a `sensitivity` column, so there is nothing for
 * it to vary on.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseCitations,
  type CitedSourceType,
  type ParsedCitations,
} from "@/features/conversation-sources/contracts";
import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/preferences";

import { citedHref, vouchedKey } from "./citation-routes";

/**
 * One row of the sources area.
 *
 * **Deliberately has no `title`, `snippet`, `excerpt`, `preview` or
 * `sensitivity` field.** `2Q-LINK-008` asks that the shape have nowhere to put
 * content, and this is that shape. Adding one would be a visible type change
 * rather than a quiet render, which is the point.
 */
export type ReviewSourceRow = {
  /** The envelope's own reference id, so React keys are stable and unforged. */
  readonly key: string;
  readonly type: CitedSourceType;
  /**
   * `true` when the record was re-read successfully under the reader's session.
   * `false` covers removed, unreadable **and** foreign, indistinguishably.
   */
  readonly available: boolean;
  /**
   * The canonical route, or `null` when the record did not come back.
   *
   * Never a link to a record that is gone: a broken link the owner clicks is
   * the failure this phase exists to remove.
   */
  readonly href: string | null;
  /**
   * When the record is from — `occurred_at` for an entry, `updated_at` for a
   * task, `valid_from ?? created_at` for a memory. `null` rather than fabricated
   * when the row does not carry one, and always `null` when unavailable, because
   * a date read from a record the reader cannot see would be a disclosure.
   */
  readonly occurredAt: string | null;
};

export type ReviewSources = {
  readonly rows: readonly ReviewSourceRow[];
  /**
   * `2Q-CITE-008` / `2Q-LINK-007`. `true` when the stored envelope predates the
   * producer — nobody recorded whether the Brain found anything, which is the
   * only honest thing that can be said about a review written before this phase.
   *
   * Distinct from `rows.length === 0`: a **new** review that cited nothing is a
   * different fact from an **old** one nobody recorded, and the page says the
   * true one.
   */
  readonly unrecorded: boolean;
};

/** The `(type, id)` pairs a resolved source set vouches for. */
export function vouchedFrom(sources: ReviewSources): ReadonlySet<string> {
  return new Set(
    sources.rows
      .filter((row) => row.available && row.href !== null)
      .map((row) => vouchedKey(row.type, idFromHref(row.href as string))),
  );
}

/** The id a canonical href ends with. The href is built here, so this is total. */
function idFromHref(href: string): string {
  return href.slice(href.lastIndexOf("/") + 1);
}

/**
 * Re-reads every citation on one review, under the reader's own session.
 *
 * One query per **table**, never one per source: an envelope holds at most 20
 * references, and a per-source fan-out is the shape this repository names as a
 * stopping condition.
 */
export async function resolveReviewSources(
  supabase: SupabaseClient<Database>,
  userId: string,
  rawCitations: unknown,
  locale: Locale,
): Promise<ReviewSources> {
  const citations: ParsedCitations = parseCitations(rawCitations);
  /*
   * A malformed envelope is refused **as a whole** by `parseCitations`, which
   * returns the `unknown` state with no sources — `2Q-TRUST-008`. One corrupt
   * reference among four does not leave three half-trusted rows on the page.
   */
  if (citations.sources.length === 0) {
    return { rows: [], unrecorded: citations.evidence === "unknown" };
  }

  const idsOf = (type: CitedSourceType) =>
    citations.sources.filter((source) => source.type === type).map((source) => source.sourceId);

  const entryIds = idsOf("entry");
  const memoryIds = idsOf("memory");
  const taskIds = idsOf("task");

  const [entries, memories, tasks] = await Promise.all([
    entryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("entries").select("id,occurred_at").eq("user_id", userId).in("id", entryIds),
    memoryIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
        .from("memories")
        .select("id,valid_from,valid_until,created_at")
        .eq("user_id", userId)
        .in("id", memoryIds),
    taskIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("tasks").select("id,updated_at").eq("user_id", userId).in("id", taskIds),
  ]);

  /*
   * **A failed read is not an empty read**, and both must produce the same
   * output. Building the lookup empty on error is what makes "gone" and
   * "unreadable" indistinguishable — stated here at the call site, as
   * `resolve-sources.ts` states it, because the reason is easy to lose and the
   * consequence is a page that can be used as a probe.
   *
   * Note what is NOT selected: no `original_content`, no `title`, no
   * `sensitivity`. The queries cannot return content, so no later edit can
   * render it by accident.
   */
  const dateById = new Map<string, string | null>();
  const seen = new Set<string>();
  const absorb = (
    type: CitedSourceType,
    result: { data: unknown[] | null; error: unknown },
    dateOf: (row: Record<string, unknown>) => string | null,
  ) => {
    if (result.error) return;
    for (const raw of (result.data ?? []) as Record<string, unknown>[]) {
      const id = String(raw.id);
      seen.add(vouchedKey(type, id));
      dateById.set(vouchedKey(type, id), dateOf(raw));
    }
  };

  absorb("entry", entries, (row) => (row.occurred_at as string | null) ?? null);
  absorb("memory", memories, (row) => ((row.valid_from ?? row.created_at) as string | null) ?? null);
  absorb("task", tasks, (row) => (row.updated_at as string | null) ?? null);

  const rows = citations.sources.map((source): ReviewSourceRow => {
    const key = vouchedKey(source.type, source.sourceId);
    const available = seen.has(key);
    return {
      key: source.id,
      type: source.type,
      available,
      href: available ? citedHref(locale, source.type, source.sourceId) : null,
      occurredAt: available ? dateById.get(key) ?? null : null,
    };
  });

  return { rows, unrecorded: citations.evidence === "unknown" };
}
