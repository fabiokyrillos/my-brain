/**
 * `2N-RELATION-006`/`-010`, `2N-ACCESS-002`/`-004`, `2N-MOBILE-001`/`-002` — the
 * **secondary** presentation.
 *
 * ## Real anchors in front, geometry-only SVG behind
 *
 * The nodes are ordinary `<a>` elements positioned by the layout; the SVG holds
 * **only** lines and is `aria-hidden`. That is the whole accessibility strategy,
 * and it was chosen against the alternatives rather than by habit
 * (`PHASE_2N_SLICE_6_EDGE_CATALOG.md` §4): SVG `<a>` focus behaviour is
 * inconsistent across browsers, a `<text>` node cannot be given a 44px hit area
 * by CSS, and a screen reader walking an SVG gets a sequence of coordinates. An
 * HTML anchor gets native focus, the product's own `:focus-visible` outline,
 * `min-height`/`min-width` from CSS, and a name it already has.
 *
 * The SVG carries **no text, no `title`, no `aria-*` and no `data-*` derived from
 * content**. It cannot leak, because there is nothing in it to leak.
 *
 * ## Nothing here is exclusive, and nothing here is a conclusion
 *
 * Every edge drawn is an edge the list above already carries, and every label is
 * a label the list already renders — `2N-RELATION-007` forbids the drawing
 * holding information the text does not. There is no hover state that reveals
 * anything and no tooltip: the only interaction is following a link, which is
 * also available in the list.
 *
 * `2N-RELATION-010` is enforced twice: the layout has no step that could derive
 * meaning from geometry (`layout.ts`), and the refusal is **rendered**, in both
 * locales, in the figure's own description and beside the legend — never only in
 * an attribute.
 *
 * ## Colour is never the only signal
 *
 * Each node box carries its **type as a word**, so the columns and the palette
 * are a second and third copy of something already written. A directed edge
 * carries an arrowhead *and* says its direction in the list's sentence.
 */

import Link from "next/link";

import { UniversalStateLine } from "@/features/experience/universal-state";

import type { Locale } from "@/lib/preferences";

import { getRelationsCopy } from "./copy";
import { RELATION_NODE_TYPES, type RelationNodeType } from "./contracts";
import { layOutRelations, NODE_HEIGHT, NODE_WIDTH } from "./layout";
import { drawableEdges, drawableNodes, type RelationProjection } from "./projection";

const DIAGRAM_DESCRIPTION_ID = "relations-diagram-description";

export function RelationDiagram({
  locale,
  projection,
}: {
  readonly locale: Locale;
  readonly projection: RelationProjection;
}) {
  const copy = getRelationsCopy(locale);
  const nodes = drawableNodes(projection);
  const edges = drawableEdges(projection);
  const layout = layOutRelations(nodes, edges, locale);

  return (
    <section aria-labelledby="relations-diagram-heading" className="relations-section">
      <h2 id="relations-diagram-heading">{copy.diagramHeading}</h2>
      <p className="relations-intro" id={DIAGRAM_DESCRIPTION_ID}>
        {copy.diagramDescription}
      </p>
      {/*
        `2N-RELATION-010`, on the screen rather than in a comment. It is the
        requirement most likely to be broken by the reader rather than by the
        code, so it is rendered text in both locales — a tooltip would not reach
        `2N-ACCESS-004`, and an attribute would reach nobody.
      */}
      <p className="relations-disclaimer" data-layout-means-nothing="true" role="note">
        {copy.layoutMeansNothing}
      </p>

      {layout.nodes.length === 0 ? (
        // The wrapper keeps `data-diagram-empty`, which a shipped journey locates.
        <div data-diagram-empty="true">
          <UniversalStateLine
            description={<><strong>{copy.nothingDrawableHeading}</strong> {copy.nothingDrawableBody}</>}
            locale={locale}
            state="empty"
          />
        </div>
      ) : (
        <figure
          aria-describedby={DIAGRAM_DESCRIPTION_ID}
          aria-label={copy.diagramLabel}
          className="relations-figure"
          role="group"
        >
          <div className="relations-canvas-scroll">
            <div
              className="relations-canvas"
              data-relations-canvas="true"
              style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
            >
              <svg
                aria-hidden="true"
                className="relations-lines"
                focusable="false"
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                width={layout.width}
              >
                <defs>
                  <marker
                    id="relations-arrow"
                    markerHeight="6"
                    markerWidth="6"
                    orient="auto-start-reverse"
                    refX="5"
                    refY="3"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" />
                  </marker>
                </defs>
                {layout.lines.map((line) => (
                  <line
                    key={line.key}
                    markerEnd={line.directed ? "url(#relations-arrow)" : undefined}
                    x1={line.x1}
                    x2={line.x2}
                    y1={line.y1}
                    y2={line.y2}
                  />
                ))}
              </svg>

              {layout.nodes.map((node) => {
                const body = (
                  <>
                    <span className="relations-node-type">{copy.nodeType(node.type)}</span>
                    <span className="relations-node-name">{node.label}</span>
                  </>
                );
                /*
                 * A fixed height, not a floor. The layout guarantees no overlap
                 * by placing rows a `PITCH` apart, and that guarantee is only
                 * true if a box cannot grow: a long name under `min-height`
                 * would push past its row and sit on the node below, while the
                 * arithmetic went on saying it could not.
                 */
                const style = {
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${NODE_WIDTH}px`,
                  height: `${NODE_HEIGHT}px`,
                };
                return node.href ? (
                  <Link
                    aria-label={copy.openNode(node.label, copy.nodeType(node.type))}
                    className="relations-node"
                    data-node-type={node.type}
                    href={node.href}
                    key={node.id}
                    style={style}
                  >
                    {body}
                  </Link>
                ) : (
                  <span className="relations-node" data-node-type={node.type} key={node.id} style={style}>
                    {body}
                  </span>
                );
              })}
            </div>
          </div>

          <figcaption className="relations-legend">
            <span className="relations-legend-heading">{copy.legendHeading}</span>
            <ul>
              {RELATION_NODE_TYPES.map((type: RelationNodeType) => (
                <li data-node-type={type} key={type}>
                  <span aria-hidden="true" className="relations-swatch" data-node-type={type} />
                  {copy.nodeType(type)}
                </li>
              ))}
            </ul>
            <p>{copy.confidenceNeverShown}</p>
          </figcaption>
        </figure>
      )}
    </section>
  );
}
