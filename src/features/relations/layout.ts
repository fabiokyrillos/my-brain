/**
 * `2N-RELATION-010`, `2N-ACCESS-004`, `2N-MOBILE-001` — where the drawing puts
 * things, as a pure function.
 *
 * ## What position means here, stated before it is computed
 *
 * A node's **column is its type**, and nothing else. That is a fact the legend
 * states and each node repeats in its own visible type label, so the geometry is
 * a second copy of something already written down rather than the only place it
 * is said.
 *
 * Everything else about the picture means **nothing**, and the surface says so in
 * both locales: order within a column is the label, ascending; distance is the
 * consequence of how many rows are above; and the number of lines touching a node
 * is not importance. There is no force simulation, no clustering, no centrality,
 * no edge weight and no sizing by degree — `2N-RELATION-010` forbids the graph
 * drawing conclusions from its own layout, and the way to guarantee that is to
 * have no layout step that could.
 *
 * ## Why the maths lives outside the component
 *
 * So it can be tested without a DOM, and so that "nodes never overlap" is an
 * assertion about a function rather than a claim about a screenshot. Overlap is
 * impossible by construction — every node in a column sits at `row * PITCH` and
 * `PITCH` exceeds `NODE_HEIGHT` — and `layout.test.ts` proves it over a dense
 * input rather than trusting the arithmetic.
 *
 * ## Why empty columns are removed rather than left blank
 *
 * An account with no contexts would otherwise render a column-wide gutter of
 * nothing, which reads as "something is missing here". Columns are compacted, so
 * the picture is as wide as it has content for — which also narrows the smallest
 * viewport that can hold it without scrolling.
 */

import type { Locale } from "@/lib/preferences";

import {
  RELATION_EDGE_DIRECTED,
  type RelationEdge,
  type RelationNode,
  type RelationNodeType,
} from "./contracts";

/**
 * Node geometry, in CSS pixels.
 *
 * `NODE_HEIGHT` clears the 44px minimum with room to spare, and it is a **fixed**
 * height rather than a floor. That distinction is the whole reason this constant
 * is what it is: the box holds a type label and a name clamped to two lines, and
 * a `min-height` would let a long name grow the box past `PITCH` and sit on top
 * of the node below — an overlap the arithmetic would still call impossible.
 *
 * 60 = 12 padding + 13 for the type label + 32.5 for two 13px/1.25 lines, with
 * 2.5px of slack. `PITCH` then exceeds it by 16, so two nodes can never touch.
 */
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 60;
export const COLUMN_GAP = 88;
export const ROW_GAP = 16;
export const PITCH = NODE_HEIGHT + ROW_GAP;
export const PADDING = 12;

/**
 * The column each type occupies, before empty ones are removed.
 *
 * The order is chosen so that **exactly one** edge kind spans a non-adjacent
 * pair (`person_organization`), and it is the rarest. `owner` and `context`
 * share a column because no edge connects them, so they can never need a line
 * within one column — the one case a straight line could not be drawn without
 * crossing a node box.
 */
const COLUMN_OF: Record<RelationNodeType, number> = {
  owner: 0,
  context: 0,
  person: 1,
  project: 2,
  organization: 3,
};

/** Within a column: the owner first, then by label ascending. Never by degree. */
const RANK_OF: Record<RelationNodeType, number> = {
  owner: 0,
  context: 1,
  person: 0,
  project: 0,
  organization: 0,
};

export type PlacedNode = RelationNode & {
  /** Left edge, in the same pixel space as the SVG's `viewBox`. */
  readonly x: number;
  /** Top edge, same space. */
  readonly y: number;
};

export type PlacedLine = {
  readonly key: string;
  readonly kind: RelationEdge["kind"];
  readonly directed: boolean;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

export type RelationLayout = {
  readonly nodes: readonly PlacedNode[];
  readonly lines: readonly PlacedLine[];
  readonly width: number;
  readonly height: number;
};

/**
 * Places the drawable nodes and the lines between them.
 *
 * @param nodes  Only the nodes a drawable edge touches — `drawableNodes`.
 * @param edges  Only the edges `isDrawable` admits — `drawableEdges`.
 */
export function layOutRelations(
  nodes: readonly RelationNode[],
  edges: readonly RelationEdge[],
  locale: Locale,
): RelationLayout {
  if (nodes.length === 0) return { nodes: [], lines: [], width: 0, height: 0 };

  const occupied = [...new Set(nodes.map((node) => COLUMN_OF[node.type]))].sort((a, b) => a - b);
  const columnIndex = new Map(occupied.map((column, index) => [column, index]));

  const placed: PlacedNode[] = [];
  const positionOf = new Map<string, PlacedNode>();

  for (const column of occupied) {
    const members = nodes
      .filter((node) => COLUMN_OF[node.type] === column)
      .sort((a, b) => {
        const rank = RANK_OF[a.type] - RANK_OF[b.type];
        if (rank !== 0) return rank;
        const byLabel = a.label.localeCompare(b.label, locale);
        // Ids break a label tie so two renders of one database produce one
        // picture, which is what makes "position means nothing" checkable.
        return byLabel !== 0 ? byLabel : a.id.localeCompare(b.id);
      });

    const x = PADDING + (columnIndex.get(column) as number) * (NODE_WIDTH + COLUMN_GAP);
    members.forEach((node, row) => {
      const entry = { ...node, x, y: PADDING + row * PITCH };
      placed.push(entry);
      positionOf.set(node.id, entry);
    });
  }

  const lines: PlacedLine[] = [];
  for (const edge of edges) {
    const from = positionOf.get(edge.from);
    const to = positionOf.get(edge.to);
    // A line whose endpoint was not placed is simply absent. It cannot happen
    // for a caller passing `drawableNodes`/`drawableEdges` together, and it is
    // still handled rather than asserted: a dangling line is a wrong picture,
    // and a thrown error is a blank page.
    if (!from || !to) continue;

    const leftToRight = from.x < to.x;
    lines.push({
      key: edge.key,
      kind: edge.kind,
      directed: RELATION_EDGE_DIRECTED[edge.kind],
      x1: leftToRight ? from.x + NODE_WIDTH : from.x,
      y1: from.y + NODE_HEIGHT / 2,
      x2: leftToRight ? to.x : to.x + NODE_WIDTH,
      y2: to.y + NODE_HEIGHT / 2,
    });
  }

  const rowsPerColumn = occupied.map(
    (column) => nodes.filter((node) => COLUMN_OF[node.type] === column).length,
  );
  const tallest = Math.max(...rowsPerColumn);

  return {
    nodes: placed,
    lines,
    width: PADDING * 2 + occupied.length * NODE_WIDTH + Math.max(0, occupied.length - 1) * COLUMN_GAP,
    height: PADDING * 2 + tallest * PITCH - ROW_GAP,
  };
}
