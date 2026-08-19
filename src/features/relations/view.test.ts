import { describe, expect, it } from "vitest";

import { relationEdgeKey, type RelationEdge, type RelationNode } from "./contracts";
import type { RelationProjection } from "./projection";
import {
  COMPACT_RELATION_LIMIT,
  focusableNodes,
  focusProjection,
  relationAnchorId,
  relationRowHref,
  relationViewHref,
  resolveFocus,
  resolveRelationView,
  RELATION_VIEWS,
} from "./view";

/**
 * `2P-RELATION-001` … `-004` — how the surface is being looked at.
 *
 * The cases are the four ways this can be wrong in a way that costs something:
 *
 *  1. a query string opens the wrong tab, or refuses to open at all;
 *  2. a `focus` parameter becomes a way to test whether somebody else's id
 *     exists;
 *  3. filtering to one person quietly un-truncates a bounded read;
 *  4. an anchor carries the owner's own word about another person into the
 *     address bar.
 */

const OWNER: RelationNode = { id: "owner", type: "owner", label: "Você", href: null };
const MARINA: RelationNode = { id: "p1", type: "person", label: "Marina", href: "/pt-BR/app/people/p1" };
const CAMILA: RelationNode = { id: "p2", type: "person", label: "Camila", href: "/pt-BR/app/people/p2" };
const ATLAS: RelationNode = { id: "j1", type: "project", label: "Atlas", href: "/pt-BR/app/projects/j1" };

function edge(kind: RelationEdge["kind"], from: string, to: string, qualifier = ""): RelationEdge {
  return {
    key: relationEdgeKey(kind, from, to, qualifier),
    kind,
    from,
    to,
    origin: { kind: "owner-authored", basis: "structural" },
    role: null,
    storedType: qualifier === "" ? null : qualifier,
    description: null,
    since: "2026-08-01T00:00:00.000Z",
  };
}

function projection(
  edges: readonly RelationEdge[],
  nodes: readonly RelationNode[] = [OWNER, MARINA, CAMILA, ATLAS],
  bounded = false,
): RelationProjection {
  return { nodes, edges: { items: edges, bounded, limit: 50 } };
}

const MARINA_OWNER = edge("person_owner", "p1", "owner", "Chefe");
const MARINA_ATLAS = edge("person_project", "p1", "j1");
const CAMILA_ATLAS = edge("person_project", "p2", "j1");

describe("resolveRelationView", () => {
  it("opens on the drawing when nothing is asked for", () => {
    // `2P-RELATION-001`, and it is the FIRST entry rather than a literal, so the
    // default cannot drift away from the order the tabs are offered in.
    expect(resolveRelationView(undefined)).toBe("diagram");
    expect(RELATION_VIEWS[0]).toBe("diagram");
  });

  it("opens the text tab when it is asked for", () => {
    expect(resolveRelationView("links")).toBe("links");
  });

  it("opens on the drawing for anything it does not recognise", () => {
    // A bad query string must not be able to make the page unusable, and a
    // repeated parameter is two answers to one question — resolved by neither.
    expect(resolveRelationView("graph")).toBe("diagram");
    expect(resolveRelationView("")).toBe("diagram");
    expect(resolveRelationView(["links", "diagram"])).toBe("diagram");
  });
});

describe("focusableNodes", () => {
  it("offers only people the graph already contains", () => {
    // A selector offering somebody with no relations is a control whose only
    // possible outcome is an empty view — the `EG-04` dead end.
    const nodes = focusableNodes(projection([MARINA_ATLAS]));
    expect(nodes.map((node) => node.id)).toEqual(["p1"]);
  });

  it("offers no project, context or owner node", () => {
    const nodes = focusableNodes(projection([MARINA_ATLAS, CAMILA_ATLAS, MARINA_OWNER]));
    expect(nodes.map((node) => node.type)).toEqual(["person", "person"]);
  });
});

