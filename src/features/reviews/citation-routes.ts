import type { CitedSourceType } from "@/features/conversation-sources/contracts";
import type { Locale } from "@/lib/preferences";

/**
 * The canonical route for each citable record type — **one map, two consumers.**
 *
 * ## Why this is a module and not two literals
 *
 * `authorizeHref` uses it to decide whether an href a *model* wrote may become an
 * anchor, and the sources area uses it to *build* an href the product writes.
 * Those two must agree exactly. If they were written separately, the day a route
 * moved, one of them would keep admitting the old path or keep drawing a link to
 * it — and the failure would be a broken link the owner clicks, which is the
 * failure class this phase exists to remove.
 *
 * ## The surface segment IS the type claim
 *
 * `2Q-LINK-002`. Before this phase the link gate keyed on the **uuid alone** and
 * `INTERNAL_ROUTE`'s surface segment was `[a-z-]+` — any surface at all. An
 * envelope vouching for entry `X` therefore also authorized
 * `/pt-BR/app/work/X`, `/pt-BR/app/people/X` and `/pt-BR/app/projects/X`.
 * `2Q-FOUNDATION-004` executed that on five surfaces at once.
 *
 * Reading the surface back to a type is what closes it: an href is admitted only
 * when the **pair** `(type, id)` was vouched for. A surface that maps to no
 * citable type — `people`, `projects`, anything new — can never be admitted,
 * which is deliberately stricter than "refuse the mismatch".
 */
export const CITED_ROUTE_SEGMENT: Readonly<Record<CitedSourceType, string>> = {
  entry: "inbox",
  memory: "memories",
  task: "work",
};

/** The reverse map, built from the forward one so the two cannot disagree. */
const TYPE_BY_SEGMENT: ReadonlyMap<string, CitedSourceType> = new Map(
  Object.entries(CITED_ROUTE_SEGMENT).map(([type, segment]) => [segment, type as CitedSourceType]),
);

/** The citable type a surface segment claims, or `null` if it claims none. */
export function citedTypeForSegment(segment: string): CitedSourceType | null {
  return TYPE_BY_SEGMENT.get(segment) ?? null;
}

/**
 * The canonical, owner-scoped route to one cited record.
 *
 * Lowercased ids, because `authorizeHref` compares lowercased and a link the
 * product draws must be admissible by the same gate that judges the model's.
 */
export function citedHref(locale: Locale, type: CitedSourceType, id: string): string {
  return `/${locale}/app/${CITED_ROUTE_SEGMENT[type]}/${id.toLowerCase()}`;
}

/**
 * The allow-set key. **A pair, never an id.**
 *
 * Exported so every caller builds the key the same way; a caller that
 * concatenated its own would be a second mechanism to keep in agreement.
 */
export function vouchedKey(type: CitedSourceType, id: string): string {
  return `${type}:${id.toLowerCase()}`;
}
