import { describe, expect, it } from "vitest";

import { relationEdgeKey, OWNER_NODE_ID, type RelationEdge, type RelationNode } from "./contracts";
import { layOutRelations, NODE_HEIGHT, NODE_WIDTH, PITCH } from "./layout";

function node(id: string, type: RelationNode["type"], label: string): RelationNode {
  return { id, type, label, href: type === "owner" ? null : `/pt-BR/app/x/${id}` };
}

function edge(kind: RelationEdge["kind"], from: string, to: string): RelationEdge {
  return {
    key: relationEdgeKey(kind, from, to),
    kind,
    from,
    to,
    origin: { kind: "owner-authored", basis: "structural" },
    role: null,
    storedType: null,
    description: null,
    since: null,
  };
}

describe("2N-RELATION-010: position carries the type and nothing else", () => {
  it("puts each type in its own column", () => {
    const layout = layOutRelations(
      [
        node(OWNER_NODE_ID, "owner", "Você"),
        node("c1", "context", "Trabalho"),
        node("p1", "person", "Marina"),
        node("j1", "project", "Atlas"),
        node("o1", "organization", "Acme"),
      ],
      [edge("person_owner", "p1", OWNER_NODE_ID), edge("person_project", "p1", "j1")],
      "pt-BR",
    );

    const x = (id: string) => layout.nodes.find((placed) => placed.id === id)?.x;
    expect(x(OWNER_NODE_ID)).toBe(x("c1"));
    expect(x("p1")).toBeGreaterThan(x(OWNER_NODE_ID)!);
    expect(x("j1")).toBeGreaterThan(x("p1")!);
    expect(x("o1")).toBeGreaterThan(x("j1")!);
  });

  it("orders a column by label, ascending, with the owner first in its own", () => {
    const layout = layOutRelations(
      [
        node("p2", "person", "Zeca"),
        node("p1", "person", "Ana"),
        node(OWNER_NODE_ID, "owner", "Você"),
        node("c1", "context", "Trabalho"),
      ],
      [edge("person_owner", "p1", OWNER_NODE_ID)],
      "pt-BR",
    );
    const people = layout.nodes.filter((placed) => placed.type === "person").sort((a, b) => a.y - b.y);
    expect(people.map((placed) => placed.label)).toEqual(["Ana", "Zeca"]);

    const firstColumn = layout.nodes
      .filter((placed) => placed.type === "owner" || placed.type === "context")
      .sort((a, b) => a.y - b.y);
    expect(firstColumn.map((placed) => placed.type)).toEqual(["owner", "context"]);
  });

  it("is deterministic: the same input twice produces the same picture", () => {
    const nodes = [node("p2", "person", "Ana"), node("p1", "person", "Ana"), node("j1", "project", "Atlas")];
    const edges = [edge("person_project", "p1", "j1")];
    expect(layOutRelations(nodes, edges, "pt-BR")).toEqual(layOutRelations(nodes, edges, "pt-BR"));
  });

  it("removes a column with nothing in it rather than leaving a gutter", () => {
    const withContexts = layOutRelations(
      [node("c1", "context", "Trabalho"), node("p1", "person", "Ana"), node("j1", "project", "Atlas")],
      [edge("person_context", "p1", "c1")],
      "pt-BR",
    );
    const withoutContexts = layOutRelations(
      [node("p1", "person", "Ana"), node("j1", "project", "Atlas")],
      [edge("person_project", "p1", "j1")],
      "pt-BR",
    );
    expect(withoutContexts.width).toBeLessThan(withContexts.width);
    expect(withoutContexts.nodes.find((placed) => placed.id === "p1")?.x).toBeLessThan(
      withContexts.nodes.find((placed) => placed.id === "p1")!.x,
    );
  });
});

describe("2N-MOBILE-001: nodes can never overlap, and never fall below the touch minimum", () => {
  it("keeps every node at least 44px tall", () => {
    expect(NODE_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it("separates every pair in a column by more than a node's height, over a dense input", () => {
    const people = Array.from({ length: 50 }, (_, index) =>
      node(`p${index}`, "person", `Pessoa ${String(index).padStart(2, "0")}`),
    );
    const layout = layOutRelations(
      [...people, node("j1", "project", "Atlas")],
      people.map((person) => edge("person_project", person.id, "j1")),
      "pt-BR",
    );

    const column = layout.nodes.filter((placed) => placed.type === "person").sort((a, b) => a.y - b.y);
    for (let index = 1; index < column.length; index += 1) {
      expect(column[index]!.y - column[index - 1]!.y).toBeGreaterThanOrEqual(NODE_HEIGHT);
    }
    expect(PITCH).toBeGreaterThan(NODE_HEIGHT);
  });

  it("grows the figure to hold its tallest column rather than clipping it", () => {
    const people = Array.from({ length: 12 }, (_, index) => node(`p${index}`, "person", `Pessoa ${index}`));
    const layout = layOutRelations(
      [...people, node("j1", "project", "Atlas")],
      people.map((person) => edge("person_project", person.id, "j1")),
      "pt-BR",
    );
    const lowest = Math.max(...layout.nodes.map((placed) => placed.y + NODE_HEIGHT));
    expect(layout.height).toBeGreaterThanOrEqual(lowest);
  });
});

describe("lines join node edges, in whichever direction the columns run", () => {
  it("leaves the right edge of the source when the target is to its right", () => {
    const layout = layOutRelations(
      [node("p1", "person", "Ana"), node("j1", "project", "Atlas")],
      [edge("person_project", "p1", "j1")],
      "pt-BR",
    );
    const person = layout.nodes.find((placed) => placed.id === "p1")!;
    const line = layout.lines[0]!;
    expect(line.x1).toBe(person.x + NODE_WIDTH);
    expect(line.y1).toBe(person.y + NODE_HEIGHT / 2);
  });

  it("leaves the left edge of the source when the target is to its left", () => {
    const layout = layOutRelations(
      [node("p1", "person", "Ana"), node(OWNER_NODE_ID, "owner", "Você")],
      [edge("person_owner", "p1", OWNER_NODE_ID)],
      "pt-BR",
    );
    const person = layout.nodes.find((placed) => placed.id === "p1")!;
    const owner = layout.nodes.find((placed) => placed.id === OWNER_NODE_ID)!;
    const line = layout.lines[0]!;
    expect(line.x1).toBe(person.x);
    expect(line.x2).toBe(owner.x + NODE_WIDTH);
  });

  it("carries the direction the schema asserts, and only that", () => {
    const layout = layOutRelations(
      [node("p1", "person", "Ana"), node("j1", "project", "Atlas"), node("c1", "context", "Trabalho")],
      [edge("person_project", "p1", "j1"), edge("person_context", "p1", "c1")],
      "pt-BR",
    );
    for (const line of layout.lines) expect(line.directed).toBe(false);

    const directed = layOutRelations(
      [node("p1", "person", "Ana"), node("o1", "organization", "Acme")],
      [edge("person_organization", "p1", "o1")],
      "pt-BR",
    );
    expect(directed.lines[0]?.directed).toBe(true);
  });

  it("draws no line for an edge whose endpoint was not placed", () => {
    const layout = layOutRelations(
      [node("p1", "person", "Ana")],
      [edge("person_project", "p1", "missing")],
      "pt-BR",
    );
    expect(layout.lines).toEqual([]);
  });
});

describe("an empty drawable set produces an empty figure, not a zero-sized one with lines", () => {
  it("returns nothing to draw", () => {
    expect(layOutRelations([], [], "pt-BR")).toEqual({ nodes: [], lines: [], width: 0, height: 0 });
  });
});