describe("resolveFocus", () => {
  it("accepts a person the reader's own graph contains", () => {
    expect(resolveFocus("p1", projection([MARINA_ATLAS]))).toBe("p1");
  });

  it("answers identically for a foreign id, a non-person and nonsense", () => {
    /*
     * The property, not three separate behaviours: all three take the same arm,
     * so the parameter cannot be used to test whether some other id exists. A
     * branch that distinguished "not yours" from "not a person" would be an
     * oracle.
     */
    const graph = projection([MARINA_ATLAS]);
    expect(resolveFocus("someone-elses-uuid", graph)).toBeNull();
    expect(resolveFocus("j1", graph)).toBeNull();
    expect(resolveFocus("p2", graph)).toBeNull();
    expect(resolveFocus("", graph)).toBeNull();
    expect(resolveFocus(["p1", "p2"], graph)).toBeNull();
  });
});

describe("focusProjection", () => {
  it("returns the whole graph unchanged when nothing is focused", () => {
    const graph = projection([MARINA_ATLAS, CAMILA_ATLAS]);
    expect(focusProjection(graph, null)).toBe(graph);
  });

  it("keeps only the edges that touch the focused person", () => {
    const focused = focusProjection(projection([MARINA_ATLAS, CAMILA_ATLAS, MARINA_OWNER]), "p1");
    expect(focused.edges.items.map((item) => item.key)).toEqual([MARINA_ATLAS.key, MARINA_OWNER.key]);
  });

  it("can only ever show a subset, never a relation the full view withheld", () => {
    const graph = projection([MARINA_ATLAS, CAMILA_ATLAS, MARINA_OWNER]);
    const focused = focusProjection(graph, "p1");
    const all = new Set(graph.edges.items.map((item) => item.key));
    for (const item of focused.edges.items) expect(all.has(item.key)).toBe(true);
  });

  it("keeps only the nodes the surviving edges touch", () => {
    const focused = focusProjection(projection([MARINA_ATLAS, CAMILA_ATLAS]), "p1");
    expect(focused.nodes.map((node) => node.id).sort()).toEqual(["j1", "p1"]);
  });

  it("never un-truncates a bounded read", () => {
    // Filtering four rows out of a truncated fifty does not make the fifty
    // complete, and saying so would be the silent truncation `2N-PERSON-003`
    // exists to end.
    const focused = focusProjection(projection([MARINA_ATLAS], undefined, true), "p1");
    expect(focused.edges.bounded).toBe(true);
  });
});

describe("the anchors and the hrefs", () => {
  it("builds an anchor from position, never from the edge key", () => {
    /*
     * `relationEdgeKey` is `kind|from|to|qualifier`, and the qualifier for a
     * `person_owner` edge is the STORED RELATIONSHIP TYPE — the owner's own word
     * about another human being. An id built from it would put that word in the
     * DOM and, through a link, in the address bar and the browser's history.
     */
    expect(MARINA_OWNER.key).toContain("Chefe");
    const anchor = relationAnchorId(0);
    expect(anchor).toBe("relation-1");
    expect(anchor).not.toContain("Chefe");
    expect(relationRowHref("pt-BR", "p1", 0)).not.toContain("Chefe");
  });

  it("carries the focus across a tab change, so focusing does not move the reader", () => {
    expect(relationViewHref("pt-BR", "links", "p1")).toBe("/pt-BR/app/relations?view=links&focus=p1");
    expect(relationViewHref("en", "diagram", null)).toBe("/en/app/relations?view=diagram");
  });

  it("points a drawn row at its own row in the text tab", () => {
    expect(relationRowHref("pt-BR", "p1", 2)).toBe("/pt-BR/app/relations?view=links&focus=p1#relation-3");
  });

  it("bounds the compact list well below the query's own ceiling", () => {
    // The point of the compact list is that it is readable without panning.
    // Fifty rows under a diagram would be a second copy of the text tab rather
    // than an alternative to the picture.
    expect(COMPACT_RELATION_LIMIT).toBeLessThan(50);
  });
});
