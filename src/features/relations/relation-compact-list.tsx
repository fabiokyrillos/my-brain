/**
 * The drawing's own text, for a screen the figure does not fit
 * (`2P-RELATION-003`, `2P-RELATION-004`).
 *
 * ## What was actually missing
 *
 * The query was already bounded — `RELATION_LIMIT` caps every hop — and the
 * figure already scrolls inside its own box rather than breaking the page. So
 * "bounded" was true and "scrolls" was true, and a phone still got **the same
 * SVG behind a horizontal scroll**: a canvas hundreds of pixels wider than the
 * viewport, panned a column at a time. What did not exist was a *different,
 * bounded representation* for the case where the picture cannot fit.
 *
 * This is that. It sits inside the drawing tab, under the figure, and CSS shows
 * it where the canvas cannot be read whole. The full text tab is one link away
 * and is the complete projection; this is deliberately shorter than that, or it
 * would be a second copy of the list rather than an alternative to the picture.
 *
 * ## It cannot hold anything the drawing does not
 *
 * It is built from `drawableEdges` — the same subset the figure renders, in the
 * same order — so it can neither add an unattributable link the drawing refuses
 * (`2N-RELATION-006`) nor hide one the drawing shows. Every row's "see the
 * explanation" link goes to that edge's own row in the text tab, where its
 * origin note lives, which is what `2P-RELATION-003` means by opening an
 * explainable link.
 *
 * ## The anchors carry no content
 *
 * A row's link is positional. `edge.key` embeds the stored relationship type —
 * the owner's own word about another person — and putting it in a URL fragment
 * would place that word in the address bar and the browser's history. The
 * position is taken over the projection's whole ordered edge list, so it means
 * the same thing on both sides of the link.
 */

import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { describeRelationshipType } from "@/features/entities/relationship-vocabulary";

import { getRelationsCopy } from "./copy";
import type { RelationEdge, RelationNode } from "./contracts";
import { drawableEdges, nodesById, type RelationProjection } from "./projection";
import { COMPACT_RELATION_LIMIT, relationRowHref } from "./view";

export function RelationCompactList({
  focusId,
  locale,
  projection,
}: {
  readonly focusId: string | null;
  readonly locale: Locale;
  readonly projection: RelationProjection;
}) {
  const copy = getRelationsCopy(locale);
  const byId = nodesById(projection);
  const drawn = drawableEdges(projection);
  if (drawn.length === 0) return null;

  /*
   * The position of each edge in the projection's own ordered list, resolved
   * before the compact bound is applied.
   *
   * Indexing the *trimmed* array instead would make row 3 of the compact list
   * link to row 3 of the full list, which is a different edge whenever anything
   * undrawable sits earlier — a link that silently explains the wrong relation.
   */
  const positionOf = new Map(projection.edges.items.map((edge, index) => [edge.key, index]));
  const shown = drawn.slice(0, COMPACT_RELATION_LIMIT);

  return (
    <section aria-labelledby="relations-compact-heading" className="relations-compact">
      <h3 id="relations-compact-heading">{copy.compactHeading}</h3>
      <p className="relations-intro">{copy.compactIntro}</p>
      <ul className="relations-compact-rows">
        {shown.map((edge) => (
          <CompactRow byId={byId} edge={edge} focusId={focusId} key={edge.key} locale={locale} position={positionOf.get(edge.key) ?? 0} />
        ))}
      </ul>
      {drawn.length > shown.length ? (
        <p className="relations-compact-more" data-relations-compact-bounded="true">
          {copy.compactMore(shown.length)}
        </p>
      ) : null}
    </section>
  );
}

function CompactRow({
  byId,
  edge,
  focusId,
  locale,
  position,
}: {
  readonly byId: ReadonlyMap<string, RelationNode>;
  readonly edge: RelationEdge;
  readonly focusId: string | null;
  readonly locale: Locale;
  readonly position: number;
}) {
  const copy = getRelationsCopy(locale);
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  // A row missing an endpoint cannot be rendered truthfully, and half of one
  // would put a dangling relation on the page. Handled rather than asserted: a
  // throw here would blank the whole tab for every other row.
  if (!from || !to) return null;

  const known = edge.kind === "person_owner" ? describeRelationshipType(locale, edge.storedType) : null;
  const relation =
    edge.kind === "person_owner" ? (known ?? edge.storedType ?? copy.unknownRelationship) : copy.edgeKind(edge.kind);

  return (
    <li className="relations-compact-row" data-edge-kind={edge.kind}>
      <span className="relations-compact-main">
        <span>{from.label}</span>
        <span className="relations-compact-relation">{relation}</span>
        <span>{to.label}</span>
      </span>
      {/*
        The accessible name carries the two node labels and nothing else. Both
        are structural identifiers the page already renders (ADR-110 Decision 2);
        the one governed string on this surface — a relationship's own sentence —
        stays in the text tab behind `ProtectedContent`, and an `aria-label`
        carrying it would hand the masked text straight to assistive technology.
      */}
      <Link
        aria-label={copy.explainLinkFor(from.label, to.label)}
        className="relations-compact-explain"
        href={relationRowHref(locale, focusId, position)}
      >
        {copy.explainLink}
      </Link>
    </li>
  );
}
