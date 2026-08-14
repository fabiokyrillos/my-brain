import { describe, expect, it } from "vitest";

import {
  dedupeEdges,
  isDrawable,
  relationEdgeKey,
  relationNodeHref,
  RELATION_EDGE_DIRECTED,
  RELATION_EDGE_KINDS,
  RELATION_NODE_TYPES,
  type RelationEdge,
} from "./contracts";

function edge(overrides: Partial<RelationEdge> = {}): RelationEdge {
  return {
    key: relationEdgeKey("person_project", "p1", "j1"),
    kind: "person_project",
    from: "p1",
    to: "j1",
    origin: { kind: "owner-authored", basis: "audited" },
    role: null,
    storedType: null,
    description: null,
    since: null,
    ...overrides,
  };
}

describe("2N-RELATION-006: the vocabulary is closed and refuses the edges the catalogue refused", () => {
  it("admits exactly five node types and no record or file node", () => {
    expect([...RELATION_NODE_TYPES]).toEqual(["owner", "person", "project", "context", "organization"]);
    expect(RELATION_NODE_TYPES).not.toContain("record");
    expect(RELATION_NODE_TYPES).not.toContain("file");
    expect(RELATION_NODE_TYPES).not.toContain("entry");
    expect(RELATION_NODE_TYPES).not.toContain("task");
  });

  it("has no person-to-person edge kind, because the schema carries none", () => {
    expect(RELATION_EDGE_KINDS).not.toContain("person_person");
    expect([...RELATION_EDGE_KINDS]).toEqual([
      "person_owner",
      "person_project",
      "person_context",
      "person_organization",
      "project_organization",
    ]);
  });

  it("declares a direction only where the schema asserts one", () => {
    // A relationship term reads from the person toward the owner, and an
    // organization_id points one way by definition. An association's pair is
    // symmetric and the same row renders on both pages.
    expect(RELATION_EDGE_DIRECTED.person_owner).toBe(true);
    expect(RELATION_EDGE_DIRECTED.person_organization).toBe(true);
    expect(RELATION_EDGE_DIRECTED.project_organization).toBe(true);
    expect(RELATION_EDGE_DIRECTED.person_project).toBe(false);
    expect(RELATION_EDGE_DIRECTED.person_context).toBe(false);
  });

  it("covers every edge kind, so a new kind cannot arrive undirected by omission", () => {
    for (const kind of RELATION_EDGE_KINDS) {
      expect(typeof RELATION_EDGE_DIRECTED[kind]).toBe("boolean");
    }
  });
});

describe("2N-RELATION-009: an edge key identifies a relation, not a row", () => {
  it("gives the same key to two rows asserting the same relation", () => {
    expect(relationEdgeKey("person_project", "p1", "j1")).toBe(
      relationEdgeKey("person_project", "p1", "j1"),
    );
  });

  it("separates two different relationship types with the same pair", () => {
    expect(relationEdgeKey("person_owner", "p1", "owner", "friend")).not.toBe(
      relationEdgeKey("person_owner", "p1", "owner", "colleague"),
    );
  });

  it("deduplicates edges that assert the same relation, keeping the first", () => {
    const first = edge({ role: "designer" });
    const second = edge({ role: "PM" });
    const deduped = dedupeEdges([first, second]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.role).toBe("designer");
  });

  it("keeps edges that assert different relations", () => {
    const deduped = dedupeEdges([
      edge(),
      edge({ key: relationEdgeKey("person_context", "p1", "c1"), kind: "person_context", to: "c1" }),
    ]);
    expect(deduped).toHaveLength(2);
  });
});

describe("2N-RELATION-006/-008: only a proved origin may be drawn", () => {
  it("draws an edge whose table has exactly one writer", () => {
    expect(isDrawable({ kind: "owner-authored", basis: "structural" })).toBe(true);
  });

  it("draws an edge proved by the owner's own creation audit row", () => {
    expect(isDrawable({ kind: "owner-authored", basis: "audited" })).toBe(true);
  });

  it("refuses to draw an edge it cannot attribute", () => {
    expect(isDrawable({ kind: "unattributable" })).toBe(false);
  });
});

describe("a node opens where the product already put it", () => {
  it("routes each entity type to its own detail page, in the caller's locale", () => {
    expect(relationNodeHref("pt-BR", "person", "abc")).toBe("/pt-BR/app/people/abc");
    expect(relationNodeHref("en", "project", "abc")).toBe("/en/app/projects/abc");
    expect(relationNodeHref("pt-BR", "context", "abc")).toBe("/pt-BR/app/contexts/abc");
    expect(relationNodeHref("en", "organization", "abc")).toBe("/en/app/organizations/abc");
  });

  it("gives the owner no route, because the owner is not a row", () => {
    expect(relationNodeHref("pt-BR", "owner", "owner")).toBeNull();
  });
});
