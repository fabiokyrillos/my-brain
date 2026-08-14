import "server-only";

/**
 * The read half of `2N-CONFLICT-002` — derivation at read time, from data that
 * already exists.
 *
 * ## What this reads, and what it deliberately does not
 *
 * Four columns of the owner's own `memories`: `id`, `content`, `sensitivity`,
 * and the two halves of the validity window. **No RPC**, because none exists for
 * this and creating one is a migration; **no join**, because the rule needs
 * nothing else; **no embedding**, **no provider**, **no `now()`**.
 *
 * ## Owner scope is the read's, not a predicate this file could forget
 *
 * `public.memories` carries forced RLS with four own-row policies
 * (`202607160006:69-79`), and this runs as `authenticated`. A row belonging to
 * someone else is not filtered here — it never arrives. The explicit `user_id`
 * predicate is still written, on the posture `memories/actions.ts` established:
 * RLS is the trust boundary, the predicate is the belt to its braces.
 *
 * ## Why it is bounded, and why the bound is honest
 *
 * `2N-KNOWS-008`. The read is capped, and a page that hit the cap says so rather
 * than silently implying it found everything. A conflict list that quietly
 * truncates is worse than a long one: the owner would be told their memories are
 * consistent when the check simply stopped looking.
 */

import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";

import { boundedList, withProbe, type Bounded } from "@/features/bounds/contracts";

import type { ConflictAttentionItemView } from "./contracts";
import { detectMemoryValidityConflicts, type MemoryConflictSource } from "./conflict-detection";
import type { DailyCycleLocale } from "./copy";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The scan bound.
 *
 * Larger than `ATTENTION_PAGE_SIZE` because this is a **scan for a rare fault**
 * rather than a page of expected work: almost every row read here will not be a
 * conflict, so a bound sized for the output would starve the input. Still finite,
 * and the truncation is reported.
 */
export const CONFLICT_SCAN_LIMIT = 200;

/**
 * The queue shows at most this many conflicts at once.
 *
 * A separate, smaller number from the scan: the surface's job is to say *there
 * is a contradiction here*, not to be a report. `bounded` carries the fact that
 * more were found.
 */
export const CONFLICT_PAGE_SIZE = 20;

export async function loadMemoryConflicts(
  supabase: SupabaseClient,
  { locale, userId }: { locale: DailyCycleLocale; userId: string },
): Promise<Bounded<ConflictAttentionItemView>> {
  const result = await supabase
    .from("memories")
    .select("id,content,sensitivity,valid_from,valid_until")
    .eq("user_id", userId)
    // Both halves must be present for the window to be inverted, so rows with a
    // null on either side cannot be conflicts and are excluded in SQL. This is
    // the same predicate the detector applies, pushed down so the bound is spent
    // on rows that could actually match — not a second, looser rule.
    .not("valid_from", "is", null)
    .not("valid_until", "is", null)
    .order("updated_at", { ascending: false })
    .limit(withProbe(CONFLICT_SCAN_LIMIT));

  const rows = requireSupabaseData(result, "load memories for conflict derivation") ?? [];
  // The probe row is counted, never scanned: including it would let one row past
  // the bound this exists to enforce.
  const scanTruncated = rows.length > CONFLICT_SCAN_LIMIT;
  const scanned = scanTruncated ? rows.slice(0, CONFLICT_SCAN_LIMIT) : rows;

  const sources: MemoryConflictSource[] = scanned.map((row) => ({
    memoryId: row.id,
    content: row.content,
    sensitivity: row.sensitivity,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  }));

  const items: ConflictAttentionItemView[] = detectMemoryValidityConflicts(sources).map((conflict) => Object.freeze({
    key: conflict.key,
    reason: "resolve_validity_conflict" as const,
    memoryId: conflict.memoryId,
    content: conflict.content,
    sensitivity: conflict.sensitivity,
    validFrom: conflict.validFrom,
    validUntil: conflict.validUntil,
    // The locale prefix is applied here and only here — the detector is pure and
    // knows nothing about routing.
    action: Object.freeze({ id: conflict.action.id, href: `/${locale}${conflict.action.href}` }),
  }));

  // Truncation is reported when **either** bound bit: the scan stopped early, or
  // more conflicts were found than the queue shows. Both mean the same thing to
  // the owner — there may be more — and passing `scanTruncated` upstream is what
  // keeps the first one from going unreported when the second did not fire.
  return boundedList(items, CONFLICT_PAGE_SIZE, scanTruncated);
}
