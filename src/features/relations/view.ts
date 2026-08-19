/**
 * How `/app/relations` is being looked at — the drawing or the text
 * (`2P-RELATION-001` … `-004`).
 *
 * ## Why the view is a URL parameter and not component state
 *
 * `2P-RELATION-002` requires the text tab to be **independently usable**, and
 * `2N-ACCESS-004` refuses a gesture as the only path to anything. A pair of
 * server-rendered links carrying `?view=` satisfies both without a keyboard
 * handler: each tab has its own address, both are reachable with JavaScript off,
 * back and forward behave, and the destination is a full server render rather
 * than a branch inside a client component that a reader can end up unable to
 * leave.
 *
 * It also keeps the ordering honest in the direction `2N-RELATION-007` set. The
 * drawing is what opens (`2P-RELATION-001`), and it is still a strict subset of
 * what the list holds — the projection is built once and both presentations read
 * it, so the drawing cannot acquire exclusive information without somebody
 * deliberately giving it some.
 *
 * ## Focus is a filter over the projection, never a second query
 *
 * `2P-RELATION-003` asks the drawing to support focusing a person. Focusing
 * narrows the *same* projection to the edges that touch one node, so the focused
 * view can only ever show a subset of the unfocused one. It cannot reveal a
 * relation the full view was withholding, and it cannot invent one — which is
 * the property that keeps focus from becoming a second, quieter query with its
 * own rules.
 *
 * **No write happens anywhere in this module.** `2P-RELATION-003` forbids adding
 * inferred facts and the plan's stop conditions forbid persisting a relation to
 * improve a drawing; there is nothing here that could.
 */

import { boundedList, type Bounded } from "@/features/bounds/contracts";

import type { RelationEdge, RelationNode } from "./contracts";
import type { RelationProjection } from "./projection";

/** The two tabs, in the order they are offered. The first one is the default. */
export const RELATION_VIEWS = ["diagram", "links"] as const;
export type RelationView = (typeof RELATION_VIEWS)[number];

/**
 * The view a request asks for, defaulting to the drawing.
 *
 * `2P-RELATION-001` — an absent, repeated or unrecognised parameter opens on the
 * drawing rather than refusing, because a bad query string must not be able to
 * make the page unusable. A repeated parameter arrives as an array from
 * `searchParams` and is deliberately **not** resolved by taking the first
 * element: two different answers to one question is a request nobody made.
 */
export function resolveRelationView(value: string | string[] | undefined): RelationView {
  if (typeof value !== "string") return RELATION_VIEWS[0];
  return (RELATION_VIEWS as readonly string[]).includes(value) ? (value as RelationView) : RELATION_VIEWS[0];
}

/**
 * The people a reader may focus on — those the projection already contains.
 *
 * Built from the projection rather than from a fresh query of `people`, so the
 * selector can only ever offer someone who appears in the graph the reader is
 * looking at. Offering a person with no relations would be a control whose only
 * possible outcome is an empty view.
 */
export function focusableNodes(projection: RelationProjection): readonly RelationNode[] {
  const touched = new Set<string>();
  for (const edge of projection.edges.items) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  return projection.nodes.filter((node) => node.type === "person" && touched.has(node.id));
}

/**
 * The focused person's id, or `null`.
 *
 * Validated against the projection, which is the whole safety: an id that is not
 * a person in the reader's own graph is discarded, so the parameter cannot be
 * used to test whether some other id exists — the surface answers identically
 * for "not yours", "not a person" and "nonsense".
 */
export function resolveFocus(
  value: string | string[] | undefined,
  projection: RelationProjection,
): string | null {
  if (typeof value !== "string" || value === "") return null;
  return focusableNodes(projection).some((node) => node.id === value) ? value : null;
}

/**
 * The projection narrowed to one person's own links.
 *
 * The bound travels: the underlying read was bounded before this filter ran, so
 * a focused view of a truncated graph is still a view of a truncated graph, and
 * saying otherwise would be the silent truncation `2N-PERSON-003` exists to end.
 */
export function focusProjection(
  projection: RelationProjection,
  focusId: string | null,
): RelationProjection {
  if (focusId === null) return projection;
  const items = projection.edges.items.filter((edge) => edge.from === focusId || edge.to === focusId);
  const referenced = new Set<string>();
  for (const edge of items) {
    referenced.add(edge.from);
    referenced.add(edge.to);
  }
  const edges: Bounded<RelationEdge> = {
    ...boundedList(items, projection.edges.limit),
    // Never narrowed to `false`: filtering cannot un-truncate the read that
    // produced these rows.
    bounded: projection.edges.bounded || items.length > projection.edges.limit,
  };
  return { nodes: projection.nodes.filter((node) => referenced.has(node.id)), edges };
}

/**
 * The DOM anchor for one edge's row in the text tab.
 *
 * **Positional, never `edge.key`.** The key is `kind|from|to|qualifier`, and the
 * qualifier for a `person_owner` edge is the stored relationship type — the
 * owner's own word about another human being. Putting it in an `id` would put
 * owner content in the DOM and, through a link, in the address bar and the
 * browser's history. The person page records the same rule for its own anchors.
 *
 * The position is taken over the projection's whole ordered edge list, so a link
 * built in the drawing resolves to the same row in the list as long as both are
 * rendered from the same focus — which they are, because the link carries it.
 */
export function relationAnchorId(index: number): string {
  return `relation-${index + 1}`;
}

/** Where a tab lives, with the current focus preserved (`2P-RELATION-003`). */
export function relationViewHref(locale: string, view: RelationView, focusId: string | null): string {
  const query = new URLSearchParams({ view });
  if (focusId !== null) query.set("focus", focusId);
  return `/${locale}/app/relations?${query.toString()}`;
}

/** A row in the text tab, addressed from the drawing. */
export function relationRowHref(locale: string, focusId: string | null, index: number): string {
  return `${relationViewHref(locale, "links", focusId)}#${relationAnchorId(index)}`;
}

/**
 * How many edges the drawing's compact list shows on a phone
 * (`2P-RELATION-004`).
 *
 * Deliberately far below `RELATION_LIMIT`. The point of the compact list is that
 * it is **readable without panning**, and fifty rows under a diagram is a second
 * copy of the list rather than an alternative to the picture. What is left out
 * is stated, and the whole set is one link away in the text tab.
 */
export const COMPACT_RELATION_LIMIT = 12;
